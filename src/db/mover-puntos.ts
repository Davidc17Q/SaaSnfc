/**
 * Mueve los puntos de una empresa (todas sus sedes) a una sede de otra empresa,
 * conservando id y código corto: los chips y QR ya grabados siguen funcionando
 * y sus próximos toques se registran en la sede nueva. Las interacciones ya
 * registradas se quedan donde estaban.
 *
 * Caso de uso: los habladores de muestra de "Pruebas Hogar y Moda" pasan a
 * "PUNTO DE VENTA JUNÍN PRINCIPAL" de la demo, para que cada toque aparezca en
 * el panel de 27 sedes durante la reunión.
 *
 * Uso:
 *   npx tsx src/db/mover-puntos.ts --de "pruebas hogar" --a "Hogar y Moda" \
 *     --sede "PRINCIPAL" [--produccion]
 *
 * La caché de Redis de cada punto vence sola en máximo 1 hora (antes de eso,
 * un toque puede quedar en la sede vieja).
 */
import { pool } from './pool';
import { redis, dropDeviceCache } from './redis';
import { config } from '../config';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const from = opt('de');
  const to = opt('a');
  const sede = opt('sede');
  if (!from || !to || !sede) throw new Error('Uso: --de "Empresa origen" --a "Empresa destino" --sede "parte del nombre"');
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(config.databaseUrl) && !argv.includes('--produccion')) {
    throw new Error('La base de datos no es local. Si de verdad es producción, agrega --produccion.');
  }

  // Destino: si hay varias empresas con ese nombre, la que tiene más sedes (como demo.ts).
  const dest = await pool.query<{ id: string; name: string }>(
    `SELECT l.id, l.name FROM locations l
      WHERE l.company_id = (
              SELECT c.id FROM companies c WHERE lower(c.name) = lower($1)
               ORDER BY (SELECT COUNT(*) FROM locations x WHERE x.company_id = c.id) DESC, c.created_at
               LIMIT 1)
        AND l.name ILIKE '%' || $2 || '%'`,
    [to, sede]
  );
  if (dest.rows.length !== 1) {
    throw new Error(`Se esperaba una sede "${sede}" en "${to}" y hay ${dest.rows.length}: ${dest.rows.map((r) => r.name).join(', ')}`);
  }
  const target = dest.rows[0];

  // Origen: palabras en orden ("pruebas hogar" ~ "Pruebas Hogar y Moda"); una sola empresa.
  const src = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE name ILIKE $1`, [
    `%${from.trim().split(/\s+/).join('%')}%`,
  ]);
  if (src.rows.length !== 1) {
    throw new Error(`Se esperaba una empresa "${from}" y hay ${src.rows.length}: ${src.rows.map((r) => r.name).join(', ')}`);
  }
  const devs = await pool.query<{ id: string; code: string | null; label: string; target_url: string }>(
    `SELECT d.id, d.code, d.label, d.target_url
       FROM devices d JOIN locations l ON l.id = d.location_id
      WHERE l.company_id = $1
      ORDER BY d.created_at`,
    [src.rows[0].id]
  );
  if (!devs.rows.length) throw new Error(`"${from}" no tiene puntos (¿ya se movieron?).`);

  await pool.query(`UPDATE devices SET location_id = $1, updated_at = now() WHERE id = ANY($2)`, [
    target.id, devs.rows.map((d) => d.id),
  ]);
  await dropDeviceCache(devs.rows.map((d) => ({ device_id: d.id, code: d.code })));
  console.log(`[mover] ${devs.rows.length} punto(s) de "${src.rows[0].name}" → ${to} / ${target.name}:`);
  for (const d of devs.rows) console.log(`   ${d.label.padEnd(28)} /r/${d.code ?? d.id}  →  ${d.target_url}`);
}

main()
  .catch((err) => {
    console.error('[mover] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
