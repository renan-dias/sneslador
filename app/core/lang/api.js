// Funções embutidas da linguagem SNS. A mesma tabela alimenta:
//  - o compilador (checagem de argumentos),
//  - o runtime JS do live view e o runtime C da ROM (mesmos nomes, prefixo sl_),
//  - a ajuda / autocompletar do editor.

export const BUILTINS = {
  // Controle
  btn: { args: ['botao'], ret: true, group: 'Controle', doc: 'Retorna 1 enquanto o botão está pressionado. Ex: if btn(RIGHT) then x += 1 end' },
  btnp: { args: ['botao'], ret: true, group: 'Controle', doc: 'Retorna 1 só no quadro em que o botão foi apertado (bom para pulo e menus).' },

  // Sprites (OAM)
  spr: { args: ['slot', 'sprite', 'x', 'y', 'frame?', 'flags?'], ret: false, group: 'Sprites', doc: 'Mostra um sprite no slot da OAM (0 a 127) na posição x,y. frame escolhe o quadro, flags: FLIPX, FLIPY.' },
  hide: { args: ['slot'], ret: false, group: 'Sprites', doc: 'Esconde o sprite daquele slot da OAM.' },
  anim: { args: ['animacao'], ret: true, group: 'Sprites', doc: 'Retorna o quadro atual de uma animação usando o relógio global. Ex: spr(0, heroi, x, y, anim(heroi_corre))' },
  animt: { args: ['animacao', 'tempo'], ret: true, group: 'Sprites', doc: 'Igual anim(), mas usando o seu próprio contador de tempo (em quadros).' },

  // Cenário (BG1)
  scroll: { args: ['x', 'y'], ret: false, group: 'Cenário', doc: 'Rola a camada do mapa (BG1). Os sprites NÃO rolam juntos: subtraia a câmera da posição deles.' },
  tile: { args: ['tx', 'ty'], ret: true, group: 'Cenário', doc: 'Retorna o número do tile (célula do tileset) na coluna tx, linha ty do mapa. -1 se vazio.' },
  settile: { args: ['tx', 'ty', 'tile'], ret: false, group: 'Cenário', doc: 'Troca o tile do mapa na coluna tx, linha ty. Use -1 para apagar.' },
  solid: { args: ['px', 'py'], ret: true, group: 'Cenário', doc: 'Retorna 1 se o pixel (px,py) do mapa está em um tile marcado como sólido.' },
  tiletag: { args: ['px', 'py'], ret: true, group: 'Cenário', doc: 'Retorna a etiqueta (0 a 15) do tile no pixel (px,py). Útil para moedas, espinhos, portas...' },

  // Texto (BG3)
  text: { args: ['x', 'y', 'texto'], ret: false, group: 'Texto', doc: 'Escreve um texto na camada de texto (BG3). x vai de 0 a 31 e y de 0 a 27 (em tiles de 8x8).' },
  num: { args: ['x', 'y', 'valor'], ret: false, group: 'Texto', doc: 'Escreve um número na camada de texto.' },
  cls: { args: [], ret: false, group: 'Texto', doc: 'Limpa toda a camada de texto.' },

  // Cenas e tela
  go: { args: ['cena'], ret: false, group: 'Cenas', doc: 'Troca de cena ao final deste quadro (com fade). Ex: go(menu)' },
  brightness: { args: ['nivel'], ret: false, group: 'Cenas', doc: 'Brilho da tela de 0 (preto) a 15 (máximo). Registrador INIDISP do SNES.' },
  bgcolor: { args: ['r', 'g', 'b'], ret: false, group: 'Cenas', doc: 'Muda a cor de fundo (backdrop). Cada canal vai de 0 a 31, pois o SNES usa 15 bits de cor.' },

  // Som
  sfx: { args: ['som'], ret: false, group: 'Som', doc: 'Toca um efeito sonoro (amostra BRR no chip de som SPC700).' },
  music: { args: ['musica'], ret: false, group: 'Som', doc: 'Começa a tocar uma música do compositor (em loop). Se ela já estiver tocando, continua.' },
  stopmusic: { args: [], ret: false, group: 'Som', doc: 'Para a música.' },

  // Matemática
  rnd: { args: ['n'], ret: true, group: 'Matemática', doc: 'Número aleatório de 0 até n-1.' },
  abs: { args: ['v'], ret: true, group: 'Matemática', doc: 'Valor absoluto.' },
  min: { args: ['a', 'b'], ret: true, group: 'Matemática', doc: 'Menor entre dois valores.' },
  max: { args: ['a', 'b'], ret: true, group: 'Matemática', doc: 'Maior entre dois valores.' },
  overlap: { args: ['x1', 'y1', 'w1', 'h1', 'x2', 'y2', 'w2', 'h2'], ret: true, group: 'Matemática', doc: 'Retorna 1 se dois retângulos se encostam (colisão AABB).' },
  frames: { args: [], ret: true, group: 'Matemática', doc: 'Contador de quadros desde que a cena começou (60 por segundo).' },
};

export const BUILTIN_CONSTS = {
  UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, A: 4, B: 5, X: 6, Y: 7, L: 8, R: 9, START: 10, SELECT: 11,
  FLIPX: 1, FLIPY: 2,
  SCREEN_W: 256, SCREEN_H: 224,
};

export const BUTTON_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'];

export function arity(name) {
  const a = BUILTINS[name].args;
  return { min: a.filter((x) => !x.endsWith('?')).length, max: a.length };
}
