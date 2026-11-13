/**
 * Páginas públicas que un punto puede mostrar antes de (o en vez de) redirigir:
 *  - Contacto con autorización: pide el WhatsApp del cliente, opcional, con la
 *    autorización de tratamiento de datos (Ley 1581 de 2012) y luego lo lleva a
 *    su destino.
 *  - Cupón: entrega un código único que el cajero canjea con la clave de caja.
 *
 * Mismo tono sobrio de la encuesta: carbón cálido, azul solo en la acción
 * principal, todo en línea (sin fuentes ni scripts externos).
 */

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}
const js = (s: unknown) => JSON.stringify(s ?? '').replace(/</g, '\\u003c');

function shell(title: string, body: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<meta name="color-scheme" content="dark" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #141312; color: #fafaf9;
    min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { width: 100%; max-width: 420px; background: #1c1a18; border: 1px solid #322e2b; border-radius: 16px; padding: 28px 24px; }
  .brand { font-size: 13px; color: #a8a29e; margin-bottom: 6px; }
  h1 { font-size: 22px; line-height: 1.25; margin-bottom: 8px; text-wrap: balance; }
  p { color: #a8a29e; font-size: 15px; line-height: 1.5; }
  label.f { display: block; font-size: 14px; font-weight: 600; margin: 18px 0 6px; color: #fafaf9; }
  input[type=text], input[type=tel] { width: 100%; font: inherit; font-size: 16px; padding: 12px 14px; border-radius: 10px;
    border: 1px solid #44403c; background: #141312; color: #fafaf9; }
  input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
  .consent { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; font-size: 13px; line-height: 1.45; color: #a8a29e; }
  .consent input { width: 20px; height: 20px; margin-top: 1px; flex: none; accent-color: #2563eb; }
  .btn { display: block; width: 100%; font: inherit; font-size: 16px; font-weight: 700; padding: 14px; margin-top: 18px; border: 0;
    border-radius: 12px; background: #2563eb; color: #fff; cursor: pointer; text-align: center; text-decoration: none; }
  .btn:active { transform: scale(0.98); }
  .btn[disabled] { opacity: .55; cursor: default; }
  .skip { display: block; text-align: center; margin-top: 14px; padding: 10px; color: #d6d3d1; font-size: 15px; }
  .err { color: #fca5a5; font-size: 14px; margin-top: 10px; min-height: 1.2em; }
  .code { font-size: 34px; font-weight: 800; letter-spacing: 0.14em; text-align: center; padding: 18px 12px; margin: 18px 0 6px;
    border: 1px dashed #57534e; border-radius: 12px; font-variant-numeric: tabular-nums; }
  .terms { font-size: 13px; margin-top: 10px; }
  .ok { text-align: center; }
  .ok .mark { width: 56px; height: 56px; border-radius: 50%; background: #14532d; color: #86efac; font-size: 30px; line-height: 56px; margin: 0 auto 14px; }
  details { margin-top: 20px; border-top: 1px solid #322e2b; padding-top: 14px; }
  summary { cursor: pointer; font-size: 14px; color: #d6d3d1; }
  @media (prefers-reduced-motion: reduce) { .btn:active { transform: none; } }
</style>
</head>
<body>
<main class="card">${body}</main>
<script>${script}</script>
</body>
</html>`;
}

/** Texto de autorización que acepta el cliente (se guarda tal cual con el contacto). */
export function consentText(companyName: string): string {
  return (
    `Autorizo a ${companyName} a tratar mi nombre y número de celular para contactarme por WhatsApp o llamada ` +
    `con información de sus productos, servicios y promociones, conforme a la Ley 1581 de 2012. ` +
    `Puedo pedir en cualquier momento que actualicen o eliminen mis datos escribiendo a ese mismo número.`
  );
}

export function leadHtml(o: { code: string; companyName: string; targetUrl: string; source: string }): string {
  const company = o.companyName || 'este negocio';
  const body = `
    <div class="brand">${esc(company)}</div>
    <h1>¿Te avisamos de novedades y promociones?</h1>
    <p>Déjanos tu WhatsApp. Es opcional: si prefieres, continúa sin dejarlo.</p>
    <form id="f" novalidate>
      <label class="f" for="n">Tu nombre</label>
      <input id="n" type="text" autocomplete="name" maxlength="80" />
      <label class="f" for="t">Tu celular</label>
      <input id="t" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="300 123 4567" />
      <label class="consent"><input id="c" type="checkbox" /> <span>${esc(consentText(company))}</span></label>
      <p class="err" id="e" role="alert"></p>
      <button class="btn" id="b" type="submit">Guardar y continuar</button>
    </form>
    <a class="skip" id="s" href="${esc(o.targetUrl)}" rel="noopener">Continuar sin dejar mis datos</a>`;
  const script = `
    var target = ${js(o.targetUrl)};
    var f = document.getElementById('f'), e = document.getElementById('e'), b = document.getElementById('b');
    document.getElementById('s').addEventListener('click', function (ev) { ev.preventDefault(); location.replace(target); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var phone = document.getElementById('t').value.trim();
      if (!phone) { e.textContent = 'Escribe tu celular, o continúa sin dejar tus datos.'; return; }
      if (!document.getElementById('c').checked) { e.textContent = 'Marca la autorización para guardar tu número.'; return; }
      b.disabled = true; e.textContent = '';
      fetch('/r/' + ${js(o.code)} + '/lead?s=' + ${js(o.source)}, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: document.getElementById('n').value, phone: phone, consent: true })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) { location.replace(target); return; }
          e.textContent = x.d.error || 'No se pudo guardar. Inténtalo de nuevo.'; b.disabled = false;
        })
        .catch(function () { location.replace(target); });
    });`;
  return shell(company, body, script);
}

export function couponHtml(o: {
  code: string; // código del punto
  companyName: string;
  couponName: string;
  terms: string | null;
  validUntil: string | null; // 'DD/MM/AAAA'
  claimCode: string;
  redeemedAt: string | null;
}): string {
  const company = o.companyName || 'este negocio';
  const body = o.redeemedAt
    ? `<div class="ok"><div class="mark">✓</div><h1>Cupón ya canjeado</h1><p>${esc(o.couponName)}</p><p class="terms">Canjeado el ${esc(o.redeemedAt)}.</p></div>`
    : `
    <div class="brand">${esc(company)}</div>
    <h1>${esc(o.couponName)}</h1>
    <p>Muestra este código en la caja para usarlo.</p>
    <div class="code" aria-label="Código del cupón">${esc(o.claimCode)}</div>
    ${o.validUntil ? `<p class="terms">Válido hasta el ${esc(o.validUntil)}.</p>` : ''}
    ${o.terms ? `<p class="terms">${esc(o.terms)}</p>` : ''}
    <details id="d">
      <summary>Soy del personal: canjear este cupón</summary>
      <form id="f" novalidate>
        <label class="f" for="p">Clave de caja</label>
        <input id="p" type="tel" inputmode="numeric" autocomplete="off" maxlength="8" />
        <p class="err" id="e" role="alert"></p>
        <button class="btn" id="b" type="submit">Canjear</button>
      </form>
    </details>
    <div class="ok" id="done" hidden><div class="mark">✓</div><h1>Cupón canjeado</h1><p>${esc(o.couponName)}</p></div>`;
  const script = o.redeemedAt
    ? ''
    : `
    var f = document.getElementById('f'), e = document.getElementById('e'), b = document.getElementById('b');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pin = document.getElementById('p').value.trim();
      if (!pin) { e.textContent = 'Escribe la clave de caja.'; return; }
      b.disabled = true; e.textContent = '';
      fetch('/r/' + ${js(o.code)} + '/coupon/redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: ${js(o.claimCode)}, pin: pin })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) {
            Array.prototype.forEach.call(document.querySelectorAll('main > :not(#done)'), function (n) { n.hidden = true; });
            document.getElementById('done').hidden = false;
            return;
          }
          e.textContent = x.d.error || 'No se pudo canjear.'; b.disabled = false;
        })
        .catch(function () { e.textContent = 'Sin conexión. Inténtalo de nuevo.'; b.disabled = false; });
    });`;
  return shell(o.couponName, body, script);
}

export function couponUnavailableHtml(companyName: string): string {
  return shell(
    'Cupón no disponible',
    `<div class="brand">${esc(companyName || '')}</div><h1>Este cupón ya no está disponible</h1><p>La promoción terminó. Pregunta en la tienda por las ofertas vigentes.</p>`,
    ''
  );
}
