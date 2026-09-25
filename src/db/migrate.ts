import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  console.log('[migrate] Aplicando esquema...');
  await pool.query(sql);
  console.log('[migrate] Esquema aplicado correctamente.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
