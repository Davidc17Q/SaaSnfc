/**
 * Competencia en Google: calificación y número de reseñas de la sede y de sus
 * competidores, con Places API (New). Sin dependencias (fetch).
 *
 * Variable de entorno: GOOGLE_PLACES_API_KEY (ver documentos/COMPETENCIA-GOOGLE.md).
 * Sin ella, la función no se muestra y nada cambia.
 *
 * AVISO: las condiciones de Google Maps Platform restringen guardar datos de
 * Places (solo el place_id se puede conservar indefinidamente). Aquí se guarda
 * una medición semanal para mostrar la evolución; está pensado como demo y se
 * decide con el cliente si se mantiene (ver la guía).
 *
 * Costo: Place Details con rating/userRatingCount es nivel Enterprise (1.000
 * llamadas gratis al mes). Una medición por lugar cada 7 días ≈ 17 llamadas al
 * mes por sede con 3 competidores.
 */
import { pool, query } from '../db/pool';

const API = 'https://places.googleapis.com/v1';
/** Días mínimos entre dos mediciones automáticas del mismo lugar. */
export const REFRESH_DAYS = 7;

const key = () => (process.env.GOOGLE_PLACES_API_KEY || '').trim();
export const isPlacesEnabled = () => !!key();

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
}

async function call(path: string, init: { method?: string; body?: unknown; fields: string }): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key(),
        'X-Goog-FieldMask': init.fields,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Google respondió ${res.status}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

const toResult = (p: any): PlaceResult => ({
  placeId: p.id,
  name: p.displayName?.text || '',
  address: p.formattedAddress || p.shortFormattedAddress || '',
  rating: typeof p.rating === 'number' ? p.rating : null,
  reviewCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
});

/** Busca negocios por texto ("Hogar y Moda La Playa Medellín"). Hasta 8. */
export async function searchPlaces(text: string): Promise<PlaceResult[]> {
  const data = await call('/places:searchText', {
    method: 'POST',
    body: { textQuery: text, languageCode: 'es', regionCode: 'CO', pageSize: 8 },
    fields: 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
  });
  return (data.places || []).map(toResult);
}

/** Calificación y reseñas actuales de un lugar. */
export async function fetchPlace(placeId: string): Promise<PlaceResult> {
  const data = await call(`/places/${encodeURIComponent(placeId)}`, {
    fields: 'id,displayName,formattedAddress,rating,userRatingCount',
  });
  return toResult(data);
}

/**
 * Guarda la medición de hoy de un lugar. Si es la ficha propia de una sede,
 * también alimenta reputation_snapshots (source='google') sin pisar lo que se
 * haya registrado a mano ese día.
 */
async function saveSnapshot(p: PlaceResult): Promise<void> {
  if (p.rating === null) return;
  await pool.query(
    `INSERT INTO place_snapshots (place_id, rating, review_count, measured_on)
     VALUES ($1, $2, $3, CURRENT_DATE)
     ON CONFLICT (place_id, measured_on) DO UPDATE SET rating = EXCLUDED.rating, review_count = EXCLUDED.review_count`,
    [p.placeId, p.rating, p.reviewCount ?? 0]
  );
  await pool.query(
    `INSERT INTO reputation_snapshots (location_id, rating, review_count, measured_on, source)
     SELECT id, $2, $3, CURRENT_DATE, 'google' FROM locations WHERE google_place_id = $1
     ON CONFLICT (location_id, measured_on) DO UPDATE
       SET rating = EXCLUDED.rating, review_count = EXCLUDED.review_count
       WHERE reputation_snapshots.source = 'google'`,
    [p.placeId, Math.round(p.rating * 10) / 10, p.reviewCount ?? 0]
  );
}

/** Mide ya un lugar (al enlazarlo o con "Actualizar ahora"). */
export async function refreshPlace(placeId: string): Promise<PlaceResult> {
  const p = await fetchPlace(placeId);
  await saveSnapshot(p);
  return p;
}

/** Lugares de una sede: su ficha propia y sus competidores. */
export async function locationPlaceIds(locationId: string): Promise<string[]> {
  const rows = await query<{ place_id: string }>(
    `SELECT google_place_id AS place_id FROM locations WHERE id = $1 AND google_place_id IS NOT NULL
     UNION SELECT place_id FROM location_competitors WHERE location_id = $1`,
    [locationId]
  );
  return rows.map((r) => r.place_id);
}

/**
 * Pasada del worker: mide los lugares cuya última medición tiene más de
 * REFRESH_DAYS días (o que nunca se midieron). Solo empresas que no están en
 * Básico. Devuelve cuántos midió.
 */
export async function runPlacesRefresh(): Promise<number> {
  if (!isPlacesEnabled()) return 0;
  const due = await query<{ place_id: string }>(
    `WITH places AS (
       SELECT l.google_place_id AS place_id, l.company_id FROM locations l WHERE l.google_place_id IS NOT NULL
       UNION
       SELECT c.place_id, l.company_id FROM location_competitors c JOIN locations l ON l.id = c.location_id
     )
     SELECT DISTINCT p.place_id
       FROM places p
       JOIN companies co ON co.id = p.company_id AND co.plan <> 'basic'
       LEFT JOIN LATERAL (SELECT MAX(measured_on) AS last FROM place_snapshots s WHERE s.place_id = p.place_id) s ON true
      WHERE s.last IS NULL OR s.last <= CURRENT_DATE - ${REFRESH_DAYS}`
  );
  let n = 0;
  for (const d of due) {
    try {
      await refreshPlace(d.place_id);
      n++;
    } catch (err: any) {
      console.error(`[competencia] ${d.place_id}:`, err.message);
    }
  }
  if (n) console.log(`[competencia] ${n} lugar(es) medidos en Google`);
  return n;
}
