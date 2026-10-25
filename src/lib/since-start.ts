/**
 * "Desde que empezaste": lo acumulado desde la primera interacción, para que
 * el cliente vea el valor de NFCloud en una frase (informe, correo y panel).
 *
 * Solo cifras medidas: interacciones, personas distintas aproximadas (por
 * dispositivo: IP + navegador), contactos directos, reseñas abiertas,
 * respuestas de encuesta y reseñas ganadas en Google. No se inventan montos de
 * dinero. El crecimiento compara el uso diario del primer mes con el de los
 * últimos 30 días, y solo con 45 días o más de historia.
 */
import { query } from '../db/pool';
import { SEGMENTS, type Segment } from './segments';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

export interface SinceStart {
  firstScan: string; // fecha local 'YYYY-MM-DD' de la primera interacción
  days: number; // días desde entonces
  total: number;
  people: number; // personas distintas, aproximado
  contacts: number; // WhatsApp, llamada o correo
  whatsapp: number;
  reviews: number; // aperturas de la reseña de Google
  responses: number; // respuestas de encuesta
  reviewsGained: number | null; // reseñas ganadas en Google desde la primera medición
  growthPct: number | null; // uso diario últimos 30 días vs. primer mes
  tone: 'up' | 'down' | 'flat';
  title: string; // "Desde el 12 de octubre de 2026"
  benefit: string; // la frase de valor, en palabras del segmento
  detail: string; // cifras y crecimiento
}

export async function sinceStart(
  scope: { companyId?: string; locationId?: string },
  segment: Segment
): Promise<SinceStart | null> {
  const params: any[] = [];
  const clauses: string[] = [];
  if (scope.locationId) {
    params.push(scope.locationId);
    clauses.push(`location_id = $${params.length}`);
  }
  if (scope.companyId !== undefined) {
    params.push(scope.companyId);
    clauses.push(`location_id IN (SELECT id FROM locations WHERE company_id = $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const r = (
    await query<Record<string, string | null>>(
      `SELECT to_char(MIN(scanned_at) AT TIME ZONE '${APP_TZ}', 'YYYY-MM-DD') AS first_day,
              EXTRACT(EPOCH FROM (now() - MIN(scanned_at))) / 86400 AS days,
              COUNT(*) AS total,
              COUNT(DISTINCT COALESCE(ip, '') || '|' || COALESCE(user_agent, '')) AS people,
              COUNT(*) FILTER (WHERE channel IN ('WhatsApp', 'Llamada', 'Email')) AS contacts,
              COUNT(*) FILTER (WHERE channel = 'WhatsApp') AS wa,
              COUNT(*) FILTER (WHERE channel = 'Google Reviews') AS reviews
         FROM scan_events ${where}`,
      params
    )
  )[0];
  const n = (v: string | null | undefined) => parseInt(v || '0', 10);
  const total = n(r?.total);
  if (!total || !r?.first_day) return null;
  const days = Math.floor(parseFloat(r.days || '0'));

  // Crecimiento: uso diario del primer mes frente a los últimos 30 días.
  let growthPct: number | null = null;
  if (days >= 45) {
    const g = (
      await query<{ first30: string; last30: string }>(
        `SELECT COUNT(*) FILTER (WHERE scanned_at < (SELECT MIN(scanned_at) FROM scan_events ${where}) + INTERVAL '30 days') AS first30,
                COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '30 days') AS last30
           FROM scan_events ${where}`,
        params
      )
    )[0];
    const a = n(g?.first30);
    const b = n(g?.last30);
    if (a >= 10) growthPct = Math.round(((b - a) / a) * 1000) / 10;
  }

  const responses = n(
    (
      await query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM survey_responses ${where}`,
        params
      )
    )[0]?.c
  );

  // Reseñas ganadas en Google: última menos primera medición de cada sede.
  let reviewsGained: number | null = null;
  const rep = await query<{ gained: string | null }>(
    `SELECT SUM(last_c - first_c) AS gained FROM (
       SELECT (array_agg(review_count ORDER BY measured_on DESC))[1] AS last_c,
              (array_agg(review_count ORDER BY measured_on ASC))[1] AS first_c
         FROM reputation_snapshots ${where}
        GROUP BY location_id HAVING COUNT(*) >= 2) t`,
    params
  );
  if (rep[0]?.gained !== null && rep[0]?.gained !== undefined) reviewsGained = n(rep[0].gained);

  const people = Math.min(n(r.people), total);
  const contacts = n(r.contacts);
  const whatsapp = n(r.wa);
  const reviews = n(r.reviews);
  const fmt = (v: number) => new Intl.NumberFormat('es-CO').format(v);
  const pct = (v: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(v);
  const [y, m, d] = r.first_day.split('-').map(Number);
  const firstLabel = new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  // La frase de valor, en palabras de cada negocio.
  const audience = SEGMENTS[segment].audience;
  let benefit: string;
  if (segment === 'professional') {
    benefit = `Aproximadamente ${fmt(people)} personas ya conocieron tu trabajo${
      contacts ? ` y ${fmt(contacts)} abrieron tu contacto directo (WhatsApp, llamada o correo)` : ''
    }.`;
  } else if (segment === 'institution') {
    benefit = responses
      ? `${fmt(responses)} ciudadanos ya calificaron la atención: cada respuesta es un dato para mejorar el servicio.`
      : `Aproximadamente ${fmt(people)} ciudadanos ya usaron tus puntos de atención.`;
  } else if (reviews) {
    benefit = `${fmt(reviews)} ${audience} abrieron tu reseña de Google${
      reviewsGained && reviewsGained > 0 ? ` y tu ficha ganó ${fmt(reviewsGained)} reseñas desde la primera medición` : ''
    }${whatsapp ? `; ${fmt(whatsapp)} te escribieron por WhatsApp` : ''}.`;
  } else {
    benefit = `Aproximadamente ${fmt(people)} ${audience} interactuaron con tus puntos NFC${
      whatsapp ? ` y ${fmt(whatsapp)} te escribieron por WhatsApp` : ''
    }.`;
  }

  const tone: SinceStart['tone'] =
    growthPct === null ? 'up' : growthPct >= 5 ? 'up' : growthPct <= -5 ? 'down' : 'flat';
  const growthTxt =
    growthPct === null
      ? days < 45
        ? 'En unas semanas podremos mostrarte cuánto ha crecido tu uso.'
        : ''
      : Math.abs(growthPct) < 5
        ? 'Tu uso diario se mantiene estable frente a tu primer mes.'
        : `Tu uso diario ${growthPct > 0 ? 'creció' : 'bajó'} ${pct(Math.abs(growthPct))} % frente a tu primer mes.`;

  return {
    firstScan: r.first_day,
    days,
    total,
    people,
    contacts,
    whatsapp,
    reviews,
    responses,
    reviewsGained,
    growthPct,
    tone,
    title: `Desde el ${firstLabel}`,
    benefit,
    detail: `${fmt(total)} interacciones en ${fmt(Math.max(days, 1))} días. ${growthTxt}`.trim(),
  };
}
