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

function qs() {
  const p = new URLSearchParams();
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  if (state.locationId) p.set('locationId', state.locationId);
  if (state.channel) p.set('channel', state.channel);
  if (state.companyId) p.set('companyId', state.companyId);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function toast(msg, ok = true) {
  const t = $('#toast');
  const ico = ok ? icon('check-circle', { size: 16 }) : icon('alert-triangle', { size: 16 });
  t.innerHTML = `<span class="toast-inner">${ico}<span>${msg}</span></span>`;
  t.style.background = ok ? '#4f46e5' : '#dc2626';
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}
function gridColor() {
  return isDark() ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.15)';
}
function tickColor() {
  return isDark() ? '#94a3b8' : '#64748b';
}

/**
 * Configuración de tooltip limpio y legible para Chart.js.
 * Los nombres largos NO se cortan (el tooltip crece y hace wrap).
 * @param titleFn opcional: función para personalizar el título.
 */
function cleanTooltip(titleFn) {
  return {
    backgroundColor: isDark() ? '#1e293b' : '#0f172a',
    titleColor: '#f8fafc',
    bodyColor: '#e2e8f0',
    padding: 12,
    cornerRadius: 8,
    titleFont: { size: 13, weight: '600' },
    bodyFont: { size: 12 },
    displayColors: true,
    boxPadding: 4,
    // Sin maxWidth => el tooltip no trunca nombres largos.
    callbacks: titleFn ? { title: titleFn } : {},
  };
}

/** Turno operativo según la hora (0-23). */
function shiftOf(hour) {
  if (hour >= 8 && hour < 12) return { name: 'Mañana', color: '#f59e0b' };
  if (hour >= 12 && hour < 18) return { name: 'Tarde', color: '#6366f1' };
  if (hour >= 18 && hour < 22) return { name: 'Noche', color: '#8b5cf6' };
  return { name: 'Madrugada', color: '#475569' };
}

// ---------------------------------------------------------------------------
// Navegación entre vistas
// ---------------------------------------------------------------------------
function setupNav() {
  const views = ['dashboard', 'executive', 'operations', 'locations', 'devices', 'admin'];

  function activate(target) {
    views.forEach((v) => {
      $(`#view-${v}`).classList.toggle('hidden', v !== target);
    });
    // Sincronizar estado activo en sidebar Y en la barra superior
    document.querySelectorAll('.nav-link, .topnav-link').forEach((l) => {
      l.classList.toggle('active', l.getAttribute('href') === `#${target}`);
    });
    if (target === 'locations') renderLocationsTable($('#locSearch').value);
    if (target === 'devices') renderDevicesTable($('#devSearch').value);
    if (target === 'executive') loadExecutive();
    if (target === 'operations') loadOperations();
    if (target === 'admin') loadAdmin();
  }

  document.querySelectorAll('.nav-link, .topnav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activate(link.getAttribute('href').slice(1));
    });
  });
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

