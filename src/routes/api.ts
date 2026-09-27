import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { redis, deviceCacheKey } from '../db/redis';
import type { DeviceCache } from '../types';

// Zona horaria del negocio. Los escaneos se guardan en UTC (timestamptz),
// pero los filtros de fecha del dashboard se interpretan en hora local.
const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

/** Construye cláusula de filtros comunes (rango de fechas + sede). */
function buildFilters(q: any): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // Las fechas 'from'/'to' llegan como 'YYYY-MM-DD' y representan días en la
  // zona horaria del negocio. Convertimos el inicio de cada día local al
  // instante UTC correcto para comparar contra scanned_at (timestamptz).
  if (q.from) {
    params.push(q.from);
    clauses.push(
      `se.scanned_at >= (($${params.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`
    );
  }
  if (q.to) {
    params.push(q.to);
    // Incluir todo el día 'to': hasta el inicio del día siguiente (hora local).
    clauses.push(
      `se.scanned_at < ((($${params.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE '${APP_TZ}')`
    );
  }
  if (q.locationId) {
    params.push(q.locationId);
    clauses.push(`se.location_id = $${params.length}`);
  }
  if (q.channel) {
    params.push(q.channel);
    clauses.push(`se.channel = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

/** Construye el WHERE para el alcance de un cambio masivo (all | brand | location). */
function bulkScopeWhere(scope?: string, value?: string): { where: string; params: any[] } {
  if (scope === 'brand' && value) {
    return { where: 'WHERE l.brand = $1', params: [value] };
  }
  if (scope === 'location' && value) {
    return { where: 'WHERE l.id = $1', params: [value] };
  }
  // 'all' o por defecto: todos los dispositivos
  return { where: '', params: [] };
}

export async function apiRoutes(app: FastifyInstance) {
  // ---------- KPIs ----------
  app.get('/api/kpis', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    // Filtro de sede para las ventanas relativas de 7/30 días.
    // (semana y mes son ventanas fijas de tiempo, pero sí deben respetar la sede)
    const locClause = q.locationId ? `AND location_id = $1` : '';
    const locParams = q.locationId ? [q.locationId] : [];

    // Total escaneos (según filtro completo), semana y mes (por sede si aplica)
    const totalRow = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM scan_events se ${where}`,
      params
    );
    const windowRow = await query<{ week: string; month: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '7 days')  AS week,
         COUNT(*) FILTER (WHERE scanned_at >= now() - INTERVAL '30 days') AS month
       FROM scan_events
       WHERE scanned_at >= now() - INTERVAL '30 days' ${locClause}`,
      locParams
    );
    const totals = [
      {
        total: totalRow[0]?.total || '0',
        week: windowRow[0]?.week || '0',
        month: windowRow[0]?.month || '0',
      },
    ];

    // Sede más activa (según filtro)
    const topLocation = await query<{ name: string; brand: string; scans: string }>(
      `SELECT l.name, l.brand, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.brand
         ORDER BY scans DESC
         LIMIT 1`,
      params
    );

    // Pico de hora de escaneo (hora local del negocio con más escaneos)
    const peakHour = await query<{ hour: string; scans: string }>(
      `SELECT EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS hour,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY hour
         ORDER BY scans DESC
         LIMIT 1`,
      params
    );

    // Distribución de dispositivos (iOS vs Android vs Other)
    const devices = await query<{ os: string; scans: string }>(
      `SELECT se.os, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY se.os`,
      params
    );

    const osMap: Record<string, number> = { iOS: 0, Android: 0, Other: 0 };
    for (const d of devices) osMap[d.os] = parseInt(d.scans, 10);

    return {
      totalScans: parseInt(totals[0]?.total || '0', 10),
      scansWeek: parseInt(totals[0]?.week || '0', 10),
      scansMonth: parseInt(totals[0]?.month || '0', 10),
      topLocation: topLocation[0]
        ? {
            name: topLocation[0].name,
            brand: topLocation[0].brand,
            scans: parseInt(topLocation[0].scans, 10),
          }
        : null,
      peakHour: peakHour[0]
        ? { hour: parseInt(peakHour[0].hour, 10), scans: parseInt(peakHour[0].scans, 10) }
        : null,
      devices: osMap,
    };
  });

  // ---------- Tendencia diaria (gráfico de líneas) ----------
  app.get('/api/trend', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    const rows = await query<{ day: string; scans: string }>(
      `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY day
         ORDER BY day ASC`,
      params
    );

    return rows.map((r) => ({ day: r.day, scans: parseInt(r.scans, 10) }));
  });

  // ---------- Top 10 sedes (gráfico de barras) ----------
  app.get('/api/top-locations', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    const rows = await query<{ id: string; name: string; city: string; scans: string }>(
      `SELECT l.id, l.name, l.city, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.city
         ORDER BY scans DESC
         LIMIT 10`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      scans: parseInt(r.scans, 10),
    }));
  });

  // ---------- Distribución por hora (opcional para heatmap simple) ----------
  app.get('/api/hourly', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    const rows = await query<{ hour: string; scans: string }>(
      `SELECT EXTRACT(HOUR FROM se.scanned_at AT TIME ZONE '${APP_TZ}')::int AS hour, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY hour
         ORDER BY hour ASC`,
      params
    );

    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, scans: 0 }));
    for (const r of rows) hours[parseInt(r.hour, 10)].scans = parseInt(r.scans, 10);
    return hours;
  });

  // ---------- Desglose por canal / destino (WhatsApp, Instagram, ...) ----------
  app.get('/api/channels', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);
    const rows = await query<{ channel: string; scans: string }>(
      `SELECT se.channel, COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY se.channel
         ORDER BY scans DESC`,
      params
    );
    return rows.map((r) => ({ channel: r.channel, scans: parseInt(r.scans, 10) }));
  });

  // ---------- Tendencia avanzada (variación % + promedio de la cadena) ----------
  app.get('/api/trend-advanced', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    // Serie diaria de la selección actual
    const series = await query<{ day: string; scans: string }>(
      `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
              COUNT(*) AS scans
         FROM scan_events se
         ${where}
         GROUP BY day
         ORDER BY day ASC`,
      params
    );

    // Promedio de la cadena por día = escaneos totales del día / número de sedes activas.
    // (contexto para saber si la selección está por encima o debajo de la media)
    const avgFilters = buildFilters({ from: q.from, to: q.to }); // sin locationId
    const chainAvg = await query<{ day: string; avg_scans: string }>(
      `SELECT day, (total::numeric / NULLIF(loc_count, 0)) AS avg_scans
         FROM (
           SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
                  COUNT(*) AS total
             FROM scan_events se
             ${avgFilters.where}
             GROUP BY day
         ) d
         CROSS JOIN (SELECT COUNT(*) AS loc_count FROM locations WHERE status = 'active') c
         ORDER BY day ASC`,
      avgFilters.params
    );
    const avgMap: Record<string, number> = {};
    for (const r of chainAvg) avgMap[r.day] = Math.round(parseFloat(r.avg_scans) || 0);

    // Total del periodo actual
    const currentTotal = series.reduce((a, r) => a + parseInt(r.scans, 10), 0);

    // Total del periodo anterior equivalente (mismo nº de días justo antes)
    let prevTotal = 0;
    let variationPct: number | null = null;
    if (q.from && q.to) {
      const prevParams: any[] = [q.from, q.to, q.from];
      let prevWhere = `se.scanned_at >= (($1::date - ($2::date - $3::date + 1))::timestamp AT TIME ZONE '${APP_TZ}')
                       AND se.scanned_at < (($3::date)::timestamp AT TIME ZONE '${APP_TZ}')`;
      if (q.locationId) {
        prevParams.push(q.locationId);
        prevWhere += ` AND se.location_id = $${prevParams.length}`;
      }
      const prevRow = await query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM scan_events se WHERE ${prevWhere}`,
        prevParams
      );
      prevTotal = parseInt(prevRow[0]?.total || '0', 10);
      if (prevTotal > 0) {
        variationPct = Math.round(((currentTotal - prevTotal) / prevTotal) * 1000) / 10;
      } else if (currentTotal > 0) {
        variationPct = 100;
      } else {
        variationPct = 0;
      }
    }

    return {
      series: series.map((r) => ({
        day: r.day,
        scans: parseInt(r.scans, 10),
        avg: avgMap[r.day] || 0,
      })),
      currentTotal,
      prevTotal,
      variationPct,
    };
  });

  // ---------- Benchmarking: Top 3 vs Bottom 3 + gap ----------
  app.get('/api/benchmark', async (req) => {
    const q = req.query as any;
    const { where, params } = buildFilters(q);

    // Ranking de sedes por volumen en el periodo (solo sedes con actividad).
    const ranked = await query<{ id: string; name: string; city: string; scans: string }>(
      `SELECT l.id, l.name, l.city, COUNT(*) AS scans
         FROM scan_events se
         JOIN locations l ON l.id = se.location_id
         ${where}
         GROUP BY l.id, l.name, l.city
         ORDER BY scans DESC`,
      params
    );

    const mapped = ranked.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      scans: parseInt(r.scans, 10),
    }));

    const top3 = mapped.slice(0, 3);
    const bottom3 = mapped.slice(-3).reverse(); // menor volumen primero

    const leader = top3[0]?.scans || 0;
    const laggard = mapped.length ? mapped[mapped.length - 1].scans : 0;
    // Gap de rendimiento: cuánto más tiene el líder respecto al de menor rendimiento.
    let gapPct: number | null = null;
    if (laggard > 0) {
      gapPct = Math.round(((leader - laggard) / laggard) * 100);
    } else if (leader > 0) {
      gapPct = null; // el de menor rendimiento tiene 0: gap "infinito"
    }

    return { top3, bottom3, leaderScans: leader, laggardScans: laggard, gapPct, totalLocations: mapped.length };
  });

  // ---------- Comparación A/B de dos sedes ----------
  app.get<{ Querystring: { a?: string; b?: string; from?: string; to?: string } }>(
    '/api/compare',
    async (req) => {
      const q = req.query;
      if (!q.a || !q.b) {
        return { error: 'Debes indicar dos sedes (a y b).' };
      }

      async function seriesFor(locationId: string) {
        const f = buildFilters({ from: q.from, to: q.to, locationId });
        const rows = await query<{ day: string; scans: string }>(
          `SELECT to_char(date_trunc('day', se.scanned_at AT TIME ZONE '${APP_TZ}'), 'YYYY-MM-DD') AS day,
                  COUNT(*) AS scans
             FROM scan_events se
             ${f.where}
             GROUP BY day ORDER BY day ASC`,
          f.params
        );
        return rows.map((r) => ({ day: r.day, scans: parseInt(r.scans, 10) }));
      }

      const meta = await query<{ id: string; name: string; city: string }>(
        `SELECT id, name, city FROM locations WHERE id = ANY($1::uuid[])`,
        [[q.a, q.b]]
      );
      const metaOf = (id: string) => meta.find((m) => m.id === id) || null;

      const [seriesA, seriesB] = await Promise.all([seriesFor(q.a), seriesFor(q.b)]);

      // Unificar los días de ambas series para alinear el eje X
      const days = Array.from(
        new Set([...seriesA.map((d) => d.day), ...seriesB.map((d) => d.day)])
      ).sort();
      const mapA: Record<string, number> = {};
      const mapB: Record<string, number> = {};
      for (const d of seriesA) mapA[d.day] = d.scans;
      for (const d of seriesB) mapB[d.day] = d.scans;

      return {
        days,
        a: {
          location: metaOf(q.a),
          totals: seriesA.reduce((s, d) => s + d.scans, 0),
          data: days.map((d) => mapA[d] || 0),
        },
        b: {
          location: metaOf(q.b),
          totals: seriesB.reduce((s, d) => s + d.scans, 0),
          data: days.map((d) => mapB[d] || 0),
        },
      };
    }
  );

  // ---------- Salud operativa de sedes (alertas de inactividad) ----------
  app.get('/api/health-status', async () => {
    const rows = await query<{
      id: string;
      name: string;
      city: string;
      status: string;
      last_scan: string | null;
      hours_since: string | null;
    }>(
      `SELECT l.id, l.name, l.city, l.status,
              MAX(se.scanned_at) AS last_scan,
              EXTRACT(EPOCH FROM (now() - MAX(se.scanned_at))) / 3600 AS hours_since
         FROM locations l
         LEFT JOIN scan_events se ON se.location_id = l.id
         GROUP BY l.id, l.name, l.city, l.status
         ORDER BY hours_since DESC NULLS FIRST`
    );

    function classify(hoursSince: number | null): 'active' | 'low' | 'alert' {
      if (hoursSince === null) return 'alert'; // nunca ha tenido escaneos
      if (hoursSince <= 24) return 'active';
      if (hoursSince <= 48) return 'low';
      return 'alert';
    }

    const items = rows.map((r) => {
      const hrs = r.hours_since !== null ? parseFloat(r.hours_since) : null;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        enabled: r.status === 'active',
        lastScan: r.last_scan,
        hoursSince: hrs !== null ? Math.round(hrs * 10) / 10 : null,
        state: classify(hrs),
      };
    });

    const summary = {
      active: items.filter((i) => i.state === 'active').length,
      low: items.filter((i) => i.state === 'low').length,
      alert: items.filter((i) => i.state === 'alert').length,
    };

    return { summary, items };
  });

  // ---------- Lista de sedes (tabla de gestión) ----------
  app.get('/api/locations', async () => {
    const rows = await query(
      `SELECT
         l.id, l.name, l.brand, l.city, l.status,
         COUNT(DISTINCT d.id) AS nfc_points,
         COALESCE(sc.total_clicks, 0) AS total_clicks
       FROM locations l
       LEFT JOIN devices d ON d.location_id = l.id
       LEFT JOIN (
         SELECT location_id, COUNT(*) AS total_clicks
           FROM scan_events GROUP BY location_id
       ) sc ON sc.location_id = l.id
       GROUP BY l.id, l.name, l.brand, l.city, l.status, sc.total_clicks
       ORDER BY total_clicks DESC`
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      city: r.city,
      status: r.status,
      nfcPoints: parseInt(r.nfc_points, 10),
      totalClicks: parseInt(r.total_clicks, 10),
    }));
  });

  // ---------- Dispositivos de una sede ----------
  app.get<{ Params: { id: string } }>('/api/locations/:id/devices', async (req) => {
    const { id } = req.params;
    const rows = await query(
      `SELECT id, label, target_url, status, updated_at
         FROM devices WHERE location_id = $1 ORDER BY label ASC`,
      [id]
    );
    return rows;
  });

  // ---------- Todos los dispositivos (para el selector de gestión) ----------
  app.get('/api/devices', async () => {
    const rows = await query(
      `SELECT d.id, d.label, d.target_url, d.status, d.updated_at,
              l.name AS location_name, l.city AS location_city, l.id AS location_id
         FROM devices d
         JOIN locations l ON l.id = d.location_id
         ORDER BY l.name ASC, d.label ASC`
    );
    return rows;
  });

  // ---------- Actualizar target_url de un dispositivo (tiempo real) ----------
  app.patch<{ Params: { id: string }; Body: { target_url?: string; status?: string } }>(
    '/api/devices/:id',
    async (req, reply) => {
      const { id } = req.params;
      const { target_url, status } = req.body || {};

      if (!target_url && !status) {
        return reply.code(400).send({ error: 'Nada que actualizar.' });
      }
      if (target_url) {
        try {
          // Validar URL
          // eslint-disable-next-line no-new
          new URL(target_url);
        } catch {
          return reply.code(400).send({ error: 'target_url inválida.' });
        }
      }

      const fields: string[] = [];
      const params: any[] = [];
      if (target_url) {
        params.push(target_url);
        fields.push(`target_url = $${params.length}`);
      }
      if (status) {
        params.push(status);
        fields.push(`status = $${params.length}`);
      }
      params.push(id);

      const result = await pool.query(
        `UPDATE devices SET ${fields.join(', ')}, updated_at = now()
           WHERE id = $${params.length}
         RETURNING id AS device_id, location_id, target_url, status`,
        params
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Dispositivo no encontrado.' });
      }

      const device = result.rows[0] as DeviceCache;
      // Invalidar / refrescar caché Redis para que el cambio surta efecto al instante.
      try {
        await redis.set(deviceCacheKey(device.device_id), JSON.stringify(device), 'EX', 3600);
      } catch {
        /* ignore */
      }

      return { ok: true, device };
    }
  );

  // ---------- Crear sede ----------
  app.post<{
    Body: { name?: string; brand?: string; city?: string; status?: string };
  }>('/api/locations', async (req, reply) => {
    const { name, brand, city, status } = req.body || {};

    if (!name || !name.trim()) {
      return reply.code(400).send({ error: 'El nombre es obligatorio.' });
    }
    if (!city || !city.trim()) {
      return reply.code(400).send({ error: 'La ciudad es obligatoria.' });
    }
    const st = status === 'inactive' ? 'inactive' : 'active';

    const result = await pool.query(
      `INSERT INTO locations (name, brand, city, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, brand, city, status`,
      [name.trim(), (brand || name).trim(), city.trim(), st]
    );

    return reply.code(201).send({ ok: true, location: result.rows[0] });
  });

  // ---------- Editar sede ----------
  app.patch<{
    Params: { id: string };
    Body: { name?: string; brand?: string; city?: string; status?: string };
  }>('/api/locations/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, brand, city, status } = req.body || {};

    const fields: string[] = [];
    const params: any[] = [];
    if (name && name.trim()) {
      params.push(name.trim());
      fields.push(`name = $${params.length}`);
    }
    if (brand && brand.trim()) {
      params.push(brand.trim());
      fields.push(`brand = $${params.length}`);
    }
    if (city && city.trim()) {
      params.push(city.trim());
      fields.push(`city = $${params.length}`);
    }
    if (status === 'active' || status === 'inactive') {
      params.push(status);
      fields.push(`status = $${params.length}`);
    }
    if (!fields.length) {
      return reply.code(400).send({ error: 'Nada que actualizar.' });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE locations SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, brand, city, status`,
      params
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }
    return { ok: true, location: result.rows[0] };
  });

  // ---------- Eliminar sede (y sus dispositivos/escaneos en cascada) ----------
  app.delete<{ Params: { id: string } }>('/api/locations/:id', async (req, reply) => {
    const { id } = req.params;

    // Recuperar dispositivos para limpiar su caché en Redis
    const devs = await pool.query('SELECT id FROM devices WHERE location_id = $1', [id]);

    const result = await pool.query('DELETE FROM locations WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: 'Sede no encontrada.' });
    }

    try {
      const keys = devs.rows.map((d) => deviceCacheKey(d.id));
      if (keys.length) await redis.del(...keys);
    } catch {
      /* ignore */
    }

    return { ok: true, deletedDevices: devs.rowCount };
  });

  // ---------- Crear dispositivo NFC en una sede ----------
  app.post<{
    Body: { location_id?: string; label?: string; target_url?: string; status?: string };
  }>('/api/devices', async (req, reply) => {
    const { location_id, label, target_url, status } = req.body || {};

    if (!location_id) {
      return reply.code(400).send({ error: 'Debes indicar la sede (location_id).' });
    }
    if (!label || !label.trim()) {
      return reply.code(400).send({ error: 'La etiqueta del punto es obligatoria.' });
    }
    if (!target_url) {
      return reply.code(400).send({ error: 'La target_url es obligatoria.' });
    }
    try {
      // eslint-disable-next-line no-new
      new URL(target_url);
    } catch {
      return reply.code(400).send({ error: 'target_url inválida.' });
    }
    const st = status === 'inactive' ? 'inactive' : 'active';

    // Verificar que la sede exista
    const loc = await pool.query('SELECT id FROM locations WHERE id = $1', [location_id]);
    if (loc.rowCount === 0) {
      return reply.code(404).send({ error: 'La sede indicada no existe.' });
    }

    const result = await pool.query(
      `INSERT INTO devices (location_id, label, target_url, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id AS device_id, location_id, target_url, status`,
      [location_id, label.trim(), target_url, st]
    );

    const device = result.rows[0] as DeviceCache;
    // Precargar la caché para que la redirección funcione de inmediato.
    try {
      await redis.set(deviceCacheKey(device.device_id), JSON.stringify(device), 'EX', 3600);
    } catch {
      /* ignore */
    }

    return reply.code(201).send({
      ok: true,
      device,
      redirectPath: `/r/${device.device_id}`,
    });
  });

  // ---------- Marcas disponibles (para el alcance de cambios masivos) ----------
  app.get('/api/brands', async () => {
    const rows = await query<{ brand: string; locations: string }>(
      `SELECT brand, COUNT(*) AS locations FROM locations GROUP BY brand ORDER BY brand ASC`
    );
    return rows.map((r) => ({ brand: r.brand, locations: parseInt(r.locations, 10) }));
  });

  // ---------- Previsualizar alcance de un cambio masivo ----------
  app.get<{ Querystring: { scope?: string; value?: string } }>(
    '/api/devices/bulk-preview',
    async (req) => {
      const { scope, value } = req.query;
      const { where, params } = bulkScopeWhere(scope, value);
      const rows = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM devices d
           JOIN locations l ON l.id = d.location_id ${where}`,
        params
      );
      return { affected: parseInt(rows[0]?.count || '0', 10) };
    }
  );

  // ---------- Cambio masivo de destino (campaña) ----------
  app.post<{
    Body: { scope?: string; value?: string; target_url?: string };
  }>('/api/devices/bulk-update', async (req, reply) => {
    const { scope, value, target_url } = req.body || {};

    if (!target_url) {
      return reply.code(400).send({ error: 'La nueva URL es obligatoria.' });
    }
    try {
      // eslint-disable-next-line no-new
      new URL(target_url);
    } catch {
      return reply.code(400).send({ error: 'URL inválida.' });
    }
    if (scope !== 'all' && scope !== 'brand' && scope !== 'location') {
      return reply.code(400).send({ error: 'Alcance inválido.' });
    }
    if ((scope === 'brand' || scope === 'location') && !value) {
      return reply.code(400).send({ error: 'Falta el valor del alcance.' });
    }

    const { where, params } = bulkScopeWhere(scope, value);

    // Snapshot previo (para revertir) de los dispositivos afectados
    const before = await query<{ device_id: string; target_url: string; location_id: string }>(
      `SELECT d.id AS device_id, d.target_url, d.location_id
         FROM devices d JOIN locations l ON l.id = d.location_id ${where}`,
      params
    );
    if (before.length === 0) {
      return reply.code(404).send({ error: 'No hay dispositivos en ese alcance.' });
    }

    // Etiqueta legible del alcance
    let scopeLabel = 'Todas las sedes';
    if (scope === 'brand') scopeLabel = `Marca: ${value}`;
    else if (scope === 'location') {
      const loc = await query<{ name: string }>('SELECT name FROM locations WHERE id = $1', [
        value,
      ]);
      scopeLabel = `Sede: ${loc[0]?.name || value}`;
    }

    // Actualización en lote
    const updated = await query<{ device_id: string; location_id: string; status: string }>(
      `UPDATE devices SET target_url = $1, updated_at = now()
         WHERE id IN (
           SELECT d.id FROM devices d JOIN locations l ON l.id = d.location_id ${where}
         )
       RETURNING id AS device_id, location_id, status`,
      [target_url, ...params]
    );

    // Refrescar caché Redis de todos los afectados
    try {
      const pipe = redis.pipeline();
      for (const d of updated) {
        pipe.set(
          deviceCacheKey(d.device_id),
          JSON.stringify({
            device_id: d.device_id,
            location_id: d.location_id,
            target_url,
            status: d.status,
          }),
          'EX',
          3600
        );
      }
      await pipe.exec();
    } catch {
      /* ignore */
    }

    // Registrar en el historial con el snapshot para poder revertir
    const snapshot = before.map((b) => ({ device_id: b.device_id, target_url: b.target_url }));
    const hist = await query<{ id: string }>(
      `INSERT INTO bulk_updates (scope, scope_label, new_url, affected, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [scope, scopeLabel, target_url, updated.length, JSON.stringify(snapshot)]
    );

    return { ok: true, affected: updated.length, historyId: hist[0]?.id, scopeLabel };
  });

  // ---------- Historial de cambios masivos ----------
  app.get('/api/bulk-updates', async () => {
    const rows = await query(
      `SELECT id, scope, scope_label, new_url, affected, reverted, created_at
         FROM bulk_updates ORDER BY created_at DESC LIMIT 30`
    );
    return rows;
  });

  // ---------- Revertir un cambio masivo ----------
  app.post<{ Params: { id: string } }>('/api/bulk-updates/:id/revert', async (req, reply) => {
    const { id } = req.params;
    const rows = await query<{ snapshot: any; reverted: boolean }>(
      `SELECT snapshot, reverted FROM bulk_updates WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Registro no encontrado.' });
    }
    if (rows[0].reverted) {
      return reply.code(400).send({ error: 'Este cambio ya fue revertido.' });
    }

    const snapshot: { device_id: string; target_url: string }[] = rows[0].snapshot || [];
    let restored = 0;
    for (const s of snapshot) {
      const res = await pool.query(
        `UPDATE devices SET target_url = $1, updated_at = now()
           WHERE id = $2
         RETURNING id AS device_id, location_id, status`,
        [s.target_url, s.device_id]
      );
      if (res.rowCount) {
        const d = res.rows[0];
        try {
          await redis.set(
            deviceCacheKey(d.device_id),
            JSON.stringify({
              device_id: d.device_id,
              location_id: d.location_id,
              target_url: s.target_url,
              status: d.status,
            }),
            'EX',
            3600
          );
        } catch {
          /* ignore */
        }
        restored++;
      }
    }

    await pool.query('UPDATE bulk_updates SET reverted = true WHERE id = $1', [id]);
    return { ok: true, restored };
  });

  // ---------- Diagnóstico de un dispositivo ----------
  app.get<{ Params: { id: string } }>('/api/debug/device/:id', async (req) => {
    const { id } = req.params;
    const device = await query(
      `SELECT d.id, d.label, d.status, d.location_id, l.name AS location_name
         FROM devices d JOIN locations l ON l.id = d.location_id
         WHERE d.id = $1`,
      [id]
    );
    const counts = await query<{ total: string; last_scan: string | null }>(
      `SELECT COUNT(*) AS total, MAX(scanned_at) AS last_scan
         FROM scan_events WHERE device_id = $1`,
      [id]
    );
    const recent = await query(
      `SELECT os, scanned_at FROM scan_events
         WHERE device_id = $1 ORDER BY scanned_at DESC LIMIT 5`,
      [id]
    );
    const nowRow = await query<{ now: string; tz: string }>(
      `SELECT now() AS now, current_setting('TIMEZONE') AS tz`
    );
    return {
      device: device[0] || null,
      totalScans: parseInt(counts[0]?.total || '0', 10),
      lastScan: counts[0]?.last_scan || null,
      recent,
      serverNow: nowRow[0]?.now,
      serverTimezone: nowRow[0]?.tz,
    };
  });

  // ---------- Health ----------
  app.get('/api/health', async () => {
    let db = false;
    let cache = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch {
      /* */
    }
    try {
      await redis.ping();
      cache = true;
    } catch {
      /* */
    }
    return { status: 'ok', db, cache };
  });
}
