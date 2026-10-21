/**
 * Informe mensual NFCloud (Función 2, Fase A).
 *
 * Genera una página HTML autocontenida, con la marca NFCloud, lista para ver en
 * pantalla y para "Guardar como PDF" con el diálogo de impresión del navegador
 * (window.print() + @media print). No recalcula datos: recibe los agregados ya
 * consultados por la API y los dibuja con el Chart.js local (/chart.umd.min.js).
 *
 * El mismo HTML sirve para pantalla, impresión/PDF y (Fase B) para incrustarlo
 * en el correo o enlazarlo desde él.
 */

import type { StoryData } from './report-story';

export interface ReportData {
  companyName: string;
  periodLabel: string; // ej. "Octubre 2026"
  locationName?: string | null; // sede filtrada, o null = todas
  generatedAt: string; // fecha de generación legible
  kpis: {
    totalScans: number;
    prevTotal?: number; // total del mes anterior (mismo alcance)
    prevPeriodLabel?: string; // ej. "Septiembre 2026"
    inProgressDays?: number | null; // mes en curso: días transcurridos (comparación justa)
    topLocation: { name: string; city: string; scans: number } | null;
    peakHour: number | null;
  };
  trend: { day: string; scans: number }[]; // evolución diaria del mes
  topLocations: { name: string; city: string; scans: number }[];
  channels: { channel: string; scans: number }[];
  // Calificación por aspecto (Función 1). Solo se dibuja si hay respuestas.
  survey: {
    total: number;
    avg: number | null;
    aspects: { label: string; avg: number; count: number }[];
  } | null;
  // Campañas comerciales que se cruzan con el periodo (opcional).
  campaigns?: { name: string; startsOn: string; endsOn: string; upliftPct?: number | null }[];
  // Sedes activas sin ninguna interacción en el periodo (opcional).
  inactiveLocations?: number;
  // Datos del informe por capítulos (ver report-story.ts).
  story?: StoryData;
}

/** Una línea de "Lo más destacado". 'muted' = dato que ya se ve en otra parte. */
export interface Highlight {
  text: string;
  tone: 'alert' | 'good' | 'neutral' | 'muted';
}

/** Escapa texto para incrustarlo con seguridad en HTML. */
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** Logo NFCloud (versión oscura para fondo claro del informe) en base64. */
let _logoCache: string | null | undefined;
function logoDataUri(): string | null {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.join(__dirname, '..', '..', 'public', 'logo-texto-oscuro.png');
    _logoCache = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    _logoCache = null;
  }
  return _logoCache;
}

/** Cifras derivadas y resumen escrito, compartidos por el informe y el correo. */
export function reportSummary(d: ReportData) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO').format(n);
  const pct = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);
  const k = d.kpis;
  const variation =
    k.prevTotal && k.prevTotal > 0
      ? Math.round(((k.totalScans - k.prevTotal) / k.prevTotal) * 1000) / 10
      : null;
  const tone: 'up' | 'down' | 'flat' =
    variation === null || Math.abs(variation) < 5 ? 'flat' : variation > 0 ? 'up' : 'down';
  const channelTotal = d.channels.reduce((a, c) => a + c.scans, 0);
  const topChannel = d.channels[0] || null;
  const topChannelShare = topChannel && channelTotal ? (topChannel.scans / channelTotal) * 100 : 0;
  // "Lo más destacado": una idea por línea, ordenadas por importancia:
  // primero lo que pide actuar, luego lo que cambió, y al final los datos que
  // ya aparecen en otra parte (por si al lector se le pasaron).
  const prev = k.prevPeriodLabel ? k.prevPeriodLabel.split(' ')[0].toLowerCase() : 'el mes anterior';
  const highlights: Highlight[] = [];
  if (!k.totalScans) {
    highlights.push({
      text: 'No se registraron interacciones en este periodo. Revisa que los puntos NFC sigan instalados y visibles.',
      tone: 'alert',
    });
  } else {
    const inactive = d.inactiveLocations || 0;
    if (inactive > 0) {
      highlights.push({
        text: `${inactive} ${inactive === 1 ? 'sede no registró' : 'sedes no registraron'} interacciones en el mes: revisa que el punto NFC siga instalado.`,
        tone: 'alert',
      });
    }
    if (variation !== null) {
      highlights.push(
        Math.abs(variation) < 5
          ? { text: `Las interacciones se mantuvieron estables frente a ${prev}.`, tone: 'neutral' }
          : {
              text: `Las interacciones ${variation > 0 ? 'crecieron' : 'cayeron'} ${pct(Math.abs(variation))} % frente a ${prev}.`,
              tone: variation > 0 ? 'good' : 'alert',
            }
      );
    }
    for (const c of (d.campaigns || []).slice(0, 2)) {
      const u = c.upliftPct;
      if (u === null || u === undefined) {
        highlights.push({ text: `Campaña activa en el periodo: «${c.name}».`, tone: 'neutral' });
      } else if (Math.abs(u) < 5) {
        highlights.push({ text: `«${c.name}» no movió las interacciones frente a los días previos.`, tone: 'neutral' });
      } else {
        highlights.push({
          text: `«${c.name}» coincidió con ${u > 0 ? 'un aumento' : 'una caída'} de ${pct(Math.abs(u))} % en las interacciones diarias frente a los días previos.`,
          tone: u > 0 ? 'good' : 'alert',
        });
      }
    }
    if (k.peakHour !== null) {
      highlights.push({
        text: `Más movimiento a las ${String(k.peakHour).padStart(2, '0')}:00: buen momento para reforzar personal.`,
        tone: 'neutral',
      });
    }
    // Datos que ya se ven en el número grande y en las tarjetas.
    highlights.push({ text: `${fmt(k.totalScans)} interacciones en total.`, tone: 'muted' });
    if (k.topLocation) {
      highlights.push({
        text: `${k.topLocation.name} fue la sede con más interacciones (${fmt(k.topLocation.scans)}).`,
        tone: 'muted',
      });
    }
    if (topChannel) {
      highlights.push({
        text:
          topChannelShare >= 99.95
            ? `Todas las visitas fueron a ${topChannel.channel}.`
            : `${pct(topChannelShare)} % de las visitas fueron a ${topChannel.channel}.`,
        tone: 'muted',
      });
    }
  }
  // Texto corrido (preencabezado del correo).
  const insight = highlights.map((h) => h.text);

  return { variation, tone, topChannel, topChannelShare, insight, highlights, fmt, pct };
}

