/**
 * Rutas de "Tú frente a tu competencia" (src/lib/places.ts).
 *
 * Cada sede enlaza su ficha de Google y hasta 3 competidores elegidos a mano
 * desde un buscador. Se muestra calificación, reseñas y reseñas ganadas desde
 * la medición de hace ~30 días (o desde la primera, si es más reciente).
 */
import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { resolveCompanyId } from './api';
import { isPlacesEnabled, searchPlaces, refreshPlace, locationPlaceIds } from '../lib/places';

const MAX_COMPETITORS = 3;

async function locationInScope(req: any, id: string) {
  const companyId = resolveCompanyId(req);
  const r = await query<{ id: string; company_id: string | null; google_place_id: string | null; google_place_name: string | null }>(
    `SELECT id, company_id, google_place_id, google_place_name FROM locations WHERE id = $1`,
    [id]
  );
  if (!r[0] || (companyId !== undefined && r[0].company_id !== companyId)) return null;
  return r[0];
}

interface PlaceStat {
  rating: number | null;
  reviews: number | null;
  gained: number | null; // reseñas ganadas desde `since`
  since: string | null; // fecha de la medición base
  measuredOn: string | null;
}

/** Última medición y la base (≈ hace 30 días, o la primera) de varios lugares. */
async function placeStats(placeIds: string[]): Promise<Map<string, PlaceStat>> {
  const out = new Map<string, PlaceStat>();
  if (!placeIds.length) return out;
  const rows = await query<{
    place_id: string; rating: string; review_count: number; measured_on: string;
    base_count: number | null; base_on: string | null;
  }>(
    `SELECT s.place_id, s.rating, s.review_count, to_char(s.measured_on, 'YYYY-MM-DD') AS measured_on,
            b.review_count AS base_count, to_char(b.measured_on, 'YYYY-MM-DD') AS base_on
       FROM (SELECT DISTINCT ON (place_id) * FROM place_snapshots
              WHERE place_id = ANY($1) ORDER BY place_id, measured_on DESC) s
       LEFT JOIN LATERAL (
         -- Base: la última medición de hace 30+ días; si no hay, la primera.
         SELECT review_count, measured_on FROM place_snapshots p
          WHERE p.place_id = s.place_id AND p.measured_on < s.measured_on
          ORDER BY (p.measured_on <= s.measured_on - 30) DESC,
                   CASE WHEN p.measured_on <= s.measured_on - 30 THEN p.measured_on END DESC NULLS LAST,
                   p.measured_on ASC
          LIMIT 1
       ) b ON true`,
    [placeIds]
  );
  for (const r of rows) {
    out.set(r.place_id, {
      rating: r.rating === null ? null : Math.round(parseFloat(r.rating) * 10) / 10,
      reviews: r.review_count,
      gained: r.base_count === null ? null : r.review_count - r.base_count,
      since: r.base_on,
      measuredOn: r.measured_on,
    });
  }
  return out;
}

const empty: PlaceStat = { rating: null, reviews: null, gained: null, since: null, measuredOn: null };