async function renderTrend() {
  const res = await api(`/api/trend-advanced${qs()}`);
  const data = res.series || [];
  const ctx = $('#trendChart');
  destroyChart('trend');

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

  const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, 'rgba(99,102,241,0.35)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((d) => d.day),
      datasets: [
        {
          label: 'Selección',
          data: data.map((d) => d.scans),
          borderColor: '#6366f1',
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
        },
        {
          label: 'Promedio cadena',
          data: data.map((d) => d.avg),
          borderColor: '#94a3b8',
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
  destroyChart('top');

  state.charts.top = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => shorten(d.name)),
      datasets: [
        {
          label: 'Escaneos',
          data: data.map((d) => d.scans),
          backgroundColor: '#818cf8',
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
  destroyChart('os');

  const segments = [
    { label: 'iOS', value: k.devices.iOS || 0, color: '#22d3ee' },      // cyan
    { label: 'Android', value: k.devices.Android || 0, color: '#34d399' }, // emerald/menta
    { label: 'Otros', value: k.devices.Other || 0, color: '#64748b' },  // slate
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);

  // Center label
  $('#osCenterTotal').textContent = fmt(total);

  // Gradientes suaves por segmento
  const g2d = ctx.getContext('2d');
  const grads = segments.map((s) => {
    const g = g2d.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, s.color);
    g.addColorStop(1, s.color + '99'); // más translúcido abajo
    return g;
  });

  state.charts.os = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: segments.map((s) => s.label),
      datasets: [
        {
          data: segments.map((s) => s.value),
          backgroundColor: grads,
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
  destroyChart('hourly');
  // Cada barra se colorea según su turno operativo.
  const colors = data.map((d) => shiftOf(d.hour).color);
  state.charts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => `${String(d.hour).padStart(2, '0')}h`),
      datasets: [
        {
          label: 'Escaneos',
          data: data.map((d) => d.scans),
          backgroundColor: colors,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
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
  Llamada: '#f59e0b',
  Email: '#a855f7',
  'Sitio web': '#6366f1',
  Otro: '#94a3b8',
};
const channelColor = (c) => CHANNEL_COLORS[c] || '#94a3b8';

async function renderChannels() {
  const data = await api(`/api/channels${qs()}`);
  const ctx = $('#channelChart');
  destroyChart('channel');

  const total = data.reduce((a, d) => a + d.scans, 0);

  // Gradientes suaves por canal (mismo estilo que el doughnut de SO)
  const g2d = ctx.getContext('2d');
  const grads = data.map((d) => {
    const base = channelColor(d.channel);
    const g = g2d.createLinearGradient(0, 0, ctx.width || 400, 0);
    g.addColorStop(0, base + 'cc');
    g.addColorStop(1, base);
    return g;
  });

  state.charts.channel = new Chart(ctx, {
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
    (l) => !f || norm(l.name).includes(f) || norm(l.city).includes(f)
  );

  const items = [
    `<div class="combo-opt" data-id="">Todas las sedes</div>`,
    ...matches
      .slice(0, 50)
      .map(
        (l) =>
          `<div class="combo-opt" data-id="${l.id}">${escapeHtml(l.name)}
             <span class="muted">· ${escapeHtml(l.city)}</span></div>`
      ),
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
      loadDashboard();
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
  const rows = state.locations.filter(
    (l) => !f || norm(l.name).includes(f) || norm(l.city).includes(f)
  );
  body.innerHTML = rows
    .map(
      (l) => `
      <tr>
        <td class="td font-medium">${escapeHtml(l.name)}</td>
        <td class="td text-slate-500">${escapeHtml(l.brand)}</td>
        <td class="td">${escapeHtml(l.city)}</td>
        <td class="td">${statusBadge(l.status)}</td>
        <td class="td text-right">${fmt(l.nfcPoints)}</td>
        <td class="td text-right font-semibold">${fmt(l.totalClicks)}</td>
        <td class="td text-right">
          <span class="row-actions">
            <button class="icon-btn loc-edit-btn" data-id="${l.id}" title="Editar sede">${icon('pencil', { size: 15 })}</button>
            <button class="icon-btn danger loc-del-btn" data-id="${l.id}" title="Eliminar sede">${icon('trash', { size: 15 })}</button>
          </span>
        </td>
      </tr>`
    )
    .join('');

  body.querySelectorAll('.loc-edit-btn').forEach((b) =>
    b.addEventListener('click', () => openEditLocation(b.dataset.id))
  );
  body.querySelectorAll('.loc-del-btn').forEach((b) =>
    b.addEventListener('click', () => deleteLocation(b.dataset.id))
  );
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
  const msg =
    l && l.nfcPoints > 0
      ? `¿Eliminar "${name}"? Se borrarán también sus ${l.nfcPoints} punto(s) NFC y sus escaneos. Esta acción no se puede deshacer.`
      : `¿Eliminar "${name}"? Esta acción no se puede deshacer.`;
  if (!confirm(msg)) return;

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
    <tr class="${child ? 'device-child-row' : ''}">
      <td class="td font-medium">${
        child
          ? `<span class="text-xs text-slate-500 section-title-icon">${icon('corner-down-right', { size: 13 })} ${escapeHtml(d.label)}</span>`
          : `${escapeHtml(d.location_name)}<br><span class="text-xs text-slate-500">${escapeHtml(d.location_city)}</span>`
      }</td>
      <td class="td">${escapeHtml(d.label)}</td>
      <td class="td font-mono text-xs max-w-xs truncate" title="${escapeHtml(d.target_url)}">${escapeHtml(d.target_url)}</td>
      <td class="td">${statusBadge(d.status)}</td>
      <td class="td text-right">
        <span class="row-actions">
          <button class="icon-btn qr-btn" data-id="${d.id}" title="Ver código QR">${icon('qr', { size: 15 })}</button>
          <button class="btn-primary text-xs edit-btn" data-id="${d.id}">Editar</button>
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
        <tr class="loc-group-row" data-loc="${g.locationId}">
          <td class="td font-medium">
            <span class="expand-caret ${open ? 'open' : ''}">${icon('chevron-right', { size: 16 })}</span>
            ${escapeHtml(g.name)}<br>
            <span class="text-xs text-slate-500" style="margin-left:1.5rem">${escapeHtml(g.city)}</span>
          </td>
          <td class="td text-slate-500">${g.devices.length} puntos NFC</td>
          <td class="td text-slate-400 text-xs">—</td>
          <td class="td">—</td>
          <td class="td text-right text-xs text-slate-400">Desplegar</td>
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
  if (!confirm(`Vas a cambiar el destino de ${count} dispositivos. Esta acción se puede revertir. ¿Continuar?`)) {
    return;
  }

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
      if (!confirm('¿Revertir esta campaña y restaurar los destinos anteriores?')) return;
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
  const url = `${location.origin}/r/${d.id}`;
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
// Modal de edición
// ---------------------------------------------------------------------------
let editingId = null;

function openEdit(id) {
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  editingId = id;
  $('#editDeviceLabel').textContent = `${d.location_name} · ${d.label}`;
  $('#editRedirectUrl').textContent = `${location.origin}/r/${d.id}`;
  $('#editTargetUrl').value = d.target_url;
  $('#editStatus').value = d.status;
  $('#editMsg').textContent = '';
  const m = $('#editModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}

function closeEdit() {
  const m = $('#editModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
  editingId = null;
}

async function saveEdit() {
  if (!editingId) return;
  const target_url = $('#editTargetUrl').value.trim();
  const status = $('#editStatus').value;
  const msg = $('#editMsg');

  try {
    new URL(target_url);
  } catch {
    msg.textContent = 'URL inválida.';
    msg.style.color = '#dc2626';
    return;
  }

  const res = await fetch(`/api/devices/${editingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url, status }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    msg.textContent = err.error || 'Error al guardar.';
    msg.style.color = '#dc2626';
    return;
  }

  // Actualizar estado local
  const d = state.devices.find((x) => x.id === editingId);
  if (d) {
    d.target_url = target_url;
    d.status = status;
  }
  closeEdit();
  renderDevicesTable($('#devSearch').value);
  toast('Destino actualizado en tiempo real');
}

// ---------------------------------------------------------------------------
// Módulo ejecutivo: benchmarking (Top3 vs Bottom3) + comparación A/B
// ---------------------------------------------------------------------------
async function loadExecutive() {
  await renderBenchmark();
  populateCompareSelectors();
}

async function renderBenchmark() {
  const b = await api(`/api/benchmark${qs()}`);

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
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
          fill: false,
        },
        {
          label: nameB,
          data: res.b.data,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
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
          .map(
            (c) => `
        <tr>
          <td class="td font-medium">${escapeHtml(c.name)}</td>
          <td class="td text-slate-500">${escapeHtml(c.slug)}</td>
          <td class="td text-right">${fmt(c.locations ?? 0)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td class="td text-slate-500" colspan="3">Sin empresas.</td></tr>';

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
async function loadDashboard() {
  const k = await loadKpis();
  await Promise.all([renderTrend(), renderTop(), renderHourly(), renderChannels()]);
  renderOs(k);
}

// Auto-refresco: recarga los datos de la vista visible sin recargar la página.
async function autoRefresh() {
  try {
    if (!$('#view-dashboard').classList.contains('hidden')) {
      await loadDashboard();
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

function setupFilters() {
  $('#applyFilters').addEventListener('click', () => {
    state.from = $('#fromDate').value;
    state.to = $('#toDate').value;
    state.locationId = $('#locationFilter').value;
    state.channel = $('#channelFilter').value;
    loadDashboard();
    // Si la vista ejecutiva está abierta, refrescar su benchmarking con el nuevo rango.
    if (!$('#view-executive').classList.contains('hidden')) renderBenchmark();
  });
  $('#locSearch').addEventListener('input', (e) => renderLocationsTable(e.target.value));
  $('#devSearch').addEventListener('input', (e) => renderDevicesTable(e.target.value));

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
}

// ---------------------------------------------------------------------------
// Crear sede
// ---------------------------------------------------------------------------
function openLocationModal() {
  $('#locName').value = '';
  $('#locBrand').value = '';
  $('#locCity').value = '';
  $('#locMsg').textContent = '';
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

  const res = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, brand, city }),
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
function openDeviceModal() {
  // Poblar el selector de sedes
  const sel = $('#devLocation');
  sel.innerHTML = state.locations
    .map((l) => `<option value="${l.id}">${escapeHtml(l.name)} · ${escapeHtml(l.city)}</option>`)
    .join('');
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

  // Rango por defecto: últimos 30 días
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 30);
  $('#toDate').value = today.toISOString().slice(0, 10);
  $('#fromDate').value = past.toISOString().slice(0, 10);
  // Sincronizar el estado para que la variación % y demás módulos usen el rango.
  state.from = $('#fromDate').value;
  state.to = $('#toDate').value;

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

  await initSession();

  await loadLocations();
  await loadDevices();
  await loadDashboard();
  loadHealth();
  setInterval(loadHealth, 15000);
  // Auto-refresco de datos cada 8 segundos (tiempo casi real, sin recargar la página).
  setInterval(autoRefresh, 8000);
}

// Carga la sesión: nombre de usuario, rol y (si es superadmin) el selector de empresa.
async function initSession() {
  try {
    const me = await api('/api/me');
    state.role = me.role || null;
    const nameEl = $('#userName');
    if (nameEl) nameEl.textContent = me.companyName ? `${me.user} · ${me.companyName}` : me.user;

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
