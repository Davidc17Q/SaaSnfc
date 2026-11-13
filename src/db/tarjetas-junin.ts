/**
 * Puntos de muestra de Junín Principal (demo de Hogar y Moda) para la reunión:
 *  - "Prueba ig" pasa a "Prueba canal WhatsApp" y se fija como WhatsApp (su
 *    destino es un bit.ly que la plataforma no puede reconocer).
 *  - Crea "Tarjeta WhatsApp" y "Tarjeta reseñas" con el mismo destino que
 *    "Prueba wpp" y "Prueba google reviews", y "Tarjeta IG" hacia --instagram.
 *
 * Idempotente: si los puntos ya existen, solo actualiza su destino.
 *
 * Uso: npx tsx src/db/tarjetas-junin.ts --instagram https://www.instagram.com/... [--produccion]
 */
import { randomUUID } from 'crypto';
import { pool } from './pool';
import { findCompanyByName } from './find-company';
import { redis, dropDeviceCache } from './redis';
import { config } from '../config';
import { uniqueShortCode } from '../lib/shortcode';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const instagram = (opt('instagram') || '').trim();
  if (!/^https:\/\/(www\.)?instagram\.com\/[^\s]+$/i.test(instagram)) {
    throw new Error('Indica el Instagram: --instagram https://www.instagram.com/usuario/');
  }
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(config.databaseUrl) && !argv.includes('--produccion')) {
    throw new Error('La base de datos no es local. Si de verdad es producción, agrega --produccion.');
  }

  // Junín Principal de la empresa demo. Con varias "Hogar y Moda" (demo y
  // real) no se adivina: --empresa "Nombre exacto" o --empresa-id <id>.
  const company = await findCompanyByName(opt('empresa') || 'Hogar y Moda', opt('empresa-id'));
  if (!company) throw new Error('No se encontró la empresa demo. Indica --empresa "Nombre exacto".');
  const loc = await pool.query<{ id: string; name: string }>(
    `SELECT l.id, l.name FROM locations l WHERE l.company_id = $1 AND l.name ILIKE '%principal%'`,
    [company.id]
  );
  if (loc.rows.length !== 1) throw new Error(`Se esperaba una sede Junín Principal y hay ${loc.rows.length}.`);
  const locationId = loc.rows[0].id;

  const byLabel = async (label: string) =>
    (
      await pool.query<{ id: string; code: string | null; target_url: string }>(
        `SELECT id, code, target_url FROM devices WHERE location_id = $1 AND lower(label) = lower($2)`,
        [locationId, label]
      )
    ).rows[0];

  // 1) Renombrar "Prueba ig" (si ya se renombró, no hace nada).
  const ig = (await byLabel('Prueba ig')) || (await byLabel('Prueba canal WhatsApp'));
  if (!ig) throw new Error('No encontré "Prueba ig" en Junín Principal (¿ya se movieron los habladores?).');
  await pool.query(
    `UPDATE devices SET label = 'Prueba canal WhatsApp', channel = 'WhatsApp', updated_at = now() WHERE id = $1`,
    [ig.id]
  );
  await dropDeviceCache([{ device_id: ig.id, code: ig.code }]);

  // 2) Tarjetas nuevas.
  const wpp = await byLabel('Prueba wpp');
  const reviews = await byLabel('Prueba google reviews');
  if (!wpp || !reviews) throw new Error('Faltan "Prueba wpp" o "Prueba google reviews" en Junín Principal.');
  const cards = [
    { label: 'Tarjeta WhatsApp', url: wpp.target_url },
    { label: 'Tarjeta IG', url: instagram },
    { label: 'Tarjeta reseñas', url: reviews.target_url },
  ];
  for (const c of cards) {
    const prev = await byLabel(c.label);
    if (prev) {
      await pool.query(`UPDATE devices SET target_url = $1, status = 'active', updated_at = now() WHERE id = $2`, [c.url, prev.id]);
      await dropDeviceCache([{ device_id: prev.id, code: prev.code }]);
    } else {
      await pool.query(
        `INSERT INTO devices (id, code, location_id, label, target_url, status) VALUES ($1, $2, $3, $4, $5, 'active')`,
        [randomUUID(), await uniqueShortCode(), locationId, c.label, c.url]
      );
    }
  }

  const list = await pool.query<{ label: string; code: string; target_url: string }>(
    `SELECT label, code, target_url FROM devices
      WHERE location_id = $1 AND (label ILIKE 'Tarjeta %' OR label = 'Prueba canal WhatsApp') ORDER BY label`,
    [locationId]
  );
  console.log(`[tarjetas] ${loc.rows[0].name}:`);
  for (const d of list.rows) {
    console.log(`   ${d.label.padEnd(22)} chip: ${config.publicBaseUrl}/r/${d.code}?s=n   QR: ${config.publicBaseUrl}/r/${d.code}?s=q`);
    console.log(`   ${''.padEnd(22)} → ${d.target_url}`);
  }
}

main()
  .catch((err) => {
    console.error('[tarjetas] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
