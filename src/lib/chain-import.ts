/**
 * Alta masiva de una cadena desde una hoja de sedes (CSV exportado de Excel).
 *
 * Dos pasos sobre la misma lógica: `planImport` arma el plan (qué se crea, qué
 * se actualiza, qué está mal) sin escribir nada, y `applyImport` lo ejecuta en
 * una sola transacción. Volver a cargar la hoja es seguro: las sedes se
 * reconocen por su nombre normalizado (`import_key`) y los puntos por su papel
 * (`role`); nunca se cambia el código de un punto existente, así que los chips
 * ya grabados siguen funcionando.
 */
import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { dropDeviceCache } from '../db/redis';
import { isSafeTarget } from './channel';
import { generateShortCode } from './shortcode';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Lee un CSV (Excel en español usa ";"; también admite "," y tabulador). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = count(';') >= count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

/** Minúsculas, sin tildes y con un solo espacio: para comparar nombres. */
export function normalizeKey(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Columnas de la hoja y los encabezados que se aceptan para cada una. */
const COLUMNS: Record<string, string[]> = {
  sede: ['sede', 'nombre', 'nombre de la sede', 'tienda', 'almacen', 'punto de venta'],
  ciudad: ['ciudad', 'municipio'],
  direccion: ['direccion', 'direccion de la sede'],
  lote: ['lote', 'lote de instalacion'],
  ficha_google: ['ficha google', 'ficha', 'ficha de google', 'enlace de la ficha de google', 'enlace ficha google', 'enlace de resenas', 'google'],
  whatsapp_credito: ['whatsapp credito', 'whatsapp de credito', 'credito', 'celular de credito'],
};
export const SHEET_COLUMNS = Object.keys(COLUMNS);

// ---------------------------------------------------------------------------
// Plantilla de puntos
// ---------------------------------------------------------------------------

export interface PointTemplate {
  role: string; // identificador estable: resenas, credito, canal…
  label: string; // etiqueta visible del punto
  type: 'column_url' | 'column_whatsapp' | 'fixed';
  column?: string; // columna de la hoja (tipos column_*)
  url?: string; // destino fijo (tipo fixed)
  message?: string; // texto inicial del chat (column_whatsapp)
  fallback?: string; // destino provisional si la sede no trae el dato
}

/** Plantilla de Hogar y Moda: reseñas, crédito y canal de WhatsApp. */
export const DEFAULT_TEMPLATE: PointTemplate[] = [
  { role: 'resenas', label: 'Reseñas', type: 'column_url', column: 'ficha_google' },
  { role: 'credito', label: 'Crédito', type: 'column_whatsapp', column: 'whatsapp_credito', message: 'Hola, quiero información de crédito.' },
  { role: 'canal', label: 'Canal de WhatsApp', type: 'fixed', url: '' },
];

export function cleanTemplate(raw: unknown): PointTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: PointTemplate[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const type = (p as any).type;
    if (type !== 'column_url' && type !== 'column_whatsapp' && type !== 'fixed') continue;
    const role = normalizeKey(String((p as any).role || '')).replace(/ /g, '_').slice(0, 30);
    const label = String((p as any).label || '').trim().slice(0, 60);
    if (!role || !label) continue;
    out.push({
      role,
      label,
      type,
      column: SHEET_COLUMNS.includes((p as any).column) ? (p as any).column : undefined,
      url: String((p as any).url || '').trim() || undefined,
      message: String((p as any).message || '').trim().slice(0, 200) || undefined,
      fallback: String((p as any).fallback || '').trim() || undefined,
    });
  }
  return out;
}

