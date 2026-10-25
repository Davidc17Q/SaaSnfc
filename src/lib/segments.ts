/**
 * Segmento de negocio de cada empresa: decide qué avisos y recomendaciones
 * tienen sentido y con qué palabras se dicen.
 *
 * - chain:        cadena con varias sedes (comparar sedes, personal, campañas).
 * - local:        negocio de una sede con atención al público (reseñas, días flojos).
 * - professional: tarjeta personal o de equipo (contactos, eventos; sin "personal").
 * - institution:  entidad que mide satisfacción (encuestas, representatividad).
 *
 * companies.segment NULL = automático: varias sedes activas → chain; si la
 * mayoría de puntos son encuestas → institution; si no → local. El segmento
 * "professional" no se puede adivinar con fiabilidad: lo elige el superadmin.
 */
import { query } from '../db/pool';

export type Segment = 'chain' | 'local' | 'professional' | 'institution';

export const SEGMENTS: Record<Segment, {
  label: string;
  audience: string; // a quién se refieren los datos ("clientes", "contactos"...)
  staffAdvice: boolean; // tiene sentido aconsejar sobre personal y horarios de atención
  promotions: boolean; // tiene sentido hablar de campañas y promociones
}> = {
  chain: { label: 'Cadena', audience: 'clientes', staffAdvice: true, promotions: true },
  local: { label: 'Negocio local', audience: 'clientes', staffAdvice: true, promotions: true },
  professional: { label: 'Profesional / marca personal', audience: 'contactos', staffAdvice: false, promotions: false },
  institution: { label: 'Institución', audience: 'ciudadanos', staffAdvice: true, promotions: false },
};

export const isSegment = (v: unknown): v is Segment =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(SEGMENTS, v);

/** Segmento efectivo de una empresa (el elegido o el deducido de sus datos). */
export async function companySegment(companyId?: string | null): Promise<Segment> {
  if (!companyId) return 'chain'; // vista de todas las empresas (superadmin)
  try {
    const rows = await query<{ segment: string | null; locs: string; survey: string; points: string }>(
      `SELECT c.segment,
              (SELECT COUNT(*) FROM locations l WHERE l.company_id = c.id AND l.status = 'active') AS locs,
              (SELECT COUNT(*) FROM devices d JOIN locations l ON l.id = d.location_id
                WHERE l.company_id = c.id AND d.mode = 'survey') AS survey,
              (SELECT COUNT(*) FROM devices d JOIN locations l ON l.id = d.location_id
                WHERE l.company_id = c.id) AS points
         FROM companies c WHERE c.id = $1`,
      [companyId]
    );
    const r = rows[0];
    if (!r) return 'local';
    if (isSegment(r.segment)) return r.segment;
    return inferSegment(Number(r.locs), Number(r.survey), Number(r.points));
  } catch {
    return 'local'; // esquema sin la columna: comportamiento prudente
  }
}

export function inferSegment(activeLocations: number, surveyPoints: number, points: number): Segment {
  if (activeLocations >= 2) return 'chain';
  if (points > 0 && surveyPoints / points > 0.5) return 'institution';
  return 'local';
}

// ---------------------------------------------------------------------------
// Vocabulario: cómo se llama cada "sede" en los textos que ve el cliente.
// Cada segmento trae su palabra; la empresa puede cambiarla (unit_one/many).
// ---------------------------------------------------------------------------
export interface Units {
  one: string; // singular en minúscula: "tienda"
  many: string; // plural: "tiendas"
  fem: boolean; // concordancia: "todas activas" / "todos activos"
}

export const DEFAULT_UNITS: Record<Segment, Units> = {
  chain: { one: 'tienda', many: 'tiendas', fem: true },
  local: { one: 'sede', many: 'sedes', fem: true },
  professional: { one: 'tarjeta', many: 'tarjetas', fem: true },
  institution: { one: 'punto de atención', many: 'puntos de atención', fem: false },
};

/** Género por la terminación de la primera palabra (para nombres personalizados). */
function guessFem(word: string): boolean {
  const w = word.trim().split(/\s+/)[0].toLowerCase();
  return /(a|ión|dad|tud)$/.test(w);
}

/** Vocabulario de una empresa: el personalizado si lo tiene, si no el del segmento. */
export function unitsFor(segment: Segment, one?: string | null, many?: string | null): Units {
  const o = (one || '').trim().toLowerCase();
  const m = (many || '').trim().toLowerCase();
  if (o && m) return { one: o, many: m, fem: guessFem(o) };
  return DEFAULT_UNITS[segment];
}

/**
 * Vocabulario de los puntos NFC cuando el informe es de una sola sede: en una
 * tarjeta profesional o una institución cada punto es la tarjeta o el punto
 * de atención; en un comercio, un punto NFC dentro de la tienda.
 */
export function pointUnits(segment: Segment, units: Units): Units {
  return segment === 'professional' || segment === 'institution'
    ? units
    : { one: 'punto NFC', many: 'puntos NFC', fem: false };
}

export async function companyUnits(companyId: string | null | undefined, segment: Segment): Promise<Units> {
  if (!companyId) return DEFAULT_UNITS[segment];
  try {
    const r = await query<{ unit_one: string | null; unit_many: string | null }>(
      `SELECT unit_one, unit_many FROM companies WHERE id = $1`,
      [companyId]
    );
    return unitsFor(segment, r[0]?.unit_one, r[0]?.unit_many);
  } catch {
    return DEFAULT_UNITS[segment];
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
