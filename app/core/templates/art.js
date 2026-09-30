// Ajudantes para escrever pixel art "em texto" nos modelos de projeto.
// Em cada desenho: '.' = transparente (cor 0), '1'..'9','a'..'f' = cor da paleta.
import { uid, defaultPalette } from '../project.js';
import { hexToBgr555 } from '../gfx/snes.js';
import { renderSfx, SFX_PRESETS, SFX_RATE } from '../audio/sfxgen.js';
import { encodeWav16 } from '../audio/wav.js';

export function grid(str) {
  const rows = str.split('\n').map((r) => r.trim()).filter((r) => r.length);
  return rows.map((r) => r.replace(/\./g, '0'));
}

/** Converte grades (arrays de strings) em string hex de w*h pixels. */
export function toHex(rows, w, h) {
  let s = '';
  for (let y = 0; y < h; y++) {
    const r = rows[y] ?? '';
    for (let x = 0; x < w; x++) s += (r[x] ?? '0').toLowerCase();
  }
  return s;
}

export function palette(colors) {
  const p = defaultPalette();
  colors.forEach((c, i) => { if (c) p[i] = hexToBgr555(c); });
  return p;
}

/**
 * Monta um tileset a partir de uma lista de tiles 8x8.
 * tiles: [{art: string, solid?: bool, tag?: number}] — o índice na lista vira o número da célula.
 */
export function tileset(name, pal, tiles, cols = 16) {
  const rowsN = Math.max(1, Math.ceil(tiles.length / cols));
  const w = cols * 8, h = rowsN * 8;
  const px = new Array(w * h).fill('0');
  const solid = new Array(cols * rowsN).fill(false);
  const tags = new Array(cols * rowsN).fill(0);
  tiles.forEach((t, i) => {
    if (!t) return;
    const g = grid(t.art);
    const cx = (i % cols) * 8, cy = Math.floor(i / cols) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(cy + y) * w + cx + x] = (g[y]?.[x] ?? '0').toLowerCase();
    solid[i] = !!t.solid;
    tags[i] = t.tag ?? 0;
  });
  return { id: uid('ts'), name, palette: pal, w, h, pixels: px.join(''), solid, tags };
}

/** Tileset a partir de uma imagem grande (grade de linhas). */
export function imageTileset(name, pal, rows, w, h) {
  const cols = w / 8, rn = h / 8;
  return { id: uid('ts'), name, palette: pal, w, h, pixels: toHex(rows, w, h), solid: new Array(cols * rn).fill(false), tags: new Array(cols * rn).fill(0) };
}

export function sprite(name, size, pal, frames, anims = []) {
  return { id: uid('spr'), name, size, palette: pal, frames: frames.map((f) => toHex(grid(f), size, size)), anims };
}

export function scene(name, script, bg1, extra = {}) {
  return { id: uid('scn'), name, bgcolor: hexToBgr555(extra.bgcolor ?? '#000000'), script, bg1, bg2: extra.bg2 ?? null };
}

/** Camada de mapa vazia; use set(x, y, cell) para preencher. */
export function layer(tilesetId, w = 32, h = 32) {
  const cells = new Array(w * h).fill(-1);
  return {
    tileset: tilesetId, w, h, cells,
    set(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = c; },
    fill(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); },
    toJSON() { return { tileset: this.tileset, w, h, cells, ...(this.parallax !== undefined ? { parallax: this.parallax } : {}) }; },
  };
}

/** Efeito sonoro gerado: devolve o asset e o arquivo WAV. */
export function sfx(name, preset, tweak = {}) {
  const id = uid('snd');
  const gen = { ...SFX_PRESETS[preset], ...tweak };
  const file = `sounds/${id}.wav`;
  return { asset: { id, name, file, volume: 15, gen, rev: 0 }, file, data: encodeWav16(renderSfx(gen), SFX_RATE) };
}

/** Converte JSON (remove métodos auxiliares das camadas). */
export function finalize(project) {
  return JSON.parse(JSON.stringify(project));
}
