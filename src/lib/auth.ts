import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { pool } from '../db/pool';

const COOKIE_NAME = 'nfc_session';

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
      userId: p.userId ?? null,
      user: p.user,
      role: p.role,
      companyId: p.companyId ?? null,
    };
  } catch {
    return null;
  }
}

function readCookie(req: FastifyRequest): string | undefined {
  const raw = req.headers['cookie'];
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE_NAME) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Devuelve la sesión del request (o null). Se expone para uso en las rutas. */
export function getSession(req: FastifyRequest): Session | null {
  return verify(readCookie(req));
}

/** Bootstrap: ¿coincide con el superadmin definido por variables de entorno? */
function matchesEnvSuperadmin(user: string, pass: string): boolean {
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
      if (!user || !password) {
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }

      let session: Session | null = null;

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
          }
        } catch {
          /* si la tabla users aún no existe, solo funciona el superadmin env */
        }
      }

      if (!session) {
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }

      // Con "recordar": la sesión dura sessionHours. Sin él: caduca pronto (2h) y la
      // cookie es de sesión de navegador (sin Max-Age).
      const hours = remember === false ? 2 : config.sessionHours;
      const exp = Date.now() + hours * 3600 * 1000;
      const token = sign(JSON.stringify({ ...session, exp }));
      const secure = config.publicBaseUrl.startsWith('https');
      const persist = remember === false ? '' : `; Max-Age=${config.sessionHours * 3600}`;
      reply.header(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${persist}${
          secure ? '; Secure' : ''
        }`
      );
      return { ok: true, role: session.role };
    }
  );

  // Logout
  app.post('/api/logout', async (_req, reply) => {
    reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  // Estado de sesión
  app.get('/api/me', async (req) => {
    const s = getSession(req);
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
    return {
      authenticated: true,
      user: s.user,
      role: s.role,
      companyId: s.companyId,
      companyName,
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
      if (next.length < 6) {
        return reply.code(400).send({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      }
      const rows = await pool.query('SELECT password_hash FROM users WHERE id = $1', [s.userId]);
      const u = rows.rows[0];
      if (!u || !verifyPassword(current, u.password_hash)) {
        return reply.code(400).send({ error: 'La contraseña actual no es correcta.' });
      }
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        hashPassword(next),
        s.userId,
      ]);
      return { ok: true };
    }
  );
}

export function registerAuthGuard(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];

    if (
      url.startsWith('/r/') ||
      url === '/api/login' ||
      url === '/api/logout' ||
      url === '/api/me' ||
      url === '/login' ||
      url === '/login.html' ||
      url === '/login.js' ||
      url === '/styles.css' ||
      url === '/icons.js' ||
      url === '/chart.umd.min.js' ||
      url === '/qrcode.min.js' ||
      url === '/favicon.ico' ||
      /\.(png|jpe?g|svg|gif|webp|ico|woff2?|ttf)$/i.test(url)
    ) {
      return;
    }

    if (getSession(req)) return;

    if (url.startsWith('/api/')) {
      return reply.code(401).send({ error: 'No autenticado.' });
    }
    return reply.redirect('/login');
  });
}
