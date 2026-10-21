/**
 * Datos de demostración realistas para UNA empresa (por defecto Hogar y Moda).
 *
 * Pensado para mostrar todas las capacidades de la plataforma en una reunión:
 * tendencia con crecimiento, campañas con efecto real, sedes con alertas,
 * reputación de Google en aumento, encuestas por aspecto y varios destinos.
 *
 * Solo toca la empresa indicada: borra y vuelve a crear SUS sedes, puntos,
 * interacciones, campañas, encuestas y mediciones de reputación. Las demás
 * empresas y los usuarios no se modifican.
 *
 * Uso:
 *   npm run demo -- --confirmar                 regenera todo (120 días hasta hoy)
 *   npm run demo -- --continuar                 solo agrega interacciones desde la
 *                                               última registrada hasta ahora
 *   Opciones: --empresa "Hogar y Moda"  --dias 120  --produccion
 *
 * Por seguridad, contra una base que no sea local exige además --produccion.
 */
import { randomUUID } from 'crypto';
import { pool } from './pool';
import { redis, deviceCacheKey } from './redis';
import { config } from '../config';
import { detectChannel } from '../lib/channel';
import { generateShortCode } from '../lib/shortcode';

// ----------------------------------------------------------------------------
// Argumentos
// ----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const COMPANY_NAME = opt('empresa', 'Hogar y Moda');
const DAYS = Math.max(30, parseInt(opt('dias', '120'), 10) || 120);
const APP_TZ_OFFSET_H = 5; // America/Bogota = UTC-5, sin horario de verano

// ----------------------------------------------------------------------------
// Aleatoriedad reproducible (misma semilla => mismos datos)
// ----------------------------------------------------------------------------
let seed = 20261020;
function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
/** Entero con media `mean` y algo de dispersión (aprox. Poisson). */
function count(mean: number): number {
  if (mean <= 0) return 0;
  const sd = Math.sqrt(mean);
  // Box-Muller
  const u = Math.max(1e-9, rnd());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  return Math.max(0, Math.round(mean + z * sd));
}

// ----------------------------------------------------------------------------
// Sedes reales de la cadena (fuentes públicas: LinkedIn de la empresa, Tiendeo,
// Waze; más los puntos que indicó el cliente). `size` = tráfico relativo.
// ----------------------------------------------------------------------------
const STORES: { name: string; city: string; size: number }[] = [
  { name: 'PUNTO DE VENTA LA PLAYA', city: 'Medellín', size: 2.2 },
  { name: 'PUNTO DE VENTA BODEGA LA 49', city: 'Medellín', size: 1.9 },
  { name: 'PUNTO DE VENTA MANRIQUE', city: 'Medellín', size: 1.5 },
  { name: 'PUNTO DE VENTA ARANJUEZ', city: 'Medellín', size: 1.4 },
  { name: 'PUNTO DE VENTA BELLO', city: 'Bello', size: 1.6 },
  { name: 'PUNTO DE VENTA ITAGÜÍ', city: 'Itagüí', size: 1.5 },
  { name: 'PUNTO DE VENTA ENVIGADO', city: 'Envigado', size: 1.3 },
  { name: 'PUNTO DE VENTA CALDAS', city: 'Caldas', size: 0.8 },
  { name: 'PUNTO DE VENTA COPACABANA', city: 'Copacabana', size: 0.9 },
  { name: 'PUNTO DE VENTA BARBOSA', city: 'Barbosa', size: 0.6 },
  { name: 'PUNTO DE VENTA RIONEGRO', city: 'Rionegro', size: 1.3 },
  { name: 'PUNTO DE VENTA LA CEJA', city: 'La Ceja', size: 0.9 },
  { name: 'PUNTO DE VENTA EL RETIRO', city: 'El Retiro', size: 0.6 },
  { name: 'PUNTO DE VENTA MARINILLA', city: 'Marinilla', size: 0.9 },
  { name: 'PUNTO DE VENTA EL SANTUARIO', city: 'El Santuario', size: 0.7 },
  { name: 'PUNTO DE VENTA LA UNIÓN', city: 'La Unión', size: 0.6 },
  { name: 'PUNTO DE VENTA GUARNE', city: 'Guarne', size: 0.7 },
  { name: 'PUNTO DE VENTA EL CARMEN DE VIBORAL', city: 'El Carmen de Viboral', size: 0.8 },
  { name: 'PUNTO DE VENTA EL PEÑOL', city: 'El Peñol', size: 0.5 },
  { name: 'PUNTO DE VENTA NECOCLÍ', city: 'Necoclí', size: 0.7 },
  { name: 'PUNTO DE VENTA APARTADÓ', city: 'Apartadó', size: 1.2 },
  { name: 'PUNTO DE VENTA TURBO', city: 'Turbo', size: 0.9 },
  { name: 'PUNTO DE VENTA CAREPA', city: 'Carepa', size: 0.7 },
  { name: 'PUNTO DE VENTA CHIGORODÓ', city: 'Chigorodó', size: 0.7 },
  { name: 'PUNTO DE VENTA BARRANCABERMEJA', city: 'Barrancabermeja', size: 1.0 },
  { name: 'PUNTO DE VENTA BUCARAMANGA', city: 'Bucaramanga', size: 1.1 },
  { name: 'PUNTO DE VENTA MANIZALES', city: 'Manizales', size: 1.0 },
];

