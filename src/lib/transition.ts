/**
 * Pantalla HTML intermedia de transición para la redirección NFC.
 *
 * Secuencia (misma duración que antes, ~1,3 s, para no frenar al cliente):
 *  1. Toque (0 - ~650ms): el logo emite ondas NFC y se presenta el negocio.
 *  2. Destino (~650ms): el logo da paso al ícono del destino (WhatsApp,
 *     Google, Instagram…) con su color, y el texto dice qué se va a abrir.
 *  3. Redirección (~1,3s): window.location.replace(target) para que "Atrás"
 *     no regrese a esta pantalla. Una barra de progreso acompaña todo.
 *
 * Rendimiento: todo va en línea (CSS, SVG y logo), sin fuentes ni scripts
 * externos; además se hace preconnect al dominio del destino para que la
 * página final cargue antes. Sin JS, un meta refresh redirige igual.
 */

/** Escapa texto para incrustarlo con seguridad en HTML/JS. */
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** Serializa una URL para incrustarla segura dentro de una cadena JS. */
function jsString(s: string): string {
  return JSON.stringify(String(s ?? '')).replace(/</g, '\\u003c');
}

// Logo de NFCloud (versión blanca) embebido en base64, leído una sola vez del
// disco. Al ir dentro del HTML no depende de rutas ni de la carpeta public/.
let _logoCache: string | null | undefined;
function logoDataUri(): string | null {
  if (_logoCache !== undefined) return _logoCache;
  try {
    // __dirname en runtime es dist/lib → el logo vive en ../../public.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.join(__dirname, '..', '..', 'public', 'logo-icono-blanco.png');
    const b64 = fs.readFileSync(file).toString('base64');
    _logoCache = `data:image/png;base64,${b64}`;
  } catch {
    _logoCache = null; // si no se encuentra, se usa el ícono SVG de respaldo
  }
  return _logoCache;
}

// Íconos de trazo (estilo Lucide) por tipo de destino; el color es el de la
// plataforma porque es información para el cliente, no decoración.
const ICONS: Record<string, string> = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 10.5c.5 1.6 1.9 3 3.5 3.5l1.2-1.2 2.3 1v1.4c0 .5-.4.8-.9.8A7.2 7.2 0 0 1 8 8.9c0-.5.3-.9.8-.9h1.4l1 2.3Z"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  camera: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  thumb: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  play: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
};

/** Cómo se presenta cada destino: ícono, color y la frase de lo que se abre. */
function destination(channel: string): { icon: string; color: string; text: string; sub: string } {
  switch (channel) {
    case 'WhatsApp':
      return { icon: 'chat', color: '#25d366', text: 'Abriendo el chat de WhatsApp', sub: 'Te responderemos por ahí' };
    case 'Google Reviews':
      return { icon: 'star', color: '#fbbc04', text: 'Abriendo Google para tu reseña', sub: 'Tu opinión nos ayuda a mejorar' };
    case 'Instagram':
      return { icon: 'camera', color: '#e1306c', text: 'Abriendo Instagram', sub: 'Síguenos para no perderte nada' };
    case 'Facebook':
      return { icon: 'thumb', color: '#1877f2', text: 'Abriendo Facebook', sub: 'Síguenos para no perderte nada' };
    case 'TikTok':
      return { icon: 'music', color: '#ff0050', text: 'Abriendo TikTok', sub: 'Síguenos para no perderte nada' };
    case 'YouTube':
      return { icon: 'play', color: '#ff0000', text: 'Abriendo YouTube', sub: 'Mira nuestro contenido' };
    case 'Telegram':
      return { icon: 'send', color: '#26a5e4', text: 'Abriendo Telegram', sub: 'Te responderemos por ahí' };
    case 'Llamada':
      return { icon: 'phone', color: '#22c55e', text: 'Preparando la llamada', sub: 'Te atenderemos enseguida' };
    case 'Email':
      return { icon: 'mail', color: '#60a5fa', text: 'Abriendo tu correo', sub: 'Te responderemos pronto' };
    case 'Linktree':
      return { icon: 'link', color: '#43e660', text: 'Abriendo nuestros enlaces', sub: 'Todo en un solo lugar' };
    default:
      return { icon: 'globe', color: '#60a5fa', text: 'Abriendo el enlace', sub: 'Un momento, por favor' };
  }
}

