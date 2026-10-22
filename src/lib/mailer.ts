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
import type { ReportData } from './report';
import { reportMailHtml } from './report-mail';

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
  data: ReportData; // mismos datos del informe web
  reportUrl: string; // enlace a /api/report?... (versión completa)
}

/** Asunto con el dato principal: invita a abrir el correo. */
function mailSubject(d: ReportData): string {
  const n = new Intl.NumberFormat('es-CO').format(d.kpis.totalScans);
  const month = d.periodLabel.split(' ')[0];
  return `${month} en ${d.companyName}: ${n} interacciones`;
}

function mailHtml(d: ReportMailInput): string {
  return reportMailHtml(d.data, { reportUrl: d.reportUrl, assetBaseUrl: config.publicBaseUrl.replace(/\/$/, '') });
}

/** Envío por la API HTTP de Resend (sortea bloqueos de puerto SMTP). */
async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
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
      body: JSON.stringify({ from: config.smtp.from, to: [to], subject, html }),
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

/** Envía un correo HTML por Resend (prioridad) o SMTP. */
export async function sendHtmlMail(to: string, subject: string, html: string): Promise<void> {
  if (!isMailEnabled()) throw new Error('Correo no configurado (define RESEND_API_KEY o SMTP_HOST).');
  if (config.resendApiKey) {
    await sendViaResend(to, subject, html);
    return;
  }
  await transport().sendMail({ from: config.smtp.from, to, subject, html });
}

export async function sendReportMail(d: ReportMailInput): Promise<void> {
  await sendHtmlMail(d.to, mailSubject(d.data), mailHtml(d));
}
