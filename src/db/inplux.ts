/**
 * Crea las 6 tarjetas del equipo de Inplux: un punto por integrante, con su
 * nombre. Desde el 12 nov 2026 cada una abre el perfil digital de su dueño
 * (/perfiles/inplux/?p=…, servido por NFCloud); la de Santiago va a inplux.co.
 *
 * Usa la empresa que ya existe en la plataforma (nombre con "inplux"). Si la
 * empresa todavía no tiene sede, crea una llamada "Equipo".
 *
 * Uso:
 *   npm run inplux [-- --produccion] [--reiniciar]
 *
 * --reiniciar borra los escaneos y respuestas de Inplux (deja todo en cero
 * después de las pruebas); los puntos y sus códigos no se tocan.
 *
 * Es idempotente: si un punto con ese nombre ya existe, solo actualiza su
 * destino (conserva su código, así los chips ya grabados siguen sirviendo).
 * Contra una base que no sea local exige --produccion (scripts/inplux-produccion.ps1).
 */
import { randomUUID } from 'crypto';
import { pool } from './pool';
import { redis, dropDeviceCache } from './redis';
import { config } from '../config';
import { uniqueShortCode } from '../lib/shortcode';

const WEB = 'https://inplux.co/';
const perfil = (id: string) => `${config.publicBaseUrl}/perfiles/inplux/?p=${id}`;
/** Nombre del punto (el de la tarjeta) → destino. */
const EQUIPO: [string, string][] = [
  ['Jaime Cano', perfil('jaime')],
  ['Cristian Espinal', perfil('cristian')],
  ['Alejandro López', perfil('alejandro')],
  ['Daniel López', perfil('daniel')],
  ['Cristian Ajavi', perfil('ajavi')],
  ['Santiago Jiménez', WEB],
];
const NOMBRES = EQUIPO.map(([nombre]) => nombre);

/** Única empresa cuyo nombre contiene "inplux"; falla si hay 0 o varias. */
async function empresa(): Promise<{ id: string; name: string }> {
  const r = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM companies WHERE name ILIKE '%inplux%' ORDER BY created_at`
  );
  if (r.rows.length !== 1) {
    const found = r.rows.map((c) => c.name).join('; ') || 'ninguna';
    throw new Error(`Se esperaba una sola empresa Inplux y hay: ${found}. Créala primero desde el panel.`);
  }
  return r.rows[0];
}

/** Sede activa de la empresa; si no tiene ninguna, crea "Equipo". Falla si hay varias. */
async function sede(companyId: string, companyName: string): Promise<{ id: string; name: string }> {
  const r = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM locations WHERE company_id = $1 AND status = 'active' ORDER BY created_at`,
    [companyId]
  );
  if (r.rows.length === 1) return r.rows[0];
  if (r.rows.length > 1) {
    throw new Error(`Inplux tiene varias sedes (${r.rows.map((l) => l.name).join('; ')}); indica cuál usar.`);
  }
  const id = randomUUID();
  await pool.query(
    `INSERT INTO locations (id, name, brand, city, status, company_id) VALUES ($1, 'Equipo', $2, 'Medellín', 'active', $3)`,
    [id, companyName, companyId]
  );
  console.log(`[Inplux] Sede "Equipo" creada.`);
  return { id, name: 'Equipo' };
}

async function main() {
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(config.databaseUrl) && !process.argv.includes('--produccion')) {
    throw new Error('La base de datos no es local. Si de verdad es producción, agrega --produccion.');
  }
  const c = await empresa();
  const loc = await sede(c.id, c.name);
  console.log(`[Inplux] Empresa: ${c.name} / Sede: ${loc.name}`);

  if (process.argv.includes('--reiniciar')) {
    // Deja las interacciones en cero (escaneos de prueba y respuestas), solo de Inplux.
    const sedes = `SELECT id FROM locations WHERE company_id = $1`;
    const scans = await pool.query(`DELETE FROM scan_events WHERE location_id IN (${sedes})`, [c.id]);
    const resp = await pool.query(`DELETE FROM survey_responses WHERE location_id IN (${sedes})`, [c.id]);
    console.log(`[Inplux] Interacciones en cero: ${scans.rowCount} escaneos y ${resp.rowCount} respuestas borrados.`);
  }

  for (const [nombre, destino] of EQUIPO) {
    const upd = await pool.query<{ id: string; code: string | null }>(
      `UPDATE devices SET target_url = $1, status = 'active', updated_at = now()
        WHERE location_id = $2 AND label = $3 RETURNING id, code`,
      [destino, loc.id, nombre]
    );
    if (upd.rows.length) {
      await dropDeviceCache(upd.rows.map((d) => ({ device_id: d.id, code: d.code })));
    } else {
      await pool.query(
        `INSERT INTO devices (id, code, location_id, label, target_url, status) VALUES ($1, $2, $3, $4, $5, 'active')`,
        [randomUUID(), await uniqueShortCode(), loc.id, nombre, destino]
      );
    }
  }

  const list = await pool.query<{ label: string; code: string }>(
    `SELECT label, code FROM devices WHERE location_id = $1 AND label = ANY($2)`,
    [loc.id, NOMBRES]
  );
  const porNombre = new Map(list.rows.map((d) => [d.label, d.code]));
  console.log(`\nEnlace para grabar en cada chip (y para su QR)  →  a dónde lleva:`);
  for (const [nombre, destino] of EQUIPO) {
    console.log(`  ${nombre.padEnd(18)} ${config.publicBaseUrl}/r/${porNombre.get(nombre)}  →  ${destino}`);
  }
}

main()
  .catch((err) => {
    // Si no conecta con Postgres, pg lanza un AggregateError sin mensaje: muestra su código.
    console.error('[inplux] Error:', err.message || err.code || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    redis.disconnect();
  });
