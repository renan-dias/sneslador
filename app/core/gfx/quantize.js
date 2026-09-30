// Converte imagens RGBA para pixels indexados de 4 bits (15 cores + transparente), no espaço de cor do SNES.
import { rgbToBgr555, bgr555ToRgb } from './snes.js';

const key5 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/**
 * @param {Uint8ClampedArray} rgba
 * @param {object} opts
 * @param {number[]|null} opts.palette  paleta existente (16 cores BGR555). Se null, cria uma paleta nova.
 * @param {number} opts.maxColors  cores disponíveis além da transparente (padrão 15)
 * @returns {{pixels: Uint8Array, palette: number[], reduced: boolean}}
 */
export function quantize(rgba, w, h, { palette = null, maxColors = 15 } = {}) {
  const n = w * h;
  const pixels = new Uint8Array(n);
  if (palette) {
    const rgb = palette.map(bgr555ToRgb);
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const k = key5(r, g, b);
      let best = cache.get(k);
      if (best === undefined) {
        let bd = Infinity;
        best = 1;
        for (let c = 1; c < rgb.length; c++) {
          const d = colorDist(r, g, b, rgb[c]);
          if (d < bd) { bd = d; best = c; }
        }
        cache.set(k, best);
      }
      pixels[i] = best;
    }
    return { pixels, palette: palette.slice(), reduced: false };
  }

  // contagem de cores já reduzidas para 5 bits por canal (o que o SNES consegue mostrar)
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const k = key5(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let colors = [...counts.entries()].map(([k, count]) => ({ r: (k >> 10) << 3, g: ((k >> 5) & 31) << 3, b: (k & 31) << 3, count }));
  let reduced = false;
  if (colors.length > maxColors) {
    colors = medianCut(colors, maxColors);
    reduced = true;
  }
  colors.sort((a, b) => (a.r * 0.3 + a.g * 0.59 + a.b * 0.11) - (b.r * 0.3 + b.g * 0.59 + b.b * 0.11));
  const pal = [0, ...colors.map((c) => rgbToBgr555(c.r, c.g, c.b))];
  while (pal.length < 16) pal.push(0);
  return { ...quantize(rgba, w, h, { palette: pal }), palette: pal, reduced };
}

function colorDist(r, g, b, [r2, g2, b2]) {
  const dr = r - r2, dg = g - g2, db = b - b2;
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

function medianCut(colors, target) {
  let boxes = [colors];
  while (boxes.length < target) {
    let bi = -1, bestRange = -1, bestCh = 'r';
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (const ch of ['r', 'g', 'b']) {
        let lo = 255, hi = 0;
        for (const c of box) { lo = Math.min(lo, c[ch]); hi = Math.max(hi, c[ch]); }
        const range = (hi - lo) * Math.log2(box.reduce((a, c) => a + c.count, 0) + 1);
        if (range > bestRange) { bestRange = range; bi = i; bestCh = ch; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi].sort((a, b) => a[bestCh] - b[bestCh]);
    const total = box.reduce((a, c) => a + c.count, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length; i++) { acc += box[i].count; if (acc >= total / 2) { cut = Math.max(1, Math.min(box.length - 1, i + 1)); break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map((box) => {
    const t = box.reduce((a, c) => a + c.count, 0);
    const avg = (ch) => Math.round(box.reduce((a, c) => a + c[ch] * c.count, 0) / t);
    return { r: avg('r'), g: avg('g'), b: avg('b'), count: t };
  });
}
