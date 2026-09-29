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
