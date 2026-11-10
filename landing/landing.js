// Landing de NFCloud: una sola escena WebGL fija detrás de la página. El scroll
// se convierte en un "tiempo" continuo t (0 = hero, 1 = toque, ... 7 = contacto)
// y cada objeto interpola su pose entre las de cada escena.
import * as THREE from 'three';

const WA = 'https://wa.me/573007240273';
const WA_QR = `${WA}?text=${encodeURIComponent('Hola, escaneé la tarjeta de NFCloud y quiero conocer los precios.')}`;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, f) => a + (b - a) * f;
const sstep = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);

/* ---------- Formulario y navegación (funcionan aunque no haya WebGL) ---------- */
document.getElementById('leadForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  const sedes = String(d.get('sedes') || '').trim();
  const msg = `Hola, soy de ${String(d.get('negocio')).trim()}. ` +
    (sedes ? `Necesito ${sedes} ${sedes === '1' ? 'sede o tarjeta' : 'sedes o tarjetas'}. ` : '') +
    `Me interesa: ${d.get('interes')}. ¿Me envías los precios de NFCloud?`;
  window.open(`${WA}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
});
// Conversaciones de ejemplo: los mensajes llegan uno a uno al entrar en pantalla
const convos = document.querySelectorAll('.convo');
if (!REDUCED && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('play'); io.unobserve(e.target); }
  }, { threshold: .45 });
  convos.forEach((c) => { c.classList.add('wait'); io.observe(c); });
}

/* ---------- Diseños hechos: una pieza sale con estela y entra la siguiente ---------- */
const SHOW = [
  { f: 'riovivo', kind: 'Tarjeta', name: 'RioVivo Spa' },
  { f: 'gym', kind: 'Concepto', name: 'Gimnasio' },
  { f: 'hab-lalico', kind: 'Hablador en acrílico', name: 'La Lico', tall: true },
  { f: 'cafe', kind: 'Concepto', name: 'Cafetería' },
  { f: 'inplux', kind: 'Tarjeta de equipo', name: 'Inplux' },
  { f: 'libro', kind: 'Tarjeta de un libro', name: 'Docente universitario' },
  { f: 'inmobiliaria', kind: 'Concepto', name: 'Inmobiliaria' },
  { f: 'hab-riovivo', kind: 'Hablador en acrílico', name: 'RioVivo Spa', tall: true },
  { f: 'docente', kind: 'Tarjeta profesional', name: 'Docente e investigadora' },
  { f: 'lalico', kind: 'Tarjeta de reseñas', name: 'La Lico' },
  { f: 'dental', kind: 'Concepto', name: 'Clínica odontológica' },
];
const showEl = document.getElementById('hechos');
if (showEl) {
  const frame = document.getElementById('showFrame');
  const kindEl = document.getElementById('showKind'), nameEl = document.getElementById('showName');
  const ticks = document.getElementById('showTicks');
  const pauseBtn = document.getElementById('showPause');
  const bgs = [...showEl.querySelectorAll('.show-bg-img')];
  const HOLD = REDUCED ? 5200 : 3400;
  ticks.innerHTML = SHOW.map(() => '<i></i>').join('');
  const tickEls = [...ticks.children];
  let idx = 0, timer = 0, visible = false, paused = false, busy = false, loaded = false, bgOn = 0;

  const preload = () => {
    if (loaded) return; loaded = true;
    SHOW.forEach((s) => { new Image().src = `art/show/${s.f}.webp`; new Image().src = `art/show/${s.f}-bg.webp`; });
  };
  const setTicks = () => tickEls.forEach((t, i) => {
    t.className = i < idx ? 'done' : i === idx ? 'now' : '';
    t.style.animationDuration = `${HOLD}ms`;
  });
  const OUT_EASE = 'cubic-bezier(.7, 0, .84, 0)', IN_EASE = 'cubic-bezier(.16, 1, .3, 1)';

  function go(next) {
    if (busy) return;
    busy = true;
    const old = frame.querySelector('.show-piece');
    const s = SHOW[next];
    const img = new Image();
    img.className = 'show-piece' + (s.tall ? ' tall' : '');
    img.alt = `${s.kind}${s.kind === 'Concepto' ? ' de ejemplo' : ' NFC'} de ${s.name}`;
    img.src = `art/show/${s.f}.webp`;
    img.decode().catch(() => {}).then(() => {
      frame.appendChild(img);
      // Fondo: la luz del nuevo diseño entra con un empujón
      const nb = bgs[1 - bgOn];
      nb.src = `art/show/${s.f}-bg.webp`;
      nb.classList.add('is-on'); bgs[bgOn].classList.remove('is-on');
      bgOn = 1 - bgOn;
      if (REDUCED) {
        img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
        old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => old.remove());
      } else {
        nb.animate([{ transform: 'translate3d(8%, -5%, 0) scale(1.22)' }, { transform: 'translate3d(0, 0, 0) scale(1.06)' }], { duration: 1400, easing: IN_EASE });
        showEl.classList.remove('whoosh'); void showEl.offsetWidth; showEl.classList.add('whoosh');
        old.animate([
          { transform: 'none', filter: 'blur(0px)', opacity: 1 },
          { transform: 'translate3d(-60%, 0, 0) skewX(-14deg) scaleX(1.3)', filter: 'blur(22px)', opacity: 0 },
        ], { duration: 480, easing: OUT_EASE, fill: 'forwards' }).finished.then(() => old.remove());
        img.animate([
          { transform: 'translate3d(60%, 0, 0) skewX(14deg) scaleX(1.35)', filter: 'blur(26px)', opacity: 0 },
          { opacity: 1, offset: .45 },
          { transform: 'none', filter: 'blur(0px)', opacity: 1 },
        ], { duration: 950, delay: 120, easing: IN_EASE, fill: 'backwards' });
      }
      idx = next;
      kindEl.textContent = s.kind; nameEl.textContent = s.name;
      setTicks();
      setTimeout(() => { busy = false; }, REDUCED ? 500 : 900);
    });
  }
  const schedule = () => {
    clearTimeout(timer);
    if (visible && !paused) timer = setTimeout(() => { go((idx + 1) % SHOW.length); schedule(); }, HOLD);
  };
  frame.addEventListener('click', () => { go((idx + 1) % SHOW.length); schedule(); });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.setAttribute('aria-label', paused ? 'Reanudar los diseños' : 'Pausar los diseños');
    showEl.classList.toggle('is-paused', paused);
    schedule();
  });
  new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting) preload();
      visible = e.intersectionRatio > .35;
      showEl.classList.toggle('is-live', visible);
      schedule();
    }
  }, { rootMargin: '600px 0px', threshold: [0, .35] }).observe(showEl);
  setTicks();
}

/* ---------- Mensajes precargados de WhatsApp (mismo patrón del formulario) ---------- */
const waLink = (msg) => `${WA}?text=${encodeURIComponent(msg)}`;
document.querySelectorAll('a[data-wa]').forEach((a) => { a.href = waLink(a.dataset.wa); });
document.querySelectorAll('a[data-pendiente]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

/* ---------- "Así se ve tu panel": vistas con datos de ejemplo ---------- */
const pvView = document.getElementById('pvView');
if (pvView) {
  const pvSec = document.getElementById('panel');
  const tabs = [...document.querySelectorAll('#pvTabs [role="tab"]')];
  const sideItems = [...document.querySelectorAll('.pv-side li')];
  const n0 = new Intl.NumberFormat('es-CO');
  const money = (v) => '$ ' + n0.format(Math.round(v));
  const UP = '<span class="pv-delta up">▲', DOWN = '<span class="pv-delta down">▼';
  const CH = { g: ['Reseñas en Google', '#4285f4'], w: ['WhatsApp', '#25d366'], i: ['Instagram', '#e1306c'] };
  let reviewValue = 5000;

  const VALUE = [['g', 1936, () => reviewValue], ['w', 3207, () => 2000], ['i', 1150, () => 1500]];
  const valueTotal = () => VALUE.reduce((s, [, n, u]) => s + n * u(), 0);
  const GOALS = [
    ['Centro', 'Medellín', 1420, 1300, 'done', 'Cumplida'], ['Laureles', 'Medellín', 980, 1100, 'ok', 'En camino'],
    ['Envigado', 'Envigado', 860, 1000, 'ok', 'En camino'], ['Sabaneta', 'Sabaneta', 610, 900, 'warn', 'Cerca'],
    ['Bello', 'Bello', 420, 800, 'warn', 'Cerca'], ['Norte', 'Medellín', 290, 700, 'bad', 'Atrasada'],
  ];
  const DAY = 18, DAYS = 30;

  function viewValue() {
    const rows = VALUE.map(([k, n, u]) => `<div class="pv-vrow"><span class="pv-ch"><i style="background:${CH[k][1]}"></i>${CH[k][0]}</span><span class="pv-calc">${n0.format(n)} × ${money(u())}</span><b data-ch="${k}">${money(n * u())}</b></div>`).join('');
    const goals = GOALS.map(([name, city, act, goal, st, lab]) => {
      const proj = Math.min(100, act / DAY * DAYS / goal * 100), w = Math.min(100, act / goal * 100);
      return `<div class="pv-goal"><span class="pv-gname">Sede ${name}<small>${city}</small></span><span class="pv-gbar"><i class="proj" style="--w:${proj}%"></i><i class="fill ${st}" style="--w:${w}%"></i></span><span class="pv-gnum">${n0.format(act)} <small>/ ${n0.format(goal)}</small></span><span class="pv-badge ${st}">${lab}</span></div>`;
    }).join('');
    return `<div class="pv-grid">
      <div class="pv-card"><p class="pv-label">Valor estimado generado · este mes</p>
        <p class="pv-big" id="pvTotal">${money(valueTotal())}</p>${UP} 12 % vs. el mes anterior</span>
        <div class="pv-vrows">${rows}</div>
        <label class="pv-slider"><span>Para ti, una reseña vale <output id="pvOut">${money(reviewValue)}</output></span>
          <input type="range" id="pvRange" min="1000" max="20000" step="500" value="${reviewValue}" aria-label="Valor de una reseña en pesos" /></label>
        <p class="pv-note">Tú pones el valor de cada destino; el panel convierte los toques en pesos.</p></div>
      <div class="pv-card"><p class="pv-label">Metas del mes</p><p class="pv-sub">Día ${DAY} de ${DAYS} · 3 de 6 en camino · la barra clara es la proyección al cierre</p>
        <div class="pv-goals">${goals}</div></div>
    </div>`;
  }

  // Campaña: 14 días antes y 14 durante la promoción
  const CAMP = [44, 41, 47, 52, 49, 45, 50, 46, 43, 48, 51, 47, 45, 49, 58, 66, 63, 71, 69, 64, 72, 68, 65, 70, 74, 67, 63, 69];
  function viewCampaign() {
    const W = 640, H = 220, P = 24, max = 80;
    const x = (i) => P + i * (W - P * 2) / (CAMP.length - 1), y = (v) => H - P - v / max * (H - P * 2);
    const line = CAMP.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${x(CAMP.length - 1)},${H - P}L${x(0)},${H - P}Z`;
    const bx = (x(13) + x(14)) / 2;
    return `<div class="pv-card pv-camp">
      <div class="pv-camp-head"><div><p class="pv-label">Promoción 2x1 en cafés · 1 al 14 de octubre</p>
        <p class="pv-big">+38 %</p><p class="pv-sub">interacciones diarias durante la promoción, frente a las 2 semanas anteriores</p></div>
        <p class="pv-verdict">Funcionó en 7 de 8 sedes. En Sede Norte no se movió.</p></div>
      <svg class="pv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Interacciones diarias: unas 47 antes de la promoción y unas 67 durante">
        <rect class="band" x="${bx}" y="${P - 8}" width="${W - P - bx}" height="${H - P * 2 + 8}" rx="6"/>
        <text x="${P}" y="${P - 10}">Antes</text><text x="${bx + 10}" y="${P - 10}">Durante la promoción</text>
        <line class="base" x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}"/>
        <path class="area" d="${area}"/><path class="line" d="${line}" pathLength="1"/>
      </svg>
      <p class="pv-note">El panel no saca conclusiones con menos de 3 días de datos ni con muy pocas interacciones.</p></div>`;
  }

  // Mapa de calor: lunes a domingo, 8 a. m. a 8 p. m.
  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const HRS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const heatVal = (d, h) => {
    const lunch = Math.exp(-((h - 12.5) ** 2) / 2.2), eve = Math.exp(-((h - 18.5) ** 2) / 2.6);
    const wk = d >= 5 ? 1.35 : 1;
    const sat = d === 5 ? 1.3 * Math.exp(-((h - 11.8) ** 2) / 3) : 0;
    return Math.max(0, (lunch * .9 + eve * (d >= 5 ? .55 : .8) + .12) * wk + sat - (d === 6 && h > 17 ? .4 : 0));
  };
  function viewHeat() {
    const max = Math.max(...DOW.flatMap((_, d) => HRS.map((h) => heatVal(d, h))));
    const head = `<span></span>${HRS.map((h) => `<span class="pv-hh">${h % 2 === 0 ? (h > 12 ? h - 12 : h) + (h >= 12 ? ' p. m.' : ' a. m.') : ''}</span>`).join('')}`;
    const rows = DOW.map((dn, d) => `<span class="pv-hd">${dn}</span>` + HRS.map((h, k) => {
      const a = .1 + .9 * heatVal(d, h) / max;
      return `<span class="pv-hc" style="--a:${a.toFixed(2)};--i:${d + k}" title="${dn} ${h}:00"></span>`;
    }).join('')).join('');
    return `<div class="pv-card"><p class="pv-insight">El momento más fuerte: <b>sábado de 11 a. m. a 1 p. m.</b> Ahí conviene tener a tu mejor gente en caja.</p>
      <div class="pv-heat" style="--cols:${HRS.length}">${head}${rows}</div>
      <p class="pv-legend"><span>Menos</span><i></i><span>Más interacciones</span></p></div>`;
  }

  const RANK = [['Centro', 2140, 9], ['Laureles', 1810, 4], ['Envigado', 1620, 6], ['Poblado', 1480, -2], ['Sabaneta', 1210, 3], ['Belén', 1090, -4], ['Bello', 870, 1], ['Norte', 412, -32]];
  function viewRank() {
    const max = RANK[0][1];
    const rows = RANK.map(([name, v, dlt], i) => {
      const bad = dlt <= -20, best = i === 0;
      return `<div class="pv-rrow${bad ? ' bad' : ''}"><span class="pv-rnum">${i + 1}</span><span class="pv-rname">Sede ${name}${best ? '<em class="pv-badge done">La mejor</em>' : ''}</span>
        <span class="pv-rbar"><i style="--w:${(v / max * 100).toFixed(1)}%"></i></span><span class="pv-rval">${n0.format(v)}</span>
        ${Math.abs(dlt) >= 5 ? (dlt > 0 ? UP : DOWN) + ` ${Math.abs(dlt)} %</span>` : '<span class="pv-delta flat">' + (dlt > 0 ? '+' : '') + dlt + ' %</span>'}
        ${bad ? '<button type="button" class="pv-go" data-go="4">Ver la sede</button>' : '<span></span>'}</div>`;
    }).join('');
    return `<div class="pv-card"><div class="pv-alert"><b>Sede Norte cayó 32 % esta semana.</b> Es la única en alerta; las demás están dentro de lo normal.</div>
      <p class="pv-label">Interacciones por sede · últimos 7 días</p><div class="pv-rank">${rows}</div></div>`;
  }

  function viewSede() {
    const pts = [['Caja principal', 'g', 210], ['Mesa 4', 'w', 118], ['Hablador de la entrada', 'i', 84]];
    return `<div class="pv-card pv-sede">
      <div class="pv-sede-head"><div><p class="pv-label">Sede Norte · Medellín</p><p class="pv-title">Puesto 8 de 8 <span class="pv-delta down">bajó 3 puestos</span></p></div>
        <p class="pv-summary">Cayó 32 % frente a la semana anterior y casi toda la caída viene de la caja. Revisa que la tarjeta siga a la vista.</p></div>
      <div class="pv-kpis">
        <div><span>Interacciones</span><b>412</b>${DOWN} 32 %</span></div>
        <div><span>Reseñas generadas</span><b>61</b>${DOWN} 18 %</span></div>
        <div><span>Nota de la encuesta</span><b>3,9 <small>de 5</small></b><span class="pv-delta flat">igual</span></div>
      </div>
      <p class="pv-label">Puntos NFC de la sede</p>
      <div class="pv-points">${pts.map(([n, k, v]) => `<div class="pv-point"><span class="pv-pname">${n}<small><i style="background:${CH[k][1]}"></i>${CH[k][0]}</small></span><span class="pv-pval">${v} toques</span><button type="button" class="pv-change">Cambiar destino</button></div>`).join('')}</div>
      <div class="pv-src"><span>Cómo llegan: NFC 68 %</span><span class="pv-srcbar"><i style="--w:68%"></i></span><span>QR 32 %</span></div></div>`;
  }

  const VIEWS = [viewValue, viewCampaign, viewHeat, viewRank, viewSede];
  const SIDE = [0, 0, 0, 1, 1];
  let cur = -1, auto = true, autoT = 0, visible = false;

  function show(i, focus) {
    if (i === cur) return;
    cur = i;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    if (focus) tabs[i].focus();
    sideItems.forEach((li) => li.classList.toggle('on', Number(li.dataset.s) === SIDE[i]));
    pvView.setAttribute('aria-labelledby', tabs[i].id);
    pvView.innerHTML = VIEWS[i]();
    pvView.classList.remove('enter'); void pvView.offsetWidth; pvView.classList.add('enter');
    bind();
    schedule();
  }
  function bind() {
    const range = document.getElementById('pvRange');
    if (range) range.addEventListener('input', () => {
      reviewValue = Number(range.value);
      document.getElementById('pvOut').textContent = money(reviewValue);
      document.getElementById('pvTotal').textContent = money(valueTotal());
      const g = pvView.querySelector('[data-ch="g"]');
      g.textContent = money(1936 * reviewValue);
      g.previousElementSibling.textContent = `${n0.format(1936)} × ${money(reviewValue)}`;
      stopAuto();
    });
    pvView.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { stopAuto(); show(Number(b.dataset.go)); }));
  }
  const stopAuto = () => { auto = false; pvSec.classList.remove('auto'); clearTimeout(autoT); };
  function schedule() {
    clearTimeout(autoT);
    if (auto && visible && !REDUCED) autoT = setTimeout(() => show((cur + 1) % VIEWS.length), 7000);
    tabs.forEach((t) => t.classList.remove('run'));
    if (auto && visible && !REDUCED) { void tabs[cur].offsetWidth; tabs[cur].classList.add('run'); }
  }
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => { stopAuto(); show(k); });
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); stopAuto(); show((k + d + tabs.length) % tabs.length, true); }
    });
  });
  pvView.addEventListener('pointerdown', stopAuto);
  new IntersectionObserver((es) => {
    for (const e of es) { visible = e.isIntersecting; if (visible && cur < 0) show(0); else schedule(); }
  }, { threshold: .35 }).observe(pvSec);
  pvSec.classList.add('auto');
}

