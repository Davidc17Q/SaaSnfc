/**
 * Worker de informes programados (Función 2, Fase B).
 *
 * Al arrancar el servidor se llama a startReportScheduler(). Cada hora revisa
 * report_schedules con active=true y next_run_at <= now(), genera el informe
 * del mes anterior para cada uno, lo envía por correo (enlace a la versión
 * imprimible) y reprograma next_run_at según la frecuencia.
 *
 * La programación vive en la BD, así que sobrevive a reinicios del proceso
 * (Railway). Si no hay SMTP configurado, el worker no corre (y no falla).
 */
import { pool } from '../db/pool';
import { isMailEnabled, sendReportMail } from './mailer';
import { buildReportData, normalizeMonth } from './report-data';
import { reportLinkUrl } from './report-link';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // cada hora

/** 'YYYY-MM' del mes anterior al momento actual. */
function previousMonth(): string {
  return normalizeMonth(undefined);
}

/** 'YYYY-MM' del mes actual (hora del negocio, Bogotá). */
function currentMonth(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
}

/** Calcula el próximo next_run_at desde ahora según la frecuencia. */
function nextRunFrom(now: Date, frequency: string): Date {
  const d = new Date(now);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1); // monthly por defecto
  return d;
}

async function runDueSchedules(): Promise<void> {
  if (!isMailEnabled()) return;

  const due = await pool.query<{
    id: string;
    company_id: string;
    location_id: string | null;
    email: string;
    frequency: string;
  }>(
    // Las empresas en plan Básico no reciben informes (vuelven al reactivar).
    `SELECT id, company_id, location_id, email, frequency
       FROM report_schedules
      WHERE active = true AND next_run_at <= now()
        AND company_id NOT IN (SELECT id FROM companies WHERE plan = 'basic')
      ORDER BY next_run_at ASC
      LIMIT 50`
  );

  for (const s of due.rows) {
    const now = new Date();
    try {
      // Mensual: el mes que acaba de cerrar. Semanal: lo que va del mes en curso
      // (si no, cada semana llegaría el mismo informe del mes anterior).
      const month = s.frequency === 'weekly' ? currentMonth() : previousMonth();
      const data = await buildReportData({
        month,
        companyId: s.company_id,
        locationId: s.location_id || undefined,
      });

      // Enlace firmado: el destinatario abre el informe sin iniciar sesión.
      const reportUrl = reportLinkUrl({
        companyId: s.company_id,
        locationId: s.location_id || undefined,
        month,
      });

      await sendReportMail({ to: s.email, data, reportUrl });

      await pool.query(
        `UPDATE report_schedules
            SET last_run_at = now(), next_run_at = $2
          WHERE id = $1`,
        [s.id, nextRunFrom(now, s.frequency)]
      );
      console.log(`[scheduler] informe enviado a ${s.email} (schedule ${s.id})`);
    } catch (err: any) {
      // No bloquear el resto: reprograma igual para no reintentar en bucle.
      console.error(`[scheduler] error enviando schedule ${s.id}:`, err.message);
      await pool
        .query(`UPDATE report_schedules SET next_run_at = $2 WHERE id = $1`, [
          s.id,
          nextRunFrom(now, s.frequency),
        ])
        .catch(() => {});
    }
  }
}

export function startReportScheduler(): void {
  if (!isMailEnabled()) {
    console.log('[scheduler] SMTP no configurado: envío programado de informes desactivado.');
    return;
  }
  // Primera pasada al minuto de arrancar, luego cada hora.
  setTimeout(() => {
    runDueSchedules().catch((e) => console.error('[scheduler]', e.message));
    setInterval(() => {
      runDueSchedules().catch((e) => console.error('[scheduler]', e.message));
    }, CHECK_INTERVAL_MS);
  }, 60 * 1000);
}
