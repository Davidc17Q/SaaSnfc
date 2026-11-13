/**
 * Clientes y equipo: lo que convierte un toque en algo accionable.
 *  - Contactos que el cliente dejó con su autorización (Ley 1581).
 *  - Cupones con canje en caja (emitidos, canjeados, por sede).
 *  - Ranking por vendedor, mesa o caja (devices.staff).
 * Multi-tenant: todo se acota con resolveCompanyId.
 */
import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { getSession, requireApiSession } from '../lib/auth';
import { niceName } from '../lib/names';
import { NO_COMPANY, resolveCompanyId } from './api';

const APP_TZ = process.env.APP_TIMEZONE || 'America/Bogota';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** WHERE por rango (hora local), sede y empresa sobre una columna de fecha. */
function scope(q: any, companyId: string | undefined, dateCol: string, locCol: string) {
  const clauses: string[] = [];
  const params: any[] = [];
  if (q.from && DATE_RE.test(q.from)) {
    params.push(q.from);
    clauses.push(`${dateCol} >= (($${params.length}::date)::timestamp AT TIME ZONE '${APP_TZ}')`);
  }
  if (q.to && DATE_RE.test(q.to)) {
    params.push(q.to);
    clauses.push(`${dateCol} < ((($${params.length}::date + 1))::timestamp AT TIME ZONE '${APP_TZ}')`);
  }
  if (q.locationId) {
    params.push(q.locationId);
    clauses.push(`${locCol} = $${params.length}`);
  }
  if (companyId !== undefined) {
    params.push(companyId);
    clauses.push(`${locCol} IN (SELECT id FROM locations WHERE company_id = $${params.length})`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Empresa sobre la que se crea algo: la de la sesión o la elegida por el superadmin. */
function writeCompany(req: any): string | null {
  const s = getSession(req);
  if (s?.role === 'company_admin') return s.companyId;
  const c = (req.body as any)?.company_id || (req.query as any)?.companyId;
  return c ? String(c) : null;
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Evita que Excel interprete como fórmula un texto escrito por un cliente.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function customerRoutes(app: FastifyInstance) {
  requireApiSession(app);

  // ---------- Ranking por vendedor / mesa / caja ----------
  app.get('/api/staff-ranking', async (req) => {
    const companyId = resolveCompanyId(req);
    const f = scope(req.query, companyId, 'se.scanned_at', 'se.location_id');
    const rows = await query<{ staff: string; location: string; scans: string; wa: string; reviews: string; points: string }>(
      `SELECT d.staff, l.name AS location, COUNT(*) AS scans,
              COUNT(*) FILTER (WHERE se.channel = 'WhatsApp') AS wa,
              COUNT(*) FILTER (WHERE se.channel = 'Google Reviews') AS reviews,
              COUNT(DISTINCT d.id) AS points
         FROM scan_events se
         JOIN devices d ON d.id = se.device_id
         JOIN locations l ON l.id = se.location_id
         ${f.where ? `${f.where} AND` : 'WHERE'} d.staff IS NOT NULL AND btrim(d.staff) <> ''
        GROUP BY d.staff, l.name
        ORDER BY scans DESC
        LIMIT 100`,
      f.params
    );
    // Cuántos puntos tienen responsable asignado (para el estado vacío).
    const p: any[] = [];
    let w = `d.staff IS NOT NULL AND btrim(d.staff) <> ''`;
    if (companyId !== undefined) {
      p.push(companyId);
      w += ` AND l.company_id = $1`;
    }
    const assigned = await query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM devices d JOIN locations l ON l.id = d.location_id WHERE ${w}`,
      p
    );
    return {
      assigned: parseInt(assigned[0]?.c || '0', 10),
      items: rows.map((r) => ({
        staff: r.staff,
        location: niceName(r.location),
        scans: parseInt(r.scans, 10),
        whatsapp: parseInt(r.wa, 10),
        reviews: parseInt(r.reviews, 10),
        points: parseInt(r.points, 10),
      })),
    };
  });

  // ---------- Contactos con autorización ----------
  app.get('/api/leads', async (req) => {
    const companyId = resolveCompanyId(req);
    const f = scope(req.query, companyId, 'ld.created_at', 'ld.location_id');
    const total = await query<{ c: string }>(`SELECT COUNT(*) AS c FROM leads ld ${f.where}`, f.params);
    const rows = await query<{ id: string; name: string | null; phone: string; created: string; location: string; point: string }>(
      `SELECT ld.id, ld.name, ld.phone,
              to_char(ld.created_at AT TIME ZONE '${APP_TZ}', 'YYYY-MM-DD HH24:MI') AS created,
              l.name AS location, d.label AS point
         FROM leads ld
         JOIN locations l ON l.id = ld.location_id
         JOIN devices d ON d.id = ld.device_id
         ${f.where}
        ORDER BY ld.created_at DESC
        LIMIT 200`,
      f.params
    );
    const enabled = await query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM devices d JOIN locations l ON l.id = d.location_id
        WHERE d.capture_lead ${companyId !== undefined ? 'AND l.company_id = $1' : ''}`,
      companyId !== undefined ? [companyId] : []
    );
    return {
      total: parseInt(total[0]?.c || '0', 10),
      pointsEnabled: parseInt(enabled[0]?.c || '0', 10),
      items: rows.map((r) => ({ ...r, location: niceName(r.location) })),
    };
  });

  app.get('/api/leads.csv', async (req, reply) => {
    const companyId = resolveCompanyId(req);
    const f = scope(req.query, companyId, 'ld.created_at', 'ld.location_id');
    const rows = await query<{ name: string | null; phone: string; created: string; location: string; city: string; point: string; consent_text: string }>(
      `SELECT ld.name, ld.phone, to_char(ld.created_at AT TIME ZONE '${APP_TZ}', 'YYYY-MM-DD HH24:MI') AS created,
              l.name AS location, l.city, d.label AS point, ld.consent_text
         FROM leads ld
         JOIN locations l ON l.id = ld.location_id
         JOIN devices d ON d.id = ld.device_id
         ${f.where}
        ORDER BY ld.created_at DESC
        LIMIT 50000`,
      f.params
    );
    const header = ['Fecha', 'Nombre', 'Celular', 'Sede', 'Ciudad', 'Punto', 'Autorización aceptada'];
    const lines = rows.map((r) => [r.created, r.name || '', r.phone, r.location, r.city, r.point, r.consent_text].map(csvCell).join(';'));
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="nfcloud-contactos.csv"');
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  });

  // Derecho de supresión: eliminar un contacto.
  app.delete<{ Params: { id: string } }>('/api/leads/:id', async (req, reply) => {
    const companyId = resolveCompanyId(req);
    const r = await pool.query(
      `DELETE FROM leads ld USING locations l
        WHERE ld.id = $1 AND l.id = ld.location_id ${companyId !== undefined ? 'AND l.company_id = $2' : ''}`,
      companyId !== undefined ? [req.params.id, companyId] : [req.params.id]
    );
    if (!r.rowCount) return reply.code(404).send({ error: 'Contacto no encontrado.' });
    return { ok: true };
  });

  // ---------- Cupones ----------
  async function couponInScope(req: any, id: string) {
    const companyId = resolveCompanyId(req);
    const r = await query<{ id: string; company_id: string }>(`SELECT id, company_id FROM coupons WHERE id = $1`, [id]);
    if (!r[0] || (companyId !== undefined && r[0].company_id !== companyId)) return null;
    return r[0];
  }

  function couponInput(b: any, partial: boolean): { error: string } | { fields: Record<string, unknown> } {
    const fields: Record<string, unknown> = {};
    if (b?.name !== undefined || !partial) {
      const name = String(b?.name || '').trim().slice(0, 80);
      if (!name) return { error: 'Escribe qué recibe el cliente, por ejemplo "10 % en tu próxima compra".' };
      fields.name = name;
    }
    if (b?.pin !== undefined || !partial) {
      const pin = String(b?.pin || '').trim();
      if (!/^\d{4,8}$/.test(pin)) return { error: 'La clave de caja debe tener entre 4 y 8 números.' };
      fields.pin = pin;
    }
    if (b?.terms !== undefined) fields.terms = String(b.terms || '').trim().slice(0, 300) || null;
    if (b?.validUntil !== undefined) {
      const v = String(b.validUntil || '').trim();
      if (v && !DATE_RE.test(v)) return { error: 'La fecha de vencimiento no es válida.' };
      fields.valid_until = v || null;
    }
    if (typeof b?.active === 'boolean') fields.active = b.active;
    return { fields };
  }

  app.get('/api/coupons', async (req) => {
    const companyId = resolveCompanyId(req);
    const rows = await query<any>(
      `SELECT c.id, c.name, c.terms, c.pin, c.active, to_char(c.valid_until, 'YYYY-MM-DD') AS valid_until,
              (c.valid_until IS NOT NULL AND c.valid_until < (now() AT TIME ZONE '${APP_TZ}')::date) AS expired,
              (SELECT COUNT(*) FROM coupon_claims cl WHERE cl.coupon_id = c.id) AS issued,
              (SELECT COUNT(*) FROM coupon_claims cl WHERE cl.coupon_id = c.id AND cl.redeemed_at IS NOT NULL) AS redeemed,
              (SELECT COUNT(*) FROM devices d WHERE d.coupon_id = c.id) AS points
         FROM coupons c
         ${companyId !== undefined ? 'WHERE c.company_id = $1' : ''}
        ORDER BY c.created_at DESC`,
      companyId !== undefined ? [companyId] : []
    );
    const ids = rows.map((r) => r.id);
    const byLoc = ids.length
      ? await query<{ coupon_id: string; location: string; issued: string; redeemed: string }>(
          `SELECT cl.coupon_id, l.name AS location, COUNT(*) AS issued,
                  COUNT(*) FILTER (WHERE cl.redeemed_at IS NOT NULL) AS redeemed
             FROM coupon_claims cl JOIN locations l ON l.id = cl.location_id
            WHERE cl.coupon_id = ANY($1::uuid[])
            GROUP BY cl.coupon_id, l.name
            ORDER BY redeemed DESC, issued DESC`,
          [ids]
        )
      : [];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      terms: r.terms,
      pin: r.pin,
      active: r.active,
      expired: r.expired,
      validUntil: r.valid_until,
      issued: parseInt(r.issued, 10),
      redeemed: parseInt(r.redeemed, 10),
      points: parseInt(r.points, 10),
      locations: byLoc
        .filter((x) => x.coupon_id === r.id)
        .slice(0, 5)
        .map((x) => ({ location: niceName(x.location), issued: parseInt(x.issued, 10), redeemed: parseInt(x.redeemed, 10) })),
    }));
  });

  app.post('/api/coupons', async (req, reply) => {
    const companyId = writeCompany(req);
    if (!companyId || companyId === NO_COMPANY) return reply.code(400).send({ error: 'Elige una empresa antes de crear el cupón.' });
    const i = couponInput(req.body, false);
    if ('error' in i) return reply.code(400).send({ error: i.error });
    const f = i.fields;
    const r = await pool.query(
      `INSERT INTO coupons (company_id, name, terms, pin, valid_until) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, f.name, f.terms ?? null, f.pin, f.valid_until ?? null]
    );
    return reply.code(201).send({ ok: true, id: r.rows[0].id });
  });

  app.patch<{ Params: { id: string } }>('/api/coupons/:id', async (req, reply) => {
    if (!(await couponInScope(req, req.params.id))) return reply.code(404).send({ error: 'Cupón no encontrado.' });
    const i = couponInput(req.body, true);
    if ('error' in i) return reply.code(400).send({ error: i.error });
    const keys = Object.keys(i.fields);
    if (!keys.length) return reply.code(400).send({ error: 'Nada que actualizar.' });
    await pool.query(
      `UPDATE coupons SET ${keys.map((k, n) => `${k} = $${n + 1}`).join(', ')} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => i.fields[k]), req.params.id]
    );
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/coupons/:id', async (req, reply) => {
    if (!(await couponInScope(req, req.params.id))) return reply.code(404).send({ error: 'Cupón no encontrado.' });
    // Los puntos que lo usaban vuelven a su redirección normal (ON DELETE SET NULL).
    const devs = await pool.query<{ device_id: string; code: string | null }>(
      `SELECT id AS device_id, code FROM devices WHERE coupon_id = $1`,
      [req.params.id]
    );
    await pool.query(`DELETE FROM coupons WHERE id = $1`, [req.params.id]);
    const { dropDeviceCache } = await import('../db/redis');
    await dropDeviceCache(devs.rows);
    return { ok: true };
  });
}
