// Modelo "Labirinto" — come-bolinhas com fantasmas, inspirado num clássico de fliperama de 1980.
import { createEmptyProject, uid } from '../project.js';
import { palette, tileset, sprite, scene, layer, sfx, finalize } from './art.js';

// Metade esquerda (14 colunas); a direita é espelhada. '#'=parede '.'=bolinha 'o'=energia ' '=vazio
const HALF = [
  '##############', '#o...........#', '#.####.#####.#', '#.####.#####.#', '#.............', '#.####.#.#####', '#......#.....#',
  '######.#####.#', '######.#......', '######.#.###  ', '######.#.#    ', '######.#.#####', '######.#......', '######.#.#####',
  '#............#', '#.####.#####.#', '#o..##........', '###.##.#.#####', '#......#.....#', '#.##########.#', '#.............', '##############',
];
export const MAZE = HALF.map((r) => r + [...r.slice(0, 13)].reverse().join(''));
export const OX = 2;
export const OY = 3;

// Parede com "autotile": a borda clara só aparece nos lados que não encostam em outra parede.
function wallTile(mask) {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let r = '';
    for (let x = 0; x < 8; x++) {
      const n = !(mask & 1) && y === 1, e = !(mask & 2) && x === 6, s = !(mask & 4) && y === 6, w = !(mask & 8) && x === 1;
      const outside = (!(mask & 1) && y < 1) || (!(mask & 2) && x > 6) || (!(mask & 4) && y > 6) || (!(mask & 8) && x < 1);
      r += outside ? '.' : n || e || s || w ? '1' : '2';
    }
    rows.push(r);
  }
  return rows.join('\n');
}

const DOT = `
........
........
........
...33...
...33...
........
........
........`;

const POWER = `
........
..3333..
.333333.
.333333.
.333333.
.333333.
..3333..
........`;

const HERO = [`
..1111..
.111111.
11111111
11111111
11111111
11111111
.111111.
..1111..`, `
..1111..
.111111.
1111111.
11111...
11111...
1111111.
.111111.
..1111..`, `
..1111..
.11111..
11111...
1111....
1111....
11111...
.11111..
..1111..`, `
..1111..
.111111.
11111111
11111111
111..111
11....11
.1....1.
........`, `
..1111..
.111111.
11111111
111..111
11....11
1......1
........
........`];

function ghost(c) {
  return `
..${c}${c}${c}${c}..
.${c}${c}${c}${c}${c}${c}.
${c}66${c}66${c}${c}
${c}67${c}67${c}${c}
${c}${c}${c}${c}${c}${c}${c}${c}
${c}${c}${c}${c}${c}${c}${c}${c}
${c}${c}${c}${c}${c}${c}${c}${c}
${c}.${c}${c}.${c}${c}.`;
}
const EYES = `
........
........
.66.66..
.67.67..
........
........
........
........`;

export function labirintoCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  const hx = (OX + 13) * 8, hy = (OY + 16) * 8;
  return `// LABIRINTO — come-bolinhas (inspirado num clássico de 1980)
${e(1, `const OX = ${OX}        // coluna do mapa onde o labirinto começa
const OY = ${OY}        // linha do mapa onde o labirinto começa
const INICIO_X = ${hx} // posição inicial do herói (em pixels)
const INICIO_Y = ${hy}
`)}${e(3, `
// direções: 0 = direita, 1 = baixo, 2 = esquerda, 3 = cima
array DX = {1, 0, -1, 0}
array DY = {0, 1, 0, -1}
`)}
${e(1, `var x = INICIO_X
var y = INICIO_Y
`)}${e(2, `var dir = 2           // para onde o herói está indo
var quer = 2          // para onde o jogador quer ir
`)}${e(4, `var pontos = 0
var restam = 0        // bolinhas que faltam
`)}${e(5, `array gx[3]           // os 3 fantasmas
array gy[3]
array gdir[3]
`)}${e(6, `var vidas = 3
var pausa = 0         // quadros parados depois de perder uma vida
`)}${e(7, `var medo = 0          // quadros em que os fantasmas ficam com medo
`)}${e(8, `var fim = 0           // 1 = perdeu, 2 = venceu
`)}
${e(3, `// o pixel (px, py) está livre (sem parede)?
func livre(px, py)
  return solid(px, py) == 0
end

// dá para andar 1 tile na direção d a partir de (px, py)?
func pode(px, py, d)
  return livre(px + DX[d] * 8, py + DY[d] * 8)
end