/* ---------- Narración opcional de las conversaciones ---------- */
// Segundo del audio en que aparece cada mensaje y en que suena el toque NFC.
const NARR = {
  // Los dos últimos mensajes y el cierre solo existen con la voz (.narr-only).
  pro: { src: 'audio/pro.mp3', cues: [1.7, 7.5, 9.3, 12.6, 15.3, 20.9], chime: [8.1], end: 23.9 },
  cadenas: { src: 'audio/cadenas.mp3', cues: [2.1, 5.3, 7.7, 11.3, 15.6, 20.1, 23.2], chime: [11.4], end: 25.8 },
  inst: { src: 'audio/inst.mp3', cues: [1.6, 4.6, 8.4, 10.8, 12.9], chime: [.5], end: 21.3 },
};
let actx = null;
function nfcChime() {
  // Sonido propio de "tarjeta leída": dos notas cortas y limpias, generadas aquí.
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime + .01;
    [[1318.5, 0], [1975.5, .085]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(.16, t0 + d + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .22);
      o.connect(g).connect(actx.destination);
      o.start(t0 + d); o.stop(t0 + d + .25);
    });
  } catch { /* sin Web Audio no pasa nada */ }
}
// La cifra de un mensaje sube de 0 a su valor cuando aparece
function countUp(b) {
  const el = b.querySelector('[data-to]');
  if (!el) return;
  const to = Number(el.dataset.to), t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    el.textContent = Math.round(to * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const narrators = [];
document.querySelectorAll('.convo-play').forEach((btn) => {
  const fig = btn.closest('.convo');
  const cfg = NARR[btn.dataset.narr];
  const bubs = [...fig.querySelectorAll('.bub')];
  const label = btn.querySelector('span');
  const idle = label.textContent;
  let audio = null, raf = 0, fired = [];
  const tick = () => {
    const t = audio.currentTime;
    bubs.forEach((b, i) => {
      const on = t >= cfg.cues[i];
      if (on && !b.classList.contains('on')) countUp(b);
      b.classList.toggle('on', on);
    });
    if (cfg.end) fig.classList.toggle('closing', t >= cfg.end);
    cfg.chime.forEach((c, i) => { if (!fired[i] && t >= c) { fired[i] = true; nfcChime(); } });
    fig.style.setProperty('--p', audio.duration ? (t / audio.duration).toFixed(4) : 0);
    if (!audio.paused) raf = requestAnimationFrame(tick);
  };
  const setState = (s) => {
    fig.dataset.narr = s;
    label.textContent = s === 'playing' ? 'Pausar' : s === 'paused' ? 'Seguir' : s === 'done' ? 'Escuchar de nuevo' : idle;
    btn.setAttribute('aria-pressed', String(s === 'playing'));
  };
  const pause = () => { if (audio && !audio.paused) audio.pause(); };
  narrators.push(pause);
  btn.addEventListener('click', () => {
    if (!audio) {
      audio = new Audio(cfg.src);
      audio.preload = 'auto';
      audio.addEventListener('play', () => { setState('playing'); raf = requestAnimationFrame(tick); });
      audio.addEventListener('pause', () => { cancelAnimationFrame(raf); if (!audio.ended) setState('paused'); });
      audio.addEventListener('ended', () => {
        cancelAnimationFrame(raf);
        bubs.forEach((b) => { if (!b.classList.contains('on')) countUp(b); b.classList.add('on'); });
        if (cfg.end) fig.classList.add('closing');
        fig.style.setProperty('--p', 1); setState('done');
      });
    }
    if (!audio.paused) { audio.pause(); return; }
    narrators.forEach((p) => p !== pause && p());
    if (fig.dataset.narr !== 'paused') {
      // Empieza de cero: la conversación se arma al ritmo de la voz
      audio.currentTime = 0; fired = [];
      fig.classList.add('narr');
      fig.classList.remove('closing');
      bubs.forEach((b) => b.classList.remove('on'));
    }
    if (actx && actx.state === 'suspended') actx.resume();
    audio.play().catch(() => setState('idle'));
  });
});

const nav = document.getElementById('nav');
const onNav = () => nav.classList.toggle('scrolled', scrollY > 24);
addEventListener('scroll', onNav, { passive: true });
onNav();

/* ---------- Geometría base ---------- */
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
function faceGeometry(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 16);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getY(i) / h + .5);
  return g;
}