export async function competitionRoutes(app: FastifyInstance) {
  app.get('/api/places/status', async () => ({ enabled: isPlacesEnabled() }));

  app.get<{ Querystring: { q?: string } }>('/api/places/search', async (req, reply) => {
    if (!isPlacesEnabled()) return reply.code(503).send({ error: 'La conexión con Google no está configurada.' });
    const q = (req.query.q || '').trim();
    if (q.length < 3) return reply.code(400).send({ error: 'Escribe al menos 3 letras.' });
    try {
      return await searchPlaces(q.slice(0, 120));
    } catch (err: any) {
      return reply.code(502).send({ error: `Google: ${err.message}` });
    }
  });

  // Ficha de una sede: ella y sus competidores, con su última medición.
  app.get<{ Params: { id: string } }>('/api/locations/:id/competition', async (req, reply) => {
    const loc = await locationInScope(req, req.params.id);
    if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
    const comps = await query<{ id: string; place_id: string; name: string; address: string | null }>(
      `SELECT id, place_id, name, address FROM location_competitors WHERE location_id = $1 ORDER BY created_at`,
      [loc.id]
    );
    const ids = [...(loc.google_place_id ? [loc.google_place_id] : []), ...comps.map((c) => c.place_id)];
    const stats = await placeStats(ids);
    return {
      enabled: isPlacesEnabled(),
      own: loc.google_place_id
        ? { placeId: loc.google_place_id, name: loc.google_place_name, ...(stats.get(loc.google_place_id) || empty) }
        : null,
      competitors: comps.map((c) => ({
        id: c.id, placeId: c.place_id, name: c.name, address: c.address, ...(stats.get(c.place_id) || empty),
      })),
      max: MAX_COMPETITORS,
    };
  });

  // Enlazar (o quitar con placeId null) la ficha de Google de la sede.
  app.put<{ Params: { id: string }; Body: { placeId?: string | null; name?: string } }>(
    '/api/locations/:id/google-place',
    async (req, reply) => {
      const loc = await locationInScope(req, req.params.id);
      if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
      const placeId = (req.body?.placeId || '').trim() || null;
      await pool.query(`UPDATE locations SET google_place_id = $1, google_place_name = $2 WHERE id = $3`, [
        placeId, placeId ? (req.body?.name || '').slice(0, 200) : null, loc.id,
      ]);
      if (placeId && isPlacesEnabled()) await refreshPlace(placeId).catch(() => {});
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string }; Body: { placeId?: string; name?: string; address?: string } }>(
    '/api/locations/:id/competitors',
    async (req, reply) => {
      const loc = await locationInScope(req, req.params.id);
      if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
      const placeId = (req.body?.placeId || '').trim();
      const name = (req.body?.name || '').trim().slice(0, 200);
      if (!placeId || !name) return reply.code(400).send({ error: 'Elige un negocio de la lista.' });
      if (placeId === loc.google_place_id) return reply.code(400).send({ error: 'Ese es el negocio de la propia sede.' });
      const n = await query<{ c: string }>(`SELECT COUNT(*) AS c FROM location_competitors WHERE location_id = $1`, [loc.id]);
      if (parseInt(n[0].c, 10) >= MAX_COMPETITORS) {
        return reply.code(400).send({ error: `Máximo ${MAX_COMPETITORS} competidores por sede.` });
      }
      await pool.query(
        `INSERT INTO location_competitors (location_id, place_id, name, address)
         VALUES ($1, $2, $3, $4) ON CONFLICT (location_id, place_id) DO NOTHING`,
        [loc.id, placeId, name, (req.body?.address || '').slice(0, 300) || null]
      );
      if (isPlacesEnabled()) await refreshPlace(placeId).catch(() => {});
      return reply.code(201).send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string; cid: string } }>('/api/locations/:id/competitors/:cid', async (req, reply) => {
    const loc = await locationInScope(req, req.params.id);
    if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
    await pool.query(`DELETE FROM location_competitors WHERE id = $1 AND location_id = $2`, [req.params.cid, loc.id]);
    return { ok: true };
  });

  // Medir ya todos los lugares de la sede (además de la medición semanal).
  app.post<{ Params: { id: string } }>('/api/locations/:id/competition/refresh', async (req, reply) => {
    if (!isPlacesEnabled()) return reply.code(503).send({ error: 'La conexión con Google no está configurada.' });
    const loc = await locationInScope(req, req.params.id);
    if (!loc) return reply.code(404).send({ error: 'Sede no encontrada.' });
    const ids = await locationPlaceIds(loc.id);
    let ok = 0;
    for (const id of ids) {
      try {
        await refreshPlace(id);
        ok++;
      } catch {
        /* se reintenta en la medición semanal */
      }
    }
    return { ok: true, measured: ok, total: ids.length };
  });

  // Resumen por empresa para Comparar sedes: cada sede frente a su mejor competidor.
  app.get('/api/competition', async (req) => {
    const companyId = resolveCompanyId(req);
    const params: any[] = [];
    let where = `WHERE l.google_place_id IS NOT NULL AND l.status = 'active'`;
    if (companyId !== undefined) {
      params.push(companyId);
      where += ` AND l.company_id = $1`;
    }
    const locs = await query<{ id: string; name: string; city: string; google_place_id: string }>(
      `SELECT l.id, l.name, l.city, l.google_place_id FROM locations l ${where} ORDER BY l.name`,
      params
    );
    if (!locs.length) return { enabled: false };
    const comps = await query<{ location_id: string; place_id: string; name: string }>(
      `SELECT location_id, place_id, name FROM location_competitors WHERE location_id = ANY($1)`,
      [locs.map((l) => l.id)]
    );
    const stats = await placeStats([...locs.map((l) => l.google_place_id), ...comps.map((c) => c.place_id)]);
    const items = locs
      .map((l) => {
        const own = stats.get(l.google_place_id) || empty;
        const mine = comps.filter((c) => c.location_id === l.id).map((c) => ({ name: c.name, ...(stats.get(c.place_id) || empty) }));
        const rated = mine.filter((c) => c.rating !== null);
        const best = rated.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] || null;
        const compGained = mine.filter((c) => c.gained !== null);
        return {
          id: l.id,
          name: l.name,
          city: l.city,
          rating: own.rating,
          reviews: own.reviews,
          gained: own.gained,
          since: own.since,
          best: best ? { name: best.name, rating: best.rating, reviews: best.reviews } : null,
          // Promedio de reseñas ganadas por los competidores en el mismo lapso.
          compGained: compGained.length
            ? Math.round(compGained.reduce((a, c) => a + (c.gained ?? 0), 0) / compGained.length)
            : null,
          ahead: best && own.rating !== null ? own.rating >= (best.rating ?? 0) : null,
        };
      })
      .filter((i) => i.rating !== null && i.best);
    if (!items.length) return { enabled: false };
    return {
      enabled: true,
      ahead: items.filter((i) => i.ahead).length,
      items: items.sort((a, b) => Number(a.ahead) - Number(b.ahead) || (a.rating ?? 0) - (b.rating ?? 0)),
    };
  });
}