`)}${e(5, `func coloca_fantasmas()
  for i = 0 to 2 do
    gx[i] = (OX + 12 + i) * 8
    gy[i] = (OY + 10) * 8
    gdir[i] = 3
  end
end

// escolhe a direção que aproxima o fantasma do alvo (sem dar meia-volta)
func escolhe(i, alvox, alvoy)
  var melhor = -1
  var menor = 30000
  for d = 0 to 3 do
    if d != (gdir[i] + 2) % 4 and pode(gx[i], gy[i], d) then
      var dist = abs(gx[i] + DX[d] * 8 - alvox) + abs(gy[i] + DY[d] * 8 - alvoy)
${e(7, `      if medo > 0 then dist = rnd(100) end
`)}      if dist < menor then
        menor = dist
        melhor = d
      end
    end
  end
  if melhor < 0 then melhor = (gdir[i] + 2) % 4 end
  gdir[i] = melhor
end

func move_fantasmas()
  for i = 0 to 2 do
    if gx[i] % 8 == 0 and gy[i] % 8 == 0 then
      // cada fantasma tem uma "personalidade"
      if i == 0 then escolhe(i, x, y) end
      if i == 1 then escolhe(i, x + DX[dir] * 32, y + DY[dir] * 32) end
      if i == 2 then escolhe(i, rnd(256), rnd(224)) end
    end
${etapa >= 7 ? `    if medo == 0 or frames() % 2 == 0 then
      gx[i] += DX[gdir[i]]
      gy[i] += DY[gdir[i]]
    end` : `    gx[i] += DX[gdir[i]]
    gy[i] += DY[gdir[i]]`}
  end
end

`)}${e(6, `func perde_vida()
  vidas -= 1
${e(9, `  sfx(morre)
`)}  pausa = 90
  x = INICIO_X
  y = INICIO_Y
  dir = 2
  quer = 2
  coloca_fantasmas()
${e(8, `  if vidas == 0 then fim = 1 end
`)}end

`)}func start()
${e(4, `  // conta as bolinhas do mapa (células 1 e 2 do tileset)
  for ty = OY to OY + 21 do
    for tx = OX to OX + 26 do
      var t = tile(tx, ty)
      if t == 1 or t == 2 then restam += 1 end
    end
  end
`)}${e(5, `  coloca_fantasmas()
`)}${e(10, `  music(tema)
`)}end

func update()
${e(8, `  if fim > 0 then
    if fim == 1 then text(11, 13, "FIM DE JOGO") else text(11, 13, "VOCE VENCEU!") end
    text(8, 15, "START = JOGAR DE NOVO")
    if btnp(START) then go(labirinto) end
    return
  end
`)}${e(6, `  if pausa > 0 then
    pausa -= 1
    return
  end
`)}${e(2, `  // --- controle: lembra a última direção pedida ---
  if btn(RIGHT) then quer = 0 end
  if btn(DOWN) then quer = 1 end
  if btn(LEFT) then quer = 2 end
  if btn(UP) then quer = 3 end
`)}${etapa === 2 ? `  x += (quer == 0) - (quer == 2)
  y += (quer == 1) - (quer == 3)
  dir = quer
` : ''}${e(3, `
  // --- movimento em grade: só vira quando está alinhado num tile ---
  if quer == (dir + 2) % 4 then dir = quer end
  if x % 8 == 0 and y % 8 == 0 then
${e(4, `    // come o que estiver no tile
    var tag = tiletag(x + 4, y + 4)
    if tag == 1 or tag == 2 then
      settile((x + 4) / 8, (y + 4) / 8, -1)
      restam -= 1
      pontos += 10
${e(9, `      if tag == 1 then sfx(bolinha) end
`)}${e(7, `      if tag == 2 then
        medo = 400
        pontos += 40
${e(9, `        sfx(poder)
`)}      end
`)}${e(8, `      if restam == 0 then fim = 2 end
`)}    end
`)}    if pode(x, y, quer) then dir = quer end
    if pode(x, y, dir) then
      x += DX[dir]
      y += DY[dir]
    end
  else
    x += DX[dir]
    y += DY[dir]
  end
`)}${e(5, `
  move_fantasmas()
`)}${e(7, `  if medo > 0 then medo -= 1 end
`)}${e(6, `
  // --- encostou num fantasma? ---
  for i = 0 to 2 do
    if overlap(x + 1, y + 1, 6, 6, gx[i] + 1, gy[i] + 1, 6, 6) then