const CARD_W = 3.4, CARD_H = 2.14, CARD_R = .13, CARD_D = .03;
const cardEdge = new THREE.ExtrudeGeometry(roundedShape(CARD_W, CARD_H, CARD_R), {
  depth: CARD_D, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelOffset: -.006, bevelSegments: 2, curveSegments: 16,
});
cardEdge.translate(0, 0, -CARD_D / 2);
const cardFace = faceGeometry(CARD_W, CARD_H, CARD_R);

function makeCard(frontMat, backMat, edgeMat) {
  const g = new THREE.Group();
  const edge = new THREE.Mesh(cardEdge, edgeMat);
  const front = new THREE.Mesh(cardFace, frontMat);
  const back = new THREE.Mesh(cardFace, backMat);
  front.position.z = CARD_D / 2 + .0065;
  back.position.z = -(CARD_D / 2 + .0065);
  back.rotation.y = Math.PI;
  edge.castShadow = true;
  front.receiveShadow = back.receiveShadow = true;
  g.add(edge, front, back);
  return g;
}

/* ---------- Artes generados en canvas ---------- */
function canvasPair(w, h) {
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = w; a.height = b.height = h;
  return [a.getContext('2d'), b.getContext('2d')];
}
// Color y máscara van juntos: en la máscara G = rugosidad y B = metal, así el foil brilla y la base queda mate.
const MATTE = 'rgb(0,150,0)', FOIL = 'rgb(0,70,150)', PLATE = 'rgb(0,190,0)';
function both(ctxs, color, mask, fn) {
  ctxs.forEach((c, i) => {
    const style = i === 0 ? color : mask;
    c.save(); c.fillStyle = style; c.strokeStyle = style; fn(c); c.restore();
  });
}
function tinted(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function drawArcs(ctxs, cx, cy, from, to, a0, a1) {
  for (let r = from; r < to; r += 30) {
    const alpha = Math.pow(1 - (r - from) / (to - from), 1.4) * .85;
    both(ctxs, '#7fa8ff', FOIL, (c) => {
      c.globalAlpha = alpha; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    });
  }
}
function drawNfcIcon(ctxs, x, y, s, color) {
  both(ctxs, color, FOIL, (c) => {
    c.lineWidth = s * .17; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.arc(x, y, s * (.42 + i * .42), -.72, .72); c.stroke();
    }
  });
}
function faceTextures(ctxs) {
  const color = new THREE.CanvasTexture(ctxs[0].canvas);
  const mask = new THREE.CanvasTexture(ctxs[1].canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = mask.anisotropy = 8;
  return { color, mask };
}
function heroFaces(logo) {
  const W = 2048, H = 1288;
  const f = canvasPair(W, H);
  both(f, '#23201d', MATTE, (c) => c.fillRect(0, 0, W, H));
  drawArcs(f, W + 110, H + 110, 330, 1270, 0, Math.PI * 2);
  const white = tinted(logo, '#f2f4fa'), maskLogo = tinted(logo, FOIL);
  const lw = 760, lh = lw * logo.naturalHeight / logo.naturalWidth;
  f[0].drawImage(white, 110, 110, lw, lh); f[1].drawImage(maskLogo, 110, 110, lw, lh);
  drawNfcIcon(f, 1760, 240, 112, '#e8edf8');
  both(f, '#a8a299', MATTE, (c) => {
    c.font = '500 56px "Plus Jakarta Sans", sans-serif';
    c.fillText('Toca con tu celular', 118, H - 120);
  });

  const b = canvasPair(W, H);
  both(b, '#23201d', MATTE, (c) => c.fillRect(0, 0, W, H));
  drawArcs(b, -110, H + 110, 330, 1070, 0, Math.PI * 2);
  both(b, '#f4f1ec', MATTE, (c) => {
    c.font = '800 104px "Plus Jakarta Sans", sans-serif';
    c.fillText('Escanéame', 118, 240);
    c.font = '500 56px "Plus Jakarta Sans", sans-serif';
  });
  both(b, '#a8a299', MATTE, (c) => {
    c.font = '500 54px "Plus Jakarta Sans", sans-serif';
    c.fillText('y pide los precios', 118, 326);
    c.fillText('por WhatsApp', 118, 396);
  });
  const lw2 = 470, lh2 = lw2 * logo.naturalHeight / logo.naturalWidth;
  b[0].drawImage(white, 118, H - 110 - lh2, lw2, lh2); b[1].drawImage(maskLogo, 118, H - 110 - lh2, lw2, lh2);

  // Código QR real: abre nuestro WhatsApp al escanearlo desde la pantalla
  const size = 860, px = W - size - 110, py = (H - size) / 2;
  both(b, '#ffffff', PLATE, (c) => { c.beginPath(); c.roundRect(px, py, size, size, 56); c.fill(); });
  const qr = qrcode(0, 'M');
  qr.addData(WA_QR); qr.make();
  const n = qr.getModuleCount(), m = 60, cell = (size - m * 2) / n;
  b[0].fillStyle = '#141312';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) b[0].fillRect(Math.floor(px + m + c * cell), Math.floor(py + m + r * cell), Math.ceil(cell), Math.ceil(cell));
  }
  return { front: faceTextures(f), back: faceTextures(b) };
}

