/* global Chart */
'use strict';

const state = {
  from: '',
  to: '',
  locationId: '',
  channel: '',
  companyId: '',
  role: null,
  companies: [],
  charts: {},
  locations: [],
  devices: [],
  opItems: [],
  surveyTemplates: [],
  expanded: new Set(),
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => new Intl.NumberFormat('es-CO').format(n);

/** Normaliza texto para búsqueda: minúsculas y sin tildes/diacríticos. */
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

function qs(opts = {}) {
  const p = new URLSearchParams();
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  // La comparativa ejecutiva compara sedes entre sí: filtrar por una sola
  // sede no tiene sentido y colapsa el ranking. opts.ignoreLocation lo omite.
  if (state.locationId && !opts.ignoreLocation) p.set('locationId', state.locationId);
  if (state.channel) p.set('channel', state.channel);
  if (state.companyId) p.set('companyId', state.companyId);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function toast(msg, ok = true) {
  const t = $('#toast');
  const ico = ok ? icon('check-circle', { size: 16 }) : icon('alert-triangle', { size: 16 });
  t.innerHTML = `<span class="toast-inner">${ico}<span>${msg}</span></span>`;
  t.style.background = ok ? accent() : token('--danger', '#dc2626');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

// Modal de confirmación con estética propia (reemplaza el confirm() nativo).
// Devuelve una promesa que resuelve true (aceptar) o false (cancelar/cerrar).
// opts: { title, message, confirmText, cancelText, danger }
function confirmDialog(opts = {}) {
  const modal = $('#confirmModal');
  const titleEl = $('#confirmTitle');
  const msgEl = $('#confirmMessage');
  const acceptBtn = $('#confirmAccept');
  const cancelBtn = $('#confirmCancel');

  titleEl.textContent = opts.title || 'Confirmar acción';
  msgEl.textContent = opts.message || '¿Deseas continuar?';
  acceptBtn.textContent = opts.confirmText || 'Confirmar';
  cancelBtn.textContent = opts.cancelText || 'Cancelar';
  // Botón rojo para acciones destructivas.
  acceptBtn.classList.toggle('btn-danger', !!opts.danger);

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  return new Promise((resolve) => {
    const cleanup = (result) => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      acceptBtn.removeEventListener('click', onAccept);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      else if (e.key === 'Enter') cleanup(true);
    };
    acceptBtn.addEventListener('click', onAccept);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    acceptBtn.focus();
  });
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}
function gridColor() {
  return isDark() ? 'rgba(168,162,158,0.12)' : 'rgba(120,113,108,0.14)';
}
function tickColor() {
  return isDark() ? '#a8a29e' : '#78716c';
}
// Lee un token de color del sistema de diseño (variables CSS) para que los
// gráficos usen SIEMPRE la paleta de marca y respeten claro/oscuro.
function token(name, fallback = '#2563eb') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function accent() { return token('--accent', '#2563eb'); }
// Azul de marca con opacidad (para rellenos y variaciones monocromas).
function accentA(alpha) {
  const hex = accent().replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Configuración de tooltip limpio y legible para Chart.js.
 * Los nombres largos NO se cortan (el tooltip crece y hace wrap).
 * @param titleFn opcional: función para personalizar el título.
 */
function cleanTooltip(titleFn) {
  return {
    backgroundColor: isDark() ? '#2b2825' : '#1c1917',
    titleColor: '#fafaf9',
    bodyColor: '#e7e5e4',
    padding: 12,
    cornerRadius: 8,
    titleFont: { size: 13, weight: '600' },
    bodyFont: { size: 12 },
    displayColors: true,
    // Marcador redondo (no el cuadrado por defecto) para un look moderno.
    usePointStyle: true,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 6,
    // Sin maxWidth => el tooltip no trunca nombres largos.
    callbacks: titleFn
      ? { title: titleFn, labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }) }
      : { labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }) },
  };
}

/** Turno operativo según la hora (0-23). El color ya NO diferencia las barras
    (son monocromo azul); solo nombra el turno para el tooltip y las bandas. */
function shiftOf(hour) {
  if (hour >= 6 && hour < 12) return { name: 'Mañana', band: 'manana' };
  if (hour >= 12 && hour < 18) return { name: 'Tarde', band: 'tarde' };
  if (hour >= 18 && hour < 24) return { name: 'Noche', band: 'noche' };
  return { name: 'Madrugada', band: 'noche' };
}

// Plugin Chart.js: pinta bandas de fondo muy sutiles por turno detrás de las
// barras del gráfico de horas. Da el contexto mañana/tarde/noche sin romper el
// monocromo azul (acordado con el usuario: bandas de fondo, no barras de color).
const shiftBandsPlugin = {
  id: 'shiftBands',
  beforeDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;
    const x = scales.x;
    const bands = [
      { from: 6, to: 12, color: token('--shift-manana', 'rgba(234,179,8,0.08)') },
      { from: 12, to: 18, color: token('--shift-tarde', 'rgba(37,99,235,0.07)') },
      { from: 18, to: 24, color: token('--shift-noche', 'rgba(100,116,139,0.1)') },
    ];
    const labels = chart.data.labels || [];
    // labels vienen como "08h": mapeamos cada banda a los píxeles de su rango.
    const hourAt = (i) => parseInt(String(labels[i]).replace('h', ''), 10);
    ctx.save();
    for (const b of bands) {
      let startPx = null, endPx = null;
      for (let i = 0; i < labels.length; i++) {
        const h = hourAt(i);
        if (h >= b.from && h < b.to) {
          const px = x.getPixelForValue(i);
          const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 || 10;
          if (startPx === null) startPx = px - half;
          endPx = px + half;
        }
      }
      if (startPx !== null) {
        ctx.fillStyle = b.color;
        ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.bottom - chartArea.top);
      }
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Navegación entre vistas
// ---------------------------------------------------------------------------
const VIEW_TITLES = {
  dashboard: 'Panel de Control',
  executive: 'Comparativa ejecutiva',
  operations: 'Salud operativa',
  survey: 'Calificación',
  locations: 'Sedes',
  devices: 'Dispositivos NFC',
  admin: 'Empresas y usuarios',
};

function setupNav() {
  const views = ['dashboard', 'executive', 'operations', 'survey', 'locations', 'devices', 'admin'];

  function activate(target) {
    views.forEach((v) => {
      $(`#view-${v}`).classList.toggle('hidden', v !== target);
    });
    document.querySelectorAll('.nav-link').forEach((l) => {
      l.classList.toggle('active', l.getAttribute('href') === `#${target}`);
    });
    // Título de página dinámico
    const t = $('#pageTitle');
    if (t && VIEW_TITLES[target]) t.textContent = VIEW_TITLES[target];

    // Los filtros de analítica (sede/fecha/canal) solo tienen sentido en las
    // vistas de reportes. En gestión (Sedes, Dispositivos, Empresas) se ocultan
    // para no competir visualmente con los buscadores propios de cada tabla.
    const analyticsViews = ['dashboard', 'executive', 'operations', 'survey'];
    const af = $('#analyticsFilters');
    if (af) af.classList.toggle('hidden', !analyticsViews.includes(target));
    // Actualizar chips de filtros activos según la vista.
    renderActiveFilters();

    // Cerrar el sidebar en móvil al navegar
    closeSidebar();
    if (target === 'locations') renderLocationsTable($('#locSearch').value);
    if (target === 'devices') renderDevicesTable($('#devSearch').value);
    if (target === 'executive') loadExecutive();
    if (target === 'operations') loadOperations();
    if (target === 'survey') loadSurvey();
    if (target === 'admin') loadAdmin();
  }

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activate(link.getAttribute('href').slice(1));
    });
  });

  // Toggle del sidebar (móvil)
  const toggle = $('#sidebarToggle');
  const overlay = $('#sidebarOverlay');
  if (toggle) toggle.addEventListener('click', openSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Toggle de filtros en móvil/tablet: despliega el panel de filtros bajo la barra.
  const filtersBtn = $('#filtersToggle');
  const filtersPanel = $('#headerFilters');
  if (filtersBtn && filtersPanel) {
    filtersBtn.addEventListener('click', () => {
      const open = filtersPanel.classList.toggle('open');
      filtersBtn.classList.toggle('active', open);
      filtersBtn.setAttribute('aria-expanded', String(open));
    });
  }
}

function openSidebar() {
  const sb = $('#appSidebar');
  const ov = $('#sidebarOverlay');
  if (sb) sb.classList.add('open');
  if (ov) ov.classList.add('open');
}
function closeSidebar() {
  const sb = $('#appSidebar');
  const ov = $('#sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Tema claro/oscuro
// ---------------------------------------------------------------------------
function setupTheme() {
  const btn = $('#themeToggle');
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
  const paintThemeIcon = () => {
    // En modo oscuro se ofrece cambiar a claro (sol); en claro, a oscuro (luna).
    btn.innerHTML = icon(isDark() ? 'sun' : 'moon', { size: 18 });
  };
  paintThemeIcon();

  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark() ? 'dark' : 'light');
    paintThemeIcon();
    // Re-render de gráficos para actualizar colores de ejes.
    loadDashboard();
  });
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
async function loadKpis() {
  const k = await api(`/api/kpis${qs()}`);
  $('#kpiTotal').textContent = fmt(k.totalScans);
  $('#kpiWeek').textContent = fmt(k.scansWeek);
  $('#kpiTopLoc').textContent = k.topLocation ? k.topLocation.name : '—';
  $('#kpiTopLocScans').textContent = k.topLocation
    ? `${fmt(k.topLocation.scans)} escaneos`
    : '—';
  $('#kpiPeak').textContent = k.peakHour
    ? `${String(k.peakHour.hour).padStart(2, '0')}:00`
    : '—';
  $('#kpiPeakScans').textContent = k.peakHour ? `${fmt(k.peakHour.scans)} escaneos` : '—';
  $('#kpiIos').textContent = fmt(k.devices.iOS || 0);
  $('#kpiAndroid').textContent = fmt(k.devices.Android || 0);
  return k;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------
function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

// Crea el gráfico si no existe; si ya existe, actualiza sus datos y opciones
// in-place con chart.update() en lugar de destruirlo y recrearlo. Esto elimina
// el parpadeo del auto-refresco (el canvas no se borra) y es más eficiente.
// Si cambia el tipo de gráfico, sí se recrea (update no puede cambiar el tipo).
function upsertChart(key, ctx, config) {
  const existing = state.charts[key];
  if (existing && existing.config.type === config.type) {
    existing.data = config.data;
    if (config.options) existing.options = config.options;
    existing.update();
    return existing;
  }
  if (existing) existing.destroy();
  state.charts[key] = new Chart(ctx, config);
  return state.charts[key];
}

async function renderTrend() {
  const res = await api(`/api/trend-advanced${qs()}`);
  const data = res.series || [];
  const ctx = $('#trendChart');

  const empty = data.every((d) => !d.scans);
  toggleChartEmpty('#trendChart', data.length === 0 || empty, {
    icon: 'activity',
    title: 'Sin escaneos en este periodo',
    hint: 'Prueba ampliar el rango de fechas o quitar filtros.',
  });
  if (data.length === 0 || empty) {
    destroyChart('trend'); // sin datos: quitar el gráfico para mostrar el empty-state
    $('#trendVariation').classList.add('hidden');
    return;
  }

  // Badge de variación % vs periodo anterior
  const badge = $('#trendVariation');
  if (res.variationPct === null || res.variationPct === undefined) {
    badge.classList.add('hidden');
  } else {
    const v = res.variationPct;
    badge.classList.remove('hidden', 'variation-up', 'variation-down', 'variation-flat');
    if (v > 0) {
      badge.classList.add('variation-up');
      badge.innerHTML = `${icon('trending-up', { size: 14 })} +${v}% vs. periodo anterior`;
    } else if (v < 0) {
      badge.classList.add('variation-down');
      badge.innerHTML = `${icon('trending-down', { size: 14 })} ${v}% vs. periodo anterior`;
    } else {
      badge.classList.add('variation-flat');
      badge.innerHTML = `${icon('minus', { size: 14 })} 0% vs. periodo anterior`;
    }
  }

  // El relleno usa un gradiente calculado sobre la altura REAL del área del
  // gráfico. Al ser una función, Chart.js lo recalcula en cada render, así el
  // degradado cubre todo el alto aunque la tarjeta cambie de tamaño.
  const trendFill = (context) => {
    const { chart } = context;
    const { ctx: c, chartArea } = chart;
    // En el primer frame aún no hay chartArea; devolver undefined hace que
    // Chart.js reintente en el siguiente render (no deja un color plano fijo).
    if (!chartArea) return undefined;
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    // Paradas intermedias para que el morado conserve cuerpo en casi toda la
    // altura y solo se desvanezca cerca del fondo (replica el look previo, que
    // repartía el gradiente sobre ~260px). Sin esto, al estirarse la tarjeta el
    // degradado llegaba a transparente demasiado arriba.
    g.addColorStop(0, accentA(0.34));
    g.addColorStop(0.55, accentA(0.18));
    g.addColorStop(0.85, accentA(0.06));
    g.addColorStop(1, accentA(0));
    return g;
  };

  upsertChart('trend', ctx, {
    type: 'line',
    data: {
      labels: data.map((d) => d.day),
      datasets: [
        {
          label: 'Selección',
          data: data.map((d) => d.scans),
          borderColor: accent(),
          backgroundColor: trendFill,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
        },
        {
          label: 'Promedio cadena',
          data: data.map((d) => d.avg),
          borderColor: token('--neutral-state', '#94a3b8'),
          borderDash: [5, 4],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: cleanTooltip((items) => items[0].label),
      },
      scales: {
        x: {
          grid: { color: gridColor() },
          ticks: { color: tickColor(), callback: (v, i) => data[i]?.day.slice(5) },
        },
        y: { grid: { color: gridColor() }, ticks: { color: tickColor() }, beginAtZero: true },
      },
    },
  });
}

async function renderTop() {
  const data = await api(`/api/top-locations${qs()}`);
  const ctx = $('#topChart');

  toggleChartEmpty('#topChart', data.length === 0, {
    icon: 'store',
    title: 'Sin sedes con tráfico',
    hint: 'No hay escaneos registrados para los filtros actuales.',
  });
  if (data.length === 0) {
    destroyChart('top');
    return;
  }

  upsertChart('top', ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => shorten(d.name)),
      datasets: [
        {
          label: 'Escaneos',
          data: data.map((d) => d.scans),
          backgroundColor: accentA(0.78),
          hoverBackgroundColor: accent(),
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        // Tooltip con el nombre COMPLETO de la sede (el eje va truncado, el tooltip no).
        tooltip: cleanTooltip((items) => data[items[0].dataIndex].name),
      },
      scales: {
        x: { grid: { color: gridColor() }, ticks: { color: tickColor() }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: tickColor() } },
      },
    },
  });
}

