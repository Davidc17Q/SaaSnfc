/**
 * Envío de correo (Función 2, Fase B).
 *
 * Usa nodemailer con un transporte SMTP configurado por variables de entorno.
 * Si no hay SMTP configurado (config.smtp.host vacío), isMailEnabled() devuelve
 * false y la API lo informa en vez de fallar.
 *
 * Estrategia B1: el correo NO adjunta un PDF pesado; lleva un resumen HTML con
 * la marca NFCloud y un enlace a la versión imprimible del informe
 * (/api/report?...), desde donde el gerente guarda el PDF con el navegador.
 */
import nodemailer from 'nodemailer';
import { config } from '../config';

let _transport: nodemailer.Transporter | null = null;

export function isMailEnabled(): boolean {
  return !!config.resendApiKey || !!config.smtp.host;
}

function transport(): nodemailer.Transporter {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return _transport;
}

export interface ReportMailInput {
  to: string;
  companyName: string;
  periodLabel: string;
  locationName?: string | null;
  reportUrl: string; // enlace a /api/report?... (versión imprimible)
  totalScans: number;
  surveyAvg?: number | null;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** HTML sobrio del correo, coherente con la marca (sin depender de CSS externo). */
function mailHtml(d: ReportMailInput): string {
  const alcance = d.locationName ? esc(d.locationName) : 'Todas las sedes';
  const survey =
    d.surveyAvg !== null && d.surveyAvg !== undefined
      ? `<tr><td style="padding:6px 0;color:#78716c">Calificación promedio</td>
         <td style="padding:6px 0;text-align:right;font-weight:700">${d.surveyAvg.toFixed(2)} / 5</td></tr>`
      : '';
  return `<div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;background:#f5f4f2;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:28px">
      <div style="font-size:20px;font-weight:800;color:#1e40af;margin-bottom:4px">NFCloud</div>
      <div style="color:#78716c;font-size:13px;margin-bottom:20px">Informe de interacciones</div>
      <h1 style="font-size:18px;color:#1c1917;margin:0 0 2px">${esc(d.companyName)}</h1>
      <div style="color:#78716c;font-size:13px;margin-bottom:18px">${alcance} · ${esc(d.periodLabel)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px">
        <tr><td style="padding:6px 0;color:#78716c">Interacciones del mes</td>
            <td style="padding:6px 0;text-align:right;font-weight:700">${new Intl.NumberFormat('es-CO').format(d.totalScans)}</td></tr>
        ${survey}
      </table>
      <a href="${esc(d.reportUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px">Ver informe completo</a>
      <p style="color:#78716c;font-size:12px;margin-top:18px;line-height:1.5">Abre el informe en tu navegador y usa “Descargar / Imprimir PDF” para guardarlo. Este correo fue enviado automáticamente por NFCloud.</p>
    </div>
  </div>`;
}

/** Envío por la API HTTP de Resend (sortea bloqueos de puerto SMTP). */
async function sendViaResend(d: ReportMailInput): Promise<void> {
  const subject = `Informe NFCloud · ${d.companyName} · ${d.periodLabel}`;
  // Timeout defensivo para que el endpoint no quede colgado.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.smtp.from,
        to: [d.to],
        subject,
        html: mailHtml(d),
      }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    throw new Error(e.name === 'AbortError' ? 'tiempo de espera agotado con Resend' : e.message);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body: any = await res.json();
      if (body?.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Resend rechazó el envío: ${detail}`);
  }
}

export async function sendReportMail(d: ReportMailInput): Promise<void> {
  if (!isMailEnabled()) throw new Error('Correo no configurado (define RESEND_API_KEY o SMTP_HOST).');
  // Resend por HTTP tiene prioridad (más fiable en hosts con SMTP bloqueado).
  if (config.resendApiKey) {
    await sendViaResend(d);
    return;
  }
  await transport().sendMail({
    from: config.smtp.from,
    to: d.to,
    subject: `Informe NFCloud · ${d.companyName} · ${d.periodLabel}`,
    html: mailHtml(d),
  });
}