/* Pantallas del celular */
const SW = 720, SH = 1536;
const FONT = '"Plus Jakarta Sans", sans-serif';
function screen() {
  const c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  return c.getContext('2d');
}
function rr(c, x, y, w, h, r, fill) { c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function text(c, s, x, y, font, fill, align = 'left') { c.font = `${font} ${FONT}`; c.fillStyle = fill; c.textAlign = align; c.fillText(s, x, y); }
function statusBar(c, ink) {
  text(c, '9:41', 62, 72, '700 30px', ink);
  rr(c, SW / 2 - 90, 34, 180, 50, 25, '#000');
  rr(c, SW - 112, 50, 58, 24, 7, ink);
}
function googleG(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s / 48, s / 48);
  [['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 16.03-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.3 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z']]
    .forEach(([f, d]) => { c.fillStyle = f; c.fill(new Path2D(d)); });
  c.restore();
}
function star(c, x, y, r, fill) {
  c.fillStyle = fill; c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .46 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath(); c.fill();
}
function screenLock() {
  const c = screen();
  const g = c.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, '#26231f'); g.addColorStop(1, '#100f0e');
  c.fillStyle = g; c.fillRect(0, 0, SW, SH);
  statusBar(c, '#f4f1ec');
  text(c, '9:41', SW / 2, 330, '700 148px', '#f4f1ec', 'center');
  text(c, 'martes, 3 de noviembre', SW / 2, 395, '500 32px', '#c6c0b6', 'center');
  rr(c, 40, 1090, SW - 80, 150, 36, '#2b2824');
  text(c, 'Etiqueta NFC detectada', 76, 1152, '700 31px', '#f4f1ec');
  text(c, 'Toca para abrir el enlace', 76, 1200, '500 28px', '#b4aea4');
  return c;
}
function screenGoogle() {
  const c = screen();
  c.fillStyle = '#fff'; c.fillRect(0, 0, SW, SH);
  statusBar(c, '#1c1a17');
  googleG(c, SW / 2 - 56, 170, 112);
  text(c, 'Tu negocio', SW / 2, 370, '800 52px', '#1c1a17', 'center');
  text(c, 'Sede principal · Medellín', SW / 2, 422, '500 29px', '#6b6660', 'center');
  rr(c, 60, 480, SW - 120, 2, 0, '#e8e5e0');
  text(c, '¿Cómo fue tu experiencia?', SW / 2, 570, '700 36px', '#1c1a17', 'center');
  for (let i = 0; i < 5; i++) star(c, SW / 2 + (i - 2) * 112, 668, 48, '#f5b301');
  rr(c, 60, 770, SW - 120, 340, 24, '#f5f4f2');
  text(c, 'Excelente atención, muy', 96, 840, '500 32px', '#3a3733');
  text(c, 'amables y todo rápido.', 96, 886, '500 32px', '#3a3733');
  rr(c, 60, 1160, SW - 120, 108, 54, '#1a73e8');
  text(c, 'Publicar reseña', SW / 2, 1228, '700 36px', '#fff', 'center');
  return c;
}
function screenWhatsApp() {
  const c = screen();
  c.fillStyle = '#efe7dd'; c.fillRect(0, 0, SW, SH);
  rr(c, 0, 0, SW, 250, 0, '#075e54');
  statusBar(c, '#fff');
  c.fillStyle = '#d7efe3'; c.beginPath(); c.arc(90, 180, 42, 0, 7); c.fill();
  text(c, 'T', 90, 195, '800 42px', '#075e54', 'center');
  text(c, 'Tu negocio', 152, 172, '700 36px', '#fff');
  text(c, 'en línea', 152, 214, '500 26px', '#cfe6df');
  rr(c, 40, 310, 500, 152, 22, '#fff');
  text(c, '¡Hola! ¿En qué te', 70, 374, '500 32px', '#1c1a17');
  text(c, 'podemos ayudar hoy?', 70, 420, '500 32px', '#1c1a17');
  rr(c, 220, 500, 460, 106, 22, '#d9fdd3');
  text(c, 'Quiero pagar mi cuota', 250, 566, '500 32px', '#1c1a17');
  rr(c, 40, 644, 540, 152, 22, '#fff');
  text(c, 'Claro. Te envío el enlace', 70, 708, '500 32px', '#1c1a17');
  text(c, 'de pago por aquí mismo.', 70, 754, '500 32px', '#1c1a17');
  rr(c, 30, 1320, SW - 150, 96, 48, '#fff');
  text(c, 'Escribe un mensaje', 70, 1380, '500 30px', '#8a857e');
  c.fillStyle = '#128c7e'; c.beginPath(); c.arc(SW - 72, 1368, 48, 0, 7); c.fill();
  return c;
}
function screenInstagram() {
  const c = screen();
  c.fillStyle = '#fff'; c.fillRect(0, 0, SW, SH);
  statusBar(c, '#1c1a17');
  text(c, 'tunegocio', 50, 190, '800 38px', '#1c1a17');
  const g = c.createLinearGradient(50, 360, 210, 220);
  g.addColorStop(0, '#feda75'); g.addColorStop(.5, '#d62976'); g.addColorStop(1, '#4f5bd5');
  c.fillStyle = g; c.beginPath(); c.arc(130, 310, 86, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(130, 310, 76, 0, 7); c.fill();
  c.fillStyle = '#e7e3dc'; c.beginPath(); c.arc(130, 310, 68, 0, 7); c.fill();
  [['128', 'publicaciones'], ['8.214', 'seguidores'], ['312', 'seguidos']].forEach(([n, l], i) => {
    const x = 325 + i * 150;
    text(c, n, x, 300, '800 33px', '#1c1a17', 'center');
    text(c, l, x, 340, '500 19px', '#6b6660', 'center');
  });
  text(c, 'Tu negocio', 50, 450, '700 30px', '#1c1a17');
  text(c, 'Medellín · Pedidos por mensaje', 50, 492, '500 27px', '#4a4640');
  rr(c, 50, 530, SW - 100, 84, 18, '#0095f6');
  text(c, 'Seguir', SW / 2, 585, '700 32px', '#fff', 'center');
  const tones = ['#d7d2c9', '#c2b8a8', '#e4dfd6', '#b4a692', '#cfc7ba', '#a7998a', '#ddd7cd', '#bfb4a4', '#d2ccc1', '#aa9f90', '#e0dbd2', '#c6bbab'];
  const t = (SW - 8) / 3;
  tones.forEach((f, i) => { c.fillStyle = f; c.fillRect((i % 3) * (t + 4), 650 + Math.floor(i / 3) * (t + 4), t, t); });
  return c;
}
function screenMenu() {
  const c = screen();
  c.fillStyle = '#faf8f4'; c.fillRect(0, 0, SW, SH);
  statusBar(c, '#1c1a17');
  text(c, 'Menú de hoy', 56, 230, '800 58px', '#1c1a17');
  text(c, 'Actualizado esta mañana', 56, 282, '500 29px', '#6b6660');
  [['Entradas', null], ['Empanadas de la casa', '$12.000'], ['Ceviche de chicharrón', '$24.000'], ['Platos fuertes', null],
    ['Bandeja de la casa', '$38.000'], ['Lomo al trapo', '$46.000'], ['Trucha a la plancha', '$41.000'], ['Bebidas', null],
    ['Limonada de coco', '$11.000'], ['Café de origen', '$7.000']].reduce((y, [n, p]) => {
    if (!p) { text(c, n, 56, y + 44, '700 28px', '#2563eb'); return y + 76; }
    text(c, n, 56, y + 44, '600 33px', '#1c1a17');
    text(c, p, SW - 56, y + 44, '600 31px', '#4a4640', 'right');
    rr(c, 56, y + 78, SW - 112, 2, 0, '#e8e5e0');
    return y + 104;
  }, 330);
  return c;
}

function stickerArt(logo) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ec'; x.fillRect(0, 0, 1024, 1024);
  x.strokeStyle = '#2563eb'; x.lineCap = 'round';
  x.lineWidth = 34;
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(400, 410, 70 + i * 75, -.75, .75); x.stroke(); }
  const w = 470, h = w * logo.naturalHeight / logo.naturalWidth;
  x.drawImage(tinted(logo, '#191715'), 512 - w / 2, 690, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- Estudio de luz (sin HDR que descargar) ---------- */
function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x151412, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, v, tint = 0xffffff) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(v), side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(14, 5, 0, 12, 4, 7);
  panel(3, 14, -12, 2, 6, 11);
  panel(2, 12, 12, -1, 7, 6, 0xcfdcff);
  panel(10, 2, 0, -9, 9, 2.2);
  panel(5, 5, 4, 3, 13, 1.6);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, .025).texture;
  pm.dispose();
  return env;
}

