// Modelo "Plataforma" — o robô Bit corre, pula, pega moedas e pisa em caracóis.
// Inspirado nos jogos de plataforma clássicos (como Super Mario Bros.), com arte e personagens originais.
import { createEmptyProject, uid } from '../project.js';
import { palette, tileset, sprite, scene, layer, sfx, finalize } from './art.js';

// ---------------------------------------------------------------- tiles da fase (paleta BG 1)
const T = {
  grama: `
22322232
22222222
32222322
33333333
44444444
44544445
45444444
44444544`,
  terra: `
44444444
44544445
45444444
44444544
44454444
54444454
44444444
44544444`,
  tijolo: `
66666667
66666667
66666667
77777777
66676666
66676666
66676666
77777777`,
  surpresa: `
99999999
98888889
98811889
98888189
98881889
98888889
98881889
99999999`,
  usado: `
11111111
1dddddd1
1d1dd1d1
1dddddd1
1dddddd1
1d1dd1d1
1dddddd1
11111111`,
  moeda: `
...bb...
..bccb..
.bcbbcb.
.bcbbcb.
.bcbbcb.
.bcbbcb.
..bccb..
...bb...`,
  ponte: `
55555555
44444444
44544454
55555555
........
........
........
........`,
  mastro: `
...ff...
...ff...
...ff...
...ff...
...ff...
...ff...
...ff...
...ff...`,
  topo: `
...aa...
..aaaa..
..aaaa..
...aa...
...ff...
...ff...
...ff...
...ff...`,
  bandeira: `
...ffeee
...ffeee
...ffeee
...ffee.
...ffe..
...ff...
...ff...
...ff...`,
  arbusto: `
........
...33...
..3223..
.322223.
32222223
32222223
22222222
22222222`,
};

// ---------------------------------------------------------------- tiles do fundo (paleta BG 2)
const F = {
  morro: `
11111111
11121111
11111111
11111121
11111111
12111111
11111111
11111111`,
  morroE: `
.......1
......11
.....111
....1111
...11111
..111211
.1111111
11111111`,
  morroD: `
1.......
11......
111.....
1111....
11111...
112111..
1111111.
11111111`,
  nuvem: `
33333333
33333333
33333333
33333333
33333333
44444444
44444444
........`,
  nuvemE: `
....3333
..333333
.3333333
33333333
33333333
.4444444
..444444
........`,
  nuvemD: `
3333....
333333..
3333333.
33333333
33333333
4444444.
444444..
........`,
};

// ---------------------------------------------------------------- sprites
const BIT = (legs, arms = 'normal') => {
  const body = [
    '.......55.......',
    '........1.......',
    '....11111111....',
    '...1222222221...',
    '...1244444421...',
    '...1246644421...',
    '...1244444421...',
    '...1222222221...',
    '....11111111....',
    arms === 'up' ? '.11.1333333.11..' : '...1333333331...',
    arms === 'up' ? '...1333333331...' : '..121333333121..',
    arms === 'up' ? '...1333333331...' : '..121333333121..',
    '...1333333331...',
    '....11111111....',
  ];
  return [...body, ...legs].join('\n');
};
const PARADO = ['....121..121....', '...1111..1111...'];
const ANDA1 = ['...121....121...', '..1111....1111..'];
const ANDA2 = ['.....121.121....', '....1111111.....'];
const PULO = ['...121....121...', '...11......11...'];

const CARACOL1 = `
................
................
................
.......1111.....
.....11222211...
....1223333221..
...122322223221.
...123223322321.
...123232232321.
...122322223221.
.1..1222332221..
151..11222211...
1441111111111...
14444444444441..
.144444444444441
..1111111111111.`;
const CARACOL2 = `
................
................
................
.......1111.....
.....11222211...
....1223333221..
...122322223221.
...123223322321.
...123232232321.
...122322223221.
....1222332221..
.1...11222211...
151111111111....
14444444444441..
.14444444444441.
..111111111111..`;

// ---------------------------------------------------------------- mapa da fase (64 x 32 tiles)
const G_ROW = 24; // linha da grama

