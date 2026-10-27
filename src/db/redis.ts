import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err) => {
  // No detener el proceso: el motor de redirección tiene fallback a Postgres.
  console.error('[redis] error:', err.message);
});

/** Clave de caché para un dispositivo NFC. */
export const deviceCacheKey = (deviceId: string) => `device:${deviceId}`;

/** Clave para el anti-doble-conteo (dedupe) de escaneos por dispositivo+IP. */
export const dedupeKey = (deviceId: string, ip: string) => `dedupe:${deviceId}:${ip}`;

/** Clave para el anti-doble-conteo de respuestas de encuesta por dispositivo+IP. */
export const surveyDedupeKey = (deviceId: string, ip: string) =>
  `survey:dedupe:${deviceId}:${ip}`;

/**
 * Borra la caché de un punto (bajo su código corto y su UUID). La siguiente
 * lectura del motor /r/ la rellena desde Postgres con todos los campos
 * (empresa, canal, modo…), en vez de guardar aquí un objeto incompleto.
 */
export async function dropDeviceCache(devices: { device_id: string; code?: string | null }[]) {
  const keys = devices.flatMap((d) => [deviceCacheKey(d.device_id), ...(d.code ? [deviceCacheKey(d.code)] : [])]);
  if (!keys.length) return;
  try {
    await redis.del(...keys);
  } catch {
    /* Redis caído: tampoco se lee la caché */
  }
}
