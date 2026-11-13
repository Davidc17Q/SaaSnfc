import { createHash, createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { pool } from '../db/pool';
import { BASIC_ALLOWED, companyPlan } from './plans';
import { clientIp } from './client-ip';

const COOKIE_NAME = 'nfc_session';
// Marca de "ya es cliente" (sin datos de sesión): quien vuelve con la sesión
// vencida llega al login y no a la landing comercial.
const RETURN_COOKIE = 'nfc_cliente';

export interface Session {
  userId: string | null; // null = superadmin por env (bootstrap)
  user: string;
  role: 'superadmin' | 'company_admin';
  companyId: string | null;
}

// ---------------------------------------------------------------------------
// Hash de contraseñas (scrypt, sin dependencias externas)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Firma y verificación del token de sesión
// ---------------------------------------------------------------------------
function sign(payload: string): string {
  const data = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token: string | undefined): Session | null {
  const v = verifyFull(token);
  return v ? v.session : null;
}

/** Como verify(), pero también entrega vencimiento y si es una sesión "recordada". */
function verifyFull(token: string | undefined): { session: Session; exp: number; rem: boolean; v: string | null } | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (typeof p.exp !== 'number' || Date.now() > p.exp) return null;
    return {
      session: {
        userId: p.userId ?? null,
        user: p.user,
        role: p.role,
        companyId: p.companyId ?? null,
      },
      exp: p.exp,
      rem: p.rem === true,
      v: typeof p.v === 'string' ? p.v : null,
    };
  } catch {
    return null;
  }
}

