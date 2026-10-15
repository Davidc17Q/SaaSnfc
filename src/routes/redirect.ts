import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { redis, deviceCacheKey, dedupeKey, surveyDedupeKey } from '../db/redis';
import { detectOs } from '../lib/os';
import { detectChannel } from '../lib/channel';
import { config } from '../config';
import { transitionHtml } from '../lib/transition';
import { surveyHtml } from '../lib/survey';
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

// Página sobria para un punto en modo encuesta sin plantilla válida/activa.
// Mismo tono carbón cálido que la encuesta; no expone detalles internos.
const SURVEY_UNAVAILABLE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Encuesta no disponible</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #141312; color: #fafaf9; min-height: 100vh; min-height: 100dvh;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #1c1a18; border: 1px solid #322e2b; border-radius: 16px;
      padding: 40px 32px; max-width: 420px; text-align: center;
    }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #a8a29e; line-height: 1.6; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Encuesta no disponible</h1>
    <p>Este punto aún no tiene una encuesta activa. Contacta al administrador para activarla.</p>
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
              d.transition, d.mode, d.survey_template_id, co.name AS company_name
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

    // ----- MODO ENCUESTA (Función 1) -----
    // Si el punto está en modo 'survey', NO redirige y NO registra scan_events.
    // Sirve la encuesta propia. Cualquier otro valor (incluye undefined de
    // esquema/caché antiguo) sigue el camino de redirección intacto.
    if ((device as any).mode === 'survey') {
      const templateId = (device as any).survey_template_id as string | null | undefined;
      if (!templateId) {
        return reply
          .header('Cache-Control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(SURVEY_UNAVAILABLE_HTML);
      }
      try {
        const tpl = await pool.query(
          `SELECT id, name, scale_max, status FROM survey_templates WHERE id = $1 LIMIT 1`,
          [templateId]
        );
        const t = tpl.rows[0];
        if (!t || t.status !== 'active') {
          return reply
            .header('Cache-Control', 'no-store')
            .type('text/html; charset=utf-8')
            .send(SURVEY_UNAVAILABLE_HTML);
        }
        const asp = await pool.query(
          `SELECT id, label FROM survey_aspects WHERE template_id = $1
            ORDER BY position ASC, created_at ASC`,
          [templateId]
        );
        if (asp.rowCount === 0) {
          return reply
            .header('Cache-Control', 'no-store')
            .type('text/html; charset=utf-8')
            .send(SURVEY_UNAVAILABLE_HTML);
        }
        return reply
          .header('Cache-Control', 'no-store')
          .header('ngrok-skip-browser-warning', 'true')
          .type('text/html; charset=utf-8')
          .send(
            surveyHtml({
              deviceCode: deviceId,
              templateName: t.name,
              aspects: asp.rows.map((a: any) => ({ id: a.id, label: a.label })),
              scaleMax: t.scale_max,
              companyName: device.company_name,
            })
          );
      } catch {
        return reply
          .header('Cache-Control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(SURVEY_UNAVAILABLE_HTML);
      }
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

  // Recepción de respuestas de encuesta (Función 1). Hereda la exención del
  // guard por el prefijo /r/. Anónima: solo guarda notas, comentario e IP (esta
  // última solo para el anti-doble-conteo).
  app.post<{
    Params: { deviceId: string };
    Body: { ratings?: Record<string, number>; comment?: string };
  }>('/r/:deviceId/survey', async (req, reply) => {
    const { deviceId } = req.params;

    const valido =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId) ||
      /^[A-Za-z0-9]{6,12}$/.test(deviceId);

    const device = valido ? await resolveDevice(deviceId) : null;
    if (
      !device ||
      device.status !== 'active' ||
      (device as any).mode !== 'survey' ||
      !(device as any).survey_template_id
    ) {
      return reply.code(404).send({ error: 'Encuesta no disponible.' });
    }

    const templateId = (device as any).survey_template_id as string;
    const ip = req.ip;

    // Anti-doble-conteo: una respuesta por dispositivo+IP dentro de la ventana.
    // Si ya existe la clave, respondemos OK sin insertar (gracias idempotente).
    if (config.scanDedupeSeconds > 0) {
      try {
        const ok = await redis.set(
          surveyDedupeKey(device.device_id, ip || 'unknown'),
          '1',
          'EX',
          config.scanDedupeSeconds,
          'NX'
        );
        if (ok === null) return reply.send({ ok: true });
      } catch {
        // Redis caído: seguimos y registramos igual (no perder datos).
      }
    }

    // Validar body.
    const ratings = (req.body?.ratings || {}) as Record<string, number>;
    const aspectIds = Object.keys(ratings);
    if (aspectIds.length === 0) {
      return reply.code(400).send({ error: 'Faltan calificaciones.' });
    }

    // Plantilla + aspectos esperados (y escala).
    const tpl = await pool.query(
      `SELECT scale_max, status FROM survey_templates WHERE id = $1 LIMIT 1`,
      [templateId]
    );
    const t = tpl.rows[0];
    if (!t || t.status !== 'active') {
      return reply.code(404).send({ error: 'Encuesta no disponible.' });
    }
    const scaleMax = Number(t.scale_max) || 5;

    const aspRows = await pool.query(
      `SELECT id FROM survey_aspects WHERE template_id = $1`,
      [templateId]
    );
    const validAspectIds = new Set(aspRows.rows.map((r: any) => String(r.id)));

    // Todos los aspectos de la plantilla deben venir calificados y pertenecer
    // a ella; cada nota es un entero entre 1 y scale_max.
    if (aspectIds.length !== validAspectIds.size) {
      return reply.code(400).send({ error: 'Calificación incompleta.' });
    }
    for (const aid of aspectIds) {
      if (!validAspectIds.has(aid)) {
        return reply.code(400).send({ error: 'Aspecto no válido.' });
      }
      const r = ratings[aid];
      if (!Number.isInteger(r) || r < 1 || r > scaleMax) {
        return reply.code(400).send({ error: 'Nota fuera de rango.' });
      }
    }

    const comment = (req.body?.comment || '').toString().slice(0, 2000).trim() || null;

    // Insertar respuesta + notas en una transacción.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resp = await client.query(
        `INSERT INTO survey_responses (device_id, location_id, template_id, comment, ip)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [device.device_id, device.location_id, templateId, comment, ip]
      );
      const responseId = resp.rows[0].id;
      for (const aid of aspectIds) {
        await client.query(
          `INSERT INTO survey_answers (response_id, aspect_id, rating) VALUES ($1, $2, $3)`,
          [responseId, aid, ratings[aid]]
        );
      }
      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[survey_response] insert error:', err.message);
      return reply.code(500).send({ error: 'No se pudo registrar la respuesta.' });
    } finally {
      client.release();
    }

    return reply.send({ ok: true });
  });
}
