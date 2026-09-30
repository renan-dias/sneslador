// Converte um projeto em dados "de hardware": tiles 4bpp/2bpp, mapas, paletas (CGRAM),
// tabela de sprites e animações. O live view e o exportador de ROM usam o MESMO resultado.
import { encodeTile4bpp, encodeTile2bpp, pixelsFromHex, cutTile, mapAddr, bgr555ToHex } from './gfx/snes.js';
import { FONT_GLYPHS } from './gfx/font.js';
import { SPRITE_SIZE_MODES, validateProject } from './project.js';

export const LIMITS = {
  objTiles: 512, // 16 KB de VRAM para sprites
  bgTiles: 1024, // tiles de cenário por cena
  mapW: 64,
  mapH: 32,
};

// VRAM (endereços em palavras de 16 bits), igual no runtime C
export const VRAM = {
  bgTiles: 0x0000,
  fontTiles: 0x4000,
  bg1Map: 0x4800,
  bg2Map: 0x5000,
  bg3Map: 0x5800,
  objTiles: 0x6000,
};

export const TEXT_COLORS = { ink: 0x7fff, shadow: 0x0c63 };

export class BuildError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

export function buildGameData(project) {
  const problems = validateProject(project);
  const warnings = [];
  const mode = SPRITE_SIZE_MODES[project.spriteSize] ?? SPRITE_SIZE_MODES['8_16'];

  // ---------- paletas ----------
  const cgram = new Uint16Array(256);
  for (let p = 0; p < 8; p++) {
    for (let c = 0; c < 16; c++) {
      cgram[p * 16 + c] = project.palettes.bg[p]?.[c] ?? 0;
      cgram[128 + p * 16 + c] = project.palettes.obj[p]?.[c] ?? 0;
    }
  }
  // paleta 0 de BG é do sistema: cor 0 = fundo, 1 = texto, 2 = sombra do texto
  cgram[1] = TEXT_COLORS.ink;
  cgram[2] = TEXT_COLORS.shadow;

  // ---------- sprites: aloca tiles na VRAM de sprites (grade 16 x 32 tiles) ----------
  const grid = new Uint8Array(16 * 32);
  const objTiles = new Uint8Array(LIMITS.objTiles * 32);
  let objUsed = 0;
  const alloc = (cells) => {
    for (let y = 0; y + cells <= 32; y++) {
      for (let x = 0; x + cells <= 16; x++) {
        let free = true;
        for (let yy = 0; yy < cells && free; yy++) for (let xx = 0; xx < cells && free; xx++) if (grid[(y + yy) * 16 + x + xx]) free = false;
        if (free) {
          for (let yy = 0; yy < cells; yy++) for (let xx = 0; xx < cells; xx++) grid[(y + yy) * 16 + x + xx] = 1;
          return y * 16 + x;
        }
      }
    }
    return -1;
  };
  // sprites grandes primeiro para não fragmentar a grade
  const order = project.sprites.map((s, i) => i).sort((a, b) => project.sprites[b].size - project.sprites[a].size);
  const sprites = new Array(project.sprites.length);
  for (const si of order) {
    const s = project.sprites[si];
    if (s.size !== mode.small && s.size !== mode.large) {
      problems.push(`O sprite "${s.name}" tem ${s.size}x${s.size}, mas o projeto usa sprites de ${mode.label}. Mude o tamanho do sprite ou o modo de sprites do projeto.`);
      continue;
    }
    const cells = s.size / 8;
    const frames = [];
    for (let f = 0; f < s.frames.length; f++) {
      const base = alloc(cells);
      if (base < 0) {
        problems.push(`A VRAM de sprites encheu (máx. ${LIMITS.objTiles} tiles de 8x8). Remova quadros de "${s.name}" ou de outros sprites.`);
        break;
      }
      const px = pixelsFromHex(s.frames[f], s.size * s.size);
      for (let ty = 0; ty < cells; ty++) {
        for (let tx = 0; tx < cells; tx++) {
          const tile = cutTile(px, s.size, tx, ty);
          const num = base + ty * 16 + tx;
          encodeTile4bpp(tile, objTiles, num * 32);
          objUsed = Math.max(objUsed, num + 1);
        }
      }
      frames.push(base);
    }
    sprites[si] = { name: s.name, large: s.size === mode.large ? 1 : 0, size: s.size, palette: s.palette & 7, frames };
  }

  // ---------- animações ----------
  const anims = [];
  project.sprites.forEach((s, si) => {
    for (const an of s.anims) {
      const frames = an.frames.filter((f) => f >= 0 && f < s.frames.length);
      if (!frames.length) warnings.push(`A animação "${s.name}_${an.name}" não tem quadros.`);
      anims.push({ name: `${s.name}_${an.name}`, sprite: si, frames: frames.length ? frames : [0], speed: Math.max(1, an.speed | 0), loop: an.loop !== false });
    }
  });

  // ---------- fonte (BG3, 2bpp) ----------
  const fontTiles = new Uint8Array(96 * 16);
  FONT_GLYPHS.forEach((g, i) => encodeTile2bpp(g, fontTiles, i * 16));

  // ---------- cenas ----------
  const tilesetById = new Map(project.tilesets.map((t) => [t.id, t]));
  const scenes = project.scenes.map((sc) => buildScene(sc, tilesetById, problems, warnings));

  const startScene = Math.max(0, project.scenes.findIndex((s) => s.id === project.startScene));

  if (problems.length) throw new BuildError(problems);

  return {
    title: project.romTitle || project.name,
    spriteMode: mode,
    cgram,
    objTiles: objTiles.slice(0, Math.max(1, objUsed) * 32),
    objTileCount: objUsed,
    sprites,
    anims,
    fontTiles,
    scenes,
    startScene,
    warnings,
  };
}

