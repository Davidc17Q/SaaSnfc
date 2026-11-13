import type { FastifyRequest } from 'fastify';

/**
 * IP real del visitante. Producción está detrás de Cloudflare, que escribe la
 * IP del cliente en CF-Connecting-IP (el visitante no puede cambiarla). El
 * primer valor de X-Forwarded-For, que es lo que entrega req.ip, sí lo puede
 * inventar quien hace la petición. Sin esa cabecera (local) se usa req.ip.
 */
export function clientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  const v = (Array.isArray(cf) ? cf[0] : cf || '').trim();
  if (v && v.length <= 45 && /^[0-9a-fA-F.:]+$/.test(v)) return v;
  return req.ip || 'unknown';
}
