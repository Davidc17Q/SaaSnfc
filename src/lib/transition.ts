/**
 * Pantalla HTML intermedia de transición para la redirección NFC.
 *
 * Secuencia:
 *  1. Fase de carga (0 - ~700ms): logo con pulso + "Conectando con {nombre}".
 *  2. Fase de éxito (~700ms - 1.3s): el logo se desvanece y aparece un
 *     checkmark verde animado + "¡Conexión exitosa!".
 *  3. Redirección (~1.3s): window.location.replace(target) para que el botón
 *     "Atrás" no regrese a esta pantalla.
 *
 * El destino va incrustado desde el servidor (ya resuelto), así que la
 * animación es puramente visual; no espera a la base de datos.
 */

/** Escapa texto para incrustarlo con seguridad en HTML/JS. */
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** Serializa una URL para incrustarla segura dentro de una cadena JS. */
function jsString(s: string): string {
  return JSON.stringify(String(s ?? ''));
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

export function transitionHtml(opts: { targetUrl: string; companyName?: string }): string {
  const nombre = opts.companyName && opts.companyName.trim() ? opts.companyName.trim() : null;
  const saludo = nombre ? `Conectando con ${esc(nombre)}` : 'Conectando…';
  const logo = logoDataUri();
  // Marca dentro del recuadro con pulso: logo propio si existe, SVG de respaldo si no.
  const marca = logo
    ? `<img src="${logo}" alt="NFCloud" width="56" height="56" style="display:block" />`
    : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7.2 10.2A4.2 4.2 0 0 1 15.4 9a3.4 3.4 0 0 1 .3 6.75" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
            <rect x="4" y="11.5" width="10" height="8" rx="2" stroke="#fff" stroke-width="1.6"/>
            <path d="M6.5 15.5h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M16.5 12.4a4 4 0 0 1 0 6.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M18.7 10.6a7 7 0 0 1 0 9.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
          </svg>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>Conectando…</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --azul:#6366f1;--azul2:#8b5cf6;--verde:#22c55e;
    --fondo1:#0f172a;--fondo2:#1e293b;--texto:#e2e8f0;--texto2:#94a3b8;
  }
  html,body{height:100%}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:linear-gradient(135deg,var(--fondo1) 0%,var(--fondo2) 100%);
    color:var(--texto);min-height:100vh;min-height:100dvh;
    display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden;
  }
  .wrap{text-align:center;display:flex;flex-direction:column;align-items:center;gap:26px}
  /* Contenedor del símbolo (logo o check), tamaño fijo para que no "salte". */
  .simbolo{position:relative;width:96px;height:96px}
  .capa{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity .4s ease,transform .4s ease}
  /* --- Logo con pulso --- */
  .logo-box{
    width:96px;height:96px;border-radius:24px;
    background:linear-gradient(135deg,var(--azul),var(--azul2));
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 12px 40px rgba(99,102,241,.4);
    animation:pulso 1.1s ease-in-out infinite;
  }
  .logo-box svg{width:52px;height:52px}
  .logo-box img{width:56px;height:56px;object-fit:contain}
  @keyframes pulso{
    0%,100%{transform:scale(1);box-shadow:0 12px 40px rgba(99,102,241,.35)}
    50%{transform:scale(1.07);box-shadow:0 16px 52px rgba(99,102,241,.55)}
  }
  /* --- Checkmark de éxito --- */
  .check-box{
    width:96px;height:96px;border-radius:50%;
    background:rgba(34,197,94,.12);border:2px solid var(--verde);
    display:flex;align-items:center;justify-content:center;
  }
  .check-box svg{width:50px;height:50px}
  .check-path{
    stroke:var(--verde);stroke-width:5;fill:none;
    stroke-linecap:round;stroke-linejoin:round;
    stroke-dasharray:48;stroke-dashoffset:48;
  }
  /* Estado inicial de capas */
  .capa-logo{opacity:1;transform:scale(1)}
  .capa-check{opacity:0;transform:scale(.6)}
  /* Estado tras el éxito (clase .ok en el wrap) */
  .ok .capa-logo{opacity:0;transform:scale(.6)}
  .ok .capa-check{opacity:1;transform:scale(1)}
  .ok .check-box{animation:aparece .4s ease}
  .ok .check-path{animation:trazo .5s ease .15s forwards}
  @keyframes aparece{0%{transform:scale(.6)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
  @keyframes trazo{to{stroke-dashoffset:0}}
  /* --- Textos --- */
  .titulo{font-size:19px;font-weight:600;color:#f8fafc;line-height:1.4;max-width:320px;transition:opacity .3s ease}
  .sub{font-size:14px;color:var(--texto2);transition:opacity .3s ease}
  .ok .titulo{color:#f0fdf4}
  /* Puntos de carga */
  .puntos{display:inline-flex;gap:5px;margin-top:2px}
  .puntos span{width:7px;height:7px;border-radius:50%;background:var(--azul);opacity:.4;animation:parpadeo 1.1s ease-in-out infinite}
  .puntos span:nth-child(2){animation-delay:.18s}
  .puntos span:nth-child(3){animation-delay:.36s}
  .ok .puntos{display:none}
  @keyframes parpadeo{0%,100%{opacity:.3;transform:scale(.9)}50%{opacity:1;transform:scale(1.1)}}
  /* Marca al pie */
  .pie{position:fixed;bottom:22px;left:0;right:0;text-align:center;font-size:12px;color:#64748b;letter-spacing:.04em}
  @media(prefers-reduced-motion:reduce){
    .logo-box{animation:none}.puntos span{animation:none}.check-path{stroke-dashoffset:0}
  }
</style>
</head>
<body>
  <div class="wrap" id="wrap">
    <div class="simbolo">
      <div class="capa capa-logo">
        <div class="logo-box">
          ${marca}
        </div>
      </div>
      <div class="capa capa-check">
        <div class="check-box">
          <svg viewBox="0 0 60 60" aria-hidden="true">
            <path class="check-path" d="M16 31 L26 41 L45 20" />
          </svg>
        </div>
      </div>
    </div>
    <div>
      <div class="titulo" id="titulo">${saludo}</div>
      <div class="sub" id="sub">
        <span class="puntos"><span></span><span></span><span></span></span>
      </div>
    </div>
  </div>
  <div class="pie">nfcloud</div>

  <script>
  (function(){
    var destino = ${jsString(opts.targetUrl)};
    var wrap = document.getElementById('wrap');
    var titulo = document.getElementById('titulo');
    var sub = document.getElementById('sub');
    // Fase de éxito a los 700ms.
    setTimeout(function(){
      wrap.classList.add('ok');
      titulo.textContent = '¡Conexión exitosa!';
      sub.textContent = 'Te estamos llevando…';
    }, 700);
    // Redirección final a los 1300ms, con replace para no dejar historial.
    setTimeout(function(){
      window.location.replace(destino);
    }, 1300);
  })();
  </script>
</body>
</html>`;
}