/** Celular colombiano o internacional → solo dígitos con indicativo; null si no sirve. */
export function whatsappNumber(raw: string): string | null {
  const d = (raw || '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  if (d.length >= 11 && d.length <= 15 && (raw.trim().startsWith('+') || raw.trim().startsWith('00'))) return d.replace(/^00/, '');
  return null;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlanPoint {
  role: string;
  label: string;
  url: string;
  action: 'create' | 'update' | 'same';
  code: string | null; // código existente (nunca cambia)
  deviceId: string | null;
  provisional: boolean;
}
export interface PlanRow {
  line: number; // fila en la hoja (1 = encabezado)
  name: string;
  city: string;
  address: string;
  batch: string;
  action: 'create' | 'update' | 'same';
  errors: string[];
  warnings: string[];
  points: PlanPoint[];
  locationId: string | null;
  key: string;
}
export interface ImportPlan {
  ok: boolean;
  fatal: string | null; // problema de la hoja o de la plantilla completa
  rows: PlanRow[];
  summary: {
    rows: number; create: number; update: number; same: number; withErrors: number; withWarnings: number;
    pointsCreate: number; pointsUpdate: number;
  };
  missing: string[]; // sedes de la empresa que no vienen en la hoja (no se tocan)
  unknownColumns: string[];
}

const emptySummary = () => ({ rows: 0, create: 0, update: 0, same: 0, withErrors: 0, withWarnings: 0, pointsCreate: 0, pointsUpdate: 0 });

export async function planImport(companyId: string, csv: string, template: PointTemplate[]): Promise<ImportPlan> {
  const plan: ImportPlan = { ok: false, fatal: null, rows: [], summary: emptySummary(), missing: [], unknownColumns: [] };
  const fail = (msg: string) => {
    plan.fatal = msg;
    return plan;
  };

  if (!template.length) return fail('Elige al menos un punto por sede.');
  const roles = new Set<string>();
  for (const p of template) {
    if (roles.has(p.role)) return fail(`La plantilla repite el punto "${p.label}".`);
    roles.add(p.role);
    if (p.type === 'fixed') {
      if (!p.url) return fail(`Falta el enlace del punto "${p.label}" (es el mismo para todas las sedes).`);
      if (!isSafeTarget(p.url)) return fail(`El enlace del punto "${p.label}" no es válido.`);
    } else if (!p.column) return fail(`El punto "${p.label}" no tiene columna de la hoja.`);
    if (p.fallback && !isSafeTarget(p.fallback)) return fail(`El destino provisional de "${p.label}" no es válido.`);
  }

  const table = parseCsv(csv);
  if (table.length < 2) return fail('La hoja está vacía: necesita la fila de encabezados y al menos una sede.');
  if (table.length > 2001) return fail('La hoja tiene más de 2.000 filas.');

  // Encabezados → columnas conocidas.
  const header = table[0].map(normalizeKey);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const col = SHEET_COLUMNS.find((c) => COLUMNS[c].includes(h) || normalizeKey(c.replace(/_/g, ' ')) === h);
    if (col && idx[col] === undefined) idx[col] = i;
    else if (h) plan.unknownColumns.push(table[0][i]);
  });
  const needed = ['sede', 'ciudad', ...template.filter((p) => p.type !== 'fixed').map((p) => p.column as string)];
  const absent = [...new Set(needed)].filter((c) => idx[c] === undefined);
  if (absent.length) return fail(`Faltan columnas en la hoja: ${absent.join(', ')}. Encabezados esperados: ${SHEET_COLUMNS.join('; ')}.`);

  // Estado actual de la empresa.
  const co = await pool.query(`SELECT id FROM companies WHERE id = $1`, [companyId]);
  if (!co.rowCount) return fail('La empresa no existe.');
  const locs = await pool.query<{ id: string; name: string; city: string; address: string | null; batch: string | null; import_key: string | null }>(
    `SELECT id, name, city, address, batch, import_key FROM locations WHERE company_id = $1`,
    [companyId]
  );
  const devs = await pool.query<{ id: string; location_id: string; role: string | null; label: string; target_url: string; code: string | null }>(
    `SELECT d.id, d.location_id, d.role, d.label, d.target_url, d.code
       FROM devices d JOIN locations l ON l.id = d.location_id WHERE l.company_id = $1`,
    [companyId]
  );
  const locByKey = new Map<string, (typeof locs.rows)[number]>();
  for (const l of locs.rows) locByKey.set(l.import_key || normalizeKey(l.name), l);

  const get = (r: string[], col: string) => (idx[col] === undefined ? '' : (r[idx[col]] || '').trim());
  const seen = new Map<string, PlanRow>();

  table.slice(1).forEach((r, i) => {
    const row: PlanRow = {
      line: i + 2,
      name: get(r, 'sede').slice(0, 120),
      city: get(r, 'ciudad').slice(0, 80),
      address: get(r, 'direccion').slice(0, 200),
      batch: get(r, 'lote').slice(0, 30),
      action: 'create',
      errors: [],
      warnings: [],
      points: [],
      locationId: null,
      key: '',
    };
    row.key = normalizeKey(row.name);
    if (!row.name) row.errors.push('Falta el nombre de la sede.');
    if (!row.city) row.errors.push('Falta la ciudad.');
    if (row.key) {
      const dup = seen.get(row.key);
      if (dup) {
        row.errors.push(`Sede repetida: es la misma de la fila ${dup.line}.`);
        if (!dup.errors.some((e) => e.startsWith('Sede repetida'))) dup.errors.push(`Sede repetida: también está en la fila ${row.line}.`);
      } else seen.set(row.key, row);
    }

    const existing = row.key ? locByKey.get(row.key) : undefined;
    row.locationId = existing?.id ?? null;
    const existingDevs = existing ? devs.rows.filter((d) => d.location_id === existing.id) : [];

    for (const p of template) {
      let url = '';
      let provisional = false;
      if (p.type === 'fixed') url = p.url as string;
      else {
        const raw = get(r, p.column as string);
        if (!raw) {
          if (p.fallback) {
            url = p.fallback;
            provisional = true;
            row.warnings.push(`${p.label}: sin dato en la hoja; queda con el destino provisional.`);
          } else row.errors.push(`${p.label}: la columna ${p.column} está vacía.`);
        } else if (p.type === 'column_whatsapp') {
          const n = whatsappNumber(raw);
          if (!n) row.errors.push(`${p.label}: "${raw.slice(0, 30)}" no es un celular válido.`);
          else url = `https://wa.me/${n}${p.message ? `?text=${encodeURIComponent(p.message)}` : ''}`;
        } else if (!/^https?:\/\//i.test(raw) || !isSafeTarget(raw)) {
          row.errors.push(`${p.label}: "${raw.slice(0, 40)}" no es un enlace válido (debe empezar por https://).`);
        } else url = raw;
      }
      const dev = existingDevs.find((d) => d.role === p.role) ||
        existingDevs.find((d) => !d.role && normalizeKey(d.label) === normalizeKey(p.label));
      row.points.push({
        role: p.role,
        label: p.label,
        url,
        provisional,
        code: dev?.code ?? null,
        deviceId: dev?.id ?? null,
        action: !dev ? 'create' : url && dev.target_url !== url ? 'update' : 'same',
      });
    }

    if (existing) {
      const changed =
        existing.name !== row.name || existing.city !== row.city ||
        (existing.address || '') !== row.address || (existing.batch || '') !== row.batch ||
        row.points.some((p) => p.action !== 'same');
      row.action = changed ? 'update' : 'same';
    }
    plan.rows.push(row);
  });

  const keys = new Set(plan.rows.map((r) => r.key));
  plan.missing = locs.rows.filter((l) => !keys.has(l.import_key || normalizeKey(l.name))).map((l) => l.name);

  const s = plan.summary;
  s.rows = plan.rows.length;
  for (const r of plan.rows) {
    if (r.errors.length) s.withErrors++;
    else {
      s[r.action]++;
      for (const p of r.points) {
        if (p.action === 'create') s.pointsCreate++;
        else if (p.action === 'update') s.pointsUpdate++;
      }
    }
    if (r.warnings.length) s.withWarnings++;
  }
  plan.ok = s.withErrors === 0;
  return plan;
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

async function freshCode(client: PoolClient, taken: Set<string>): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateShortCode();
    if (taken.has(code)) continue;
    const r = await client.query('SELECT 1 FROM devices WHERE code = $1', [code]);
    if (!r.rowCount) {
      taken.add(code);
      return code;
    }
  }
  return generateShortCode(12);
}

