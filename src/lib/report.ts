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

export interface ReportData {
  companyName: string;
  periodLabel: string; // ej. "Octubre 2026"
  locationName?: string | null; // sede filtrada, o null = todas
  generatedAt: string; // fecha de generación legible
  kpis: {
    totalScans: number;
    prevTotal?: number; // total del mes anterior (mismo alcance)
    prevPeriodLabel?: string; // ej. "Septiembre 2026"
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

export function reportHtml(d: ReportData): string {
  const logo = logoDataUri();
  const marca = logo
    ? `<img src="${logo}" alt="NFCloud" style="height:34px" />`
    : `<span style="font-weight:800;font-size:20px;color:#1e40af">NFCloud</span>`;

  const hasSurvey = !!(d.survey && d.survey.total > 0 && d.survey.aspects.length);
  const fmt = (n: number) => new Intl.NumberFormat('es-CO').format(n);

  const nf = (v: unknown) => JSON.stringify(v);
  const pct = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);

  // Variación vs mes anterior (solo si hay base de comparación).
  const k = d.kpis;
  const variation =
    k.prevTotal && k.prevTotal > 0
      ? Math.round(((k.totalScans - k.prevTotal) / k.prevTotal) * 1000) / 10
      : null;
  const tone = variation === null || Math.abs(variation) < 5 ? 'flat' : variation > 0 ? 'up' : 'down';
  const deltaHtml =
    variation === null
      ? ''
      : `<span class="delta delta-${tone}">${variation > 0 ? '▲ +' : variation < 0 ? '▼ ' : ''}${pct(variation)} %</span>`;

  const channelTotal = d.channels.reduce((a, c) => a + c.scans, 0);
  const topChannel = d.channels[0] || null;
  const topChannelShare = topChannel && channelTotal ? (topChannel.scans / channelTotal) * 100 : 0;

  // Resumen escrito: lo primero que lee un directivo.
  const insight: string[] = [];
  if (!k.totalScans) {
    insight.push('No se registraron interacciones en este periodo.');
  } else {
    if (variation === null) {
      insight.push(`Se registraron ${fmt(k.totalScans)} interacciones en ${d.periodLabel.toLowerCase()}.`);
    } else if (Math.abs(variation) < 5) {
      insight.push(`Las interacciones se mantuvieron estables frente a ${k.prevPeriodLabel?.toLowerCase() || 'el mes anterior'}: ${fmt(k.totalScans)} en total.`);
    } else {
      insight.push(`Las interacciones ${variation > 0 ? 'crecieron' : 'cayeron'} ${pct(Math.abs(variation))} % frente a ${k.prevPeriodLabel?.toLowerCase() || 'el mes anterior'}: ${fmt(k.totalScans)} en total.`);
    }
    if (k.topLocation) insight.push(`${k.topLocation.name} lideró con ${fmt(k.topLocation.scans)}.`);
    if (topChannel) insight.push(`El ${pct(topChannelShare)} % llevó a ${topChannel.channel}.`);
    if (k.peakHour !== null) insight.push(`La hora de más movimiento fue las ${String(k.peakHour).padStart(2, '0')}:00.`);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Informe ${esc(d.periodLabel)} · ${esc(d.companyName)}</title>
<script src="/chart.umd.min.js"></script>
<style>
  :root{
    --accent:#2563eb; --accent-soft:rgba(37,99,235,.10);
    --ink:#1c1917; --muted:#78716c; --line:#e7e5e4; --card:#ffffff; --bg:#f5f4f2;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:var(--bg); color:var(--ink); padding:32px 20px; line-height:1.5;
    -webkit-text-size-adjust:100%;
  }
  .sheet{max-width:900px;margin:0 auto;background:var(--card);border:1px solid var(--line);
    border-radius:16px;box-shadow:0 1px 2px rgba(28,25,23,.04),0 4px 16px rgba(28,25,23,.04);
    padding:40px}
  .head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
    border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:24px}
  .head h1{font-size:22px;font-weight:800;letter-spacing:-.01em}
  .head .sub{color:var(--muted);font-size:13px;margin-top:4px}
  .head .right{text-align:right;flex:none}
  .insight{background:var(--accent-soft);border-radius:12px;padding:14px 16px;margin-bottom:22px;
    font-size:14px;font-weight:600;line-height:1.55}
  .delta{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle}
  .delta-up{background:rgba(22,163,74,.12);color:#15803d}
  .delta-down{background:rgba(220,38,38,.12);color:#b91c1c}
  .delta-flat{background:rgba(120,113,108,.14);color:#78716c}
  .toolbar{max-width:900px;margin:0 auto 16px;display:flex;gap:10px;justify-content:flex-end}
  .btn{appearance:none;border:1px solid var(--line);background:#fff;color:var(--ink);
    padding:9px 16px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;
    font-family:inherit}
  .btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .btn:hover{filter:brightness(.98)}
  .kpis{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;margin-bottom:26px}
  .kpi{border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
  .kpi .val.txt{font-size:17px;line-height:1.3;overflow-wrap:anywhere}
  .kpi .lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .kpi .val{font-size:26px;font-weight:800;margin-top:6px}
  .kpi .hint{font-size:12px;color:var(--muted);margin-top:2px}
  .section{margin-bottom:26px}
  .section h2{font-size:14px;font-weight:700;margin-bottom:4px}
  .section .desc{font-size:12px;color:var(--muted);margin-bottom:12px}
  .chart-box{position:relative;height:240px}
  .grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}
  .grid2>*{min-width:0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .foot{border-top:1px solid var(--line);margin-top:24px;padding-top:16px;
    font-size:11px;color:var(--muted);display:flex;justify-content:space-between}
  .empty{color:var(--muted);font-size:13px;padding:12px 0}
  /* Móvil: una columna, menos relleno, nada se sale de la hoja. */
  @media (max-width:640px){
    body{padding:12px}
    .toolbar{justify-content:stretch}
    .toolbar .btn{flex:1}
    .sheet{padding:20px 16px;border-radius:12px}
    .head{flex-direction:column;gap:12px}
    .head .right{text-align:left;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .head .right .sub{margin-top:0!important}
    .kpis{grid-template-columns:1fr;gap:10px}
    .kpi .val{font-size:24px}
    .grid2{grid-template-columns:minmax(0,1fr);gap:0}
    .chart-box{height:220px}
    .foot{flex-direction:column;gap:4px}
  }
  @media print{
    body{background:#fff;padding:0}
    .toolbar{display:none}
    .sheet{box-shadow:none;border:none;border-radius:0;max-width:none;padding:0 10mm}
    .chart-box{height:220px}
  }
  @page{size:A4;margin:14mm}
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.close()">Cerrar</button>
    <button class="btn btn-primary" onclick="window.print()">Descargar / Imprimir PDF</button>
  </div>

  <div class="sheet">
    <div class="head">
      <div>
        <h1>Informe de interacciones</h1>
        <div class="sub">${esc(d.companyName)}${d.locationName ? ' · ' + esc(d.locationName) : ' · Todas las sedes'}</div>
        <div class="sub">Periodo: <strong>${esc(d.periodLabel)}</strong></div>
      </div>
      <div class="right">
        ${marca}
        <div class="sub" style="margin-top:8px">Generado: ${esc(d.generatedAt)}</div>
      </div>
    </div>

    <div class="insight">${esc(insight.join(' '))}</div>

    <div class="kpis">
      <div class="kpi">
        <div class="lbl">Interacciones del mes</div>
        <div class="val">${fmt(k.totalScans)}${deltaHtml}</div>
        <div class="hint">${variation === null ? 'Escaneos NFC/QR' : 'vs. ' + esc(k.prevPeriodLabel || 'mes anterior') + ' (' + fmt(k.prevTotal || 0) + ')'}</div>
      </div>
      <div class="kpi">
        <div class="lbl">Sede líder</div>
        <div class="val txt">${k.topLocation ? esc(k.topLocation.name) : 'Sin datos'}</div>
        <div class="hint">${k.topLocation ? esc(k.topLocation.city) + ' · ' + fmt(k.topLocation.scans) + ' interacciones' : 'Sin interacciones en el periodo'}</div>
      </div>
      <div class="kpi">
        <div class="lbl">Destino principal</div>
        <div class="val txt">${topChannel ? esc(topChannel.channel) : 'Sin datos'}</div>
        <div class="hint">${topChannel ? pct(topChannelShare) + ' % de las interacciones' : 'Sin redirecciones en el periodo'}</div>
      </div>
    </div>

    <div class="section">
      <h2>Evolución del mes</h2>
      <div class="desc">Interacciones por día en el periodo</div>
      <div class="chart-box"><canvas id="cTrend"></canvas></div>
    </div>

    <div class="grid2">
      <div class="section">
        <h2>Top sedes</h2>
        <div class="desc">Sedes con más interacciones</div>
        <table>
          <thead><tr><th>Sede</th><th class="num">Interacciones</th></tr></thead>
          <tbody>
            ${
              d.topLocations.length
                ? d.topLocations
                    .map(
                      (l) =>
                        `<tr><td>${esc(l.name)}<br><span style="color:var(--muted);font-size:11px">${esc(l.city)}</span></td><td class="num">${fmt(l.scans)}</td></tr>`
                    )
                    .join('')
                : '<tr><td colspan="2" class="empty">Sin datos en el periodo.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      <div class="section">
        <h2>Por canal / destino</h2>
        <div class="desc">A dónde llevaron los puntos</div>
        <div class="chart-box"><canvas id="cChannels"></canvas></div>
      </div>
    </div>

    ${
      hasSurvey
        ? `<div class="section">
             <h2>Calificación por aspecto</h2>
             <div class="desc">${fmt(d.survey!.total)} respuestas · promedio global ${d.survey!.avg !== null ? d.survey!.avg.toFixed(2) : '—'} / 5</div>
             <div class="chart-box"><canvas id="cSurvey"></canvas></div>
           </div>`
        : ''
    }

    <div class="foot">
      <span>NFCloud · Analítica NFC</span>
      <span>${esc(d.companyName)} · ${esc(d.periodLabel)}</span>
    </div>
  </div>

<script>
(function(){
  var ACC='#2563eb';
  function acc(a){return 'rgba(37,99,235,'+a+')';}
  if(!window.Chart) return;
  Chart.defaults.font.family="'Plus Jakarta Sans',sans-serif";
  Chart.defaults.color='#78716c';
  var noLegend={legend:{display:false}};

  var trend=${nf(d.trend)};
  new Chart(document.getElementById('cTrend'),{
    type:'line',
    data:{labels:trend.map(function(t){return t.day.slice(8)+'/'+t.day.slice(5,7);}),
      datasets:[{data:trend.map(function(t){return t.scans;}),borderColor:ACC,
        backgroundColor:acc(.10),fill:true,tension:.35,pointRadius:0,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:noLegend,
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e7e5e4'}}}}
  });

  var ch=${nf(d.channels)};
  new Chart(document.getElementById('cChannels'),{
    type:'bar',
    data:{labels:ch.map(function(c){return c.channel;}),
      datasets:[{data:ch.map(function(c){return c.scans;}),backgroundColor:acc(.78),
        borderColor:ACC,borderWidth:1,borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:noLegend,
      scales:{x:{beginAtZero:true,grid:{color:'#e7e5e4'}},y:{grid:{display:false}}}}
  });

  ${
    hasSurvey
      ? `var sv=${nf(d.survey!.aspects)};
         new Chart(document.getElementById('cSurvey'),{
           type:'bar',
           data:{labels:sv.map(function(a){return a.label;}),
             datasets:[{data:sv.map(function(a){return a.avg;}),backgroundColor:acc(.78),
               borderColor:ACC,borderWidth:1,borderRadius:5}]},
           options:{responsive:true,maintainAspectRatio:false,plugins:noLegend,
             scales:{x:{grid:{display:false}},y:{beginAtZero:true,suggestedMax:5,grid:{color:'#e7e5e4'}}}}
         });`
      : ''
  }
})();
</script>
</body>
</html>`;
}
