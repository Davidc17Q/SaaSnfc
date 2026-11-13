/**
 * Clientes y equipo: contacto con autorización, cupón con canje en caja y
 * ranking por vendedor. Y que nada de esto rompa la redirección normal.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, makeTenant, makeDevice, call, scan, scanCount, waitFor, sleep, type Ctx, type Tenant } from './helpers';

let ctx: Ctx;
let A: Tenant;
let B: Tenant;

const post = (url: string, payload: unknown, ip = '201.1.1.1') =>
  ctx.app.inject({ method: 'POST', url, headers: { 'cf-connecting-ip': ip }, payload: payload as object });
const n = async (sql: string, params: unknown[] = []) => (await ctx.pool.query(sql, params)).rows[0].n as number;

before(async () => {
  ctx = await setup();
  A = await makeTenant('Alfa');
  B = await makeTenant('Beta');
});
after(teardown);

// ---------------------------------------------------------------------------
// Contacto con autorización
// ---------------------------------------------------------------------------
test('contacto: el punto ofrece dejar el WhatsApp, cuenta la interacción y lleva al destino', async () => {
  const d = await makeDevice(A.locationId, { target: 'https://wa.me/573001112233' });
  assert.equal((await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { capture_lead: true })).status, 200);

  const page = await scan(d.code, { ip: '201.2.0.1', query: '?s=q' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Autorizo a Alfa/);
  assert.match(page.body, /Ley 1581/);
  assert.ok(page.body.includes('https://wa.me/573001112233'), 'debe poder continuar al destino');
  assert.match(page.body, /Continuar sin dejar mis datos/);
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1), 'la interacción se registra igual');
  const ev = (await ctx.pool.query('SELECT channel, source FROM scan_events WHERE device_id = $1', [d.deviceId])).rows[0];
  assert.deepEqual(ev, { channel: 'WhatsApp', source: 'qr' });

  const url = `/r/${d.code}/lead?s=q`;
  assert.equal((await post(url, { name: 'Ana', phone: '300 123 4567' })).statusCode, 400, 'sin autorización no se guarda');
  assert.equal((await post(url, { name: 'Ana', phone: '300 123 4567', consent: 'sí' })).statusCode, 400);
  assert.equal((await post(url, { name: 'Ana', phone: '123', consent: true })).statusCode, 400);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM leads'), 0);

  assert.equal((await post(url, { name: '  Ana   María ', phone: '300 123 4567', consent: true })).statusCode, 200);
  const lead = (await ctx.pool.query('SELECT name, phone, consent_text, source, location_id FROM leads')).rows[0];
  assert.equal(lead.name, 'Ana María');
  assert.match(lead.phone, /3001234567$/);
  assert.match(lead.consent_text, /Autorizo a Alfa/);
  assert.equal(lead.source, 'qr');
  assert.equal(lead.location_id, A.locationId);
  // El mismo número en el mismo punto no se duplica.
  assert.equal((await post(url, { name: 'Ana', phone: '3001234567', consent: true })).statusCode, 200);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM leads'), 1);
});

test('contacto: un punto normal no acepta contactos y sigue con su 302', async () => {
  const d = await makeDevice(A.locationId);
  assert.equal((await scan(d.code, { ip: '201.2.1.1' })).statusCode, 302);
  assert.equal((await post(`/r/${d.code}/lead`, { phone: '3001234567', consent: true })).statusCode, 404);
  // Al desactivarlo, vuelve el 302 de inmediato.
  await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { capture_lead: true });
  assert.equal((await scan(d.code, { ip: '201.2.1.2', ua: 'UA-2' })).statusCode, 200);
  await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { capture_lead: false });
  assert.equal((await scan(d.code, { ip: '201.2.1.3', ua: 'UA-3' })).statusCode, 302);
});

test('contactos en el panel: solo los de la propia empresa; exportar y eliminar', async () => {
  const list = (await call('GET', '/api/leads', A.cookie)).json;
  assert.equal(list.total, 1);
  assert.equal(list.items[0].name, 'Ana María');
  assert.equal((await call('GET', '/api/leads', B.cookie)).json.total, 0);
  assert.equal((await call('GET', `/api/leads?companyId=${A.companyId}`, B.cookie)).json.total, 0);

  const csv = (await call('GET', '/api/leads.csv', A.cookie)).body;
  assert.match(csv, /Fecha;Nombre;Celular;Sede;Ciudad;Punto;Autorización aceptada/);
  assert.match(csv, /Ana María/);
  assert.ok(!(await call('GET', '/api/leads.csv', B.cookie)).body.includes('Ana'));

  const id = list.items[0].id;
  assert.equal((await call('DELETE', `/api/leads/${id}`, B.cookie)).status, 404);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM leads'), 1);
  assert.equal((await call('DELETE', `/api/leads/${id}`, A.cookie)).status, 200);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM leads'), 0);
});

test('contacto: un nombre con fórmula no se ejecuta al abrir el Excel', async () => {
  const d = await makeDevice(A.locationId);
  await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { capture_lead: true });
  await post(`/r/${d.code}/lead`, { name: '=HYPERLINK("http://malo")', phone: '3015550000', consent: true });
  const csv = (await call('GET', '/api/leads.csv', A.cookie)).body;
  assert.ok(csv.includes(`"'=HYPERLINK(""http://malo"")"`), csv);
});

// ---------------------------------------------------------------------------
// Cupones
// ---------------------------------------------------------------------------
test('cupón: se crea con validaciones y solo se asigna a puntos de la misma empresa', async () => {
  assert.equal((await call('POST', '/api/coupons', A.cookie, { name: '', pin: '1234' })).status, 400);
  assert.equal((await call('POST', '/api/coupons', A.cookie, { name: '10 %', pin: '12' })).status, 400);
  assert.equal((await call('POST', '/api/coupons', A.cookie, { name: '10 %', pin: 'abcd' })).status, 400);
  const c = await call('POST', '/api/coupons', A.cookie, { name: '10 % en tu próxima compra', pin: '4821', terms: 'Un cupón por cliente.', company_id: B.companyId });
  assert.equal(c.status, 201);
  const owner = (await ctx.pool.query('SELECT company_id FROM coupons WHERE id = $1', [c.json.id])).rows[0];
  assert.equal(owner.company_id, A.companyId, 'el company_id del cuerpo se ignora');

  // Beta no lo ve, no lo edita, no lo borra ni lo puede poner en sus puntos.
  assert.deepEqual((await call('GET', '/api/coupons', B.cookie)).json, []);
  assert.equal((await call('PATCH', `/api/coupons/${c.json.id}`, B.cookie, { active: false })).status, 404);
  assert.equal((await call('DELETE', `/api/coupons/${c.json.id}`, B.cookie)).status, 404);
  assert.equal((await call('PATCH', `/api/devices/${B.deviceId}`, B.cookie, { coupon_id: c.json.id })).status, 400);
  assert.equal((await scan(B.code, { ip: '201.3.0.9' })).statusCode, 302);
});

test('cupón: entrega un código por cliente, cuenta la interacción y se canjea una sola vez con la clave', async () => {
  const couponId = (await call('GET', '/api/coupons', A.cookie)).json[0].id;
  const d = await makeDevice(A.locationId, { target: 'https://ejemplo.com/destino' });
  assert.equal((await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { coupon_id: couponId })).status, 200);

  const codeOf = (html: string) => (html.match(/class="code"[^>]*>([A-Z0-9]{6})</) || [])[1];
  const p1 = await scan(d.code, { ip: '201.3.1.1' });
  assert.equal(p1.statusCode, 200);
  assert.match(p1.body, /10 % en tu próxima compra/);
  assert.match(p1.body, /Un cupón por cliente/);
  const code1 = codeOf(p1.body);
  assert.ok(code1, 'la página debe mostrar el código');
  assert.ok(!p1.body.includes('4821'), 'la clave de caja nunca va en la página');
  assert.ok(await waitFor(async () => (await scanCount(d.deviceId)) === 1));
  assert.equal((await ctx.pool.query('SELECT channel FROM scan_events WHERE device_id = $1', [d.deviceId])).rows[0].channel, 'Cupón');

  // El mismo cliente vuelve a abrirlo: mismo código. Otro cliente: otro código.
  assert.equal(codeOf((await scan(d.code, { ip: '201.3.1.1' })).body), code1);
  const code2 = codeOf((await scan(d.code, { ip: '201.3.1.2', ua: 'UA-otro' })).body);
  assert.ok(code2 && code2 !== code1);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM coupon_claims'), 2);

  const redeem = (code: string, pin: string, dev = d.code) => post(`/r/${dev}/coupon/redeem`, { code, pin });
  assert.equal((await redeem(code1, '0000')).statusCode, 403);
  assert.equal((await redeem('ZZZZZZ', '4821')).statusCode, 404);
  // Un código no se canjea desde el punto de otra empresa.
  assert.equal((await redeem(code1, '4821', B.code)).statusCode, 404);
  assert.equal((await redeem(code1, '4821')).statusCode, 200);
  assert.equal((await redeem(code1, '4821')).statusCode, 409, 'no se canjea dos veces');
  assert.match((await scan(d.code, { ip: '201.3.1.1' })).body, /Cupón ya canjeado/);

  const stats = (await call('GET', '/api/coupons', A.cookie)).json[0];
  assert.deepEqual([stats.issued, stats.redeemed, stats.points], [2, 1, 1]);
  assert.deepEqual(stats.locations[0], { location: 'Sede Alfa', issued: 2, redeemed: 1 });
});

test('cupón: cinco claves malas bloquean ese código', async () => {
  const d = (await ctx.pool.query(`SELECT d.code FROM devices d WHERE d.coupon_id IS NOT NULL LIMIT 1`)).rows[0];
  const html = (await scan(d.code, { ip: '201.3.2.1', ua: 'UA-bloqueo' })).body;
  const code = (html.match(/class="code"[^>]*>([A-Z0-9]{6})</) || [])[1];
  for (let i = 0; i < 5; i++) assert.equal((await post(`/r/${d.code}/coupon/redeem`, { code, pin: '1111' })).statusCode, 403);
  assert.equal((await post(`/r/${d.code}/coupon/redeem`, { code, pin: '4821' })).statusCode, 429);
});

test('cupón vencido, pausado o borrado: no entrega códigos y el punto nunca queda roto', async () => {
  const id = (await call('POST', '/api/coupons', A.cookie, { name: 'Temporal', pin: '9999', validUntil: '2020-01-01' })).json.id;
  const d = await makeDevice(A.locationId, { target: 'https://ejemplo.com/vuelve' });
  await call('PATCH', `/api/devices/${d.deviceId}`, A.cookie, { coupon_id: id });
  const before = await n('SELECT COUNT(*)::int AS n FROM coupon_claims');
  assert.match((await scan(d.code, { ip: '201.3.3.1' })).body, /ya no está disponible/);
  await call('PATCH', `/api/coupons/${id}`, A.cookie, { validUntil: '', active: false });
  assert.match((await scan(d.code, { ip: '201.3.3.2', ua: 'UA-2' })).body, /ya no está disponible/);
  assert.equal(await n('SELECT COUNT(*)::int AS n FROM coupon_claims'), before);
  // Al borrar el cupón, el punto vuelve a redirigir a su destino.
  assert.equal((await call('DELETE', `/api/coupons/${id}`, A.cookie)).status, 200);
  const res = await scan(d.code, { ip: '201.3.3.3', ua: 'UA-3' });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, 'https://ejemplo.com/vuelve');
});

test('plan Básico: cupón y contacto siguen funcionando para el cliente final', async () => {
  const T = await makeTenant('Basica');
  const couponId = (await call('POST', '/api/coupons', T.cookie, { name: 'Regalo', pin: '5555' })).json.id;
  await call('PATCH', `/api/devices/${T.deviceId}`, T.cookie, { coupon_id: couponId });
  await ctx.pool.query(`UPDATE companies SET plan = 'basic' WHERE id = $1`, [T.companyId]);
  const { invalidatePlan } = await import('../src/lib/plans');
  invalidatePlan(T.companyId);
  assert.match((await scan(T.code, { ip: '201.3.4.1' })).body, /Regalo/);
  assert.equal((await call('GET', '/api/coupons', T.cookie)).status, 402);
});

// ---------------------------------------------------------------------------
// Ranking por vendedor / mesa
// ---------------------------------------------------------------------------
test('ranking por vendedor: agrupa las interacciones por quien atiende el punto', async () => {
  const laura = await makeDevice(A.locationId, { target: 'https://wa.me/573000000001' });
  const pedro = await makeDevice(A.locationId, { target: 'https://g.page/r/x/review' });
  assert.equal((await call('PATCH', `/api/devices/${laura.deviceId}`, A.cookie, { staff: '  Laura   Gómez ' })).status, 200);
  await call('PATCH', `/api/devices/${pedro.deviceId}`, A.cookie, { staff: 'Pedro' });
  await call('PATCH', `/api/devices/${B.deviceId}`, B.cookie, { staff: 'De otra empresa' });
  for (const [i, dev] of [laura, laura, laura, pedro].entries()) await scan(dev.code, { ip: `201.4.0.${i + 1}`, ua: `UA-${i}` });
  await scan(B.code, { ip: '201.4.1.1', ua: 'UA-b' });
  assert.ok(await waitFor(async () => (await scanCount(laura.deviceId)) === 3 && (await scanCount(pedro.deviceId)) === 1));
  await sleep(100);

  const r = (await call('GET', '/api/staff-ranking', A.cookie)).json;
  assert.equal(r.assigned, 2);
  assert.deepEqual(r.items.map((x: any) => [x.staff, x.scans, x.whatsapp, x.reviews]), [['Laura Gómez', 3, 3, 0], ['Pedro', 1, 0, 1]]);
  assert.ok(!JSON.stringify(r).includes('De otra empresa'));
  // Fuera del rango de fechas no hay nada; quitar el responsable lo saca del ranking.
  assert.deepEqual((await call('GET', '/api/staff-ranking?from=2020-01-01&to=2020-01-31', A.cookie)).json.items, []);
  await call('PATCH', `/api/devices/${pedro.deviceId}`, A.cookie, { staff: '' });
  assert.equal((await call('GET', '/api/staff-ranking', A.cookie)).json.items.length, 1);
  const devs = (await call('GET', '/api/devices', A.cookie)).json;
  assert.equal(devs.find((x: any) => x.id === laura.deviceId).staff, 'Laura Gómez');
});

test('sin sesión no se accede a contactos, cupones ni ranking', async () => {
  for (const url of ['/api/leads', '/api/leads.csv', '/api/coupons', '/api/staff-ranking', '/api/leads;x.png']) {
    assert.equal((await call('GET', url)).status, 401, url);
  }
  assert.equal((await call('POST', '/api/coupons', undefined, { name: 'x', pin: '1234' })).status, 401);
});
