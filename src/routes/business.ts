/**
 * Valor estimado y metas por sede (configurables por empresa).
 *
 * - Valor: la empresa dice cuánto vale para ella cada interacción por destino
 *   (ej. un chat de WhatsApp $15.000, una visita a reseñas $5.000) y el panel
 *   estima el valor generado en el periodo, con su variación.
 * - Metas: una meta mensual por sede (común, con excepción por sede) de
 *   interacciones o de un destino concreto; se mide el mes en curso y se
 *   proyecta el cierre al ritmo actual.
 *
 * Nada de esto cambia datos existentes: sin configurar, las secciones no se
 * muestran. companies.channel_values / goal_monthly / goal_channel y
 * locations.monthly_goal (ver schema.sql).
 */
import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { CHANNELS } from '../lib/channel';
import { resolveCompanyId } from './api';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';

/** Empresa sobre la que se trabaja: la de la sesión o la elegida por el superadmin. */
function scopedCompany(req: any): string | null {
  const c = resolveCompanyId(req);
  return c && c !== '__none__' ? c : null;
}

interface CompanySettings {
  channel_values: Record<string, number> | null;
  goal_monthly: number | null;
  goal_channel: string | null;
}

async function settingsOf(companyId: string): Promise<CompanySettings | null> {
  const r = await query<CompanySettings>(
    `SELECT channel_values, goal_monthly, goal_channel FROM companies WHERE id = $1`,
    [companyId]
  );
  return r[0] || null;
}

/** Valores válidos: enteros positivos (pesos) por canal conocido. */
function cleanValues(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.round(Number(v));
    if ((CHANNELS as readonly string[]).includes(k) && Number.isFinite(n) && n > 0 && n < 100_000_000) out[k] = n;
  }
  return out;
}

