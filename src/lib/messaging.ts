/**
 * Avisos por WhatsApp y, si no se puede, por SMS (Twilio, API HTTP).
 *
 * Sin dependencias: llama directo a la API REST de Twilio con fetch. Se activa
 * solo si hay credenciales en las variables de entorno (ver
 * documentos/AVISOS-WHATSAPP-TWILIO.md):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  número de WhatsApp aprobado, ej. +14155238886
 *   TWILIO_WA_CONTENT_SID plantilla aprobada (HX…) con 3 variables:
 *                         {{1}} empresa, {{2}} el aviso, {{3}} enlace al panel
 *   TWILIO_SMS_FROM       número de Twilio para SMS (respaldo)
 *
 * WhatsApp solo deja escribir primero con una plantilla aprobada por Meta; sin
 * TWILIO_WA_CONTENT_SID se manda texto libre, que solo llega en el sandbox o
 * si la persona escribió en las últimas 24 h. Si WhatsApp falla, va por SMS.
 */

const env = (k: string) => (process.env[k] || '').trim();

export function isMessagingEnabled(): boolean {
  return !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && (env('TWILIO_WHATSAPP_FROM') || env('TWILIO_SMS_FROM')));
}

/**
 * Celular en formato internacional (+57…). Acepta "300 123 4567",
 * "+57 300…" o "57300…"; 10 dígitos que empiezan por 3 se toman como Colombia.
 * Devuelve null si no parece un número válido.
 */
export function normalizePhone(raw: string): string | null {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  let e164: string;
  if (s.startsWith('+')) e164 = '+' + digits;
  else if (digits.length === 10 && digits.startsWith('3')) e164 = '+57' + digits;
  else if (digits.length >= 11) e164 = '+' + digits;
  else return null;
  return /^\+\d{10,15}$/.test(e164) ? e164 : null;
}

async function twilioSend(params: Record<string, string>): Promise<void> {
  const sid = env('TWILIO_ACCOUNT_SID');
  const auth = Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string; code?: number };
      throw new Error(data.message || `Twilio respondió ${res.status}`);
    }
  } finally {
    clearTimeout(t);
  }
}

export interface AlertMessage {
  companyName: string;
  /** El aviso en una frase, sin saltos de línea (va dentro de la plantilla). */
  text: string;
  link: string;
}

/**
 * Envía el aviso por WhatsApp y, si falla o no está configurado, por SMS.
 * Devuelve el canal usado; lanza error si ninguno funcionó.
 */
export async function sendAlertMessage(phone: string, msg: AlertMessage): Promise<'whatsapp' | 'sms'> {
  const to = normalizePhone(phone);
  if (!to) throw new Error('Número de celular inválido.');
  const text = msg.text.replace(/\s+/g, ' ').trim();
  const plain = `NFCloud · ${msg.companyName}: ${text} Revisa: ${msg.link}`;
  let waError = '';

  const waFrom = env('TWILIO_WHATSAPP_FROM');
  if (waFrom) {
    const contentSid = env('TWILIO_WA_CONTENT_SID');
    const params: Record<string, string> = {
      From: `whatsapp:${normalizePhone(waFrom) || waFrom}`,
      To: `whatsapp:${to}`,
    };
    if (contentSid) {
      params.ContentSid = contentSid;
      params.ContentVariables = JSON.stringify({ '1': msg.companyName, '2': text, '3': msg.link });
    } else {
      params.Body = plain;
    }
    try {
      await twilioSend(params);
      return 'whatsapp';
    } catch (err: any) {
      waError = err.message;
      console.warn(`[mensajes] WhatsApp a ${to} falló (${waError}); se intenta SMS.`);
    }
  }

  const smsFrom = env('TWILIO_SMS_FROM');
  if (smsFrom) {
    // Un SMS largo se cobra por partes: se recorta a ~2 segmentos.
    await twilioSend({ From: normalizePhone(smsFrom) || smsFrom, To: to, Body: plain.slice(0, 300) });
    return 'sms';
  }
  throw new Error(waError || 'WhatsApp/SMS no está configurado en el servidor.');
}
