/**
 * Alta masiva de una cadena (solo superadmin): vista previa, carga, CSV de
 * chips y habladores imprimibles. La lógica vive en src/lib/chain-import.ts.
 */
import { FastifyInstance } from 'fastify';
import { pool, query } from '../db/pool';
import { config } from '../config';
import { getSession, requireApiSession } from '../lib/auth';
import { applyImport, cleanTemplate, DEFAULT_TEMPLATE, planImport, SHEET_COLUMNS } from '../lib/chain-import';
import { habladoresHtml } from '../lib/hablador-print';

const MAX_CSV = 400_000; // caracteres
const MAX_LOGO = 600_000; // caracteres del data URL (~450 KB de imagen)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseUrl = () => config.publicBaseUrl.replace(/\/$/, '');

export async function adminImportRoutes(app: FastifyInstance) {
  requireApiSession(app);
  // Todo este grupo es del superadmin.
  app.addHook('preHandler', async (req, reply) => {
    if (getSession(req)?.role !== 'superadmin') {
      return reply.code(403).send({ error: 'Solo el superadmin puede cargar sedes.' });
    }
  });

  function input(req: any): { companyId: string; csv: string; template: ReturnType<typeof cleanTemplate> } | string {
    const b = req.body || {};
    const companyId = String(b.companyId || '');
    if (!UUID.test(companyId)) return 'Elige la empresa.';
    const csv = typeof b.csv === 'string' ? b.csv : '';
    if (!csv.trim()) return 'Sube la hoja de sedes (CSV).';
    if (csv.length > MAX_CSV) return 'La hoja es demasiado grande.';
    return { companyId, csv, template: cleanTemplate(b.template) };
  }

  // Plantilla guardada, lotes y estado de la empresa (para abrir la pantalla).
  app.get<{ Params: { companyId: string } }>('/api/admin/import/:companyId/setup', async (req, reply) => {
    const c = await query<{ name: string; import_template: unknown; has_logo: boolean; is_demo: boolean }>(
      `SELECT name, import_template, print_logo IS NOT NULL AS has_logo, is_demo FROM companies WHERE id = $1`,
      [req.params.companyId]
    );
    if (!c[0]) return reply.code(404).send({ error: 'Empresa no encontrada.' });
    const batches = await query<{ batch: string | null; n: string }>(
      `SELECT batch, COUNT(*) AS n FROM locations WHERE company_id = $1 GROUP BY batch ORDER BY batch NULLS LAST`,
      [req.params.companyId]
    );
    const saved = cleanTemplate(c[0].import_template);
    return {
      companyName: c[0].name,
      isDemo: c[0].is_demo,
      hasLogo: c[0].has_logo,
      template: saved.length ? saved : DEFAULT_TEMPLATE,
      columns: SHEET_COLUMNS,
      locations: batches.reduce((a, b) => a + parseInt(b.n, 10), 0),
      batches: batches.filter((b) => b.batch).map((b) => ({ batch: b.batch, locations: parseInt(b.n, 10) })),
    };
  });

  // Vista previa: valida y dice qué pasaría. No guarda nada.
  app.post('/api/admin/import/preview', async (req, reply) => {
    const i = input(req);
    if (typeof i === 'string') return reply.code(400).send({ error: i });
    return planImport(i.companyId, i.csv, i.template);
  });

  // Carga: todo en una transacción.
  app.post('/api/admin/import/commit', async (req, reply) => {
    const i = input(req);
    if (typeof i === 'string') return reply.code(400).send({ error: i });
    const result = await applyImport(i.companyId, i.csv, i.template);
    return { ok: true, ...result };
  });

  // Enlaces para grabar los chips (?s=n) y de los QR (?s=q), por lote y sede.
  app.get<{ Params: { companyId: string } }>('/api/admin/import/:companyId/chips.csv', async (req, reply) => {
    const rows = await query<{ batch: string | null; name: string; city: string; address: string | null; label: string; code: string | null; id: string; target_url: string }>(
      `SELECT l.batch, l.name, l.city, l.address, d.label, d.code, d.id, d.target_url
         FROM devices d JOIN locations l ON l.id = d.location_id
        WHERE l.company_id = $1
        ORDER BY l.batch NULLS LAST, l.name, d.role NULLS LAST, d.label`,
      [req.params.companyId]
    );
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => {
      const link = `${baseUrl()}/r/${r.code || r.id}`;
      return [r.batch || '', r.name, r.city, r.address || '', r.label, `${link}?s=n`, `${link}?s=q`, r.target_url].map(cell).join(';');
    });
    const header = ['Lote', 'Sede', 'Ciudad', 'Dirección', 'Punto', 'Enlace para el chip NFC', 'Enlace del QR', 'Destino actual'];
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="nfcloud-chips.csv"');
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  });

  // Habladores imprimibles: una hoja por sede con sus QR reales.
  app.get<{ Params: { companyId: string }; Querystring: { lote?: string; marca?: string } }>(
    '/api/admin/import/:companyId/habladores',
    async (req, reply) => {
      const c = await query<{ name: string; print_logo: string | null }>(
        `SELECT name, print_logo FROM companies WHERE id = $1`,
        [req.params.companyId]
      );
      if (!c[0]) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      const lote = (req.query.lote || '').trim() || null;
      const rows = await query<{ id: string; name: string; city: string; batch: string | null; role: string | null; code: string | null; device_id: string | null }>(
        `SELECT l.id, l.name, l.city, l.batch, d.role, d.code, d.id AS device_id
           FROM locations l
           LEFT JOIN devices d ON d.location_id = l.id AND d.role IS NOT NULL AND d.status = 'active'
          WHERE l.company_id = $1 AND l.status = 'active' ${lote ? 'AND l.batch = $2' : ''}
          ORDER BY l.batch NULLS LAST, l.name`,
        lote ? [req.params.companyId, lote] : [req.params.companyId]
      );
      const byLoc = new Map<string, { name: string; city: string; batch: string | null; qr: Record<string, string> }>();
      for (const r of rows) {
        const s = byLoc.get(r.id) || { name: r.name, city: r.city, batch: r.batch, qr: {} };
        if (r.role && r.device_id) s.qr[r.role] = `${baseUrl()}/r/${r.code || r.device_id}?s=q`;
        byLoc.set(r.id, s);
      }
      reply.type('text/html; charset=utf-8').send(
        habladoresHtml({
          companyName: c[0].name,
          logo: c[0].print_logo,
          batch: lote,
          mark: req.query.marca !== '0',
          sheets: [...byLoc.values()],
        })
      );
    }
  );

  // Logo para los habladores (data URL de imagen; null lo quita).
  app.put<{ Params: { companyId: string }; Body: { dataUrl?: string | null } }>(
    '/api/admin/import/:companyId/logo',
    async (req, reply) => {
      const raw = req.body?.dataUrl ?? null;
      if (raw !== null) {
        if (typeof raw !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
          return reply.code(400).send({ error: 'El logo debe ser una imagen PNG, JPG o WebP.' });
        }
        if (raw.length > MAX_LOGO) return reply.code(400).send({ error: 'El logo pesa demasiado (máximo 450 KB).' });
      }
      const r = await pool.query(`UPDATE companies SET print_logo = $1 WHERE id = $2`, [raw, req.params.companyId]);
      if (!r.rowCount) return reply.code(404).send({ error: 'Empresa no encontrada.' });
      return { ok: true };
    }
  );

  // Marcar una empresa como demostración: la separa de la empresa real del
  // cliente (nombre y marca con "(demo)") y es la única sobre la que actúan
  // los scripts de demo. Los puntos y sus códigos no cambian.
  app.post<{ Params: { companyId: string }; Body: { demo?: boolean } }>(
    '/api/admin/import/:companyId/demo',
    async (req, reply) => {
      const demo = req.body?.demo !== false;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const c = await client.query<{ name: string }>(`SELECT name FROM companies WHERE id = $1 FOR UPDATE`, [req.params.companyId]);
        if (!c.rowCount) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Empresa no encontrada.' });
        }
        const base = c.rows[0].name.replace(/\s*\(demo\)\s*$/i, '');
        const name = demo ? `${base} (demo)` : base;
        await client.query(`UPDATE companies SET is_demo = $1, name = $2 WHERE id = $3`, [demo, name, req.params.companyId]);
        // La marca de sus sedes acompaña al nombre (alcance de los cambios masivos).
        await client.query(`UPDATE locations SET brand = $1 WHERE company_id = $2 AND brand = $3`, [name, req.params.companyId, c.rows[0].name]);
        await client.query('COMMIT');
        return { ok: true, name, isDemo: demo };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
