import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  // Si la base no responde, fallar pronto en vez de dejar peticiones colgadas;
  // y que una consulta pesada del panel no acapare conexiones que usa /r/.
  connectionTimeoutMillis: 8000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '60000', 10),
  // Conexión desde fuera de Railway (proxy público) exige SSL. La app en Railway
  // usa la red interna y no define DB_SSL, así que no cambia su comportamiento.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
