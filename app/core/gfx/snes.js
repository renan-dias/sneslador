// Formatos gráficos do SNES: cores BGR555 e tiles planares 2bpp / 4bpp.

/** #rrggbb (ou {r,g,b} 0-255) -> cor de 15 bits do SNES (0bbbbbgggggrrrrr) */
export function rgbToBgr555(r, g, b) {
  return ((r >> 3) & 31) | (((g >> 3) & 31) << 5) | (((b >> 3) & 31) << 10);
}

export function hexToBgr555(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgbToBgr555((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** cor de 15 bits -> [r,g,b] 0-255 (expande 5 bits para 8 repetindo os bits altos) */
export function bgr555ToRgb(c) {
  const r = c & 31;
  const g = (c >> 5) & 31;
  const b = (c >> 10) & 31;
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)];
}

export function bgr555ToHex(c) {
  const [r, g, b] = bgr555ToRgb(c);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Codifica um tile 8x8 (64 índices 0-15) no formato planar 4bpp: 32 bytes. */
export function encodeTile4bpp(px, out = new Uint8Array(32), off = 0) {
  for (let y = 0; y < 8; y++) {
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
    for (let x = 0; x < 8; x++) {
      const v = px[y * 8 + x];
      const bit = 7 - x;
      p0 |= (v & 1) << bit;
      p1 |= ((v >> 1) & 1) << bit;
      p2 |= ((v >> 2) & 1) << bit;
      p3 |= ((v >> 3) & 1) << bit;
    }
    out[off + y * 2] = p0;
    out[off + y * 2 + 1] = p1;
    out[off + 16 + y * 2] = p2;
    out[off + 16 + y * 2 + 1] = p3;
  }
  return out;
}

export function decodeTile4bpp(data, off, out = new Uint8Array(64)) {
  for (let y = 0; y < 8; y++) {
    const p0 = data[off + y * 2], p1 = data[off + y * 2 + 1];
    const p2 = data[off + 16 + y * 2], p3 = data[off + 16 + y * 2 + 1];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      out[y * 8 + x] = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1) | (((p2 >> bit) & 1) << 2) | (((p3 >> bit) & 1) << 3);
    }
  }
  return out;
}

/** Codifica um tile 8x8 (64 índices 0-3) no formato planar 2bpp: 16 bytes. */
export function encodeTile2bpp(px, out = new Uint8Array(16), off = 0) {
  for (let y = 0; y < 8; y++) {
    let p0 = 0, p1 = 0;
    for (let x = 0; x < 8; x++) {
      const v = px[y * 8 + x];
      p0 |= (v & 1) << (7 - x);
      p1 |= ((v >> 1) & 1) << (7 - x);
    }
    out[off + y * 2] = p0;
    out[off + y * 2 + 1] = p1;
  }
  return out;
}

export function decodeTile2bpp(data, off, out = new Uint8Array(64)) {
  for (let y = 0; y < 8; y++) {
    const p0 = data[off + y * 2], p1 = data[off + y * 2 + 1];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      out[y * 8 + x] = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1);
    }
  }
  return out;
}

/** Pixels guardados no projeto como string hex (um caractere por pixel). */
export function pixelsFromHex(str, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len && i < str.length; i++) out[i] = parseInt(str[i], 16) || 0;
  return out;
}

export function pixelsToHex(px) {
  let s = '';
  for (let i = 0; i < px.length; i++) s += px[i].toString(16);
  return s;
}

/** Recorta um tile 8x8 de uma imagem indexada w x h. */
export function cutTile(px, w, tx, ty) {
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = px[(ty * 8 + y) * w + tx * 8 + x];
  return out;
}

/** Endereço (em entradas de 16 bits) de uma célula num mapa SNES de 32 ou 64 colunas. */
export function mapAddr(w, x, y) {
  return (x >= 32 ? 0x400 : 0) + y * 32 + (x & 31);
}
