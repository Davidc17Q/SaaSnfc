/**
 * Rescate del cliente insatisfecho: cuando una encuesta llega con mala nota,
 * se avisa al instante a los responsables que lo pidieron (avisos con
 * low_survey = true), por correo y/o WhatsApp/SMS, con el comentario y, si el
 * cliente lo dejó, su número para contactarlo.
 *
 * No toca a Google: a todos los clientes se les sigue ofreciendo la reseña.
 * Esto sirve para atender al cliente, no para filtrar quién reseña.
 */
import { query } from '../db/pool';
import { redis } from '../db/redis';
import { config } from '../config';
import { isMailEnabled, sendHtmlMail } from './mailer';
import { isMessagingEnabled, sendAlertMessage } from './messaging';

/** Tope de avisos por responsable y día, para que una mala racha no sea spam. */
const DAILY_CAP = 20;

/** "Mala nota": alguna calificación en el 40 % inferior de la escala (1-2 de 5). */
export function isLowRating(ratings: number[], scaleMax: number): boolean {
  if (!ratings.length) return false;
  return Math.min(...ratings) <= Math.max(1, Math.floor(scaleMax * 0.4));
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

async function underCap(alertId: string): Promise<boolean> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `lowsurvey:${alertId}:${day}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 86400);
    return n <= DAILY_CAP;
  } catch {
    return true; // Redis caído: mejor avisar que perder el aviso
  }
}

export async function notifyLowSurvey(input: {
  locationId: string;
  ratings: number[];
  scaleMax: number;
  comment: string | null;
  contact: string | null;
}): Promise<void> {
  if (!isLowRating(input.ratings, input.scaleMax)) return;
  if (!isMailEnabled() && !isMessagingEnabled()) return;

  const alerts = await query<{ id: string; email: string | null; phone: string | null; company_name: string; loc_name: string }>(
    `SELECT a.id, a.email, a.phone, co.name AS company_name, l.name AS loc_name
       FROM inactivity_alerts a
       JOIN companies co ON co.id = a.company_id
       JOIN locations l ON l.id = $1 AND l.company_id = a.company_id
      WHERE a.active = true AND a.low_survey = true
        AND (a.location_id IS NULL OR a.location_id = l.id)
        AND co.plan <> 'basic'
        AND NOT (co.plan = 'trial' AND co.trial_ends_at IS NOT NULL AND co.trial_ends_at <= now())`,
    [input.locationId]
  );
  if (!alerts.length) return;

  const avg = input.ratings.reduce((a, b) => a + b, 0) / input.ratings.length;
  const nota = `${avg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} de ${input.scaleMax}`;
  const comment = input.comment ? input.comment.replace(/\s+/g, ' ').trim() : '';
  const short = comment.length > 140 ? comment.slice(0, 137) + '…' : comment;
  const link = `${config.publicBaseUrl.replace(/\/$/, '')}/`;

  for (const a of alerts) {
    if (!(await underCap(a.id))) continue;
    const text =
      `Un cliente calificó ${nota} en ${a.loc_name}` +
      (short ? `: "${short}".` : '.') +
      (input.contact ? ` Pidió que lo contacten: ${input.contact}.` : ' Revisa hoy con el equipo de la sede.');
    if (a.phone && isMessagingEnabled()) {
      await sendAlertMessage(a.phone, { companyName: a.company_name, text, link }).catch((e) =>
        console.error('[encuesta] aviso por celular falló:', e.message)
      );
    }
    if (a.email && isMailEnabled()) {
      const html = `<div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;color:#1c1917">
        <p style="font-weight:800;font-size:18px;margin:0 0 4px">Cliente insatisfecho en ${esc(a.loc_name)}</p>
        <p style="color:#6b7280;margin:0 0 16px">${esc(a.company_name)} · encuesta de satisfacción</p>
        <p style="font-size:15px;line-height:1.55">Calificó <b>${esc(nota)}</b>.${short ? ` Comentario: “${esc(comment)}”` : ''}</p>
        ${input.contact
          ? `<p style="font-size:15px;line-height:1.55;background:#fef3c7;padding:12px 14px;border-radius:10px">Pidió que lo contacten: <b>${esc(input.contact)}</b>. Escríbele hoy: un cliente atendido a tiempo suele volver.</p>`
          : '<p style="font-size:15px;line-height:1.55">No dejó contacto. Revisa hoy con el equipo de la sede qué pudo pasar.</p>'}
        <p><a href="${esc(link)}" style="color:#2563eb;font-weight:700">Ver en el panel</a></p>
      </div>`;
      await sendHtmlMail(a.email, `${a.company_name}: cliente insatisfecho en ${a.loc_name}`, html).catch((e) =>
        console.error('[encuesta] aviso por correo falló:', e.message)
      );
    }
  }
}