// Historias que el panel debe poder contar (alertas reales, no 80 a la vez).
const SILENT_STORE = 'PUNTO DE VENTA TURBO'; // sin actividad los últimos 4 días
const DROP_STORE = 'PUNTO DE VENTA COPACABANA'; // cae ~55 % la última semana
const SOFT_DROP_STORE = 'PUNTO DE VENTA EL PEÑOL'; // cae ~45 % la última semana
const SLOW_CHECKOUT_STORE = 'PUNTO DE VENTA BELLO'; // peor nota en "Tiempo en caja"

// Puntos NFC de cada tienda: destino y peso dentro de la tienda.
const POINTS: { label: string; url: string; share: number; survey?: boolean }[] = [
  { label: 'Caja principal', url: 'https://search.google.com/local/writereview?placeid=demo-hogar-y-moda', share: 0.46 },
  { label: 'Probadores', url: 'https://wa.me/573000000000?text=Hola%20Hogar%20y%20Moda', share: 0.24 },
  { label: 'Vitrina de entrada', url: 'https://www.instagram.com/hogarymoda/', share: 0.18 },
  { label: 'Catálogo', url: 'https://hogarymoda.com.co', share: 0.12 },
];
// Tiendas con punto de encuesta ("¿Cómo fue tu visita?") junto a la caja.
const SURVEY_STORES = new Set([
  'PUNTO DE VENTA LA PLAYA',
  'PUNTO DE VENTA BODEGA LA 49',
  'PUNTO DE VENTA MANRIQUE',
  'PUNTO DE VENTA BELLO',
  'PUNTO DE VENTA RIONEGRO',
  'PUNTO DE VENTA APARTADÓ',
  'PUNTO DE VENTA BUCARAMANGA',
  'PUNTO DE VENTA MANIZALES',
]);

// Campañas relativas a hoy, con su efecto en el tráfico.
function campaignsFor(today: Date): { name: string; start: Date; end: Date; factor: number; note: string }[] {
  const d = (offset: number) => addDays(today, offset);
  return [
    { name: 'Mitad de año', start: d(-112), end: d(-96), factor: 1.28, note: 'Descuentos de temporada en ropa y hogar' },
    { name: 'Amor y Amistad', start: d(-38), end: d(-30), factor: 1.35, note: 'Regalos con 20 % y pauta en Instagram' },
    { name: 'Ofertubre 25 %', start: d(-19), end: d(11), factor: 1.38, note: '25 % en toda la tienda' },
  ];
}

const OS_WEIGHTS = [
  { os: 'Android', w: 0.71 },
  { os: 'iOS', w: 0.26 },
  { os: 'Other', w: 0.03 },
];
const UA: Record<string, string> = {
  Android:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  iOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  Other: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};
