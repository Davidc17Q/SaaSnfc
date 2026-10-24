/**
 * Página HTML de la encuesta de calificación interna por aspectos (Función 1).
 *
 * Se sirve en el motor público (GET /r/:deviceId) cuando el punto está en modo
 * 'survey'. Es anónima: no pide datos del cliente. El cliente califica cada
 * aspecto en una escala 1..scaleMax (estrellas) y puede dejar un comentario
 * libre opcional. Al enviar hace fetch a /r/:code/survey y muestra un
 * agradecimiento sin recargar.
 *
 * Sistema de diseño NFCloud: carbón cálido de fondo, azul de marca SOLO para la
 * acción primaria "Enviar". Las estrellas (estado del dato) NO usan azul.
 * Sobrio, móvil primero, accesible y sin glassmorphism/blur/degradados.
 */

/** Escapa texto para incrustarlo con seguridad en HTML. */
function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/** Serializa un valor para incrustarlo seguro dentro de una cadena JS. */
function jsString(s: unknown): string {
  return JSON.stringify(s ?? '');
}

// Logo de NFCloud (versión blanca) embebido en base64, leído una sola vez.
let _logoCache: string | null | undefined;
function logoDataUri(): string | null {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.join(__dirname, '..', '..', 'public', 'logo-icono-blanco.png');
    const b64 = fs.readFileSync(file).toString('base64');
    _logoCache = `data:image/png;base64,${b64}`;
  } catch {
    _logoCache = null;
  }
  return _logoCache;
}