/** Logo blanco (ícono) para la portada oscura del informe. */
let _logoWhite: string | null | undefined;
function logoWhiteDataUri(): string | null {
  if (_logoWhite !== undefined) return _logoWhite;
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.join(__dirname, '..', '..', 'public', 'logo-icono-blanco.png');
    _logoWhite = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    _logoWhite = null;
  }
  return _logoWhite;
}

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Prefijo común a todos los nombres ("PUNTO DE VENTA "), para no repetirlo en tablas. */
function commonPrefix(names: string[]): string {
  if (names.length < 2) return '';
  let p = names[0];
  for (const n of names) while (p && !n.startsWith(p)) p = p.slice(0, -1);
  const cut = p.lastIndexOf(' ');
  return cut >= 3 ? p.slice(0, cut + 1) : '';
}

/** Mejor franja de 2 horas de la semana (día + hora de inicio). */
function bestWindow(heat: number[][]): { day: number; hour: number; share: number } | null {
  const total = heat.reduce((a, r) => a + r.reduce((b, c) => b + c, 0), 0);
  if (total < 200) return null; // con poco volumen la "mejor franja" es ruido
  let best = { day: 0, hour: 0, v: -1 };
  heat.forEach((row, d) => {
    for (let h = 0; h < 23; h++) {
      const v = row[h] + row[h + 1];
      if (v > best.v) best = { day: d, hour: h, v };
    }
  });
  return { day: best.day, hour: best.hour, share: best.v / total };
}

export interface Recommendation {
  level: 'crit' | 'warn' | 'info';
  title: string;
  why: string;
}

/** Recomendaciones concretas, de la más urgente a la menos (máximo 5). */
export function reportRecommendations(d: ReportData): Recommendation[] {
  const { variation, fmt, pct } = reportSummary(d);
  const st = d.story;
  const out: Recommendation[] = [];
  const prev = d.kpis.prevPeriodLabel ? d.kpis.prevPeriodLabel.split(' ')[0].toLowerCase() : 'el mes anterior';
  const unit = st?.units === 'points' ? 'punto NFC' : 'tienda';

  if (!d.kpis.totalScans) {
    out.push({
      level: 'crit',
      title: 'Revisa que tus puntos NFC estén instalados y visibles.',
      why: 'No se registró ninguna interacción en el periodo. Si los puntos ya están en tienda, puede que estén tapados o que el personal no invite a usarlos.',
    });
    return out;
  }
  if (st) {
    const silent = st.ranking.filter((r) => r.silent);
    if (silent.length === 1) {
      const r = silent[0];
      const earlier = r.series.slice(0, -3);
      const avg = earlier.length ? Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) : 0;
      out.push({
        level: 'crit',
        title: `Revisa el punto NFC de ${r.name}.`,
        why: `Lleva al menos 3 días sin interacciones; antes tenía unas ${fmt(avg)} al día. Puede estar retirado, tapado o dañado.`,
      });
    } else if (silent.length > 1) {
      const names = silent.slice(0, 3).map((r) => r.name).join(', ');
      out.push({
        level: 'crit',
        title: `Revisa los puntos NFC de ${silent.length} ${unit === 'tienda' ? 'tiendas' : 'puntos'}.`,
        why: `${names}${silent.length > 3 ? ' y otras' : ''} llevan al menos 3 días sin interacciones.`,
      });
    }
    const drops = st.ranking
      .filter((r) => !r.silent && r.prev >= 30 && (r.scans - r.prev) / r.prev <= -0.3)
      .sort((a, b) => (a.scans - a.prev) / a.prev - (b.scans - b.prev) / b.prev)
      .slice(0, 2);
    for (const r of drops) {
      const dp = Math.round(((r.prev - r.scans) / r.prev) * 100);
      out.push({
        level: 'warn',
        title: `Revisa por qué bajó ${r.name} (−${dp} %).`,
        why: `Pasó de ${fmt(r.prev)} a ${fmt(r.scans)} interacciones frente a ${prev}. Verifica que el punto esté visible y que el equipo invite a usarlo.`,
      });
    }
    if (st.worstAspect) {
      const w = st.worstAspect;
      out.push({
        level: 'warn',
        title: `Refuerza «${w.aspect}» en ${w.location}.`,
        why: `Es su aspecto peor calificado: ${pct(w.avg)} de 5, frente a ${pct(w.chainAvg)} en el promedio.`,
      });
    }
    const win = bestWindow(st.heat);
    if (win) {
      out.push({
        level: 'info',
        title: `Asegura personal los ${DAY_NAMES[win.day]} de ${String(win.hour).padStart(2, '0')}:00 a ${String(win.hour + 2).padStart(2, '0')}:00.`,
        why: `Es la franja con más interacciones de la semana: concentra 1 de cada ${Math.max(2, Math.round(1 / win.share))}.`,
      });
    }
    const measured = st.campaigns.filter((c) => c.upliftPct !== null && (c.upliftPct as number) >= 10);
    if (measured.length) {
      const best = measured.reduce((a, b) => ((b.upliftPct as number) > (a.upliftPct as number) ? b : a));
      out.push({
        level: 'info',
        title: `Repite una campaña como «${best.name}».`,
        why: `Coincidió con un aumento de ${pct(best.upliftPct as number)} % en las interacciones diarias frente a los días previos.`,
      });
    } else if (!st.campaigns.length) {
      out.push({
        level: 'info',
        title: 'Registra tu próxima promoción en NFCloud.',
        why: 'Así medimos cuánto mueve tus interacciones y la marcamos en la tendencia del informe.',
      });
    }
  }
  if (variation !== null && variation <= -15 && !out.some((r) => r.level !== 'info')) {
    out.unshift({
      level: 'warn',
      title: 'Reactiva el uso de los puntos NFC en tus tiendas.',
      why: `Las interacciones bajaron ${pct(Math.abs(variation))} % frente a ${prev}. Recuerda al equipo invitar a los clientes a acercar su celular.`,
    });
  }
  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 5);
}

