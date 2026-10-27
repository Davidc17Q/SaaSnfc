/**
 * Avisos de sede inactiva por correo y/o WhatsApp (SMS de respaldo).
 *
 * Cada hora (desde el worker de scheduler.ts) busca sedes activas que llevan
 * más de threshold_hours sin una sola interacción y envía UN correo por aviso
 * con todas las sedes nuevas en esa situación. Cada sede se avisa una vez por
 * episodio (ver inactivity_alert_notices en schema.sql): si se recupera y se
 * vuelve a apagar, se avisa de nuevo.
 *
 * Solo se envía en horario de negocio (APP_TIMEZONE) para no despertar a
 * nadie. Las empresas en plan Básico no reciben avisos (son parte del panel).
 */
import { pool, query } from '../db/pool';
import { config } from '../config';
import { isMailEnabled, sendHtmlMail } from './mailer';
import { isMessagingEnabled, sendAlertMessage } from './messaging';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';
const SEND_FROM_HOUR = 7;
const SEND_UNTIL_HOUR = 20;

export const THRESHOLD_OPTIONS = [24, 48, 72, 168];

export interface InactiveLocation {
  locationId: string;
  name: string;
  city: string;
  lastScan: Date | null;
}

interface InactiveRow {
  alert_id: string;
  email: string | null;
  phone: string | null;
  threshold_hours: number;
  company_name: string;
  location_id: string;
  name: string;
  city: string;
  last_scan: Date | null;
}

/** Hora actual (0-23) en la zona del negocio. */
function businessHour(now = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: APP_TZ }).format(now);
  return parseInt(h, 10);
}

/**
 * Sedes que superan el umbral de cada aviso activo. Con onlyNew=true descarta
 * las que ya se avisaron en este mismo episodio de inactividad.
 */
