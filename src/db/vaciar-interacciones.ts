/**
 * Borra las interacciones (scan_events) de UNA empresa. No toca sus sedes, sus
 * puntos (los chips y QR siguen funcionando), sus encuestas ni su reputación.
 *
 * Sin --confirmar solo muestra qué borraría.
 *
 * Uso:
 *   npx tsx src/db/vaciar-interacciones.ts --empresa "r_o vivo" [--confirmar] [--produccion]
 *
 * --empresa son palabras en orden (ILIKE; "_" vale por una letra, útil para la
 * tilde) y debe coincidir con una sola empresa.
 */
import { pool } from './pool';
import { redis } from './redis';
import { config } from '../config';

const argv = process.argv.slice(2);
const i = argv.indexOf('--empresa');
const empresa = i >= 0 ? argv[i + 1] : undefined;

async function main() {
  if (!empresa) throw new Error('Indica la empresa: --empresa "palabras del nombre"');
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(config.databaseUrl) && !argv.includes('--produccion')) {
    throw new Error('La base de datos no es local. Si de verdad es producción, agrega --produccion.');
  }

  const co = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE name ILIKE $1`, [
    `%${empresa.trim().split(/\s+/).join('%')}%`,
  ]);
  if (co.rows.length !== 1) {
    throw new Error(`Se esperaba una empresa para "${empresa}" y hay ${co.rows.length}: ${co.rows.map((c) => c.name).join(', ')}`);
  }
  const { id, name } = co.rows[0];

  const scope = `location_id IN (SELECT id FROM locations WHERE company_id = $1)`;
  const stats = await pool.query<{ n: string; desde: string | null; hasta: string | null }>(
    `SELECT COUNT(*) AS n, to_char(MIN(scanned_at), 'YYYY-MM-DD') AS desde, to_char(MAX(scanned_at), 'YYYY-MM-DD') AS hasta
       FROM scan_events WHERE ${scope}`,
    [id]
  );
  const { n, desde, hasta } = stats.rows[0];
  console.log(`[vaciar] Empresa: ${name}`);
  console.log(`[vaciar] Interacciones: ${n}${desde ? ` (del ${desde} al ${hasta})` : ''}`);

  if (!argv.includes('--confirmar')) {
    console.log('[vaciar] No se borró nada (falta --confirmar).');
    return;
  }
  const del = await pool.query(`DELETE FROM scan_events WHERE ${scope}`, [id]);
  console.log(`[vaciar] ${del.rowCount} interacciones borradas. Los puntos siguen funcionando.`);
}

main()
  .catch((err) => {
    console.error('[vaciar] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
