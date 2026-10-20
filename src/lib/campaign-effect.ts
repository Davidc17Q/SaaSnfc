/**
 * Efecto de una campaña: interacciones diarias promedio durante la campaña
 * frente al mismo número de días justo antes. Una campaña en curso se mide
 * hasta hoy. Compartido por la API del panel y el informe mensual.
 */
import { query } from '../db/pool';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

// Protecciones contra conclusiones engañosas: con muy pocos días o muy poco
// volumen previo, una variación (+300 %, -95 %) no significa nada.
const MIN_DAYS = 3;
const MIN_BASE = 30; // interacciones mínimas en la ventana previa

/**
 * Variación % (1 decimal) o null si no hay base fiable: menos de MIN_DAYS días
 * transcurridos, menos de MIN_BASE interacciones previas, o cero interacciones
 * durante la campaña (eso apunta a un problema de captura, no a la campaña).
 */
export async function campaignUplift(
  companyId: string,
  startsOn: string,
  endsOn: string
): Promise<number | null> {
  const rows = await query<{ days: number; during: string; before: string }>(
    `WITH w AS (
       SELECT $2::date AS s,
              LEAST($3::date, (now() AT TIME ZONE '${APP_TZ}')::date) AS e
     ), d AS (
       SELECT s, e, (e - s + 1) AS days FROM w
     )
     SELECT d.days,
            (SELECT COUNT(*) FROM scan_events se
              WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
                AND se.scanned_at >= ((d.s)::timestamp AT TIME ZONE '${APP_TZ}')
                AND se.scanned_at <  ((d.e + 1)::timestamp AT TIME ZONE '${APP_TZ}')) AS during,
            (SELECT COUNT(*) FROM scan_events se
              WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
                AND se.scanned_at >= ((d.s - d.days)::timestamp AT TIME ZONE '${APP_TZ}')
                AND se.scanned_at <  ((d.s)::timestamp AT TIME ZONE '${APP_TZ}')) AS before
       FROM d`,
    [companyId, startsOn, endsOn]
  );
  const r = rows[0];
  if (!r || r.days < MIN_DAYS) return null;
  const during = parseInt(r.during, 10);
  const before = parseInt(r.before, 10);
  if (before < MIN_BASE || during === 0) return null;
  return Math.round(((during - before) / before) * 1000) / 10;
}
