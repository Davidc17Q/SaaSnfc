import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

const COOKIE_NAME = 'nfc_session';

/** Firma un payload con HMAC-SHA256 -> "<payloadBase64>.<firma>". */
function sign(payload: string): string {
  const data = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Verifica el token; devuelve el payload si es válido y no ha expirado. */
function verify(token: string | undefined): { user: string } | null {
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
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return { user: payload.user };
  } catch {
    return null;
  }
}

/** Lee la cookie de sesión del request (parseo manual, sin dependencias). */
function readCookie(req: FastifyRequest): string | undefined {
  const raw = req.headers['cookie'];
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE_NAME) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function isAuthenticated(req: FastifyRequest): boolean {
  return verify(readCookie(req)) !== null;
}

/** Comparación de credenciales resistente a timing. */
function credentialsMatch(user: string, pass: string): boolean {
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
      if (!user || !password || !credentialsMatch(user, password)) {
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }
      const exp = Date.now() + config.sessionHours * 3600 * 1000;
      const token = sign(JSON.stringify({ user, exp }));
      const secure = config.publicBaseUrl.startsWith('https');
      // Con "recordar": cookie persistente (Max-Age). Sin él: cookie de sesión.
      const persist =
        remember === false
          ? ''
          : `; Max-Age=${config.sessionHours * 3600}`;
      reply.header(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${persist}${
          secure ? '; Secure' : ''
        }`
      );
      return { ok: true };
    }
  );

  // Logout
  app.post('/api/logout', async (_req, reply) => {
    reply.header(
      'Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    );
    return { ok: true };
  });

  // Estado de sesión
  app.get('/api/me', async (req) => {
    const session = verify(readCookie(req));
    return { authenticated: !!session, user: session?.user || null };
  });
}

/**
 * Hook global que protege el panel y la API de gestión, dejando públicos:
 * - el motor de redirección (/r/:id)
 * - los endpoints y la página de login
 * - los estáticos del login
 */
export function registerAuthGuard(app: FastifyInstance) {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];

    // Rutas públicas
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
      url === '/favicon.ico' ||
      /\.(png|jpe?g|svg|gif|webp|ico|woff2?|ttf)$/i.test(url)
    ) {
      return;
    }

    if (isAuthenticated(req)) return;

    // API protegida -> 401 JSON
    if (url.startsWith('/api/')) {
      return reply.code(401).send({ error: 'No autenticado.' });
    }
    // Páginas -> redirigir al login
    return reply.redirect('/login');
  });
}
