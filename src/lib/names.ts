/**
 * Nombres guardados en MAYÚSCULAS ("PUNTO DE VENTA LA 49") se muestran en formato
 * normal ("Punto de Venta la 49"): solo al presentarlos, el dato no cambia.
 * Misma regla que `nice()` en public/app.js, para que panel, informe y correos
 * nombren igual a cada sede. Respeta siglas y palabras con números.
 */
const KEEP = new Set(['NFC', 'QR', 'SAS', 'S.A.S', 'CC', 'IPS', 'EPS', 'LTDA', 'SA', 'ID', 'TV', 'USA']);
const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al', 'por', 'con']);

function niceRun(run: string): string {
  return run
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || KEEP.has(w) || /\d/.test(w)) return w;
      const low = w.toLocaleLowerCase('es');
      if (i > 0 && SMALL.has(low)) return low;
      return low.charAt(0).toLocaleUpperCase('es') + low.slice(1);
    })
    .join('');
}

export function niceName(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/(?<!\p{L})\p{Lu}[\p{Lu}\d.&'-]*(?:\s+[\p{Lu}\d][\p{Lu}\d.&'-]*)+(?!\p{L})/gu, (run) =>
      /\p{Lu}{3}/u.test(run) ? niceRun(run) : run
    )
    .replace(/^\p{Lu}{4,}$/u, (w) => (KEEP.has(w) ? w : niceRun(w)));
}