function osPick(): string {
  const r = rnd();
  let acc = 0;
  for (const o of OS_WEIGHTS) {
    acc += o.w;
    if (r <= acc) return o.os;
  }
  return 'Other';
}
const ip = () => `${181 + Math.floor(rnd() * 10)}.${Math.floor(rnd() * 256)}.${Math.floor(rnd() * 256)}.${1 + Math.floor(rnd() * 254)}`;

// Día de la semana (0 = domingo) en un almacén de barrio/municipio.
const DOW = [1.15, 0.78, 0.82, 0.86, 0.95, 1.2, 1.45];
// Distribución horaria (hora local): apertura 9:00, picos almuerzo y tarde.
const HOURS: { h: number; w: number }[] = [
  { h: 9, w: 3 }, { h: 10, w: 6 }, { h: 11, w: 8 }, { h: 12, w: 10 }, { h: 13, w: 9 },
  { h: 14, w: 7 }, { h: 15, w: 8 }, { h: 16, w: 10 }, { h: 17, w: 12 }, { h: 18, w: 12 },
  { h: 19, w: 9 }, { h: 20, w: 4 },
];
const HOURS_TOTAL = HOURS.reduce((a, b) => a + b.w, 0);
function hourPick(): number {
  let r = rnd() * HOURS_TOTAL;
  for (const x of HOURS) {
    r -= x.w;
    if (r <= 0) return x.h;
  }
  return 18;
}

// ----------------------------------------------------------------------------
// Fechas en hora del negocio (Bogotá)
// ----------------------------------------------------------------------------
/** Medianoche local del día de `d`, expresada como Date (UTC interno). */
function localMidnight(d: Date): Date {
  const local = new Date(d.getTime() - APP_TZ_OFFSET_H * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), APP_TZ_OFFSET_H));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
const iso = (d: Date) => new Date(d.getTime() - APP_TZ_OFFSET_H * 3600_000).toISOString().slice(0, 10);
const dowOf = (d: Date) => new Date(d.getTime() - APP_TZ_OFFSET_H * 3600_000).getUTCDay();

// ----------------------------------------------------------------------------
// Generación de interacciones
// ----------------------------------------------------------------------------
interface DemoDevice {
  id: string;
  locationId: string;
  storeName: string;
  storeSize: number;
  url: string;
  share: number;
  survey: boolean;
}

/** Interacciones esperadas para una tienda en un día dado. */
function expected(store: { name: string; size: number }, day: Date, today: Date, camps: ReturnType<typeof campaignsFor>): number {
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  // Adopción creciente: ~+35 % a lo largo del periodo.
  const growth = 0.8 + 0.35 * (1 - daysAgo / DAYS);
  let f = 9.5 * store.size * DOW[dowOf(day)] * growth;
  for (const c of camps) if (day >= localMidnight(c.start) && day <= localMidnight(c.end)) f *= c.factor;
  // Quincenas (días 14-16 y 29-1): la gente cobra y compra más.
  const dom = parseInt(iso(day).slice(8, 10), 10);
  if ([14, 15, 16, 29, 30, 31, 1].includes(dom)) f *= 1.12;
  // Historias de alerta.
  if (store.name === SILENT_STORE && daysAgo <= 3) f = 0;
  if (store.name === DROP_STORE && daysAgo <= 7) f *= 0.36;
  if (store.name === SOFT_DROP_STORE && daysAgo <= 7) f *= 0.45;
  return f;
}

