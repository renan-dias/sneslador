// Modelo "Blocos" — peças que caem, inspirado no clássico russo de 1984.
import { createEmptyProject, uid } from '../project.js';
import { palette, tileset, scene, layer, sfx, finalize } from './art.js';

// Peças no formato "posição inicial"; as rotações são calculadas girando dentro de uma caixa n x n.
const SHAPES = [
  { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] }, // I
  { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // O
  { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] }, // T
  { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // S
  { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // Z
  { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // J
  { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] }, // L
];

export function pieceTable() {
  const out = [];
  for (const s of SHAPES) {
    let cells = s.c;
    for (let r = 0; r < 4; r++) {
      const shift = s.n === 2 ? 1 : 0; // o quadrado fica no meio da caixa de 4
      for (const [x, y] of cells) out.push(x + shift, y);
      cells = cells.map(([x, y]) => [s.n - 1 - y, x]);
    }
  }
  return out;
}

const block = (c) => `
1111111${c}
1${c}${c}${c}${c}${c}${c}2
1${c}${c}${c}${c}${c}${c}2
1${c}${c}1${c}${c}${c}2
1${c}${c}${c}${c}${c}${c}2
1${c}${c}${c}${c}${c}${c}2
1${c}${c}${c}${c}${c}${c}2
${c}2222222`;

const WALL = `
aaaaaaab
abbbbbbb
abbbbbbb
bbbbbbbb
aaabaaaa
bbbbabbb
bbbbabbb
bbbbbbbb`;

const FUNDO = `
cccccccd
cccccccc
cccccccc
cccccccc
cccccccc
cccccccc
cccccccc
dccccccc`;

export function blocosCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  const table = pieceTable();
  const rows = [];
  for (let p = 0; p < 7; p++) rows.push('  ' + table.slice(p * 32, p * 32 + 32).join(','));
  return `// BLOCOS — peças que caem (inspirado num clássico russo de 1984)
${e(1, `const LARG = 10      // o tabuleiro tem 10 colunas
const ALT = 20       // e 20 linhas
const X0 = 11        // coluna da tela onde o tabuleiro começa
const Y0 = 3         // linha da tela onde o tabuleiro começa
`)}${e(2, `const VAZIO = 9      // tile do fundo do tabuleiro (célula 9 do tileset)

array tab[200]       // o tabuleiro: 0 = vazio, 1..7 = cor do bloco
`)}${e(3, `
// Cada peça tem 4 rotações; cada rotação tem 4 blocos; cada bloco tem (x, y).
// posição na tabela = peça * 32 + rotação * 8 + bloco * 2
array PECAS = {
${rows.join(',\n')}
}

var peca = 0         // peça atual (0 a 6)
var rot = 0          // rotação atual (0 a 3)
var px = 0           // posição da peça no tabuleiro
var py = 0
var prox = 0         // próxima peça
`)}${e(4, `var timer = 0
var veloc = 30       // quadros entre cada passo da queda
`)}${e(6, `var fim = 0
`)}${e(7, `var pontos = 0
var linhas = 0
`)}
${e(3, `func bloco_x(p, r, b)
  return PECAS[p * 32 + r * 8 + b * 2]
end

func bloco_y(p, r, b)
  return PECAS[p * 32 + r * 8 + b * 2 + 1]
end

// pinta os 4 blocos da peça atual com um tile (VAZIO apaga)
func desenha_peca(tile)
  for b = 0 to 3 do
    var cy = py + bloco_y(peca, rot, b)
    if cy >= 0 then settile(X0 + px + bloco_x(peca, rot, b), Y0 + cy, tile) end
  end
end

func nova_peca()
  peca = prox
  prox = rnd(7)
  rot = 0
  px = 3
  py = -1
${e(6, `  if cabe(peca, rot, px, py) == 0 then fim = 1 end
`)}${e(8, `  mostra_prox()
`)}end

`)}${e(4, `// a peça p, na rotação r, cabe na posição (x, y)?
func cabe(p, r, x, y)
  for b = 0 to 3 do
    var cx = x + bloco_x(p, r, b)
    var cy = y + bloco_y(p, r, b)
    if cx < 0 or cx >= LARG or cy >= ALT then return 0 end
    if cy >= 0 then
      if tab[cy * LARG + cx] != 0 then return 0 end
    end
  end
  return 1
end

`)}${e(2, `// copia o array tab para o mapa da tela
func redesenha()
  for y = 0 to ALT - 1 do
    for x = 0 to LARG - 1 do
      var c = tab[y * LARG + x]
      if c == 0 then settile(X0 + x, Y0 + y, VAZIO) else settile(X0 + x, Y0 + y, c) end
    end
  end
end

`)}${e(7, `func limpa_linhas()
  var feitas = 0
  var y = ALT - 1
  while y >= 0 do
    var cheia = 1
    for x = 0 to LARG - 1 do
      if tab[y * LARG + x] == 0 then cheia = 0 end
    end
    if cheia == 1 then
      // puxa tudo que está acima uma linha para baixo
      for yy = y to 1 step -1 do
        for x = 0 to LARG - 1 do
          tab[yy * LARG + x] = tab[(yy - 1) * LARG + x]
        end
      end
      for x = 0 to LARG - 1 do tab[x] = 0 end
      feitas += 1
    else
      y -= 1
    end
  end
  if feitas > 0 then
    linhas += feitas
    pontos += feitas * feitas * 10
    veloc = max(5, 30 - linhas)
${e(9, `    sfx(linha)
`)}    redesenha()
  end
end

`)}${e(6, `// grava a peça no tabuleiro quando ela não consegue mais cair
func fixa()
  for b = 0 to 3 do
    var cy = py + bloco_y(peca, rot, b)
    if cy < 0 then
      fim = 1
    else
      tab[cy * LARG + px + bloco_x(peca, rot, b)] = peca + 1
    end
  end
${e(9, `  sfx(encaixa)
`)}${e(7, `  limpa_linhas()
`)}  if fim == 0 then nova_peca() end
end

`)}${e(8, `func mostra_prox()
  for y = 0 to 3 do
    for x = 0 to 3 do settile(23 + x, 5 + y, -1) end
  end
  for b = 0 to 3 do
    settile(23 + bloco_x(prox, 0, b), 5 + bloco_y(prox, 0, b), prox + 1)
  end
end

`)}func start()
${etapa === 1 ? `  // coloca um bloco vermelho (célula 5 do tileset) no topo do tabuleiro
  settile(X0 + 4, Y0, 5)
` : ''}${e(8, `  text(2, 3, "BLOCOS")
  text(23, 3, "PROXIMA")
  text(23, 11, "PONTOS")
  text(23, 14, "LINHAS")
`)}${e(3, `  prox = rnd(7)
  nova_peca()
`)}${e(2, `  redesenha()
`)}${e(10, `  music(korobeiniki)
`)}end

func update()
${e(11, `  if fim == 1 then
    text(11, 12, " FIM DE JOGO ")
    text(10, 14, "START = DE NOVO")
    if btnp(START) then go(blocos) end
    return
  end
`)}${etapa >= 6 && etapa < 11 ? `  if fim == 1 then return end
` : ''}${e(4, `  desenha_peca(VAZIO)
`)}${e(5, `  if btnp(LEFT) and cabe(peca, rot, px - 1, py) then px -= 1 end
  if btnp(RIGHT) and cabe(peca, rot, px + 1, py) then px += 1 end
  if btnp(A) or btnp(UP) then
    var r = (rot + 1) % 4
    if cabe(peca, r, px, py) then
      rot = r
${e(9, `      sfx(gira)
`)}    end
  end
`)}${e(4, `  timer += 1
  var limite = veloc
${e(5, `  if btn(DOWN) then limite = 2 end
`)}  if timer >= limite then
    timer = 0
    if cabe(peca, rot, px, py + 1) then
      py += 1
${e(6, `    else
      desenha_peca(peca + 1)
      fixa()
`)}    end
  end
`)}${e(3, `${e(6, `  if fim == 0 then desenha_peca(peca + 1) end
`)}${etapa >= 3 && etapa < 6 ? `  desenha_peca(peca + 1)
` : ''}`)}${e(8, `  num(23, 12, pontos)
  num(23, 15, linhas)
`)}end
`;
}