export function transitionHtml(opts: { targetUrl: string; companyName?: string; channel?: string }): string {
  const nombre = opts.companyName && opts.companyName.trim() ? opts.companyName.trim() : null;
  const dest = destination(opts.channel || '');
  const logo = logoDataUri();
  let origin = '';
  try {
    const u = new URL(opts.targetUrl);
    if (u.protocol === 'https:' || u.protocol === 'http:') origin = u.origin;
  } catch {
    /* tel:, mailto: o URL rara: sin preconnect */
  }
  // Marca dentro del recuadro: logo propio si existe, SVG de respaldo si no.
  const marca = logo
    ? `<img src="${logo}" alt="" width="44" height="44" />`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
         <path d="M7.2 10.2A4.2 4.2 0 0 1 15.4 9a3.4 3.4 0 0 1 .3 6.75"/><rect x="4" y="11.5" width="10" height="8" rx="2"/>
         <path d="M6.5 15.5h5"/><path d="M16.5 12.4a4 4 0 0 1 0 6.2"/><path d="M18.7 10.6a7 7 0 0 1 0 9.8"/></svg>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#121110" />
${origin ? `<link rel="preconnect" href="${esc(origin)}" />` : ''}
<noscript><meta http-equiv="refresh" content="0;url=${esc(opts.targetUrl)}" /></noscript>
<title>${nombre ? esc(nombre) : 'Conectando…'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--c:${dest.color};--azul:#2563eb;--fondo:#121110;--texto:#fafaf9;--texto2:#a8a29e}
  html,body{height:100%}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:var(--fondo);color:var(--texto);min-height:100vh;min-height:100dvh;
    display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden;
    -webkit-font-smoothing:antialiased;
  }
  /* Halo de fondo: azul de marca y, al llegar al destino, su color. */
  .halo{position:fixed;inset:0;pointer-events:none;opacity:.55;transition:opacity .5s ease}
  .halo::before,.halo::after{content:"";position:absolute;left:50%;top:42%;width:120vmax;height:120vmax;
    transform:translate(-50%,-50%);transition:opacity .6s ease}
  .halo::before{background:radial-gradient(closest-side,rgba(37,99,235,.28),transparent 70%)}
  .halo::after{background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 30%,transparent),transparent 70%);opacity:0}
  .ok .halo::before{opacity:0}.ok .halo::after{opacity:1}
  .wrap{position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;width:100%;max-width:340px}
  .negocio{font-size:13px;font-weight:600;letter-spacing:.02em;color:var(--texto2);margin-bottom:28px;
    opacity:0;transform:translateY(6px);animation:entra .45s ease .05s forwards}
  .negocio b{display:block;font-size:24px;font-weight:700;letter-spacing:-.01em;color:var(--texto);margin-top:4px;line-height:1.2}
  /* Símbolo: logo con ondas NFC → ícono del destino. Tamaño fijo, no "salta". */
  .simbolo{position:relative;width:112px;height:112px;margin-bottom:30px}
  .onda{position:absolute;inset:0;border-radius:32px;border:1.5px solid rgba(96,165,250,.55);opacity:0;animation:onda 1.3s cubic-bezier(.2,.6,.3,1) infinite}
  .onda:nth-child(2){animation-delay:.32s}.onda:nth-child(3){animation-delay:.64s}
  @keyframes onda{0%{transform:scale(.85);opacity:.9}100%{transform:scale(1.9);opacity:0}}
  .ok .onda{border-color:color-mix(in srgb,var(--c) 70%,transparent);animation-iteration-count:1}
  .capa{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:32px;
    transition:opacity .35s ease,transform .45s cubic-bezier(.3,1.4,.5,1)}
  .capa-logo{background:linear-gradient(145deg,#3b82f6,#1d4ed8);box-shadow:0 18px 50px rgba(37,99,235,.45),inset 0 1px 0 rgba(255,255,255,.18)}
  .capa-logo img,.capa-logo svg{width:52px;height:52px;object-fit:contain}
  .capa-dest{background:var(--c);color:#fff;opacity:0;transform:scale(.5) rotate(-8deg);
    box-shadow:0 18px 50px color-mix(in srgb,var(--c) 45%,transparent),inset 0 1px 0 rgba(255,255,255,.25)}
  .capa-dest svg{width:50px;height:50px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .ok .capa-logo{opacity:0;transform:scale(.6)}
  .ok .capa-dest{opacity:1;transform:scale(1) rotate(0)}
  /* Insignia de "listo" sobre el ícono del destino. */
  .listo{position:absolute;right:-6px;bottom:-6px;width:34px;height:34px;border-radius:50%;background:#fff;
    display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.35);
    opacity:0;transform:scale(.3);transition:opacity .25s ease .2s,transform .4s cubic-bezier(.3,1.6,.5,1) .2s}
  .listo svg{width:18px;height:18px;fill:none;stroke:#16a34a;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
  .ok .listo{opacity:1;transform:scale(1)}
  .texto{min-height:52px}
  .titulo{font-size:18px;font-weight:650;line-height:1.35}
  .sub{font-size:14px;color:var(--texto2);margin-top:6px}
  .fase2{display:none}.ok .fase1{display:none}.ok .fase2{display:block;animation:entra .35s ease forwards}
  @keyframes entra{to{opacity:1;transform:none}}
  .fase2{opacity:0;transform:translateY(6px)}
  @media(prefers-reduced-motion:reduce){.fase2{opacity:1;transform:none}}
  /* Barra de progreso: llena en el tiempo total de la transición. */
  .barra{width:160px;height:3px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:26px;overflow:hidden}
  .barra i{display:block;height:100%;width:100%;border-radius:3px;background:linear-gradient(90deg,var(--azul),var(--c));
    transform:scaleX(0);transform-origin:left;animation:llena 1.25s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes llena{to{transform:scaleX(1)}}
  .manual{margin-top:22px;font-size:13px;color:var(--texto2);text-decoration:none;opacity:0;transition:opacity .3s}
  .manual.ver{opacity:1}
  .pie{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom));left:0;right:0;text-align:center;font-size:11px;color:#57534e;letter-spacing:.06em}
  @media(prefers-reduced-motion:reduce){
    .onda{display:none}.capa,.listo,.halo::before,.halo::after{transition:none}
    .barra i{animation:none;transform:none}.negocio{animation:none;opacity:1;transform:none}
  }
</style>
</head>
<body>
  <div class="halo"></div>
  <div class="wrap" id="wrap">
    ${nombre ? `<p class="negocio">Bienvenido a<b>${esc(nombre)}</b></p>` : ''}
    <div class="simbolo" aria-hidden="true">
      <span class="onda"></span><span class="onda"></span><span class="onda"></span>
      <div class="capa capa-logo">${marca}</div>
      <div class="capa capa-dest"><svg viewBox="0 0 24 24">${ICONS[dest.icon]}</svg></div>
      <span class="listo"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7.5"/></svg></span>
    </div>
    <div class="texto" role="status" aria-live="polite">
      <div class="fase1"><p class="titulo">Conectando…</p></div>
      <div class="fase2"><p class="titulo">${esc(dest.text)}</p><p class="sub">${esc(dest.sub)}</p></div>
    </div>
    <div class="barra"><i></i></div>
    <a class="manual" id="manual" href="${esc(opts.targetUrl)}" rel="noopener">¿No se abrió? Toca aquí</a>
  </div>
  <div class="pie">con tecnología nfcloud</div>

  <script>
  (function(){
    var destino = ${jsString(opts.targetUrl)};
    var wrap = document.getElementById('wrap');
    setTimeout(function(){ document.body.classList.add('ok'); }, 650);
    // Redirección final a los 1300ms, con replace para no dejar historial.
    setTimeout(function(){ window.location.replace(destino); }, 1300);
    // Si la app de destino no abre (p. ej. bloqueada), se ofrece el enlace.
    setTimeout(function(){ document.getElementById('manual').classList.add('ver'); }, 3000);
  })();
  </script>
</body>
</html>`;
}
