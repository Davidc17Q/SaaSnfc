/** Detecta el sistema operativo a partir del user-agent. */
export function detectOs(userAgent: string | undefined): 'iOS' | 'Android' | 'Other' {
  if (!userAgent) return 'Other';
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS';
  // iPadOS moderno se presenta como Mac; heurística adicional.
  if (/macintosh/.test(ua) && /mobile/.test(ua)) return 'iOS';
  if (/android/.test(ua)) return 'Android';
  return 'Other';
}
