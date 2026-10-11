/*
 * Convierte un archivo Markdown a un HTML autocontenido (standalone):
 * - Las imágenes locales se incrustan en base64 (data URI), así se ven siempre,
 *   incluso al imprimir/guardar como PDF, sin depender de rutas externas.
 * - Incluye estilos para que el documento se vea profesional.
 *
 * Uso:  node scripts/md-to-html.js <entrada.md> <salida.html>
 *
 * No requiere dependencias externas: es un conversor Markdown mínimo pero
 * suficiente para estos documentos (encabezados, listas, tablas, negritas,
 * código, imágenes, enlaces, citas, separadores).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Uso: node scripts/md-to-html.js <entrada.md> <salida.html>');
  process.exit(1);
}

const baseDir = path.dirname(path.resolve(inPath));
let md = fs.readFileSync(inPath, 'utf8');

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Convierte una imagen local a data URI base64. Si no existe, deja la ruta.
function imgToDataUri(src) {
  try {
    const clean = src.split('#')[0].split('?')[0];
    const abs = path.resolve(baseDir, clean);
    if (!fs.existsSync(abs)) return null;
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
        ? 'image/png'
        : ext === 'gif'
        ? 'image/gif'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'svg'
        ? 'image/svg+xml'
        : 'application/octet-stream';
    const b64 = fs.readFileSync(abs).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

// Formato inline: negrita, código, enlaces, imágenes.
function inline(text) {
  // Imágenes ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
    const data = imgToDataUri(src.trim());
    const finalSrc = data || src.trim();
    return `<img alt="${esc(alt)}" src="${finalSrc}" />`;
  });
  // Enlaces [texto](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
    return `<a href="${url.trim()}">${esc(label)}</a>`;
  });
  // Código `inline`
  text = text.replace(/`([^`]+)`/g, (m, c) => `<code>${esc(c)}</code>`);
  // Negrita **texto**
  text = text.replace(/\*\*([^*]+)\*\*/g, (m, b) => `<strong>${esc(b)}</strong>`);
  return text;
}

const lines = md.split(/\r?\n/);
let html = '';
let i = 0;

function flushParagraph(buf) {
  if (buf.length) {
    html += `<p>${inline(buf.join(' '))}</p>\n`;
    buf.length = 0;
  }
}

const para = [];

while (i < lines.length) {
  let line = lines[i];

  // Bloque de código ```
  if (/^```/.test(line)) {
    flushParagraph(para);
    i++;
    const code = [];
    while (i < lines.length && !/^```/.test(lines[i])) {
      code.push(lines[i]);
      i++;
    }
    i++; // saltar cierre
    html += `<pre><code>${esc(code.join('\n'))}</code></pre>\n`;
    continue;
  }

  // Tabla (encabezado | --- | fila)
  if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /\|/.test(lines[i + 1])) {
    flushParagraph(para);
    const header = line.split('|').map((c) => c.trim()).filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
    i += 2; // saltar encabezado y separador
    let rows = '';
    while (i < lines.length && /\|/.test(lines[i])) {
      const cells = lines[i].split('|').map((c) => c.trim()).filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));
      rows += '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>\n';
      i++;
    }
    html += '<table><thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>\n' + rows + '</tbody></table>\n';
    continue;
  }

  // Encabezados
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    flushParagraph(para);
    const level = h[1].length;
    html += `<h${level}>${inline(h[2])}</h${level}>\n`;
    i++;
    continue;
  }

  // Separador ---
  if (/^\s*---\s*$/.test(line)) {
    flushParagraph(para);
    html += '<hr/>\n';
    i++;
    continue;
  }

  // Cita >
  if (/^\s*>\s?/.test(line)) {
    flushParagraph(para);
    const quote = [];
    while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
      quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i++;
    }
    html += `<blockquote>${inline(quote.join(' '))}</blockquote>\n`;
    continue;
  }

  // ¿La línea inicia un nuevo bloque? (sirve para saber cuándo termina un ítem
  // de lista o un párrafo que ocupa varias líneas).
  const startsNewBlock = (l) =>
    l === undefined ||
    /^\s*$/.test(l) ||
    /^\s*[-*]\s+/.test(l) ||
    /^\s*\d+\.\s+/.test(l) ||
    /^(#{1,6})\s+/.test(l) ||
    /^\s*>\s?/.test(l) ||
    /^```/.test(l) ||
    /^\s*---\s*$/.test(l);

  // Listas (- o *). Un ítem puede ocupar varias líneas: se unen hasta que
  // aparezca otro marcador o una línea en blanco.
  if (/^\s*[-*]\s+/.test(line)) {
    flushParagraph(para);
    html += '<ul>\n';
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      let item = lines[i].replace(/^\s*[-*]\s+/, '');
      i++;
      while (i < lines.length && !startsNewBlock(lines[i])) {
        item += ' ' + lines[i].trim();
        i++;
      }
      html += `<li>${inline(item)}</li>\n`;
    }
    html += '</ul>\n';
    continue;
  }

  // Lista numerada (misma lógica de continuación de líneas).
  if (/^\s*\d+\.\s+/.test(line)) {
    flushParagraph(para);
    html += '<ol>\n';
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
      let item = lines[i].replace(/^\s*\d+\.\s+/, '');
      i++;
      while (i < lines.length && !startsNewBlock(lines[i])) {
        item += ' ' + lines[i].trim();
        i++;
      }
      html += `<li>${inline(item)}</li>\n`;
    }
    html += '</ol>\n';
    continue;
  }

  // Línea vacía
  if (/^\s*$/.test(line)) {
    flushParagraph(para);
    i++;
    continue;
  }

  // Párrafo acumulado
  para.push(line);
  i++;
}
flushParagraph(para);

const title = path.basename(inPath, '.md');
const doc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 820px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; }
  h1 { font-size: 1.9rem; border-bottom: 3px solid #6366f1; padding-bottom: .3rem; }
  h2 { font-size: 1.4rem; margin-top: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: .2rem; }
  h3 { font-size: 1.15rem; margin-top: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #cbd5e1; padding: .5rem .7rem; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  code { background: #f1f5f9; padding: .1rem .35rem; border-radius: 4px; font-size: .9em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #6366f1; margin: 1rem 0; padding: .5rem 1rem; background: #f8fafc; color: #475569; }
  img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; margin: .5rem 0; display: block; }
  a { color: #4f46e5; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
  @media print { body { max-width: none; } a { color: #1e293b; } }
</style>
</head>
<body>
${html}
</body>
</html>`;

fs.writeFileSync(outPath, doc, 'utf8');
console.log('OK: ' + outPath);