function buildLevel(tsId) {
  const m = layer(tsId, 64, 32);
  const holes = new Set([20, 21, 41, 42, 43]);
  for (let x = 0; x < 64; x++) {
    if (holes.has(x)) continue;
    m.set(x, G_ROW, 1);
    for (let y = G_ROW + 1; y < 28; y++) m.set(x, y, 2);
  }
  // decoração
  for (const x of [3, 17, 33, 47, 55]) { m.set(x, G_ROW - 1, 11); m.set(x + 1, G_ROW - 1, 11); }
  // blocos no ar
  const row = (x0, y, cells) => [...cells].forEach((c, i) => { if (c !== ' ') m.set(x0 + i, y, { t: 3, '?': 4, u: 5, m: 6, p: 7 }[c]); });
  row(8, 19, 't?t?t');
  row(10, 15, 'm m');
  row(10, 16, ' ? ');
  row(22, 18, 'pppp');
  row(23, 16, 'mm');
  row(28, 19, '?');
  row(31, 20, 'tt');
  row(31, 19, 'tt');
  row(33, 19, 'tttt');
  row(33, 18, 'mmmm');
  row(38, 17, 'ppp');
  row(44, 19, 'tt?tt');
  row(44, 15, 'mmmmm');
  // escada no fim
  for (let s = 0; s < 5; s++) for (let h = 0; h <= s; h++) m.set(50 + s, G_ROW - 1 - h, 3);
  // bandeira
  m.set(60, G_ROW - 9, 9);
  for (let y = G_ROW - 8; y < G_ROW; y++) m.set(60, y, 8);
  m.set(60, G_ROW - 8, 10);
  m.set(60, G_ROW - 7, 10);
  // moedas soltas
  for (const [x, y] of [[14, 21], [15, 21], [16, 21], [26, 20], [27, 20], [46, 21], [47, 21], [56, 17], [57, 17]]) m.set(x, y, 6);
  return m;
}

function buildBackground(tsId) {
  const m = layer(tsId, 32, 32);
  const hill = (cx, h) => {
    for (let r = 0; r < h; r++) {
      const y = G_ROW - h + r;
      m.set(cx - r - 1, y, 2);
      for (let x = cx - r; x <= cx + r; x++) m.set(x, y, 1);
      m.set(cx + r + 1, y, 3);
    }
  };
  hill(5, 5);
  hill(20, 7);
  hill(28, 3);
  const cloud = (x, y, w) => { m.set(x, y, 5); for (let i = 1; i <= w; i++) m.set(x + i, y, 4); m.set(x + w + 1, y, 6); };
  cloud(2, 5, 3);
  cloud(13, 3, 4);
  cloud(24, 7, 2);
  return m;
}

// ---------------------------------------------------------------- código
export const GLOBAL_CODE = `// Script global: estas variáveis existem em TODAS as cenas.
// Assim as vidas e as moedas continuam quando trocamos de cena.
var vidas = 3
var moedas = 0
`;

export const TITULO_CODE = `// Tela de título
func start()
  text(7, 5, "A AVENTURA DE BIT")
  text(9, 19, "SETAS = ANDAR")
  text(5, 20, "B = PULAR   Y = CORRER")
  vidas = 3
  moedas = 0
end

func update()
  // texto piscando: aparece metade do tempo
  if (frames() / 30) % 2 == 0 then
    text(10, 12, "APERTE START")
  else
    text(10, 12, "            ")
  end
  spr(0, heroi, 120, 176, anim(heroi_anda))
  if btnp(START) then go(fase1) end
end
`;

export const VITORIA_CODE = `// Tela de vitória
func start()
  text(8, 9, "VOCE CONSEGUIU!")
  text(9, 12, "MOEDAS:")
  num(17, 12, moedas)
  text(4, 17, "START = VOLTAR AO INICIO")
end

func update()
  spr(0, heroi, 120, 176, 3)
  if btnp(START) then go(titulo) end
end
`;