export function surveyHtml(opts: {
  deviceCode: string;
  templateName: string;
  aspects: { id: string; label: string }[];
  scaleMax: number;
  companyName?: string;
}): string {
  const scaleMax = Math.max(2, Math.min(10, Math.round(opts.scaleMax || 5)));
  const nombre = opts.companyName && opts.companyName.trim() ? opts.companyName.trim() : null;
  const logo = logoDataUri();
  const marca = logo
    ? `<img src="${logo}" alt="NFCloud" width="40" height="40" />`
    : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="40" height="40">
         <path d="M7.2 10.2A4.2 4.2 0 0 1 15.4 9a3.4 3.4 0 0 1 .3 6.75" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
         <rect x="4" y="11.5" width="10" height="8" rx="2" stroke="#fff" stroke-width="1.6"/>
       </svg>`;

  // Bloques de aspectos: cada uno con un grupo de botones-estrella accesibles.
  const aspectsHtml = opts.aspects
    .map((a, idx) => {
      const stars = Array.from({ length: scaleMax }, (_, i) => {
        const val = i + 1;
        return `<button type="button" class="star" role="radio" aria-checked="false"
                   data-aspect="${esc(a.id)}" data-val="${val}"
                   aria-label="${val} de ${scaleMax} en ${esc(a.label)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>`;
      }).join('');
      return `<div class="aspect">
                <div class="aspect-label" id="asp-${idx}">${esc(a.label)}</div>
                <div class="stars" role="radiogroup" aria-labelledby="asp-${idx}" data-aspect="${esc(a.id)}">
                  ${stars}
                </div>
              </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>${esc(opts.templateName)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    /* Carbón cálido (no azul noche). Azul de marca solo para la acción primaria. */
    --fondo:#141312; --tarjeta:#1c1a18; --borde:#322e2b;
    --texto:#fafaf9; --texto2:#a8a29e;
    --azul:#3b82f6; --azul-hover:#60a5fa;
    --estrella:#fbbf24; --estrella-off:#4b4642;
  }
  html,body{height:100%}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:var(--fondo); color:var(--texto);
    min-height:100vh; min-height:100dvh;
    display:flex; align-items:flex-start; justify-content:center;
    padding:24px 16px 40px;
  }
  .wrap{width:100%; max-width:440px}
  .cab{display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px; margin:16px 0 24px}
  .logo{width:56px; height:56px; border-radius:16px; background:var(--azul);
    display:flex; align-items:center; justify-content:center}
  .logo img{object-fit:contain}
  h1{font-size:20px; font-weight:700; line-height:1.3}
  .sub{font-size:14px; color:var(--texto2)}
  .tarjeta{background:var(--tarjeta); border:1px solid var(--borde); border-radius:16px; padding:20px}
  .aspect{padding:14px 0; border-bottom:1px solid var(--borde)}
  .aspect:first-child{padding-top:0}
  .aspect:last-child{border-bottom:none}
  .aspect-label{font-size:15px; font-weight:600; margin-bottom:10px}
  .stars{display:flex; gap:6px}
  .star{background:none; border:none; padding:4px; cursor:pointer; line-height:0; border-radius:8px}
  .star svg{width:30px; height:30px; fill:var(--estrella-off); transition:fill .12s ease, transform .12s ease}
  .star.on svg{fill:var(--estrella)}
  .star:hover svg{transform:scale(1.08)}
  .star:focus-visible{outline:2px solid var(--azul); outline-offset:2px}
  .coment{margin-top:18px}
  .coment label{display:block; font-size:14px; font-weight:600; margin-bottom:8px}
  textarea{width:100%; min-height:84px; resize:vertical; background:var(--fondo);
    color:var(--texto); border:1px solid var(--borde); border-radius:10px;
    padding:10px 12px; font:inherit; font-size:14px}
  textarea:focus-visible{outline:none; border-color:var(--azul); box-shadow:0 0 0 3px rgba(59,130,246,.25)}
  .contador{text-align:right; font-size:12px; color:var(--texto2); margin-top:4px}
  .enviar{width:100%; margin-top:20px; padding:14px; border:none; border-radius:12px;
    background:var(--azul); color:#fff; font-size:16px; font-weight:600; cursor:pointer;
    transition:background .15s ease}
  .enviar:hover:not(:disabled){background:var(--azul-hover)}
  .enviar:disabled{opacity:.45; cursor:not-allowed}
  .enviar:focus-visible{outline:2px solid #fff; outline-offset:2px}
  .pie{text-align:center; font-size:12px; color:var(--texto2); margin-top:22px; letter-spacing:.04em}
  .ok{display:none; text-align:center; padding:40px 10px}
  .ok .marca{width:72px; height:72px; border-radius:50%; margin:0 auto 20px;
    background:rgba(21,128,61,.14); border:2px solid #4ade80;
    display:flex; align-items:center; justify-content:center}
  .ok .marca svg{width:38px; height:38px; stroke:#4ade80; stroke-width:3; fill:none; stroke-linecap:round; stroke-linejoin:round}
  .ok h2{font-size:20px; font-weight:700; margin-bottom:8px}
  .ok p{font-size:14px; color:var(--texto2)}
  .mostrar-ok .form{display:none}
  .mostrar-ok .ok{display:block}
  @media(prefers-reduced-motion:reduce){
    .star svg{transition:none}
    .star:hover svg{transform:none}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="form">
      <div class="cab">
        <div class="logo">${marca}</div>
        <h1>${esc(opts.templateName)}</h1>
        <div class="sub">${nombre ? `Tu opinión para ${esc(nombre)}` : 'Califica tu experiencia'}</div>
      </div>
      <div class="tarjeta">
        ${aspectsHtml}
        <div class="coment">
          <label for="coment">Comentario (opcional)</label>
          <textarea id="coment" maxlength="2000" placeholder="Cuéntanos más si quieres…"></textarea>
          <div class="contador"><span id="count">0</span>/2000</div>
        </div>
      </div>
      <button type="button" class="enviar" id="enviar" disabled>Enviar</button>
      <div id="msg" class="sub" style="text-align:center;margin-top:10px;min-height:18px"></div>
    </div>
    <div class="ok" aria-live="polite">
      <div class="marca"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-4-4"/></svg></div>
      <h2>¡Gracias por tu calificación!</h2>
      <p>Tu respuesta se registró de forma anónima.</p>
    </div>
    <div class="pie">nfcloud</div>
  </div>

  <script>
  (function(){
    var deviceCode = ${jsString(opts.deviceCode)};
    var totalAspectos = ${opts.aspects.length};
    var ratings = {};
    var wrap = document.querySelector('.wrap');

    // Selección de estrellas por grupo (aspecto).
    document.querySelectorAll('.stars').forEach(function(grupo){
      var aspecto = grupo.getAttribute('data-aspect');
      var estrellas = Array.prototype.slice.call(grupo.querySelectorAll('.star'));
      estrellas.forEach(function(st){
        st.addEventListener('click', function(){
          var val = parseInt(st.getAttribute('data-val'), 10);
          ratings[aspecto] = val;
          estrellas.forEach(function(e, i){
            var on = (i + 1) <= val;
            e.classList.toggle('on', on);
            e.setAttribute('aria-checked', (i + 1) === val ? 'true' : 'false');
          });
          actualizarBoton();
        });
      });
    });

    var coment = document.getElementById('coment');
    var count = document.getElementById('count');
    coment.addEventListener('input', function(){ count.textContent = coment.value.length; });

    var btn = document.getElementById('enviar');
    var msg = document.getElementById('msg');
    function actualizarBoton(){
      btn.disabled = Object.keys(ratings).length < totalAspectos;
    }

    btn.addEventListener('click', function(){
      if (Object.keys(ratings).length < totalAspectos) return;
      btn.disabled = true;
      msg.textContent = 'Enviando…';
      // La marca ?s=q / ?s=n de la URL viaja con la respuesta (origen NFC o QR).
      fetch('/r/' + encodeURIComponent(deviceCode) + '/survey' + location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings: ratings, comment: coment.value })
      }).then(function(res){
        if (!res.ok) throw new Error('error');
        return res.json();
      }).then(function(){
        msg.textContent = '';
        wrap.classList.add('mostrar-ok');
      }).catch(function(){
        btn.disabled = false;
        msg.textContent = 'No se pudo enviar. Inténtalo de nuevo.';
      });
    });
  })();
  </script>
</body>
</html>`;
}
