/**
 * Clasifica una target_url en un "canal" legible para la analítica.
 * Detección automática por dominio/patrón. No requiere configuración manual;
 * si un acortador no se reconoce, el punto admite un canal fijado a mano
 * (devices.channel), que tiene prioridad sobre esta detección.
 */

/** Canales que se pueden fijar a mano en un punto (mismo vocabulario que la detección). */
export const CHANNELS = [
  'WhatsApp', 'Instagram', 'Google Reviews', 'Facebook', 'TikTok', 'YouTube',
  'X (Twitter)', 'Telegram', 'Linktree', 'Llamada', 'Email', 'Sitio web', 'Otro',
] as const;

// Acortadores y enlaces de WhatsApp que no llevan "whatsapp" en la URL
// (wa.link y walink.co son muy usados en Colombia).
const WHATSAPP_HOSTS = ['wa.me', 'wa.link', 'walink.co', 'wa.click', 'wame.link'];

export function detectChannel(targetUrl: string): string {
  const full = (targetUrl || '').trim().toLowerCase();
  let host = '';
  try {
    host = new URL(full).hostname.replace(/^www\./, '');
  } catch {
    // Sin protocolo ("wa.me/57…"): el host es lo que va antes de la primera "/".
    host = full.split(/[/?#]/)[0].replace(/^www\./, '');
  }

  // Coincide con el dominio exacto o con un subdominio suyo (no "fedex.com" con "x.com").
  const isHost = (...domains: string[]) =>
    domains.some((d) => host === d || host.endsWith('.' + d));

  if (full.startsWith('tel:')) return 'Llamada';
  if (full.startsWith('mailto:')) return 'Email';
  // Grupos (chat.), canales (/channel/), catálogos y api.whatsapp.com caen aquí.
  if (full.includes('whatsapp') || isHost(...WHATSAPP_HOSTS)) return 'WhatsApp';
  if (isHost('instagram.com', 'instagr.am', 'ig.me')) return 'Instagram';
  // Google Maps / reseñas / perfil de negocio
  if (
    isHost('g.page', 'maps.app.goo.gl', 'g.co') ||
    (isHost('goo.gl') && full.includes('/maps')) ||
    host.startsWith('maps.google.') ||
    (/(^|\.)google\.[a-z.]+$/.test(host) && (full.includes('review') || full.includes('/maps')))
  )
    return 'Google Reviews';
  if (isHost('facebook.com', 'fb.me', 'fb.com', 'm.me')) return 'Facebook';
  if (isHost('tiktok.com')) return 'TikTok';
  if (isHost('youtube.com', 'youtu.be')) return 'YouTube';
  if (isHost('twitter.com', 'x.com')) return 'X (Twitter)';
  if (isHost('t.me', 'telegram.me', 'telegram.org')) return 'Telegram';
  if (isHost('linktr.ee')) return 'Linktree';

  // Cualquier otra URL http(s) válida se considera sitio web.
  if (/^https?:\/\//.test(full)) return 'Sitio web';
  return 'Otro';
}

/** Canal efectivo de un punto: el fijado a mano, o el detectado por su URL. */
export function deviceChannel(d: { target_url: string; channel?: string | null }): string {
  return d.channel || detectChannel(d.target_url);
}

/**
 * Destino válido para un punto: URL bien formada con un protocolo que abre
 * una web o una app (nunca javascript: ni data:, que ejecutarían código).
 */
export function isSafeTarget(url: string): boolean {
  try {
    return ['http:', 'https:', 'tel:', 'mailto:', 'sms:', 'whatsapp:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
