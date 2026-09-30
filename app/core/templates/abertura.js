// Modelo "Abertura e menu": splash screen, menu com cursor, créditos e uma cena de jogo simples.
import { createEmptyProject } from '../project.js';
import { palette, tileset, imageTileset, sprite, scene, layer, sfx, finalize } from './art.js';
import { FONT_GLYPHS } from '../gfx/font.js';

/** Gera a imagem da splash (256x224) com letras grandes e estrelas. Cores 1..15 da paleta BG 1. */
function splashImage(big = 'RETRO', small = 'ESTUDIO DE GAMES') {
  const W = 256, H = 224;
  const px = Array.from({ length: H }, () => new Array(W).fill('0'));
  // estrelas
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 70; i++) { const x = rnd(W), y = rnd(H); px[y][x] = i % 5 === 0 ? '1' : '2'; }
  // faixa "horizonte" em degraus (dithering)
  for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) {
    const band = Math.floor((y - 150) / 12);
    if ((x + y) % 2 === 0 || band > 2) px[y][x] = ['a', 'b', 'c', 'd', 'e', 'e', 'e'][band];
  }
  for (let x = 0; x < W; x++) px[150][x] = '9';
  // letras grandes (fonte 8x8 ampliada 5x) com gradiente vertical e contorno
  const scale = 5;
  const tw = big.length * 8 * scale;
  const ox = Math.floor((W - tw) / 2), oy = 48;
  const grad = ['3', '3', '4', '4', '5', '5', '6', '6'];
  const ink = (x, y) => {
    const ch = big[Math.floor((x - ox) / (8 * scale))];
    if (!ch || x < ox || y < oy || y >= oy + 8 * scale) return false;
    const g = FONT_GLYPHS[ch.charCodeAt(0) - 32];
    const gx = Math.floor(((x - ox) % (8 * scale)) / scale), gy = Math.floor((y - oy) / scale);
    return g[gy * 8 + gx] === 1;
  };
  for (let y = oy - 3; y < oy + 8 * scale + 3; y++) for (let x = ox - 3; x < ox + tw + 3; x++) {
    if (ink(x, y)) px[y][x] = grad[Math.floor((y - oy) / scale)];
    else if (ink(x - 2, y - 2) || ink(x - 1, y - 1) || ink(x + 1, y) || ink(x, y + 1) || ink(x - 1, y) || ink(x, y - 1)) px[y][x] = '7';
  }
  // texto pequeno
  const sx = Math.floor((W - small.length * 8) / 2), sy = 110;
  [...small].forEach((ch, i) => {
    const g = FONT_GLYPHS[ch.charCodeAt(0) - 32];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = g[y * 8 + x]; if (v) px[sy + y][sx + i * 8 + x] = v === 1 ? '1' : '8'; }
  });
  return px.map((r) => r.join(''));
}

const CURSOR = `
11......
1221....
122221..
12222221
122221..
1221....
11......
........`;

const ESTRELA = `
...33...
...33...
.333333.
33322333
.332233.
..3333..
.33..33.
33....33`;

// moldura "9-slice": cantos, bordas e miolo
const M = {
  ce: `
..111111
.1222222
12233333
12333333
12333333
12333333
12333333
12333333`,
  h: `
11111111
22222222
33333333
33333333
33333333
33333333
33333333
33333333`,
  e: `
12333333
12333333
12333333
12333333
12333333
12333333
12333333
12333333`,
  m: `
33333333
33333333
33333333
33333333
33333333
33333333
33333333
33333333`,
};
const flipX = (a) => a.trim().split('\n').map((r) => [...r].reverse().join('')).join('\n');
const flipY = (a) => a.trim().split('\n').reverse().join('\n');

export function splashCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  return `// Tela de abertura (splash screen): aparece ao ligar o jogo
${e(1, `var tempo = 0
`)}${e(2, `var luz = 0
`)}
func start()
${e(2, `  brightness(0)     // começa com a tela apagada
`)}end

func update()
${e(1, `  tempo += 1
`)}${e(2, `  // acende aos poucos: +1 de brilho a cada 4 quadros (fade in manual)
  if tempo % 4 == 0 and luz < 15 then
    luz += 1
    brightness(luz)
  end
`)}${e(1, `  // depois de 3 segundos (180 quadros) ou apertando START, vai para o menu
  if tempo > 180 or btnp(START) then go(menu) end
`)}end
`;
}

export function menuCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  return `// Menu principal
${e(4, `const OPCOES = 3
var opcao = 0          // 0 = jogar, 1 = como jogar, 2 = créditos
`)}
func start()
${e(3, `  text(9, 6, "MEU JOGO RETRO")
  text(12, 13, "JOGAR")
  text(12, 15, "COMO JOGAR")
  text(12, 17, "CREDITOS")
  text(4, 25, "SETAS ESCOLHEM  A CONFIRMA")
`)}end

func update()
${e(4, `  if btnp(DOWN) then
    opcao = (opcao + 1) % OPCOES
