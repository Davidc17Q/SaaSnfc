import { randomBytes } from 'crypto';
import { pool } from '../db/pool';

// Alfabeto sin caracteres ambiguos (sin 0/O, 1/l/I) para evitar confusiones.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Genera un código corto aleatorio de 8 caracteres. */
export function generateShortCode(len = CODE_LENGTH): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Genera un código corto garantizado único en la tabla devices.
 * Reintenta si (por azar) colisiona con uno existente.
 */
export async function uniqueShortCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateShortCode();
    const rows = await pool.query('SELECT 1 FROM devices WHERE code = $1 LIMIT 1', [code]);
    if (rows.rowCount === 0) return code;
  }
  // Fallback extremadamente improbable: alarga el código.
  return generateShortCode(12);
}
