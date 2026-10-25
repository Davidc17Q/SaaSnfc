import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { redis, deviceCacheKey } from '../db/redis';
import type { DeviceCache } from '../types';
import { getSession, hashPassword } from '../lib/auth';
import { uniqueShortCode } from '../lib/shortcode';
import { reportHtml } from '../lib/report';
import { reportMailHtml } from '../lib/report-mail';
import { buildReportData, normalizeMonth } from '../lib/report-data';
import { reportLinkUrl, verifyReportLink } from '../lib/report-link';
import { campaignUplift } from '../lib/campaign-effect';
import { detectChannel } from '../lib/channel';
import { companySegment, inferSegment, isSegment, unitsFor } from '../lib/segments';
import { invalidatePlan, planStatus } from '../lib/plans';
import { config } from '../config';
import { isMailEnabled, sendReportMail } from '../lib/mailer';
import { THRESHOLD_OPTIONS as INACTIVITY_THRESHOLDS, sendInactivityTest } from '../lib/inactivity-alerts';

// Zona horaria del negocio. Los escaneos se guardan en UTC (timestamptz),
// pero los filtros de fecha del dashboard se interpretan en hora local.
const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

/**
 * Resuelve el company_id que debe aplicarse a la petición.
 * - company_admin: SIEMPRE su propia empresa (no puede ver otras).
 * - superadmin: la que pida por ?companyId=, o null = todas.
 * Devuelve `undefined` cuando no hay que filtrar (superadmin viendo todo).
 */
function resolveCompanyId(req: any): string | undefined {
  const s = getSession(req);
  if (!s) return undefined;
  if (s.role === 'company_admin') return s.companyId || '__none__';
  // superadmin
  const q = req.query as any;
  return q.companyId ? String(q.companyId) : undefined;
}

/**
 * Construye cláusula de filtros comunes.
 * Requiere que la consulta una scan_events (se) con locations (l) cuando se
 * filtra por empresa, ya que company_id vive en locations.
 */