// Korobeiniki (canção folclórica russa, domínio público) — colunas = colcheias
const MELODY = [
  9, -1, 6, 7, 8, -1, 7, 6, 5, -1, 5, 7, 9, -1, 8, 7, 6, -1, -1, 7, 8, -1, 9, -1, 7, -1, 5, -1, 5, -1, -1, -1,
  -1, 8, -1, 10, 12, -1, 11, 10, 9, -1, -1, 7, 9, -1, 8, 7, 6, -1, 6, 7, 8, -1, 9, -1, 7, -1, 5, -1, 5, -1, -1, -1,
];
const ROOTS = [2, 5, 2, 5, 1, 0, 2, 5];

export function korobeiniki() {
  const notes = [];
  MELODY.forEach((p, c) => { if (p >= 0) notes.push({ c, p, i: 'cogumelo', a: 0 }); });
  ROOTS.forEach((r, m) => {
    [r, r + 7, r, r + 7].forEach((p, k) => notes.push({ c: m * 8 + k * 2, p, i: 'baixo', a: 0 }));
    notes.push({ c: m * 8 + 2, p: 3, i: 'tambor', a: 0 });
    notes.push({ c: m * 8 + 6, p: 3, i: 'tambor', a: 0 });
  });
  // no máximo 3 notas por coluna
  const count = {};
  const kept = notes.filter((n) => (count[n.c] = (count[n.c] ?? 0) + 1) <= 3);
  return { id: uid('mus'), name: 'korobeiniki', tempo: 300, length: 64, loop: true, notes: kept };
}

export function createBlocos(name, { tutorial = false } = {}) {
  const p = createEmptyProject(name);
  p.palettes.bg[1] = palette([null, '#f8f8f8', '#181820', '#00d0f0', '#f8d800', '#a848f0', '#40d048', '#f03838', '#3868f8', '#f89020', '#a0a0b8', '#585870', '#10101c', '#20203a']);
  const tiles = [null];
  for (let k = 0; k < 7; k++) tiles.push({ art: block((k + 3).toString(16)) });
  tiles.push({ art: WALL, solid: true }); // 8
  tiles.push({ art: FUNDO }); // 9
  const ts = tileset('pecas', 1, tiles);
  p.tilesets = [ts];
  const map = layer(ts.id);
  for (let y = 3; y <= 23; y++) { map.set(10, y, 8); map.set(21, y, 8); }
  for (let x = 10; x <= 21; x++) map.set(x, 23, 8);
  map.fill(11, 3, 20, 22, 9);
  const sc = scene('blocos', blocosCode(tutorial ? 0 : 11), map, { bgcolor: '#28204a' });
  p.scenes = [sc];
  p.startScene = sc.id;
  p.songs = [korobeiniki()];
  const files = {};
  if (!tutorial) {
    for (const [n, preset, tweak] of [['gira', 'blip', { freq: 880 }], ['encaixa', 'dano', { dur: 0.12, decay: 0.1 }], ['linha', 'powerup', { dur: 0.35 }]]) {
      const s = sfx(n, preset, tweak);
      p.sounds.push(s.asset);
      files[s.file] = s.data;
    }
  }
  return { project: finalize(p), files };
}
