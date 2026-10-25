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
import { campaignUplift } from './campaign-effect';
import { buildStory } from './report-story';
import { companySegment, companyUnits } from './segments';
import { sinceStart } from './since-start';

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
  // Mes en curso: se compara contra los MISMOS días del mes anterior (comparar
  // 20 días contra un mes completo exageraría la caída).
  const todayLocal = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const inProgressDays = todayLocal >= from && todayLocal <= to ? parseInt(todayLocal.slice(8, 10), 10) : null;
  let prevEnd = from;
  if (inProgressDays !== null) {
    const pe = new Date(Date.UTC(prevDate.getFullYear(), prevDate.getMonth(), 1 + inProgressDays));
    const peIso = pe.toISOString().slice(0, 10);
    prevEnd = peIso < from ? peIso : from;
  }
  const prevParams: any[] = [prevFrom, prevEnd];
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

  // Campañas de la empresa que se cruzan con el mes (bandas en la tendencia).
  let campaigns: ReportData['campaigns'] = [];
  if (scope.companyId !== undefined) {
    const rows = await query<{ name: string; starts_on: string; ends_on: string }>(
      `SELECT name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
         FROM campaigns
        WHERE company_id = $1 AND ends_on >= $2::date AND starts_on <= $3::date
        ORDER BY starts_on ASC`,
      [scope.companyId, from, to]
    );
    campaigns = [];
    for (const r of rows) {
      campaigns.push({
        name: r.name,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        upliftPct: await campaignUplift(scope.companyId, r.starts_on, r.ends_on),
      });
    }
  }

  // Sedes activas que no registraron ninguna interacción en el mes.
  const inactiveParams: any[] = [from, to];
  let inactiveScope = '';
  if (scope.companyId !== undefined) {
    inactiveParams.push(scope.companyId);
    inactiveScope += ` AND l.company_id = $${inactiveParams.length}`;
  }
  if (scope.locationId) {
    inactiveParams.push(scope.locationId);
    inactiveScope += ` AND l.id = $${inactiveParams.length}`;
  }
  const inactiveRow = await query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM locations l
      WHERE l.status = 'active'
        AND l.created_at < (($2::date + 1)::timestamp AT TIME ZONE '${APP_TZ}')
        ${inactiveScope}
        AND NOT EXISTS (
          SELECT 1 FROM scan_events se
           WHERE se.location_id = l.id
             AND se.scanned_at >= (($1::date)::timestamp AT TIME ZONE '${APP_TZ}')
             AND se.scanned_at < (($2::date + 1)::timestamp AT TIME ZONE '${APP_TZ}'))`,
    inactiveParams
  );

  // Datos del informe por capítulos (ranking, calor, campañas, clientes...).
  const story = await buildStory({
    companyId: scope.companyId,
    locationId: scope.locationId,
    from,
    to,
    prevFrom,
    prevTo: prevEnd,
  });

  // Segmento de la empresa (qué avisos tienen sentido) y días sin actividad.
  const segment = await companySegment(scope.companyId);
  const units = await companyUnits(scope.companyId, segment);
  const since = await sinceStart({ companyId: scope.companyId, locationId: scope.locationId }, segment);
  const lastParams: any[] = [];
  let lastWhere = '';
  if (scope.locationId) {
    lastParams.push(scope.locationId);
    lastWhere = `WHERE location_id = $1`;
  } else if (scope.companyId !== undefined) {
    lastParams.push(scope.companyId);
    lastWhere = `WHERE location_id IN (SELECT id FROM locations WHERE company_id = $1)`;
  }
  const lastRow = await query<{ days: string | null }>(
    `SELECT EXTRACT(EPOCH FROM (now() - MAX(scanned_at))) / 86400 AS days FROM scan_events ${lastWhere}`,
    lastParams
  );
  const daysSinceLast = lastRow[0]?.days !== null && lastRow[0]?.days !== undefined
    ? Math.floor(parseFloat(lastRow[0].days))
    : null;

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
      inProgressDays,
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
    campaigns,
    inactiveLocations: parseInt(inactiveRow[0]?.c || '0', 10),
    story,
    segment,
    units,
    daysSinceLast,
    sinceStart: since,
  };
}
