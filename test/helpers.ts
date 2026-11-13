/**
 * Entorno de las pruebas automáticas (`npm test`).
 *
 * Usa el Postgres y el Redis locales de Docker, pero NUNCA los datos de
 * desarrollo: una base aparte (`nfc_test`, se crea sola) y la base 15 de Redis.
 * Se niega a correr contra un servidor que no sea local.
 *
 * Las variables se fijan ANTES de importar el código de la aplicación, porque
 * `src/config.ts` las lee al cargarse.
 */
import { Client } from 'pg';
import type { FastifyInstance } from 'fastify';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgres://nfc_admin:nfc_secret@localhost:5432/nfc_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/15';

export const ADMIN = { user: 'superadmin_pruebas', password: 'clave-de-pruebas-123' };

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(TEST_DB_URL) || !/\/\/(localhost|127\.0\.0\.1)/.test(TEST_REDIS_URL)) {
  throw new Error('Las pruebas solo corren contra Postgres y Redis locales.');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DB_URL,
  REDIS_URL: TEST_REDIS_URL,
  PUBLIC_BASE_URL: 'http://localhost:3000',
  AUTH_USER: ADMIN.user,
  AUTH_PASSWORD: ADMIN.password,
  SESSION_SECRET: 'secreto-solo-para-pruebas',
  SESSION_HOURS: '168',
  SCAN_DEDUPE_SECONDS: '30',
  TRIAL_DAYS: '30',
  // Nada sale del equipo: sin correo, mensajería ni Google.
  RESEND_API_KEY: '',
  SMTP_HOST: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  GOOGLE_PLACES_API_KEY: '',
  DB_SSL: '',
});

/** Crea la base de pruebas si no existe (conectando a la base `postgres`). */
async function ensureDatabase(): Promise<void> {
  const url = new URL(TEST_DB_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
  } catch (err: any) {
    throw new Error(
      `No se pudo conectar a Postgres local (${err.code || err.message}). ` +
        'Arranca Docker Desktop y ejecuta "docker compose up -d".'
    );
  }
  try {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!r.rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await client.end();
  }
}

export interface Ctx {
  app: FastifyInstance;
  pool: import('pg').Pool;
  redis: import('ioredis').default;
}

let ctx: Ctx | null = null;

/** Base limpia + aplicación lista. Llamar en `before()` de cada archivo. */
export async function setup(): Promise<Ctx> {
  await ensureDatabase();
  const { pool } = await import('../src/db/pool');
  const { redis } = await import('../src/db/redis');
  const { applySchema } = await import('../src/db/migrate');
  const { buildApp } = await import('../src/app');
  const log = console.log;
  console.log = () => {}; // el esquema escribe dos líneas por archivo de pruebas
  try {
    await applySchema();
  } finally {
    console.log = log;
  }
  await pool.query(
    `TRUNCATE companies, users, locations, devices, scan_events, bulk_updates, reputation_snapshots,
              survey_templates, survey_aspects, survey_responses, survey_answers, report_schedules,
              campaigns, inactivity_alerts, inactivity_alert_notices, location_competitors, place_snapshots
       RESTART IDENTITY CASCADE`
  );
  await redis.flushdb();
  const app = await buildApp({ logger: false });
  await app.ready();
  ctx = { app, pool, redis };
  return ctx;
}

/** Cierra todo. Llamar en `after()` de cada archivo. */
export async function teardown(): Promise<void> {
  if (!ctx) return;
  await ctx.app.close();
  await sleep(150); // registros de escaneo en vuelo
  await ctx.pool.end();
  ctx.redis.disconnect();
  ctx = null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que `fn` devuelva verdadero (los escaneos se registran después del 302). */
export async function waitFor(fn: () => Promise<boolean>, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(40);
  }
  return fn();
}

function c(): Ctx {
  if (!ctx) throw new Error('Falta llamar a setup().');
  return ctx;
}

/** Cookie de sesión tras iniciar sesión; lanza si el login falla. */
export async function login(user: string, password: string, ip = '10.9.9.9'): Promise<string> {
  const res = await c().app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { 'cf-connecting-ip': ip },
    payload: { user, password },
  });
  if (res.statusCode !== 200) throw new Error(`login ${user}: ${res.statusCode} ${res.body}`);
  return cookieOf(res);
}