async function insertScans(devices: DemoDevice[], from: Date, to: Date, today: Date): Promise<number> {
  const camps = campaignsFor(today);
  const byStore = new Map<string, DemoDevice[]>();
  for (const d of devices) {
    if (d.survey) continue; // las encuestas generan respuestas, no redirecciones
    const list = byStore.get(d.locationId) || [];
    list.push(d);
    byStore.set(d.locationId, list);
  }

  const rows: any[][] = [];
  for (let day = localMidnight(from); day <= to; day = addDays(day, 1)) {
    for (const [, devs] of byStore) {
      const store = { name: devs[0].storeName, size: devs[0].storeSize };
      const n = count(expected(store, day, today, camps));
      const totalShare = devs.reduce((a, d) => a + d.share, 0);
      for (let i = 0; i < n; i++) {
        let r = rnd() * totalShare;
        let dev = devs[0];
        for (const d of devs) {
          r -= d.share;
          if (r <= 0) { dev = d; break; }
        }
        const at = new Date(day.getTime() + hourPick() * 3600_000 + Math.floor(rnd() * 3600_000));
        if (at < from || at > to) continue;
        const os = osPick();
        rows.push([dev.id, dev.locationId, os, detectChannel(dev.url), UA[os], ip(), at.toISOString()]);
      }
    }
  }

  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const values: string[] = [];
    const params: any[] = [];
    chunk.forEach((r, j) => {
      const b = j * 7;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
      params.push(...r);
    });
    await pool.query(
      `INSERT INTO scan_events (device_id, location_id, os, channel, user_agent, ip, scanned_at)
       VALUES ${values.join(',')}`,
      params
    );
    process.stdout.write(`\r   ... ${Math.min(i + 1000, rows.length)}/${rows.length} interacciones`);
  }
  if (rows.length) process.stdout.write('\n');
  return rows.length;
}

// ----------------------------------------------------------------------------
// Encuestas y reputación
// ----------------------------------------------------------------------------
const ASPECTS = ['Atención del personal', 'Orden y limpieza', 'Variedad de productos', 'Tiempo en caja'];
const COMMENTS = [
  'Muy buena atención, la asesora me ayudó a encontrar la talla.',
  'Encontré todo lo que buscaba para la casa.',
  'La fila para pagar estaba muy larga.',
  'Buenos precios en Ofertubre.',
  'Faltaban tallas en jeans.',
  'Tienda ordenada y limpia.',
  'Me gustaría más variedad en calzado.',
];

async function insertSurvey(companyId: string, devices: DemoDevice[], from: Date, to: Date): Promise<number> {
  const tpl = await pool.query(
    `INSERT INTO survey_templates (company_id, name, scale_max) VALUES ($1, 'Experiencia en tienda', 5) RETURNING id`,
    [companyId]
  );
  const templateId = tpl.rows[0].id as string;
  const aspectIds: string[] = [];
  for (let i = 0; i < ASPECTS.length; i++) {
    const a = await pool.query(
      `INSERT INTO survey_aspects (template_id, label, position) VALUES ($1, $2, $3) RETURNING id`,
      [templateId, ASPECTS[i], i]
    );
    aspectIds.push(a.rows[0].id);
  }

  // Se generan en memoria y se insertan por lotes: contra una base remota
  // (producción) una consulta por respuesta tardaría varios minutos.
  const pending: { dev: DemoDevice; at: Date; comment: string | null; ratings: number[] }[] = [];
  for (const dev of devices.filter((d) => d.survey)) {
    await pool.query(`UPDATE devices SET mode = 'survey', survey_template_id = $1 WHERE id = $2`, [templateId, dev.id]);
    for (let day = localMidnight(from); day <= to; day = addDays(day, 1)) {
      const n = count(1.6 * dev.storeSize * DOW[dowOf(day)]);
      for (let i = 0; i < n; i++) {
        const at = new Date(day.getTime() + hourPick() * 3600_000 + Math.floor(rnd() * 3600_000));
        if (at > to) continue;
        const comment = rnd() < 0.12 ? pick(COMMENTS) : null;
        // Notas mayormente altas; "Tiempo en caja" es el punto débil (más en Bello).
        const ratings = aspectIds.map((_, k) => {
          let mean = [4.6, 4.4, 4.2, 3.9][k];
          if (k === 3 && dev.storeName === SLOW_CHECKOUT_STORE) mean = 3.1;
          return Math.min(5, Math.max(1, Math.round(mean + (rnd() - 0.5) * 2)));
        });
        pending.push({ dev, at, comment, ratings });
      }
    }
  }

  const total = pending.length;
  for (let i = 0; i < pending.length; i += 400) {
    const chunk = pending.slice(i, i + 400);
    const values: string[] = [];
    const params: any[] = [];
    chunk.forEach((r, j) => {
      const b = j * 6;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
      params.push(r.dev.id, r.dev.locationId, templateId, r.comment, ip(), r.at.toISOString());
    });
    // RETURNING conserva el orden de VALUES en un INSERT simple.
    const ids = await pool.query<{ id: string }>(
      `INSERT INTO survey_responses (device_id, location_id, template_id, comment, ip, submitted_at)
       VALUES ${values.join(',')} RETURNING id`,
      params
    );
    const aVals: string[] = [];
    const aParams: any[] = [];
    chunk.forEach((r, j) => {
      r.ratings.forEach((rating, k) => {
        const b = aParams.length;
        aVals.push(`($${b + 1},$${b + 2},$${b + 3})`);
        aParams.push(ids.rows[j].id, aspectIds[k], rating);
      });
    });
    await pool.query(`INSERT INTO survey_answers (response_id, aspect_id, rating) VALUES ${aVals.join(',')}`, aParams);
  }
  return total;
}

