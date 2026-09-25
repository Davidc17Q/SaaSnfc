/**
 * Clasifica una target_url en un "canal" legible para la analítica.
 * Detección automática por dominio/patrón. No requiere configuración manual.
 */
export function detectChannel(targetUrl: string): string {
  let host = '';
  let full = (targetUrl || '').toLowerCase();
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    host = full;
  }

  const has = (s: string) => host.includes(s) || full.includes(s);

  if (has('wa.me') || has('whatsapp') || has('api.whatsapp')) return 'WhatsApp';
  if (has('instagram.com') || has('instagr.am')) return 'Instagram';
  // Google Maps / reseñas / perfil de negocio
  if (
    has('g.page') ||
    has('goo.gl/maps') ||
    has('maps.app.goo.gl') ||
    has('maps.google') ||
    (has('google.') && (full.includes('review') || full.includes('/maps')))
  )
    return 'Google Reviews';
  if (has('facebook.com') || has('fb.me') || has('fb.com')) return 'Facebook';
  if (has('tiktok.com')) return 'TikTok';
  if (has('youtube.com') || has('youtu.be')) return 'YouTube';
  if (has('twitter.com') || has('x.com')) return 'X (Twitter)';
  if (has('t.me') || has('telegram')) return 'Telegram';
  if (has('linktr.ee') || has('linktree')) return 'Linktree';
  if (full.startsWith('tel:') || has('tel:')) return 'Llamada';
  if (full.startsWith('mailto:')) return 'Email';

  // Cualquier otra URL http(s) válida se considera sitio web.
  if (/^https?:\/\//.test(full)) return 'Sitio web';
  return 'Otro';
}