function buildFilters(q: any, companyId?: string): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  if (q.from) {
    params.push(q.from);
    clauses.push(
      `se.scanned_at >= (($${params.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`
    );
  }
  if (q.to) {
    params.push(q.to);
    clauses.push(
      `se.scanned_at < ((($${params.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE '${APP_TZ}')`
    );
  }
  if (q.locationId) {
    params.push(q.locationId);
    clauses.push(`se.location_id = $${params.length}`);
  }
  if (q.channel) {
    params.push(q.channel);
    clauses.push(`se.channel = $${params.length}`);
  }
  if (companyId !== undefined) {
    params.push(companyId);
    clauses.push(
      `se.location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})`
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

/**
 * Construye el WHERE para el alcance de un cambio masivo (all | brand | location).
 * `startAt` indica el número de placeholder inicial ($1 por defecto), para poder
 * anteponer otros parámetros (ej. target_url) en la misma consulta.
 */
function bulkScopeWhere(
  scope?: string,
  value?: string,
  startAt = 1,
  companyId?: string
): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  if (scope === 'brand' && value) {
    params.push(value);
    clauses.push(`l.brand = $${startAt + params.length - 1}`);
  } else if (scope === 'location' && value) {
    params.push(value);
    clauses.push(`l.id = $${startAt + params.length - 1}`);
  }
  if (companyId !== undefined) {
    params.push(companyId);
    clauses.push(`l.company_id = $${startAt + params.length - 1}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

export async function apiRoutes(app: FastifyInstance) {
  // ---------- KPIs ----------
  app.get('/api/kpis', async (req) => {
    const q = req.query as any;
    const companyId = resolveCompanyId(req);
    const { where, params } = buildFilters(q, companyId);

    // Filtros para las ventanas relativas de 7/30 días (sede y/o empresa).
    const winClauses: string[] = [];
    const winParams: any[] = [];
    if (q.locationId) {
      winParams.push(q.locationId);
      winClauses.push(`location_id = $${winParams.length}`);
    }
    if (companyId !== undefined) {
      winParams.push(companyId);
      winClauses.push(
        `location_id IN (SELECT id FROM locations WHERE company_id = $${winParams.length})`
      );
    }
    const winExtra = winClauses.length ? `AND ${winClauses.join(' AND ')}` : '';

    // Total escaneos (según filtro completo), semana y mes
    const totalRow = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM scan_events se ${where}`,
      params
    );
    const windowRow = await query<{ week: string; month: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '7 days')  AS week,
         COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '30 days') AS month
       FROM scan_events
       WHERE scanned_at >= now() - INTERVAL '30 days' ${winExtra}`,
      winParams
    );
    const totals = [
      {
        total: totalRow[0]?.total || '0',
        week: windowRow[0]?.week || '0',
        month: windowRow[0]?.month || '0',
      },
    ];

    // Sede más activa (según filtro)
    const topLocation = await query<{ name: string; brand: string; scans: string }>(
      `SELECT l.name, l.brand, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.brand
         ORDER BY scans DESC
         LIMIT 1`,
      params
    );

    // Pico de hora de escaneo (hora local del negocio con más escaneos)
    const peakHour = await query<{ hour: string; scans: string }>(
      `SELECT EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS hour,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY hour
         ORDER BY scans DESC
         LIMIT 1`,
      params
    );

    // Distribución de dispositivos (iOS vs Android vs Other)
    const devices = await query<{ os: string; scans: string }>(
      `SELECT se.os, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY se.os`,
      params
    );

    const osMap: Record<string, number> = { iOS: 0, Android: 0, Other: 0 };
    for (const d of devices) osMap[d.os] = parseInt(d.scans, 10);

    const totalScans = parseInt(totals[0]?.total || '0', 10);

    // Periodo anterior equivalente (mismo nº de días justo antes) para dar
    // contexto al KPI principal. Solo aplica con rango de fechas.
    let prevTotal: number | null = null;
    let variationPct: number | null = null;
    if (q.from && q.to) {
      const prevParams: any[] = [q.from, q.to, q.from];
      let prevWhere = `se.scanned_at >= (($1::date - ($2::date - $3::date + 1))::timestamp AT TIME ZONE '${APP_TZ}')
                       AND se.scanned_at < (($3::date)::timestamp AT TIME ZONE '${APP_TZ}')`;
      if (q.locationId) {
        prevParams.push(q.locationId);
        prevWhere += ` AND se.location_id = $${prevParams.length}`;
      }
      if (q.channel) {
        prevParams.push(q.channel);
        prevWhere += ` AND se.channel = $${prevParams.length}`;
      }
      if (companyId !== undefined) {
        prevParams.push(companyId);
        prevWhere += ` AND se.location_id IN (SELECT id FROM locations WHERE company_id = $${prevParams.length})`;
      }
      const prevRow = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM scan_events se WHERE ${prevWhere}`,
        prevParams
      );
      prevTotal = parseInt(prevRow[0]?.total || '0', 10);
      variationPct =
        prevTotal > 0 ? Math.round(((totalScans - prevTotal) / prevTotal) * 1000) / 10 : null;
    }

    // Cobertura: sedes activas con al menos una interacción en el periodo.
    const locParams: any[] = [];
    let locWhere = `WHERE status = 'active'`;
    if (companyId !== undefined) {
      locParams.push(companyId);
      locWhere += ` AND company_id = $1`;
    }
    const locRow = await query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM locations ${locWhere}`,
      locParams
    );
    const withActivityRow = await query<{ c: string }>(
      `SELECT COUNT(DISTINCT se.location_id) AS c FROM scan_events se ${where}`,
      params
    );

    return {
      totalScans,
      prevTotal,
      variationPct,
      locationsTotal: parseInt(locRow[0]?.c || '0', 10),
      locationsWithActivity: parseInt(withActivityRow[0]?.c || '0', 10),
      scansWeek: parseInt(totals[0]?.week || '0', 10),
      scansMonth: parseInt(totals[0]?.month || '0', 10),
      topLocation: topLocation[0]
        ? {
            name: topLocation[0].name,
            brand: topLocation[0].brand,
            scans: parseInt(topLocation[0].scans, 10),
          }
        : null,
      peakHour: peakHour[0]
        ? { hour: parseInt(peakHour[0].hour, 10), scans: parseInt(peakHour[0].scans, 10) }
        : null,
      devices: osMap,
    };
  });

  // ---------- Tendencia diaria (gráfico de líneas) ----------
  app.get('/api/trend', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));

    const rows = await query<{ day: string; scans: string }>(
      `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY day
         ORDER BY day ASC`,
      params
    );

    return rows.map((r) => ({ day: r.day, scans: parseInt(r.scans, 10) }));
  });

  // ---------- Top 10 sedes (gráfico de barras) ----------
  app.get('/api/top-locations', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));

    const rows = await query<{ id: string; name: string; city: string; scans: string }>(
      `SELECT l.id, l.name, l.city, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.city
         ORDER BY scans DESC
         LIMIT 10`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      scans: parseInt(r.scans, 10),
    }));
  });

  // ---------- Distribución por hora (opcional para heatmap simple) ----------
  app.get('/api/hourly', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));

    const rows = await query<{ hour: string; scans: string }>(
      `SELECT EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS hour, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY hour
         ORDER BY hour ASC`,
      params
    );

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, scans: 0 }));
    for (const r of rows) hours[parseInt(r.hour, 10)].scans = parseInt(r.scans, 10);
    return hours;
  });

  // ---------- Desglose por canal / destino (WhatsApp, Instagram, ...) ----------
  app.get('/api/channels', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));
    const rows = await query<{ channel: string; scans: string }>(
      `SELECT se.channel, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY se.channel
         ORDER BY scans DESC`,
      params
    );
    return rows.map((r) => ({ channel: r.channel, scans: parseInt(r.scans, 10) }));
  });

  // ---------- Origen de las interacciones: toque NFC o escaneo del QR ----------
  app.get('/api/sources', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));
    const rows = await query<{ source: string; scans: string }>(
      `SELECT se.source, COUNT(*) AS scans FROM scan_events se ${where} GROUP BY se.source`,
      params
    );
    const out = { nfc: 0, qr: 0, unknown: 0 } as Record<string, number>;
    for (const r of rows) out[r.source in out ? r.source : 'unknown'] += parseInt(r.scans, 10);
    return out;
  });

  // ---------- Tendencia avanzada (variación % + promedio de la cadena) ----------
  app.get('/api/trend-advanced', async (req) => {
    const q = req.query as any;
    const companyId = resolveCompanyId(req);
    const { where, params } = buildFilters(q, companyId);

    // Serie diaria de la selección actual
    const series = await query<{ day: string; scans: string }>(
      `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY day
         ORDER BY day ASC`,
      params
    );

    // Promedio de la cadena por día = escaneos totales del día / número de sedes activas.
    // Acotado a la empresa (para company_admin y superadmin filtrando por empresa).
    const avgFilters = buildFilters({ from: q.from, to: q.to }, companyId); // sin locationId
    // Conteo de sedes activas del mismo alcance de empresa
    const locCountParams: any[] = [];
    let locCountWhere = `WHERE status = 'active'`;
    if (companyId !== undefined) {
      locCountParams.push(companyId);
      locCountWhere += ` AND company_id = $1`;
    }
    const locCountRow = await query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM locations ${locCountWhere}`,
      locCountParams
    );
    const locCount = parseInt(locCountRow[0]?.c || '0', 10) || 1;
    const chainAvg = await query<{ day: string; total: string }>(
      `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
              COUNT(*) AS total
         FROM scan_events se
         ${avgFilters.where}
         GROUP BY day
         ORDER BY day ASC`,
      avgFilters.params
    );
    const avgMap: Record<string, number> = {};
    for (const r of chainAvg) {
      avgMap[r.day] = Math.round((parseInt(r.total, 10) / locCount) || 0);
    }

    // Total del periodo actual
    const currentTotal = series.reduce((a, r) => a + parseInt(r.scans, 10), 0);

    // Total del periodo anterior equivalente (mismo nº de días justo antes)
    let prevTotal = 0;
    let variationPct: number | null = null;
    if (q.from && q.to) {
      const prevParams: any[] = [q.from, q.to, q.from];
      let prevWhere = `se.scanned_at >= (($1::date - ($2::date - $3::date + 1))::timestamp AT TIME ZONE '${APP_TZ}')
                       AND se.scanned_at < (($3::date)::timestamp AT TIME ZONE '${APP_TZ}')`;
      if (q.locationId) {
        prevParams.push(q.locationId);
        prevWhere += ` AND se.location_id = $${prevParams.length}`;
      }
      if (companyId !== undefined) {
        prevParams.push(companyId);
        prevWhere += ` AND se.location_id IN (SELECT id FROM locations WHERE company_id = $${prevParams.length})`;
      }
      const prevRow = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM scan_events se WHERE ${prevWhere}`,
        prevParams
      );
      prevTotal = parseInt(prevRow[0]?.total || '0', 10);
      if (prevTotal > 0) {
        variationPct = Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10;
      } else if (currentTotal > 0) {
        variationPct = 100;
      } else {
        variationPct = 0;
      }
    }

    return {
      series: series.map((r) => ({
        day: r.day,
        scans: parseInt(r.scans, 10),
        avg: avgMap[r.day] || 0,
      })),
      currentTotal,
      prevTotal,
      variationPct,
    };
  });

  // ---------- Benchmarking: Top 3 vs Bottom 3 + gap ----------
  app.get('/api/benchmark', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q, resolveCompanyId(req));

    // Ranking de sedes por volumen en el periodo (solo sedes con actividad).
    const ranked = await query<{ id: string; name: string; city: string; scans: string }>(
      `SELECT l.id, l.name, l.city, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.city
         ORDER BY scans DESC`,
      params
    );

    const mapped = ranked.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      scans: parseInt(r.scans, 10),
    }));

    const top3 = mapped.slice(0, 3);
    const bottom3 = mapped.slice(-3).reverse(); // menor volumen primero

    const leader = top3[0]?.scans || 0;
    const laggard = mapped.length ? mapped[mapped.length - 1].scans : 0;
    // Gap de rendimiento: cuánto más tiene el líder respecto al de menor rendimiento.
    let gapPct: number | null = null;
    if (laggard > 0) {
      gapPct = Math.round(((leader - laggard) / laggard) * 100);
    } else if (leader > 0) {
      gapPct = null; // el de menor rendimiento tiene 0: gap "infinito"
    }

    return { top3, bottom3, leaderScans: leader, laggardScans: laggard, gapPct, totalLocations: mapped.length };
  });

  // ---------- Comparación A/B de dos sedes ----------
  app.get<{ Querystring: { a?: string; b?: string; from?: string; to?: string } }>(
    '/api/compare',
    async (req) => {
      const q = req.query;
      if (!q.a || !q.b) {
        return { error: 'Debes indicar dos sedes (a y b).' };
      }
      const companyId = resolveCompanyId(req);

      async function seriesFor(locationId: string) {
        const f = buildFilters({ from: q.from, to: q.to, locationId }, companyId);
        const rows = await query<{ day: string; scans: string }>(
          `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
                  COUNT(*) AS scans
             FROM scan_events se
             ${f.where}
             GROUP BY day ORDER BY day ASC`,
          f.params
        );
        return rows.map((r) => ({ day: r.day, scans: parseInt(r.scans, 10) }));
      }

      const meta = await query<{ id: string; name: string; city: string }>(
        `SELECT id, name, city FROM locations WHERE id = ANY($1::uuid[])`,
        [[q.a, q.b]]
      );
      const metaOf = (id: string) => meta.find((m) => m.id === id) || null;

      const [seriesA, seriesB] = await Promise.all([seriesFor(q.a), seriesFor(q.b)]);

      // Unificar los días de ambas series para alinear el eje X
      const days = Array.from(
        new Set([...seriesA.map((d) => d.day), ...seriesB.map((d) => d.day)])
      ).sort();
      const mapA: Record<string, number> = {};
      const mapB: Record<string, number> = {};
      for (const d of seriesA) mapA[d.day] = d.scans;
      for (const d of seriesB) mapB[d.day] = d.scans;

      return {
        days,
        a: {
          location: metaOf(q.a),
          totals: seriesA.reduce((s, d) => s + d.scans, 0),
          data: days.map((d) => mapA[d] || 0),
        },
        b: {
          location: metaOf(q.b),
          totals: seriesB.reduce((s, d) => s + d.scans, 0),
          data: days.map((d) => mapB[d] || 0),
        },
      };
    }
  );

  // ---------- Salud operativa de sedes (alertas de inactividad) ----------
  app.get('/api/health-status', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = `WHERE l.company_id = $1`;
    }
    const rows = await query<{
      id: string;
      name: string;
      city: string;
      status: string;
      last_scan: string | null;
      hours_since: string | null;
    }>(
      `SELECT l.id, l.name, l.city, l.status,
              MAX(se.scanned_at) AS last_scan,
              EXTRACT(EPOCH FROM (now() - MAX(se.scanned_at))) / 3600 AS hours_since
         FROM locations l
         LEFT JOIN scan_events se ON se.location_id = l.id
         ${cWhere}
         GROUP BY l.id, l.name, l.city, l.status
         ORDER BY hours_since DESC NULLS FIRST`,
      cParams
    );

    function classify(hoursSince: number | null): 'active' | 'low' | 'alert' {
      if (hoursSince === null) return 'alert'; // nunca ha tenido escaneos
      if (hoursSince <= 24) return 'active';
      if (hoursSince <= 48) return 'low';
      return 'alert';
    }

    const items = rows.map((r) => {
      const hrs = r.hours_since !== null ? parseFloat(r.hours_since) : null;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        enabled: r.status === 'active',
        lastScan: r.last_scan,
        hoursSince: hrs !== null ? Math.round(hrs * 10) / 10 : null,
        state: classify(hrs),
      };
    });

    const summary = {
      active: items.filter((i) => i.state === 'active').length,
      low: items.filter((i) => i.state === 'low').length,
      alert: items.filter((i) => i.state === 'alert').length,
    };

    return { summary, items };
  });

  // ---------- Alertas accionables (dashboard) ----------
  // Combina tres señales que el dueño debe atender HOY, priorizadas:
  //   1) grave  → sede activa sin un solo escaneo en 48h+ (soporte caído/retirado)
  //   2) grave  → sede sin ningún escaneo histórico (soporte nunca instalado/leído)
  //   3) alerta → caída fuerte de tráfico semana vs. semana anterior por sede
  // Respeta el scope de empresa (company_admin solo ve lo suyo).
  app.get('/api/alerts', async (req) => {
    const companyId = resolveCompanyId(req);
    const professional = companyId !== undefined && (await companySegment(companyId)) === 'professional';
    const idleHours = professional ? 14 * 24 : 48;
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = `WHERE l.company_id = $1`;
    }

    // Inactividad / sin escaneos: horas desde el último escaneo por sede activa.
    const inactivity = await query<{
      id: string;
      name: string;
      city: string;
      last_scan: string | null;
      hours_since: string | null;
    }>(
      `SELECT l.id, l.name, l.city,
              MAX(se.scanned_at) AS last_scan,
              EXTRACT(EPOCH FROM (now() - MAX(se.scanned_at))) / 3600 AS hours_since
         FROM locations l
         LEFT JOIN scan_events se ON se.location_id = l.id
         ${cWhere ? cWhere + ' AND' : 'WHERE'} l.status = 'active'
         GROUP BY l.id, l.name, l.city`,
      cParams
    );

    // Tráfico de las dos últimas semanas por sede (para detectar caídas).
    const trend = await query<{ id: string; name: string; city: string; prev: string; curr: string }>(
      `SELECT l.id, l.name, l.city,
              COUNT(*) FILTER (
                WHERE se.scanned_at >= now() - INTERVAL '14 days'
                  AND se.scanned_at <  now() - INTERVAL '7 days'
              ) AS prev,
              COUNT(*) FILTER (WHERE se.scanned_at >= now() - INTERVAL '7 days') AS curr
         FROM locations l
         JOIN scan_events se ON se.location_id = l.id
         ${cWhere ? cWhere + ' AND' : 'WHERE'} l.status = 'active'
         GROUP BY l.id, l.name, l.city`,
      cParams
    );

    type Alert = {
      level: 'grave' | 'alerta';
      kind: 'inactive' | 'never' | 'drop';
      locationId: string;
      title: string;
      detail: string;
      metric: string | null;
    };
    const alerts: Alert[] = [];

    for (const r of inactivity) {
      const hrs = r.hours_since !== null ? parseFloat(r.hours_since) : null;
      if (hrs === null) {
        alerts.push({
          level: 'grave',
          kind: 'never',
          locationId: r.id,
          title: `${r.name} sin interacciones registradas`,
          detail: `${r.city} · nunca ha tenido actividad. Revisa si el soporte NFC/QR está instalado y leyendo.`,
          metric: null,
        });
      } else if (hrs >= idleHours) {
        const days = Math.floor(hrs / 24);
        alerts.push({
          level: professional ? 'alerta' : 'grave',
          kind: 'inactive',
          locationId: r.id,
          title: `${r.name} lleva ${days} día${days === 1 ? '' : 's'} sin interacciones`,
          detail: professional
            ? 'Nadie ha usado la tarjeta en ese tiempo: ofrécela en tus próximas reuniones.'
            : `${r.city} · el soporte podría estar retirado, dañado o tapado.`,
          metric: `${days}d`,
        });
      }
    }

    // Una sede ya marcada como grave (sin actividad) no se repite como caída.
    const flagged = new Set(alerts.map((a) => a.locationId));
    for (const r of trend) {
      if (flagged.has(r.id)) continue;
      const prev = parseInt(r.prev, 10);
      const curr = parseInt(r.curr, 10);
      // Solo marca caídas relevantes: base mínima para evitar ruido estadístico.
      if (prev >= 10 && curr < prev * 0.6) {
        const dropPct = Math.round((1 - curr / prev) * 100);
        alerts.push({
          level: 'alerta',
          kind: 'drop',
          locationId: r.id,
          title: `${r.name} cayó ${dropPct}% esta semana`,
          detail: `${r.city} · ${curr} interacciones vs. ${prev} la semana anterior.`,
          metric: `-${dropPct}%`,
        });
      }
    }

    // Orden: graves primero, y dentro de cada nivel las caídas mayores arriba.
    const rank = { grave: 0, alerta: 1 } as const;
    alerts.sort((a, b) => rank[a.level] - rank[b.level]);

    return { alerts, count: alerts.length };
  });

  // ==========================================================================
  // REPUTACIÓN (histórico de nota/reseñas de Google por sede)
  // Lectura: cualquier usuario, limitado a su empresa (company_admin) o todas
  // (superadmin). Escritura/borrado: SOLO superadmin (carga manual del dato).
  // ==========================================================================

  // Comprueba que la sede existe y es visible para el usuario de la petición.
  // Devuelve la fila de la sede o null si no existe o está fuera de su empresa.
  async function locationInScope(req: any, locationId: string) {
    const companyId = resolveCompanyId(req);
    const rows = await query<{ id: string; name: string; city: string; company_id: string | null }>(
      `SELECT id, name, city, company_id FROM locations WHERE id = $1`,
      [locationId]
    );
    const loc = rows[0];
    if (!loc) return null;
    // company_admin solo ve sedes de su empresa.
    if (companyId !== undefined && loc.company_id !== companyId) return null;
    return loc;
  }

  // ---------- Histórico de reputación de una sede ----------
  app.get<{ Params: { id: string } }>('/api/locations/:id/reputation', async (req, reply) => {
    const loc = await locationInScope(req, req.params.id);
    if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });

    const rows = await query<{
      id: string;
      rating: string;
      review_count: number;
      measured_on: string;
      source: string;
      note: string | null;
    }>(
      `SELECT id, rating, review_count,
              to_char(measured_on, 'YYYY-MM-DD') AS measured_on,
              source, note
         FROM reputation_snapshots
        WHERE location_id = $1
        ORDER BY measured_on ASC`,
      [req.params.id]
    );

    const snapshots = rows.map((r) => ({
      id: r.id,
      rating: parseFloat(r.rating),
      reviewCount: r.review_count,
      measuredOn: r.measured_on,
      source: r.source,
      note: r.note,
    }));

    // Resumen: valores actuales y variación contra la primera medición.
    const first = snapshots[0] || null;
    const last = snapshots[snapshots.length - 1] || null;
    const summary = last
      ? {
          rating: last.rating,
          reviewCount: last.reviewCount,
          measuredOn: last.measuredOn,
          reviewsGained: first ? last.reviewCount - first.reviewCount : 0,
          ratingDelta: first ? Math.round((last.rating - first.rating) * 10) / 10 : 0,
          firstMeasuredOn: first ? first.measuredOn : null,
        }
      : null;

    return { location: { id: loc.id, name: loc.name, city: loc.city }, summary, snapshots };
  });

  // ---------- Ficha de sede: todo lo de una tienda en una sola consulta ----------
  // Ventana = últimos `days` días (hora del negocio) contra los `days` anteriores.
  // El ranking y el promedio se calculan dentro de la empresa de la sede.
  app.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    '/api/locations/:id/summary',
    async (req, reply) => {
      const loc = await locationInScope(req, req.params.id);
      if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
      const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
      // `days` ya está validado: se puede interpolar sin riesgo.
      const today = `(now() AT TIME ZONE '${APP_TZ}')::date`;
      const curStart = `((${today} - ${days - 1})::timestamp AT TIME ZONE '${APP_TZ}')`;
      const prevStart = `((${today} - ${2 * days - 1})::timestamp AT TIME ZONE '${APP_TZ}')`;
      const id = loc.id;

      const info = await query<{ brand: string; status: string }>(
        `SELECT brand, status FROM locations WHERE id = $1`,
        [id]
      );

      const k = await query<Record<string, string | null>>(
        `SELECT
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart}) AS cur,
           COUNT(*) FILTER (WHERE scanned_at <  ${curStart}) AS prev,
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart} AND channel = 'Google Reviews') AS reviews,
           COUNT(*) FILTER (WHERE scanned_at <  ${curStart} AND channel = 'Google Reviews') AS reviews_prev,
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart} AND channel = 'WhatsApp') AS wa,
           COUNT(*) FILTER (WHERE scanned_at <  ${curStart} AND channel = 'WhatsApp') AS wa_prev,
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart} AND source = 'nfc') AS src_nfc,
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart} AND source = 'qr') AS src_qr,
           COUNT(*) FILTER (WHERE scanned_at >= ${curStart} AND source = 'unknown') AS src_unknown,
           COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '7 days') AS week,
           COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '14 days'
                              AND scanned_at <  now() - INTERVAL '7 days') AS week_prev
         FROM scan_events
         WHERE location_id = $1 AND scanned_at >= LEAST(${prevStart}, now() - INTERVAL '14 days')`,
        [id]
      );
      const lastRow = await query<{ last_scan: string | null; hours: string | null }>(
        `SELECT MAX(scanned_at) AS last_scan,
                EXTRACT(EPOCH FROM (now() - MAX(scanned_at))) / 3600 AS hours
           FROM scan_events WHERE location_id = $1`,
        [id]
      );
      const n = (v: string | null | undefined) => parseInt(v || '0', 10);
      const pct = (cur: number, prev: number) =>
        prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? null : 0;
      const row = k[0] || {};
      const cur = n(row.cur);
      const prev = n(row.prev);

      // Ranking entre las sedes activas de la misma empresa (actual y anterior).
      const ranked = await query<{ id: string; cur: string; prev: string }>(
        `SELECT l.id,
                COUNT(se.id) FILTER (WHERE se.scanned_at >= ${curStart}) AS cur,
                COUNT(se.id) FILTER (WHERE se.scanned_at <  ${curStart}) AS prev
           FROM locations l
           LEFT JOIN scan_events se ON se.location_id = l.id AND se.scanned_at >= ${prevStart}
          WHERE l.status = 'active' AND l.company_id IS NOT DISTINCT FROM $1
          GROUP BY l.id`,
        [loc.company_id]
      );
      const position = (key: 'cur' | 'prev') => {
        const sorted = [...ranked].sort((a, b) => n(b[key]) - n(a[key]));
        const i = sorted.findIndex((r) => r.id === id);
        return i >= 0 ? i + 1 : null;
      };
      const chainTotal = ranked.reduce((a, r) => a + n(r.cur), 0);

      // Serie diaria de la sede + promedio por sede de la empresa.
      const daysList = await query<{ day: string }>(
        `SELECT to_char(d, 'YYYY-MM-DD') AS day
           FROM generate_series(${today} - ${days - 1}, ${today}, INTERVAL '1 day') AS d`
      );
      const daily = await query<{ day: string; loc: string; chain: string }>(
        `SELECT to_char((se.scanned_at AT TIME ZONE '${APP_TZ}')::date, 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE se.location_id = $1) AS loc,
                COUNT(*) AS chain
           FROM scan_events se
           JOIN locations l ON l.id = se.location_id
          WHERE se.scanned_at >= ${curStart} AND l.company_id IS NOT DISTINCT FROM $2
          GROUP BY 1`,
        [id, loc.company_id]
      );
      const dayMap = new Map(daily.map((d) => [d.day, d]));
      const activeCount = ranked.length || 1;
      const series = daysList.map(({ day }) => ({
        day,
        scans: n(dayMap.get(day)?.loc),
        avg: Math.round(n(dayMap.get(day)?.chain) / activeCount),
      }));

      // Puntos NFC de la sede con su uso. Los puntos en modo encuesta no
      // registran escaneos: su uso son las respuestas recibidas.
      const devs = await query<{
        id: string; code: string; label: string; target_url: string; status: string;
        mode: string; last_scan: string | null; scans: string;
      }>(
        `SELECT d.id, d.code, d.label, d.target_url, d.status, d.mode,
                CASE WHEN d.mode = 'survey' THEN sv.last ELSE sc.last END AS last_scan,
                CASE WHEN d.mode = 'survey' THEN COALESCE(sv.cur, 0) ELSE COALESCE(sc.cur, 0) END AS scans
           FROM devices d
           LEFT JOIN (
             SELECT device_id, MAX(scanned_at) AS last,
                    COUNT(*) FILTER (WHERE scanned_at >= ${curStart}) AS cur
               FROM scan_events WHERE location_id = $1 GROUP BY device_id
           ) sc ON sc.device_id = d.id
           LEFT JOIN (
             SELECT device_id, MAX(submitted_at) AS last,
                    COUNT(*) FILTER (WHERE submitted_at >= ${curStart}) AS cur
               FROM survey_responses WHERE location_id = $1 GROUP BY device_id
           ) sv ON sv.device_id = d.id
          WHERE d.location_id = $1
          ORDER BY scans DESC, d.label ASC`,
        [id]
      );

      // Encuesta interna en la ventana.
      const surveyTotal = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM survey_responses
          WHERE location_id = $1 AND submitted_at >= ${curStart}`,
        [id]
      );
      const aspects = await query<{ label: string; avg: string }>(
        `SELECT asp.label, AVG(sa.rating) AS avg
           FROM survey_answers sa
           JOIN survey_responses sr ON sr.id = sa.response_id
           JOIN survey_aspects asp ON asp.id = sa.aspect_id
          WHERE sr.location_id = $1 AND sr.submitted_at >= ${curStart}
          GROUP BY asp.label, asp.position
          ORDER BY asp.position`,
        [id]
      );
      const comments = await query<{ comment: string; submitted_at: string }>(
        `SELECT comment, to_char(submitted_at AT TIME ZONE '${APP_TZ}', 'YYYY-MM-DD') AS submitted_at
           FROM survey_responses
          WHERE location_id = $1 AND submitted_at >= ${curStart}
            AND comment IS NOT NULL AND btrim(comment) <> ''
          ORDER BY survey_responses.submitted_at DESC
          LIMIT 3`,
        [id]
      );
      const avgAll = aspects.length
        ? Math.round((aspects.reduce((a, r) => a + parseFloat(r.avg), 0) / aspects.length) * 10) / 10
        : null;

      // Reputación de Google registrada.
      const snaps = await query<{ rating: string; review_count: number; measured_on: string }>(
        `SELECT rating, review_count, to_char(measured_on, 'YYYY-MM-DD') AS measured_on
           FROM reputation_snapshots WHERE location_id = $1 ORDER BY measured_on ASC`,
        [id]
      );

      const hours = lastRow[0]?.hours !== null && lastRow[0]?.hours !== undefined
        ? parseFloat(lastRow[0].hours)
        : null;
      const week = n(row.week);
      const weekPrev = n(row.week_prev);

      return {
        location: { id, name: loc.name, city: loc.city, brand: info[0]?.brand || '', status: info[0]?.status || 'active' },
        days,
        kpis: {
          scans: cur,
          scansPrev: prev,
          scansPct: pct(cur, prev),
          reviews: n(row.reviews),
          reviewsPct: pct(n(row.reviews), n(row.reviews_prev)),
          whatsapp: n(row.wa),
          whatsappPct: pct(n(row.wa), n(row.wa_prev)),
          sharePct: chainTotal ? Math.round((cur / chainTotal) * 1000) / 10 : 0,
          chainAvg: Math.round(chainTotal / activeCount),
        },
        rank: { position: position('cur'), prevPosition: position('prev'), total: ranked.length },
        sources: { nfc: n(row.src_nfc), qr: n(row.src_qr), unknown: n(row.src_unknown) },
        segment: await companySegment(loc.company_id),
        health: {
          lastScan: lastRow[0]?.last_scan || null,
          hoursSince: hours === null ? null : Math.round(hours * 10) / 10,
          week,
          weekPrev,
          dropPct: weekPrev >= 10 && week < weekPrev * 0.6 ? Math.round((1 - week / weekPrev) * 100) : null,
        },
        series,
        devices: devs.map((d) => ({
          id: d.id,
          code: d.code,
          label: d.label,
          targetUrl: d.target_url,
          channel: d.mode === 'survey' ? 'Encuesta' : detectChannel(d.target_url),
          status: d.status,
          lastScan: d.last_scan,
          scans: n(d.scans),
        })),
        survey: {
          total: n(surveyTotal[0]?.total),
          avg: avgAll,
          aspects: aspects.map((a) => ({ label: a.label, avg: Math.round(parseFloat(a.avg) * 10) / 10 })),
          comments: comments.map((c) => ({ text: c.comment, date: c.submitted_at })),
        },
        reputation: snaps.map((s) => ({
          rating: parseFloat(s.rating),
          reviewCount: s.review_count,
          measuredOn: s.measured_on,
        })),
      };
    }
  );

  // ---------- Registrar una medición de reputación (SOLO superadmin) ----------
  app.post<{
    Params: { id: string };
    Body: { rating?: number | string; reviewCount?: number | string; measuredOn?: string; note?: string };
  }>('/api/locations/:id/reputation', async (req, reply) => {
    const s = getSession(req);
    if (!s || s.role !== 'superadmin') {
      return reply.code(403).send({ error: 'Solo el superadmin puede registrar mediciones.' });
    }
    const loc = await locationInScope(req, req.params.id);
    if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });

    const rating = Number(req.body?.rating);
    const reviewCount = Number(req.body?.reviewCount);
    const measuredOn = (req.body?.measuredOn || '').trim();
    const note = (req.body?.note || '').trim() || null;

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return reply.code(400).send({ error: 'La nota debe estar entre 0 y 5.' });
    }
    if (!Number.isInteger(reviewCount) || reviewCount < 0) {
      return reply.code(400).send({ error: 'El número de reseñas debe ser un entero ≥ 0.' });
    }
    // Fecha válida; por defecto hoy.
    const dateStr = measuredOn && /^\d{4}-\d{2}-\d{2}$/.test(measuredOn) ? measuredOn : null;

    // UNIQUE(location_id, measured_on): reinsertar la misma fecha actualiza.
    const result = await pool.query(
      `INSERT INTO reputation_snapshots (location_id, rating, review_count, measured_on, source, note)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), 'manual', $5)
       ON CONFLICT (location_id, measured_on)
       DO UPDATE SET rating = EXCLUDED.rating,
                     review_count = EXCLUDED.review_count,
                     note = EXCLUDED.note,
                     source = 'manual'
       RETURNING id, to_char(measured_on, 'YYYY-MM-DD') AS measured_on`,
      [req.params.id, rating, reviewCount, dateStr, note]
    );

    return { ok: true, id: result.rows[0].id, measuredOn: result.rows[0].measured_on };
  });

  // ---------- Eliminar una medición de reputación (SOLO superadmin) ----------
  app.delete<{ Params: { id: string; snapId: string } }>(
    '/api/locations/:id/reputation/:snapId',
    async (req, reply) => {
      const s = getSession(req);
      if (!s || s.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede eliminar mediciones.' });
      }
      const loc = await locationInScope(req, req.params.id);
      if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });

      const result = await pool.query(
        `DELETE FROM reputation_snapshots WHERE id = $1 AND location_id = $2`,
        [req.params.snapId, req.params.id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Medición no encontrada.' });
      }
      return { ok: true };
    }
  );

  // ==========================================================================
  // FUNCIÓN 1: Calificación interna por aspectos (plantillas y resultados)
  // CRUD accesible a superadmin y company_admin. company_admin solo opera sobre
  // su propia empresa; el company_id se fuerza en el servidor según el rol.
  // ==========================================================================

  // Devuelve la plantilla si existe y es visible para el usuario; null si no.
  async function templateInScope(req: any, templateId: string) {
    const companyId = resolveCompanyId(req);
    const rows = await query<{ id: string; company_id: string | null }>(
      `SELECT id, company_id FROM survey_templates WHERE id = $1`,
      [templateId]
    );
    const tpl = rows[0];
    if (!tpl) return null;
    if (companyId !== undefined && tpl.company_id !== companyId) return null;
    return tpl;
  }

  // Resuelve la empresa a asignar al crear una plantilla.
  function resolveTemplateCompanyId(req: any): string | null | undefined {
    const s = getSession(req);
    if (s?.role === 'company_admin') return s.companyId;
    const q = req.query as any;
    const b = req.body as any;
    return b?.company_id || q?.companyId || null;
  }

  // ---------- Listar plantillas (con aspectos y conteo de respuestas) ----------
  app.get('/api/survey-templates', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = `WHERE t.company_id = $1`;
    }
    const rows = await query<any>(
      `SELECT t.id, t.company_id, t.name, t.scale_max, t.status, t.created_at,
              co.name AS company_name,
              COALESCE((SELECT COUNT(*) FROM survey_responses sr WHERE sr.template_id = t.id), 0) AS responses
         FROM survey_templates t
         LEFT JOIN companies co ON co.id = t.company_id
         ${cWhere}
         ORDER BY t.created_at DESC`,
      cParams
    );

    // Aspectos de todas las plantillas listadas (una sola consulta).
    const ids = rows.map((r) => r.id);
    let aspectsByTemplate: Record<string, any[]> = {};
    if (ids.length) {
      const aspects = await query<any>(
        `SELECT id, template_id, label, position FROM survey_aspects
          WHERE template_id = ANY($1::uuid[])
          ORDER BY position ASC, created_at ASC`,
        [ids]
      );
      for (const a of aspects) {
        (aspectsByTemplate[a.template_id] ||= []).push({
          id: a.id,
          label: a.label,
          position: a.position,
        });
      }
    }

    return rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      companyName: r.company_name,
      name: r.name,
      scaleMax: r.scale_max,
      status: r.status,
      responses: parseInt(r.responses, 10),
      aspects: aspectsByTemplate[r.id] || [],
    }));
  });

  // ---------- Crear plantilla + aspectos ----------
  app.post<{
    Body: { name?: string; aspects?: string[]; scale_max?: number };
  }>('/api/survey-templates', async (req, reply) => {
    const name = (req.body?.name || '').trim();
    const aspects = Array.isArray(req.body?.aspects)
      ? req.body!.aspects.map((a) => String(a || '').trim()).filter(Boolean)
      : [];
    if (!name) return reply.code(400).send({ error: 'El nombre es obligatorio.' });
    if (aspects.length === 0) {
      return reply.code(400).send({ error: 'Añade al menos un aspecto.' });
    }
    const scaleMax = Number(req.body?.scale_max);
    const scale = Number.isInteger(scaleMax) && scaleMax >= 2 && scaleMax <= 10 ? scaleMax : 5;

    const companyId = resolveTemplateCompanyId(req);
    if (!companyId) {
      return reply.code(400).send({ error: 'Debes indicar la empresa de la plantilla.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query(
        `INSERT INTO survey_templates (company_id, name, scale_max)
         VALUES ($1, $2, $3) RETURNING id`,
        [companyId, name, scale]
      );
      const templateId = t.rows[0].id;
      for (let i = 0; i < aspects.length; i++) {
        await client.query(
          `INSERT INTO survey_aspects (template_id, label, position) VALUES ($1, $2, $3)`,
          [templateId, aspects[i], i]
        );
      }
      await client.query('COMMIT');
      return reply.code(201).send({ ok: true, id: templateId });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // ---------- Editar plantilla (nombre / estado / aspectos) ----------
  // Regla sobre aspectos: para no corromper el histórico, si la plantilla NO
  // tiene ninguna respuesta registrada se pueden recrear libremente los aspectos
  // (borrar + insertar). Si YA tiene respuestas, solo se permite renombrar los
  // aspectos existentes y añadir nuevos; nunca se borran los que tienen notas.
  app.patch<{
    Params: { id: string };
    Body: { name?: string; status?: string; aspects?: { id?: string; label: string }[] };
  }>('/api/survey-templates/:id', async (req, reply) => {
    const tpl = await templateInScope(req, req.params.id);
    if (!tpl) return reply.code(404).send({ error: 'Plantilla no encontrada.' });

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const status =
      req.body?.status === 'active' || req.body?.status === 'inactive'
        ? req.body.status
        : undefined;
    const aspects = Array.isArray(req.body?.aspects) ? req.body!.aspects : undefined;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sets: string[] = [];
      const params: any[] = [];
      if (name !== undefined && name) {
        params.push(name);
        sets.push(`name = $${params.length}`);
      }
      if (status !== undefined) {
        params.push(status);
        sets.push(`status = $${params.length}`);
      }
      if (sets.length) {
        params.push(tpl.id);
        await client.query(
          `UPDATE survey_templates SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );
      }

      if (aspects !== undefined) {
        const respRow = await client.query(
          `SELECT COUNT(*) AS c FROM survey_responses WHERE template_id = $1`,
          [tpl.id]
        );
        const hasResponses = parseInt(respRow.rows[0].c, 10) > 0;
        const clean = aspects
          .map((a) => ({ id: a?.id ? String(a.id) : undefined, label: String(a?.label || '').trim() }))
          .filter((a) => a.label);

        if (!hasResponses) {
          // Sin respuestas: recrear por completo respetando el orden.
          await client.query(`DELETE FROM survey_aspects WHERE template_id = $1`, [tpl.id]);
          for (let i = 0; i < clean.length; i++) {
            await client.query(
              `INSERT INTO survey_aspects (template_id, label, position) VALUES ($1, $2, $3)`,
              [tpl.id, clean[i].label, i]
            );
          }
        } else {
          // Con respuestas: renombrar los existentes y añadir los nuevos. No se
          // borra ninguno (preserva las notas asociadas).
          for (let i = 0; i < clean.length; i++) {
            const a = clean[i];
            if (a.id) {
              await client.query(
                `UPDATE survey_aspects SET label = $1, position = $2
                   WHERE id = $3 AND template_id = $4`,
                [a.label, i, a.id, tpl.id]
              );
            } else {
              await client.query(
                `INSERT INTO survey_aspects (template_id, label, position) VALUES ($1, $2, $3)`,
                [tpl.id, a.label, i]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
      return { ok: true };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // ---------- Eliminar plantilla ----------
  // El CASCADE del esquema elimina sus aspectos y TODAS sus respuestas/notas, y
  // pone en NULL el survey_template_id de los dispositivos que la usaban (esos
  // puntos quedan en modo encuesta sin plantilla => "encuesta no disponible").
  app.delete<{ Params: { id: string } }>('/api/survey-templates/:id', async (req, reply) => {
    const tpl = await templateInScope(req, req.params.id);
    if (!tpl) return reply.code(404).send({ error: 'Plantilla no encontrada.' });
    await pool.query(`DELETE FROM survey_templates WHERE id = $1`, [tpl.id]);
    return { ok: true };
  });

  // ---------- Resultados de calificación (mismos filtros que la analítica) ----------
  // Replica la semántica de buildFilters pero sobre survey_responses (alias sr),
  // ya que el filtro trabaja contra scan_events (alias se).
  app.get('/api/survey-results', async (req) => {
    const q = req.query as any;
    const companyId = resolveCompanyId(req);

    const clauses: string[] = [];
    const params: any[] = [];
    if (q.from) {
      params.push(q.from);
      clauses.push(`sr.submitted_at >= (($${params.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`);
    }
    if (q.to) {
      params.push(q.to);
      clauses.push(
        `sr.submitted_at < ((($${params.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE '${APP_TZ}')`
      );
    }
    if (q.locationId) {
      params.push(q.locationId);
      clauses.push(`sr.location_id = $${params.length}`);
    }
    if (companyId !== undefined) {
      params.push(companyId);
      clauses.push(`sr.location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Total de respuestas y promedio global.
    const totalRow = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM survey_responses sr ${where}`,
      params
    );
    const avgRow = await query<{ avg: string | null }>(
      `SELECT AVG(sa.rating) AS avg
         FROM survey_answers sa
         JOIN survey_responses sr ON sr.id = sa.response_id
         ${where}`,
      params
    );

    // Promedio por aspecto.
    const byAspect = await query<{ label: string; avg: string; count: string }>(
      `SELECT asp.label, AVG(sa.rating) AS avg, COUNT(*) AS count
         FROM survey_answers sa
         JOIN survey_responses sr ON sr.id = sa.response_id
         JOIN survey_aspects asp ON asp.id = sa.aspect_id
         ${where}
         GROUP BY asp.label
         ORDER BY avg DESC`,
      params
    );

    const aspects = byAspect.map((r) => ({
      label: r.label,
      avg: Math.round(parseFloat(r.avg) * 100) / 100,
      count: parseInt(r.count, 10),
    }));

    // Serie mensual del promedio global.
    const trend = await query<{ month: string; avg: string }>(
      `SELECT to_char(date_trunc('month', sr.submitted_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM') AS month,
              AVG(sa.rating) AS avg
         FROM survey_answers sa
         JOIN survey_responses sr ON sr.id = sa.response_id
         ${where}
         GROUP BY month
         ORDER BY month ASC`,
      params
    );

    const total = parseInt(totalRow[0]?.total || '0', 10);
    const globalAvg = avgRow[0]?.avg !== null && avgRow[0]?.avg !== undefined
      ? Math.round(parseFloat(avgRow[0].avg) * 100) / 100
      : null;

    return {
      total,
      globalAvg,
      aspects,
      best: aspects.length ? aspects[0] : null,
      worst: aspects.length ? aspects[aspects.length - 1] : null,
      trend: trend.map((r) => ({ month: r.month, avg: Math.round(parseFloat(r.avg) * 100) / 100 })),
    };
  });

  // ---------- Lista de sedes (tabla de gestión) ----------
  app.get('/api/locations', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = `WHERE l.company_id = $1`;
    }
    const rows = await query(
      `SELECT
         l.id, l.name, l.brand, l.city, l.status, l.company_id,
         co.name AS company_name,
         COUNT(DISTINCT d.id) AS nfc_points,
         COALESCE(sc.total_clicks, 0) AS total_clicks
       FROM locations l
       LEFT JOIN companies co ON co.id = l.company_id
       LEFT JOIN devices d ON d.location_id = l.id
       LEFT JOIN (
         SELECT location_id, COUNT(*) AS total_clicks
           FROM scan_events GROUP BY location_id
       ) sc ON sc.location_id = l.id
       ${cWhere}
       GROUP BY l.id, l.name, l.brand, l.city, l.status, l.company_id, co.name, l.created_at, sc.total_clicks
       ORDER BY total_clicks DESC, l.created_at DESC`,
      cParams
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      city: r.city,
      status: r.status,
      companyId: r.company_id,
      companyName: r.company_name,
      nfcPoints: parseInt(r.nfc_points, 10),
      totalClicks: parseInt(r.total_clicks, 10),
    }));
  });

  // ---------- Dispositivos de una sede ----------
  app.get<{ Params: { id: string } }>('/api/locations/:id/devices', async (req, reply) => {
    const { id } = req.params;
    // Solo sedes de la empresa del usuario (antes no se comprobaba).
    if (!(await locationInScope(req, id))) return reply.code(404).send({ error: 'Sede no encontrada.' });
    const rows = await query(
      `SELECT id, code, label, target_url, status, updated_at
         FROM devices WHERE location_id = $1 ORDER BY label ASC`,
      [id]
    );
    return rows;
  });

  // ---------- Todos los dispositivos (para el selector de gestión) ----------
  app.get('/api/devices', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = `WHERE l.company_id = $1`;
    }
    const rows = await query(
      `SELECT d.id, d.code, d.label, d.target_url, d.status, d.updated_at, d.transition,
              d.mode, d.survey_template_id,
              l.name AS location_name, l.city AS location_city, l.id AS location_id,
              l.company_id AS company_id
         FROM devices d
         JOIN locations l ON l.id = d.location_id
         ${cWhere}
         ORDER BY l.name ASC, d.label ASC`,
      cParams
    );
    return rows;
  });

  // ---------- Activar/desactivar pantalla de transición (SOLO superadmin) ----------
  app.patch<{ Params: { id: string }; Body: { transition?: boolean } }>(
    '/api/devices/:id/transition',
    async (req, reply) => {
      const s = getSession(req);
      if (!s || s.role !== 'superadmin') {
        return reply.code(403).send({ error: 'No autorizado.' });
      }
      const { id } = req.params;
      const transition = req.body?.transition === true;
      const result = await pool.query(
        `UPDATE devices SET transition = $1, updated_at = now()
           WHERE id = $2
         RETURNING id AS device_id, code, location_id, target_url, status, transition`,
        [transition, id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Dispositivo no encontrado.' });
      }
      // Refrescar caché Redis (bajo código y UUID) para que surta efecto ya.
      const device = result.rows[0] as DeviceCache & { code: string | null };
      try {
        const payload = JSON.stringify(device);
        if (device.code) await redis.set(deviceCacheKey(device.code), payload, 'EX', 3600);
        await redis.set(deviceCacheKey(device.device_id), payload, 'EX', 3600);
      } catch {
        /* ignore */
      }
      return { ok: true, transition };
    }
  );

  // ---------- Actualizar un dispositivo (destino, estado o modo) ------------
  // Admite target_url/status (comportamiento actual) y además mode +
  // survey_template_id (Función 1). El modo es EXCLUYENTE: 'redirect' (actual)
  // o 'survey'. Al pasar a 'survey' se exige una plantilla válida de la MISMA
  // empresa que la sede del punto; target_url queda intacta. Al pasar a
  // 'redirect', survey_template_id vuelve a NULL.
  app.patch<{
    Params: { id: string };
    Body: { target_url?: string; status?: string; mode?: string; survey_template_id?: string | null };
  }>('/api/devices/:id', async (req, reply) => {
    const { id } = req.params;
    const { target_url, status } = req.body || {};
    {
      const scopeCompany = resolveCompanyId(req);
      const owner = await query<{ company_id: string | null }>(
        `SELECT l.company_id FROM devices d JOIN locations l ON l.id = d.location_id WHERE d.id = $1`,
        [id]
      );
      if (!owner[0] || (scopeCompany !== undefined && owner[0].company_id !== scopeCompany)) {
        return reply.code(404).send({ error: 'Dispositivo no encontrado.' });
      }
    }
    const mode =
      req.body?.mode === 'survey' || req.body?.mode === 'redirect' ? req.body.mode : undefined;

    if (!target_url && !status && mode === undefined) {
      return reply.code(400).send({ error: 'Nada que actualizar.' });
    }
    if (target_url) {
      try {
        // eslint-disable-next-line no-new
        new URL(target_url);
      } catch {
        return reply.code(400).send({ error: 'target_url inválida.' });
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (target_url) {
      params.push(target_url);
      fields.push(`target_url = $${params.length}`);
    }
    if (status) {
      params.push(status);
      fields.push(`status = $${params.length}`);
    }

    if (mode === 'survey') {
      const templateId = req.body?.survey_template_id;
      if (!templateId) {
        return reply.code(400).send({ error: 'Debes elegir una plantilla de encuesta.' });
      }
      // La plantilla debe pertenecer a la MISMA empresa que la sede del punto, y
      // el usuario debe tener alcance sobre esa empresa.
      const companyId = resolveCompanyId(req);
      const check = await query<{ loc_company: string | null; tpl_company: string | null }>(
        `SELECT l.company_id AS loc_company, t.company_id AS tpl_company
           FROM devices d
           JOIN locations l ON l.id = d.location_id
           LEFT JOIN survey_templates t ON t.id = $2
          WHERE d.id = $1`,
        [id, templateId]
      );
      const row = check[0];
      if (!row) {
        return reply.code(404).send({ error: 'Dispositivo no encontrado.' });
      }
      if (row.tpl_company === null && row.loc_company !== null) {
        // La plantilla no existe (LEFT JOIN sin fila) o es global sin empresa:
        // exigir coincidencia con la empresa de la sede.
        return reply.code(400).send({ error: 'Plantilla no válida para esta sede.' });
      }
      if (row.loc_company !== row.tpl_company) {
        return reply.code(400).send({ error: 'La plantilla es de otra empresa.' });
      }
      if (companyId !== undefined && row.loc_company !== companyId) {
        return reply.code(403).send({ error: 'No autorizado para esta sede.' });
      }
      params.push('survey');
      fields.push(`mode = $${params.length}`);
      params.push(templateId);
      fields.push(`survey_template_id = $${params.length}`);
    } else if (mode === 'redirect') {
      params.push('redirect');
      fields.push(`mode = $${params.length}`);
      fields.push(`survey_template_id = NULL`);
    }

    params.push(id);

    const result = await pool.query(
      `UPDATE devices SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${params.length}
       RETURNING id AS device_id, code, location_id, target_url, status,
                 transition, mode, survey_template_id`,
      params
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Dispositivo no encontrado.' });
    }

    const device = result.rows[0] as DeviceCache & { code: string | null };
    // Refrescar caché Redis bajo el código corto Y el UUID (compatibilidad), con
    // mode y survey_template_id para que el motor público resuelva al instante.
    try {
      const payload = JSON.stringify(device);
      if (device.code) await redis.set(deviceCacheKey(device.code), payload, 'EX', 3600);
      await redis.set(deviceCacheKey(device.device_id), payload, 'EX', 3600);
    } catch {
      /* ignore */
    }

    return { ok: true, device };
  });

  // ---------- Crear sede ----------
  app.post<{
    Body: { name?: string; brand?: string; city?: string; status?: string; company_id?: string };
  }>('/api/locations', async (req, reply) => {
    const { name, brand, city, status, company_id } = req.body || {};

    if (!name || !name.trim()) {
      return reply.code(400).send({ error: 'El nombre es obligatorio.' });
    }
    if (!city || !city.trim()) {
      return reply.code(400).send({ error: 'La ciudad es obligatoria.' });
    }
    const st = status === 'inactive' ? 'inactive' : 'active';

    // Empresa: company_admin usa la suya; superadmin usa la enviada (o la del query).
    const s = getSession(req);
    let companyId: string | null = null;
    if (s?.role === 'company_admin') companyId = s.companyId;
    else companyId = company_id || (req.query as any).companyId || null;

    const result = await pool.query(
      `INSERT INTO locations (name, brand, city, status, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, brand, city, status, company_id`,
      [name.trim(), (brand || name).trim(), city.trim(), st, companyId]
    );

    return reply.code(201).send({ ok: true, location: result.rows[0] });
  });

  // ---------- Editar sede ----------
  app.patch<{
    Params: { id: string };
    Body: { name?: string; brand?: string; city?: string; status?: string };
  }>('/api/locations/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, brand, city, status } = req.body || {};
    if (!(await locationInScope(req, id))) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (name && name.trim()) {
      params.push(name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (brand && brand.trim()) {
      params.push(brand.trim());
      fields.push(`brand = $${params.length}`);
    }
    if (city && city.trim()) {
      params.push(city.trim());
      fields.push(`city = $${params.length}`);
    }
    if (status === 'active' || status === 'inactive') {
      params.push(status);
      fields.push(`status = $${params.length}`);
    }
    if (!fields.length) {
      return reply.code(400).send({ error: 'Nada que actualizar.' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE locations SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, brand, city, status`,
      params
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }
    return { ok: true, location: result.rows[0] };
  });

  // ---------- Eliminar sede (y sus dispositivos/escaneos en cascada) ----------
  app.delete<{ Params: { id: string } }>('/api/locations/:id', async (req, reply) => {
    const { id } = req.params;
    if (!(await locationInScope(req, id))) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }

    // Recuperar dispositivos para limpiar su caché en Redis
    const devs = await pool.query('SELECT id FROM devices WHERE location_id = $1', [id]);

    const result = await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }

    try {
      const keys = devs.rows.map((d) => deviceCacheKey(d.id));
      if (keys.length) await redis.del(...keys);
    } catch {
      /* ignore */
    }

    return { ok: true, deletedDevices: devs.rowCount };
  });

  // ---------- Crear dispositivo NFC en una sede ----------
  app.post<{
    Body: { location_id?: string; label?: string; target_url?: string; status?: string };
  }>('/api/devices', async (req, reply) => {
    const { location_id, label, target_url, status } = req.body || {};

    if (!location_id) {
      return reply.code(400).send({ error: 'Debes indicar la sede (location_id).' });
    }
    if (!label || !label.trim()) {
      return reply.code(400).send({ error: 'La etiqueta del punto es obligatoria.' });
    }
    if (!target_url) {
      return reply.code(400).send({ error: 'La target_url es obligatoria.' });
    }
    try {
      // eslint-disable-next-line no-new
      new URL(target_url);
    } catch {
      return reply.code(400).send({ error: 'target_url inválida.' });
    }
    const st = status === 'inactive' ? 'inactive' : 'active';

    // Verificar que la sede exista y, si es company_admin, que sea de su empresa.
    const s = getSession(req);
    const loc = await pool.query('SELECT id, company_id FROM locations WHERE id = $1', [
      location_id,
    ]);
    if (loc.rowCount === 0) {
      return reply.code(404).send({ error: 'La sede indicada no existe.' });
    }
    if (s?.role === 'company_admin' && loc.rows[0].company_id !== s.companyId) {
      return reply.code(403).send({ error: 'No autorizado para esta sede.' });
    }

    const code = await uniqueShortCode();
    const result = await pool.query(
      `INSERT INTO devices (location_id, label, target_url, status, code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS device_id, code, location_id, target_url, status`,
      [location_id, label.trim(), target_url, st, code]
    );

    const device = result.rows[0] as DeviceCache & { code: string };
    // Precargar la caché bajo el código corto (que es lo que irá en la tarjeta/QR).
    try {
      await redis.set(deviceCacheKey(device.code), JSON.stringify(device), 'EX', 3600);
    } catch {
      /* ignore */
    }

    return reply.code(201).send({
      ok: true,
      device,
      redirectPath: `/r/${device.code}`,
    });
  });

  // ---------- Marcas disponibles (para el alcance de cambios masivos) ----------
  app.get('/api/brands', async (req) => {
    const companyId = resolveCompanyId(req);
    if (companyId !== undefined) {
      const rows = await query<{ brand: string; locations: string }>(
        `SELECT brand, COUNT(*) AS locations FROM locations WHERE company_id = $1 GROUP BY brand ORDER BY brand ASC`,
        [companyId]
      );
      return rows.map((r) => ({ brand: r.brand, locations: parseInt(r.locations, 10) }));
    }
    const rows = await query<{ brand: string; locations: string }>(
      `SELECT brand, COUNT(*) AS locations FROM locations GROUP BY brand ORDER BY brand ASC`
    );
    return rows.map((r) => ({ brand: r.brand, locations: parseInt(r.locations, 10) }));
  });

  // ---------- Previsualizar alcance de un cambio masivo ----------
  app.get<{ Querystring: { scope?: string; value?: string } }>(
    '/api/devices/bulk-preview',
    async (req) => {
      const { scope, value } = req.query;
      const { where, params } = bulkScopeWhere(scope, value, 1, resolveCompanyId(req));
      const rows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM devices d
           JOIN locations l ON l.id = d.location_id ${where}`,
        params
      );
      return { affected: parseInt(rows[0]?.count || '0', 10) };
    }
  );

  // ---------- Cambio masivo de destino (campaña) ----------
  app.post<{
    Body: { scope?: string; value?: string; target_url?: string };
  }>('/api/devices/bulk-update', async (req, reply) => {
    const { scope, value, target_url } = req.body || {};

    if (!target_url) {
      return reply.code(400).send({ error: 'La nueva URL es obligatoria.' });
    }
    try {
      // eslint-disable-next-line no-new
      new URL(target_url);
    } catch {
      return reply.code(400).send({ error: 'URL inválida.' });
    }
    if (scope !== 'all' && scope !== 'brand' && scope !== 'location') {
      return reply.code(400).send({ error: 'Alcance inválido.' });
    }
    if ((scope === 'brand' || scope === 'location') && !value) {
      return reply.code(400).send({ error: 'Falta el valor del alcance.' });
    }

    // Alcance acotado por empresa cuando aplica.
    const companyId = resolveCompanyId(req);

    // Para el SELECT/preview el scope empieza en $1.
    const { where, params } = bulkScopeWhere(scope, value, 1, companyId);

    // Snapshot previo (para revertir) de los dispositivos afectados
    const before = await query<{ device_id: string; target_url: string; location_id: string }>(
      `SELECT d.id AS device_id, d.target_url, d.location_id
         FROM devices d JOIN locations l ON l.id = d.location_id ${where}`,
      params
    );
    if (before.length === 0) {
      return reply.code(404).send({ error: 'No hay dispositivos en ese alcance.' });
    }

    // Etiqueta legible del alcance
    let scopeLabel = 'Todas las sedes';
    if (scope === 'brand') scopeLabel = `Marca: ${value}`;
    else if (scope === 'location') {
      const loc = await query<{ name: string }>('SELECT name FROM locations WHERE id = $1', [
        value,
      ]);
      scopeLabel = `Sede: ${loc[0]?.name || value}`;
    }

    // Actualización en lote. Aquí $1 es target_url, así que el scope empieza en $2.
    const upd = bulkScopeWhere(scope, value, 2, companyId);
    const updated = await query<{ device_id: string; code: string | null; location_id: string; status: string }>(
      `UPDATE devices SET target_url = $1, updated_at = now()
         WHERE id IN (
           SELECT d.id FROM devices d JOIN locations l ON l.id = d.location_id ${upd.where}
         )
       RETURNING id AS device_id, code, location_id, status`,
      [target_url, ...upd.params]
    );

    // Refrescar caché Redis de todos los afectados (por código y por UUID)
    try {
      const pipe = redis.pipeline();
      for (const d of updated) {
        const payload = JSON.stringify({
          device_id: d.device_id,
          location_id: d.location_id,
          target_url,
          status: d.status,
          code: d.code,
        });
        if (d.code) pipe.set(deviceCacheKey(d.code), payload, 'EX', 3600);
        pipe.set(deviceCacheKey(d.device_id), payload, 'EX', 3600);
      }
      await pipe.exec();
    } catch {
      /* ignore */
    }

    // Registrar en el historial con el snapshot para poder revertir
    const snapshot = before.map((b) => ({ device_id: b.device_id, target_url: b.target_url }));
    const hist = await query<{ id: string }>(
      `INSERT INTO bulk_updates (scope, scope_label, new_url, affected, snapshot, company_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
      [scope, scopeLabel, target_url, updated.length, JSON.stringify(snapshot), companyId ?? null]
    );

    return { ok: true, affected: updated.length, historyId: hist[0]?.id, scopeLabel };
  });

  // ---------- Historial de cambios masivos ----------
  app.get('/api/bulk-updates', async (req) => {
    const companyId = resolveCompanyId(req);
    const rows = await query(
      `SELECT id, scope, scope_label, new_url, affected, reverted, created_at
         FROM bulk_updates
        ${companyId !== undefined ? 'WHERE company_id = $1' : ''}
        ORDER BY created_at DESC LIMIT 30`,
      companyId !== undefined ? [companyId] : []
    );
    return rows;
  });

  // ---------- Revertir un cambio masivo ----------
  app.post<{ Params: { id: string } }>('/api/bulk-updates/:id/revert', async (req, reply) => {
    const { id } = req.params;
    const companyId = resolveCompanyId(req);
    const rows = await query<{ snapshot: any; reverted: boolean; company_id: string | null }>(
      `SELECT snapshot, reverted, company_id FROM bulk_updates WHERE id = $1`,
      [id]
    );
    if (rows.length === 0 || (companyId !== undefined && rows[0].company_id !== companyId)) {
      return reply.code(404).send({ error: 'Registro no encontrado.' });
    }
    if (rows[0].reverted) {
      return reply.code(400).send({ error: 'Este cambio ya fue revertido.' });
    }

    const snapshot: { device_id: string; target_url: string }[] = rows[0].snapshot || [];
    let restored = 0;
    for (const s of snapshot) {
      const res = await pool.query(
        `UPDATE devices SET target_url = $1, updated_at = now()
           WHERE id = $2
         RETURNING id AS device_id, location_id, status`,
        [s.target_url, s.device_id]
      );
      if (res.rowCount) {
        const d = res.rows[0];
        try {
          await redis.set(
            deviceCacheKey(d.device_id),
            JSON.stringify({
              device_id: d.device_id,
              location_id: d.location_id,
              target_url: s.target_url,
              status: d.status,
            }),
            'EX',
            3600
          );
        } catch {
          /* ignore */
        }
        restored++;
      }
    }

    await pool.query('UPDATE bulk_updates SET reverted = true WHERE id = $1', [id]);
    return { ok: true, restored };
  });

  // ---------- Diagnóstico de un dispositivo ----------
  app.get<{ Params: { id: string } }>('/api/debug/device/:id', async (req) => {
    const { id } = req.params;
    const device = await query(
      `SELECT d.id, d.label, d.status, d.location_id, l.name AS location_name
         FROM devices d JOIN locations l ON l.id = d.location_id
         WHERE d.id = $1`,
      [id]
    );
    const counts = await query<{ total: string; last_scan: string | null }>(
      `SELECT COUNT(*) AS total, MAX(scanned_at) AS last_scan
         FROM scan_events WHERE device_id = $1`,
      [id]
    );
    const recent = await query(
      `SELECT os, scanned_at FROM scan_events
         WHERE device_id = $1 ORDER BY scanned_at DESC LIMIT 5`,
      [id]
    );
    const nowRow = await query<{ now: string; tz: string }>(
      `SELECT now() AS now, current_setting('TIMEZONE') AS tz`
    );
    return {
      device: device[0] || null,
      totalScans: parseInt(counts[0]?.total || '0', 10),
      lastScan: counts[0]?.last_scan || null,
      recent,
      serverNow: nowRow[0]?.now,
      serverTimezone: nowRow[0]?.tz,
    };
  });

  // ---------- Empresas: listar (superadmin ve todas; company_admin la suya) ----------
  app.get('/api/companies', async (req) => {
    const s = getSession(req);
    if (s?.role === 'company_admin') {
      const rows = await query(
        `SELECT id, name, slug, status FROM companies WHERE id = $1`,
        [s.companyId]
      );
      return rows;
    }
    const rows = await query(
      `SELECT c.id, c.name, c.slug, c.status, c.plan, c.trial_ends_at, c.basic_since, c.segment,
              c.unit_one, c.unit_many,
              COUNT(DISTINCT l.id) AS locations,
              COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') AS active_locations,
              COUNT(DISTINCT d.id) FILTER (WHERE d.mode = 'survey') AS survey_points,
              COUNT(DISTINCT d.id) AS points
         FROM companies c
         LEFT JOIN locations l ON l.company_id = c.id
         LEFT JOIN devices d ON d.location_id = l.id
         GROUP BY c.id, c.name, c.slug, c.status, c.plan, c.trial_ends_at, c.basic_since, c.segment,
                  c.unit_one, c.unit_many
         ORDER BY c.name ASC`
    );
    return rows.map((r: any) => {
      const segmentEffective = isSegment(r.segment)
        ? r.segment
        : inferSegment(Number(r.active_locations), Number(r.survey_points), Number(r.points));
      const u = unitsFor(segmentEffective, r.unit_one, r.unit_many);
      return {
        id: r.id, name: r.name, slug: r.slug, status: r.status, plan: r.plan,
        trial_ends_at: r.trial_ends_at, basic_since: r.basic_since,
        locations: parseInt(r.locations, 10),
        segment: r.segment, // null = automático
        segmentEffective,
        unitsCustom: !!(r.unit_one && r.unit_many),
        units: `${u.one} / ${u.many}`,
      };
    });
  });

  // ---------- Plan de la empresa del usuario (permitido también en Básico) ----------
  app.get('/api/plan-status', async (req, reply) => {
    const s = getSession(req);
    const companyId = s?.role === 'company_admin' ? s.companyId : ((req.query as any).companyId as string);
    if (!companyId) return { plan: 'pro' };
    const st = await planStatus(companyId);
    if (!st) return reply.code(404).send({ error: 'Empresa no encontrada.' });
    return st;
  });

  // ---------- Cambiar el plan de una empresa (solo superadmin) ----------
  app.patch<{ Params: { id: string }; Body: { plan?: string; trialDays?: number } }>(
    '/api/companies/:id/plan',
    async (req, reply) => {
      const s = getSession(req);
      if (s?.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede cambiar el plan.' });
      }
      const plan = req.body?.plan;
      if (plan !== 'trial' && plan !== 'pro' && plan !== 'basic') {
        return reply.code(400).send({ error: 'Plan no válido.' });
      }
      const days = Math.min(365, Math.max(1, Number(req.body?.trialDays) || config.trialDays));
      const sql =
        plan === 'trial'
          ? `UPDATE companies SET plan = 'trial', trial_ends_at = now() + ($2 || ' days')::interval,
                    basic_since = NULL, trial_notice_7 = false, trial_notice_1 = false WHERE id = $1`
          : plan === 'pro'
            ? `UPDATE companies SET plan = 'pro', basic_since = NULL WHERE id = $1`
            : `UPDATE companies SET plan = 'basic', basic_since = COALESCE(basic_since, now()) WHERE id = $1`;
      const r = await pool.query(sql, plan === 'trial' ? [req.params.id, String(days)] : [req.params.id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      invalidatePlan(req.params.id);
      return { ok: true };
    }
  );

  // ---------- Segmento de negocio de una empresa (solo superadmin) ----------
  app.patch<{ Params: { id: string }; Body: { segment?: string | null } }>(
    '/api/companies/:id/segment',
    async (req, reply) => {
      const s = getSession(req);
      if (s?.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede cambiar el segmento.' });
      }
      const seg = req.body?.segment;
      if (seg !== null && seg !== '' && !isSegment(seg)) {
        return reply.code(400).send({ error: 'Segmento no válido.' });
      }
      const r = await pool.query(`UPDATE companies SET segment = $1 WHERE id = $2`, [seg || null, req.params.id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      return { ok: true };
    }
  );

  // ---------- Cómo llama la empresa a sus sedes (solo superadmin) ----------
  // Formato "singular / plural" (ej. "almacén / almacenes"); vacío = la del segmento.
  app.patch<{ Params: { id: string }; Body: { units?: string | null } }>(
    '/api/companies/:id/units',
    async (req, reply) => {
      const s = getSession(req);
      if (s?.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede cambiar este nombre.' });
      }
      const raw = (req.body?.units || '').trim();
      let one: string | null = null;
      let many: string | null = null;
      if (raw) {
        const parts = raw.split('/').map((x) => x.trim().toLowerCase());
        if (parts.length !== 2 || !parts[0] || !parts[1] || parts.some((x) => x.length > 40)) {
          return reply.code(400).send({ error: 'Escribe singular / plural, por ejemplo: almacén / almacenes.' });
        }
        [one, many] = parts;
      }
      const r = await pool.query(`UPDATE companies SET unit_one = $1, unit_many = $2 WHERE id = $3`, [one, many, req.params.id]);
      if (r.rowCount === 0) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      return { ok: true };
    }
  );

  // ---------- Empresas: crear (solo superadmin) ----------
  app.post<{ Body: { name?: string } }>('/api/companies', async (req, reply) => {
    const s = getSession(req);
    if (s?.role !== 'superadmin') {
      return reply.code(403).send({ error: 'Solo el superadmin puede crear empresas.' });
    }
    const name = (req.body?.name || '').trim();
    if (!name) return reply.code(400).send({ error: 'El nombre es obligatorio.' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const r = await pool.query(
        // Las empresas nuevas empiezan con la prueba gratis (TRIAL_DAYS).
        `INSERT INTO companies (name, slug, plan, trial_ends_at)
         VALUES ($1, $2, 'trial', now() + ($3 || ' days')::interval)
         RETURNING id, name, slug, status`,
        [name, slug, String(config.trialDays)]
      );
      return reply.code(201).send({ ok: true, company: r.rows[0] });
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Ya existe una empresa con ese nombre.' });
      throw e;
    }
  });

  // ---------- Empresas: activar/suspender (control de suscripción, solo superadmin) ----------
  app.patch<{ Params: { id: string }; Body: { status?: string } }>(
    '/api/companies/:id',
    async (req, reply) => {
      const s = getSession(req);
      if (s?.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede cambiar el estado.' });
      }
      const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
      const r = await pool.query(
        `UPDATE companies SET status = $1 WHERE id = $2 RETURNING id, name, slug, status`,
        [status, req.params.id]
      );
      if (r.rowCount === 0) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      return { ok: true, company: r.rows[0] };
    }
  );

  // ---------- Usuarios: crear admin de empresa (solo superadmin) ----------
  app.post<{ Body: { username?: string; password?: string; company_id?: string; role?: string } }>(
    '/api/users',
    async (req, reply) => {
      const s = getSession(req);
      if (s?.role !== 'superadmin') {
        return reply.code(403).send({ error: 'Solo el superadmin puede crear usuarios.' });
      }
      const username = (req.body?.username || '').trim();
      const password = req.body?.password || '';
      const role = req.body?.role === 'superadmin' ? 'superadmin' : 'company_admin';
      const company_id = role === 'company_admin' ? req.body?.company_id || null : null;
      if (!username || password.length < 6) {
        return reply.code(400).send({ error: 'Usuario y contraseña (mín. 6) requeridos.' });
      }
      if (role === 'company_admin' && !company_id) {
        return reply.code(400).send({ error: 'Debe indicar la empresa del usuario.' });
      }
      try {
        const r = await pool.query(
          `INSERT INTO users (username, password_hash, role, company_id)
           VALUES ($1, $2, $3, $4) RETURNING id, username, role, company_id`,
          [username, hashPassword(password), role, company_id]
        );
        return reply.code(201).send({ ok: true, user: r.rows[0] });
      } catch (e: any) {
        if (e.code === '23505') return reply.code(409).send({ error: 'Ese usuario ya existe.' });
        throw e;
      }
    }
  );

  // ---------- Usuarios: listar (solo superadmin) ----------
  app.get('/api/users', async (req) => {
    const s = getSession(req);
    if (s?.role !== 'superadmin') return [];
    const rows = await query(
      `SELECT u.id, u.username, u.role, u.company_id, c.name AS company_name
         FROM users u LEFT JOIN companies c ON c.id = u.company_id
         ORDER BY u.created_at DESC`
    );
    return rows;
  });

  // ---------- Exportar datos (backup manual en JSON) ----------
  app.get('/api/export', async (req, reply) => {
    const s = getSession(req);
    // Solo superadmin puede exportar todo; company_admin exporta solo su empresa.
    const companyId = resolveCompanyId(req);

    const locParams: any[] = [];
    let locWhere = '';
    if (companyId !== undefined) {
      locParams.push(companyId);
      locWhere = 'WHERE company_id = $1';
    }

    const companies =
      s?.role === 'superadmin'
        ? await query(`SELECT id, name, slug, status, created_at FROM companies ORDER BY name`)
        : await query(`SELECT id, name, slug, status, created_at FROM companies WHERE id = $1`, [
            companyId,
          ]);

    const locations = await query(
      `SELECT id, name, brand, city, status, company_id, created_at
         FROM locations ${locWhere} ORDER BY name`,
      locParams
    );

    const devices = await query(
      `SELECT d.id, d.location_id, d.label, d.target_url, d.status, d.created_at, d.updated_at
         FROM devices d JOIN locations l ON l.id = d.location_id
         ${locWhere ? 'WHERE l.company_id = $1' : ''}
         ORDER BY d.location_id, d.label`,
      locParams
    );

    const scans = await query(
      `SELECT se.id, se.device_id, se.location_id, se.os, se.channel, se.scanned_at
         FROM scan_events se JOIN locations l ON l.id = se.location_id
         ${locWhere ? 'WHERE l.company_id = $1' : ''}
         ORDER BY se.scanned_at`,
      locParams
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      scope: companyId ?? 'all',
      counts: {
        companies: companies.length,
        locations: locations.length,
        devices: devices.length,
        scan_events: scans.length,
      },
      companies,
      locations,
      devices,
      scan_events: scans,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="nfcloud-backup-${stamp}.json"`)
      .send(JSON.stringify(payload, null, 2));
  });

  // ==========================================================================
  // INFORMES PROGRAMADOS POR CORREO (Función 2, Fase B)
  // CRUD de report_schedules + "enviar ahora". Multi-tenant: company_admin solo
  // su empresa; superadmin según ?companyId / body. Si SMTP no está configurado,
  // los envíos informan el estado (no fallan silenciosamente).
  // ==========================================================================

  // Estado del correo (para que la UI muestre si el envío está disponible).
  app.get('/api/mail-status', async () => ({ enabled: isMailEnabled() }));

  // Listar programaciones visibles.
  app.get('/api/report-schedules', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = 'WHERE rs.company_id = $1';
    }
    const rows = await query(
      `SELECT rs.id, rs.company_id, rs.location_id, rs.email, rs.frequency, rs.active,
              rs.next_run_at, rs.last_run_at,
              co.name AS company_name, l.name AS location_name
         FROM report_schedules rs
         LEFT JOIN companies co ON co.id = rs.company_id
         LEFT JOIN locations l ON l.id = rs.location_id
         ${cWhere}
         ORDER BY rs.created_at DESC`,
      cParams
    );
    return rows;
  });

  // Crear una programación.
  app.post<{
    Body: { company_id?: string; location_id?: string; email?: string; frequency?: string };
  }>('/api/report-schedules', async (req, reply) => {
    const s = getSession(req);
    const email = (req.body?.email || '').trim();
    const frequency = req.body?.frequency === 'weekly' ? 'weekly' : 'monthly';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ error: 'Correo del destinatario inválido.' });
    }
    // Empresa: company_admin usa la suya; superadmin la enviada.
    let companyId: string | null = null;
    if (s?.role === 'company_admin') companyId = s.companyId;
    else companyId = req.body?.company_id || (req.query as any).companyId || null;
    if (!companyId) {
      return reply.code(400).send({ error: 'Debes indicar la empresa.' });
    }
    const locationId = req.body?.location_id || null;
    // Validar que la sede (si llega) pertenece a la empresa.
    if (locationId) {
      const l = await query<{ company_id: string | null }>(
        `SELECT company_id FROM locations WHERE id = $1`,
        [locationId]
      );
      if (!l[0] || l[0].company_id !== companyId) {
        return reply.code(400).send({ error: 'La sede no pertenece a la empresa.' });
      }
    }
    // Primer envío = inicio del próximo periodo según la frecuencia, para que la
    // fecha mostrada refleje semanal vs. mensual desde el inicio (no "hoy").
    const now = new Date();
    const firstRun = new Date(now);
    if (frequency === 'weekly') {
      // Próximo lunes (si hoy es lunes, el de la semana siguiente).
      const day = firstRun.getDay(); // 0=domingo..6=sábado
      const add = ((8 - day) % 7) || 7;
      firstRun.setDate(firstRun.getDate() + add);
    } else {
      // Día 1 del próximo mes.
      firstRun.setMonth(firstRun.getMonth() + 1, 1);
    }
    firstRun.setHours(8, 0, 0, 0); // 08:00 local aprox.

    const r = await pool.query(
      `INSERT INTO report_schedules (company_id, location_id, email, frequency, next_run_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, company_id, location_id, email, frequency, active, next_run_at`,
      [companyId, locationId, email, frequency, firstRun]
    );
    return reply.code(201).send({ ok: true, schedule: r.rows[0] });
  });

  // Activar/desactivar o cambiar frecuencia de una programación.
  app.patch<{ Params: { id: string }; Body: { active?: boolean; frequency?: string } }>(
    '/api/report-schedules/:id',
    async (req, reply) => {
      const companyId = resolveCompanyId(req);
      // Comprobar propiedad.
      const owned = await query<{ company_id: string }>(
        `SELECT company_id FROM report_schedules WHERE id = $1`,
        [req.params.id]
      );
      if (!owned[0]) return reply.code(404).send({ error: 'Programación no encontrada.' });
      if (companyId !== undefined && owned[0].company_id !== companyId) {
        return reply.code(403).send({ error: 'No autorizado.' });
      }
      const fields: string[] = [];
      const params: any[] = [];
      if (typeof req.body?.active === 'boolean') {
        params.push(req.body.active);
        fields.push(`active = $${params.length}`);
      }
      if (req.body?.frequency === 'weekly' || req.body?.frequency === 'monthly') {
        params.push(req.body.frequency);
        fields.push(`frequency = $${params.length}`);
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nada que actualizar.' });
      params.push(req.params.id);
      const r = await pool.query(
        `UPDATE report_schedules SET ${fields.join(', ')} WHERE id = $${params.length}
         RETURNING id, active, frequency`,
        params
      );
      return { ok: true, schedule: r.rows[0] };
    }
  );

  // Eliminar una programación.
  app.delete<{ Params: { id: string } }>('/api/report-schedules/:id', async (req, reply) => {
    const companyId = resolveCompanyId(req);
    const owned = await query<{ company_id: string }>(
      `SELECT company_id FROM report_schedules WHERE id = $1`,
      [req.params.id]
    );
    if (!owned[0]) return reply.code(404).send({ error: 'Programación no encontrada.' });
    if (companyId !== undefined && owned[0].company_id !== companyId) {
      return reply.code(403).send({ error: 'No autorizado.' });
    }
    await pool.query(`DELETE FROM report_schedules WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });

  // ==========================================================================
  // AVISOS DE SEDE INACTIVA POR CORREO
  // Mismo patrón multi-tenant que report_schedules. El worker horario hace el
  // envío (src/lib/inactivity-alerts.ts); aquí solo el CRUD y el envío de prueba.
  // ==========================================================================

  /** true si el aviso es visible para la sesión; si no, ya respondió 404/403. */
  async function ownedInactivityAlert(req: any, reply: any): Promise<boolean> {
    const companyId = resolveCompanyId(req);
    const owned = await query<{ company_id: string }>(
      `SELECT company_id FROM inactivity_alerts WHERE id = $1`,
      [req.params.id]
    );
    if (!owned[0]) {
      reply.code(404).send({ error: 'Aviso no encontrado.' });
      return false;
    }
    if (companyId !== undefined && owned[0].company_id !== companyId) {
      reply.code(403).send({ error: 'No autorizado.' });
      return false;
    }
    return true;
  }

  app.get('/api/inactivity-alerts', async (req) => {
    const companyId = resolveCompanyId(req);
    const cParams: any[] = [];
    let cWhere = '';
    if (companyId !== undefined) {
      cParams.push(companyId);
      cWhere = 'WHERE a.company_id = $1';
    }
    return query(
      `SELECT a.id, a.company_id, a.location_id, a.email, a.threshold_hours, a.active,
              a.last_sent_at, l.name AS location_name
         FROM inactivity_alerts a
         LEFT JOIN locations l ON l.id = a.location_id
         ${cWhere}
         ORDER BY a.created_at DESC`,
      cParams
    );
  });

  app.post<{
    Body: { company_id?: string; location_id?: string; email?: string; threshold_hours?: number };
  }>('/api/inactivity-alerts', async (req, reply) => {
    const s = getSession(req);
    const email = (req.body?.email || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ error: 'Correo del destinatario inválido.' });
    }
    const threshold = Number(req.body?.threshold_hours);
    if (!INACTIVITY_THRESHOLDS.includes(threshold)) {
      return reply.code(400).send({ error: 'Tiempo sin actividad no válido.' });
    }
    let companyId: string | null = null;
    if (s?.role === 'company_admin') companyId = s.companyId;
    else companyId = req.body?.company_id || (req.query as any).companyId || null;
    if (!companyId) return reply.code(400).send({ error: 'Debes indicar la empresa.' });
    const locationId = req.body?.location_id || null;
    if (locationId) {
      const l = await query<{ company_id: string | null }>(
        `SELECT company_id FROM locations WHERE id = $1`,
        [locationId]
      );
      if (!l[0] || l[0].company_id !== companyId) {
        return reply.code(400).send({ error: 'La sede no pertenece a la empresa.' });
      }
    }
    const r = await pool.query(
      `INSERT INTO inactivity_alerts (company_id, location_id, email, threshold_hours)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company_id, location_id, email, threshold_hours, active`,
      [companyId, locationId, email, threshold]
    );
    return reply.code(201).send({ ok: true, alert: r.rows[0] });
  });

  app.patch<{ Params: { id: string }; Body: { active?: boolean } }>(
    '/api/inactivity-alerts/:id',
    async (req, reply) => {
      if (!(await ownedInactivityAlert(req, reply))) return reply;
      if (typeof req.body?.active !== 'boolean') {
        return reply.code(400).send({ error: 'Nada que actualizar.' });
      }
      const r = await pool.query(
        `UPDATE inactivity_alerts SET active = $1 WHERE id = $2 RETURNING id, active`,
        [req.body.active, req.params.id]
      );
      return { ok: true, alert: r.rows[0] };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/inactivity-alerts/:id', async (req, reply) => {
    if (!(await ownedInactivityAlert(req, reply))) return reply;
    await pool.query(`DELETE FROM inactivity_alerts WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });

  // Envía ya el estado actual al destinatario, para probar el aviso.
  app.post<{ Params: { id: string } }>('/api/inactivity-alerts/:id/test', async (req, reply) => {
    if (!(await ownedInactivityAlert(req, reply))) return reply;
    if (!isMailEnabled()) {
      return reply.code(503).send({ error: 'El correo no está configurado en el servidor.' });
    }
    try {
      const sent = await sendInactivityTest(req.params.id);
      return { ok: true, sent };
    } catch (err: any) {
      return reply.code(502).send({ error: `No se pudo enviar: ${err.message}` });
    }
  });

  // Enviar un informe AHORA por correo (prueba / envío manual).
  app.post<{
    Body: { email?: string; company_id?: string; location_id?: string; month?: string };
  }>('/api/report-send', async (req, reply) => {
    if (!isMailEnabled()) {
      return reply.code(400).send({ error: 'El envío por correo no está configurado (SMTP).' });
    }
    const s = getSession(req);
    const email = (req.body?.email || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ error: 'Correo del destinatario inválido.' });
    }
    const companyId = resolveCompanyId(req);
    // Empresa concreta para el enlace del informe.
    let targetCompany: string | undefined;
    if (s?.role === 'company_admin') targetCompany = s.companyId || undefined;
    else targetCompany = req.body?.company_id || (req.query as any).companyId || undefined;

    const locationId = req.body?.location_id || undefined;
    const data = await buildReportData({
      month: req.body?.month,
      companyId: targetCompany ?? companyId,
      locationId,
    });

    const p = new URLSearchParams();
    const month = (req.body?.month && /^\d{4}-\d{2}$/.test(req.body.month)) ? req.body.month : '';
    if (month) p.set('month', month);
    if (targetCompany) p.set('companyId', targetCompany);
    if (locationId) p.set('locationId', locationId);
    // Con empresa concreta, enlace firmado que abre sin iniciar sesión.
    const reportUrl = targetCompany
      ? reportLinkUrl({ companyId: targetCompany, locationId, month: normalizeMonth(month || undefined) })
      : `${config.publicBaseUrl}/api/report?${p.toString()}`;

    try {
      await sendReportMail({ to: email, data, reportUrl });
      return { ok: true };
    } catch (e: any) {
      return reply.code(502).send({ error: 'No se pudo enviar el correo: ' + e.message });
    }
  });

  // ==========================================================================
  // INFORME MENSUAL (Función 2, Fase A) — HTML autocontenido imprimible a PDF.
  // Reutiliza las mismas consultas de la analítica, acotadas al mes elegido.
  // GET /api/report?month=YYYY-MM&companyId=&locationId=
  // ==========================================================================
  app.get<{ Querystring: { month?: string; companyId?: string; locationId?: string } }>(
    '/api/report',
    async (req, reply) => {
      const q = req.query;
      const companyId = resolveCompanyId(req);
      const data = await buildReportData({
        month: q.month,
        companyId,
        locationId: q.locationId,
      });
      reply.type('text/html; charset=utf-8').send(reportHtml(data));
    }
  );

  // Informe abierto desde el correo: enlace firmado, sin sesión. Solo lectura y
  // solo el alcance que lleva el token (empresa, sede y mes).
  app.get<{ Params: { token: string } }>('/informe/:token', async (req, reply) => {
    const v = verifyReportLink(req.params.token);
    if (!v.ok) {
      const expired = v.reason === 'expired';
      return reply
        .code(expired ? 410 : 404)
        .type('text/html; charset=utf-8')
        .send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" />
<title>Informe no disponible · NFCloud</title></head>
<body style="margin:0;background:#f5f4f2;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1c1917">
<div style="max-width:440px;margin:12vh auto;padding:32px 28px;background:#fff;border:1px solid #e7e5e4;border-radius:16px">
<div style="font-weight:800;color:#1e40af;font-size:18px;margin-bottom:16px">NFCloud</div>
<h1 style="font-size:20px;margin:0 0 8px">${expired ? 'Este enlace ya venció' : 'Enlace no válido'}</h1>
<p style="color:#78716c;font-size:15px;line-height:1.55;margin:0 0 20px">${
          expired
            ? 'Por seguridad, los enlaces de los informes duran 60 días. Inicia sesión para ver este y otros informes.'
            : 'Revisa que el enlace esté completo o inicia sesión para ver tus informes.'
        }</p>
<a href="/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">Iniciar sesión</a>
</div></body></html>`);
    }
    const company = await query<{ id: string }>(`SELECT id FROM companies WHERE id = $1`, [v.companyId]);
    if (!company[0]) return reply.code(404).send('Informe no disponible.');
    const data = await buildReportData({ month: v.month, companyId: v.companyId, locationId: v.locationId });
    reply
      .header('X-Robots-Tag', 'noindex')
      .header('Referrer-Policy', 'no-referrer')
      .type('text/html; charset=utf-8')
      .send(reportHtml(data));
  });

  // Vista previa del correo del informe (mismo alcance que /api/report).
  app.get<{ Querystring: { month?: string; companyId?: string; locationId?: string } }>(
    '/api/report-mail-preview',
    async (req, reply) => {
      const q = req.query;
      const companyId = resolveCompanyId(req);
      const data = await buildReportData({ month: q.month, companyId, locationId: q.locationId });
      const p = new URLSearchParams();
      if (q.month) p.set('month', q.month);
      if (companyId) p.set('companyId', companyId);
      if (q.locationId) p.set('locationId', q.locationId);
      const html = reportMailHtml(data, {
        reportUrl: companyId
          ? reportLinkUrl({ companyId, locationId: q.locationId, month: normalizeMonth(q.month) })
          : `${config.publicBaseUrl}/api/report?${p.toString()}`,
        assetBaseUrl: config.publicBaseUrl.replace(/\/$/, ''),
      });
      reply.type('text/html; charset=utf-8').send(html);
    }
  );

  // ==========================================================================
  // IMPACTO EN REPUTACIÓN: reseñas ganadas y nota de Google desde la primera
  // medición de cada sede, frente a las interacciones del mismo periodo. Es el
  // argumento de retorno de inversión para el directivo.
  // ==========================================================================
  app.get('/api/reputation-impact', async (req) => {
    const companyId = resolveCompanyId(req);
    const params: any[] = [];
    let scope = '';
    if (companyId !== undefined) {
      params.push(companyId);
      scope = `AND l.company_id = $1`;
    }
    const rows = await query<{
      id: string;
      name: string;
      city: string;
      first_on: string;
      last_on: string;
      first_rating: string;
      last_rating: string;
      first_reviews: number;
      last_reviews: number;
      scans: string;
    }>(
      `WITH ranked AS (
         SELECT rs.*,
                ROW_NUMBER() OVER (PARTITION BY rs.location_id ORDER BY rs.measured_on ASC)  AS rn_first,
                ROW_NUMBER() OVER (PARTITION BY rs.location_id ORDER BY rs.measured_on DESC) AS rn_last
           FROM reputation_snapshots rs
       ),
       per_loc AS (
         SELECT f.location_id,
                f.measured_on AS first_on, l2.measured_on AS last_on,
                f.rating AS first_rating, l2.rating AS last_rating,
                f.review_count AS first_reviews, l2.review_count AS last_reviews
           FROM ranked f
           JOIN ranked l2 ON l2.location_id = f.location_id AND l2.rn_last = 1
          WHERE f.rn_first = 1
       )
       SELECT l.id, l.name, l.city,
              to_char(p.first_on, 'YYYY-MM-DD') AS first_on,
              to_char(p.last_on, 'YYYY-MM-DD') AS last_on,
              p.first_rating, p.last_rating, p.first_reviews, p.last_reviews,
              (SELECT COUNT(*) FROM scan_events se
                WHERE se.location_id = l.id
                  AND se.scanned_at >= ((p.first_on)::timestamp AT TIME ZONE '${APP_TZ}')
                  AND se.scanned_at < (((p.last_on + 1))::timestamp AT TIME ZONE '${APP_TZ}')) AS scans
         FROM per_loc p
         JOIN locations l ON l.id = p.location_id
        WHERE l.status = 'active' ${scope}`,
      params
    );

    // Solo cuentan para el impacto las sedes con al menos dos mediciones.
    const locs = rows
      .filter((r) => r.first_on !== r.last_on)
      .map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        since: r.first_on,
        ratingBefore: parseFloat(r.first_rating),
        ratingNow: parseFloat(r.last_rating),
        reviewsGained: r.last_reviews - r.first_reviews,
        scans: parseInt(r.scans, 10),
      }));

    if (!locs.length) {
      return { measuredLocations: rows.length, comparableLocations: 0, summary: null, locations: [] };
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const reviewsGained = locs.reduce((a, l) => a + l.reviewsGained, 0);
    const scans = locs.reduce((a, l) => a + l.scans, 0);
    return {
      measuredLocations: rows.length,
      comparableLocations: locs.length,
      summary: {
        since: locs.map((l) => l.since).sort()[0],
        reviewsGained,
        ratingBefore: Math.round(avg(locs.map((l) => l.ratingBefore)) * 100) / 100,
        ratingNow: Math.round(avg(locs.map((l) => l.ratingNow)) * 100) / 100,
        scans,
        // Reseñas nuevas por cada 100 interacciones en el mismo periodo.
        reviewsPer100: scans > 0 ? Math.round((reviewsGained / scans) * 1000) / 10 : null,
      },
      locations: locs.sort((a, b) => b.reviewsGained - a.reviewsGained).slice(0, 5),
    };
  });

  // ==========================================================================
  // CAMPAÑAS: bandas sobre la tendencia + efecto frente a los días previos.
  // ==========================================================================
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Campaña visible para el usuario (multi-tenant); null si no existe o no es suya.
  async function campaignInScope(req: any, id: string) {
    const companyId = resolveCompanyId(req);
    const rows = await query<{ id: string; company_id: string }>(
      `SELECT id, company_id FROM campaigns WHERE id = $1`,
      [id]
    );
    const c = rows[0];
    if (!c) return null;
    if (companyId !== undefined && c.company_id !== companyId) return null;
    return c;
  }

  app.get('/api/campaigns', async (req) => {
    const q = req.query as any;
    const companyId = resolveCompanyId(req);
    const params: any[] = [];
    const clauses: string[] = [];
    if (companyId !== undefined) {
      params.push(companyId);
      clauses.push(`c.company_id = $${params.length}`);
    }
    // Solo las que se cruzan con el rango pedido.
    if (q.from && DATE_RE.test(q.from)) {
      params.push(q.from);
      clauses.push(`c.ends_on >= $${params.length}::date`);
    }
    if (q.to && DATE_RE.test(q.to)) {
      params.push(q.to);
      clauses.push(`c.starts_on <= $${params.length}::date`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await query<{
      id: string;
      company_id: string;
      name: string;
      starts_on: string;
      ends_on: string;
      note: string | null;
    }>(
      `SELECT c.id, c.company_id, c.name, c.note,
              to_char(c.starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(c.ends_on, 'YYYY-MM-DD') AS ends_on
         FROM campaigns c
         ${where}
         ORDER BY c.starts_on ASC`,
      params
    );

    // Efecto: promedio diario durante la campaña vs. el mismo nº de días antes.
    const out = [];
    for (const c of rows) {
      const upliftPct = await campaignUplift(c.company_id, c.starts_on, c.ends_on);
      out.push({
        id: c.id,
        name: c.name,
        note: c.note,
        startsOn: c.starts_on,
        endsOn: c.ends_on,
        upliftPct,
      });
    }
    return out;
  });

  app.post<{ Body: { name?: string; startsOn?: string; endsOn?: string; note?: string; company_id?: string } }>(
    '/api/campaigns',
    async (req, reply) => {
      const s = getSession(req);
      const companyId =
        s?.role === 'company_admin'
          ? s.companyId
          : req.body?.company_id || (req.query as any)?.companyId || null;
      if (!companyId) return reply.code(400).send({ error: 'Selecciona una empresa antes de crear la campaña.' });

      const name = (req.body?.name || '').trim();
      const startsOn = (req.body?.startsOn || '').trim();
      const endsOn = (req.body?.endsOn || '').trim();
      const note = (req.body?.note || '').trim() || null;
      if (!name) return reply.code(400).send({ error: 'Ponle un nombre a la campaña.' });
      if (!DATE_RE.test(startsOn) || !DATE_RE.test(endsOn)) {
        return reply.code(400).send({ error: 'Indica la fecha de inicio y de fin.' });
      }
      if (endsOn < startsOn) return reply.code(400).send({ error: 'La fecha de fin no puede ser anterior al inicio.' });

      const r = await pool.query(
        `INSERT INTO campaigns (company_id, name, starts_on, ends_on, note)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [companyId, name.slice(0, 80), startsOn, endsOn, note]
      );
      return { ok: true, id: r.rows[0].id };
    }
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; startsOn?: string; endsOn?: string; note?: string } }>(
    '/api/campaigns/:id',
    async (req, reply) => {
      if (!(await campaignInScope(req, req.params.id))) {
        return reply.code(404).send({ error: 'Campaña no encontrada.' });
      }
      const name = (req.body?.name || '').trim();
      const startsOn = (req.body?.startsOn || '').trim();
      const endsOn = (req.body?.endsOn || '').trim();
      const note = (req.body?.note || '').trim() || null;
      if (!name || !DATE_RE.test(startsOn) || !DATE_RE.test(endsOn) || endsOn < startsOn) {
        return reply.code(400).send({ error: 'Revisa el nombre y las fechas de la campaña.' });
      }
      await pool.query(
        `UPDATE campaigns SET name = $1, starts_on = $2, ends_on = $3, note = $4 WHERE id = $5`,
        [name.slice(0, 80), startsOn, endsOn, note, req.params.id]
      );
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/campaigns/:id', async (req, reply) => {
    if (!(await campaignInScope(req, req.params.id))) {
      return reply.code(404).send({ error: 'Campaña no encontrada.' });
    }
    await pool.query(`DELETE FROM campaigns WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });

  // ---------- Health ----------
  app.get('/api/health', async () => {
    let db = false;
    let cache = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch {
      /* */
    }
    try {
      await redis.ping();
      cache = true;
    } catch {
      /* */
    }
    return { status: 'ok', db, cache };
  });
}
