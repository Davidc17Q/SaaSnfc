/**
 * Habladores imprimibles: una hoja carta por sede con sus QR reales (enlace
 * ?s=q), sobre el diseño aprobado "B2" (reseñas + crédito + canal de WhatsApp).
 *
 * Reutiliza las piezas vectoriales del hablador (public/hablador/hablador.js y
 * .css, con sus fuentes libres). El logo de la empresa no vive en el
 * repositorio: se sube en la carga de sedes y se guarda en la base.
 * Se imprime a PDF desde el navegador (tamaño carta con 3 mm de sangrado).
 */

export interface HabladorSheet {
  name: string;
  city: string;
  batch: string | null;
  qr: Record<string, string>; // papel del punto -> enlace del QR
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

export function habladoresHtml(d: {
  companyName: string;
  logo: string | null;
  batch: string | null;
  mark: boolean; // nombre de la sede en el pie (para no confundir habladores)
  sheets: HabladorSheet[];
}): string {
  const data = JSON.stringify({ logo: d.logo, mark: d.mark, company: d.companyName, sheets: d.sheets }).replace(/</g, '\\u003c');
  const incompletas = d.sheets.filter((s) => !s.qr.resenas || !s.qr.credito || !s.qr.canal).length;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="robots" content="noindex" />
<title>Habladores · ${esc(d.companyName)}${d.batch ? ` · lote ${esc(d.batch)}` : ''}</title>
<link rel="stylesheet" href="/hablador/hablador.css" />
<style>
  :root { --w: 215.9mm; --h: 279.4mm; }
  @page { size: 221.9mm 285.4mm; margin: 0; }
  .page { break-after: page; margin: 0 auto; }
  .banda, .pie { position: absolute; left: calc(-1 * var(--bleed)); right: calc(-1 * var(--bleed)); overflow: hidden;
    background: linear-gradient(115deg, #0067a9 0%, #0089a0 52%, #00aa61 100%); }
  .banda svg { position: absolute; display: block; }
  h1.blanco { color: #fff; }
  .area { position: absolute; border-radius: 6mm; background: #fff; }
  .area.credito { background: #f1f9f5; }
  .area h2, .fila h2 { font-family: 'Outfit', sans-serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; color: var(--ink); }
  .area p, .fila p { font-family: 'Instrument'; color: var(--muted); line-height: 1.3; }
  .area .cap { color: var(--muted); }
  .gbadge { display: inline-flex; align-items: center; justify-content: center; background: #fff; border-radius: 50%; border: 0.3mm solid var(--line); }
  .fila { position: absolute; border: 0.35mm solid var(--line); border-radius: 5mm; background: #fff; overflow: hidden; }
  .fila .acento { position: absolute; left: 0; top: 0; bottom: 0; width: 1.6mm; background: linear-gradient(180deg, #0067a9, #00aa61); }
  .etiqueta { position: absolute; font-family: 'Instrument'; font-weight: 700; color: var(--teal); letter-spacing: 0.14em; text-transform: uppercase; }
  .marca-sede { position: absolute; left: 18mm; top: 273.4mm; font-family: 'Instrument'; font-size: 2.8mm; color: #fff; opacity: .92; }
  .logo-texto { position: absolute; left: 0; right: 0; top: 16mm; text-align: center; font-family: 'Outfit'; font-weight: 700; font-size: 11mm; color: var(--ink); }
  .falta { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center;
    font-family: 'Instrument'; font-size: 3.4mm; color: #b42318; padding: 4mm; }
  /* Barra de pantalla (no se imprime). */
  .barra { position: sticky; top: 0; z-index: 5; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    padding: 12px 20px; background: #14212b; color: #fff; font: 14px/1.4 'Instrument', system-ui, sans-serif; }
  .barra b { font-weight: 700; }
  .barra button { font: inherit; font-weight: 700; padding: 8px 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
  .barra .aviso { color: #fde68a; }
  @media screen { body { background: #e7e5e4; } .page { margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.18); } }
  @media print { .barra { display: none; } }
</style>
<script src="/qrcode.min.js"></script>
<script src="/hablador/hablador.js"></script>
</head>
<body>
<div class="barra">
  <span><b>${esc(d.companyName)}</b> · ${d.sheets.length} hablador${d.sheets.length === 1 ? '' : 'es'}${d.batch ? ` · lote ${esc(d.batch)}` : ''}</span>
  <button type="button" onclick="window.print()">Imprimir o guardar PDF</button>
  <span>Tamaño carta con 3 mm de sangrado. En el diálogo: márgenes "Ninguno" y "Gráficos de fondo" activado.</span>
  ${incompletas ? `<span class="aviso">${incompletas} sede${incompletas === 1 ? '' : 's'} sin alguno de los tres puntos: su espacio sale marcado en rojo.</span>` : ''}
</div>
<div id="hojas"></div>
<script>
  const DATA = ${data};
  const hojas = document.getElementById('hojas');
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const text = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  for (const sede of DATA.sheets) {
    const page = el('<div class="page"><div class="sheet"></div></div>');
    const s = page.firstChild;
    s.innerHTML =
      (DATA.logo
        ? '<img class="logo" alt="" style="top:11mm;width:70mm" />'
        : '<div class="logo-texto">' + text(DATA.company) + '</div>') +
      '<div class="banda" style="top:44mm;height:133mm"></div>' +
      '<p class="abs center-x" style="top:51mm;font-family:\\'Outfit\\';font-size:5.2mm;color:rgba(255,255,255,.9)">Tu opinión nos ayuda a mejorar</p>' +
      '<h1 class="abs center-x blanco" style="top:58mm;font-size:9.4mm">¿Cuéntanos cómo fue tu experiencia hoy?</h1>' +
      '<div class="area" data-rol="resenas" style="left:18mm;top:77mm;width:87.5mm;height:90mm">' +
        '<span class="abs gbadge" style="left:7mm;top:8mm;width:9mm;height:9mm"><span class="g" style="width:5.6mm;height:5.6mm;display:inline-block"></span></span>' +
        '<h2 class="abs" style="left:19mm;top:7.6mm;width:64mm;font-size:5.4mm">Califícanos en Google</h2>' +
        '<p class="abs stars" style="left:19mm;top:14.6mm;font-size:4.2mm;color:#f4b400">★★★★★</p>' +
        '<p class="cap" style="left:3mm;width:40mm;top:76mm;font-size:3.3mm"><b>Acerca</b> tu celular</p>' +
        '<p class="cap" style="left:45.5mm;width:40mm;top:76mm;font-size:3.3mm"><b>Escanea</b> el código</p>' +
      '</div>' +
      '<div class="area credito" data-rol="credito" style="left:110.4mm;top:77mm;width:87.5mm;height:90mm">' +
        '<span class="abs wa" style="left:7mm;top:8mm;width:9mm;height:9mm"></span>' +
        '<h2 class="abs" style="left:19mm;top:7.6mm;width:64mm;font-size:5.4mm">¿Quieres tu crédito?</h2>' +
        '<p class="abs" style="left:19mm;top:14.8mm;width:64mm;font-size:3.4mm">Escríbenos y un asesor te atiende</p>' +
        '<p class="cap" style="left:3mm;width:40mm;top:76mm;font-size:3.3mm"><b>Acerca</b> tu celular</p>' +
        '<p class="cap" style="left:45.5mm;width:40mm;top:76mm;font-size:3.3mm"><b>Escanea</b> el código</p>' +
      '</div>' +
      '<p class="etiqueta" style="left:18mm;top:199mm;font-size:3.2mm">Canal de WhatsApp</p>' +
      '<div class="fila" data-rol="canal" style="left:18mm;top:207mm;width:179.9mm;height:40mm">' +
        '<span class="acento"></span>' +
        '<span class="abs wa" style="left:8mm;top:15.5mm;width:9mm;height:9mm"></span>' +
        '<h2 class="abs" style="left:21mm;top:13.6mm;width:100mm;font-size:5.4mm">Recibe nuestras promociones</h2>' +
        '<p class="abs" style="left:21mm;top:21.8mm;width:100mm;font-size:3.5mm">Ofertas más destacadas en tu celular</p>' +
      '</div>' +
      '<div class="pie" style="top:270.4mm;height:12mm"></div>' +
      (DATA.mark ? '<div class="marca-sede">' + text(sede.name) + (sede.batch ? ' · lote ' + text(sede.batch) : '') + '</div>' : '') +
      '<div class="firma" style="right:18mm;top:272.6mm;font-size:2.8mm;gap:2mm"><span style="opacity:.92">con tecnología de</span><img src="/hablador/nfcloud-blanco.png" alt="NFCloud" style="height:4.4mm" /></div>';

    if (DATA.logo) s.querySelector('.logo').src = DATA.logo;
    s.querySelector('.g').innerHTML = ICON.google;
    s.querySelectorAll('.wa').forEach((e) => (e.innerHTML = ICON.whatsapp));

    // Eco del toque: anillos blancos casi invisibles detrás de las dos áreas.
    const B = 3, W = 215.9 + 2 * B, H = 133, cx = W / 2, cy = 80;
    let rings = '';
    for (let i = 0; i < 10; i++) {
      rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (40 + i * 12) + '" fill="none" stroke="#fff" stroke-width="0.3" opacity="' + (0.2 - i * 0.017).toFixed(3) + '"/>';
    }
    s.querySelector('.banda').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="left:0;top:0;width:100%;height:100%">' + rings + '</svg>';

    // QR reales de la sede; si falta un punto, su espacio queda marcado.
    const put = (rol, tap, qr) => {
      const box = s.querySelector('[data-rol="' + rol + '"]');
      const url = sede.qr[rol];
      if (!url) { box.appendChild(el('<div class="falta">Esta sede no tiene este punto</div>')); return; }
      placeTap(box, tap[0], tap[1], tap[2]);
      placeQr(box, qr[0], qr[1], qr[2], url, qr[3]);
    };
    put('resenas', [23, 51, 42], [47, 32.5, 37, 3]);
    put('credito', [23, 51, 42], [47, 32.5, 37, 3]);
    put('canal', [127.5, 20, 32], [145.5, 5.5, 29, 2.6]);
    hojas.appendChild(page);
  }
  if (!DATA.sheets.length) hojas.appendChild(el('<p style="padding:40px;font:16px system-ui">No hay sedes para imprimir.</p>'));
</script>
</body>
</html>`;
}