function renderOs(k) {
  const ctx = $('#osChart');

  // Escala monocroma de marca (azul fuerte → azul medio → neutro cálido) en
  // vez de multicolor: coherente con "un solo acento".
  const segments = [
    { label: 'iOS', value: k.devices.iOS || 0, color: accent() },
    { label: 'Android', value: k.devices.Android || 0, color: accentA(0.55) },
    { label: 'Otros', value: k.devices.Other || 0, color: token('--neutral-state', '#78716c') },
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);

  // Center label
  $('#osCenterTotal').textContent = fmt(total);

  upsertChart('os', ctx, {
    type: 'doughnut',
    data: {
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: segments.map((s) => s.value),
          backgroundColor: segments.map((s) => s.color),
          borderWidth: 0,
          borderRadius: 8, // esquinas redondeadas en los arcos
          spacing: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      cutout: '74%',
      plugins: {
        legend: { display: false },
        tooltip: cleanTooltip(),
      },
    },
  });

  // Leyenda personalizada: nombre | cantidad | porcentaje
  $('#osLegend').innerHTML = segments
    .map((s) => {
      const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0';
      return `
      <div class="os-legend-item">
        <span class="os-legend-name">
          <span class="os-legend-dot" style="background:${s.color}"></span>${s.label}
        </span>
        <span class="os-legend-values">${fmt(s.value)} <span class="os-legend-pct">${pct}%</span></span>
      </div>`;
    })
    .join('');
}

async function renderHourly() {
  const data = await api(`/api/hourly${qs()}`);
  const ctx = $('#hourlyChart');

  const empty = !data.length || data.every((d) => !d.scans);
  toggleChartEmpty('#hourlyChart', empty, {
    icon: 'activity',
    title: 'Sin escaneos en este periodo',
    hint: 'Prueba ampliar el rango de fechas o quitar filtros.',
  });
  if (empty) {
    destroyChart('hourly');
    return;
  }
  // Barras MONOCROMO azul de marca; la diferenciación de turnos va en las
  // bandas de fondo (shiftBandsPlugin), no en el color de las barras.
  upsertChart('hourly', ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => `${String(d.hour).padStart(2, '0')}h`),
      datasets: [
        {
          label: 'Escaneos',
          data: data.map((d) => d.scans),
          backgroundColor: accentA(0.78),
          hoverBackgroundColor: accent(),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: cleanTooltip((items) => {
          const h = data[items[0].dataIndex].hour;
          return `${shiftOf(h).name} · ${String(h).padStart(2, '0')}:00`;
        }),
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor(), maxRotation: 0, autoSkip: true } },
        y: { grid: { color: gridColor() }, ticks: { color: tickColor() }, beginAtZero: true },
      },
    },
    plugins: [shiftBandsPlugin],
  });
}

function shorten(name) {
  return name.length > 26 ? name.slice(0, 24) + '…' : name;
}

// Paleta por canal (consistente)
const CHANNEL_COLORS = {
  WhatsApp: '#25d366',
  Instagram: '#e1306c',
  'Google Reviews': '#4285f4',
  Facebook: '#1877f2',
  TikTok: '#000000',
  YouTube: '#ff0000',
  'X (Twitter)': '#1da1f2',
  Telegram: '#229ed9',
  Linktree: '#39e09b',
  Llamada: '#0ea5e9',
  Email: '#64748b',
  'Sitio web': '#2563eb',
  Otro: '#94a3b8',
};
// Los colores de canal son de marca de terceros (reconocimiento inmediato del
// destino) → se conservan. El fallback usa el neutro del sistema.
const channelColor = (c) => CHANNEL_COLORS[c] || token('--neutral-state', '#94a3b8');

async function renderChannels() {
  const data = await api(`/api/channels${qs()}`);
  const ctx = $('#channelChart');

  const total = data.reduce((a, d) => a + d.scans, 0);

  toggleChartEmpty('#channelChart', data.length === 0, {
    icon: 'activity',
    title: 'Sin escaneos por destino',
    hint: 'No hay redirecciones registradas para los filtros actuales.',
  });
  if (data.length === 0) {
    destroyChart('channel');
    const legend = $('#channelLegend');
    if (legend) legend.innerHTML = '';
    return;
  }

  // Gradientes suaves por canal (mismo estilo que el doughnut de SO).
  const g2d = ctx.getContext('2d');
  const grads = data.map((d) => {
    const base = channelColor(d.channel);
    const g = g2d.createLinearGradient(0, 0, ctx.width || 400, 0);
    // Solo aplicamos el degradado si el color es hex de 6 dígitos; si es un
    // token rgba, usamos el color plano para no romper el canvas.
    const start = /^#[0-9a-fA-F]{6}$/.test(base) ? base + 'cc' : base;
    g.addColorStop(0, start);
    g.addColorStop(1, base);
    return g;
  });

  upsertChart('channel', ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.channel),
      datasets: [
        {
          label: 'Escaneos',
          data: data.map((d) => d.scans),
          backgroundColor: grads,
          borderRadius: 10,
          borderSkipped: false,
          barThickness: 18,
          maxBarThickness: 22,
          hoverBackgroundColor: data.map((d) => channelColor(d.channel)),
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: cleanTooltip((items) => {
          const c = data[items[0].dataIndex];
          const pct = total > 0 ? ((c.scans / total) * 100).toFixed(1) : '0.0';
          return `${c.channel} · ${pct}%`;
        }),
      },
      scales: {
        x: {
          grid: { color: gridColor(), drawBorder: false },
          border: { display: false },
          ticks: { color: tickColor(), precision: 0 },
          beginAtZero: true,
        },
        y: {
          grid: { display: false, drawBorder: false },
          border: { display: false },
          ticks: { color: tickColor(), font: { weight: '600' } },
        },
      },
    },
  });

  // Leyenda lateral: canal · cantidad · porcentaje (mismo patrón que SO)
  const legend = $('#channelLegend');
  if (legend) {
    legend.innerHTML = data.length
      ? data
          .map((d) => {
            const pct = total > 0 ? ((d.scans / total) * 100).toFixed(1) : '0.0';
            return `
        <div class="os-legend-item">
          <span class="os-legend-name">
            <span class="os-legend-dot" style="background:${channelColor(d.channel)}"></span>${d.channel}
          </span>
          <span class="os-legend-values">${fmt(d.scans)} <span class="os-legend-pct">${pct}%</span></span>
        </div>`;
          })
          .join('')
      : '<p class="text-sm text-slate-500">Sin datos en el periodo.</p>';
  }

  // Poblar el filtro de destinos (una sola vez, conservando selección).
  const sel = $('#channelFilter');
  if (sel && sel.options.length <= 1) {
    const known = Object.keys(CHANNEL_COLORS);
    for (const c of known) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    }
  }
}

// ---------------------------------------------------------------------------
// Tabla de sedes
// ---------------------------------------------------------------------------
async function loadLocations() {
  const cq = state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '';
  state.locations = await api(`/api/locations${cq}`);
  const cnt = $('#locCount');
  if (cnt) cnt.textContent = fmt(state.locations.length);
  renderComboOptions('');
}

// --- Combobox de sede con búsqueda por teclado ---------------------------
function renderComboOptions(filter) {
  const list = $('#locationOptions');
  const f = norm(filter.trim());
  const matches = state.locations.filter(
    (l) =>
      !f ||
      norm(l.name).includes(f) ||
      norm(l.city).includes(f) ||
      norm(l.companyName || '').includes(f)
  );

  const items = [
    `<div class="combo-opt" data-id="">Todas las sedes</div>`,
    ...matches
      .slice(0, 50)
      .map((l) => {
        // Para superadmin viendo todas las empresas, mostrar la empresa para
        // distinguir sedes homónimas de distintos clientes.
        const co =
          state.role === 'superadmin' && !state.companyId && l.companyName
            ? ` · ${escapeHtml(l.companyName)}`
            : '';
        return `<div class="combo-opt" data-id="${l.id}">${escapeHtml(l.name)}
             <span class="muted">· ${escapeHtml(l.city)}${co}</span></div>`;
      }),
  ];

  list.innerHTML =
    matches.length || !f
      ? items.join('')
      : '<div class="combo-empty">Sin resultados</div>';

  list.querySelectorAll('.combo-opt').forEach((opt) =>
    opt.addEventListener('click', () => {
      state.locationId = opt.dataset.id;
      $('#locationFilter').value = opt.dataset.id;
      $('#locationSearch').value = opt.dataset.id
        ? opt.textContent.replace(/\s+/g, ' ').trim()
        : '';
      closeCombo();
      renderActiveFilters();
      loadDashboard();
      if (!$('#view-executive').classList.contains('hidden')) renderBenchmark();
    })
  );
}

function openCombo() {
  renderComboOptions($('#locationSearch').value);
  $('#locationOptions').classList.remove('hidden');
}
function closeCombo() {
  $('#locationOptions').classList.add('hidden');
}

function setupCombo() {
  const input = $('#locationSearch');
  input.addEventListener('focus', openCombo);
  input.addEventListener('input', () => {
    renderComboOptions(input.value);
    $('#locationOptions').classList.remove('hidden');
  });
  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!$('#locationCombo').contains(e.target)) closeCombo();
  });
  // Enter selecciona la primera coincidencia
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = $('#locationOptions .combo-opt');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      closeCombo();
    }
  });
}