export async function businessRoutes(app: FastifyInstance) {
  // ---------- Configuración de valor y metas ----------
  app.get('/api/business-settings', async (req, reply) => {
    const companyId = scopedCompany(req);
    if (!companyId) return reply.code(400).send({ error: 'Elige una empresa.' });
    const s = await settingsOf(companyId);
    if (!s) return reply.code(404).send({ error: 'Empresa no encontrada.' });
    // Destinos que la empresa usa de verdad, para no pedir valores de más.
    const used = await query<{ channel: string }>(
      `SELECT DISTINCT se.channel FROM scan_events se
         JOIN locations l ON l.id = se.location_id
        WHERE l.company_id = $1 AND se.channel <> 'Otro'`,
      [companyId]
    );
    return {
      channelValues: s.channel_values || {},
      goalMonthly: s.goal_monthly,
      goalChannel: s.goal_channel,
      channels: used.map((u) => u.channel).sort(),
    };
  });

  app.put<{ Body: { channelValues?: Record<string, number>; goalMonthly?: number | null; goalChannel?: string | null } }>(
    '/api/business-settings',
    async (req, reply) => {
      const companyId = scopedCompany(req);
      if (!companyId) return reply.code(400).send({ error: 'Elige una empresa.' });
      const b = req.body || {};
      const values = cleanValues(b.channelValues);
      const goal = b.goalMonthly === null || b.goalMonthly === undefined ? null : Math.round(Number(b.goalMonthly));
      if (goal !== null && (!Number.isFinite(goal) || goal < 1 || goal > 1_000_000)) {
        return reply.code(400).send({ error: 'La meta debe ser un número mayor que cero.' });
      }
      const goalChannel = b.goalChannel && (CHANNELS as readonly string[]).includes(b.goalChannel) ? b.goalChannel : null;
      await pool.query(
        `UPDATE companies SET channel_values = $1::jsonb, goal_monthly = $2, goal_channel = $3 WHERE id = $4`,
        [Object.keys(values).length ? JSON.stringify(values) : null, goal, goalChannel, companyId]
      );
      return { ok: true };
    }
  );

  // Meta propia de una sede (null = usa la meta común de la empresa).
  app.put<{ Params: { id: string }; Body: { monthlyGoal?: number | null } }>(
    '/api/locations/:id/goal',
    async (req, reply) => {
      const companyId = resolveCompanyId(req);
      const loc = await query<{ company_id: string | null }>(`SELECT company_id FROM locations WHERE id = $1`, [req.params.id]);
      if (!loc[0] || (companyId !== undefined && loc[0].company_id !== companyId)) {
        return reply.code(404).send({ error: 'Sede no encontrada.' });
      }
      const raw = req.body?.monthlyGoal;
      const goal = raw === null || raw === undefined || (raw as any) === '' ? null : Math.round(Number(raw));
      if (goal !== null && (!Number.isFinite(goal) || goal < 1 || goal > 1_000_000)) {
        return reply.code(400).send({ error: 'La meta debe ser un número mayor que cero.' });
      }
      await pool.query(`UPDATE locations SET monthly_goal = $1 WHERE id = $2`, [goal, req.params.id]);
      return { ok: true, monthlyGoal: goal };
    }
  );

  // ---------- Valor estimado del periodo (con el periodo anterior) ----------
  app.get('/api/value', async (req) => {
    const q = req.query as any;
    const companyId = scopedCompany(req);
    if (!companyId || !q.from || !q.to) return { enabled: false };
    const s = await settingsOf(companyId);
    const values = s?.channel_values || {};
    if (!Object.keys(values).length) return { enabled: false };

    const params: any[] = [q.from, q.to, companyId];
    let extra = '';
    if (q.locationId) {
      params.push(q.locationId);
      extra += ` AND se.location_id = $${params.length}`;
    }
    if (q.channel) {
      params.push(q.channel);
      extra += ` AND se.channel = $${params.length}`;
    }
    // Periodo actual [from, to] y el anterior del mismo largo, en hora local.
    const rows = await query<{ channel: string; cur: string; prev: string }>(
      `WITH b AS (
         SELECT ($1::date)::timestamp AT TIME ZONE '${APP_TZ}' AS cur_start,
                ($2::date + 1)::timestamp AT TIME ZONE '${APP_TZ}' AS cur_end,
                ($1::date - ($2::date - $1::date + 1))::timestamp AT TIME ZONE '${APP_TZ}' AS prev_start
       )
       SELECT se.channel,
              COUNT(*) FILTER (WHERE se.scanned_at >= b.cur_start) AS cur,
              COUNT(*) FILTER (WHERE se.scanned_at <  b.cur_start) AS prev
         FROM scan_events se, b
        WHERE se.scanned_at >= b.prev_start AND se.scanned_at < b.cur_end
          AND se.location_id IN (SELECT id FROM locations WHERE company_id = $3)
          ${extra}
        GROUP BY se.channel`,
      params
    );
    let total = 0;
    let prevTotal = 0;
    const byChannel = rows
      .filter((r) => values[r.channel])
      .map((r) => {
        const unit = values[r.channel];
        const cur = parseInt(r.cur, 10);
        total += cur * unit;
        prevTotal += parseInt(r.prev, 10) * unit;
        return { channel: r.channel, scans: cur, unit, value: cur * unit };
      })
      .sort((a, b) => b.value - a.value);
    return {
      enabled: true,
      total,
      prevTotal,
      variationPct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10 : null,
      byChannel,
    };
  });

  // ---------- Metas del mes en curso por sede ----------
  app.get('/api/goals', async (req) => {
    const companyId = scopedCompany(req);
    if (!companyId) return { enabled: false };
    const s = await settingsOf(companyId);
    const metric = s?.goal_channel || null;
    const params: any[] = [companyId];
    let chan = '';
    if (metric) {
      params.push(metric);
      chan = ` AND se.channel = $2`;
    }
    const rows = await query<{
      id: string; name: string; city: string; goal: number | null; actual: string;
      day: number; days: number;
    }>(
      `WITH m AS (
         SELECT date_trunc('month', now() AT TIME ZONE '${APP_TZ}') AS start_local,
                EXTRACT(DAY FROM now() AT TIME ZONE '${APP_TZ}')::int AS day,
                EXTRACT(DAY FROM date_trunc('month', now() AT TIME ZONE '${APP_TZ}') + INTERVAL '1 month - 1 day')::int AS days
       )
       SELECT l.id, l.name, l.city, COALESCE(l.monthly_goal, co.goal_monthly) AS goal,
              COUNT(se.id) AS actual, m.day, m.days
         FROM locations l
         JOIN companies co ON co.id = l.company_id
         CROSS JOIN m
         LEFT JOIN scan_events se ON se.location_id = l.id
              AND se.scanned_at >= (m.start_local AT TIME ZONE '${APP_TZ}') ${chan}
        WHERE l.company_id = $1 AND l.status = 'active'
        GROUP BY l.id, l.name, l.city, l.monthly_goal, co.goal_monthly, m.day, m.days`,
      params
    );
    const withGoal = rows.filter((r) => r.goal && r.goal > 0);
    if (!withGoal.length) return { enabled: false };
    const day = rows[0].day;
    const days = rows[0].days;
    const items = withGoal
      .map((r) => {
        const actual = parseInt(r.actual, 10);
        const goal = Number(r.goal);
        // Proyección al cierre al ritmo de lo que va del mes.
        const projected = Math.round((actual / Math.max(day, 1)) * days);
        const projPct = Math.round((projected / goal) * 100);
        const status = actual >= goal ? 'done' : projPct >= 100 ? 'on_track' : projPct >= 80 ? 'close' : 'behind';
        return { id: r.id, name: r.name, city: r.city, goal, actual, projected, pct: Math.round((actual / goal) * 100), projPct, status };
      })
      .sort((a, b) => a.projPct - b.projPct);
    return {
      enabled: true,
      metric: metric || 'Interacciones',
      day,
      days,
      onTrack: items.filter((i) => i.status === 'done' || i.status === 'on_track').length,
      items,
    };
  });
}