function buildScene(sc, tilesetById, problems, warnings) {
  const tiles = [new Uint8Array(32)]; // tile 0 = transparente
  const tileKeys = new Map([['0'.repeat(64) + ':0', 0]]);
  const tileCell = [-1];
  const tileFlags = [0];

  const addTileset = (layer, withFlags) => {
    if (!layer || !layer.tileset) return null;
    const ts = tilesetById.get(layer.tileset);
    if (!ts) { problems.push(`A cena "${sc.name}" usa um tileset que não existe mais.`); return null; }
    const cols = ts.w / 8, rows = ts.h / 8;
    const px = pixelsFromHex(ts.pixels, ts.w * ts.h);
    const cellTile = new Uint16Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const cell = cy * cols + cx;
        const t = cutTile(px, ts.w, cx, cy);
        const flags = withFlags ? ((ts.solid?.[cell] ? 0x80 : 0) | ((ts.tags?.[cell] ?? 0) & 15)) : 0;
        const key = Array.prototype.join.call(t, '') + ':' + flags;
        let num = tileKeys.get(key);
        if (num === undefined) {
          num = tiles.length;
          tiles.push(encodeTile4bpp(t));
          tileKeys.set(key, num);
          tileCell.push(withFlags ? cell : -1);
          tileFlags.push(flags);
        }
        cellTile[cell] = num;
      }
    }
    return { ts, cellTile, cellCount: cols * rows };
  };

  const l1 = addTileset(sc.bg1, true);
  const l2 = addTileset(sc.bg2, false);
  if (tiles.length > LIMITS.bgTiles) {
    problems.push(`A cena "${sc.name}" usa ${tiles.length} tiles diferentes, mas a VRAM só comporta ${LIMITS.bgTiles}. Simplifique o tileset (tiles repetidos contam só uma vez).`);
  }

  const buildMap = (layer, info, maxW) => {
    if (!layer || !info) return null;
    const w = Math.min(layer.w, maxW), h = 32;
    const map = new Uint16Array(w === 64 ? 2048 : 1024);
    const pal = (info.ts.palette & 7) << 10;
    for (let y = 0; y < Math.min(layer.h, h); y++) {
      for (let x = 0; x < w; x++) {
        const cell = layer.cells[y * layer.w + x];
        const num = cell >= 0 && cell < info.cellCount ? info.cellTile[cell] : 0;
        map[mapAddr(w, x, y)] = num ? num | pal : 0;
      }
    }
    return { w, h, map, palette: info.ts.palette & 7 };
  };

  if (sc.bg1 && sc.bg1.w > 64) warnings.push(`A cena "${sc.name}" tem mapa com mais de 64 colunas; só as 64 primeiras entram na ROM.`);
  const bg1 = buildMap(sc.bg1, l1, 64);
  const bg2 = buildMap(sc.bg2, l2, 32);
  const bgTiles = new Uint8Array(tiles.length * 32);
  tiles.forEach((t, i) => bgTiles.set(t, i * 32));

  return {
    name: sc.name,
    bgcolor: sc.bgcolor & 0x7fff,
    bgTiles,
    bgTileCount: tiles.length,
    bg1,
    bg2,
    parallax: sc.bg2?.parallax ?? 0,
    tileCell: Int16Array.from(tileCell),
    tileFlags: Uint8Array.from(tileFlags),
    cellTile: l1 ? l1.cellTile : new Uint16Array(0),
    bg1Palette: bg1 ? bg1.palette : 0,
  };
}

/** Resumo de uso de hardware, mostrado no painel "Raio-X do console". */
export function hardwareReport(data) {
  return {
    objTiles: { used: data.objTileCount, max: LIMITS.objTiles },
    scenes: data.scenes.map((s) => ({ name: s.name, bgTiles: s.bgTileCount, max: LIMITS.bgTiles })),
    colors: data.cgram.length,
    backdrop: bgr555ToHex(data.scenes[0]?.bgcolor ?? 0),
  };
}