function renderLocationsTable(filter = '') {
  const body = $('#locTableBody');
  const f = norm(filter);
  const showCompany = state.role === 'superadmin' && !state.companyId;
  const rows = state.locations.filter(
    (l) =>
      !f ||
      norm(l.name).includes(f) ||
      norm(l.city).includes(f) ||
      norm(l.companyName || '').includes(f)
  );
  body.innerHTML = rows
    .map(
      (l) => `
      <tr class="data-card">
        <td class="td td-title font-medium" data-label="Sede">${escapeHtml(l.name)}${
          showCompany && l.companyName
            ? `<br><span class="text-xs text-slate-500">${escapeHtml(l.companyName)}</span>`
            : ''
        }</td>
        <td class="td text-slate-500" data-label="Marca">${escapeHtml(l.brand)}</td>
        <td class="td" data-label="Ciudad">${escapeHtml(l.city)}</td>
        <td class="td" data-label="Estado">${statusBadge(l.status)}</td>
        <td class="td text-right" data-label="Puntos NFC">${fmt(l.nfcPoints)}</td>
        <td class="td text-right font-semibold" data-label="Total Clics">${fmt(l.totalClicks)}</td>
        <td class="td td-actions text-right">
          <span class="row-actions">
            <button class="icon-btn loc-rep-btn" data-id="${l.id}" title="Reputación de Google" aria-label="Ver reputación de ${escapeHtml(l.name)}">${icon('star', { size: 15 })}</button>
            <button class="icon-btn loc-edit-btn" data-id="${l.id}" title="Editar sede" aria-label="Editar sede ${escapeHtml(l.name)}">${icon('pencil', { size: 15 })}</button>
            <button class="icon-btn danger loc-del-btn" data-id="${l.id}" title="Eliminar sede" aria-label="Eliminar sede ${escapeHtml(l.name)}">${icon('trash', { size: 15 })}</button>
          </span>
        </td>
      </tr>`
    )
    .join('');

  body.querySelectorAll('.loc-rep-btn').forEach((b) =>
    b.addEventListener('click', () => openReputation(b.dataset.id))
  );
  body.querySelectorAll('.loc-edit-btn').forEach((b) =>
    b.addEventListener('click', () => openEditLocation(b.dataset.id))
  );
  body.querySelectorAll('.loc-del-btn').forEach((b) =>
    b.addEventListener('click', () => deleteLocation(b.dataset.id))
  );
}

// ---------------------------------------------------------------------------
// Reputación de Google (histórico por sede)
// ---------------------------------------------------------------------------
let reputationLocId = null;

// Dibuja estrellas (llenas/medias/vacías) para una nota 0–5.
function starRating(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let out = '';
  for (let i = 0; i < 5; i++) {
    const filled = i < full || (i === full && half);
    out += `<span class="rep-star ${filled ? 'on' : ''}">${icon('star', { size: 16 })}</span>`;
  }
  return out;
}

async function openReputation(id) {
  reputationLocId = id;
  const m = $('#reputationModal');
  $('#repMsg').textContent = '';
  $('#repRating').value = '';
  $('#repCount').value = '';
  // Fecha por defecto = hoy (en formato YYYY-MM-DD local).
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('#repDate').value = iso;

  // El formulario de registro solo lo ve el superadmin.
  $('#repForm').classList.toggle('hidden', state.role !== 'superadmin');

  m.classList.remove('hidden');
  m.classList.add('flex');
  await loadReputation();
}

function closeReputation() {
  const m = $('#reputationModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
  destroyChart('reputation');
  reputationLocId = null;
}

async function loadReputation() {
  if (!reputationLocId) return;
  let data;
  try {
    data = await api(`/api/locations/${reputationLocId}/reputation`);
  } catch {
    $('#repLocName').textContent = 'No se pudo cargar la reputación.';
    return;
  }
  $('#repLocName').textContent = `${data.location.name} · ${data.location.city}`;

  const snaps = data.snapshots || [];
  const empty = snaps.length === 0;
  $('#repEmpty').classList.toggle('hidden', !empty);
  $('#reputationChart').style.display = empty ? 'none' : '';

  // Resumen superior
  const sum = $('#repSummary');
  if (data.summary) {
    const s = data.summary;
    const gained = s.reviewsGained;
    const gainedTxt =
      gained > 0
        ? `<span class="rep-delta up">+${gained} reseñas desde la 1ª medición</span>`
        : gained < 0
          ? `<span class="rep-delta down">${gained} reseñas</span>`
          : `<span class="rep-delta">sin cambios aún</span>`;
    sum.innerHTML = `
      <div class="rep-kpi">
        <div class="rep-kpi-stars">${starRating(s.rating)}</div>
        <div class="rep-kpi-value">${s.rating.toFixed(1)}</div>
        <div class="rep-kpi-label">Nota actual</div>
      </div>
      <div class="rep-kpi">
        <div class="rep-kpi-value">${fmt(s.reviewCount)}</div>
        <div class="rep-kpi-label">Reseñas</div>
      </div>
      <div class="rep-kpi rep-kpi-grow">
        ${gainedTxt}
        <div class="rep-kpi-label">Medido ${s.measuredOn}</div>
      </div>`;
    sum.classList.remove('hidden');
  } else {
    sum.innerHTML = '';
    sum.classList.add('hidden');
  }

  // Gráfico de evolución: línea de reseñas (eje izq) + nota (eje der)
  if (!empty) {
    const ctx = $('#reputationChart');
    upsertChart('reputation', ctx, {
      type: 'line',
      data: {
        labels: snaps.map((s) => s.measuredOn),
        datasets: [
          {
            label: 'Reseñas',
            data: snaps.map((s) => s.reviewCount),
            borderColor: accent(),
            backgroundColor: accentA(0.12),
            fill: true,
            tension: 0.35,
            yAxisID: 'y',
            pointRadius: 3,
          },
          {
            label: 'Nota',
            data: snaps.map((s) => s.rating),
            borderColor: token('--warn', '#f59e0b'),
            backgroundColor: 'transparent',
            tension: 0.35,
            yAxisID: 'y1',
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, labels: { usePointStyle: true, color: tickColor() } }, tooltip: cleanTooltip() },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor() } },
          y: {
            position: 'left',
            beginAtZero: true,
            grid: { color: gridColor() },
            ticks: { color: tickColor() },
            title: { display: true, text: 'Reseñas', color: tickColor() },
          },
          y1: {
            position: 'right',
            min: 0,
            max: 5,
            grid: { drawOnChartArea: false },
            ticks: { color: tickColor(), stepSize: 1 },
            title: { display: true, text: 'Nota', color: tickColor() },
          },
        },
      },
    });
  }

  // Historial (solo superadmin ve el bloque; permite borrar mediciones)
  if (state.role === 'superadmin') {
    const hist = $('#repHistory');
    hist.innerHTML = snaps.length
      ? `<h4 class="font-semibold text-sm mt-4 mb-2">Mediciones registradas</h4>` +
        snaps
          .slice()
          .reverse()
          .map(
            (s) => `
          <div class="rep-hist-row">
            <span>${s.measuredOn}</span>
            <span>${s.rating.toFixed(1)} ★</span>
            <span>${fmt(s.reviewCount)} reseñas</span>
            <button class="icon-btn danger rep-del-btn" data-id="${s.id}" title="Eliminar medición" aria-label="Eliminar medición del ${s.measuredOn}">${icon('trash', { size: 14 })}</button>
          </div>`
          )
          .join('')
      : '';
    hist.querySelectorAll('.rep-del-btn').forEach((b) =>
      b.addEventListener('click', () => deleteReputation(b.dataset.id))
    );
  }
}

async function saveReputation() {
  if (!reputationLocId) return;
  const msg = $('#repMsg');
  const rating = parseFloat($('#repRating').value);
  const reviewCount = parseInt($('#repCount').value, 10);
  const measuredOn = $('#repDate').value;

  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    msg.textContent = 'La nota debe estar entre 0 y 5.';
    msg.style.color = '#dc2626';
    return;
  }
  if (!Number.isInteger(reviewCount) || reviewCount < 0) {
    msg.textContent = 'El número de reseñas debe ser un entero ≥ 0.';
    msg.style.color = '#dc2626';
    return;
  }

  const res = await fetch(`/api/locations/${reputationLocId}/reputation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, reviewCount, measuredOn }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al guardar.';
    msg.style.color = '#dc2626';
    return;
  }
  $('#repRating').value = '';
  $('#repCount').value = '';
  toast('Medición registrada');
  await loadReputation();
}

async function deleteReputation(snapId) {
  if (!reputationLocId) return;
  const ok = await confirmDialog({
    title: 'Eliminar medición',
    message: 'Se eliminará esta medición del histórico. ¿Continuar?',
    confirmText: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  const res = await fetch(`/api/locations/${reputationLocId}/reputation/${snapId}`, { method: 'DELETE' });
  if (!res.ok) {
    toast('No se pudo eliminar la medición.', false);
    return;
  }
  toast('Medición eliminada');
  await loadReputation();
}

let editingLocationId = null;

function openEditLocation(id) {
  const l = state.locations.find((x) => x.id === id);
  if (!l) return;
  editingLocationId = id;
  $('#editLocName').value = l.name;
  $('#editLocBrand').value = l.brand;
  $('#editLocCity').value = l.city;
  $('#editLocStatus').value = l.status;
  $('#editLocMsg').textContent = '';
  const m = $('#editLocationModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeEditLocation() {
  const m = $('#editLocationModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
  editingLocationId = null;
}
async function saveEditLocation() {
  if (!editingLocationId) return;
  const body = {
    name: $('#editLocName').value.trim(),
    brand: $('#editLocBrand').value.trim(),
    city: $('#editLocCity').value.trim(),
    status: $('#editLocStatus').value,
  };
  const msg = $('#editLocMsg');
  if (!body.name || !body.city) {
    msg.textContent = 'Nombre y ciudad son obligatorios.';
    msg.style.color = '#dc2626';
    return;
  }
  const res = await fetch(`/api/locations/${editingLocationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al guardar.';
    msg.style.color = '#dc2626';
    return;
  }
  closeEditLocation();
  await Promise.all([loadLocations(), loadDevices()]);
  renderLocationsTable($('#locSearch').value);
  toast('Sede actualizada');
}
async function deleteLocation(id) {
  const l = state.locations.find((x) => x.id === id);
  const name = l ? l.name : 'esta sede';
  const message =
    l && l.nfcPoints > 0
      ? `Se eliminará "${name}" junto con sus ${l.nfcPoints} punto(s) NFC y todos sus escaneos. Esta acción no se puede deshacer.`
      : `Se eliminará "${name}". Esta acción no se puede deshacer.`;
  const ok = await confirmDialog({
    title: 'Eliminar sede',
    message,
    confirmText: 'Eliminar',
    danger: true,
  });
  if (!ok) return;

  const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    toast('No se pudo eliminar la sede.', false);
    return;
  }
  // Si el modal de edición estaba abierto sobre esta sede, cerrarlo.
  if (editingLocationId === id) closeEditLocation();
  await Promise.all([loadLocations(), loadDevices()]);
  renderLocationsTable($('#locSearch').value);
  toast('Sede eliminada');
}

// ---------------------------------------------------------------------------
// Tabla de dispositivos
// ---------------------------------------------------------------------------
async function loadDevices() {
  const cq = state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '';
  state.devices = await api(`/api/devices${cq}`);
}

