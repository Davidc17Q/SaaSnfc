/**
 * Inicio de sesión, cookies y cierre de sesiones desde el servidor.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, makeTenant, login, call, cookieOf, ADMIN, type Ctx, type Tenant } from './helpers';

let ctx: Ctx;
let T: Tenant;
let admin: string;

const tryLogin = (user: string, password: string, ip: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/login', headers: { 'cf-connecting-ip': ip }, payload: { user, password } });

before(async () => {
  ctx = await setup();
  T = await makeTenant('Login');
  admin = await login(ADMIN.user, ADMIN.password);
});
after(teardown);

test('superadmin y cliente inician sesión; la cookie es HttpOnly y SameSite', async () => {
  const res = await tryLogin(ADMIN.user, ADMIN.password, '20.0.0.1');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().role, 'superadmin');
  const raw = ([] as string[]).concat(res.headers['set-cookie'] as any).find((c) => c.startsWith('nfc_session='))!;
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, /Path=\//);

  const me = (await call('GET', '/api/me', T.cookie)).json;
  assert.equal(me.authenticated, true);
  assert.equal(me.role, 'company_admin');
  assert.equal(me.companyId, T.companyId);
  assert.equal(me.companyName, 'Login');
});

test('credenciales malas: 401 con el mismo mensaje, exista o no el usuario', async () => {
  const a = await tryLogin(T.user, 'incorrecta', '20.0.0.2');
  const b = await tryLogin('no_existe', 'incorrecta', '20.0.0.2');
  const c = await tryLogin('', '', '20.0.0.2');
  assert.equal(a.statusCode, 401);
  assert.equal(b.statusCode, 401);
  assert.equal(c.statusCode, 401);
  assert.equal(a.json().error, b.json().error);
  assert.equal(a.headers['set-cookie'], undefined);
  // Un cuerpo raro (inyección por tipos) no rompe ni autentica.
  const d = await ctx.app.inject({ method: 'POST', url: '/api/login', payload: { user: { $ne: '' }, password: { $ne: '' } } });
  assert.equal(d.statusCode, 401);
  const e = await tryLogin("' OR '1'='1", "' OR '1'='1", '20.0.0.2');
  assert.equal(e.statusCode, 401);
});

test('sin sesión: el panel redirige y /api/me dice que no hay sesión', async () => {
  assert.equal((await call('GET', '/api/me')).json.authenticated, false);
  const root = await call('GET', '/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/empresas/');
  assert.equal((await call('GET', '/app.js')).status, 302);
  assert.equal((await call('GET', '/login')).status, 200);
  assert.equal((await call('GET', '/styles.css')).status, 200);
});

test('tope de intentos: al sexto fallo responde 429, y no bloquea a otros', async () => {
  const ip = '20.0.0.3';
  for (let i = 0; i < 5; i++) assert.equal((await tryLogin(T.user, 'mala', ip)).statusCode, 401);
  assert.equal((await tryLogin(T.user, 'mala', ip)).statusCode, 429);
  // Bloqueado aunque ahora acierte, desde esa IP...
  assert.equal((await tryLogin(T.user, T.password, ip)).statusCode, 429);
  // ...pero el dueño real, desde su IP, entra; y otro usuario desde la IP bloqueada también.
  assert.equal((await tryLogin(T.user, T.password, '20.0.0.4')).statusCode, 200);
  assert.equal((await tryLogin(ADMIN.user, ADMIN.password, ip)).statusCode, 200);
});

test('cerrar sesión borra la cookie', async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/logout', headers: { cookie: T.cookie } });
  assert.match(String(res.headers['set-cookie']), /nfc_session=;.*Max-Age=0/);
});

test('cambiar la contraseña: exige la actual, cierra las otras sesiones y conserva esta', async () => {
  const U = await makeTenant('Cambio');
  const other = await login(U.user, U.password, '20.0.1.1'); // otra sesión del mismo usuario
  assert.equal((await call('POST', '/api/change-password', U.cookie, { current: 'equivocada', next: 'nueva-clave-456' })).status, 400);
  assert.equal((await call('POST', '/api/change-password', U.cookie, { current: U.password, next: 'corta' })).status, 400);
  const res = await ctx.app.inject({
    method: 'POST', url: '/api/change-password', headers: { cookie: U.cookie },
    payload: { current: U.password, next: 'nueva-clave-456' },
  });
  assert.equal(res.statusCode, 200);
  const renewed = cookieOf(res);
  assert.equal((await call('GET', '/api/kpis', renewed)).status, 200, 'la sesión que cambió la clave debe seguir');
  assert.equal((await call('GET', '/api/kpis', other)).status, 401, 'las otras sesiones deben cerrarse');
  assert.equal((await tryLogin(U.user, U.password, '20.0.1.2')).statusCode, 401);
  assert.equal((await tryLogin(U.user, 'nueva-clave-456', '20.0.1.2')).statusCode, 200);
});

test('restablecer la contraseña (superadmin) cierra la sesión abierta del usuario', async () => {
  const U = await makeTenant('Reset');
  assert.equal((await call('GET', '/api/kpis', U.cookie)).status, 200);
  const id = (await ctx.pool.query('SELECT id FROM users WHERE username = $1', [U.user])).rows[0].id;
  const r = await call('POST', `/api/users/${id}/reset-password`, admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.password.length, 12);
  assert.equal((await call('GET', '/api/kpis', U.cookie)).status, 401);
  assert.equal((await call('GET', '/api/me', U.cookie)).json.authenticated, false);
  // /login no entra en bucle con la cookie revocada.
  assert.equal((await call('GET', '/login', U.cookie)).status, 200);
  assert.equal((await tryLogin(U.user, r.json.password, '20.0.2.1')).statusCode, 200);
});

test('suspender la empresa cierra sus sesiones y bloquea el login', async () => {
  const U = await makeTenant('Suspendida');
  assert.equal((await call('GET', '/api/kpis', U.cookie)).status, 200);
  assert.equal((await call('PATCH', `/api/companies/${U.companyId}`, admin, { status: 'inactive' })).status, 200);
  assert.equal((await call('GET', '/api/kpis', U.cookie)).status, 401);
  assert.equal((await tryLogin(U.user, U.password, '20.0.3.1')).statusCode, 403);
  assert.equal((await call('PATCH', `/api/companies/${U.companyId}`, admin, { status: 'active' })).status, 200);
  assert.equal((await tryLogin(U.user, U.password, '20.0.3.1')).statusCode, 200);
});

test('borrar el usuario cierra su sesión', async () => {
  const U = await makeTenant('Borrado');
  await ctx.pool.query('DELETE FROM users WHERE username = $1', [U.user]);
  const { invalidateSessions } = await import('../src/lib/auth');
  invalidateSessions();
  assert.equal((await call('GET', '/api/kpis', U.cookie)).status, 401);
});

test('una sesión vencida o manipulada no sirve', async () => {
  const [name, value] = T.cookie.split('; ').find((c) => c.startsWith('nfc_session='))!.split('=');
  const token = decodeURIComponent(value);
  const [data, sig] = token.split('.');
  // Cambiar el rol dentro del token invalida la firma.
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...payload, role: 'superadmin', companyId: null })).toString('base64url');
  assert.equal((await call('GET', '/api/users', `${name}=${encodeURIComponent(`${forged}.${sig}`)}`)).status, 401);
  // Token vencido (firmado con el secreto correcto).
  const { createHmac } = await import('node:crypto');
  const old = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() - 1000 })).toString('base64url');
  const oldSig = createHmac('sha256', process.env.SESSION_SECRET!).update(old).digest('base64url');
  assert.equal((await call('GET', '/api/kpis', `${name}=${encodeURIComponent(`${old}.${oldSig}`)}`)).status, 401);
});

test('crear usuarios: solo superadmin, contraseña de 8 o más y sin duplicados', async () => {
  assert.equal((await call('POST', '/api/users', admin, { username: 'corto', password: '1234567', company_id: T.companyId })).status, 400);
  const ok = await call('POST', '/api/users', admin, { username: 'gerente_login', password: 'clave-larga-123', company_id: T.companyId });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.password_hash, undefined);
  assert.equal((await call('POST', '/api/users', admin, { username: 'gerente_login', password: 'clave-larga-123', company_id: T.companyId })).status, 409);
  const hash = (await ctx.pool.query('SELECT password_hash FROM users WHERE username = $1', ['gerente_login'])).rows[0].password_hash;
  assert.ok(!hash.includes('clave-larga-123') && hash.includes(':'), 'la contraseña debe guardarse con hash');
});

test('cabeceras de seguridad presentes', async () => {
  const r = await call('GET', '/login');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});