export function faseCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  return `// FASE 1 — corra, pule e chegue na bandeira!
${e(2, `// Posições em "subpixels": 16 subpixels = 1 pixel. Assim dá para andar 1,5 pixel por quadro
// usando só números inteiros, como os jogos de SNES faziam.
const ACEL = 2          // aceleração
const VMAX = 28         // velocidade máxima andando (28/16 = 1,75 pixel por quadro)
`)}${e(3, `const G = 3             // gravidade
`)}${e(4, `const PULO = -72        // força do pulo (negativo = para cima)
const VCORRE = 44       // velocidade segurando Y
`)}${e(6, `const FIM_MAPA = 512    // largura da fase em pixels (64 tiles)
`)}
${e(2, `var x = 32 * 16
var y = 176 * 16
var vx = 0
`)}${e(3, `var vy = 0
var chao = 0            // 1 quando está pisando em algo
`)}${e(5, `var olha = 0            // 0 = direita, FLIPX = esquerda
`)}${e(6, `var cam = 0             // câmera (scroll)
`)}${e(8, `
// caracóis: posição, direção e se estão vivos
array ex = {112, 224, 296, 400}
array ey = {176, 176, 176, 176}
array edir = {-1, -1, 1, -1}
array eviva = {1, 1, 1, 1}
`)}${e(9, `var morto = 0
`)}
${e(3, `// o retângulo do herói (em pixels) encosta em algum tile sólido?
func bate(px, py)
  return solid(px + 3, py + 1) or solid(px + 12, py + 1) or solid(px + 3, py + 8) or solid(px + 12, py + 8) or solid(px + 3, py + 15) or solid(px + 12, py + 15)
end

func move_y()
  vy += G
  if vy > 64 then vy = 64 end
  var ny = y + vy
  chao = 0
  if bate(x / 16, ny / 16) then
    // chega pixel a pixel até encostar
    var p = y / 16
    var passo = 1
    if vy < 0 then passo = -1 end
    while bate(x / 16, p + passo) == 0 do
      p += passo
    end
    if vy > 0 then chao = 1 end
${e(7, `    if vy < 0 then cabecada(x / 16 + 8, p) end
`)}    y = p * 16
    vy = 0
  else
    y = ny
  end
end

`)}${e(4, `func move_x()
  var nx = x + vx
  if bate(nx / 16, y / 16) then
    var p = x / 16
    var passo = 1
    if vx < 0 then passo = -1 end
    while bate(p + passo, y / 16) == 0 do
      p += passo
    end
    x = p * 16
    vx = 0
  else
    x = nx
  end
  if x < 0 then x = 0 end
${e(6, `  if x > (FIM_MAPA - 16) * 16 then x = (FIM_MAPA - 16) * 16 end
`)}end

`)}${e(7, `// bateu a cabeça num bloco-surpresa?
func cabecada(px, py)
  if tiletag(px, py) == 4 then
    settile(px / 8, py / 8, 5)
    moedas += 1
${e(11, `    sfx(moeda)
`)}  end
end

`)}${e(9, `func morre()
  morto = 1
  vy = -60
${e(11, `  sfx(dano)
`)}end

`)}${e(8, `func move_inimigos()
  for i = 0 to 3 do
    if eviva[i] == 1 then
      // anda 1 pixel a cada 2 quadros e vira na parede ou na beira do buraco
      if frames() % 2 == 0 then
        var frente = ex[i] + 8 + edir[i] * 9
        if solid(frente, ey[i] + 8) or solid(frente, ey[i] + 17) == 0 then
          edir[i] = -edir[i]
        else
          ex[i] += edir[i]
        end
      end
      var sx = ex[i] - cam
      if sx > -16 and sx < 256 then
        var fl = 0
        if edir[i] > 0 then fl = FLIPX end
        spr(1 + i, caracol, sx, ey[i], anim(caracol_anda), fl)
      else
        hide(1 + i)
      end
      if ${etapa >= 9 ? 'morto == 0 and ' : ''}overlap(x / 16 + 3, y / 16 + 2, 10, 14, ex[i] + 2, ey[i] + 6, 12, 10) then
        if vy > 0 and y / 16 + 12 < ey[i] + 8 then
          // pisou em cima!
          eviva[i] = 0
          hide(1 + i)
          vy = -48