function renderDevicesTable(filter = '') {
  const body = $('#devTableBody');
  const f = norm(filter);
  const rows = state.devices.filter(
    (d) =>
      !f ||
      norm(d.location_name).includes(f) ||
      norm(d.label).includes(f)
  );

  // Agrupar por sede conservando el orden de aparición.
  const groups = [];
  const byLoc = new Map();
  for (const d of rows) {
    if (!byLoc.has(d.location_id)) {
      const g = {
        locationId: d.location_id,
        name: d.location_name,
        city: d.location_city,
        devices: [],
      };
      byLoc.set(d.location_id, g);
      groups.push(g);
    }
    byLoc.get(d.location_id).devices.push(d);
  }

  const deviceRow = (d, child) => `
    <tr class="data-card ${child ? 'device-child-row' : ''}">
      <td class="td td-title font-medium" data-label="Sede">${
        child
          ? `<span class="text-xs text-slate-500 section-title-icon">${icon('corner-down-right', { size: 13 })} ${escapeHtml(d.label)}</span>`
          : `${escapeHtml(d.location_name)}<br><span class="text-xs text-slate-500">${escapeHtml(d.location_city)}</span>`
      }</td>
      <td class="td" data-label="Punto">${escapeHtml(d.label)}${
        d.mode === 'survey'
          ? ` <span class="tpl-badge-survey">${icon('star', { size: 11 })} Encuesta</span>`
          : ''
      }</td>
      <td class="td font-mono text-xs max-w-xs truncate" data-label="Target URL" title="${escapeHtml(d.target_url)}">${
        d.mode === 'survey'
          ? '<span class="text-slate-400">Encuesta interna</span>'
          : escapeHtml(d.target_url)
      }</td>
      <td class="td" data-label="Estado">${statusBadge(d.status)}</td>
      <td class="td td-actions text-right">
        <span class="row-actions">
          ${
            state.role === 'superadmin'
              ? `<button class="icon-btn trans-btn ${d.transition ? 'active' : ''}" data-id="${d.id}" data-on="${d.transition ? '1' : '0'}" title="${d.transition ? 'Pantalla de carga: ACTIVADA' : 'Pantalla de carga: desactivada'}" aria-label="Alternar pantalla de carga de ${escapeHtml(d.label)}">${icon('activity', { size: 15 })}</button>`
              : ''
          }
          <button class="icon-btn qr-btn" data-id="${d.id}" title="Ver código QR" aria-label="Ver código QR de ${escapeHtml(d.label)}">${icon('qr', { size: 15 })}</button>
          <button class="btn-primary text-xs edit-btn" data-id="${d.id}" aria-label="Editar destino de ${escapeHtml(d.label)}">Editar</button>
        </span>
      </td>
    </tr>`;

  let html = '';
  for (const g of groups) {
    if (g.devices.length === 1) {
      // Sede con un solo punto: se muestra tal cual.
      html += deviceRow(g.devices[0], false);
    } else {
      // Sede con varios puntos: fila cabecera expandible + hijos.
      const open = state.expanded.has(g.locationId);
      html += `
        <tr class="data-card loc-group-row" data-loc="${g.locationId}">
          <td class="td td-title font-medium" data-label="Sede">
            <span class="expand-caret ${open ? 'open' : ''}">${icon('chevron-right', { size: 16 })}</span>
            ${escapeHtml(g.name)}<br>
            <span class="text-xs text-slate-500" style="margin-left:1.5rem">${escapeHtml(g.city)}</span>
          </td>
          <td class="td text-slate-500" data-label="Punto">${g.devices.length} puntos NFC</td>
          <td class="td text-slate-400 text-xs" data-label="Target URL">—</td>
          <td class="td" data-label="Estado">—</td>
          <td class="td td-actions text-right text-xs text-slate-400">Desplegar</td>
        </tr>`;
      if (open) {
        html += g.devices.map((d) => deviceRow(d, true)).join('');
      }
    }
  }

  body.innerHTML = html || '<tr><td class="td text-slate-500" colspan="5">Sin dispositivos.</td></tr>';

  // Toggle de expansión por sede
  body.querySelectorAll('.loc-group-row').forEach((row) =>
    row.addEventListener('click', () => {
      const id = row.dataset.loc;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderDevicesTable(filter);
    })
  );

  // Botones de edición
  body.querySelectorAll('.edit-btn').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openEdit(b.dataset.id);
    })
  );

  // Botones de QR
  body.querySelectorAll('.qr-btn').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openQr(b.dataset.id);
    })
  );

  // Toggle de pantalla de transición (solo superadmin)
  body.querySelectorAll('.trans-btn').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nuevo = b.dataset.on !== '1';
      const res = await fetch(`/api/devices/${b.dataset.id}/transition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ transition: nuevo }),
      });
      if (!res.ok) {
        toast('No se pudo cambiar la pantalla de carga.', false);
        return;
      }
      // Reflejar en memoria y re-render.
      const dev = state.devices.find((x) => x.id === b.dataset.id);
      if (dev) dev.transition = nuevo;
      renderDevicesTable(filter);
      toast(nuevo ? 'Pantalla de carga activada' : 'Pantalla de carga desactivada');
    })
  );
}

// ---------------------------------------------------------------------------
// Cambio masivo de destino (campañas)
// ---------------------------------------------------------------------------
async function openBulk() {
  // Poblar marcas
  const brands = await api('/api/brands');
  $('#bulkBrand').innerHTML = brands
    .map((b) => `<option value="${escapeHtml(b.brand)}">${escapeHtml(b.brand)} (${b.locations})</option>`)
    .join('');
  // Poblar sedes
  $('#bulkLocation').innerHTML = state.locations
    .map((l) => `<option value="${l.id}">${escapeHtml(l.name)} · ${escapeHtml(l.city)}</option>`)
    .join('');

  $('#bulkScope').value = 'all';
  $('#bulkBrandWrap').classList.add('hidden');
  $('#bulkLocationWrap').classList.add('hidden');
  $('#bulkUrl').value = '';
  $('#bulkMsg').textContent = '';
  await refreshBulkPreview();
  await renderBulkHistory();

  const m = $('#bulkModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeBulk() {
  const m = $('#bulkModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
function bulkScopeValue() {
  const scope = $('#bulkScope').value;
  let value = '';
  if (scope === 'brand') value = $('#bulkBrand').value;
  else if (scope === 'location') value = $('#bulkLocation').value;
  return { scope, value };
}
async function refreshBulkPreview() {
  const { scope, value } = bulkScopeValue();
  try {
    const p = new URLSearchParams({ scope });
    if (value) p.set('value', value);
    const res = await api(`/api/devices/bulk-preview?${p.toString()}`);
    $('#bulkCount').textContent = fmt(res.affected);
  } catch {
    $('#bulkCount').textContent = '—';
  }
}
async function applyBulk() {
  const { scope, value } = bulkScopeValue();
  const target_url = $('#bulkUrl').value.trim();
  const msg = $('#bulkMsg');
  try {
    new URL(target_url);
  } catch {
    msg.style.color = '#dc2626';
    msg.textContent = 'URL inválida.';
    return;
  }
  const count = $('#bulkCount').textContent;
  const okBulk = await confirmDialog({
    title: 'Cambio masivo de destino',
    message: `Vas a cambiar el destino de ${count} dispositivos. Esta acción se puede revertir después.`,
    confirmText: 'Aplicar cambio',
  });
  if (!okBulk) return;

  const res = await fetch('/api/devices/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ scope, value, target_url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.style.color = '#dc2626';
    msg.textContent = err.error || 'Error al aplicar el cambio.';
    return;
  }
  const data = await res.json();
  msg.textContent = '';
  await Promise.all([loadDevices(), renderBulkHistory()]);
  renderDevicesTable($('#devSearch').value);
  toast(`Campaña aplicada a ${data.affected} dispositivos`);
}
async function renderBulkHistory() {
  const rows = await api('/api/bulk-updates');
  const box = $('#bulkHistory');
  if (!rows.length) {
    box.innerHTML = '<p class="text-sm text-slate-500">Sin campañas registradas.</p>';
    return;
  }
  box.innerHTML = rows
    .map((r) => {
      const date = new Date(r.created_at).toLocaleString('es-CO');
      const action = r.reverted
        ? '<span class="reverted-tag">Revertida</span>'
        : `<button class="revert-btn" data-id="${r.id}">Revertir</button>`;
      return `
      <div class="bulk-hist-item">
        <div style="min-width:0">
          <div style="font-weight:600">${escapeHtml(r.scope_label)} · ${r.affected} disp.</div>
          <div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.new_url)}</div>
          <div class="muted">${date}</div>
        </div>
        ${action}
      </div>`;
    })
    .join('');

  box.querySelectorAll('.revert-btn').forEach((b) =>
    b.addEventListener('click', async () => {
      const okRevert = await confirmDialog({
        title: 'Revertir campaña',
        message: 'Se restaurarán los destinos anteriores de los dispositivos afectados por esta campaña.',
        confirmText: 'Revertir',
      });
      if (!okRevert) return;
      const res = await fetch(`/api/bulk-updates/${b.dataset.id}/revert`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        toast('No se pudo revertir.', false);
        return;
      }
      const data = await res.json();
      await Promise.all([loadDevices(), renderBulkHistory()]);
      renderDevicesTable($('#devSearch').value);
      toast(`Revertido: ${data.restored} dispositivos restaurados`);
    })
  );
}

// ---------------------------------------------------------------------------
// Generador de QR dinámico
// ---------------------------------------------------------------------------
function openQr(id) {
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  const url = `${location.origin}/r/${d.code || d.id}`;
  $('#qrLabel').textContent = `${d.location_name} · ${d.label}`;
  $('#qrUrl').textContent = url;

  // Generar QR (nivel de corrección 'M', tamaño de celda para nitidez)
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const box = $('#qrCanvas');
  box.innerHTML = qr.createImgTag(6, 8); // (cellSize, margin)

  const m = $('#qrModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeQr() {
  const m = $('#qrModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
function downloadQr() {
  const img = $('#qrCanvas img');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'qr-nfcloud.png';
  a.click();
}

function statusBadge(status) {
  return status === 'active'
    ? '<span class="badge-active"><span class="dot"></span> activo</span>'
    : '<span class="badge-inactive"><span class="dot"></span> inactivo</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// ---------------------------------------------------------------------------
// Estados vacíos: muestra un mensaje cuando una gráfica no tiene datos.
// Oculta el <canvas> indicado y pinta un placeholder en su lugar; al volver a
// haber datos, remueve el placeholder y muestra el canvas de nuevo.
// ---------------------------------------------------------------------------
function toggleChartEmpty(canvasSel, isEmpty, opts = {}) {
  const canvas = $(canvasSel);
  if (!canvas) return;
  const parent = canvas.parentElement;
  const existing = parent.querySelector('.empty-state');
  if (isEmpty) {
    canvas.classList.add('chart-hidden');
    if (!existing) {
      const el = document.createElement('div');
      el.className = 'empty-state';
      el.innerHTML = `
        <span class="empty-icon">${icon(opts.icon || 'bar-chart-3', { size: 28 })}</span>
        <span class="empty-title">${escapeHtml(opts.title || 'Sin datos en este periodo')}</span>
        ${opts.hint ? `<span class="empty-hint">${escapeHtml(opts.hint)}</span>` : ''}`;
      parent.appendChild(el);
    }
  } else {
    canvas.classList.remove('chart-hidden');
    if (existing) existing.remove();
  }
}

// ---------------------------------------------------------------------------
// Chips de filtros activos: hace visible qué filtros (sede/fecha/canal) están
// aplicados y permite quitarlos de un clic. Solo se muestran en vistas de
// analítica (en gestión los filtros globales están ocultos).
// ---------------------------------------------------------------------------
function renderActiveFilters() {
  const bar = $('#activeFilters');
  if (!bar) return;

  // Si los filtros globales están ocultos (vista de gestión), no mostrar chips.
  const af = $('#analyticsFilters');
  const inAnalyticsView = af && !af.classList.contains('hidden');

  const chips = [];
  if (state.locationId) {
    const loc = state.locations.find((l) => l.id === state.locationId);
    const name = loc ? loc.name : 'Sede';
    chips.push({ key: 'Sede', label: name, type: 'location' });
  }
  if (state.channel) chips.push({ key: 'Canal', label: state.channel, type: 'channel' });
  if (state.from || state.to) {
    const label = `${state.from || '…'} → ${state.to || '…'}`;
    chips.push({ key: 'Fechas', label, type: 'dates' });
  }

  if (!inAnalyticsView || chips.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML =
    `<span class="af-label">Filtros activos</span>` +
    chips
      .map(
        (c) => `
      <span class="filter-chip">
        <span class="chip-key">${escapeHtml(c.key)}:</span> ${escapeHtml(c.label)}
        <button class="chip-x" data-type="${c.type}" title="Quitar filtro" aria-label="Quitar filtro ${escapeHtml(c.key)}">${icon('x', { size: 12 })}</button>
      </span>`
      )
      .join('') +
    `<button class="af-clear" id="clearAllFilters">Limpiar todo</button>`;

  bar.querySelectorAll('.chip-x').forEach((btn) =>
    btn.addEventListener('click', () => clearFilter(btn.dataset.type))
  );
  const clearAll = $('#clearAllFilters');
  if (clearAll) clearAll.addEventListener('click', () => clearFilter('all'));
}

// Quita un filtro concreto (o todos) y recarga la vista analítica visible.
function clearFilter(type) {
  if (type === 'location' || type === 'all') {
    state.locationId = '';
    const lf = $('#locationFilter');
    if (lf) lf.value = '';
    const ls = $('#locationSearch');
    if (ls) ls.value = '';
  }
  if (type === 'channel' || type === 'all') {
    state.channel = '';
    const cf = $('#channelFilter');
    if (cf) cf.value = '';
  }
  if (type === 'dates' || type === 'all') {
    state.from = '';
    state.to = '';
    const fd = $('#fromDate');
    if (fd) fd.value = '';
    const td = $('#toDate');
    if (td) td.value = '';
  }

  renderActiveFilters();
  if (!$('#view-dashboard').classList.contains('hidden')) loadDashboard();
  else if (!$('#view-executive').classList.contains('hidden')) renderBenchmark();
  else if (!$('#view-operations').classList.contains('hidden')) loadOperations();
}

// ---------------------------------------------------------------------------
// Calificación (Función 1): resultados por aspecto + administración de plantillas
// ---------------------------------------------------------------------------
async function loadSurvey() {
  let data;
  try {
    data = await api(`/api/survey-results${qs()}`);
  } catch {
    return;
  }

  // KPIs
  $('#svTotal').textContent = fmt(data.total || 0);
  $('#svAvg').textContent = data.globalAvg !== null && data.globalAvg !== undefined
    ? data.globalAvg.toFixed(2)
    : '—';
  $('#svBest').textContent = data.best ? data.best.label : '—';
  $('#svBestVal').textContent = data.best ? `Promedio ${data.best.avg.toFixed(2)}` : '—';
  $('#svWorst').textContent = data.worst ? data.worst.label : '—';
  $('#svWorstVal').textContent = data.worst ? `Promedio ${data.worst.avg.toFixed(2)}` : '—';

  // Gráfico de barras MONOCROMO azul: promedio por aspecto.
  const aspects = data.aspects || [];
  const empty = aspects.length === 0;
  $('#svEmpty').classList.toggle('hidden', !empty);
  const aspCanvas = $('#svAspectsChart');
  const aspWrap = aspCanvas.closest('.survey-chart-wrap');
  if (empty) {
    destroyChart('survey-aspects');
    if (aspWrap) aspWrap.style.display = 'none';
  } else {
    if (aspWrap) aspWrap.style.display = '';
    upsertChart('survey-aspects', aspCanvas, {
      type: 'bar',
      data: {
        labels: aspects.map((a) => a.label),
        datasets: [
          {
            label: 'Promedio',
            data: aspects.map((a) => a.avg),
            backgroundColor: accentA(0.78),
            hoverBackgroundColor: accent(),
            borderColor: accent(),
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: cleanTooltip((items) => aspects[items[0].dataIndex].label),
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor() } },
          y: {
            grid: { color: gridColor() },
            ticks: { color: tickColor() },
            beginAtZero: true,
            suggestedMax: 5,
          },
        },
      },
    });
  }

  // Evolución mensual del promedio global (línea azul), si hay serie.
  const trend = data.trend || [];
  const trendCard = $('#svTrendCard');
  if (trend.length > 1) {
    trendCard.classList.remove('hidden');
    const ctx = $('#svTrendChart');
    upsertChart('survey-trend', ctx, {
      type: 'line',
      data: {
        labels: trend.map((t) => t.month),
        datasets: [
          {
            label: 'Promedio',
            data: trend.map((t) => t.avg),
            borderColor: accent(),
            backgroundColor: accentA(0.12),
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: cleanTooltip() },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor() } },
          y: {
            grid: { color: gridColor() },
            ticks: { color: tickColor() },
            beginAtZero: true,
            suggestedMax: 5,
          },
        },
      },
    });
  } else {
    trendCard.classList.add('hidden');
    destroyChart('survey-trend');
  }

  await renderTemplatesList();
}

// Lista de plantillas de encuesta (administración dentro de la vista).
async function renderTemplatesList() {
  const cont = $('#svTemplatesList');
  if (!cont) return;
  let templates;
  try {
    const cq = state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '';
    templates = await api(`/api/survey-templates${cq}`);
  } catch {
    cont.innerHTML = '<p class="text-sm text-slate-500">No se pudieron cargar las plantillas.</p>';
    return;
  }
  state.surveyTemplates = templates;

  if (!templates.length) {
    cont.innerHTML =
      '<p class="text-sm text-slate-500">Aún no hay plantillas. Crea una para activar el modo encuesta en tus puntos.</p>';
    return;
  }

  cont.innerHTML = templates
    .map((t) => {
      const aspectos = (t.aspects || []).map((a) => escapeHtml(a.label)).join(' · ');
      const estado =
        t.status === 'active'
          ? '<span class="state-badge state-active"><span class="dot"></span> Activa</span>'
          : '<span class="badge-inactive">inactiva</span>';
      const empresa = state.role === 'superadmin' && t.companyName
        ? ` · ${escapeHtml(t.companyName)}`
        : '';
      return `
      <div class="tpl-row">
        <div class="tpl-meta">
          <div class="tpl-name">${escapeHtml(t.name)} ${estado}</div>
          <div class="tpl-sub">${t.aspects ? t.aspects.length : 0} aspectos · ${t.responses} respuestas${empresa}</div>
          <div class="tpl-sub">${aspectos}</div>
        </div>
        <button class="btn-primary text-xs tpl-edit" data-id="${t.id}">Editar</button>
      </div>`;
    })
    .join('');

  cont.querySelectorAll('.tpl-edit').forEach((b) =>
    b.addEventListener('click', () => openTemplateModal(b.dataset.id))
  );
}

// --- Modal de plantilla (crear/editar) -------------------------------------
let editingTemplateId = null;

function tplAspectRow(value = '', id = '') {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 tpl-aspect-row';
  row.dataset.aspectId = id || '';
  row.innerHTML = `
    <input type="text" class="input w-full tpl-aspect-input" placeholder="Ej: Atención" value="${escapeHtml(value)}" />
    <button type="button" class="btn-ghost btn-ghost-danger tpl-aspect-del" aria-label="Quitar aspecto">${icon('x', { size: 16 })}</button>`;
  row.querySelector('.tpl-aspect-del').addEventListener('click', () => row.remove());
  return row;
}

function openTemplateModal(id) {
  editingTemplateId = id || null;
  const msg = $('#tplMsg');
  msg.textContent = '';
  const aspectsBox = $('#tplAspects');
  aspectsBox.innerHTML = '';

  // Selector de empresa: solo superadmin al crear (no se cambia al editar).
  const wrap = $('#tplCompanyWrap');
  const sel = $('#tplCompany');
  if (!id && state.role === 'superadmin') {
    sel.innerHTML = (state.companies || [])
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    if (state.companyId) sel.value = state.companyId;
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }

  if (id) {
    const t = (state.surveyTemplates || []).find((x) => x.id === id);
    $('#templateModalTitle').textContent = 'Editar plantilla';
    $('#tplName').value = t ? t.name : '';
    (t && t.aspects ? t.aspects : []).forEach((a) =>
      aspectsBox.appendChild(tplAspectRow(a.label, a.id))
    );
    $('#tplDelete').classList.remove('hidden');
  } else {
    $('#templateModalTitle').textContent = 'Nueva plantilla';
    $('#tplName').value = '';
    aspectsBox.appendChild(tplAspectRow());
    $('#tplDelete').classList.add('hidden');
  }

  const m = $('#templateModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}

function closeTemplateModal() {
  const m = $('#templateModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
  editingTemplateId = null;
}

async function saveTemplate() {
  const name = $('#tplName').value.trim();
  const msg = $('#tplMsg');
  const rows = Array.prototype.slice.call(document.querySelectorAll('#tplAspects .tpl-aspect-row'));
  const aspects = rows
    .map((r) => ({
      id: r.dataset.aspectId || undefined,
      label: r.querySelector('.tpl-aspect-input').value.trim(),
    }))
    .filter((a) => a.label);

  if (!name) {
    msg.textContent = 'El nombre es obligatorio.';
    msg.style.color = '#dc2626';
    return;
  }
  if (!aspects.length) {
    msg.textContent = 'Añade al menos un aspecto.';
    msg.style.color = '#dc2626';
    return;
  }

  let res;
  if (editingTemplateId) {
    res = await fetch(`/api/survey-templates/${editingTemplateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name, aspects }),
    });
  } else {
    const payload = { name, aspects: aspects.map((a) => a.label) };
    if (state.role === 'superadmin') {
      const company_id = $('#tplCompany').value;
      if (!company_id) {
        msg.textContent = 'Selecciona la empresa de la plantilla.';
        msg.style.color = '#dc2626';
        return;
      }
      payload.company_id = company_id;
    }
    res = await fetch('/api/survey-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al guardar.';
    msg.style.color = '#dc2626';
    return;
  }

  closeTemplateModal();
  await renderTemplatesList();
  toast('Plantilla guardada');
}