export function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((x) => String(x).split(';')[0]).join('; ');
}

/** Petición a la app con (o sin) sesión. */
export async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  cookie?: string,
  payload?: unknown
) {
  const res = await c().app.inject({
    method,
    url,
    headers: cookie ? { cookie } : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  let json: any = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    /* no es JSON */
  }
  return { status: res.statusCode, json, body: res.body, headers: res.headers };
}

/** Escaneo de una tarjeta: IP y navegador simulados. */
export async function scan(code: string, opts: { ip?: string; ua?: string; query?: string } = {}) {
  return c().app.inject({
    method: 'GET',
    url: `/r/${code}${opts.query || ''}`,
    headers: {
      'cf-connecting-ip': opts.ip || '190.0.0.1',
      'user-agent': opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    },
  });
}

export async function scanCount(deviceId: string): Promise<number> {
  const r = await c().pool.query('SELECT COUNT(*)::int AS n FROM scan_events WHERE device_id = $1', [deviceId]);
  return r.rows[0].n;
}

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------
let seq = 0;

export interface Tenant {
  companyId: string;
  user: string;
  password: string;
  cookie: string;
  locationId: string;
  deviceId: string;
  code: string;
  target: string;
}

/** Empresa con un usuario, una sede y un punto de redirección; sesión iniciada. */
export async function makeTenant(name: string, opts: { plan?: string } = {}): Promise<Tenant> {
  const { hashPassword } = await import('../src/lib/auth');
  const n = ++seq;
  const p = c().pool;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`;
  const co = await p.query(
    `INSERT INTO companies (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
    [name, slug, opts.plan || 'pro']
  );
  const companyId = co.rows[0].id as string;
  const user = `usuario_${slug}`;
  const password = `clave-${slug}-123`;
  await p.query(
    `INSERT INTO users (username, password_hash, role, company_id) VALUES ($1, $2, 'company_admin', $3)`,
    [user, hashPassword(password), companyId]
  );
  const loc = await p.query(
    `INSERT INTO locations (name, brand, city, company_id) VALUES ($1, $2, 'Medellín', $3) RETURNING id`,
    [`Sede ${name}`, name, companyId]
  );
  const locationId = loc.rows[0].id as string;
  const dev = await makeDevice(locationId, { label: `Punto ${name}`, target: `https://wa.me/57300000000${n % 10}` });
  // En plan Básico el login funciona (la API responde 402 después).
  const cookie = await login(user, password, `10.0.0.${n}`);
  return { companyId, user, password, cookie, locationId, ...dev };
}

export async function makeDevice(
  locationId: string,
  opts: { label?: string; target?: string; status?: string } = {}
): Promise<{ deviceId: string; code: string; target: string }> {
  const n = ++seq;
  const code = `Tst${String(n).padStart(5, '0')}`; // 8 caracteres alfanuméricos
  const target = opts.target || 'https://g.page/r/abc/review';
  const r = await c().pool.query(
    `INSERT INTO devices (location_id, label, target_url, status, code) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [locationId, opts.label || `Punto ${n}`, target, opts.status || 'active', code]
  );
  return { deviceId: r.rows[0].id as string, code, target };
}

/** Plantilla de encuesta con dos aspectos. */
export async function makeTemplate(companyId: string, name = 'Satisfacción'): Promise<{ templateId: string; aspects: string[] }> {
  const p = c().pool;
  const t = await p.query(`INSERT INTO survey_templates (company_id, name) VALUES ($1, $2) RETURNING id`, [companyId, name]);
  const templateId = t.rows[0].id as string;
  const aspects: string[] = [];
  for (const [i, label] of ['Atención', 'Limpieza'].entries()) {
    const a = await p.query(
      `INSERT INTO survey_aspects (template_id, label, position) VALUES ($1, $2, $3) RETURNING id`,
      [templateId, label, i]
    );
    aspects.push(a.rows[0].id as string);
  }
  return { templateId, aspects };
}
