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

/** Logo NFCloud (versión oscura) en base64, cargado una sola vez. */
let _logoCache: string | null | undefined;
function logoDataUri(): string | null {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.join(__dirname, '..', '..', 'public', 'logo-texto-oscuro.png');
    _logoCache = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    _logoCache = null;
  }
  return _logoCache;
}

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

/** HTML premium del correo con logo NFCloud embebido, coherente con la marca. */
function mailHtml(d: ReportMailInput): string {
  const alcance = d.locationName ? esc(d.locationName) : 'Todas las sedes';
  const logo = logoDataUri();
  const fmt = (n: number) => new Intl.NumberFormat('es-CO').format(n);

  const logoHtml = logo
    ? `<img src="${logo}" alt="NFCloud" style="display:block;height:42px;width:auto" />`
    : `<span style="font-size:20px;font-weight:800;color:#1c2a4a;letter-spacing:-.02em">nfcloud</span>`;

  const surveyRow =
    d.surveyAvg !== null && d.surveyAvg !== undefined
      ? `<tr>
           <td style="padding:10px 0 0;color:#78716c;font-size:13px">Calificacion promedio</td>
           <td style="padding:10px 0 0;text-align:right;font-weight:700;font-size:14px;color:#1c1917">${d.surveyAvg.toFixed(2)} / 5</td>
         </tr>`
      : '';

  const logoFooter = logo
    ? `<img src="${logo}" alt="NFCloud" style="display:block;height:20px;width:auto;opacity:.38" />`
    : `<span style="color:#c0bbb7;font-size:11px;font-weight:700">nfcloud</span>`;

  return `<div style="background:#f2f0ee;padding:32px 16px;font-family:'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;margin:0 auto">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">

        <!-- HEADER -->
        <tr>
          <td style="background:#fafaf9;padding:22px 28px 18px;border-bottom:1px solid #e7e5e4">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle">${logoHtml}</td>
              <td style="vertical-align:middle;text-align:right">
                <span style="display:inline-block;background:rgba(37,99,235,.08);color:#2563eb;border:1px solid rgba(37,99,235,.18);border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Informe mensual</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px 28px 0">
            <h1 style="margin:0 0 5px;font-size:20px;font-weight:800;color:#1c1917;letter-spacing:-.02em">${esc(d.companyName)}</h1>
            <p style="margin:0 0 22px;color:#78716c;font-size:13px">${esc(alcance)} &middot; ${esc(d.periodLabel)}</p>

            <!-- KPI card -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border:1px solid #ece9e6;border-radius:10px;margin-bottom:22px;overflow:hidden">
              <tr>
                <td width="4" style="background:#2563eb">&nbsp;</td>
                <td style="background:#f7f6f4;padding:16px 18px">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="color:#78716c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em">Interacciones del mes</td>
                      <td style="text-align:right">
                        <span style="font-size:26px;font-weight:800;color:#1c1917;letter-spacing:-.03em">${fmt(d.totalScans)}</span>
                      </td>
                    </tr>
                    ${surveyRow}
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px">
              <tr>
                <td style="background:#2563eb;border-radius:9px">
                  <a href="${esc(d.reportUrl)}"
                     style="display:inline-block;color:#ffffff;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:700;letter-spacing:-.01em">
                    Ver informe completo &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#a8a29e;font-size:12px;line-height:1.6;margin:0 0 26px">
              Abre el informe en tu navegador y usa <strong style="color:#78716c">"Descargar PDF"</strong> para guardarlo.<br>
              Este correo fue generado automaticamente por NFCloud.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#fafaf9;padding:14px 28px;border-top:1px solid #e7e5e4">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="color:#c0bbb7;font-size:11px;line-height:1.5">
                <strong style="color:#a8a29e">${esc(d.companyName)}</strong><br>${esc(d.periodLabel)}
              </td>
              <td style="text-align:right;vertical-align:middle">${logoFooter}</td>
            </tr></table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
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
