/**
 * Recolección de datos del informe mensual (Función 2).
 *
 * Fuente única de verdad compartida por:
 *   - el endpoint GET /api/report (vista imprimible), y
 *   - el worker de envío programado por correo (scheduler.ts).
 *
 * No duplica la analítica del dashboard: ejecuta las mismas consultas sobre
 * scan_events / survey_* acotadas al mes y al alcance (empresa + sede opcional).
 */
import { query } from '../db/pool';
import type { ReportData } from './report';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Normaliza 'YYYY-MM'; si es inválido, usa el mes anterior completo. */
export function normalizeMonth(month?: string): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) return month;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface ReportScope {
  month?: string; // 'YYYY-MM' (se normaliza; si falta, usa el mes anterior)
  companyId?: string; // undefined = todas (solo superadmin)
  locationId?: string;
}

/**
 * Arma el objeto ReportData para un alcance dado. `companyId` ya debe venir
 * resuelto según el rol (el multi-tenant se aplica aguas arriba).
 */
export async function buildReportData(scope: ReportScope): Promise<ReportData> {
  const month = normalizeMonth(scope.month);
  const [yy, mm] = month.split('-').map((x) => parseInt(x, 10));
  const lastDay = new Date(yy, mm, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  // WHERE común sobre scan_events (alias se), por rango + sede + empresa.
  const clauses: string[] = [];
  const params: any[] = [];
  params.push(from);
  clauses.push(`se.scanned_at >= (($${params.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`);
  params.push(to);
  clauses.push(
    `se.scanned_at < ((($${params.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE '${APP_TZ}')`
  );
  if (scope.locationId) {
    params.push(scope.locationId);
    clauses.push(`se.location_id = $${params.length}`);
  }
  if (scope.companyId !== undefined) {
    params.push(scope.companyId);
    clauses.push(`se.location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  // Encabezado: empresa y sede.
  let companyName = 'Todas las empresas';
  if (scope.companyId !== undefined) {
    const c = await query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [scope.companyId]);
    companyName = c[0]?.name || 'Empresa';
  }
  let locationName: string | null = null;
  if (scope.locationId) {
    const l = await query<{ name: string }>(`SELECT name FROM locations WHERE id = $1`, [scope.locationId]);
    locationName = l[0]?.name || null;
  }

  const totalRow = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM scan_events se ${where}`,
    params
  );
  // Mes anterior completo, mismo alcance: da contexto al KPI principal.
  const prevDate = new Date(yy, mm - 2, 1);
  const prevFrom = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;
  const prevParams: any[] = [prevFrom, from];
  let prevWhere = `se.scanned_at >= (($1::date)::timestamp AT TIME ZONE '${APP_TZ}')
                   AND se.scanned_at < (($2::date)::timestamp AT TIME ZONE '${APP_TZ}')`;
  if (scope.locationId) {
    prevParams.push(scope.locationId);
    prevWhere += ` AND se.location_id = $${prevParams.length}`;
  }
  if (scope.companyId !== undefined) {
    prevParams.push(scope.companyId);
    prevWhere += ` AND se.location_id IN (SELECT id FROM locations WHERE company_id = $${prevParams.length})`;
  }
  const prevRow = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM scan_events se WHERE ${prevWhere}`,
    prevParams
  );

  const topLoc = await query<{ name: string; city: string; scans: string }>(
    `SELECT l.name, l.city, COUNT(*) AS scans
       FROM scan_events se JOIN locations l ON l.id = se.location_id
       ${where} GROUP BY l.id, l.name, l.city ORDER BY scans DESC LIMIT 1`,
    params
  );
  const peak = await query<{ hour: string }>(
    `SELECT EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS hour,
            COUNT(*) AS scans FROM scan_events se ${where}
       GROUP BY hour ORDER BY scans DESC LIMIT 1`,
    params
  );
  const trend = await query<{ day: string; scans: string }>(
    `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
            COUNT(*) AS scans FROM scan_events se ${where}
       GROUP BY day ORDER BY day ASC`,
    params
  );
  const topLocations = await query<{ name: string; city: string; scans: string }>(
    `SELECT l.name, l.city, COUNT(*) AS scans
       FROM scan_events se JOIN locations l ON l.id = se.location_id
       ${where} GROUP BY l.id, l.name, l.city ORDER BY scans DESC LIMIT 10`,
    params
  );
  const channels = await query<{ channel: string; scans: string }>(
    `SELECT se.channel, COUNT(*) AS scans FROM scan_events se ${where}
       GROUP BY se.channel ORDER BY scans DESC`,
    params
  );

  // Calificación por aspecto (Función 1): mismos filtros sobre survey_responses.
  let survey: ReportData['survey'] = null;
  try {
    const sc: string[] = [];
    const sp: any[] = [];
    sp.push(from);
    sc.push(`sr.submitted_at >= (($${sp.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`);
    sp.push(to);
    sc.push(`sr.submitted_at < ((($${sp.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE '${APP_TZ}')`);
    if (scope.locationId) {
      sp.push(scope.locationId);
      sc.push(`sr.location_id = $${sp.length}`);
    }
    if (scope.companyId !== undefined) {
      sp.push(scope.companyId);
      sc.push(`sr.location_id IN (SELECT id FROM locations WHERE company_id = $${sp.length})`);
    }
    const sw = `WHERE ${sc.join(' AND ')}`;
    const svAspects = await query<{ label: string; avg: string; count: string }>(
      `SELECT a.label, AVG(ans.rating)::numeric(10,2) AS avg, COUNT(*) AS count
         FROM survey_answers ans
         JOIN survey_responses sr ON sr.id = ans.response_id
         JOIN survey_aspects a ON a.id = ans.aspect_id
         ${sw}
         GROUP BY a.id, a.label, a.position
         ORDER BY a.position ASC, a.label ASC`,
      sp
    );
    const svTotal = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM survey_responses sr ${sw}`,
      sp
    );
    const total = parseInt(svTotal[0]?.total || '0', 10);
    if (total > 0 && svAspects.length) {
      const aspects = svAspects.map((a) => ({
        label: a.label,
        avg: parseFloat(a.avg),
        count: parseInt(a.count, 10),
      }));
      const avg = aspects.reduce((s, a) => s + a.avg, 0) / (aspects.length || 1);
      survey = { total, avg: Math.round(avg * 100) / 100, aspects };
    }
  } catch {
    survey = null;
  }

  const generatedAt = new Date().toLocaleString('es-CO', {
    timeZone: APP_TZ,
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return {
    companyName,
    periodLabel: `${MESES[mm - 1]} ${yy}`,
    locationName,
    generatedAt,
    kpis: {
      totalScans: parseInt(totalRow[0]?.total || '0', 10),
      prevTotal: parseInt(prevRow[0]?.total || '0', 10),
      prevPeriodLabel: `${MESES[prevDate.getMonth()]} ${prevDate.getFullYear()}`,
      topLocation: topLoc[0]
        ? { name: topLoc[0].name, city: topLoc[0].city, scans: parseInt(topLoc[0].scans, 10) }
        : null,
      peakHour: peak[0] ? parseInt(peak[0].hour, 10) : null,
    },
    trend: trend.map((t) => ({ day: t.day, scans: parseInt(t.scans, 10) })),
    topLocations: topLocations.map((l) => ({
      name: l.name,
      city: l.city,
      scans: parseInt(l.scans, 10),
    })),
    channels: channels.map((c) => ({ channel: c.channel, scans: parseInt(c.scans, 10) })),
    survey,
  };
}
