/**
 * Datos adicionales del informe "en 5 capítulos": ranking con mini-tendencias,
 * mapa de calor día × hora, comparación con el mes anterior, campañas con
 * antes/durante/después, comentarios de clientes y reputación de Google.
 *
 * Todo es opcional: cada bloque vuelve vacío/null si no hay datos, y el informe
 * oculta o adapta el capítulo correspondiente.
 */
import { query } from '../db/pool';
import { campaignUplift } from './campaign-effect';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

export interface StoryRankRow {
  name: string;
  city: string;
  scans: number;
  prev: number;
  series: number[]; // interacciones por día del periodo
  rating: number | null; // nota media de la encuesta en el periodo
  silent: boolean; // sin actividad en los últimos días con historial previo
}

export interface StoryCampaign {
  name: string;
  startsOn: string;
  endsOn: string;
  upliftPct: number | null;
  before: number | null; // interacciones diarias promedio
  during: number | null;
  after: number | null; // null si todavía no termina (o no hay días después)
  inProgress: boolean;
  dayN: number;
  days: number;
}

export interface StoryData {
  units: 'stores' | 'points'; // ranking de tiendas o de puntos NFC (una sola sede)
  prevTrend: number[]; // por día del mes anterior (índice = día - 1)
  periodDays: number; // días transcurridos del periodo (para series)
  ranking: StoryRankRow[];
  heat: number[][]; // [lunes..domingo][0..23]
  campaigns: StoryCampaign[];
  comments: { text: string; rating: number; location: string }[];
  worstAspect: { location: string; aspect: string; avg: number; chainAvg: number } | null;
  reputation: { reviewsGained: number; ratingNow: number; ratingDelta: number; stores: number } | null;
}

export interface StoryScope {
  companyId?: string;
  locationId?: string;
  from: string; // 'YYYY-MM-DD' primer día del mes
  to: string; // 'YYYY-MM-DD' último día del mes
  prevFrom: string; // primer día del mes anterior
  prevTo: string; // fin EXCLUSIVO de la comparación (mes en curso: mismos días)
}

const ts = (n: number) => `(($${n}::date)::timestamp AT TIME ZONE '${APP_TZ}')`;
const tsEnd = (n: number) => `((($${n}::date + 1))::timestamp AT TIME ZONE '${APP_TZ}')`;

