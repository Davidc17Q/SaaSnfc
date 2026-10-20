/**
 * Enlaces firmados al informe mensual, para abrirlo desde el correo sin
 * iniciar sesión.
 *
 * El token lleva el alcance (empresa, sede opcional, mes) y un vencimiento, y
 * se firma con HMAC. La clave se DERIVA del secreto de sesión con un propósito
 * distinto: así un token de informe nunca es válido como cookie de sesión (y
 * viceversa), aunque ambos usen el mismo formato "datos.firma".
 *
 * Un token solo da acceso a ese informe concreto (solo lectura), nunca al panel
 * ni a la API.
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

const LINK_DAYS = 60; // vigencia del enlace del correo

interface ReportLinkPayload {
  c: string; // company_id (obligatorio: nunca "todas las empresas")
  l?: string; // location_id opcional
  m: string; // 'YYYY-MM'
  exp: number; // ms epoch
}

function key(): Buffer {
  return createHash('sha256').update(`${config.sessionSecret}:report-link:v1`).digest();
}

export function signReportLink(scope: { companyId: string; locationId?: string; month: string }): string {
  const payload: ReportLinkPayload = {
    c: scope.companyId,
    m: scope.month,
    exp: Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000,
  };
  if (scope.locationId) payload.l = scope.locationId;
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', key()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export type ReportLinkResult =
  | { ok: true; companyId: string; locationId?: string; month: string }
  | { ok: false; reason: 'invalid' | 'expired' };

export function verifyReportLink(token: string): ReportLinkResult {
  const [data, sig] = (token || '').split('.');
  if (!data || !sig) return { ok: false, reason: 'invalid' };
  const expected = createHmac('sha256', key()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' };
  let p: ReportLinkPayload;
  try {
    p = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof p.c !== 'string' || !/^\d{4}-\d{2}$/.test(p.m) || typeof p.exp !== 'number') {
    return { ok: false, reason: 'invalid' };
  }
  if (Date.now() > p.exp) return { ok: false, reason: 'expired' };
  return { ok: true, companyId: p.c, locationId: p.l, month: p.m };
}

/** URL pública del informe para el correo. */
export function reportLinkUrl(scope: { companyId: string; locationId?: string; month: string }): string {
  return `${config.publicBaseUrl.replace(/\/$/, '')}/informe/${signReportLink(scope)}`;
}
