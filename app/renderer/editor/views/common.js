// Utilitários de desenho compartilhados pelos editores.
import { bgr555ToRgb, pixelsFromHex } from '../../../core/gfx/snes.js';

/** Lista de 16 cores [r,g,b] de uma paleta do projeto. kind: 'bg' | 'obj' */
export function paletteRgb(project, kind, index) {
  return (project.palettes[kind][index] ?? []).map((c) => bgr555ToRgb(c));
}

export function cssColor([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}

/**
 * Desenha pixels indexados num ImageData. Índice 0 = transparente.
 * @param {Uint8Array} px
 */
export function indexedToImageData(px, w, h, colors, transparent = null) {
  const img = new ImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = px[i];
    if (!v) {
      if (transparent) { d[i * 4] = transparent[0]; d[i * 4 + 1] = transparent[1]; d[i * 4 + 2] = transparent[2]; d[i * 4 + 3] = 255; }
      continue;
    }
    const c = colors[v] ?? [255, 0, 255];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  return img;
}

export function drawSpriteThumb(canvas, sprite, project, frame = 0) {
  canvas.width = sprite.size;
  canvas.height = sprite.size;
  const px = pixelsFromHex(sprite.frames[frame] ?? '', sprite.size * sprite.size);
  canvas.getContext('2d').putImageData(indexedToImageData(px, sprite.size, sprite.size, paletteRgb(project, 'obj', sprite.palette)), 0, 0);
}

/** Canvas com o tileset inteiro desenhado (1:1). */
export function tilesetCanvas(ts, project) {
  const c = document.createElement('canvas');
  c.width = ts.w;
  c.height = ts.h;
  const px = pixelsFromHex(ts.pixels, ts.w * ts.h);
  c.getContext('2d').putImageData(indexedToImageData(px, ts.w, ts.h, paletteRgb(project, 'bg', ts.palette)), 0, 0);
  return c;
}

/** Converte PNG/JPG (bytes) em ImageData. */
export async function decodeImage(bytes, type = 'image/png') {
  const blob = new Blob([bytes], { type });
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height);
}

export function canvasToPngBytes(canvas) {
  return new Promise((resolve) => canvas.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}

/** Retorna coordenada do mouse em pixels do canvas lógico (considerando zoom via CSS). */
export function canvasPos(canvas, e, scale) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / scale), y: Math.floor((e.clientY - r.top) / scale) };
}

/** Linha de Bresenham */
export function line(x0, y0, x1, y1, plot) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function floodFill(px, w, h, x, y, value) {
  const target = px[y * w + x];
  if (target === value) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h || px[cy * w + cx] !== target) continue;
    px[cy * w + cx] = value;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