${etapa >= 7 ? `      if medo > 0 then
        gx[i] = (OX + 13) * 8
        gy[i] = (OY + 10) * 8
        pontos += 200
${e(9, `        sfx(come)
`)}      else
        perde_vida()
        return
      end` : `      perde_vida()
      return`}
    end
  end
`)}
${e(1, `  // --- desenho ---
${etapa >= 3 ? `  var f = 0
  if (frames() / 4) % 2 == 1 then f = 1 end
  if dir == 0 then spr(0, heroi, x, y, f + 1) end
  if dir == 2 then spr(0, heroi, x, y, f + 1, FLIPX) end
  if dir == 1 then spr(0, heroi, x, y, f + 3) end
  if dir == 3 then spr(0, heroi, x, y, f + 3, FLIPY) end` : `  spr(0, heroi, x, y, 1)`}
`)}${e(5, `  for i = 0 to 2 do
${etapa >= 7 ? `    var cor = i
    if medo > 0 then
      cor = 3
      if medo < 100 and (frames() / 8) % 2 == 1 then cor = 4 end
    end
    spr(1 + i, fantasma, gx[i], gy[i], cor)` : `    spr(1 + i, fantasma, gx[i], gy[i], i)`}
  end
`)}${e(4, `  text(2, 1, "PONTOS")
  num(9, 1, pontos)
`)}${e(6, `  text(21, 1, "VIDAS")
  num(27, 1, vidas)
`)}end
`;
}

// Tema original (tipo "fliperama anos 80") para o tutorial / modelo pronto
export function temaLabirinto() {
  const mel = [7, 11, 9, 11, 7, 11, 9, 11, 8, 12, 10, 12, 8, 12, 10, 12, 9, 13, 11, 13, 9, 13, 11, 13, 10, 11, 12, 13, 14, -1, 14, -1];
  const notes = [];
  mel.forEach((p, c) => { if (p >= 0) notes.push({ c, p, i: 'estrela', a: 0 }); });
  [0, 1, 2, 3].forEach((m) => { notes.push({ c: m * 8, p: [0, 1, 2, 3][m], i: 'baixo', a: 0 }); notes.push({ c: m * 8 + 4, p: [4, 5, 6, 7][m], i: 'baixo', a: 0 }); });
  return { id: uid('mus'), name: 'tema', tempo: 360, length: 32, loop: true, notes };
}

export function createLabirinto(name, { tutorial = false } = {}) {
  const p = createEmptyProject(name);
  p.palettes.bg[1] = palette([null, '#4878ff', '#101c58', '#f8c8a0']);
  p.palettes.obj[0] = palette([null, '#f8e000']);
  p.palettes.obj[1] = palette([null, '#f83838', '#f8a0d8', '#40e8f8', '#2838d8', '#e8e8f8', '#f8f8f8', '#2030a0', '#f8a040']);
  const tiles = new Array(32).fill(null);
  tiles[1] = { art: DOT, tag: 1 };
  tiles[2] = { art: POWER, tag: 2 };
  for (let m = 0; m < 16; m++) tiles[16 + m] = { art: wallTile(m), solid: true };
  const ts = tileset('labirinto', 1, tiles);
  p.tilesets = [ts];
  const map = layer(ts.id);
  const isWall = (x, y) => MAZE[y]?.[x] === '#';
  MAZE.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') {
      const mask = (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
      map.set(OX + x, OY + y, 16 + mask);
    } else if (ch === '.') map.set(OX + x, OY + y, 1);
    else if (ch === 'o') map.set(OX + x, OY + y, 2);
  }));
  const sc = scene('labirinto', labirintoCode(tutorial ? 0 : 10), map, { bgcolor: '#000000' });
  p.scenes = [sc];
  p.startScene = sc.id;
  p.sprites = [
    sprite('heroi', 8, 0, HERO),
    sprite('fantasma', 8, 1, [ghost('1'), ghost('2'), ghost('3'), ghost('4').replace(/6/g, '5').replace(/7/g, '5'), ghost('5').replace(/5/g, '6').replace(/7/g, '1'), EYES]),
  ];
  const files = {};
  if (!tutorial) {
    p.songs = [temaLabirinto()];
    for (const [n, preset, tweak] of [['bolinha', 'blip', { freq: 520, dur: 0.05, decay: 0.04 }], ['poder', 'powerup', {}], ['come', 'moeda', { freq: 700 }], ['morre', 'dano', { dur: 0.8, decay: 0.7, slide: -0.8 }]]) {
      const s = sfx(n, preset, tweak);
      p.sounds.push(s.asset);
      files[s.file] = s.data;
    }
  }
  return { project: finalize(p), files };
}