async function deleteTemplate() {
  if (!editingTemplateId) return;
  const ok = await confirmDialog({
    title: 'Eliminar plantilla',
    message:
      'Se eliminarán la plantilla, sus aspectos y TODAS sus respuestas. Los puntos que la usaban quedarán sin encuesta. Esta acción no se puede deshacer.',
    confirmText: 'Eliminar',
    danger: true,
  });
  if (!ok) return;
  const res = await fetch(`/api/survey-templates/${editingTemplateId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    toast('No se pudo eliminar la plantilla.', false);
    return;
  }
  closeTemplateModal();
  await renderTemplatesList();
  toast('Plantilla eliminada');
}

function setupSurveyModals() {
  $('#newTemplateBtn').addEventListener('click', () => openTemplateModal(null));
  $('#closeTemplateModal').addEventListener('click', closeTemplateModal);
  $('#cancelTemplate').addEventListener('click', closeTemplateModal);
  $('#saveTemplate').addEventListener('click', saveTemplate);
  $('#tplDelete').addEventListener('click', deleteTemplate);
  $('#tplAddAspect').addEventListener('click', () =>
    $('#tplAspects').appendChild(tplAspectRow())
  );
  $('#templateModal').addEventListener('click', (e) => {
    if (e.target.id === 'templateModal') closeTemplateModal();
  });
}

// ---------------------------------------------------------------------------
// Modal de edición
// ---------------------------------------------------------------------------
let editingId = null;

// Objetivo del punto en edición: 'redirect' | 'survey'. Excluyente.
let editMode = 'redirect';

// Aplica visualmente la rama activa (URL vs. selector de plantilla).
function setEditMode(mode) {
  editMode = mode === 'survey' ? 'survey' : 'redirect';
  $('#editModeRedirect').classList.toggle('active', editMode === 'redirect');
  $('#editModeRedirect').setAttribute('aria-checked', String(editMode === 'redirect'));
  $('#editModeSurvey').classList.toggle('active', editMode === 'survey');
  $('#editModeSurvey').setAttribute('aria-checked', String(editMode === 'survey'));
  $('#editRedirectWrap').classList.toggle('hidden', editMode !== 'redirect');
  $('#editSurveyWrap').classList.toggle('hidden', editMode !== 'survey');
}

async function openEdit(id) {
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  editingId = id;
  $('#editDeviceLabel').textContent = `${d.location_name} · ${d.label}`;
  $('#editRedirectUrl').textContent = `${location.origin}/r/${d.code || d.id}`;
  $('#editTargetUrl').value = d.target_url;
  $('#editStatus').value = d.status;
  $('#editMsg').textContent = '';

  // Poblar el selector de plantillas con las de la empresa de la sede del punto.
  const sel = $('#editSurveyTemplate');
  sel.innerHTML = '<option value="">Cargando…</option>';
  setEditMode(d.mode === 'survey' ? 'survey' : 'redirect');
  const m = $('#editModal');
  m.classList.remove('hidden');
  m.classList.add('flex');

  try {
    const cq = d.company_id ? `?companyId=${encodeURIComponent(d.company_id)}` : '';
    const templates = await api(`/api/survey-templates${cq}`);
    const activos = templates.filter((t) => t.status === 'active');
    sel.innerHTML = activos.length
      ? activos.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
      : '<option value="">No hay plantillas activas</option>';
    if (d.survey_template_id) sel.value = d.survey_template_id;
  } catch {
    sel.innerHTML = '<option value="">No se pudieron cargar las plantillas</option>';
  }
}

function closeEdit() {
  const m = $('#editModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const status = $('#editStatus').value;
  const msg = $('#editMsg');

  let payload;
  if (editMode === 'survey') {
    const survey_template_id = $('#editSurveyTemplate').value;
    if (!survey_template_id) {
      msg.textContent = 'Elige una plantilla de encuesta.';
      msg.style.color = '#dc2626';
      return;
    }
    // No se envía target_url: queda intacta en la BD al pasar a encuesta.
    payload = { mode: 'survey', survey_template_id, status };
  } else {
    const target_url = $('#editTargetUrl').value.trim();
    try {
      new URL(target_url);
    } catch {
      msg.textContent = 'URL inválida.';
      msg.style.color = '#dc2626';
      return;
    }
    payload = { mode: 'redirect', target_url, status };
  }

  const res = await fetch(`/api/devices/${editingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al guardar.';
    msg.style.color = '#dc2626';
    return;
  }

  const data = await res.json().catch(() => ({}));
  // Actualizar estado local con lo que devolvió el servidor.
  const d = state.devices.find((x) => x.id === editingId);
  if (d && data.device) {
    d.target_url = data.device.target_url;
    d.status = data.device.status;
    d.mode = data.device.mode;
    d.survey_template_id = data.device.survey_template_id;
  }
  closeEdit();
  renderDevicesTable($('#devSearch').value);
  toast(editMode === 'survey' ? 'Punto en modo encuesta' : 'Destino actualizado en tiempo real');
}

// ---------------------------------------------------------------------------
// Módulo ejecutivo: benchmarking (Top3 vs Bottom3) + comparación A/B
// ---------------------------------------------------------------------------
async function loadExecutive() {
  await renderBenchmark();
  populateCompareSelectors();
}

async function renderBenchmark() {
  // El ranking compara todas las sedes del alcance; se ignora la sede
  // seleccionada en el filtro global para no colapsar el Top 3 a una sola.
  const b = await api(`/api/benchmark${qs({ ignoreLocation: true })}`);

  // Gap de rendimiento
  const gapVal = $('#gapValue');
  const gapDet = $('#gapDetail');
  if (b.gapPct === null || b.gapPct === undefined) {
    gapVal.textContent = b.totalLocations > 0 ? '∞' : '—';
    gapDet.textContent =
      b.totalLocations > 0
        ? 'La sede de menor rendimiento no tuvo escaneos en el periodo'
        : 'Sin datos en el periodo';
  } else {
    gapVal.textContent = `${fmt(b.gapPct)}%`;
    gapDet.textContent = `El líder tiene ${fmt(b.leaderScans)} escaneos vs ${fmt(
      b.laggardScans
    )} del más bajo`;
  }

  renderRankList('#leadersList', b.top3, 'leader');
  renderRankList('#laggardsList', b.bottom3, 'laggard');
}

function renderRankList(sel, items, kind) {
  const box = $(sel);
  if (!items || !items.length) {
    box.innerHTML = '<p class="text-sm text-slate-500">Sin datos en el periodo.</p>';
    return;
  }
  box.innerHTML = items
    .map((it, i) => {
      // El líder (posición 1 del bloque de líderes) lleva trofeo; el resto, su número.
      const badgeInner =
        kind === 'leader' && i === 0 ? icon('trophy', { size: 15 }) : `${i + 1}`;
      const badgeCls = kind === 'leader' && i === 0 ? 'rank-badge rank-badge-gold' : 'rank-badge';
      return `
      <div class="rank-row">
        <div class="rank-left">
          <span class="${badgeCls}">${badgeInner}</span>
          <div class="rank-name">
            <div class="rank-title" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
            <div class="rank-sub">${escapeHtml(it.city)}</div>
          </div>
        </div>
        <div class="rank-scans">${fmt(it.scans)}</div>
      </div>`;
    })
    .join('');
}

function populateCompareSelectors(force = false) {
  const optsHtml = state.locations
    .map((l) => `<option value="${l.id}">${escapeHtml(l.name)} · ${escapeHtml(l.city)}</option>`)
    .join('');
  const a = $('#compareA');
  const bSel = $('#compareB');
  // Repoblar si se fuerza (cambio de empresa) o si aún no hay opciones.
  if (force || a.options.length === 0) {
    a.innerHTML = optsHtml;
    bSel.innerHTML = optsHtml;
    if (state.locations.length > 1) {
      a.selectedIndex = 0;
      bSel.selectedIndex = 1;
    }
  }
}

async function runCompare() {
  const a = $('#compareA').value;
  const b = $('#compareB').value;
  if (!a || !b) return;
  if (a === b) {
    toast('Selecciona dos sedes diferentes.', false);
    return;
  }

  const params = new URLSearchParams({ a, b });
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  const res = await api(`/api/compare?${params.toString()}`);

  const nameA = res.a.location ? res.a.location.name : 'Sede A';
  const nameB = res.b.location ? res.b.location.name : 'Sede B';
  $('#compareLabelA').textContent = nameA;
  $('#compareLabelB').textContent = nameB;
  $('#compareTotalA').textContent = `${fmt(res.a.totals)} escaneos`;
  $('#compareTotalB').textContent = `${fmt(res.b.totals)} escaneos`;

  const ctx = $('#compareChart');
  destroyChart('compare');
  state.charts.compare = new Chart(ctx, {
    type: 'line',
    data: {
      labels: res.days.map((d) => d.slice(5)),
      datasets: [
        {
          label: nameA,
          data: res.a.data,
          borderColor: accent(),
          backgroundColor: accentA(0.1),
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
          fill: false,
        },
        {
          label: nameB,
          data: res.b.data,
          borderColor: token('--ok', '#22c55e'),
          backgroundColor: 'rgba(34,197,94,0.12)',
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: cleanTooltip() },
      scales: {
        x: { grid: { color: gridColor() }, ticks: { color: tickColor() } },
        y: { grid: { color: gridColor() }, ticks: { color: tickColor() }, beginAtZero: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Módulo de salud operativa
// ---------------------------------------------------------------------------
async function loadOperations() {
  const cq = state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '';
  const res = await api(`/api/health-status${cq}`);
  state.opItems = res.items || [];
  $('#opActive').textContent = fmt(res.summary.active);
  $('#opLow').textContent = fmt(res.summary.low);
  $('#opAlert').textContent = fmt(res.summary.alert);
  renderOpTable();
}

// ---------------------------------------------------------------------------
// Módulo admin: empresas y usuarios (solo superadmin)
// ---------------------------------------------------------------------------
async function loadAdmin() {
  try {
    const [companies, users] = await Promise.all([
      api('/api/companies'),
      api('/api/users'),
    ]);
    state.companies = companies;

    const cbody = $('#companyTableBody');
    cbody.innerHTML = companies.length
      ? companies
          .map((c) => {
            const active = c.status !== 'inactive';
            const badge = active
              ? '<span class="state-badge state-active"><span class="dot"></span> Activa</span>'
              : '<span class="state-badge state-alert"><span class="dot"></span> Suspendida</span>';
            const btn = active
              ? `<button class="btn-ghost text-xs sub-toggle" data-id="${c.id}" data-next="inactive" style="border:1px solid var(--card-border)">Suspender</button>`
              : `<button class="btn-primary text-xs sub-toggle" data-id="${c.id}" data-next="active">Activar</button>`;
            return `
        <tr>
          <td class="td font-medium">${escapeHtml(c.name)}</td>
          <td class="td">${badge}</td>
          <td class="td text-right">${fmt(c.locations ?? 0)}</td>
          <td class="td text-right">${btn}</td>
        </tr>`;
          })
          .join('')
      : '<tr><td class="td text-slate-500" colspan="4">Sin empresas.</td></tr>';

    cbody.querySelectorAll('.sub-toggle').forEach((b) =>
      b.addEventListener('click', () => toggleSubscription(b.dataset.id, b.dataset.next))
    );

    const ubody = $('#userTableBody');
    ubody.innerHTML = users.length
      ? users
          .map(
            (u) => `
        <tr>
          <td class="td font-medium">${escapeHtml(u.username)}</td>
          <td class="td text-slate-500">${escapeHtml(u.role)}</td>
          <td class="td">${escapeHtml(u.company_name || '—')}</td>
        </tr>`
          )
          .join('')
      : '<tr><td class="td text-slate-500" colspan="3">Sin usuarios de cliente.</td></tr>';
  } catch {
    /* ignore */
  }
}

async function toggleSubscription(id, next) {
  const verbo = next === 'inactive' ? 'suspender' : 'reactivar';
  const c = (state.companies || []).find((x) => x.id === id);
  const nombre = c ? c.name : 'esta empresa';
  if (next === 'inactive') {
    const okSusp = await confirmDialog({
      title: 'Suspender empresa',
      message: `Al suspender "${nombre}", sus usuarios no podrán iniciar sesión hasta que la reactives.`,
      confirmText: 'Suspender',
      danger: true,
    });
    if (!okSusp) return;
  }
  const res = await fetch(`/api/companies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ status: next }),
  });
  if (!res.ok) {
    toast(`No se pudo ${verbo} la empresa.`, false);
    return;
  }
  await loadAdmin();
  toast(next === 'inactive' ? 'Empresa suspendida' : 'Empresa reactivada');
}

function setupChangePassword() {
  const open = () => {
    $('#pwCurrent').value = '';
    $('#pwNext').value = '';
    $('#pwConfirm').value = '';
    $('#pwMsg').textContent = '';
    $('#userDropdown').classList.add('hidden');
    const m = $('#changePwModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
  };
  const close = () => {
    const m = $('#changePwModal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  };
  const btn = $('#changePwBtn');
  if (btn) btn.addEventListener('click', open);
  const c1 = $('#closeChangePw');
  if (c1) c1.addEventListener('click', close);
  const c2 = $('#cancelChangePw');
  if (c2) c2.addEventListener('click', close);
  const m = $('#changePwModal');
  if (m) m.addEventListener('click', (e) => { if (e.target.id === 'changePwModal') close(); });
  const save = $('#saveChangePw');
  if (save)
    save.addEventListener('click', async () => {
      const current = $('#pwCurrent').value;
      const next = $('#pwNext').value;
      const confirmv = $('#pwConfirm').value;
      const msg = $('#pwMsg');
      if (next.length < 6) {
        msg.style.color = '#dc2626';
        msg.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
        return;
      }
      if (next !== confirmv) {
        msg.style.color = '#dc2626';
        msg.textContent = 'Las contraseñas nuevas no coinciden.';
        return;
      }
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ current, next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        msg.style.color = '#dc2626';
        msg.textContent = err.error || 'No se pudo cambiar la contraseña.';
        return;
      }
      close();
      toast('Contraseña actualizada');
    });
}

function openCompanyModal() {
  $('#companyName').value = '';
  $('#companyMsg').textContent = '';
  const m = $('#companyModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeCompanyModal() {
  const m = $('#companyModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
async function saveCompany() {
  const name = $('#companyName').value.trim();
  const msg = $('#companyMsg');
  if (!name) {
    msg.style.color = '#dc2626';
    msg.textContent = 'El nombre es obligatorio.';
    return;
  }
  const res = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.style.color = '#dc2626';
    msg.textContent = err.error || 'Error al crear la empresa.';
    return;
  }
  closeCompanyModal();
  await loadAdmin();
  await refreshCompanySelector();
  toast('Empresa creada');
}

function openUserModal() {
  const sel = $('#userCompany');
  sel.innerHTML = (state.companies || [])
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  $('#userUsername').value = '';
  $('#userPassword').value = '';
  $('#userMsg').textContent = '';
  const m = $('#userModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeUserModal() {
  const m = $('#userModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
async function saveUser() {
  const company_id = $('#userCompany').value;
  const username = $('#userUsername').value.trim();
  const password = $('#userPassword').value;
  const msg = $('#userMsg');
  if (!company_id) {
    msg.style.color = '#dc2626';
    msg.textContent = 'Selecciona una empresa.';
    return;
  }
  if (!username || password.length < 6) {
    msg.style.color = '#dc2626';
    msg.textContent = 'Usuario y contraseña (mín. 6 caracteres) requeridos.';
    return;
  }
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password, company_id, role: 'company_admin' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.style.color = '#dc2626';
    msg.textContent = err.error || 'Error al crear el usuario.';
    return;
  }
  closeUserModal();
  await loadAdmin();
  toast('Usuario creado');
}

// Cambio de empresa (superadmin): recarga y re-renderiza TODAS las vistas
// para que sedes, dispositivos, comparativa y salud operativa muestren solo
// la empresa seleccionada, sin importar cuál esté abierta.
async function switchCompany() {
  // Reiniciar filtros dependientes de empresa
  state.locationId = '';
  const ls = $('#locationSearch');
  if (ls) ls.value = '';
  const lf = $('#locationFilter');
  if (lf) lf.value = '';
  const os = $('#opSearch');
  if (os) os.value = '';
  const of = $('#opFilter');
  if (of) of.value = '';
  // Limpiar buscadores de las tablas para que no hereden un filtro de la
  // empresa anterior (si no, la tabla parece "no actualizarse").
  const ds = $('#devSearch');
  if (ds) ds.value = '';
  const lcs = $('#locSearch');
  if (lcs) lcs.value = '';

  // Recargar datos base con el nuevo alcance de empresa.
  await loadLocations();
  await loadDevices();

  // Re-renderizar todas las vistas para que ninguna quede con datos viejos.
  await loadDashboard();
  renderLocationsTable($('#locSearch') ? $('#locSearch').value : '');
  renderDevicesTable($('#devSearch') ? $('#devSearch').value : '');
  await renderBenchmark();
  populateCompareSelectors(true);
  await loadOperations();
  renderActiveFilters();
}

// Refresca el selector de empresa de la barra superior tras crear una empresa.
async function refreshCompanySelector() {
  const sel = $('#companyFilter');
  if (!sel || state.role !== 'superadmin') return;
  try {
    const companies = await api('/api/companies');
    const current = sel.value;
    sel.innerHTML =
      '<option value="">Todas las empresas</option>' +
      companies
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.locations})</option>`)
        .join('');
    sel.value = current;
  } catch {
    /* ignore */
  }
}

function renderOpTable() {
  const body = $('#opTableBody');
  const f = norm($('#opSearch').value);
  const stateFilter = $('#opFilter').value;

  const rows = (state.opItems || []).filter((it) => {
    if (stateFilter && it.state !== stateFilter) return false;
    if (f && !norm(it.name).includes(f) && !norm(it.city).includes(f)) return false;
    return true;
  });

  if (!rows.length) {
    body.innerHTML =
      '<tr><td class="td text-slate-500" colspan="4">Sin sedes que coincidan.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (it) => `
      <tr>
        <td class="td font-medium" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</td>
        <td class="td">${escapeHtml(it.city)}</td>
        <td class="td">${opStateBadge(it.state)}</td>
        <td class="td text-slate-500">${lastScanText(it)}</td>
      </tr>`
    )
    .join('');
}

function opStateBadge(s) {
  if (s === 'active') return '<span class="state-badge state-active"><span class="dot"></span> Activa</span>';
  if (s === 'low') return '<span class="state-badge state-low"><span class="dot"></span> Bajo flujo</span>';
  return '<span class="state-badge state-alert"><span class="dot"></span> Alerta / Inactiva</span>';
}

function lastScanText(it) {
  if (it.hoursSince === null) return 'Nunca';
  if (it.hoursSince < 1) return 'Hace menos de 1h';
  if (it.hoursSince < 24) return `Hace ${Math.round(it.hoursSince)}h`;
  const days = Math.round(it.hoursSince / 24);
  return `Hace ${days} día${days > 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
async function loadHealth() {
  try {
    const h = await api('/api/health');
    const badge = $('#healthBadge');
    const color = h.db && h.cache ? 'bg-emerald-500' : h.db ? 'bg-amber-500' : 'bg-rose-500';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full ${color}"></span> DB ${
      h.db ? 'OK' : 'off'
    } · Redis ${h.cache ? 'OK' : 'off'}`;
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------
// Marca/desmarca contenedores con el shimmer de carga. Recibe selectores.
function setLoading(selectors, on) {
  selectors.forEach((sel) => {
    const el = $(sel);
    if (el) el.classList.toggle('is-loading', on);
  });
}

// Tarjetas de gráficos del dashboard que muestran el loader al cargar.
const DASHBOARD_CARDS = [
  '#trendChart',
  '#topChart',
  '#hourlyChart',
  '#channelChart',
  '#osChart',
];
// Resuelve la .card contenedora de cada canvas para marcarla como cargando.
function dashboardLoadingTargets() {
  return DASHBOARD_CARDS.map((sel) => {
    const canvas = $(sel);
    return canvas ? canvas.closest('.card') : null;
  }).filter(Boolean);
}

// Panel de alertas accionables (arriba del dashboard). Respeta el estado de
// "ocultar" que elija el usuario durante la sesión.
let alertsHidden = false;

const ALERT_ICON = { grave: 'alert-triangle', alerta: 'circle', drop: 'trending-down' };

async function renderAlerts() {
  const panel = $('#alertsPanel');
  if (!panel) return;
  let data;
  try {
    data = await api(`/api/alerts${qs()}`);
  } catch {
    panel.classList.add('hidden');
    return;
  }
  const alerts = data.alerts || [];
  const list = $('#alertsList');
  const countEl = $('#alertsCount');

  // Sin alertas: no robamos espacio en el dashboard.
  if (!alerts.length) {
    panel.classList.add('hidden');
    return;
  }

  countEl.textContent = alerts.length;
  panel.classList.remove('hidden');
  // Respetar el toggle de ocultar/mostrar de la sesión.
  list.classList.toggle('hidden', alertsHidden);
  $('#alertsToggle').textContent = alertsHidden ? 'Mostrar' : 'Ocultar';

  list.innerHTML = alerts
    .map((a) => {
      const ic = a.kind === 'drop' ? 'trending-down' : ALERT_ICON[a.level] || 'alert-triangle';
      const metric = a.metric
        ? `<span class="alert-metric">${icon(ic, { size: 14 })} ${escapeHtml(a.metric)}</span>`
        : '';
      return `
      <div class="alert-row lvl-${a.level}">
        <span class="alert-badge ${a.level}">${a.level}</span>
        <div class="alert-body">
          <div class="alert-row-title">${escapeHtml(a.title)}</div>
          <div class="alert-row-detail">${escapeHtml(a.detail)}</div>
        </div>
        ${metric}
        <button class="alert-link" data-loc="${a.locationId}">Ver sede</button>
      </div>`;
    })
    .join('');

  // "Ver sede": abre Salud operativa y escribe el nombre en su buscador.
  list.querySelectorAll('.alert-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.alert-row');
      const name = row?.querySelector('.alert-row-title')?.textContent || '';
      const opLink = document.querySelector('.nav-link[href="#operations"]');
      if (opLink) opLink.click();
      // El título de la alerta empieza con el nombre de la sede; tomamos la
      // primera parte como término de búsqueda razonable.
      const term = name.split(/\s+(sin|lleva|cayó)\s/)[0].trim();
      const search = $('#opSearch');
      if (search) {
        search.value = term;
        renderOpTable();
      }
    });
  });
}

// silent=true (auto-refresco) omite el loader para no distraer cada 8s.
async function loadDashboard({ silent = false } = {}) {
  const cards = silent ? [] : dashboardLoadingTargets();
  cards.forEach((c) => c.classList.add('is-loading'));
  try {
    const k = await loadKpis();
    await Promise.all([renderTrend(), renderTop(), renderHourly(), renderChannels(), renderAlerts()]);
    renderOs(k);
  } finally {
    cards.forEach((c) => c.classList.remove('is-loading'));
  }
}

// Auto-refresco: recarga los datos de la vista visible sin recargar la página.
async function autoRefresh() {
  try {
    if (!$('#view-dashboard').classList.contains('hidden')) {
      await loadDashboard({ silent: true });
    } else if (!$('#view-executive').classList.contains('hidden')) {
      await renderBenchmark();
    } else if (!$('#view-operations').classList.contains('hidden')) {
      await loadOperations();
    } else if (!$('#view-locations').classList.contains('hidden')) {
      await loadLocations();
      renderLocationsTable($('#locSearch').value);
    }
  } catch {
    /* silencioso: un fallo puntual no debe romper la UI */
  }
}

// --- Selector de rango de fechas (presets + personalizado) -----------------
const RANGE_LABELS = { 0: 'Hoy', 7: 'Últimos 7 días', 30: 'Últimos 30 días', 90: 'Últimos 90 días' };

// Fija state.from/to a los últimos N días (0 = hoy) y sincroniza los inputs.
function setRangeDays(days) {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - days);
  const iso = (d) => d.toISOString().slice(0, 10);
  state.from = iso(past);
  state.to = iso(today);
  const fd = $('#fromDate');
  const td = $('#toDate');
  if (fd) fd.value = state.from;
  if (td) td.value = state.to;
}

// Actualiza el texto del botón: nombre del preset, o el rango concreto si es
// personalizado (days === null).
function setRangeLabel(days) {
  const el = $('#rangeLabel');
  if (!el) return;
  if (days !== null && RANGE_LABELS[days]) {
    el.textContent = RANGE_LABELS[days];
  } else {
    el.textContent = state.from && state.to ? `${state.from} → ${state.to}` : 'Rango personalizado';
  }
}

function closeRangeMenu() {
  const menu = $('#rangeMenu');
  if (menu) menu.classList.add('hidden');
  const btn = $('#rangeBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setupFilters() {
  // Aplica el estado de filtros a la vista analítica visible.
  function applyAnalytics() {
    state.locationId = $('#locationFilter').value;
    state.channel = $('#channelFilter').value;
    renderActiveFilters();
    if (!$('#view-dashboard').classList.contains('hidden')) loadDashboard();
    if (!$('#view-executive').classList.contains('hidden')) renderBenchmark();
    if (!$('#view-operations').classList.contains('hidden')) loadOperations();
    if (!$('#view-survey').classList.contains('hidden')) loadSurvey();
  }

  // "Aplicar rango" (personalizado): toma las dos fechas y cierra el menú.
  $('#applyFilters').addEventListener('click', () => {
    state.from = $('#fromDate').value;
    state.to = $('#toDate').value;
    setRangeLabel(null);
    closeRangeMenu();
    applyAnalytics();
  });

  // Botón del selector de rango: abre/cierra el menú de atajos.
  const rangeBtn = $('#rangeBtn');
  if (rangeBtn) {
    rangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('#rangeMenu');
      const open = menu.classList.toggle('hidden');
      rangeBtn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', (e) => {
      const picker = $('#rangePicker');
      if (picker && !picker.contains(e.target)) closeRangeMenu();
    });
  }

  // Atajos de rango: aplican de inmediato (sin botón Aplicar).
  document.querySelectorAll('.range-opt').forEach((opt) =>
    opt.addEventListener('click', () => {
      const days = parseInt(opt.dataset.days, 10);
      setRangeDays(days);
      setRangeLabel(days);
      closeRangeMenu();
      applyAnalytics();
    })
  );
  $('#locSearch').addEventListener('input', (e) => renderLocationsTable(e.target.value));
  $('#devSearch').addEventListener('input', (e) => renderDevicesTable(e.target.value));

  // Toggle de ocultar/mostrar el panel de alertas.
  const alertsToggle = $('#alertsToggle');
  if (alertsToggle) {
    alertsToggle.addEventListener('click', () => {
      alertsHidden = !alertsHidden;
      const list = $('#alertsList');
      if (list) list.classList.toggle('hidden', alertsHidden);
      alertsToggle.textContent = alertsHidden ? 'Mostrar' : 'Ocultar';
    });
  }

  // Módulo ejecutivo
  $('#compareBtn').addEventListener('click', runCompare);
  // Módulo de salud operativa
  $('#opSearch').addEventListener('input', renderOpTable);
  $('#opFilter').addEventListener('change', renderOpTable);
}

function setupModal() {
  $('#closeModal').addEventListener('click', closeEdit);
  $('#cancelEdit').addEventListener('click', closeEdit);
  $('#saveEdit').addEventListener('click', saveEdit);
  $('#editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEdit();
  });
  // Objetivo del punto: alternar redirección / medición (excluyente).
  $('#editModeRedirect').addEventListener('click', () => setEditMode('redirect'));
  $('#editModeSurvey').addEventListener('click', () => setEditMode('survey'));
}

// ---------------------------------------------------------------------------
// Crear sede
// ---------------------------------------------------------------------------
function openLocationModal() {
  $('#locName').value = '';
  $('#locBrand').value = '';
  $('#locCity').value = '';
  $('#locMsg').textContent = '';

  // Selector de empresa: solo visible para superadmin, obligatorio al crear.
  const wrap = $('#locCompanyWrap');
  const sel = $('#locCompany');
  if (state.role === 'superadmin' && sel) {
    sel.innerHTML = (state.companies || [])
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
    // Precargar con la empresa filtrada en el header, si hay una.
    if (state.companyId) sel.value = state.companyId;
    if (wrap) wrap.classList.remove('hidden');
  } else if (wrap) {
    wrap.classList.add('hidden');
  }

  const m = $('#locationModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeLocationModal() {
  const m = $('#locationModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
async function saveLocation() {
  const name = $('#locName').value.trim();
  const brand = $('#locBrand').value.trim();
  const city = $('#locCity').value.trim();
  const msg = $('#locMsg');

  if (!name || !city) {
    msg.textContent = 'Nombre y ciudad son obligatorios.';
    msg.style.color = '#dc2626';
    return;
  }

  const payload = { name, brand, city };
  // Superadmin debe asignar la sede a una empresa; company_admin la hereda del backend.
  if (state.role === 'superadmin') {
    const company_id = $('#locCompany') ? $('#locCompany').value : '';
    if (!company_id) {
      msg.textContent = 'Selecciona la empresa a la que pertenece la sede.';
      msg.style.color = '#dc2626';
      return;
    }
    payload.company_id = company_id;
  }

  const res = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al crear la sede.';
    msg.style.color = '#dc2626';
    return;
  }

  closeLocationModal();
  await loadLocations();
  renderLocationsTable($('#locSearch').value);
  toast('Sede creada');
}

// ---------------------------------------------------------------------------
// Crear dispositivo
// ---------------------------------------------------------------------------
// Combobox de sede del modal de dispositivo: búsqueda por teclado sobre las
// 84+ sedes en vez de un <select> largo. Guarda el id en #devLocation (hidden)
// y muestra el nombre en #devLocationSearch (texto visible).
function renderDevLocationOptions(filter) {
  const list = $('#devLocationOptions');
  const f = norm((filter || '').trim());
  const matches = state.locations.filter(
    (l) =>
      !f ||
      norm(l.name).includes(f) ||
      norm(l.city).includes(f) ||
      norm(l.companyName || '').includes(f)
  );

  if (!matches.length) {
    list.innerHTML = '<div class="combo-empty">Sin sedes que coincidan</div>';
    return;
  }

  const LIMIT = 50;
  const shown = matches.slice(0, LIMIT);
  let html = shown
    .map(
      (l) =>
        `<div class="combo-opt" data-id="${l.id}" data-label="${escapeHtml(l.name)} · ${escapeHtml(l.city)}">${escapeHtml(l.name)}
           <span class="muted">· ${escapeHtml(l.city)}</span></div>`
    )
    .join('');
  // Si hay más sedes que el tope visible, avisar para que el usuario filtre
  // escribiendo (así no se "pierden" las que quedan fuera de las primeras 50).
  if (matches.length > LIMIT) {
    html += `<div class="combo-empty">+${matches.length - LIMIT} sedes más. Escribe para filtrar…</div>`;
  }
  list.innerHTML = html;

  list.querySelectorAll('.combo-opt').forEach((opt) =>
    opt.addEventListener('click', () => {
      $('#devLocation').value = opt.dataset.id;
      $('#devLocationSearch').value = opt.dataset.label;
      list.classList.add('hidden');
      $('#devLocationSearch').setAttribute('aria-expanded', 'false');
    })
  );
}

function setupDevLocationCombo() {
  const input = $('#devLocationSearch');
  const list = $('#devLocationOptions');
  const combo = $('#devLocationCombo');
  if (!input || input.dataset.wired) return;
  input.dataset.wired = '1'; // evita doble registro de listeners

  const open = () => {
    renderDevLocationOptions(input.value);
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    // Al escribir se invalida la selección previa hasta elegir una opción.
    $('#devLocation').value = '';
    open();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = list.querySelector('.combo-opt');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      list.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
    }
  });
  // Cerrar al hacer clic fuera del combo.
  document.addEventListener('click', (e) => {
    if (combo && !combo.contains(e.target)) {
      list.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
    }
  });
}

function openDeviceModal() {
  setupDevLocationCombo();
  // Reiniciar el combo de sede (sin selección).
  $('#devLocation').value = '';
  $('#devLocationSearch').value = '';
  $('#devLocationOptions').classList.add('hidden');
  $('#devLabel').value = '';
  $('#devTarget').value = '';
  $('#devMsg').textContent = '';
  $('#devResult').classList.add('hidden');
  const m = $('#deviceModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeDeviceModal() {
  const m = $('#deviceModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}
async function saveDevice() {
  const location_id = $('#devLocation').value;
  const label = $('#devLabel').value.trim();
  const target_url = $('#devTarget').value.trim();
  const msg = $('#devMsg');

  if (!location_id) {
    msg.textContent = 'Selecciona una sede.';
    msg.style.color = '#dc2626';
    return;
  }
  if (!label) {
    msg.textContent = 'La etiqueta del punto es obligatoria.';
    msg.style.color = '#dc2626';
    return;
  }
  try {
    new URL(target_url);
  } catch {
    msg.textContent = 'Target URL inválida.';
    msg.style.color = '#dc2626';
    return;
  }

  const res = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_id, label, target_url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al crear el dispositivo.';
    msg.style.color = '#dc2626';
    return;
  }

  const data = await res.json();
  const fullUrl = `${location.origin}${data.redirectPath}`;
  msg.textContent = '';
  $('#devResultUrl').textContent = fullUrl;
  $('#devResult').classList.remove('hidden');

  // Refrescar datos en segundo plano
  await Promise.all([loadDevices(), loadLocations()]);
  renderDevicesTable($('#devSearch').value);
  toast('Dispositivo creado');
}

function setupCreateModals() {
  // Sede
  $('#newLocationBtn').addEventListener('click', openLocationModal);
  $('#closeLocationModal').addEventListener('click', closeLocationModal);
  $('#cancelLocation').addEventListener('click', closeLocationModal);
  $('#saveLocation').addEventListener('click', saveLocation);
  $('#locationModal').addEventListener('click', (e) => {
    if (e.target.id === 'locationModal') closeLocationModal();
  });

  // Editar sede
  $('#closeEditLocation').addEventListener('click', closeEditLocation);
  $('#cancelEditLocation').addEventListener('click', closeEditLocation);
  $('#saveEditLocation').addEventListener('click', saveEditLocation);
  $('#deleteLocation').addEventListener('click', () => {
    if (editingLocationId) deleteLocation(editingLocationId);
  });
  $('#editLocationModal').addEventListener('click', (e) => {
    if (e.target.id === 'editLocationModal') closeEditLocation();
  });

  // Reputación de Google
  $('#closeReputation').addEventListener('click', closeReputation);
  $('#repSave').addEventListener('click', saveReputation);
  $('#reputationModal').addEventListener('click', (e) => {
    if (e.target.id === 'reputationModal') closeReputation();
  });

  // Dispositivo
  $('#newDeviceBtn').addEventListener('click', openDeviceModal);
  $('#closeDeviceModal').addEventListener('click', closeDeviceModal);
  $('#cancelDevice').addEventListener('click', closeDeviceModal);
  $('#saveDevice').addEventListener('click', saveDevice);
  $('#deviceModal').addEventListener('click', (e) => {
    if (e.target.id === 'deviceModal') closeDeviceModal();
  });
  $('#copyResultUrl').addEventListener('click', async () => {
    const url = $('#devResultUrl').textContent;
    try {
      await navigator.clipboard.writeText(url);
      toast('URL copiada al portapapeles');
    } catch {
      toast('No se pudo copiar. Cópiala manualmente.', false);
    }
  });

  // Modal QR
  $('#closeQrModal').addEventListener('click', closeQr);
  $('#downloadQr').addEventListener('click', downloadQr);
  $('#qrModal').addEventListener('click', (e) => {
    if (e.target.id === 'qrModal') closeQr();
  });

  // Modal cambio masivo
  $('#bulkBtn').addEventListener('click', openBulk);
  $('#closeBulkModal').addEventListener('click', closeBulk);
  $('#cancelBulk').addEventListener('click', closeBulk);
  $('#applyBulk').addEventListener('click', applyBulk);
  $('#bulkModal').addEventListener('click', (e) => {
    if (e.target.id === 'bulkModal') closeBulk();
  });
  $('#bulkScope').addEventListener('change', () => {
    const s = $('#bulkScope').value;
    $('#bulkBrandWrap').classList.toggle('hidden', s !== 'brand');
    $('#bulkLocationWrap').classList.toggle('hidden', s !== 'location');
    refreshBulkPreview();
  });
  $('#bulkBrand').addEventListener('change', refreshBulkPreview);
  $('#bulkLocation').addEventListener('change', refreshBulkPreview);

  // Botón de respaldo: adjuntar la empresa seleccionada en el selector.
  const backupBtn = $('#backupBtn');
  if (backupBtn) {
    backupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const cq = state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '';
      window.location.href = `/api/export${cq}`;
    });
  }

  // Modal empresa
  $('#newCompanyBtn').addEventListener('click', openCompanyModal);
  $('#closeCompanyModal').addEventListener('click', closeCompanyModal);
  $('#cancelCompany').addEventListener('click', closeCompanyModal);
  $('#saveCompany').addEventListener('click', saveCompany);
  $('#companyModal').addEventListener('click', (e) => {
    if (e.target.id === 'companyModal') closeCompanyModal();
  });

  // Modal usuario
  $('#newUserBtn').addEventListener('click', openUserModal);
  $('#closeUserModal').addEventListener('click', closeUserModal);
  $('#cancelUser').addEventListener('click', closeUserModal);
  $('#saveUser').addEventListener('click', saveUser);
  $('#userModal').addEventListener('click', (e) => {
    if (e.target.id === 'userModal') closeUserModal();
  });
}

async function init() {
  setupNav();
  setupTheme();
  setupFilters();
  setupCombo();
  setupModal();
  setupCreateModals();
  setupSurveyModals();

  // Rango por defecto: últimos 30 días
  setRangeDays(30);
  setRangeLabel(30);

  // Menú de usuario: toggle, nombre y cerrar sesión
  const userBtn = $('#userBtn');
  const userDropdown = $('#userDropdown');
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!$('.user-menu').contains(e.target)) userDropdown.classList.add('hidden');
    });
  }
  // El nombre de usuario, rol y selector de empresa se cargan en initSession().
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      window.location.href = '/login';
    });
  }
  setupChangePassword();

  await initSession();

  await loadLocations();
  await loadDevices();
  await loadDashboard();
  loadHealth();
  setInterval(loadHealth, 15000);
  // Auto-refresco de datos cada 8 segundos (tiempo casi real, sin recargar la página).
  setInterval(autoRefresh, 8000);

  // Los navegadores congelan los setInterval de pestañas en segundo plano.
  // Al volver a la pestaña, refrescar de inmediato para no mostrar datos viejos
  // (evita tener que recargar manualmente tras dejarla inactiva mucho tiempo).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') autoRefresh();
  });
}

// Carga la sesión: nombre de usuario, rol y (si es superadmin) el selector de empresa.
async function initSession() {
  try {
    const me = await api('/api/me');
    state.role = me.role || null;
    const nameEl = $('#userName');
    if (nameEl) nameEl.textContent = me.companyName ? `${me.user} · ${me.companyName}` : me.user;

    // Tarjeta de usuario en el pie del sidebar
    const sbName = $('#sidebarUserName');
    const sbRole = $('#sidebarUserRole');
    if (sbName) sbName.textContent = me.user || '—';
    if (sbRole) {
      sbRole.textContent =
        me.role === 'superadmin'
          ? 'Superadmin'
          : me.companyName || 'Administrador';
    }

    const sel = $('#companyFilter');
    if (me.role === 'superadmin' && sel) {
      // Mostrar enlaces exclusivos de superadmin (pestaña Empresas)
      document.querySelectorAll('.superadmin-only').forEach((el) => el.classList.remove('hidden'));
      const companies = await api('/api/companies');
      state.companies = companies;
      sel.innerHTML =
        '<option value="">Todas las empresas</option>' +
        companies
          .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.locations})</option>`)
          .join('');
      sel.classList.remove('hidden');
      sel.addEventListener('change', async () => {
        state.companyId = sel.value;
        await switchCompany();
      });
    }
  } catch {
    /* ignore */
  }
}

init().catch((err) => {
  console.error(err);
  toast('Error al cargar el dashboard. ¿Corriste el seed?', false);
});
