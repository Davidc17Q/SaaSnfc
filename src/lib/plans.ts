/**
 * Planes por empresa: prueba gratis -> Pro (pago) o Básico (gratis).
 *
 * - trial: todo incluido hasta trial_ends_at.
 * - pro:   todo incluido (cliente que paga).
 * - basic: al vencer la prueba sin pagar. Las tarjetas SIGUEN redirigiendo a su
 *          último destino y las interacciones se siguen registrando; solo se
 *          bloquea el panel (métricas, cambios de destino, informes).
 *
 * Nunca hay que regrabar tarjetas: reactivar es cambiar el plan.
 */
import { pool, query } from '../db/pool';
import { config } from '../config';
import { isMailEnabled, sendHtmlMail } from './mailer';

export type Plan = 'trial' | 'pro' | 'basic';

// Caché corta del plan por empresa: el guard lo consulta en cada petición.
const cache = new Map<string, { plan: Plan; at: number }>();
const TTL_MS = 30_000;

export async function companyPlan(companyId: string): Promise<Plan> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;
  let plan: Plan = 'pro';
  try {
    const r = await query<{ plan: string; trial_ends_at: Date | null }>(
      `SELECT plan, trial_ends_at FROM companies WHERE id = $1`,
      [companyId]
    );
    const row = r[0];
    if (row) {
      plan = (row.plan as Plan) || 'pro';
      // Prueba vencida aunque el worker aún no haya pasado: se trata como básico.
      if (plan === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) <= new Date()) plan = 'basic';
    }
  } catch {
    // Esquema sin columnas de plan (migración pendiente): no bloquear a nadie.
    plan = 'pro';
  }
  cache.set(companyId, { plan, at: Date.now() });
  return plan;
}

export function invalidatePlan(companyId: string) {
  cache.delete(companyId);
}

/** Rutas de la API que un usuario en plan Básico sí puede usar. */
export const BASIC_ALLOWED = new Set(['/api/me', '/api/logout', '/api/plan-status', '/api/change-password']);

export function whatsappLink(text: string): string {
  return `https://wa.me/${config.contactWhatsapp}?text=${encodeURIComponent(text)}`;
}

/** Interacciones de la empresa desde una fecha (o en todo el historial). */
async function scansSince(companyId: string, since: Date | null): Promise<number> {
  const r = await query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM scan_events se
      WHERE se.location_id IN (SELECT id FROM locations WHERE company_id = $1)
        ${since ? 'AND se.scanned_at >= $2' : ''}`,
    since ? [companyId, since] : [companyId]
  );
  return parseInt(r[0]?.c || '0', 10);
}

export async function planStatus(companyId: string) {
  const r = await query<{ name: string; plan: string; trial_ends_at: Date | null; basic_since: Date | null; created_at: Date }>(
    `SELECT name, plan, trial_ends_at, basic_since, created_at FROM companies WHERE id = $1`,
    [companyId]
  );
  const c = r[0];
  if (!c) return null;
  const plan = await companyPlan(companyId);
  const daysLeft =
    plan === 'trial' && c.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(c.trial_ends_at).getTime() - Date.now()) / 86_400_000))
      : null;
  const since = plan === 'basic' ? c.basic_since || c.trial_ends_at : null;
  return {
    companyName: c.name,
    plan,
    trialEndsAt: c.trial_ends_at,
    daysLeft,
    basicSince: since,
    scansSinceBasic: plan === 'basic' ? await scansSince(companyId, since ? new Date(since) : null) : null,
    whatsapp: whatsappLink(`Hola, quiero reactivar NFCloud para ${c.name}.`),
  };
}

// ---------------------------------------------------------------------------
// Worker: vence pruebas y avisa antes de que terminen.
// ---------------------------------------------------------------------------
function noticeHtml(company: string, days: number, scans: number, link: string): string {
  const FONT = "'Segoe UI',Roboto,Arial,sans-serif";
  return `<div style="background:#eef1f6;padding:24px 12px;font-family:${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#0b1f4d;padding:24px 28px;color:#fff">
      <div style="font:800 18px ${FONT}">NFCloud</div>
      <div style="font:700 22px/1.3 ${FONT};margin-top:14px">${days === 1 ? 'Mañana termina' : `En ${days} días termina`} tu prueba gratis</div>
    </td></tr>
    <tr><td style="padding:24px 28px;font:400 15px/1.6 ${FONT};color:#1c1917">
      <p style="margin:0 0 12px">Hola, equipo de <b>${company}</b>.</p>
      <p style="margin:0 0 12px">Durante la prueba, tus puntos NFC registraron <b>${new Intl.NumberFormat('es-CO').format(scans)} interacciones</b>.</p>
      <p style="margin:0 0 12px">Si no continúas, <b>tus tarjetas seguirán funcionando</b> y llevando a tus clientes a su destino, pero dejarás de ver las métricas, cambiar destinos y recibir informes.</p>
      <p style="margin:20px 0 0"><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700">Quiero continuar con NFCloud</a></p>
    </td></tr>
  </table>
</div>`;
}

export async function runPlanChecks(): Promise<void> {
  // 1) Pruebas vencidas -> Básico.
  const expired = await pool.query<{ id: string; name: string }>(
    `UPDATE companies SET plan = 'basic', basic_since = now()
      WHERE plan = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
      RETURNING id, name`
  );
  for (const c of expired.rows) {
    invalidatePlan(c.id);
    console.log(`[planes] prueba vencida: ${c.name} pasa a Básico`);
  }

  // 2) Avisos 7 días y 1 día antes (a los correos de sus informes programados).
  if (!isMailEnabled()) return;
  const due = await query<{ id: string; name: string; created_at: Date; trial_ends_at: Date; n7: boolean; n1: boolean }>(
    `SELECT id, name, created_at, trial_ends_at, trial_notice_7 AS n7, trial_notice_1 AS n1
       FROM companies
      WHERE plan = 'trial' AND trial_ends_at > now()
        AND ((NOT trial_notice_7 AND trial_ends_at <= now() + INTERVAL '7 days')
          OR (NOT trial_notice_1 AND trial_ends_at <= now() + INTERVAL '1 day'))`
  );
  for (const c of due) {
    const oneDay = new Date(c.trial_ends_at).getTime() - Date.now() <= 86_400_000;
    const days = oneDay ? 1 : 7;
    const emails = await query<{ email: string }>(
      `SELECT DISTINCT email FROM report_schedules WHERE company_id = $1 AND active = true`,
      [c.id]
    );
    const scans = await scansSince(c.id, new Date(c.created_at));
    const link = whatsappLink(`Hola, quiero continuar con NFCloud para ${c.name}.`);
    for (const e of emails) {
      try {
        await sendHtmlMail(e.email, `Tu prueba de NFCloud termina ${oneDay ? 'mañana' : 'en 7 días'}`, noticeHtml(c.name, days, scans, link));
      } catch (err: any) {
        console.error(`[planes] aviso a ${e.email} falló:`, err.message);
      }
    }
    await pool.query(
      `UPDATE companies SET ${oneDay ? 'trial_notice_1 = true, trial_notice_7 = true' : 'trial_notice_7 = true'} WHERE id = $1`,
      [c.id]
    );
    if (!emails.length) console.log(`[planes] ${c.name}: prueba por vencer y sin correos de informes para avisar`);
  }
}

export function startPlanScheduler(): void {
  const tick = () => runPlanChecks().catch((e) => console.error('[planes]', e.message));
  setTimeout(tick, 30_000);
  setInterval(tick, 60 * 60 * 1000);
}