/* ---------- Fondo: color por escena, ondas NFC, luz y grano en un solo shader ---------- */
const hex = (h) => new THREE.Color().setHex(h, THREE.LinearSRGBColorSpace); // el shader trabaja directo en sRGB
const BG_KEYS = [
  { t: 0, core: 0x2f6bff, edge: 0x0e2f9e, ring: 0xffffff, ringA: .15, lamp: 0x6d9bff, lampA: .3, light: 0 },
  { t: 1, core: 0x2459e6, edge: 0x0b2a8a, ring: 0xffffff, ringA: .15, lamp: 0x6d9bff, lampA: .28, light: 0 },
  { t: 2, core: 0x173fae, edge: 0x081d63, ring: 0xdfe9ff, ringA: .11, lamp: 0x4f7fe8, lampA: .24, light: 0 },
  { t: 3, core: 0xfdfaf4, edge: 0xe7e0d3, ring: 0x2563eb, ringA: .2, lamp: 0xffffff, lampA: .1, light: 1 },
  { t: 4, core: 0xfefcf8, edge: 0xebe5da, ring: 0x2563eb, ringA: .2, lamp: 0xffffff, lampA: .1, light: 1 },
  { t: 5, core: 0x2b2824, edge: 0x141312, ring: 0x6d9bff, ringA: .1, lamp: 0x4a6fb5, lampA: .2, light: 0 },
  { t: 6, core: 0xf4f0e8, edge: 0xf4f0e8, ring: 0x2563eb, ringA: 0, lamp: 0xffffff, lampA: 0, light: 1 },
  { t: 6.1, core: 0x2f6bff, edge: 0x0e2f9e, ring: 0xffffff, ringA: .15, lamp: 0x6d9bff, lampA: .3, light: 0 },
  { t: 7, core: 0x2f6bff, edge: 0x0e2f9e, ring: 0xffffff, ringA: .15, lamp: 0x6d9bff, lampA: .3, light: 0 },
].map((k) => ({ ...k, core: hex(k.core), edge: hex(k.edge), ring: hex(k.ring), lamp: hex(k.lamp) }));
const SHADOWS = 7;