export async function buildStory(s: StoryScope): Promise<StoryData> {
  // Alcance común sobre locations (l).
  const scopeParams: any[] = [];
  const scopeSql: string[] = [`l.status = 'active'`];
  if (s.companyId !== undefined) {
    scopeParams.push(s.companyId);
    scopeSql.push(`l.company_id = $${scopeParams.length}`);
  }
  if (s.locationId) {
    scopeParams.push(s.locationId);
    scopeSql.push(`l.id = $${scopeParams.length}`);
  }
  const scopeWhere = scopeSql.join(' AND ');
  const n0 = scopeParams.length;

  // Días transcurridos del periodo (un mes en curso se corta en hoy).
  const todayRow = await query<{ today: string }>(
    `SELECT to_char((now() AT TIME ZONE '${APP_TZ}')::date, 'YYYY-MM-DD') AS today`
  );
  const today = todayRow[0].today;
  const end = today < s.to ? today : s.to;
  const periodDays = Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(s.from)) / 86_400_000) + 1
  );

  // --- Mes anterior, por día --------------------------------------------------
  const prevRows = await query<{ d: number; c: string }>(
    `SELECT EXTRACT(DAY FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS d, COUNT(*) AS c
       FROM scan_events se JOIN locations l ON l.id = se.location_id
      WHERE ${scopeWhere}
        AND se.scanned_at >= ${ts(n0 + 1)} AND se.scanned_at < ${ts(n0 + 2)}
      GROUP BY d`,
    [...scopeParams, s.prevFrom, s.from]
  );
  const prevDays = new Date(Date.parse(s.from) - 86_400_000).getUTCDate();
  const prevTrend = Array.from({ length: prevDays }, () => 0);
  for (const r of prevRows) if (r.d >= 1 && r.d <= prevDays) prevTrend[r.d - 1] = parseInt(r.c, 10);

  // --- Ranking: tiendas, o puntos NFC si el alcance es una sola sede ----------
  const locCount = await query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM locations l WHERE ${scopeWhere}`,
    scopeParams
  );
  const units: 'stores' | 'points' = parseInt(locCount[0]?.c || '0', 10) >= 2 ? 'stores' : 'points';
  const key = units === 'stores' ? 'l.id' : 'd.id';
  const label = units === 'stores' ? 'l.name' : 'd.label';
  const sub = units === 'stores' ? 'l.city' : 'l.name';

  const base = await query<{ k: string; name: string; sub: string; curr: string; prev: string }>(
    `SELECT ${key} AS k, ${label} AS name, ${sub} AS sub,
            COUNT(se.id) FILTER (WHERE se.scanned_at >= ${ts(n0 + 1)} AND se.scanned_at < ${tsEnd(n0 + 2)}) AS curr,
            COUNT(se.id) FILTER (WHERE se.scanned_at >= ${ts(n0 + 3)} AND se.scanned_at < ${ts(n0 + 4)}) AS prev
       FROM locations l
       JOIN devices d ON d.location_id = l.id
       LEFT JOIN scan_events se ON se.device_id = d.id
                               AND se.scanned_at >= ${ts(n0 + 3)} AND se.scanned_at < ${tsEnd(n0 + 2)}
      WHERE ${scopeWhere} ${units === 'points' ? `AND d.mode = 'redirect'` : ''}
      GROUP BY ${key}, ${label}, ${sub}`,
    [...scopeParams, s.from, s.to, s.prevFrom, s.prevTo]
  );
  const daily = await query<{ k: string; d: number; c: string }>(
    `SELECT ${key} AS k, EXTRACT(DAY FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS d, COUNT(*) AS c
       FROM scan_events se
       JOIN devices d ON d.id = se.device_id
       JOIN locations l ON l.id = d.location_id
      WHERE ${scopeWhere} AND se.scanned_at >= ${ts(n0 + 1)} AND se.scanned_at < ${tsEnd(n0 + 2)}
      GROUP BY ${key}, d`,
    [...scopeParams, s.from, s.to]
  );
  const ratings =
    units === 'stores'
      ? await query<{ k: string; avg: string }>(
          `SELECT sr.location_id AS k, AVG(a.rating)::numeric(4,2) AS avg
             FROM survey_answers a
             JOIN survey_responses sr ON sr.id = a.response_id
             JOIN locations l ON l.id = sr.location_id
            WHERE ${scopeWhere} AND sr.submitted_at >= ${ts(n0 + 1)} AND sr.submitted_at < ${tsEnd(n0 + 2)}
            GROUP BY sr.location_id`,
          [...scopeParams, s.from, s.to]
        )
      : [];
  const seriesBy = new Map<string, number[]>();
  for (const r of daily) {
    const arr = seriesBy.get(r.k) || Array.from({ length: periodDays }, () => 0);
    if (r.d >= 1 && r.d <= periodDays) arr[r.d - 1] = parseInt(r.c, 10);
    seriesBy.set(r.k, arr);
  }
  const ratingBy = new Map(ratings.map((r) => [r.k, parseFloat(r.avg)]));
  const ranking: StoryRankRow[] = base.map((r) => {
    const series = seriesBy.get(r.k) || Array.from({ length: periodDays }, () => 0);
    const recent = series.slice(-3).reduce((a, b) => a + b, 0);
    const earlier = series.slice(0, -3);
    const earlierAvg = earlier.length ? earlier.reduce((a, b) => a + b, 0) / earlier.length : 0;
    return {
      name: r.name,
      city: r.sub,
      scans: parseInt(r.curr, 10),
      prev: parseInt(r.prev, 10),
      series,
      rating: ratingBy.has(r.k) ? (ratingBy.get(r.k) as number) : null,
      silent: periodDays >= 7 && recent === 0 && earlierAvg >= 2,
    };
  });
  ranking.sort((a, b) => b.scans - a.scans);

  // --- Mapa de calor: lunes..domingo × 0..23 ----------------------------------
  const heatRows = await query<{ dw: number; h: number; c: string }>(
    `SELECT (EXTRACT(ISODOW FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int - 1) AS dw,
            EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS h, COUNT(*) AS c
       FROM scan_events se JOIN locations l ON l.id = se.location_id
      WHERE ${scopeWhere} AND se.scanned_at >= ${ts(n0 + 1)} AND se.scanned_at < ${tsEnd(n0 + 2)}
      GROUP BY dw, h`,
    [...scopeParams, s.from, s.to]
  );
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of heatRows) heat[r.dw][r.h] = parseInt(r.c, 10);

  // --- Campañas: antes / durante / después ------------------------------------
  const campaigns: StoryCampaign[] = [];
  if (s.companyId !== undefined) {
    const rows = await query<{ name: string; starts_on: string; ends_on: string }>(
      `SELECT name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
         FROM campaigns
        WHERE company_id = $1 AND ends_on >= $2::date AND starts_on <= $3::date
        ORDER BY starts_on ASC`,
      [s.companyId, s.from, s.to]
    );
    for (const c of rows) {
      const w = await query<{ len: number; ran: number; before: string; during: string; after: string; after_days: number }>(
        `WITH p AS (
           SELECT $2::date AS s, $3::date AS e, ($3::date - $2::date + 1) AS len,
                  (now() AT TIME ZONE '${APP_TZ}')::date AS hoy
         ), q AS (
           SELECT s, e, len, hoy,
                  GREATEST(0, LEAST(e, hoy) - s + 1) AS ran,
                  GREATEST(0, LEAST(e + len, hoy) - e) AS after_days
             FROM p
         )
         SELECT q.len, q.ran, q.after_days,
                (SELECT COUNT(*) FROM scan_events se
                  WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
                    AND se.scanned_at >= ((q.s - q.len)::timestamp AT TIME ZONE '${APP_TZ}')
                    AND se.scanned_at <  ((q.s)::timestamp AT TIME ZONE '${APP_TZ}')) AS before,
                (SELECT COUNT(*) FROM scan_events se
                  WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
                    AND se.scanned_at >= ((q.s)::timestamp AT TIME ZONE '${APP_TZ}')
                    AND se.scanned_at <  ((q.s + q.ran)::timestamp AT TIME ZONE '${APP_TZ}')) AS during,
                (SELECT COUNT(*) FROM scan_events se
                  WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
                    AND se.scanned_at >= ((q.e + 1)::timestamp AT TIME ZONE '${APP_TZ}')
                    AND se.scanned_at <  ((q.e + 1 + q.after_days)::timestamp AT TIME ZONE '${APP_TZ}')) AS after
           FROM q`,
        [s.companyId, c.starts_on, c.ends_on]
      );
      const r = w[0];
      const avg = (total: string, days: number) => (days > 0 ? Math.round(parseInt(total, 10) / days) : null);
      campaigns.push({
        name: c.name,
        startsOn: c.starts_on,
        endsOn: c.ends_on,
        upliftPct: await campaignUplift(s.companyId, c.starts_on, c.ends_on),
        before: avg(r.before, r.len),
        during: avg(r.during, r.ran),
        after: r.after_days >= Math.min(3, r.len) ? avg(r.after, r.after_days) : null,
        inProgress: r.ran < r.len,
        dayN: r.ran,
        days: r.len,
      });
    }
  }

  // --- Comentarios y aspecto más débil ----------------------------------------
  const commentRows = await query<{ comment: string; avg: string; location: string }>(
    `SELECT sr.comment, AVG(a.rating)::numeric(3,1) AS avg, l.name AS location, sr.submitted_at
       FROM survey_responses sr
       JOIN survey_answers a ON a.response_id = sr.id
       JOIN locations l ON l.id = sr.location_id
      WHERE ${scopeWhere} AND sr.comment IS NOT NULL AND sr.comment <> ''
        AND sr.submitted_at >= ${ts(n0 + 1)} AND sr.submitted_at < ${tsEnd(n0 + 2)}
      GROUP BY sr.id, sr.comment, l.name, sr.submitted_at
      ORDER BY sr.submitted_at DESC
      LIMIT 60`,
    [...scopeParams, s.from, s.to]
  );
  const scored = commentRows.map((r) => ({ text: r.comment, rating: parseFloat(r.avg), location: r.location }));
  const comments: StoryData['comments'] = [];
  const used = new Set<string>();
  const take = (c?: { text: string; rating: number; location: string }) => {
    if (c && !used.has(c.text)) {
      used.add(c.text);
      comments.push(c);
    }
  };
  // Dos positivos y uno crítico: equilibrado y útil.
  const pos = scored.filter((c) => c.rating >= 4).slice(0, 2);
  const neg = scored.filter((c) => c.rating < 3.5).sort((a, b) => a.rating - b.rating)[0];
  pos.forEach(take);
  take(neg);

  const aspectRows = await query<{ location: string; aspect: string; avg: string; n: string }>(
    `SELECT l.name AS location, x.label AS aspect, AVG(a.rating)::numeric(4,2) AS avg, COUNT(*) AS n
       FROM survey_answers a
       JOIN survey_aspects x ON x.id = a.aspect_id
       JOIN survey_responses sr ON sr.id = a.response_id
       JOIN locations l ON l.id = sr.location_id
      WHERE ${scopeWhere} AND sr.submitted_at >= ${ts(n0 + 1)} AND sr.submitted_at < ${tsEnd(n0 + 2)}
      GROUP BY l.name, x.label`,
    [...scopeParams, s.from, s.to]
  );
  let worstAspect: StoryData['worstAspect'] = null;
  const chainBy = new Map<string, { sum: number; n: number }>();
  for (const r of aspectRows) {
    const c = chainBy.get(r.aspect) || { sum: 0, n: 0 };
    c.sum += parseFloat(r.avg) * parseInt(r.n, 10);
    c.n += parseInt(r.n, 10);
    chainBy.set(r.aspect, c);
  }
  for (const r of aspectRows) {
    if (parseInt(r.n, 10) < 10) continue; // poca base: no se señala
    const avg = parseFloat(r.avg);
    const chain = chainBy.get(r.aspect)!;
    const chainAvg = Math.round((chain.sum / chain.n) * 10) / 10;
    if (avg < 3.8 && (!worstAspect || avg < worstAspect.avg)) {
      worstAspect = { location: r.location, aspect: r.aspect, avg: Math.round(avg * 10) / 10, chainAvg };
    }
  }

  // --- Reputación de Google en el mes -----------------------------------------
  const repRows = await query<{ now_r: string | null; now_c: number | null; then_r: string | null; then_c: number | null }>(
    `SELECT
       (SELECT rating FROM reputation_snapshots r WHERE r.location_id = l.id AND r.measured_on <= $${n0 + 2}::date ORDER BY measured_on DESC LIMIT 1) AS now_r,
       (SELECT review_count FROM reputation_snapshots r WHERE r.location_id = l.id AND r.measured_on <= $${n0 + 2}::date ORDER BY measured_on DESC LIMIT 1) AS now_c,
       (SELECT rating FROM reputation_snapshots r WHERE r.location_id = l.id AND r.measured_on < $${n0 + 1}::date ORDER BY measured_on DESC LIMIT 1) AS then_r,
       (SELECT review_count FROM reputation_snapshots r WHERE r.location_id = l.id AND r.measured_on < $${n0 + 1}::date ORDER BY measured_on DESC LIMIT 1) AS then_c
       FROM locations l
      WHERE ${scopeWhere}`,
    [...scopeParams, s.from, s.to]
  );
  const both = repRows.filter((r) => r.now_r !== null && r.then_r !== null);
  const reputation = both.length
    ? {
        stores: both.length,
        reviewsGained: both.reduce((a, r) => a + ((r.now_c || 0) - (r.then_c || 0)), 0),
        ratingNow: Math.round((both.reduce((a, r) => a + parseFloat(r.now_r as string), 0) / both.length) * 10) / 10,
        ratingDelta:
          Math.round(
            (both.reduce((a, r) => a + parseFloat(r.now_r as string) - parseFloat(r.then_r as string), 0) / both.length) * 10
          ) / 10,
      }
    : null;

  return { units, prevTrend, periodDays, ranking, heat, campaigns, comments, worstAspect, reputation };
}