async function insertReputation(locations: { id: string; name: string; size: number }[], today: Date): Promise<number> {
  let total = 0;
  const points = [-DAYS + 5, -DAYS + 35, -DAYS + 65, -DAYS + 95, -2];
  for (const loc of locations) {
    let rating = 3.8 + rnd() * 0.5;
    let reviews = Math.round(30 + loc.size * 120 + rnd() * 60);
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        rating = Math.min(4.9, rating + 0.03 + rnd() * 0.09);
        reviews += Math.round(loc.size * (14 + rnd() * 12));
      }
      await pool.query(
        `INSERT INTO reputation_snapshots (location_id, rating, review_count, measured_on, source, note)
         VALUES ($1, $2, $3, $4::date, 'manual', 'Dato de demostración')
         ON CONFLICT (location_id, measured_on) DO NOTHING`,
        [loc.id, Math.round(rating * 10) / 10, reviews, iso(addDays(today, points[i]))]
      );
      total++;
    }
  }
  return total;
}

// ----------------------------------------------------------------------------
// Principal
// ----------------------------------------------------------------------------
function isLocalDb(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url);
}

async function clearRedis(keys: string[]) {
  if (!keys.length) return;
  try {
    await redis.del(...keys);
  } catch (err: any) {
    console.warn('   ! Redis no disponible; la caché vencerá sola:', err.message);
  }
}