export interface ImportResult {
  locationsCreated: number;
  locationsUpdated: number;
  pointsCreated: number;
  pointsUpdated: number;
}

/** Ejecuta el plan en una transacción. Lanza si el plan trae errores. */
export async function applyImport(companyId: string, csv: string, template: PointTemplate[]): Promise<ImportResult> {
  const plan = await planImport(companyId, csv, template);
  if (plan.fatal) throw Object.assign(new Error(plan.fatal), { statusCode: 400 });
  if (!plan.ok) throw Object.assign(new Error('La hoja tiene errores: corrígelos y vuelve a cargarla.'), { statusCode: 400 });

  const result: ImportResult = { locationsCreated: 0, locationsUpdated: 0, pointsCreated: 0, pointsUpdated: 0 };
  const changedDevices: { device_id: string; code: string | null }[] = [];
  const taken = new Set<string>();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Una sola carga a la vez por empresa.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`import:${companyId}`]);
    const co = await client.query<{ name: string }>(`SELECT name FROM companies WHERE id = $1 FOR UPDATE`, [companyId]);
    if (!co.rowCount) throw Object.assign(new Error('La empresa no existe.'), { statusCode: 404 });
    const brand = co.rows[0].name;

    for (const row of plan.rows) {
      let locationId = row.locationId;
      if (!locationId) {
        const ins = await client.query(
          `INSERT INTO locations (name, brand, city, address, batch, import_key, status, company_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING id`,
          [row.name, brand, row.city, row.address || null, row.batch || null, row.key, companyId]
        );
        locationId = ins.rows[0].id as string;
        result.locationsCreated++;
      } else if (row.action !== 'same') {
        await client.query(
          `UPDATE locations SET name = $1, city = $2, address = $3, batch = $4, import_key = $5 WHERE id = $6 AND company_id = $7`,
          [row.name, row.city, row.address || null, row.batch || null, row.key, locationId, companyId]
        );
        result.locationsUpdated++;
      } else {
        await client.query(`UPDATE locations SET import_key = $1 WHERE id = $2 AND import_key IS NULL`, [row.key, locationId]);
      }

      for (const p of row.points) {
        if (p.action === 'create') {
          const code = await freshCode(client, taken);
          await client.query(
            `INSERT INTO devices (location_id, label, target_url, status, code, role) VALUES ($1, $2, $3, 'active', $4, $5)`,
            [locationId, p.label, p.url, code, p.role]
          );
          result.pointsCreated++;
        } else {
          // Punto existente: conserva su código; solo cambia el papel y, si
          // hace falta, el destino.
          const upd = await client.query<{ id: string; code: string | null }>(
            `UPDATE devices SET role = $1,
                    target_url = CASE WHEN $2 THEN $3 ELSE target_url END,
                    updated_at = CASE WHEN $2 THEN now() ELSE updated_at END
              WHERE id = $4 AND location_id = $5
              RETURNING id, code`,
            [p.role, p.action === 'update', p.url, p.deviceId, locationId]
          );
          if (p.action === 'update' && upd.rows[0]) {
            changedDevices.push({ device_id: upd.rows[0].id, code: upd.rows[0].code });
            result.pointsUpdated++;
          }
        }
      }
    }
    await client.query(`UPDATE companies SET import_template = $1::jsonb WHERE id = $2`, [JSON.stringify(template), companyId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  // Destinos cambiados: la caché del motor /r/ se borra para que rija ya.
  await dropDeviceCache(changedDevices);
  return result;
}