function readCookie(req: FastifyRequest, name = COOKIE_NAME): string | undefined {
  const raw = req.headers['cookie'];
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Cookie de sesión: "recordar" dura sessionHours; si no, 2 h y muere con el navegador. */
function sessionCookie(session: Session, remember: boolean, v: string): string {
  const hours = remember ? config.sessionHours : 2;
  const exp = Date.now() + hours * 3600 * 1000;
  const token = sign(JSON.stringify({ ...session, exp, rem: remember, v }));
  const secure = config.publicBaseUrl.startsWith('https');
  const persist = remember ? `; Max-Age=${config.sessionHours * 3600}` : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${persist}${
    secure ? '; Secure' : ''
  }`;
}

const CLEAR_COOKIE = `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;

// ---------------------------------------------------------------------------
// Sesiones revocables. La cookie lleva una huella de la contraseña vigente al
// iniciar sesión; el guard la compara con el estado actual del usuario. Así,
// restablecer o cambiar la contraseña, borrar el usuario o suspender la
// empresa cierra las sesiones abiertas (antes seguían válidas hasta vencer).
// ---------------------------------------------------------------------------
function fingerprint(secret: string): string {
  return createHash('sha256').update(`${config.sessionSecret}:fp:${secret}`).digest('base64url').slice(0, 12);
}
const envAdminFingerprint = () => fingerprint(`${config.authUser}:${config.authPassword}`);

interface UserState {
  fp: string;
  role: string;
  companyId: string | null;
  suspended: boolean;
}
const userStates = new Map<string, { state: UserState | null; at: number }>();
const USER_STATE_TTL_MS = 30_000;

/** Olvida el estado en memoria (tras cambiar claves, usuarios o empresas). */
export function invalidateSessions(): void {
  userStates.clear();
}

async function userState(userId: string): Promise<UserState | null | undefined> {
  const hit = userStates.get(userId);
  if (hit && Date.now() - hit.at < USER_STATE_TTL_MS) return hit.state;
  try {
    const r = await pool.query(
      `SELECT u.password_hash, u.role, u.company_id, c.status AS company_status
         FROM users u LEFT JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1`,
      [userId]
    );
    const u = r.rows[0];
    const state: UserState | null = u
      ? {
          fp: fingerprint(u.password_hash),
          role: u.role,
          companyId: u.company_id,
          suspended: u.role === 'company_admin' && u.company_status === 'inactive',
        }
      : null;
    userStates.set(userId, { state, at: Date.now() });
    return state;
  } catch {
    // Base caída: se usa el último estado conocido; si no hay, no se decide.
    return hit ? hit.state : undefined;
  }
}

type Checked = { session: Session; exp: number; rem: boolean; v: string; reissue: boolean };

/**
 * Sesión del request validada contra el estado actual del usuario. null si no
 * hay cookie válida o la sesión fue revocada.
 */
export async function checkedSession(req: FastifyRequest): Promise<Checked | null> {
  const full = verifyFull(readCookie(req));
  if (!full) return null;
  const s = full.session;
  let current: string;
  if (!s.userId) {
    if (s.role !== 'superadmin' || !config.envAdminEnabled) return null;
    current = envAdminFingerprint();
  } else {
    const st = await userState(s.userId);
    if (st === null) return null; // usuario eliminado
    if (st === undefined) return { ...full, v: full.v || '', reissue: false }; // sin base: no se decide
    if (st.suspended || st.role !== s.role || st.companyId !== s.companyId) return null;
    current = st.fp;
  }
  // Cookies anteriores a esta función no traen huella: se aceptan una vez y se
  // renuevan con ella.
  if (full.v !== null && full.v !== current) return null;
  return { ...full, v: current, reissue: full.v === null };
}

// ---------------------------------------------------------------------------
// Límite de intentos de inicio de sesión (en memoria: un solo proceso).
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_USER_IP = 5;
const MAX_FAILS_PER_IP = 30;
const loginFails = new Map<string, { n: number; until: number }>();

function failCount(key: string): number {
  const e = loginFails.get(key);
  if (!e) return 0;
  if (Date.now() > e.until) {
    loginFails.delete(key);
    return 0;
  }
  return e.n;
}
function addFail(key: string): void {
  const n = failCount(key) + 1;
  loginFails.set(key, { n, until: loginFails.get(key)?.until ?? Date.now() + LOGIN_WINDOW_MS });
  if (loginFails.size > 5000) {
    for (const [k, e] of loginFails) if (Date.now() > e.until) loginFails.delete(k);
  }
}

/** Devuelve la sesión del request (o null). Se expone para uso en las rutas. */
export function getSession(req: FastifyRequest): Session | null {
  return verify(readCookie(req));
}

/** Bootstrap: ¿coincide con el superadmin definido por variables de entorno? */
function matchesEnvSuperadmin(user: string, pass: string): boolean {
  if (!config.envAdminEnabled) return false;
  const u = Buffer.from(user);
  const eu = Buffer.from(config.authUser);
  const p = Buffer.from(pass);
  const ep = Buffer.from(config.authPassword);
  const okUser = u.length === eu.length && timingSafeEqual(u, eu);
  const okPass = p.length === ep.length && timingSafeEqual(p, ep);
  return okUser && okPass;
}

export async function authRoutes(app: FastifyInstance) {
  // Login
  app.post<{ Body: { user?: string; password?: string; remember?: boolean } }>(
    '/api/login',
    async (req, reply) => {
      const { user, password, remember } = req.body || {};
      if (!user || !password || typeof user !== 'string' || typeof password !== 'string') {
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }

      // Tope de intentos fallidos: por usuario desde una misma IP y por IP.
      const ip = clientIp(req);
      const ipKey = `ip:${ip}`;
      const userKey = `u:${ip}:${user.trim().toLowerCase().slice(0, 80)}`;
      if (failCount(userKey) >= MAX_FAILS_PER_USER_IP || failCount(ipKey) >= MAX_FAILS_PER_IP) {
        return reply.code(429).send({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });
      }

      let session: Session | null = null;
      let fp = envAdminFingerprint();

      // 1) Superadmin por variables de entorno (bootstrap, siempre disponible)
      if (matchesEnvSuperadmin(user, password)) {
        session = { userId: null, user, role: 'superadmin', companyId: null };
      } else {
        // 2) Usuario en base de datos
        try {
          const rows = await pool.query(
            `SELECT u.id, u.username, u.password_hash, u.role, u.company_id,
                    c.status AS company_status
               FROM users u
               LEFT JOIN companies c ON c.id = u.company_id
              WHERE u.username = $1`,
            [user]
          );
          const u = rows.rows[0];
          if (u && verifyPassword(password, u.password_hash)) {
            // Suscripción: si la empresa del cliente está inactiva, se bloquea el acceso.
            if (u.role === 'company_admin' && u.company_status === 'inactive') {
              return reply.code(403).send({
                error: 'Tu cuenta está suspendida. Contacta al administrador de la plataforma.',
              });
            }
            session = {
              userId: u.id,
              user: u.username,
              role: u.role,
              companyId: u.company_id,
            };
            fp = fingerprint(u.password_hash);
          }
        } catch {
          /* si la tabla users aún no existe, solo funciona el superadmin env */
        }
      }

      if (!session) {
        addFail(userKey);
        addFail(ipKey);
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }
      loginFails.delete(userKey);
      if (session.userId) userStates.delete(session.userId);

      // Con "recordar": la sesión dura sessionHours. Sin él: caduca pronto (2h) y la
      // cookie es de sesión de navegador (sin Max-Age).
      const secure = config.publicBaseUrl.startsWith('https');
      reply.header('Set-Cookie', [
        sessionCookie(session, remember !== false, fp),
        `${RETURN_COOKIE}=1; HttpOnly; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}${secure ? '; Secure' : ''}`,
      ]);
      return { ok: true, role: session.role };
    }
  );

  // Logout
  app.post('/api/logout', async (_req, reply) => {
    reply.header('Set-Cookie', CLEAR_COOKIE);
    return { ok: true };
  });

  // Estado de sesión
  app.get('/api/me', async (req) => {
    const s = (await checkedSession(req))?.session;
    if (!s) return { authenticated: false, user: null };
    // Nombre de empresa para company_admin
    let companyName: string | null = null;
    if (s.companyId) {
      try {
        const r = await pool.query('SELECT name FROM companies WHERE id = $1', [s.companyId]);
        companyName = r.rows[0]?.name || null;
      } catch {
        /* ignore */
      }
    }
    const plan = s.companyId ? await companyPlan(s.companyId) : 'pro';
    return {
      authenticated: true,
      user: s.user,
      role: s.role,
      companyId: s.companyId,
      companyName,
      plan,
    };
  });

  // Cambiar la propia contraseña (usuarios en BD; el superadmin por env no aplica).
  app.post<{ Body: { current?: string; next?: string } }>(
    '/api/change-password',
    async (req, reply) => {
      const s = getSession(req);
      if (!s) return reply.code(401).send({ error: 'No autenticado.' });
      if (!s.userId) {
        return reply.code(400).send({
          error: 'El superadministrador cambia su clave desde las variables de entorno.',
        });
      }
      const current = req.body?.current || '';
      const next = req.body?.next || '';
      if (next.length < 8) {
        return reply.code(400).send({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      }
      const rows = await pool.query('SELECT password_hash FROM users WHERE id = $1', [s.userId]);
      const u = rows.rows[0];
      if (!u || !verifyPassword(current, u.password_hash)) {
        return reply.code(400).send({ error: 'La contraseña actual no es correcta.' });
      }
      const newHash = hashPassword(next);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, s.userId]);
      // Las demás sesiones del usuario quedan cerradas; esta se renueva.
      userStates.delete(s.userId);
      const full = verifyFull(readCookie(req));
      reply.header('Set-Cookie', sessionCookie(s, full?.rem === true, fingerprint(newHash)));
      return { ok: true };
    }
  );
}

/** Rutas /api/* que no piden sesión (por patrón de ruta, no por la URL recibida). */
const PUBLIC_API = new Set(['/api/login', '/api/logout', '/api/me']);

/**
 * Segunda barrera, por plugin de rutas: toda ruta /api/* exige sesión aunque el
 * guard global fallara. Usa el patrón de la ruta ya resuelta por el enrutador,
 * que no se puede falsear con trucos en la URL.
 */
export function requireApiSession(app: FastifyInstance) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const route = req.routeOptions?.url || '';
    if (!route.startsWith('/api/') || PUBLIC_API.has(route)) return;
    if (!getSession(req)) return reply.code(401).send({ error: 'No autenticado.' });
  });
}

