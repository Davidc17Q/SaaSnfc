/**
 * HTML del correo del informe mensual.
 *
 * El correo es más expresivo que el panel: compite en la bandeja de entrada y
 * debe provocar que lo abran. Encabezado con imagen (ondas en azul de marca),
 * número protagonista y resumen escrito; el detalle queda en el informe web.
 *
 * Reglas de compatibilidad (Gmail, Outlook, Apple Mail, móvil):
 * - Maquetación con tablas y estilos en línea; nada de CSS externo.
 * - Sin blur, sin glassmorphism ni degradados CSS (Outlook no los pinta):
 *   el efecto visual vive en la imagen /email/encabezado-informe.jpg.
 * - Colores sólidos de respaldo (bgcolor) para cuando las imágenes no cargan.
 */
import type { ReportData } from './report';
import { DEFAULT_UNITS, cap } from './segments';
import { reportSummary } from './report';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const NAVY = '#0b1f4d';
const INK = '#1c1917';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const ACCENT = '#2563eb';

export interface ReportMailOptions {
  reportUrl: string;
  assetBaseUrl: string; // ej. https://app.nfcloud.co (sin barra final)
}

/** Tarjeta "Mejor día" para quien no tiene personal que reforzar (profesional). */
function bestDayStat(trend: { day: string; scans: number }[], fmt: (n: number) => string) {
  const best = trend.reduce<{ day: string; scans: number } | null>((a, t) => (t.scans > (a?.scans || 0) ? t : a), null);
  if (!best) return { label: 'Mejor día', value: '—', sub: 'Aún sin interacciones' };
  const [y, m, dd] = best.day.split('-').map(Number);
  const label = new Date(y, m - 1, dd).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  return { label: 'Mejor día', value: esc(label), sub: `${fmt(best.scans)} interacciones` };
}