async function findInactive(opts: { onlyNew: boolean; alertId?: string }): Promise<InactiveRow[]> {
  const params: any[] = [];
  let extra = '';
  if (opts.alertId) {
    params.push(opts.alertId);
    extra += ` AND a.id = $${params.length}`;
  } else {
    extra += ` AND a.active = true`;
  }
  if (opts.onlyNew) {
    extra += ` AND (n.alert_id IS NULL OR n.last_scan_at IS DISTINCT FROM ls.last_scan)`;
  }
  return query<InactiveRow>(
    `SELECT a.id AS alert_id, a.email, a.phone, a.threshold_hours, co.name AS company_name,
            l.id AS location_id, l.name, l.city, ls.last_scan
       FROM inactivity_alerts a
       JOIN companies co ON co.id = a.company_id
       JOIN locations l  ON l.company_id = a.company_id AND l.status = 'active'
                        AND (a.location_id IS NULL OR l.id = a.location_id)
       LEFT JOIN LATERAL (
         SELECT MAX(se.scanned_at) AS last_scan FROM scan_events se WHERE se.location_id = l.id
       ) ls ON true
       LEFT JOIN inactivity_alert_notices n ON n.alert_id = a.id AND n.location_id = l.id
      WHERE COALESCE(ls.last_scan, l.created_at) < now() - make_interval(hours => a.threshold_hours)
        AND co.plan <> 'basic'
        AND NOT (co.plan = 'trial' AND co.trial_ends_at IS NOT NULL AND co.trial_ends_at <= now())
        ${extra}
      ORDER BY ls.last_scan ASC NULLS FIRST, l.name`,
    params
  );
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** "hace 3 días", "hace 30 horas" o "nunca". */
function sinceLabel(last: Date | null, now = new Date()): string {
  if (!last) return 'Sin actividad desde que se instaló';
  const hrs = Math.floor((now.getTime() - new Date(last).getTime()) / 3600_000);
  if (hrs < 48) return `Última interacción hace ${hrs} horas`;
  const days = Math.floor(hrs / 24);
  return `Última interacción hace ${days} días`;
}

function thresholdLabel(hours: number): string {
  if (hours % 168 === 0) return hours === 168 ? '1 semana' : `${hours / 168} semanas`;
  if (hours % 24 === 0) return hours === 24 ? '24 horas' : `${hours / 24} días`;
  return `${hours} horas`;
}

const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const NAVY = '#0b1f4d';
const INK = '#1c1917';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const ACCENT = '#2563eb';
const DANGER = '#b42318';

export function inactivityMailSubject(companyName: string, count: number, thresholdHours: number): string {
  const sedes = count === 1 ? '1 sede' : `${count} sedes`;
  return `${companyName}: ${sedes} sin interacciones en ${thresholdLabel(thresholdHours)}`;
}

export function inactivityMailHtml(d: {
  companyName: string;
  thresholdHours: number;
  locations: InactiveLocation[];
  panelUrl: string;
}): string {
  const n = d.locations.length;
  const lead =
    n === 1
      ? `La sede <b>${esc(d.locations[0].name)}</b> lleva más de ${thresholdLabel(d.thresholdHours)} sin que ningún cliente use sus puntos NFC.`
      : `<b>${n} sedes</b> llevan más de ${thresholdLabel(d.thresholdHours)} sin que ningún cliente use sus puntos NFC.`;
  const rows = d.locations
    .map(
      (l) => `<tr>
        <td width="4" bgcolor="${DANGER}" style="background:${DANGER};font-size:0;line-height:0">&nbsp;</td>
        <td style="padding:12px 14px;border-bottom:1px solid ${LINE}">
          <div style="font:700 15px ${FONT};color:${INK}">${esc(l.name)}<span style="font-weight:400;color:${MUTED}"> · ${esc(l.city)}</span></div>
          <div style="font:400 13px ${FONT};color:${MUTED};margin-top:2px">${esc(sinceLabel(l.lastScan))}</div>
        </td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>Sedes sin actividad · ${esc(d.companyName)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f6" style="background:#eef1f6">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:22px 28px">
      <div style="font:800 18px ${FONT};color:#ffffff">NFCloud</div>
      <div style="font:500 13px ${FONT};color:#c7d2fe;margin-top:2px">Aviso de actividad · ${esc(d.companyName)}</div>
    </td></tr>
    <tr><td style="padding:26px 28px 8px">
      <div style="font:400 15px/1.55 ${FONT};color:${INK}">${lead}</div>
    </td></tr>
    <tr><td style="padding:10px 28px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;overflow:hidden">${rows}</table>
    </td></tr>
    <tr><td style="padding:20px 28px 0">
      <div style="font:700 14px ${FONT};color:${INK};margin-bottom:6px">Qué revisar en la tienda</div>
      <div style="font:400 14px/1.6 ${FONT};color:${INK}">
        1. Que el hablador esté en su lugar y a la vista (no tapado ni guardado).<br />
        2. Que el personal lo esté ofreciendo al cliente en caja.<br />
        3. Que el punto lea: acerca un celular y confirma que abre el destino.
      </div>
    </td></tr>
    <tr><td align="center" style="padding:26px 28px 30px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:12px">
          <a href="${esc(d.panelUrl)}" style="display:inline-block;padding:14px 28px;font:700 15px ${FONT};color:#ffffff;text-decoration:none">Ver sedes en el panel</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINE}">
      <div style="font:400 12px/1.5 ${FONT};color:${MUTED}">Recibes este aviso porque tu empresa lo activó en NFCloud. Cada sede se avisa una sola vez hasta que vuelva a tener actividad.</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** El aviso en una frase para WhatsApp/SMS (los nombres, hasta 4). */
export function inactivityMessageText(locations: InactiveLocation[], thresholdHours: number): string {
  const n = locations.length;
  const t = thresholdLabel(thresholdHours);
  if (n === 1) return `La sede ${locations[0].name} lleva más de ${t} sin interacciones.`;
  const names = locations.slice(0, 4).map((l) => l.name).join(', ');
  return `${n} sedes llevan más de ${t} sin interacciones: ${names}${n > 4 ? ` y ${n - 4} más` : ''}.`;
}

/**
 * Manda el aviso por cada vía configurada (correo y/o celular). Devuelve las
 * vías que funcionaron; lanza error solo si ninguna funcionó.
 */
async function deliver(first: InactiveRow, list: InactiveRow[]): Promise<string[]> {
  const locations = toLocations(list);
  const done: string[] = [];
  const errors: string[] = [];
  if (first.email && isMailEnabled()) {
    try {
      await sendHtmlMail(
        first.email,
        inactivityMailSubject(first.company_name, list.length, first.threshold_hours),
        inactivityMailHtml({
          companyName: first.company_name,
          thresholdHours: first.threshold_hours,
          locations,
          panelUrl: panelUrl(),
        })
      );
      done.push(first.email);
    } catch (err: any) {
      errors.push(`correo: ${err.message}`);
    }
  }
  if (first.phone && isMessagingEnabled()) {
    try {
      const via = await sendAlertMessage(first.phone, {
        companyName: first.company_name,
        text: inactivityMessageText(locations, first.threshold_hours),
        link: panelUrl(),
      });
      done.push(`${via === 'whatsapp' ? 'WhatsApp' : 'SMS'} ${first.phone}`);
    } catch (err: any) {
      errors.push(`celular: ${err.message}`);
    }
  }
  if (!done.length) throw new Error(errors.join(' · ') || 'Ninguna vía de envío está configurada.');
  return done;
}

function panelUrl(): string {
  return `${config.publicBaseUrl.replace(/\/$/, '')}/`;
}

function toLocations(rows: InactiveRow[]): InactiveLocation[] {
  return rows.map((r) => ({ locationId: r.location_id, name: r.name, city: r.city, lastScan: r.last_scan }));
}

/** Pasada del worker: envía los avisos pendientes y marca las sedes avisadas. */
export async function runInactivityAlerts(): Promise<void> {
  if (!isMailEnabled() && !isMessagingEnabled()) return;
  const hour = businessHour();
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) return;

  const rows = await findInactive({ onlyNew: true });
  const byAlert = new Map<string, InactiveRow[]>();
  for (const r of rows) {
    const list = byAlert.get(r.alert_id) || [];
    list.push(r);
    byAlert.set(r.alert_id, list);
  }

  for (const [alertId, list] of byAlert) {
    const first = list[0];
    try {
      const done = await deliver(first, list);
      for (const r of list) {
        await pool.query(
          `INSERT INTO inactivity_alert_notices (alert_id, location_id, last_scan_at, notified_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (alert_id, location_id)
           DO UPDATE SET last_scan_at = EXCLUDED.last_scan_at, notified_at = now()`,
          [alertId, r.location_id, r.last_scan]
        );
      }
      await pool.query(`UPDATE inactivity_alerts SET last_sent_at = now() WHERE id = $1`, [alertId]);
      console.log(`[alertas] ${list.length} sede(s) inactiva(s) avisadas a ${done.join(', ')}`);
    } catch (err: any) {
      // Sin marcar las sedes: se reintenta en la próxima pasada.
      console.error(`[alertas] error enviando aviso ${alertId}:`, err.message);
    }
  }
}

/**
 * Envío de prueba: manda el estado actual (todas las sedes que superan el
 * umbral, aunque ya se hayan avisado) sin tocar el registro de avisos.
 * Devuelve cuántas sedes incluyó; 0 = no se envió nada.
 */
export async function sendInactivityTest(alertId: string): Promise<number> {
  const rows = await findInactive({ onlyNew: false, alertId });
  if (!rows.length) return 0;
  await deliver(rows[0], rows);
  return rows.length;
}
