import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

/**
 * Aplica src/db/schema.sql (aditivo e idempotente). Se usa al arrancar el
 * servidor y desde `npm run migrate`. Compilado (dist/db) el .sql no se copia,
 * así que se busca también en src/db.
 */
export async function applySchema(): Promise<void> {
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) throw new Error('No se encontró schema.sql');
  console.log('[migrate] Aplicando esquema...');
  await pool.query(readFileSync(file, 'utf-8'));
  console.log('[migrate] Esquema aplicado correctamente.');
}

// Ejecución directa: `npm run migrate`.
if (require.main === module) {
  applySchema()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[migrate] Error:', err);
      process.exit(1);
    });
}