export function reportMailHtml(d: ReportData, o: ReportMailOptions): string {
  const { variation, tone, topChannel, topChannelShare, insight, highlights, fmt, pct } = reportSummary(d);
  const k = d.kpis;
  // Cómo llama la empresa a sus sedes (tiendas, tarjetas, puntos de atención...).
  const U = d.units || DEFAULT_UNITS[d.segment || 'chain'];
  const todas = U.fem ? 'todas' : 'todos';
  const alcance = d.locationName ? esc(d.locationName) : `${cap(todas)} ${U.fem ? 'las' : 'los'} ${esc(U.many)}`;
  const prev = k.prevPeriodLabel ? k.prevPeriodLabel.split(' ')[0].toLowerCase() : 'el mes anterior';

  const deltaColors = { up: ['#dcfce7', '#166534'], down: ['#fee2e2', '#991b1b'], flat: ['#e0e7ff', '#3730a3'] }[tone];
  const delta =
    variation === null
      ? ''
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 0"><tr>
          <td style="background:${deltaColors[0]};color:${deltaColors[1]};border-radius:999px;padding:6px 14px;font:700 14px ${FONT}">
            ${variation > 0 ? '▲ +' : variation < 0 ? '▼ ' : ''}${pct(variation)} % vs. ${esc(prev)}
          </td></tr></table>`;

  // Tres datos clave en tarjetas.
  const camp = (d.campaigns || [])[0];
  const stats = [
    {
      label: `${esc(cap(U.one))} líder`,
      value: k.topLocation ? esc(k.topLocation.name) : 'Sin datos',
      sub: k.topLocation ? `${fmt(k.topLocation.scans)} interacciones` : '',
    },
    {
      label: 'Destino principal',
      value: topChannel ? esc(topChannel.channel) : 'Sin datos',
      sub: topChannel ? `${pct(topChannelShare)} % de las visitas` : '',
    },
    camp
      ? { label: 'Campaña del mes', value: esc(camp.name), sub: 'Marcada en tu tendencia' }
      : d.segment === 'professional'
        ? bestDayStat(d.trend, fmt)
        : {
            label: 'Hora de más movimiento',
            value: k.peakHour !== null ? `${String(k.peakHour).padStart(2, '0')}:00` : '—',
            sub: d.segment === 'institution' ? 'Refuerza la atención en esta franja' : 'Refuerza personal en esta franja',
          },
  ];
  const statCells = stats
    .map(
      (s) => `<td class="stack" width="33%" valign="top" style="padding:6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;border-radius:12px">
          <tr><td style="padding:16px 16px 14px">
            <div style="font:600 12px ${FONT};color:${MUTED};margin-bottom:6px">${s.label}</div>
            <div style="font:700 16px/1.3 ${FONT};color:${INK};word-break:break-word">${s.value}</div>
            ${s.sub ? `<div style="font:400 12px ${FONT};color:${MUTED};margin-top:4px">${s.sub}</div>` : ''}
          </td></tr>
        </table>
      </td>`
    )
    .join('');

  // Podio: las 3 sedes con más interacciones, con barra proporcional.
  const top = d.topLocations.slice(0, 3);
  const max = top[0]?.scans || 1;
  const podium = top.length
    ? `<tr><td style="padding:28px 32px 0">
        <div style="font:700 15px ${FONT};color:${INK};margin-bottom:14px">Tus ${esc(U.many)} más ${U.fem ? 'visitadas' : 'visitados'}</div>
        ${top
          .map((l, i) => {
            const w = Math.max(4, Math.round((l.scans / max) * 100));
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px">
              <tr>
                <td width="28" valign="top" style="font:800 15px ${FONT};color:${ACCENT}">${i + 1}</td>
                <td style="font:600 14px ${FONT};color:${INK}">${esc(l.name)}<span style="font-weight:400;color:${MUTED}"> · ${esc(l.city)}</span></td>
                <td align="right" valign="top" style="font:700 14px ${FONT};color:${INK};white-space:nowrap;padding-left:12px">${fmt(l.scans)}</td>
              </tr>
              <tr><td></td><td colspan="2" style="padding-top:6px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="${w}%" height="6" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>
                  ${w < 100 ? `<td height="6" bgcolor="#e8edf7" style="background:#e8edf7;border-radius:3px;font-size:0;line-height:0">&nbsp;</td>` : ''}
                </tr></table>
              </td></tr>
            </table>`;
          })
          .join('')}
      </td></tr>`
    : '';

  const preheader = esc(insight[0] || `Tu informe de ${d.periodLabel} ya está listo.`);
  const img = `${o.assetBaseUrl}/email/encabezado-informe.jpg`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Informe ${esc(d.periodLabel)} · ${esc(d.companyName)}</title>
<style>
  @media (max-width: 620px) {
    .wrap { width: 100% !important; }
    .stack { display: block !important; width: 100% !important; box-sizing: border-box; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .hero-num { font-size: 48px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eef1f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f6" style="background:#eef1f6">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">

    <!-- Encabezado: imagen de marca + banda oscura con el número protagonista -->
    <tr><td bgcolor="${NAVY}" style="background:${NAVY};line-height:0">
      <img src="${img}" width="600" alt="NFCloud" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:#ffffff;font:700 22px ${FONT};line-height:1.4" />
    </td></tr>
    <tr><td class="pad" bgcolor="${NAVY}" align="center" style="background:${NAVY};padding:4px 32px 36px">
      <div style="font:700 12px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#93c5fd">Tu informe de ${esc(d.periodLabel)}</div>
      <div style="font:500 14px ${FONT};color:#c7d2fe;margin-top:6px">${esc(d.companyName)} · ${alcance}</div>
      <div class="hero-num" style="font:800 60px/1.05 ${FONT};color:#ffffff;margin-top:18px;letter-spacing:-.02em">${fmt(k.totalScans)}</div>
      <div style="font:500 15px ${FONT};color:#dbeafe;margin-top:6px">interacciones con tus puntos NFC</div>
      ${delta}
    </td></tr>

    <!-- Lo más destacado: una idea por línea, de lo más a lo menos importante -->
    <tr><td class="pad" style="padding:30px 32px 6px">
      <div style="font:700 15px ${FONT};color:${INK};margin-bottom:12px">Lo más destacado</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${highlights
          .map((h) => {
            const dot = { alert: '#dc2626', good: '#16a34a', neutral: ACCENT, muted: '#cbd5e1' }[h.tone];
            const color = h.tone === 'muted' ? MUTED : INK;
            return `<tr>
              <td width="22" valign="top" style="padding:7px 0 0">
                <div style="width:8px;height:8px;border-radius:4px;background:${dot};font-size:0;line-height:0">&nbsp;</div>
              </td>
              <td style="padding:0 0 10px;font:${h.tone === 'muted' ? 400 : 500} 15px/1.5 ${FONT};color:${color}">${esc(h.text)}</td>
            </tr>`;
          })
          .join('')}
      </table>
    </td></tr>

    <!-- Tres datos clave -->
    <tr><td class="pad" style="padding:18px 26px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${statCells}</tr></table>
    </td></tr>

    ${podium}

    <!-- Llamado a la acción -->
    <tr><td class="pad" align="center" style="padding:30px 32px 34px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:12px">
          <a href="${esc(o.reportUrl)}" style="display:inline-block;padding:15px 30px;font:700 15px ${FONT};color:#ffffff;text-decoration:none">Ver informe completo</a>
        </td>
      </tr></table>
      <div style="font:400 12px ${FONT};color:${MUTED};margin-top:12px">Gráficos, ${todas} tus ${esc(U.many)} y descarga en PDF.</div>
    </td></tr>

    <!-- Pie -->
    <tr><td class="pad" style="padding:20px 32px 26px;border-top:1px solid ${LINE}">
      <div style="font:700 13px ${FONT};color:${INK}">NFCloud</div>
      <div style="font:400 12px/1.5 ${FONT};color:${MUTED};margin-top:2px">Recibes este informe porque tu empresa lo programó en NFCloud. Generado el ${esc(d.generatedAt.replace(/\.\s*$/, ''))}.</div>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
