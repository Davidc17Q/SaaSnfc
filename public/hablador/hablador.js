// Piezas gráficas compartidas por los habladores (vectoriales, nítidas en imprenta).

if (location.hash === '#corte') document.documentElement.classList.add('corte');

// Exportación por capas (PSD): #capa=Nombre deja visible solo esa capa.
const CAPA = decodeURIComponent((location.hash.match(/^#capa=(.+)$/) || [])[1] || '');
function applyCapa() {
  if (!CAPA) return;
  document.documentElement.classList.add('capas');
  document.querySelectorAll('[data-capa]').forEach((e) => {
    e.style.visibility = e.dataset.capa === CAPA ? 'visible' : 'hidden';
  });
}

// Paleta de la marca: cada pieza puede definir window.PAL antes de cargar este archivo.
const PAL = Object.assign(
  { tapA: '#0067a9', tapB: '#00aa61', w1: '#0067a9', w2: '#0098a6', w3: '#00aa61' },
  window.PAL || {}
);

const ICON = {
  tiktok: `<svg viewBox="-1 -1 26 26"><path fill="#25F4EE" transform="translate(-0.9 -0.7)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#FE2C55" transform="translate(0.9 0.7)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#000" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24"><defs><radialGradient id="igGrad" cx="0.3" cy="1.07" r="1.25"><stop offset="0" stop-color="#fdd56a"/><stop offset=".12" stop-color="#fdd56a"/><stop offset=".45" stop-color="#f4483c"/><stop offset=".7" stop-color="#d6249f"/><stop offset="1" stop-color="#5b4ad6"/></radialGradient></defs><path fill="url(#igGrad)" d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>`,
  google: `<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`,
};

let uid = 0;

/** QR vectorial: un solo path, módulos cuadrados, sin margen propio. */
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="#14212b" d="${d}"/></svg>`;
}

/** Coloca un QR dentro de su tarjeta blanca (x, y, lado en mm; pad interno). */
function placeQr(parent, x, y, size, text, pad = 4) {
  const el = document.createElement('div');
  el.className = 'qr';
  Object.assign(el.style, { left: x + 'mm', top: y + 'mm', width: size + 'mm', height: size + 'mm' });
  el.innerHTML = qrSvg(text);
  const svg = el.firstChild;
  Object.assign(svg.style, { left: pad + 'mm', top: pad + 'mm', width: size - 2 * pad + 'mm', height: size - 2 * pad + 'mm' });
  parent.appendChild(el);
  return el;
}

/**
 * Zona para tocar: disco central con el símbolo sin contacto y anillos que
 * se abren y se desvanecen, en el degradado azul → verde de la marca.
 */
function tapSvg(rings = 4) {
  const id = 'g' + uid++;
  let ringEls = '';
  for (let i = 0; i < rings; i++) {
    const r = 27 + i * 6.2;
    const op = (0.9 - i * 0.2).toFixed(2);
    const w = (1.1 - i * 0.18).toFixed(2);
    ringEls += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}" opacity="${op}"/>`;
  }
  return `<svg viewBox="0 0 100 100">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${PAL.tapA}"/><stop offset="1" stop-color="${PAL.tapB}"/></linearGradient></defs>
    ${ringEls}
    <circle cx="50" cy="50" r="21" fill="url(#${id})"/>
    <g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" transform="translate(50 50)">
      <path d="M-7.5,-8.5 A12,12 0 0 1 -7.5,8.5" transform="translate(-2 0)"/>
      <path d="M-1.5,-12.5 A17.5,17.5 0 0 1 -1.5,12.5" transform="translate(-2 0)"/>
      <path d="M4.5,-16 A22.5,22.5 0 0 1 4.5,16" transform="translate(-2 0)" opacity=".9"/>
    </g>
  </svg>`;
}

function placeTap(parent, cx, cy, d) {
  const el = document.createElement('div');
  el.className = 'tap';
  Object.assign(el.style, { left: cx - d / 2 + 'mm', top: cy - d / 2 + 'mm', width: d + 'mm', height: d + 'mm' });
  el.innerHTML = tapSvg();
  parent.appendChild(el);
  return el;
}

/**
 * Corriente de ondas: capas translúcidas que van del azul al verde, con dos
 * líneas finas de luz. Ancho y alto en mm (el ancho ya incluye el sangrado).
 */
function wavesSvg(w, h) {
  const id = 'w' + uid++;
  const Y = (f) => (h * f).toFixed(2);
  const X = (f) => (w * f).toFixed(2);
  const layer = (a, b, c, d, op, grad) =>
    `<path d="M0,${Y(a)} C${X(0.22)},${Y(b)} ${X(0.42)},${Y(c)} ${X(0.62)},${Y(d)} S${X(0.9)},${Y(b * 0.9)} ${w},${Y(c * 0.85)} L${w},${h} L0,${h}Z" fill="url(#${grad})" opacity="${op}"/>`;
  const thread = (a, b, c, d, op) =>
    `<path d="M0,${Y(a)} C${X(0.24)},${Y(b)} ${X(0.44)},${Y(c)} ${X(0.64)},${Y(d)} S${X(0.92)},${Y(b * 0.95)} ${w},${Y(c * 0.9)}" fill="none" stroke="#fff" stroke-width="0.35" opacity="${op}"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${PAL.w1}"/><stop offset=".5" stop-color="${PAL.w2}"/><stop offset="1" stop-color="${PAL.w3}"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${PAL.w3}"/><stop offset=".55" stop-color="${PAL.w2}"/><stop offset="1" stop-color="${PAL.w1}"/></linearGradient>
    </defs>
    ${layer(0.42, 0.12, 0.62, 0.5, 0.2, id + 'a')}
    ${layer(0.55, 0.3, 0.72, 0.42, 0.35, id + 'a')}
    ${layer(0.7, 0.45, 0.6, 0.62, 0.55, id + 'a')}
    ${layer(0.82, 0.68, 0.88, 0.7, 0.9, id + 'a')}
    ${thread(0.5, 0.26, 0.7, 0.44, 0.7)}
    ${thread(0.74, 0.58, 0.8, 0.66, 0.55)}
  </svg>`;
}

function placeWaves(parent, top, height, sheetW, bleed = 3) {
  const el = document.createElement('div');
  el.className = 'waves';
  Object.assign(el.style, { top: top + 'mm', height: height + bleed + 'mm' });
  el.innerHTML = wavesSvg(sheetW + 2 * bleed, height + bleed);
  parent.appendChild(el);
  return el;
}