${e(5, `    sfx(cursor)
`)}  end
  if btnp(UP) then
    opcao = (opcao + OPCOES - 1) % OPCOES
${e(5, `    sfx(cursor)
`)}  end
  // o cursor pula 2 linhas de texto (16 pixels) por opção
  spr(0, seta, 80, 104 + opcao * 16)
`)}${e(7, `
  if btnp(A) or btnp(START) then
${e(5, `    sfx(escolhe)
`)}    if opcao == 0 then go(jogo) end
    if opcao == 1 then go(ajuda) end
    if opcao == 2 then go(creditos) end
  end
`)}end
`;
}

export const AJUDA_CODE = `// Como jogar
func start()
  text(10, 4, "COMO JOGAR")
  text(3, 9, "PEGUE AS ESTRELAS COM")
  text(3, 11, "AS SETAS DO CONTROLE.")
  text(3, 15, "B = VOLTAR AO MENU")
end

func update()
  if btnp(B) then go(menu) end
end
`;

export const CREDITOS_CODE = `// Créditos
func start()
  text(11, 5, "CREDITOS")
  text(5, 10, "FEITO COM SNESLADOR")
  text(5, 12, "NA FEIRA DE JOGOS RETRO")
  text(5, 18, "B = VOLTAR AO MENU")
end

func update()
  if btnp(B) then go(menu) end
end
`;

export const JOGO_CODE = `// Um jogo bem simples para começar: pegue a estrela!
var x = 120
var y = 100
var ex = 40
var ey = 40
var pontos = 0

func start()
  text(1, 1, "ESTRELAS")
  text(20, 1, "B = MENU")
end

func update()
  if btn(LEFT) then x -= 2 end
  if btn(RIGHT) then x += 2 end
  if btn(UP) then y -= 2 end
  if btn(DOWN) then y += 2 end
  if overlap(x, y, 8, 8, ex, ey, 8, 8) then
    pontos += 1
    sfx(escolhe)
    ex = 16 + rnd(224)
    ey = 24 + rnd(180)
  end
  spr(0, seta, x, y)
  spr(1, estrela, ex, ey)
  num(10, 1, pontos)
  if btnp(B) then go(menu) end
end
`;

export function createAbertura(name, { tutorial = false } = {}) {
  const p = createEmptyProject(name);
  p.palettes.bg[1] = palette([null, '#f8f8f8', '#8890c8', '#f8f080', '#f8c040', '#f88830', '#e04830', '#301048', '#a0a0d8', '#f860a0', '#50286c', '#402060', '#301850', '#281440', '#200c34']);
  p.palettes.bg[2] = palette([null, '#f8e8a0', '#c89848', '#3a2a78']);
  p.palettes.obj[0] = palette([null, '#101010', '#f8f8f8', '#f8d830']);

  const logo = imageTileset('logo', 1, splashImage(), 256, 224);
  const moldura = tileset('moldura', 2, [null, { art: M.ce }, { art: M.h }, { art: flipX(M.ce) }, { art: M.e }, { art: M.m }, { art: flipX(M.e) }, { art: flipY(M.ce) }, { art: flipY(M.h) }, { art: flipY(flipX(M.ce)) }]);
  p.tilesets = [logo, moldura];

  const smap = layer(logo.id);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 32; x++) smap.set(x, y, y * 32 + x);
  const splash = scene('splash', splashCode(tutorial ? 0 : 2), smap, { bgcolor: '#140a28' });

  const mmap = layer(moldura.id);
  const box = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const top = y === y0, bot = y === y1, left = x === x0, right = x === x1;
      mmap.set(x, y, top ? (left ? 1 : right ? 3 : 2) : bot ? (left ? 7 : right ? 9 : 8) : left ? 4 : right ? 6 : 5);
    }
  };
  box(8, 11, 23, 19);
  const menu = scene('menu', menuCode(tutorial ? 0 : 7), mmap, { bgcolor: '#28185a' });
  const jogo = scene('jogo', JOGO_CODE, layer(moldura.id), { bgcolor: '#102040' });
  const ajuda = scene('ajuda', AJUDA_CODE, layer(moldura.id), { bgcolor: '#28185a' });
  p.scenes = tutorial ? [splash, menu, jogo, ajuda] : [splash, menu, jogo, ajuda, scene('creditos', CREDITOS_CODE, layer(moldura.id), { bgcolor: '#28185a' })];
  p.startScene = splash.id;
  p.sprites = [sprite('seta', 8, 0, [CURSOR]), sprite('estrela', 8, 0, [ESTRELA])];
  const files = {};
  // o jogo de exemplo usa o som "escolhe" desde o começo
  const sounds = tutorial ? [['escolhe', 'moeda', {}]] : [['cursor', 'blip', {}], ['escolhe', 'moeda', {}]];
  for (const [n, preset, tweak] of sounds) {
    const s = sfx(n, preset, tweak);
    p.sounds.push(s.asset);
    files[s.file] = s.data;
  }
  return { project: finalize(p), files };
}
