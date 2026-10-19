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
  // Para el header del informe: logo oscuro sobre fondo blanco
  const logoImg = logo
    ? `<img src="${logo}" alt="NFCloud" style="height:40px;display:block" />`
    : `<span style="font-weight:800;font-size:22px;color:#1e3a5f;letter-spacing:-.02em">nfcloud</span>`;

  // Para el footer: logo oscuro más pequeño
  const logoFooter = logo
    ? `<img src="${logo}" alt="NFCloud" style="height:24px;opacity:.55;display:block" />`
    : `<span style="font-weight:700;font-size:13px;color:#78716c">nfcloud</span>`;

  const hasSurvey = !!(d.survey && d.survey.total > 0 && d.survey.aspects.length);
  const fmt = (n: number) => new Intl.NumberFormat('es-CO').format(n);
  const nf = (v: unknown) => JSON.stringify(v);

  // Barra de progreso normalizada para top sedes
  const maxScans = d.topLocations.length ? Math.max(...d.topLocations.map((l) => l.scans)) : 1;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Informe ${esc(d.periodLabel)} · ${esc(d.companyName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="/chart.umd.min.js"></script>
<style>
  :root{
    --accent:#2563eb;
    --accent-hover:#1d4ed8;
    --accent-soft:rgba(37,99,235,.08);
    --accent-mid:rgba(37,99,235,.18);
    --ink:#1c1917;
    --ink-2:#44403c;
    --muted:#78716c;
    --muted-2:#a8a29e;
    --line:#e7e5e4;
    --line-2:#f0eeec;
    --card:#ffffff;
    --card-alt:#fafaf9;
    --bg:#f2f0ee;
    --ok:#16a34a;
    --ok-soft:rgba(22,163,74,.10);
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:var(--bg);
    color:var(--ink);
    padding:32px 20px;
    line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }

  /* ── Toolbar ────────────────────────────────────── */
  .toolbar{
    max-width:920px;margin:0 auto 18px;
    display:flex;gap:10px;justify-content:flex-end;
  }
  .btn{
    appearance:none;border:1px solid var(--line);
    background:#fff;color:var(--ink-2);
    padding:9px 18px;border-radius:9px;
    font-size:13px;font-weight:600;cursor:pointer;
    font-family:inherit;transition:all 140ms;
    letter-spacing:-.01em;
  }
  .btn:hover{background:var(--card-alt);border-color:#d4d1ce}
  .btn-primary{
    background:var(--accent);border-color:var(--accent);color:#fff;
    box-shadow:0 1px 3px rgba(37,99,235,.25);
  }
  .btn-primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}

  /* ── Sheet ──────────────────────────────────────── */
  .sheet{
    max-width:920px;margin:0 auto;
    background:var(--card);
    border:1px solid var(--line);
    border-radius:18px;
    box-shadow:0 1px 2px rgba(28,25,23,.03),0 6px 24px rgba(28,25,23,.06);
    overflow:hidden;
  }

  /* ── Header ─────────────────────────────────────── */
  .rpt-header{
    display:flex;align-items:center;justify-content:space-between;gap:24px;
    padding:28px 36px 22px;
    border-bottom:1px solid var(--line);
    background:var(--card-alt);
  }
  .rpt-header-left{display:flex;flex-direction:column;gap:6px}
  .rpt-badge{
    display:inline-flex;align-items:center;gap:6px;
    background:var(--accent-soft);color:var(--accent);
    border:1px solid rgba(37,99,235,.18);
    border-radius:6px;padding:3px 10px;
    font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.06em;
    width:fit-content;margin-bottom:4px;
  }
  .rpt-header h1{
    font-size:24px;font-weight:800;
    color:var(--ink);letter-spacing:-.03em;
    line-height:1.2;
  }
  .rpt-header .meta{
    display:flex;flex-wrap:wrap;gap:4px 14px;
    font-size:12.5px;color:var(--muted);margin-top:2px;
  }
  .rpt-header .meta strong{color:var(--ink-2);font-weight:600}
  .rpt-header-right{
    display:flex;flex-direction:column;
    align-items:flex-end;gap:8px;
    flex-shrink:0;
  }
  .rpt-generated{
    font-size:11px;color:var(--muted-2);
    text-align:right;line-height:1.4;
  }
  .rpt-generated strong{color:var(--muted);font-weight:600}

  /* ── Body padding ───────────────────────────────── */
  .rpt-body{padding:32px 36px}

  /* ── KPIs ───────────────────────────────────────── */
  .kpis{
    display:grid;grid-template-columns:repeat(3,1fr);
    gap:14px;margin-bottom:32px;
  }
  .kpi{
    border:1px solid var(--line);
    border-radius:12px;
    padding:18px 18px 16px;
    position:relative;
    overflow:hidden;
    background:var(--card);
  }
  .kpi::before{
    content:'';
    position:absolute;top:0;left:0;
    width:3px;height:100%;
    background:var(--accent);
    border-radius:3px 0 0 3px;
  }
  .kpi .lbl{
    font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.07em;
    color:var(--muted);margin-bottom:8px;
  }
  .kpi .val{
    font-size:30px;font-weight:800;
    color:var(--ink);letter-spacing:-.03em;
    line-height:1;
  }
  .kpi .val-md{font-size:20px}
  .kpi .hint{
    font-size:11.5px;color:var(--muted-2);
    margin-top:6px;line-height:1.4;
  }

  /* ── Sección ────────────────────────────────────── */
  .section{margin-bottom:30px}
  .section-header{
    display:flex;align-items:baseline;gap:10px;
    margin-bottom:6px;
  }
  .section h2{
    font-size:14px;font-weight:700;
    color:var(--ink);letter-spacing:-.01em;
  }
  .section .desc{
    font-size:12px;color:var(--muted);
    margin-bottom:14px;
  }

  /* ── Gráficos ───────────────────────────────────── */
  .chart-box{position:relative;height:230px}
  .chart-wrap{
    background:var(--card-alt);
    border:1px solid var(--line-2);
    border-radius:10px;
    padding:16px;
  }

  /* ── Grid 2 col ─────────────────────────────────── */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:30px}

  /* ── Tabla sedes ────────────────────────────────── */
  .tbl-sedes{width:100%;border-collapse:collapse;font-size:13px}
  .tbl-sedes th{
    text-align:left;padding:6px 8px 6px 0;
    color:var(--muted-2);font-weight:600;
    font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
    border-bottom:1px solid var(--line);
  }
  .tbl-sedes th.num,.tbl-sedes td.num{text-align:right}
  .tbl-sedes td{padding:10px 8px 10px 0;border-bottom:1px solid var(--line-2)}
  .tbl-sedes tr:last-child td{border-bottom:none}
  .sede-name{font-weight:600;font-size:13px;color:var(--ink)}
  .sede-city{font-size:11px;color:var(--muted-2);margin-top:1px}
  .sede-bar-wrap{margin-top:5px;height:3px;background:var(--line-2);border-radius:2px}
  .sede-bar-fill{height:3px;background:var(--accent);border-radius:2px;transition:width .4s}
  .sede-num{font-size:14px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}

  /* ── Divider ────────────────────────────────────── */
  .divider{height:1px;background:var(--line);margin:0 0 28px}

  /* ── Footer ─────────────────────────────────────── */
  .rpt-footer{
    display:flex;align-items:center;justify-content:space-between;
    padding:18px 36px;
    border-top:1px solid var(--line);
    background:var(--card-alt);
  }
  .rpt-footer .foot-info{font-size:11px;color:var(--muted-2);line-height:1.5}
  .rpt-footer .foot-info strong{color:var(--muted);font-weight:600}

  .empty{color:var(--muted-2);font-size:13px;padding:12px 0;font-style:italic}

  /* ── Print ──────────────────────────────────────── */
  @media print{
    body{background:#fff;padding:0}
    .toolbar{display:none}
    .sheet{
      box-shadow:none;border:none;
      border-radius:0;max-width:none;
    }
    .chart-box{height:200px}
    .rpt-header{background:#fff}
    .rpt-footer{background:#fff}
    .chart-wrap{background:#fff}
  }
  @page{size:A4 portrait;margin:12mm 14mm}
</style>
</head>
<body>

  <div class="toolbar">
    <button class="btn" onclick="window.close()">Cerrar</button>
    <button class="btn btn-primary" onclick="window.print()">&#8595; Descargar PDF</button>
  </div>

  <div class="sheet">

    <!-- HEADER -->
    <div class="rpt-header">
      <div class="rpt-header-left">
        <div class="rpt-badge">&#9632; Informe de interacciones</div>
        <h1>${esc(d.companyName)}</h1>
        <div class="meta">
          <span>${d.locationName ? esc(d.locationName) : 'Todas las sedes'}</span>
          <span>·</span>
          <span>Periodo: <strong>${esc(d.periodLabel)}</strong></span>
        </div>
      </div>
      <div class="rpt-header-right">
        ${logoImg}
        <div class="rpt-generated">
          Generado el<br>
          <strong>${esc(d.generatedAt)}</strong>
        </div>
      </div>
    </div>

    <!-- BODY -->
    <div class="rpt-body">

      <!-- KPIs -->
      <div class="kpis">
        <div class="kpi">
          <div class="lbl">Interacciones del mes</div>
          <div class="val">${fmt(d.kpis.totalScans)}</div>
          <div class="hint">Total de escaneos NFC / QR</div>
        </div>
        <div class="kpi">
          <div class="lbl">Sede más activa</div>
          <div class="val val-md">${d.kpis.topLocation ? esc(d.kpis.topLocation.name) : '—'}</div>
          <div class="hint">${d.kpis.topLocation ? esc(d.kpis.topLocation.city) + ' · ' + fmt(d.kpis.topLocation.scans) + ' escaneos' : 'Sin datos'}</div>
        </div>
        <div class="kpi">
          <div class="lbl">Hora pico</div>
          <div class="val">${d.kpis.peakHour !== null ? String(d.kpis.peakHour).padStart(2, '0') + ':00' : '—'}</div>
          <div class="hint">Franja con más actividad</div>
        </div>
      </div>

      <!-- Tendencia -->
      <div class="section">
        <div class="section-header">
          <h2>Evolución del mes</h2>
        </div>
        <div class="desc">Escaneos por día en el periodo seleccionado</div>
        <div class="chart-wrap">
          <div class="chart-box"><canvas id="cTrend"></canvas></div>
        </div>
      </div>

      <!-- Grid: sedes + canales -->
      <div class="grid2">
        <div class="section">
          <div class="section-header"><h2>Top sedes</h2></div>
          <div class="desc">Sedes con más interacciones en el periodo</div>
          ${
            d.topLocations.length
              ? d.topLocations.map((l) => {
                  const pct = Math.round((l.scans / maxScans) * 100);
                  return `<div style="padding:10px 0;border-bottom:1px solid var(--line-2)">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                      <div>
                        <div class="sede-name">${esc(l.name)}</div>
                        <div class="sede-city">${esc(l.city)}</div>
                      </div>
                      <div class="sede-num">${fmt(l.scans)}</div>
                    </div>
                    <div class="sede-bar-wrap"><div class="sede-bar-fill" style="width:${pct}%"></div></div>
                  </div>`;
                }).join('')
              : `<p class="empty">Sin datos en el periodo.</p>`
          }
        </div>
        <div class="section">
          <div class="section-header"><h2>Por canal / destino</h2></div>
          <div class="desc">A dónde llevaron los puntos NFC y QR</div>
          <div class="chart-wrap">
            <div class="chart-box"><canvas id="cChannels"></canvas></div>
          </div>
        </div>
      </div>

      ${
        hasSurvey
          ? `<div class="divider"></div>
             <div class="section">
               <div class="section-header"><h2>Calificación por aspecto</h2></div>
               <div class="desc">${fmt(d.survey!.total)} respuestas · Promedio global <strong>${d.survey!.avg !== null ? d.survey!.avg.toFixed(2) : '—'} / 5</strong></div>
               <div class="chart-wrap">
                 <div class="chart-box"><canvas id="cSurvey"></canvas></div>
               </div>
             </div>`
          : ''
      }

    </div>
    <!-- /BODY -->

    <!-- FOOTER -->
    <div class="rpt-footer">
      <div class="foot-info">
        <strong>${esc(d.companyName)}</strong><br>
        ${d.locationName ? esc(d.locationName) + ' · ' : ''}${esc(d.periodLabel)}
      </div>
      ${logoFooter}
    </div>

  </div>

<script>
(function(){
  var ACC='#2563eb';
  function acc(a){return 'rgba(37,99,235,'+a+')';}
  if(!window.Chart) return;
  Chart.defaults.font.family="'Plus Jakarta Sans',sans-serif";
  Chart.defaults.font.size=12;
  Chart.defaults.color='#a8a29e';
  var noLegend={plugins:{legend:{display:false}}};
  var gridColor='rgba(231,229,228,.7)';

  var trend=${nf(d.trend)};
  new Chart(document.getElementById('cTrend'),{
    type:'line',
    data:{
      labels:trend.map(function(t){return t.day.slice(8)+'/'+t.day.slice(5,7);}),
      datasets:[{
        data:trend.map(function(t){return t.scans;}),
        borderColor:ACC,
        backgroundColor:acc(.09),
        fill:true,tension:.38,
        pointRadius:0,pointHoverRadius:4,
        borderWidth:2
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:noLegend,
      scales:{
        x:{grid:{display:false},ticks:{maxTicksLimit:10}},
        y:{beginAtZero:true,grid:{color:gridColor},border:{dash:[3,3]}}
      }
    }
  });

  var ch=${nf(d.channels)};
  new Chart(document.getElementById('cChannels'),{
    type:'bar',
    data:{
      labels:ch.map(function(c){return c.channel;}),
      datasets:[{
        data:ch.map(function(c){return c.scans;}),
        backgroundColor:acc(.75),
        borderColor:ACC,borderWidth:1,
        borderRadius:5,borderSkipped:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      indexAxis:'y',
      plugins:noLegend,
      scales:{
        x:{beginAtZero:true,grid:{color:gridColor},border:{dash:[3,3]}},
        y:{grid:{display:false}}
      }
    }
  });

  ${
    hasSurvey
      ? `var sv=${nf(d.survey!.aspects)};
         new Chart(document.getElementById('cSurvey'),{
           type:'bar',
           data:{
             labels:sv.map(function(a){return a.label;}),
             datasets:[{
               data:sv.map(function(a){return a.avg;}),
               backgroundColor:acc(.75),
               borderColor:ACC,borderWidth:1,
               borderRadius:5,borderSkipped:false
             }]
           },
           options:{
             responsive:true,maintainAspectRatio:false,
             plugins:noLegend,
             scales:{
               x:{grid:{display:false}},
               y:{beginAtZero:true,suggestedMax:5,grid:{color:gridColor},border:{dash:[3,3]}}
             }
           }
         });`
      : ''
  }
})();
</script>
</body>
</html>`;
}