${e(11, `          sfx(pisa)
`)}${etapa >= 9 ? `        else
          morre()
` : ''}        end
      end
    end
  end
end

`)}func start()
${e(12, `  music(aventura)
`)}end

func update()
${e(9, `  if morto == 1 then
    // animação de derrota: sobe e cai para fora da tela
    vy += G
    y += vy
    spr(0, heroi, x / 16 - cam, y / 16, 3, olha)
    if y > 250 * 16 then
      vidas -= 1
      if vidas <= 0 then go(titulo) else go(fase1) end
    end
    return
  end

`)}${e(2, `  // --- andar: acelera, e freia quando solta o botão (atrito) ---
${e(4, `  var vm = VMAX
  if btn(Y) then vm = VCORRE end
`)}  if btn(RIGHT) then
    vx = min(vx + ACEL, ${etapa >= 4 ? 'vm' : 'VMAX'})
${e(5, `    olha = 0
`)}  elseif btn(LEFT) then
    vx = max(vx - ACEL, -${etapa >= 4 ? 'vm' : 'VMAX'})
${e(5, `    olha = FLIPX
`)}  else
    if vx > 0 then vx = max(0, vx - ACEL) end
    if vx < 0 then vx = min(0, vx + ACEL) end
  end
`)}${e(4, `
  // --- pulo: só se estiver no chão. Soltar o B cedo = pulo mais baixo ---
  if chao and btnp(B) then
    vy = PULO
${e(11, `    sfx(pulo)
`)}  end
  if vy < -20 and btn(B) == 0 then vy = -20 end
  move_x()
`)}${etapa >= 2 && etapa < 4 ? `  x += vx
` : ''}${e(3, `  move_y()
`)}${e(9, `  if y > 232 * 16 then morre() end
`)}${e(7, `
  // --- moedas (etiqueta 1) ---
  var tag = tiletag(x / 16 + 8, y / 16 + 8)
  if tag == 1 then
    settile((x / 16 + 8) / 8, (y / 16 + 8) / 8, -1)
    moedas += 1
${e(11, `    sfx(moeda)
`)}  end
`)}${e(10, `  // --- bandeira (etiqueta 3) = fim da fase ---
  if tag == 3 then go(vitoria) end
`)}${e(6, `
  // --- câmera: segue o herói, sem passar das bordas da fase ---
  cam = x / 16 - 120
  if cam < 0 then cam = 0 end
  if cam > FIM_MAPA - 256 then cam = FIM_MAPA - 256 end
  scroll(cam, 0)
`)}${e(8, `
  move_inimigos()
`)}
${etapa >= 5 ? `  // --- desenho do herói ---
  var f = 0
  if chao == 0 then
    f = 3
  elseif vx != 0 then
    f = anim(heroi_anda)
  end
  spr(0, heroi, x / 16${etapa >= 6 ? ' - cam' : ''}, y / 16, f, olha)
` : etapa >= 2 ? `  spr(0, heroi, x / 16, y / 16)
` : etapa >= 1 ? `  spr(0, heroi, 32, 176)
` : ''}${e(7, `
  text(1, 1, "MOEDAS")
  num(8, 1, moedas)
`)}${e(9, `  text(22, 1, "VIDAS")
  num(28, 1, vidas)
`)}end
`;
}

export function musicaAventura() {
  // melodia original, alegre, em Dó maior
  const mel = [7, 9, 11, 9, 7, 9, 11, 14, 10, 12, 11, 9, 8, 10, 9, 7, 8, 9, 10, 11, 12, 11, 10, 8, 7, -1, 11, -1, 7, -1, -1, -1];
  const bass = [0, 0, 3, 3, 1, 1, 4, 0];
  const notes = [];
  mel.forEach((p, c) => { if (p >= 0) notes.push({ c, p, i: 'cogumelo', a: 0 }); });
  bass.forEach((p, k) => notes.push({ c: k * 4, p, i: 'baixo', a: 0 }));
  for (let c = 2; c < 32; c += 4) notes.push({ c, p: 3, i: 'tambor', a: 0 });
  return { id: uid('mus'), name: 'aventura', tempo: 240, length: 32, loop: true, notes };
}