export function reportHtml(d: ReportData): string {
  const { variation, tone, topChannel, topChannelShare, fmt, pct } = reportSummary(d);
  const k = d.kpis;
  const st = d.story;
  const recs = reportRecommendations(d);
  const logo = logoWhiteDataUri();
  const month = d.periodLabel.split(' ')[0];
  const prevMonth = k.prevPeriodLabel ? k.prevPeriodLabel.split(' ')[0].toLowerCase() : 'el mes anterior';
  const units = st?.units || 'stores';
  const unitPlural = units === 'stores' ? 'tiendas' : 'puntos NFC';
  const ranking = st?.ranking || [];
  const silent = ranking.filter((r) => r.silent);
  const activeCount = ranking.filter((r) => r.scans > 0 && !r.silent).length;
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

  // ---------- Titular dinámico ----------
  const bestCamp = (st?.campaigns || [])
    .filter((c) => c.upliftPct !== null && (c.upliftPct as number) >= 10)
    .sort((a, b) => (b.upliftPct as number) - (a.upliftPct as number))[0];
  const partial = !!k.inProgressDays;
  // Mes en curso: "En lo que va de octubre llevas…" y comparación con los mismos días.
  const lead = partial ? `En lo que va de ${month.toLowerCase()} llevas` : `${month} cerró con`;
  const cmpTo = partial ? `los mismos días de ${prevMonth}` : prevMonth;
  let headline: string;
  if (!k.totalScans) {
    headline = partial
      ? `En lo que va de ${month.toLowerCase()} no se registran interacciones.`
      : `En ${month.toLowerCase()} no se registraron interacciones.`;
  } else {
    const n = `<em class="${tone}">${fmt(k.totalScans)} interacciones</em>`;
    if (variation === null) headline = `${lead} ${n}.`;
    else if (tone === 'flat') headline = `${lead} ${n}, en línea con ${cmpTo}.`;
    else if (tone === 'up')
      headline = `${lead} ${n}, un ${pct(variation)} % más que ${cmpTo}${bestCamp ? `, impulsado por ${esc(bestCamp.name)}` : ''}.`;
    else headline = `${lead} ${n}, un ${pct(Math.abs(variation))} % menos que ${cmpTo}.`;
  }
  const subParts: string[] = [];
  if (silent.length) subParts.push(`${silent.length === 1 ? `Una ${units === 'stores' ? 'tienda necesita' : 'punto necesita'}` : `${silent.length} ${unitPlural} necesitan`} atención`);
  if (st?.worstAspect) subParts.push(`«${esc(st.worstAspect.aspect)}» es lo peor calificado por tus clientes`);
  const subline = subParts.length
    ? subParts.join(' y ') + '.'
    : k.totalScans && ranking.length
      ? units === 'stores'
        ? 'Todas tus tiendas estuvieron activas durante el mes.'
        : 'Todos tus puntos NFC estuvieron activos durante el mes.'
      : '';

  // ---------- KPIs dinámicos ----------
  const deltaHtml = (v: number | null, suffix = ' %') =>
    v === null
      ? ''
      : `<span class="delta ${Math.abs(v) < 5 && suffix === ' %' ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${v > 0 ? '▲ +' : v < 0 ? '▼ ' : ''}${pct(v)}${suffix}</span>`;
  const kpis: string[] = [];
  kpis.push(`<div class="kpi"><p class="lbl">Interacciones</p><p class="val">${fmt(k.totalScans)}</p>
    <p class="meta">${variation !== null ? `${deltaHtml(variation)} vs. ${partial ? 'mismos días de ' : ''}${esc(prevMonth)}` : 'Primer mes con datos'}</p></div>`);
  if (ranking.length) {
    kpis.push(`<div class="kpi"><p class="lbl">${units === 'stores' ? 'Tiendas' : 'Puntos NFC'} con actividad</p>
      <p class="val">${activeCount} <small>de ${ranking.length}</small></p>
      <p class="meta">${silent.length ? `${silent.length} sin actividad reciente` : 'Todas activas'}</p></div>`);
  }
  if (st?.reputation) {
    const r = st.reputation;
    kpis.push(`<div class="kpi"><p class="lbl">Reseñas de Google</p><p class="val">${r.reviewsGained >= 0 ? '+' : ''}${fmt(r.reviewsGained)}</p>
      <p class="meta">Nota media ${pct(r.ratingNow)} ${r.ratingDelta ? deltaHtml(r.ratingDelta, '') : ''}</p></div>`);
  } else if (topChannel) {
    kpis.push(`<div class="kpi"><p class="lbl">Destino principal</p><p class="val txt">${esc(topChannel.channel)}</p>
      <p class="meta">${pct(topChannelShare)} % de las interacciones</p></div>`);
  }
  if (d.survey && d.survey.total > 0) {
    kpis.push(`<div class="kpi"><p class="lbl">Calificación de clientes</p><p class="val">${pct(d.survey.avg || 0)} <small>/ 5</small></p>
      <p class="meta">${fmt(d.survey.total)} respuestas</p></div>`);
  } else if (k.peakHour !== null) {
    kpis.push(`<div class="kpi"><p class="lbl">Hora de más movimiento</p><p class="val">${String(k.peakHour).padStart(2, '0')}:00</p>
      <p class="meta">Franja con más interacciones</p></div>`);
  }

  // ---------- Capítulos (se numeran según los que tienen datos) ----------
  const hasPrev = !!(k.prevTotal && k.prevTotal > 0);
  const heatTotal = (st?.heat || []).reduce((a, r) => a + r.reduce((b, c) => b + c, 0), 0);
  const showHeat = heatTotal >= 200;
  const hasSurvey = !!(d.survey && d.survey.total > 0 && d.survey.aspects.length);
  const chapters: { id: string; title: string; html: string }[] = [];

  chapters.push({
    id: 'resumen',
    title: 'Tu mes en cifras',
    html: `<div class="kpis">${kpis.join('')}</div>
      ${k.totalScans ? `<div class="card">
        <div class="chart-head">
          <div><h3>Interacciones por día</h3><p class="desc">${hasPrev ? `${esc(month)} frente a ${esc(prevMonth)}.` : esc(month) + '.'}${(d.campaigns || []).length ? ' Las franjas son campañas.' : ''}</p></div>
          ${hasPrev ? `<label class="toggle no-print"><input id="cmpPrev" type="checkbox" checked /> Comparar con ${esc(prevMonth)}</label>` : ''}
        </div>
        <div class="chart-box"><canvas id="cTrend" aria-label="Interacciones por día"></canvas></div>
        <div class="legend"><span><i></i>${esc(month)}</span>${hasPrev ? `<span id="lgPrev"><i class="prev"></i>${esc(prevMonth.charAt(0).toUpperCase() + prevMonth.slice(1))}</span>` : ''}${(d.campaigns || []).length ? '<span><i class="band"></i>Campaña</span>' : ''}</div>
      </div>` : ''}`,
  });

  if (ranking.length) {
    const prefix = units === 'stores' ? commonPrefix(ranking.map((r) => r.name)) : '';
    const anyRating = ranking.some((r) => r.rating !== null);
    const rows = ranking.map((r) => ({
      name: r.name,
      short: prefix ? r.name.slice(prefix.length) : r.name,
      city: r.city,
      scans: r.scans,
      delta: r.prev > 0 ? Math.round(((r.scans - r.prev) / r.prev) * 1000) / 10 : null,
      series: r.series,
      rating: r.rating,
      silent: r.silent,
    }));
    const heatHtml = showHeat ? (() => {
      const cols = (st as any).heat[0].map((_: number, h: number) => (st as any).heat.some((row: number[]) => row[h] > 0));
      let first = cols.indexOf(true), last = cols.lastIndexOf(true);
      if (first < 0) { first = 9; last = 20; }
      const hours: number[] = [];
      for (let h = first; h <= last; h++) hours.push(h);
      const max = Math.max(1, ...(st as any).heat.flat());
      let g = `<div class="heat" style="grid-template-columns:40px repeat(${hours.length},minmax(0,1fr))"><div></div>${hours.map((h) => `<div class="h">${h}</div>`).join('')}`;
      (st as any).heat.forEach((row: number[], di: number) => {
        g += `<div class="d">${DAY_SHORT[di]}</div>`;
        hours.forEach((h) => {
          const v = row[h];
          g += `<div class="c" style="background:rgba(37,99,235,${(0.05 + (v / max) * 0.9).toFixed(2)})" title="${DAY_SHORT[di]} ${h}:00 · ${fmt(v)} interacciones"></div>`;
        });
      });
      g += '</div>';
      const win = bestWindow((st as any).heat);
      return `<div class="card">
        <h3>¿Cuándo interactúan tus clientes?</h3>
        <p class="desc">Interacciones por día de la semana y hora${units === 'stores' ? ', todas las tiendas' : ''}.</p>
        ${g}
        <div class="heat-scale">Menos <span class="bar"></span> Más</div>
        ${win ? `<div class="callout"><b>Tu franja más fuerte: ${DAY_NAMES[win.day]} de ${String(win.hour).padStart(2, '0')}:00 a ${String(win.hour + 2).padStart(2, '0')}:00.</b> Concentra 1 de cada ${Math.max(2, Math.round(1 / win.share))} interacciones de la semana.</div>` : ''}
      </div>`;
    })() : '';
    chapters.push({
      id: 'tiendas',
      title: units === 'stores' ? 'Tus tiendas' : 'Tus puntos NFC',
      lead: '',
      html: `<p class="ch-lead">${units === 'stores' ? `Tus ${ranking.length} tiendas comparadas.` : `Tus ${ranking.length} puntos NFC comparados.`} Haz clic en una columna para ordenar.</p>
        <div class="card">
          <h3>Ranking del mes</h3>
          <div class="rank-wrap">
            <table class="rank" id="rank">
              <thead><tr>
                <th class="pos">#</th>
                <th class="sortable" data-k="short">${units === 'stores' ? 'Tienda' : 'Punto NFC'}<span class="arrow"></span></th>
                <th class="sortable num" data-k="scans">Interacciones<span class="arrow">▼</span></th>
                ${hasPrev ? `<th class="sortable num" data-k="delta">vs. ${esc(prevMonth)}<span class="arrow"></span></th>` : ''}
                <th class="sparkcol">Por día</th>
                ${anyRating ? '<th class="sortable num" data-k="rating">Calificación<span class="arrow"></span></th>' : ''}
              </tr></thead>
              <tbody></tbody>
            </table>
          </div>
          ${rows.length > 10 ? '<button type="button" id="rankMore" class="more no-print"></button>' : ''}
        </div>
        ${heatHtml}
        <script type="application/json" id="rankData">${json({ rows, hasPrev, anyRating })}</script>`,
    } as any);
  }

  const camps = st?.campaigns || [];
  const fmtRange = (a: string, b: string) => {
    const f = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `${f.format(new Date(a + 'T00:00:00Z'))} – ${f.format(new Date(b + 'T00:00:00Z'))}`;
  };
  chapters.push({
    id: 'campanas',
    title: 'Tus campañas',
    html: camps.length
      ? `<p class="ch-lead">Interacciones diarias promedio antes, durante y después de cada campaña.</p>
         <div class="camps">${camps
           .map((c) => {
             const vals = [c.before, c.during, c.after].filter((v): v is number => v !== null);
             const m = Math.max(1, ...vals);
             const bar = (v: number | null, lbl: string, on = false) =>
               `<div><div class="bar ${on ? 'on' : ''}" style="height:${v ? Math.round((v / m) * 54) : 0}px"></div><span>${v !== null ? `${lbl} · ${fmt(v)}` : lbl}</span></div>`;
             const lift =
               c.upliftPct !== null
                 ? `<p class="lift ${c.upliftPct >= 5 ? 'up' : c.upliftPct <= -5 ? 'down' : ''}">${c.upliftPct > 0 ? '+' : ''}${pct(c.upliftPct)} %</p><p class="lift-sub">interacciones diarias vs. días previos</p>`
                 : c.inProgress
                   ? `<p class="lift na">En curso · día ${c.dayN} de ${c.days}</p><p class="lift-sub">Mediremos su efecto con más datos</p>`
                   : `<p class="lift na">Sin base para comparar</p><p class="lift-sub">Faltan días o interacciones previas</p>`;
             return `<div class="camp"><p class="name">${esc(c.name)}</p><p class="dates">${fmtRange(c.startsOn, c.endsOn)}${c.inProgress ? ` · en curso, día ${c.dayN} de ${c.days}` : ''}</p>${lift}
               <div class="bda">${bar(c.before, 'Antes')}${bar(c.during, 'Durante', true)}${bar(c.after, c.after !== null ? 'Después' : 'Después')}</div></div>`;
           })
           .join('')}</div>`
      : `<div class="card empty"><h3>No hubo campañas registradas este mes</h3>
         <p class="desc">Marca tus promociones en NFCloud (Resumen → Campañas): aparecerán en la tendencia y mediremos cuánto movieron tus interacciones.</p></div>`,
  });

  if (hasSurvey) {
    const s = d.survey!;
    const ratedStores = ranking.filter((r) => r.rating !== null).length;
    chapters.push({
      id: 'clientes',
      title: 'Lo que opinan tus clientes',
      html: `<p class="ch-lead">${fmt(s.total)} respuestas a la encuesta${ratedStores > 1 ? ` en ${ratedStores} tiendas` : ''}.</p>
        <div class="card"><h3>Calificación por aspecto</h3>
          <div class="aspects">${s.aspects
            .map(
              (a) => `<div class="asp-row"><span>${esc(a.label)}</span><div class="asp-track"><div class="asp-fill ${a.avg < 4 ? 'low' : ''}" style="width:${(a.avg / 5) * 100}%"></div></div><span class="asp-val">${pct(Math.round(a.avg * 10) / 10)}</span></div>`
            )
            .join('')}</div></div>
        ${(st?.comments || []).length ? `<div class="quotes">${st!.comments
          .map((c) => `<div class="quote">“${esc(c.text)}”<p class="who">${esc(c.location)} · ${pct(c.rating)}/5</p></div>`)
          .join('')}</div>` : ''}`,
    });
  }

  chapters.push({
    id: 'acciones',
    title: 'Qué hacer el próximo mes',
    html: `<p class="ch-lead">Recomendaciones generadas a partir de tus datos, de la más urgente a la menos.</p>
      <div class="todo">${recs
        .map(
          (r, i) => `<div class="todo-item ${r.level}"><div class="todo-n">${i + 1}</div><div><p class="t">${esc(r.title)}</p><p class="why">${esc(r.why)}</p></div></div>`
        )
        .join('')}</div>`,
  });

  const chaptersHtml = chapters
    .map(
      (c, i) => `<section class="chapter" id="${c.id}"><p class="ch-num">Capítulo ${i + 1}</p><h2 class="ch-title">${c.title}</h2>${c.html}</section>`
    )
    .join('');
  const nav = chapters
    .map((c, i) => `<a href="#${c.id}"${i === 0 ? ' class="active"' : ''}><span>${i + 1}</span>${c.title.replace('Tu mes en cifras', 'Resumen').replace('Lo que opinan tus clientes', 'Tus clientes').replace('Qué hacer el próximo mes', 'Qué hacer')}</a>`)
    .join('');

  const alcance = d.locationName
    ? esc(d.locationName)
    : units === 'stores'
      ? `${ranking.length} tiendas`
      : ranking[0]
        ? esc(ranking[0].city)
        : 'Todas las sedes';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Informe ${esc(d.periodLabel)} · ${esc(d.companyName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<script src="/chart.umd.min.js"></script>
<style>
  :root{
    --accent:#2563eb; --accent-soft:rgba(37,99,235,.08);
    --ok:#15803d; --ok-soft:rgba(22,163,74,.12);
    --warn:#b45309; --warn-soft:rgba(217,119,6,.12);
    --danger:#b91c1c; --danger-soft:rgba(220,38,38,.10);
    --ink:#1c1917; --muted:#78716c; --line:#e7e5e4; --line-soft:#f0efed;
    --card:#ffffff; --bg:#f5f4f2; --navy:#0b1f4d;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;-webkit-text-size-adjust:100%}
  .wrap{max-width:980px;margin:0 auto;padding:0 20px}
  .cover{background:var(--navy);color:#fff;padding:32px 0 42px;position:relative;overflow:hidden}
  .cover::after{content:'';position:absolute;inset:auto -10% -60% -10%;height:120%;background:radial-gradient(60% 60% at 70% 0%,rgba(96,165,250,.35),transparent 70%);pointer-events:none}
  .cover .top{display:flex;justify-content:space-between;align-items:center;gap:12px;position:relative;z-index:1}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
  .brand img{height:30px;width:auto}
  .actions{display:flex;gap:8px}
  .btn{appearance:none;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;padding:8px 14px;border-radius:10px;font:600 13px/1.2 inherit;font-family:inherit;cursor:pointer}
  .btn.primary{background:#fff;color:var(--navy);border-color:#fff}
  .btn:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}
  .eyebrow{margin-top:34px;font-size:13px;font-weight:600;color:#93c5fd;position:relative;z-index:1}
  .cover h1{font-size:clamp(25px,4.2vw,40px);font-weight:800;letter-spacing:-.02em;line-height:1.15;max-width:780px;margin-top:8px;position:relative;z-index:1;text-wrap:balance}
  .cover h1 em{font-style:normal;color:#e0e7ff}
  .cover h1 em.up{color:#86efac} .cover h1 em.down{color:#fca5a5}
  .cover .sub{color:#c7d2fe;margin-top:12px;position:relative;z-index:1}
  .chapters{position:sticky;top:0;z-index:20;background:rgba(245,244,242,.97);border-bottom:1px solid var(--line)}
  .chapters .wrap{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
  .chapters a{flex:none;padding:12px;font-size:13px;font-weight:600;color:var(--muted);text-decoration:none;border-bottom:2px solid transparent}
  .chapters a.active{color:var(--ink);border-bottom-color:var(--accent)}
  .chapters a span{color:var(--accent);margin-right:6px}
  section.chapter{padding:42px 0 6px;scroll-margin-top:48px}
  .ch-num{font-size:12px;font-weight:700;color:var(--accent)}
  .ch-title{font-size:24px;font-weight:800;letter-spacing:-.01em;margin-top:2px}
  .ch-lead{color:var(--muted);margin-top:4px;max-width:640px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(28,25,23,.04),0 4px 12px rgba(28,25,23,.03);margin-top:16px;min-width:0}
  .card h3{font-size:15px;font-weight:700}
  .card .desc{font-size:13px;color:var(--muted);margin-top:2px}
  .card.empty{border-style:dashed;box-shadow:none}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:20px}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
  .kpi .lbl{font-size:13px;color:var(--muted);font-weight:500}
  .kpi .val{font-size:28px;font-weight:800;letter-spacing:-.02em;margin-top:4px;line-height:1.1}
  .kpi .val small{font-size:15px;color:var(--muted);font-weight:600}
  .kpi .val.txt{font-size:18px;line-height:1.3;overflow-wrap:anywhere}
  .kpi .meta{font-size:12px;color:var(--muted);margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .delta{display:inline-flex;align-items:center;gap:3px;font-weight:700;font-size:12px;padding:2px 8px;border-radius:999px;white-space:nowrap}
  .delta.up{background:var(--ok-soft);color:var(--ok)} .delta.down{background:var(--danger-soft);color:var(--danger)} .delta.flat{background:var(--line-soft);color:var(--muted)}
  .chart-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .toggle{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;user-select:none}
  .toggle input{accent-color:var(--accent);width:16px;height:16px}
  .legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:10px;flex-wrap:wrap}
  .legend i{display:inline-block;width:14px;height:2px;vertical-align:middle;margin-right:6px;background:var(--accent)}
  .legend i.prev{background:#a8a29e}
  .legend i.band{height:10px;width:12px;background:rgba(37,99,235,.10);border-left:1px solid rgba(37,99,235,.35);border-right:1px solid rgba(37,99,235,.35)}
  .chart-box{position:relative;height:260px;margin-top:12px}
  .rank-wrap{overflow-x:auto;margin-top:12px}
  table.rank{width:100%;border-collapse:collapse;font-size:14px;min-width:520px}
  .rank th{font-size:12px;font-weight:600;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
  .rank th.sortable{cursor:pointer} .rank th.sortable:hover{color:var(--ink)}
  .rank th .arrow{opacity:.6;margin-left:4px}
  .rank td{padding:10px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
  .rank tr:last-child td{border-bottom:none}
  .rank .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .rank .pos{width:28px;color:var(--muted);font-weight:700;font-variant-numeric:tabular-nums}
  .rank .store{font-weight:600}
  .rank .city{display:block;font-size:12px;color:var(--muted)}
  .rank tr.flag td{background:var(--danger-soft)}
  .pill{font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--danger-soft);color:var(--danger);margin-left:6px;white-space:nowrap}
  .more{margin-top:10px;background:none;border:none;font:600 13px inherit;font-family:inherit;color:var(--accent);cursor:pointer;padding:4px 0}
  .heat{display:grid;gap:3px;margin-top:14px;font-size:11px}
  .heat .h{color:var(--muted);text-align:center}
  .heat .d{color:var(--muted);display:flex;align-items:center;font-weight:600}
  .heat .c{aspect-ratio:1.6/1;border-radius:4px}
  .heat-scale{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-top:10px}
  .heat-scale .bar{flex:0 0 140px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(37,99,235,.06),#2563eb)}
  .callout{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--accent-soft);font-size:14px}
  .camps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:16px}
  .camp{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
  .camp .name{font-weight:700} .camp .dates{font-size:12px;color:var(--muted)}
  .camp .lift{font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:10px}
  .camp .lift.up{color:var(--ok)} .camp .lift.down{color:var(--danger)} .camp .lift.na{color:var(--muted);font-size:17px}
  .camp .lift-sub{font-size:12px;color:var(--muted)}
  .bda{display:flex;align-items:flex-end;gap:10px;height:80px;margin-top:14px}
  .bda > div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;min-width:0}
  .bda .bar{width:100%;flex:none;border-radius:4px 4px 0 0;background:#d6d3d1}
  .bda .bar.on{background:var(--accent)}
  .bda span{font-size:11px;color:var(--muted);white-space:nowrap}
  .aspects{margin-top:12px;display:flex;flex-direction:column;gap:12px}
  .asp-row{display:grid;grid-template-columns:180px 1fr 44px;gap:12px;align-items:center;font-size:14px}
  .asp-track{height:10px;border-radius:5px;background:var(--line-soft);overflow:hidden}
  .asp-fill{height:100%;border-radius:5px;background:var(--accent)} .asp-fill.low{background:var(--warn)}
  .asp-val{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  .quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
  .quote{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;font-size:14px}
  .quote .who{font-size:12px;color:var(--muted);margin-top:8px}
  .todo{display:flex;flex-direction:column;gap:10px;margin-top:16px}
  .todo-item{display:grid;grid-template-columns:36px 1fr;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
  .todo-item.crit{background:var(--danger-soft);border-color:transparent}
  .todo-item.warn{background:var(--warn-soft);border-color:transparent}
  .todo-n{width:32px;height:32px;border-radius:10px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
  .todo-item .t{font-weight:700} .todo-item .why{font-size:13px;color:var(--muted);margin-top:2px}
  footer{padding:40px 0 48px;color:var(--muted);font-size:12px}
  @media (max-width:640px){
    .wrap{padding:0 16px}
    .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    .kpi .val{font-size:24px}
    .asp-row{grid-template-columns:120px 1fr 40px}
    .heat{gap:2px;font-size:10px}
    .actions .btn:not(.primary){display:none}
    table.rank{min-width:0}
    .rank .sparkcol{display:none}
    .rank td,.rank th{padding:8px 6px}
  }
  @media print{
    .chapters,.actions,.no-print{display:none!important}
    body{background:#fff}
    .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .card,.camp,.todo-item,.kpi,.quote{break-inside:avoid}
    .todo-item,.rank tr.flag td,.delta,.heat .c,.asp-fill,.bda .bar,.callout{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
  @media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style>
</head>
<body>
<header class="cover">
  <div class="wrap">
    <div class="top">
      <div class="brand">${logo ? `<img src="${logo}" alt="" />` : ''}NFCloud</div>
      <div class="actions">
        <button class="btn" type="button" id="shareBtn">Copiar enlace</button>
        <button class="btn primary" type="button" onclick="window.print()">Descargar PDF</button>
      </div>
    </div>
    <p class="eyebrow">Informe de ${esc(d.periodLabel.toLowerCase())} · ${esc(d.companyName)} · ${alcance}</p>
    <h1>${headline}</h1>
    ${subline ? `<p class="sub">${subline}</p>` : ''}
  </div>
</header>
<nav class="chapters" aria-label="Capítulos del informe"><div class="wrap">${nav}</div></nav>
<main class="wrap">
  ${chaptersHtml}
  <footer>NFCloud · Informe generado el ${esc(d.generatedAt)}.</footer>
</main>
<script>
(function(){
  var fmt=function(n){return new Intl.NumberFormat('es-CO').format(n);};
  var pct=function(n){return new Intl.NumberFormat('es-CO',{maximumFractionDigits:1}).format(n);};

  // Copiar enlace
  var share=document.getElementById('shareBtn');
  if(share){share.addEventListener('click',function(){
    if(navigator.clipboard){navigator.clipboard.writeText(location.href).then(function(){share.textContent='Enlace copiado';setTimeout(function(){share.textContent='Copiar enlace';},2000);});}
  });}

  // Tendencia con el mes anterior y bandas de campaña
  var trend=${json(d.trend)}, prev=${json(st?.prevTrend || [])}, camps=${json(d.campaigns || [])};
  var el=document.getElementById('cTrend');
  if(el && window.Chart){
    Chart.defaults.font.family="'Plus Jakarta Sans',sans-serif"; Chart.defaults.color='#78716c';
    var days=${st?.periodDays || 0} || trend.length;
    var month='${d.trend[0]?.day.slice(0, 7) || ''}';
    var byDay={}; trend.forEach(function(t){byDay[parseInt(t.day.slice(8),10)]=t.scans;});
    var labels=[], cur=[], prv=[];
    for(var i=1;i<=days;i++){labels.push(String(i)); cur.push(byDay[i]||0); prv.push(prev[i-1]!==undefined?prev[i-1]:null);}
    var bands={id:'bands',beforeDatasetsDraw:function(c){
      var a=c.chartArea,x=c.scales.x; if(!a||!camps.length) return;
      var step=labels.length>1?x.getPixelForValue(1)-x.getPixelForValue(0):20, g=c.ctx, rows=[]; g.save();
      camps.forEach(function(cp){
        var f=-1,l=-1; labels.forEach(function(_,i){var day=month+'-'+String(i+1).padStart(2,'0'); if(day>=cp.startsOn&&day<=cp.endsOn){if(f<0)f=i;l=i;}});
        if(f<0) return;
        var L=Math.max(a.left,x.getPixelForValue(f)-step/2), R=Math.min(a.right,x.getPixelForValue(l)+step/2);
        g.fillStyle='rgba(37,99,235,.08)'; g.fillRect(L,a.top,R-L,a.bottom-a.top);
        g.fillStyle='rgba(37,99,235,.30)'; g.fillRect(L,a.top,1,a.bottom-a.top); g.fillRect(R-1,a.top,1,a.bottom-a.top);
        g.font="600 11px 'Plus Jakarta Sans',sans-serif"; g.fillStyle='#78716c';
        var w=R-L-10,t=cp.name; if(w>24){while(t.length>1&&g.measureText(t).width>w)t=t.slice(0,-2)+'…';
          var r=rows.findIndex(function(e){return L+6>e+6;}); if(r<0) r=rows.length; rows[r]=L+6+g.measureText(t).width; g.fillText(t,L+6,a.top+14+r*14);}
      }); g.restore();
    }};
    var ds=[{label:'${esc(month)}',data:cur,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.08)',fill:true,tension:.3,borderWidth:2,pointRadius:0,pointHoverRadius:4}];
    if(${hasPrev ? 'true' : 'false'}) ds.push({label:'${esc(prevMonth.charAt(0).toUpperCase() + prevMonth.slice(1))}',data:prv,borderColor:'#a8a29e',borderWidth:1.5,borderDash:[4,4],fill:false,tension:.3,pointRadius:0,pointHoverRadius:3});
    var chart=new Chart(el,{type:'line',data:{labels:labels,datasets:ds},plugins:[bands],
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1917',padding:10,usePointStyle:true,
          callbacks:{title:function(i){return 'Día '+i[0].label;},label:function(i){return ' '+i.dataset.label+': '+fmt(i.parsed.y);}}}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:'#f0efed'},border:{display:false}}}}});
    var cmp=document.getElementById('cmpPrev');
    if(cmp) cmp.addEventListener('change',function(e){chart.setDatasetVisibility(1,e.target.checked);chart.update();
      var lg=document.getElementById('lgPrev'); if(lg) lg.style.display=e.target.checked?'':'none';});
  }

  // Ranking ordenable con mini-tendencias
  var rd=document.getElementById('rankData');
  if(rd){
    var R=JSON.parse(rd.textContent), sortK='scans', dir=-1, all=false;
    var more=document.getElementById('rankMore');
    function spark(s,flag){
      var w=110,h=28,max=Math.max.apply(null,s.concat([1]));
      var pts=s.map(function(v,i){return ((i/Math.max(1,s.length-1))*w).toFixed(1)+','+(h-2-(v/max)*(h-4)).toFixed(1);});
      var last=pts[pts.length-1].split(','), col=flag?'#b91c1c':'#2563eb';
      return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="2.5" fill="'+col+'"/></svg>';
    }
    function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function render(){
      var rows=R.rows.slice().sort(function(a,b){var va=a[sortK],vb=b[sortK];
        if(va===null) return 1; if(vb===null) return -1;
        return (typeof va==='string'?va.localeCompare(vb):va-vb)*dir;});
      var vis=all?rows:rows.slice(0,10);
      if(more) more.textContent=all?'Ver solo las 10 primeras':'Ver las '+rows.length;
      document.querySelector('#rank tbody').innerHTML=vis.map(function(r,i){
        var dl=r.delta===null?'<span class="delta flat">Nuevo</span>':'<span class="delta '+(Math.abs(r.delta)<5?'flat':r.delta>0?'up':'down')+'">'+(r.delta>0?'▲ +':r.delta<0?'▼ ':'')+pct(r.delta)+' %</span>';
        return '<tr class="'+(r.silent?'flag':'')+'"><td class="pos">'+(i+1)+'</td>'+
          '<td><span class="store" title="'+esc(r.name)+'">'+esc(r.short)+'</span>'+(r.silent?'<span class="pill">Sin actividad</span>':'')+'<span class="city">'+esc(r.city)+'</span></td>'+
          '<td class="num">'+fmt(r.scans)+'</td>'+(R.hasPrev?'<td class="num">'+dl+'</td>':'')+
          '<td class="sparkcol">'+spark(r.series,r.silent)+'</td>'+(R.anyRating?'<td class="num">'+(r.rating===null?'—':pct(r.rating))+'</td>':'')+'</tr>';
      }).join('');
      document.querySelectorAll('#rank th.sortable').forEach(function(th){th.querySelector('.arrow').textContent=th.dataset.k===sortK?(dir<0?'▼':'▲'):'';});
    }
    document.querySelectorAll('#rank th.sortable').forEach(function(th){th.addEventListener('click',function(){
      if(sortK===th.dataset.k) dir*=-1; else {sortK=th.dataset.k; dir=th.dataset.k==='short'?1:-1;} render();});});
    if(more) more.addEventListener('click',function(){all=!all;render();});
    // Al imprimir/guardar PDF se muestran todas las filas.
    window.addEventListener('beforeprint',function(){if(!all){all=true;render();}});
    render();
  }

  // Capítulo activo en la navegación
  var links=[].slice.call(document.querySelectorAll('.chapters a'));
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)links.forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id);});});},{rootMargin:'-45% 0px -50% 0px'});
    document.querySelectorAll('section.chapter').forEach(function(s){io.observe(s);});
  }
})();
</script>
</body>
</html>`;
}
