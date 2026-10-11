import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { redis, deviceCacheKey, dedupeKey } from '../db/redis';
import { detectOs } from '../lib/os';
import { detectChannel } from '../lib/channel';
import { config } from '../config';
import { transitionHtml } from '../lib/transition';
import type { DeviceCache } from '../types';

const NOT_CONFIGURED_HTML = (deviceId: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dispositivo NFC no configurado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7); border: 1px solid #334155;
      border-radius: 20px; padding: 48px 40px; max-width: 460px;
      text-align: center; backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    .icon {
      width: 72px; height: 72px; margin: 0 auto 24px; border-radius: 18px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      display: flex; align-items: center; justify-content: center; font-size: 34px;
    }
    h1 { font-size: 22px; margin-bottom: 12px; color: #f8fafc; }
    p { color: #94a3b8; line-height: 1.6; font-size: 15px; }
    .code {
      margin-top: 20px; font-family: monospace; font-size: 12px;
      color: #64748b; background: #0f172a; padding: 8px 12px;
      border-radius: 8px; display: inline-block; word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Dispositivo NFC no configurado</h1>
    <p>Este punto NFC aún no tiene un destino asignado. Contacta al administrador de la plataforma para activarlo.</p>
    <div class="code">ID: ${deviceId}</div>
  </div>
</body>
</html>`;

// Acepta tanto el código corto (nuevos) como el UUID (compatibilidad).
async function resolveDevice(idOrCode: string): Promise<DeviceCache | null> {
  // 1) Intentar caché Redis (ruta rápida <50ms). La clave usa el valor tal cual.
  try {
    const cached = await redis.get(deviceCacheKey(idOrCode));
    if (cached) return JSON.parse(cached) as DeviceCache;
  } catch {
    // Redis caído: seguimos con Postgres.
  }

  // 2) Fallback a Postgres. Busca por code o por id (UUID).
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  const campo = isUuid ? 'd.id' : 'd.code';

  // Se intenta traer el nombre de la empresa (vía location → company) para la
  // pantalla de transición. Si el esquema es antiguo (sin tabla companies o sin
  // columna code), se reintenta con una consulta mínima que siempre funciona.
  let rows;
  try {
    rows = await pool.query(
      `SELECT d.id AS device_id, d.location_id, d.target_url, d.status,
              d.transition, co.name AS company_name
         FROM devices d
         LEFT JOIN locations l ON l.id = d.location_id
         LEFT JOIN companies co ON co.id = l.company_id
        WHERE ${campo} = $1 LIMIT 1`,
      [idOrCode]
    );
  } catch {
    // Esquema antiguo: sin companies/company_id (o sin code/transition).
    const campoBasico = isUuid ? 'id' : 'code';
    rows = await pool.query(
      `SELECT id AS device_id, location_id, target_url, status
         FROM devices WHERE ${campoBasico} = $1 LIMIT 1`,
      [idOrCode]
    );
  }
  if (rows.rowCount === 0) return null;

  const device = rows.rows[0] as DeviceCache;
  // Rellenar caché para próximas lecturas (bajo la clave consultada).
  try {
    await redis.set(deviceCacheKey(idOrCode), JSON.stringify(device), 'EX', 3600);
  } catch {
    /* ignore */
  }
  return device;
}

export async function redirectRoutes(app: FastifyInstance) {
  app.get<{ Params: { deviceId: string } }>('/r/:deviceId', async (req, reply) => {
    const { deviceId } = req.params;

    // Acepta UUID (compatibilidad) o código corto alfanumérico (6-12 chars).
    const valido =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId) ||
      /^[A-Za-z0-9]{6,12}$/.test(deviceId);

    const device = valido ? await resolveDevice(deviceId) : null;

    if (!device || device.status !== 'active') {
      return reply
        .code(404)
        .type('text/html; charset=utf-8')
        .send(NOT_CONFIGURED_HTML(deviceId));
    }

    // Pantalla de transición OPCIONAL (solo con ?preview=1). Por defecto el
    // comportamiento es el 302 puro e instantáneo de siempre, para no añadir
    // fricción a reseñas/WhatsApp. El preview sirve para probar/demostrar.
    // La pantalla aparece si el dispositivo la tiene activada (columna
    // transition) o si se fuerza con ?preview=1 (para pruebas/demos).
    const preview =
      (device as any).transition === true ||
      (req.query as { preview?: string })?.preview === '1';
    if (preview) {
      reply
        .header('Cache-Control', 'no-store')
        .header('ngrok-skip-browser-warning', 'true')
        .type('text/html; charset=utf-8')
        .send(transitionHtml({ targetUrl: device.target_url, companyName: device.company_name }));
    } else {
      // Redirigir de inmediato (no bloquear en el registro del evento).
      // 'ngrok-skip-browser-warning' evita la pantalla intermedia de ngrok gratis.
      reply
        .header('Cache-Control', 'no-store')
        .header('ngrok-skip-browser-warning', 'true')
        .redirect(device.target_url, 302);
    }

    // Registrar el ScanEvent de forma asíncrona (fire-and-forget).
    const os = detectOs(req.headers['user-agent']);
    const channel = detectChannel(device.target_url);
    const ua = req.headers['user-agent'] || null;
    const ip = req.ip;
    setImmediate(async () => {
      try {
        // Anti-doble-conteo: si el mismo dispositivo+IP escaneó hace poco,
        // no se registra otro evento. Ventana configurable (SCAN_DEDUPE_SECONDS).
        if (config.scanDedupeSeconds > 0) {
          try {
            const key = dedupeKey(device.device_id, ip || 'unknown');
            // SET key con NX + EX: solo tiene éxito si no existe la clave.
            const ok = await redis.set(key, '1', 'EX', config.scanDedupeSeconds, 'NX');
            if (ok === null) return; // ya hubo un escaneo reciente: se ignora
          } catch {
            // Si Redis falla, seguimos y registramos igual (no perder datos).
          }
        }
        await pool.query(
          `INSERT INTO scan_events (device_id, location_id, os, channel, user_agent, ip)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [device.device_id, device.location_id, os, channel, ua, ip]
        );
      } catch (err: any) {
        console.error('[scan_event] insert error:', err.message);
      }
    });
  });
}