export function createPlataforma(name, { tutorial = false } = {}) {
  const p = createEmptyProject(name);
  p.spriteSize = '8_16';
  p.palettes.bg[1] = palette([null, '#202028', '#58d858', '#289838', '#c07830', '#885018', '#d85838', '#f0c8a0', '#f8c800', '#b86800', '#f8f8f8', '#f8d830', '#c89000', '#a07048', '#38b048', '#c8c8d0']);
  p.palettes.bg[2] = palette([null, '#78c878', '#58a858', '#f8f8f8', '#c8e0f8']);
  p.palettes.obj[0] = palette([null, '#202030', '#d0d8e8', '#7888b8', '#38d8f8', '#f83838', '#f8f8f8']);
  p.palettes.obj[1] = palette([null, '#302018', '#f89838', '#b85818', '#88d048', '#f8f8f8']);

  const tiles = [null, { art: T.grama, solid: true }, { art: T.terra, solid: true }, { art: T.tijolo, solid: true },
    { art: T.surpresa, solid: true, tag: 4 }, { art: T.usado, solid: true }, { art: T.moeda, tag: 1 }, { art: T.ponte, solid: true },
    { art: T.mastro, tag: 3 }, { art: T.topo, tag: 3 }, { art: T.bandeira, tag: 3 }, { art: T.arbusto }];
  const ts = tileset('fase', 1, tiles);
  const bgts = tileset('fundo', 2, [null, { art: F.morro }, { art: F.morroE }, { art: F.morroD }, { art: F.nuvem }, { art: F.nuvemE }, { art: F.nuvemD }]);
  p.tilesets = [ts, bgts];

  const bg2 = buildBackground(bgts.id);
  bg2.parallax = 3;
  const fase = scene('fase1', faseCode(tutorial ? 0 : 12), buildLevel(ts.id), { bgcolor: '#6898f8', bg2 });

  const tmap = layer(ts.id);
  for (let x = 0; x < 32; x++) { tmap.set(x, G_ROW, 1); for (let y = G_ROW + 1; y < 28; y++) tmap.set(x, y, 2); }
  for (const x of [4, 22]) { tmap.set(x, G_ROW - 1, 11); tmap.set(x + 1, G_ROW - 1, 11); }
  const bg2t = buildBackground(bgts.id);
  bg2t.parallax = 3;
  const titulo = scene('titulo', TITULO_CODE, tmap, { bgcolor: '#6898f8', bg2: bg2t });

  const vmap = layer(ts.id);
  for (let x = 0; x < 32; x++) { vmap.set(x, G_ROW, 1); for (let y = G_ROW + 1; y < 28; y++) vmap.set(x, y, 2); }
  for (let x = 6; x < 26; x += 3) vmap.set(x, 6, 6);
  const vitoria = scene('vitoria', VITORIA_CODE, vmap, { bgcolor: '#f8a848' });

  p.scenes = [titulo, fase, vitoria];
  p.startScene = titulo.id;
  p.globalScript = GLOBAL_CODE;
  p.sprites = [
    sprite('heroi', 16, 0, [BIT(PARADO), BIT(ANDA1), BIT(ANDA2), BIT(PULO, 'up')], [{ name: 'anda', frames: [1, 0, 2, 0], speed: 6, loop: true }]),
    sprite('caracol', 16, 1, [CARACOL1, CARACOL2], [{ name: 'anda', frames: [0, 1], speed: 16, loop: true }]),
  ];
  p.songs = [musicaAventura()];
  const files = {};
  if (!tutorial) {
    for (const [n, preset, tweak] of [['pulo', 'pulo', {}], ['moeda', 'moeda', {}], ['pisa', 'blip', { freq: 330, slide: -1, dur: 0.12 }], ['dano', 'dano', { dur: 0.7, decay: 0.6 }]]) {
      const s = sfx(n, preset, tweak);
      p.sounds.push(s.asset);
      files[s.file] = s.data;
    }
  }
  return { project: finalize(p), files };
}
