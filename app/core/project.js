// Modelo de dados de um projeto Sneslador (project.json).
import { hexToBgr555 } from './gfx/snes.js';

export const PROJECT_FORMAT = 1;

export const SPRITE_SIZE_MODES = {
  '8_16': { small: 8, large: 16, obsel: 'OBJ_SIZE8_L16', label: '8x8 e 16x16' },
  '16_32': { small: 16, large: 32, obsel: 'OBJ_SIZE16_L32', label: '16x16 e 32x32' },
  '8_32': { small: 8, large: 32, obsel: 'OBJ_SIZE8_L32', label: '8x8 e 32x32' },
};

const DEFAULT_COLORS = [
  '#000000', '#f8f8f8', '#a8a8a8', '#585858', '#f83800', '#f8b800', '#00a800', '#58d854',
  '#0058f8', '#3cbcfc', '#d800cc', '#f878f8', '#ac7c00', '#f8d878', '#e40058', '#881400',
];

export function defaultPalette() {
  return DEFAULT_COLORS.map(hexToBgr555);
}

export function uid(prefix = 'a') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function emptyScene(name, tilesetId = null) {
  return {
    id: uid('scn'),
    name,
    bgcolor: hexToBgr555('#1c2038'),
    script: `// Cena "${name}"\n// start() roda uma vez quando a cena começa.\n// update() roda 60 vezes por segundo.\n\nfunc start()\n  text(2, 2, "CENA ${name.toUpperCase()}")\nend\n\nfunc update()\nend\n`,
    bg1: { tileset: tilesetId, w: 32, h: 32, cells: new Array(32 * 32).fill(-1) },
    bg2: null,
  };
}

export function emptyTileset(name, palette = 1) {
  return {
    id: uid('ts'),
    name,
    palette,
    w: 128,
    h: 64,
    pixels: '0'.repeat(128 * 64),
    solid: new Array(16 * 8).fill(false),
    tags: new Array(16 * 8).fill(0),
  };
}

export function emptySprite(name, size = 16, palette = 0) {
  return {
    id: uid('spr'),
    name,
    size,
    palette,
    frames: ['0'.repeat(size * size)],
    anims: [],
  };
}

export function createEmptyProject(name) {
  const ts = emptyTileset('cenario');
  const scene = emptyScene('inicio', ts.id);
  const bg = [];
  for (let i = 0; i < 8; i++) bg.push(defaultPalette());
  const obj = [];
  for (let i = 0; i < 8; i++) obj.push(defaultPalette());
  return {
    format: PROJECT_FORMAT,
    name,
    romTitle: name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 21) || 'MEU JOGO',
    spriteSize: '8_16',
    soundRate: 8000,
    palettes: { bg, obj },
    tilesets: [ts],
    sprites: [],
    sounds: [],
    songs: [],
    scenes: [scene],
    startScene: scene.id,
    globalScript: '// Script global: variáveis e funções que todas as cenas enxergam.\n// Ex: var pontos = 0\n',
  };
}

/** Nome válido para usar no código: letras, números e _, começando com letra. */
export function isValidName(n) {
  return /^[a-z_][a-z0-9_]{0,23}$/i.test(n);
}

export function sanitizeName(n) {
  let s = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
  if (!s) s = 'asset';
  return s.slice(0, 24);
}

/** Constantes que o código enxerga para cada asset (sprites, sons, cenas, animações). */
export function assetConstants(project) {
  const consts = {};
  project.sprites.forEach((s, i) => { consts[s.name] = i; });
  project.sounds.forEach((s, i) => { consts[s.name] = i; });
  project.scenes.forEach((s, i) => { consts[s.name] = i; });
  (project.songs ?? []).forEach((s, i) => { consts[s.name] = i; });
  let a = 0;
  for (const s of project.sprites) for (const an of s.anims) consts[`${s.name}_${an.name}`] = a++;
  return consts;
}

/** Problemas de nomes/limites que impedem compilar. */
export function validateProject(project) {
  const problems = [];
  const seen = new Map();
  const check = (kind, name) => {
    if (!isValidName(name)) problems.push(`${kind} "${name}": use só letras sem acento, números e _ (sem espaços).`);
    if (seen.has(name)) problems.push(`O nome "${name}" é usado por ${seen.get(name)} e por ${kind}. Cada asset precisa de um nome único.`);
    seen.set(name, kind);
  };
  project.sprites.forEach((s) => check('o sprite', s.name));
  project.sounds.forEach((s) => check('o som', s.name));
  project.scenes.forEach((s) => check('a cena', s.name));
  (project.songs ?? []).forEach((s) => check('a música', s.name));
  for (const s of project.sprites) for (const an of s.anims) check('a animação', `${s.name}_${an.name}`);
  if (!project.scenes.length) problems.push('O projeto precisa de pelo menos uma cena.');
  if (project.sprites.length > 128) problems.push('Máximo de 128 sprites diferentes.');
  if (project.sounds.length > 16) problems.push('Máximo de 16 efeitos sonoros (limite do driver de som snesmod).');
  return problems;
}