async function main() {
  const regenerate = flag('confirmar');
  const topUp = flag('continuar');
  if (!regenerate && !topUp) {
    console.log('Indica --confirmar (regenerar la demo) o --continuar (agregar interacciones hasta hoy).');
    process.exit(1);
  }
  if (!isLocalDb(config.databaseUrl) && !flag('produccion')) {
    console.log('La base de datos no es local. Si de verdad quieres generar la demo ahí, agrega --produccion.');
    process.exit(1);
  }

  const now = new Date();
  const today = localMidnight(now);

  // Empresa (se crea si no existe).
  // Si hay varias con el mismo nombre, se usa la que tiene más sedes.
  let company = await pool.query<{ id: string }>(
    `SELECT c.id FROM companies c
      WHERE lower(c.name) = lower($1)
      ORDER BY (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.id) DESC, c.created_at ASC
      LIMIT 1`,
    [COMPANY_NAME]
  );
  if (!company.rows[0]) {
    if (topUp) throw new Error(`No existe la empresa "${COMPANY_NAME}". Ejecuta primero con --confirmar.`);
    const slug = COMPANY_NAME.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    company = await pool.query(`INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id`, [COMPANY_NAME, `${slug}-${Date.now().toString(36)}`]);
  }
  const companyId = company.rows[0].id;

  if (topUp) {
    const devs = await pool.query(
      `SELECT d.id, d.location_id, d.target_url, d.mode, l.name
         FROM devices d JOIN locations l ON l.id = d.location_id
        WHERE l.company_id = $1 AND d.status = 'active'`,
      [companyId]
    );
    const last = await pool.query<{ m: Date | null }>(
      `SELECT MAX(se.scanned_at) AS m FROM scan_events se JOIN locations l ON l.id = se.location_id WHERE l.company_id = $1`,
      [companyId]
    );
    const from = last.rows[0].m ? new Date(new Date(last.rows[0].m).getTime() + 1000) : addDays(today, -DAYS);
    seed = Math.floor(from.getTime() / 1000); // otra semilla: no repetir el mismo patrón
    const sizeOf = (name: string) => STORES.find((s) => s.name === name)?.size ?? 1;
    const shareOf = (url: string) => POINTS.find((p) => p.url === url)?.share ?? 0.2;
    const devices: DemoDevice[] = devs.rows.map((d) => ({
      id: d.id,
      locationId: d.location_id,
      storeName: d.name,
      storeSize: sizeOf(d.name),
      url: d.target_url,
      share: shareOf(d.target_url),
      survey: d.mode === 'survey',
    }));
    console.log(`[demo] Agregando interacciones desde ${from.toISOString()} hasta ahora...`);
    const n = await insertScans(devices, from, now, today);
    console.log(`[demo] Listo: ${n} interacciones nuevas para ${COMPANY_NAME}.`);
    return;
  }

  // --- Regenerar ---------------------------------------------------------------
  const old = await pool.query<{ id: string; code: string | null }>(
    `SELECT d.id, d.code FROM devices d JOIN locations l ON l.id = d.location_id WHERE l.company_id = $1`,
    [companyId]
  );
  console.log(`[demo] Empresa: ${COMPANY_NAME}. Se reemplazan sus sedes, ${old.rowCount} puntos NFC y sus datos.`);
  await pool.query(`DELETE FROM campaigns WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM survey_templates WHERE company_id = $1`, [companyId]);
  await pool.query(`DELETE FROM locations WHERE company_id = $1`, [companyId]); // cascada: puntos, interacciones, reputación
  await clearRedis(old.rows.flatMap((d) => [deviceCacheKey(d.id), ...(d.code ? [deviceCacheKey(d.code)] : [])]));

  const devices: DemoDevice[] = [];
  const locations: { id: string; name: string; size: number }[] = [];
  for (const s of STORES) {
    const loc = await pool.query(
      `INSERT INTO locations (name, brand, city, status, company_id, created_at)
       VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
      [s.name, COMPANY_NAME, s.city, companyId, addDays(today, -DAYS - 10).toISOString()]
    );
    const locationId = loc.rows[0].id as string;
    locations.push({ id: locationId, name: s.name, size: s.size });
    const points = SURVEY_STORES.has(s.name)
      ? [...POINTS, { label: 'Encuesta de visita', url: 'https://hogarymoda.com.co', share: 0, survey: true }]
      : POINTS;
    for (const p of points) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO devices (id, code, location_id, label, target_url, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [id, generateShortCode(), locationId, p.label, p.url, addDays(today, -DAYS - 10).toISOString()]
      );
      devices.push({ id, locationId, storeName: s.name, storeSize: s.size, url: p.url, share: p.share, survey: !!p.survey });
    }
  }
  console.log(`[demo] ${STORES.length} sedes y ${devices.length} puntos NFC creados.`);

  for (const c of campaignsFor(today)) {
    await pool.query(
      `INSERT INTO campaigns (company_id, name, starts_on, ends_on, note) VALUES ($1, $2, $3, $4, $5)`,
      [companyId, c.name, iso(c.start), iso(c.end), c.note]
    );
  }
  console.log('[demo] 3 campañas creadas (una en curso).');

  const from = addDays(today, -DAYS);
  const scans = await insertScans(devices, from, now, today);
  const responses = await insertSurvey(companyId, devices, from, now);
  const reps = await insertReputation(locations, today);

  console.log('\n========================================================');
  console.log(` DEMO LISTA · ${COMPANY_NAME}`);
  console.log('========================================================');
  console.log(` Sedes reales:        ${STORES.length}`);
  console.log(` Puntos NFC:          ${devices.length}`);
  console.log(` Interacciones:       ${scans} (${DAYS} días hasta hoy)`);
  console.log(` Respuestas encuesta: ${responses}`);
  console.log(` Mediciones Google:   ${reps}`);
  console.log(` Alertas esperadas:   ${SILENT_STORE} (sin actividad), ${DROP_STORE} y ${SOFT_DROP_STORE} (caídas)`);
  console.log('\n Para mantenerla al día: npm run demo -- --continuar');
}

main()
  .catch((err) => {
    console.error('[demo] Error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
