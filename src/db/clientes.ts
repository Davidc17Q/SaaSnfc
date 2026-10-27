/**
 * Ajustes puntuales de clientes reales (28 oct 2026):
 *
 *  1. La Lico: borra sus interacciones y deja solo 3 puntos (reseñas,
 *     WhatsApp, Instagram). Reutiliza los puntos que ya existen con el mismo
 *     destino para que los chips ya grabados sigan funcionando; borra el resto.
 *     También enlaza la sede con su ficha de Google (competencia/reputación).
 *  2. Río Vivo: crea (o actualiza) "Mesa 1" … "Mesa 10", cada uno hacia el
 *     linktree con ?mesa=N para que el pedido por WhatsApp diga la mesa.
 *
 * Uso:
 *   npm run clientes -- --linktree https://riovivo.netlify.app [--produccion]
 *
 * Es idempotente: se puede correr dos veces sin duplicar puntos. Contra una
 * base que no sea local exige --produccion (scripts/clientes-produccion.ps1).
 * La caché de Redis de los puntos editados vence sola en máximo 1 hora.
 */
import { randomUUID } from 'crypto';
import { pool } from './pool';
import { redis, dropDeviceCache } from './redis';
import { config } from '../config';
import { detectChannel } from '../lib/channel';
import { uniqueShortCode } from '../lib/shortcode';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const LALICO_POINTS = [
  { label: 'Reseñas en Google', url: 'https://search.google.com/local/writereview?placeid=ChIJ5TbjEs2DRo4RUWSHXW-IOkM' },
  { label: 'WhatsApp', url: 'https://wa.me/573005545711?text=Hola%20La%20Lico%2C%20quiero%20hacer%20un%20pedido' },
  { label: 'Instagram', url: 'https://www.instagram.com/lalico.virtual/' },
];
const LALICO_PLACE = { id: 'ChIJ5TbjEs2DRo4RUWSHXW-IOkM', name: 'La Lico - Licores & Snacks' };
const MESAS = 10;

/** Única sede de la empresa cuyo nombre contiene `pattern`; falla si hay 0 o varias. */
async function onlyLocation(pattern: string): Promise<{ id: string; name: string; company: string }> {
  const r = await pool.query<{ id: string; name: string; company: string }>(
    `SELECT l.id, l.name, c.name AS company FROM locations l JOIN companies c ON c.id = l.company_id
      WHERE c.name ILIKE $1 AND l.status = 'active' ORDER BY l.created_at`,
    [pattern]
  );
  if (r.rows.length !== 1) {
    const found = r.rows.map((x) => `${x.company} / ${x.name}`).join('; ') || 'ninguna';
    throw new Error(`Se esperaba una sola sede para "${pattern}" y hay: ${found}`);
  }
  return r.rows[0];
}

async function createDevice(locationId: string, label: string, url: string) {
  await pool.query(
    `INSERT INTO devices (id, code, location_id, label, target_url, status) VALUES ($1, $2, $3, $4, $5, 'active')`,
    [randomUUID(), await uniqueShortCode(), locationId, label, url]
  );
}

async function lalico() {
  const loc = await onlyLocation('%lico%');
  console.log(`[La Lico] Sede: ${loc.company} / ${loc.name}`);
  const del = await pool.query(`DELETE FROM scan_events WHERE location_id = $1`, [loc.id]);
  console.log(`[La Lico] ${del.rowCount} interacciones borradas.`);

  const devs = await pool.query<{ id: string; code: string | null; target_url: string }>(
    `SELECT id, code, target_url FROM devices WHERE location_id = $1 ORDER BY created_at`,
    [loc.id]
  );
  const free = [...devs.rows];
  for (const p of LALICO_POINTS) {
    // Reutiliza un punto con el mismo tipo de destino (sus chips siguen sirviendo).
    const i = free.findIndex((d) => detectChannel(d.target_url) === detectChannel(p.url));
    if (i >= 0) {
      const [d] = free.splice(i, 1);
      await pool.query(
        `UPDATE devices SET label = $1, target_url = $2, status = 'active', mode = 'redirect', channel = NULL, updated_at = now()
          WHERE id = $3`,
        [p.label, p.url, d.id]
      );
      console.log(`[La Lico] Actualizado: ${p.label} (código ${d.code})`);
    } else {
      await createDevice(loc.id, p.label, p.url);
      console.log(`[La Lico] Creado: ${p.label}`);
    }
  }
  if (free.length) {
    await pool.query(`DELETE FROM devices WHERE id = ANY($1)`, [free.map((d) => d.id)]);
    console.log(`[La Lico] ${free.length} punto(s) sobrante(s) borrado(s): ${free.map((d) => d.code).join(', ')}`);
  }
  await dropDeviceCache(devs.rows.map((d) => ({ device_id: d.id, code: d.code })));
  await pool.query(`UPDATE locations SET google_place_id = $1, google_place_name = $2 WHERE id = $3`, [
    LALICO_PLACE.id, LALICO_PLACE.name, loc.id,
  ]);
  console.log(`[La Lico] Enlazada con su ficha de Google.`);
}

async function riovivo(linktree: string) {
  const loc = await onlyLocation('%r_o%vivo%');
  console.log(`[Río Vivo] Sede: ${loc.company} / ${loc.name}`);
  const base = new URL(linktree);
  for (let n = 1; n <= MESAS; n++) {
    const u = new URL(base.toString());
    u.searchParams.set('mesa', String(n));
    const label = `Mesa ${n}`;
    const upd = await pool.query<{ id: string; code: string | null }>(
      `UPDATE devices SET target_url = $1, status = 'active', updated_at = now()
        WHERE location_id = $2 AND label = $3 RETURNING id, code`,
      [u.toString(), loc.id, label]
    );
    if (upd.rows.length) await dropDeviceCache(upd.rows.map((d) => ({ device_id: d.id, code: d.code })));
    else await createDevice(loc.id, label, u.toString());
  }
  const list = await pool.query<{ label: string; code: string; target_url: string }>(
    `SELECT label, code, target_url FROM devices WHERE location_id = $1 AND label ~ '^Mesa [0-9]+$'
      ORDER BY substring(label from 6)::int`,
    [loc.id]
  );
  for (const d of list.rows) console.log(`[Río Vivo] ${d.label.padEnd(8)} /r/${d.code}  →  ${d.target_url}`);
}

async function main() {
  const linktree = opt('linktree');
  if (!linktree || !/^https:\/\//.test(linktree)) {
    throw new Error('Indica la dirección del linktree de Río Vivo: --linktree https://….netlify.app');
  }
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(config.databaseUrl) && !argv.includes('--produccion')) {
    throw new Error('La base de datos no es local. Si de verdad es producción, agrega --produccion.');
  }
  await lalico();
  await riovivo(linktree);
  console.log(`\nListo. Enlaces de los chips: ${config.publicBaseUrl}/r/<código>`);
}

main()
  .catch((err) => {
    console.error('[clientes] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