function makeBackground() {
  const uniforms = {
    uHalf: { value: new THREE.Vector2(4, 2.4) },
    uCore: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uRing: { value: new THREE.Color() },
    uLamp: { value: new THREE.Color() },
    uRingA: { value: 0 },
    uLampA: { value: 0 },
    uFocus: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2() },
    uPhase: { value: 0 },
    uPulse: { value: 0 },
    uPulseR: { value: 0 },
    uSeed: { value: 0 },
    uS: { value: Array.from({ length: SHADOWS }, () => new THREE.Vector4(0, 0, 1, 1)) },
    uSA: { value: new Array(SHADOWS).fill(0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1., 1.); }',
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 uHalf, uFocus, uMouse;
      uniform vec3 uCore, uEdge, uRing, uLamp;
      uniform float uRingA, uLampA, uPhase, uPulse, uPulseR, uSeed;
      uniform vec4 uS[${SHADOWS}];
      uniform float uSA[${SHADOWS}];
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = (vUv * 2. - 1.) * uHalf;
        float d = length(p - uFocus);
        float r = max(uHalf.x, uHalf.y) * 1.2;
        vec3 col = mix(uCore, uEdge, smoothstep(0., 1., clamp(d / r, 0., 1.)));

        // Ondas NFC: anillos finos alrededor del objeto, con un frente que late al tocar
        float x = (d - uPhase) / .62;
        float line = 1. - smoothstep(0., fwidth(x) * 1.25, abs(fract(x) - .5));
        float env = smoothstep(r * 1.15, .9, d) * smoothstep(.15, 1.1, d);
        float wave = exp(-pow((d - uPulseR) * 1.5, 2.)) * uPulse;
        col = mix(col, uRing, clamp(uRingA * env * line * (1. + wave * 3.2), 0., 1.));
        col += uRing * wave * env * .05;

        // Luz que sigue al mouse
        vec2 m = p - uMouse;
        col += uLamp * uLampA * exp(-dot(m, m) / 2.6);

        // Sombra suave de cada objeto sobre el fondo
        float s = 0.;
        for (int i = 0; i < ${SHADOWS}; i++) {
          s += uSA[i] * smoothstep(1.5, .15, length((p - uS[i].xy) / max(uS[i].zw, vec2(.01))));
        }
        col *= 1. - .34 * min(s, 1.);

        // Grano fino: da textura y evita bandas en el degradado
        col += (hash(gl_FragCoord.xy + uSeed) - .5) * .032;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/* ---------- Arranque ---------- */
function load(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function fontsReady() {
  await Promise.race([
    Promise.all(['500 40px', '700 40px', '800 40px'].map((f) => document.fonts.load(`${f} "Plus Jakarta Sans"`))),
    new Promise((r) => setTimeout(r, 1800)),
  ]).catch(() => {});
}

async function main() {
  const canvas = document.getElementById('stage');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    document.body.classList.add('no3d');
    return;
  }
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  await fontsReady();
  const logo = await load('art/nfcloud-blanco.png');

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 60);
  camera.position.z = 9;
  const root = new THREE.Group();
  scene.add(root);

  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(-3.5, 5.5, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 22 });
  key.shadow.radius = 5;
  key.shadow.bias = -.0004;
  key.shadow.normalBias = .012;
  scene.add(key);
  const fill = new THREE.HemisphereLight(0xffffff, 0x000000, .4);
  scene.add(fill);
  const bg = makeBackground();
  scene.add(bg.mesh);

  /* Tarjeta protagonista */
  const hero = heroFaces(logo);
  const heroMat = (f) => new THREE.MeshPhysicalMaterial({
    map: f.color, roughnessMap: f.mask, metalnessMap: f.mask, roughness: 1, metalness: 1,
    clearcoat: .25, clearcoatRoughness: .35, envMapIntensity: 1.35,
  });
  const edgeBlue = new THREE.MeshStandardMaterial({ color: 0x4d86ff, metalness: .7, roughness: .3, emissive: 0x12307a, emissiveIntensity: .5 });
  const card = makeCard(heroMat(hero.front), heroMat(hero.back), edgeBlue);
  root.add(card);

  // Ondas NFC que salen del ícono de la tarjeta
  const ringGeo = new THREE.RingGeometry(.975, 1, 96);
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(1.0, .6, .04);
    card.add(m);
    return m;
  });

  /* Celular */
  const PW = 1.46, PH = 3, PD = .11;
  const phone = new THREE.Group();
  const bodyGeo = new THREE.ExtrudeGeometry(roundedShape(PW, PH, .235), {
    depth: PD, bevelEnabled: true, bevelThickness: .022, bevelSize: .022, bevelOffset: -.022, bevelSegments: 4, curveSegments: 20,
  });
  bodyGeo.translate(0, 0, -PD / 2);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x3a3733, metalness: 1, roughness: .34, envMapIntensity: 1.3 }));
  body.castShadow = true;
  const screenGeo = faceGeometry(PW - .08, PH - .08, .2);
  const screens = [screenLock(), screenGoogle(), screenWhatsApp(), screenInstagram(), screenMenu()].map((c) => {
    const t = new THREE.CanvasTexture(c.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    renderer.initTexture(t);
    return t;
  });
  const screenNow = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: screens[0], toneMapped: false }));
  const screenOld = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: screens[0], toneMapped: false, transparent: true, opacity: 0 }));
  const glass = new THREE.Mesh(screenGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .07, roughness: .04, metalness: 0, envMapIntensity: 2.4 }));
  const zf = PD / 2 + .0225;
  screenNow.position.z = zf; screenOld.position.z = zf + .001; glass.position.z = zf + .002;
  const side = new THREE.MeshStandardMaterial({ color: 0x2a2825, metalness: 1, roughness: .4 });
  const btn = new THREE.BoxGeometry(.02, .26, .05);
  [[PW / 2 + .004, .55], [-PW / 2 - .004, .72], [-PW / 2 - .004, .38]].forEach(([x, y]) => {
    const b = new THREE.Mesh(btn, side); b.position.set(x, y, 0); phone.add(b);
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .03, 32), side);
  lens.rotation.x = Math.PI / 2; lens.position.set(-.36, 1.15, -PD / 2 - .03);
  phone.add(body, screenNow, screenOld, glass, lens);
  root.add(phone);

  /* Hablador en acrílico */
  const tl = new THREE.TextureLoader();
  const tex = (src) => {
    const t = tl.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .13, roughness: .03, metalness: 0, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: .03, depthWrite: false, side: THREE.DoubleSide });
  const acrylicEdge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .42 });
  const HW = 2.5, HH = 3.235;
  const stand = new THREE.Group();
  const printMat = (m) => new THREE.MeshStandardMaterial({ map: m, roughness: .5, metalness: 0, envMapIntensity: .75 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xefece6, roughness: .8 });
  const printing = new THREE.Mesh(new THREE.BoxGeometry(HW, HH, .008), [paper, paper, paper, paper, printMat(tex('art/hab-lalico.webp')), printMat(tex('art/hab-riovivo.webp'))]);
  printing.castShadow = true;
  stand.add(printing);
  const sheet = (w, h, d, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, acrylic);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), acrylicEdge));
    m.position.set(x, y, z); m.renderOrder = 2;
    stand.add(m);
    return m;
  };
  sheet(HW + .1, HH + .12, .022, 0, 0, .03);
  sheet(HW + .1, HH + .12, .022, 0, 0, -.03);
  sheet(HW + .62, .035, 1.05, 0, -HH / 2 - .075, 0);
  root.add(stand);

  /* Sticker */
  const stickerWrap = new THREE.Group();
  const stickerFace = new THREE.Mesh(new THREE.CircleGeometry(.62, 72), new THREE.MeshPhysicalMaterial({ map: stickerArt(logo), roughness: .3, clearcoat: .6, clearcoatRoughness: .2 }));
  stickerFace.position.z = .008;
  const stickerBody = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .014, 72), new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: .4 }));
  stickerBody.rotation.x = Math.PI / 2;
  stickerBody.castShadow = true;
  stickerWrap.add(stickerBody, stickerFace);
  root.add(stickerWrap);

  /* Tarjetas de clientes que autorizaron mostrar su marca */
  const whiteEdge = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: .5 });
  const darkEdge = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: .4, metalness: .4 });
  const cardBack = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: .55 });
  const artMat = (src) => new THREE.MeshPhysicalMaterial({ map: tex(src), roughness: .42, clearcoat: .35, clearcoatRoughness: .28, envMapIntensity: .75 });
  const deck = [
    makeCard(artMat('art/card-riovivo.webp'), cardBack, whiteEdge),
    makeCard(artMat('art/card-lalico.webp'), new THREE.MeshStandardMaterial({ color: 0x050605, roughness: .5 }), darkEdge),
    makeCard(artMat('art/card-inplux.webp'), new THREE.MeshStandardMaterial({ color: 0x0b0e13, roughness: .5 }), darkEdge),
  ];
  deck.forEach((d) => root.add(d));

  /* Maqueta de la cadena: una columna por sede */
  const GRID = 9, cell = .36;
  const grid = new THREE.Group();
  const baseSize = GRID * cell + .3;
  const baseGeo = new THREE.ExtrudeGeometry(roundedShape(baseSize, baseSize, .12), { depth: .05, bevelEnabled: false, curveSegments: 10 });
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: .55, metalness: .3 }));
  base.position.y = -.05;
  base.receiveShadow = true;
  grid.add(base);
  const barGeo = new THREE.BoxGeometry(cell * .68, 1, cell * .68);
  barGeo.translate(0, .5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .15, envMapIntensity: .8 }), GRID * GRID);
  bars.castShadow = bars.receiveShadow = true;
  const BEST = 2 * GRID + 3, WORST = 7 * GRID + 8;
  const barData = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const low = new THREE.Color(0x1d4ed8), high = new THREE.Color(0x93c5fd), alert = new THREE.Color(0xc2594b), col = new THREE.Color();
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
    const i = z * GRID + x;
    let h = (.3 + rnd() * rnd() * 1.5 + rnd() * .35) * (1 - .38 * (x + z) / (2 * GRID - 2));
    if (i === BEST) h = 1.85;
    if (i === WORST) h = .2;
    const px = (x - (GRID - 1) / 2) * cell, pz = (z - (GRID - 1) / 2) * cell;
    barData.push({ px, pz, h, d: Math.hypot(px, pz) / (cell * GRID * .72) });
    if (i === WORST) col.copy(alert);
    else col.copy(low).lerp(high, clamp(h / 1.5));
    bars.setColorAt(i, col);
  }
  grid.add(bars);
  root.add(grid);

  // Objeto, media medida de su sombra y si se aplana al girar
  const shadowed = [
    { o: card, rx: 1.95, ry: 1.3, turn: true },
    { o: phone, rx: .95, ry: 1.75, turn: false },
    { o: stand, rx: 1.5, ry: 1.9, turn: false },
    { o: stickerWrap, rx: .72, ry: .72, turn: false },
    { o: deck[0], rx: 1.95, ry: 1.3, turn: false },
    { o: deck[1], rx: 1.95, ry: 1.3, turn: false },
    { o: deck[2], rx: 1.95, ry: 1.3, turn: false },
  ];

  /* ---------- Poses por escena ---------- */
  const OFF = { p: [0, -8, 0], r: [0, 0, 0], s: 0 };
  let tracks = [], focusKeys = [];
  let wide = true, W = 4, H = 2.41, sx = 0, sy = 0, k = 1;
  function buildTracks() {
    const P = (x, y, z = 0) => [x, y, z];
    const offR = W + 2.6;
    const ox = wide ? 1 : .42; // en vertical hay menos ancho: los objetos se separan menos
    const heroS = wide ? k * .96 : k * 1.02;
    focusKeys = [
      [sx, sy], [sx, sy - .1 * k], [sx + .3 * k * ox, sy], [-sx + .1 * k, sy + .16 * k],
      [sx * .92, sy], [wide ? sx * .9 : 0, wide ? 0 : sy - .1], [sx, sy], [sx, wide ? 0 : sy],
    ];
    tracks = [
      { o: card, keys: [
        { p: P(sx, sy), r: [-.14, 0, .06], s: heroS },
        { p: P(sx - .42 * k * ox, sy - .3 * k), r: [-.82, .26, .1], s: k * (wide ? .98 : .86) },
        { p: P(sx - 1.08 * k * ox, sy - .78 * k, -1.1), r: [-.2, .72, .12], s: k * .74 },
        { p: P(-sx + 1.12 * k * (wide ? 1 : .6), sy - .92 * k, 1), r: [-.24, -.42, -.06], s: k * .42 },
        { p: P(sx, sy + 3.4, -1), r: [-.9, 1.1, .3], s: 0 },
        { p: P(sx, sy, -.5), r: [-.62, .42, .16], s: 0 },
        { p: P(sx, sy, -.5), r: [0, 2.4, 0], s: 0 },
        { p: P(sx, wide ? 0 : sy), r: [-.05, Math.PI, 0], s: wide ? k * .98 : 0 },
      ] },
      { o: phone, keys: [
        { p: P(offR, sy + 1.2, 1), r: [-.3, -.7, -.35], s: k * .8 },
        { p: P(sx + .78 * k * (wide ? 1 : .55), sy + .3 * k, .95), r: [-.5, .26, -.26], s: k * .72 },
        { p: P(sx + .3 * k * ox, sy - (wide ? .02 : .14), .35), r: [.03, -.3, .03], s: k * (wide ? .98 : .84) },
        { p: P(offR + 1, sy - .4, 0), r: [.1, -1.3, .2], s: k * .9 },
        OFF, OFF, OFF, OFF,
      ] },
      { o: stand, keys: [
        OFF, OFF,
        { p: P(-sx - 1, sy - 6, 0), r: [.2, -1.9, 0], s: k * .8 },
        { p: P(-sx + .1 * k, sy + .16 * k, 0), r: [-.02, .4, 0], s: k * (wide ? .84 : .62) },
        { p: P(-sx - 1, sy + 6.5, 0), r: [-.2, 1.8, 0], s: k * .8 },
        OFF, OFF, OFF,
      ] },
      { o: stickerWrap, keys: [
        OFF, OFF,
        { p: P(-sx + 2.6, sy - 5, 1), r: [1, -1, 0], s: k * .55 },
        { p: P(-sx + 1.36 * k * (wide ? 1 : .62), sy + 1.02 * k, .55), r: [.14, -.46, .1], s: k * .56 },
        { p: P(-sx + 3.2, sy + 5, 1), r: [-1, 1, 0], s: k * .55 },
        OFF, OFF, OFF,
      ] },
      ...deck.map((o, i) => {
        const col = i === 2 ? 0 : i ? 1 : -1;
        const pose = wide
          ? { p: P(sx * .92 + col * .9 * k, sy + [.5, .3, -.62][i] * k, [-.3, 0, .35][i]), r: [-.1, -.2 * col + .08, .035], s: k * .5 }
          : { p: P(sx + col * .05, sy - .1 + (1 - i) * 1.1 * k, i * .2 - .4), r: [-.28, .18, .05], s: k * .5 };
        return { o, keys: [
          OFF, OFF, OFF,
          { p: P(sx + (i - 1) * 1.1, -6.5, -1.5), r: [-1, -.4 + i * .6, .4], s: k * .8 },
          pose,
          { p: P(sx, sy, -.5), r: [-.62, .42, .16], s: 0 },
          OFF, OFF,
        ] };
      }),
    ];
  }

  function applyTrack(tr, t) {
    const a = clamp(Math.floor(t), 0, tr.keys.length - 1);
    const b = clamp(a + 1, 0, tr.keys.length - 1);
    const f = smoother(clamp(t - a));
    const A = tr.keys[a], B = tr.keys[b];
    const s = lerp(A.s, B.s, f);
    const o = tr.o;
    o.visible = s > .004;
    if (!o.visible) return;
    o.position.set(lerp(A.p[0], B.p[0], f), lerp(A.p[1], B.p[1], f), lerp(A.p[2], B.p[2], f));
    o.rotation.set(lerp(A.r[0], B.r[0], f), lerp(A.r[1], B.r[1], f), lerp(A.r[2], B.r[2], f));
    o.scale.setScalar(s);
  }

  /* ---------- Scroll → t ---------- */
  const panels = [...document.querySelectorAll('.scene')].map((sec) => ({
    i: Number(sec.dataset.scene), sec, panel: sec.querySelector('.panel'),
  }));
  const qrHint = document.querySelector('.qr-hint');
  let stops = [], solidTop = 0, contactTop = 0;
  function buildStops() {
    const vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    stops = panels.map(({ i, sec }) => [i === 0 ? 0 : top(sec) + (sec.offsetHeight - vh) / 2, i]);
    const contact = document.getElementById('contacto');
    const solid = document.querySelector('.solid');
    solidTop = top(solid); contactTop = top(contact);
    stops.push([top(solid), 6], [top(contact) - vh, 6], [Math.min(max, top(contact) + (contact.offsetHeight - vh) / 2), 7]);
  }
  function scrollToT(y) {
    if (y <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (y <= stops[i][0]) {
        const [y0, t0] = stops[i - 1], [y1, t1] = stops[i];
        return y1 === y0 ? t1 : lerp(t0, t1, (y - y0) / (y1 - y0));
      }
    }
    return stops[stops.length - 1][1];
  }

  function resize() {
    const w = innerWidth, h = canvas.clientHeight || innerHeight;
    wide = w / h >= 23 / 20;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    H = Math.tan(THREE.MathUtils.degToRad(15)) * camera.position.z;
    W = H * camera.aspect;
    bg.uniforms.uHalf.value.set(W, H);
    if (wide) {
      k = Math.min(1.08, W / 3.7);
      sx = W * .52; sy = 0;
    } else {
      k = Math.min(1.02, W * 2 / 3.55);
      sx = 0; sy = H * .46;
    }
    buildTracks();
    buildStops();
  }

  /* ---------- Interacción ---------- */
  let mx = 0, my = 0, smx = 0, smy = 0, lamp = 0, lampOn = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    lampOn = 1;
    mx = e.clientX / innerWidth * 2 - 1;
    my = e.clientY / innerHeight * 2 - 1;
  }, { passive: true });
  // Arrastrar con el mouse hace girar la tarjeta del inicio
  let drag = null, spin = 0, spinV = REDUCED ? 0 : 7;
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && tNow < .4 && !e.target.closest('a,button,input,select')) { drag = e.clientX; document.body.style.cursor = 'grabbing'; }
  });
  addEventListener('pointermove', (e) => {
    if (drag === null) return;
    spinV = (e.clientX - drag) * .22;
    drag = e.clientX;
  }, { passive: true });
  addEventListener('pointerup', () => { drag = null; document.body.style.cursor = ''; });

  const destItems = [...document.querySelectorAll('#destList li')];
  let screenIdx = 0, fade = 0, destIdx = -1;
  function setScreen(i) {
    if (i === screenIdx) return;
    screenOld.material.map = screens[screenIdx];
    screenOld.material.opacity = 1;
    screenOld.material.needsUpdate = true;
    screenNow.material.map = screens[i];
    screenNow.material.needsUpdate = true;
    screenIdx = i;
    fade = 1;
  }

  const counters = [...document.querySelectorAll('[data-count]')].map((el) => ({ el, v: Number(el.dataset.count) }));
  const fmt = new Intl.NumberFormat('es-CO');
  const pinBest = document.getElementById('pinBest'), pinWorst = document.getElementById('pinWorst');
  const v3 = new THREE.Vector3(), mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  function placePin(el, bar, op) {
    el.style.opacity = op;
    if (op <= 0) return;
    v3.set(bar.px, bar.h + .02, bar.pz);
    grid.localToWorld(v3).project(camera);
    const pw = el.offsetWidth, ph = el.offsetHeight;
    const x = clamp((v3.x + 1) / 2 * innerWidth - pw / 2, 10, innerWidth - pw - 10);
    const y = clamp((1 - v3.y) / 2 * canvas.clientHeight - ph - 10, 66, innerHeight - ph - 8);
    el.style.transform = `translate(${x}px,${y}px)`;
  }

  /* ---------- Fondo y tema según t ---------- */
  const navEl = document.getElementById('nav');
  const scrim = document.getElementById('scrim');
  const acrylicDark = new THREE.Color(0x6f6a62), acrylicLight = new THREE.Color(0xffffff);
  let navTheme = 'theme-blue', scrimColor = '';
  function updateNav(t) {
    const y = scrollY + 60;
    const overContact = y >= contactTop, overSolid = y >= solidTop && !overContact;
    const theme = overContact ? 'theme-blue' : overSolid || (t >= 2.5 && t < 4.5) || t >= 5.5 ? 'theme-light' : t < 2.5 ? 'theme-blue' : 'theme-dark';
    if (theme !== navTheme) {
      navEl.classList.replace(navTheme, theme);
      navTheme = theme;
    }
    navEl.classList.toggle('on-solid', overSolid);
  }
  function updateBackground(t, time, dt, toque) {
    const u = bg.uniforms;
    let i = 0;
    while (i < BG_KEYS.length - 2 && t > BG_KEYS[i + 1].t) i++;
    const A = BG_KEYS[i], B = BG_KEYS[i + 1];
    const f = smoother(clamp((t - A.t) / (B.t - A.t)));
    u.uCore.value.copy(A.core).lerp(B.core, f);
    u.uEdge.value.copy(A.edge).lerp(B.edge, f);
    u.uRing.value.copy(A.ring).lerp(B.ring, f);
    u.uLamp.value.copy(A.lamp).lerp(B.lamp, f);
    u.uRingA.value = lerp(A.ringA, B.ringA, f);
    lamp += (lampOn - lamp) * (1 - Math.exp(-dt * 3));
    u.uLampA.value = lerp(A.lampA, B.lampA, f) * lamp;
    const light = lerp(A.light, B.light, f);

    const ka = clamp(Math.floor(t), 0, 7), kb = clamp(ka + 1, 0, 7), kf = smoother(clamp(t - ka));
    u.uFocus.value.set(lerp(focusKeys[ka][0], focusKeys[kb][0], kf), lerp(focusKeys[ka][1], focusKeys[kb][1], kf));
    u.uMouse.value.set(smx * W, -smy * H);

    // Las ondas se abren al bajar y laten solas; el frente fuerte sale al tocar la tarjeta
    u.uPhase.value = t * .55 + (REDUCED ? 0 : time * .07);
    const ph = REDUCED ? .5 : (time * .42) % 1;
    u.uPulseR.value = .3 + ph * 6;
    u.uPulse.value = Math.max(toque, (1 - sstep(.1, .4, t)) * .35) * (1 - ph);
    u.uSeed.value = REDUCED ? 0 : Math.floor(time * 12) % 97;

    // Sombras
    shadowed.forEach((sh, n) => {
      const on = sh.o.visible && t < 5.6;
      const s = on ? sh.o.scale.x : 0;
      const narrow = sh.turn ? Math.max(.22, Math.abs(Math.cos(sh.o.rotation.y))) : 1;
      u.uS.value[n].set(sh.o.position.x + .16 * s, sh.o.position.y - .3 * s, sh.rx * s * narrow, sh.ry * s);
      u.uSA.value[n] = on ? clamp(s / .25) : 0;
    });

    // Las luces 3D acompañan al fondo
    fill.color.copy(u.uCore.value);
    fill.groundColor.copy(u.uEdge.value);
    fill.intensity = lerp(.25, 1.05, light); // en azul la tarjeta sigue negra; en hueso el blanco no se agrisa
    acrylicEdge.color.copy(acrylicLight).lerp(acrylicDark, light);
    acrylic.opacity = lerp(.13, .09, light); // sobre hueso, más opaco lavaba el arte oscuro del hablador

    if (!wide) {
      const c = u.uEdge.value;
      const css = `${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)}`;
      if (css !== scrimColor) {
        scrimColor = css;
        scrim.style.setProperty('--c', css);
      }
    }
  }

  /* ---------- Bucle ---------- */
  let tNow = 0, last = performance.now(), intro = 0, quality = innerWidth < 760 ? 1.75 : 2, slow = 0, frames = 0;
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality));
  resize();
  buildStops();
  tNow = scrollToT(scrollY);
  addEventListener('resize', resize);
  new ResizeObserver(buildStops).observe(document.body);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.25, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    const target = scrollToT(scrollY);
    tNow += (target - tNow) * (REDUCED ? 1 : 1 - Math.exp(-dt * 6.5));
    if (Math.abs(target - tNow) < .0004) tNow = target;
    const t = tNow;

    // Textos: cada panel aparece cerca de su escena
    for (const p of panels) {
      const d = Math.abs(t - p.i);
      const op = 1 - sstep(.28, .45, d);
      p.panel.style.opacity = op;
      p.panel.style.transform = `translateY(${(p.i - t) * 46}px)`;
      p.panel.style.visibility = op < .01 ? 'hidden' : 'visible';
    }
    if (qrHint) qrHint.style.opacity = sstep(6.8, 7, t);
    updateNav(t);

    // Con la página sólida encima no hay nada que dibujar
    if (t === 6) return;

    intro = Math.min(1, intro + dt / 1.5);
    const introE = REDUCED ? 1 : 1 - Math.pow(1 - intro, 4);

    smx += (mx - smx) * (1 - Math.exp(-dt * 4));
    smy += (my - smy) * (1 - Math.exp(-dt * 4));
    root.rotation.y = smx * .09;
    root.rotation.x = smy * .05;
    key.position.x = -3.5 + smx * 2.5;

    for (const tr of tracks) applyTrack(tr, t);

    // Giro libre de la tarjeta en el inicio; se apaga al bajar
    const w = 1 - sstep(.05, .55, t);
    const cruise = REDUCED ? 0 : .62;
    if (drag === null) spinV += (cruise * w - spinV) * (1 - Math.exp(-dt * 1.6));
    spin += spinV * dt * (drag !== null ? 1 : w + .001);
    if (w < 1 && drag === null) {
      const n = Math.round(spin / (Math.PI * 2)) * Math.PI * 2;
      spin += (n - spin) * (1 - w) * (1 - Math.exp(-dt * 5));
    }
    card.rotation.y += spin;
    card.position.y += REDUCED ? 0 : Math.sin(time * .9) * .035;
    card.position.z += (1 - introE) * -5;
    card.scale.multiplyScalar(lerp(.6, 1, introE));

    if (stand.visible) stand.rotation.y += (t - 3) * .7 + Math.sin(time * .5) * .05;
    if (stickerWrap.visible) stickerWrap.rotation.y += Math.sin(time * .7) * .14;
    if (phone.visible) phone.position.y += REDUCED ? 0 : Math.sin(time * 1.1 + 1) * .022;
    deck.forEach((d, i) => {
      if (d.visible) { d.rotation.y += (t - 4) * .45; d.position.y += (t - 4) * (i % 2 ? .35 : -.2) + Math.sin(time * .9 + i * .9) * .02; }
    });

    // Ondas: tenues en el inicio, fuertes cuando el celular toca
    const toque = sstep(.72, .98, t) * (1 - sstep(1.3, 1.6, t));
    const ringW = toque + (1 - sstep(.1, .4, t)) * .18;
    rings.forEach((m, i) => {
      const ph = REDUCED ? .5 : (time * .55 + i / 3) % 1;
      m.visible = ringW > .01;
      m.material.opacity = ringW * Math.pow(1 - ph, 1.6) * .9;
      m.scale.setScalar(.12 + ph * 1.5);
    });

    // Pantalla del celular según la escena
    if (phone.visible) {
      let idx = 0;
      if (t > .84) idx = 1;
      if (t > 1.5) {
        const d = clamp(Math.floor(clamp((t - 1.68) / .66) * 4), 0, 3);
        idx = d + 1;
      }
      setScreen(idx);
    }
    const dst = t < 1.5 ? 0 : clamp(Math.floor(clamp((t - 1.68) / .66) * 4), 0, 3);
    if (dst !== destIdx) {
      destIdx = dst;
      destItems.forEach((li, i) => li.classList.toggle('active', i === dst));
    }
    if (fade > 0) {
      fade = Math.max(0, fade - dt / .28);
      screenOld.material.opacity = fade;
      screenOld.visible = fade > 0;
    } else {
      screenOld.visible = false;
    }

    // Maqueta de sedes
    const gs = sstep(4.3, 4.72, t) * (1 - sstep(5.45, 5.92, t));
    grid.visible = gs > .004;
    if (grid.visible) {
      const gk = (wide ? k * .8 : k * .78);
      grid.scale.setScalar(gk * lerp(.8, 1, gs));
      grid.position.set(wide ? sx * .9 : 0, (wide ? -.62 : sy - .56) + (1 - gs) * -1.2, 0);
      grid.rotation.set(.62, -.72 + (t - 5) * .5, 0);
      q.identity();
      barData.forEach((b, i) => {
        const g = smoother(clamp((t - 4.5 - b.d * .22) / .3)) * (1 - sstep(5.5, 5.9, t));
        sc.set(1, Math.max(.001, b.h * g), 1);
        v3.set(b.px, 0, b.pz);
        mat4.compose(v3, q, sc);
        bars.setMatrixAt(i, mat4);
      });
      bars.instanceMatrix.needsUpdate = true;
    }

    // Cifras del panel
    const cnt = smoother(clamp((t - 4.55) / .4));
    counters.forEach((c) => { c.el.textContent = fmt.format(Math.round(c.v * cnt)); });

    updateBackground(t, time, dt, toque);
    renderer.render(scene, camera);

    // Etiquetas (después de render: matrices al día)
    const pinOp = (grid.visible ? 1 : 0) * sstep(4.82, 4.98, t) * (1 - sstep(5.2, 5.36, t));
    placePin(pinBest, barData[BEST], pinOp);
    placePin(pinWorst, barData[WORST], pinOp);

    // En equipos lentos baja resolución y quita sombras
    frames++;
    if (dt > .034) slow++;
    if (frames === 40) {
      if (slow > 24 && quality > 1 && document.visibilityState === 'visible') {
        quality = 1;
        renderer.shadowMap.enabled = false;
        key.castShadow = false;
        scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
        resize();
      }
      frames = 0; slow = 0;
    }
  }
  requestAnimationFrame((n) => { last = n; frame(n); canvas.classList.add('ready'); });
}

// Primero se anima el titular; la escena se arma después para no bloquearlo
const start = () => setTimeout(() => main().catch((err) => {
  console.error(err);
  document.body.classList.add('no3d');
}), 500);
if (document.readyState === 'complete') start();
else addEventListener('load', start, { once: true });