export function registerAuthGuard(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // La ruta se corta también en ";": Fastify 4 lo trataba como inicio del
    // query, así que "/api/kpis;x.png" llegaba a /api/kpis saltándose el login.
    const url = req.url.split(/[?;]/)[0];
    const isApi = url.startsWith('/api/');

    if (
      url.startsWith('/r/') ||
      // Informe por enlace firmado desde el correo (el token valida el acceso).
      url.startsWith('/informe/') ||
      url === '/api/login' ||
      url === '/api/logout' ||
      url === '/api/me' ||
      url === '/login' ||
      // Landing comercial
      url === '/empresas' ||
      url.startsWith('/empresas/') ||
      // Perfiles digitales de clientes
      url.startsWith('/perfiles/') ||
      url === '/login.html' ||
      url === '/login.js' ||
      url === '/styles.css' ||
      url === '/icons.js' ||
      url === '/chart.umd.min.js' ||
      url === '/qrcode.min.js' ||
      url === '/favicon.ico' ||
      // Imágenes y fuentes estáticas; nunca una ruta de la API.
      (!isApi && /\.(png|jpe?g|svg|gif|webp|ico|woff2?|ttf)$/i.test(url))
    ) {
      return;
    }

    const hadCookie = !!readCookie(req);
    const full = await checkedSession(req);
    const session = full ? full.session : null;
    if (full && session) {
      // Sesión deslizante: quien usa el panel con "recordar" no queda fuera a los
      // 7 días; pasada la mitad del plazo, la cookie se renueva sola.
      if (full.reissue || (full.rem && full.exp - Date.now() < (config.sessionHours * 3600 * 1000) / 2)) {
        reply.header('Set-Cookie', sessionCookie(session, full.rem, full.v));
      }
      // Plan Básico (prueba vencida): solo se bloquea la API del panel; las
      // tarjetas (/r/) siguen funcionando y registrando interacciones.
      if (
        session.role === 'company_admin' &&
        session.companyId &&
        url.startsWith('/api/') &&
        !BASIC_ALLOWED.has(url) &&
        (await companyPlan(session.companyId)) === 'basic'
      ) {
        return reply.code(402).send({ error: 'plan_basico' });
      }
      return;
    }

    // Cookie vencida o revocada: se borra para que /login no la dé por buena.
    if (hadCookie) reply.header('Set-Cookie', CLEAR_COOKIE);
    if (isApi) {
      return reply.code(401).send({ error: 'No autenticado.' });
    }
    // La raíz sin sesión es la entrada comercial, salvo para quien ya es cliente:
    // ese vuelve a su login. El resto del panel pide login.
    if (url === '/' && !readCookie(req, RETURN_COOKIE)) return reply.redirect('/empresas/');
    return reply.redirect('/login');
  });
}
