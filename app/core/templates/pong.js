// Modelo "Pong" — tênis de mesa, o primeiro grande sucesso dos videogames (1972).
import { createEmptyProject } from '../project.js';
import { palette, tileset, sprite, scene, layer, sfx, finalize } from './art.js';

const RAQUETE = `
12222231
12222231
12222231
12222231
12222231
12222231
12222231
12222231`;

const BOLA = `
..4444..
.455554.
45511554
45515554
45555554
45555554
.455554.
..4444..`;

const PAREDE = `
33333333
13131313
31313131
11111111
11111111
31313131
13131313
33333333`;

const REDE = `
...11...
...11...
...11...
...11...
........
........
........
........`;

/**
 * Código do Pong montado em etapas (o tutorial vai liberando cada parte).
 * etapa: 0 = esqueleto ... 11 = jogo completo
 */
export function pongCode(etapa) {
  const e = (n, s) => (etapa >= n ? s : '');
  return `// PONG — o primeiro videogame de sucesso (Atari, 1972)
${e(3, `const TOPO = 16      // primeira linha abaixo da parede de cima
const CHAO = 208     // primeira linha da parede de baixo
`)}${e(5, `const ALTURA = 32    // raquete = 4 sprites de 8x8 empilhados
const VEL = 3
`)}
${e(2, `var bx = 124         // posição da bola (x, y)
var by = 108
var vx = 2           // velocidade da bola
var vy = 1
`)}${e(5, `var p1y = 96         // raquete do jogador
`)}${e(7, `var p2y = 96         // raquete do computador
`)}${e(8, `var pontos1 = 0
var pontos2 = 0
var espera = 60      // quadros até a bola sair
`)}${e(10, `var vencedor = 0
`)}
${e(5, `// desenha a raquete com 4 sprites (um "metasprite")
func desenha_raquete(slot, x, y)
  for i = 0 to 3 do
    spr(slot + i, raquete, x, y + i * 8)
  end
end

`)}${e(8, `// coloca a bola no meio e joga para um dos lados
func saque(direcao)
  bx = 124
  by = 108
  vx = direcao * 2
  vy = rnd(3) - 1
  if vy == 0 then vy = 1 end
  espera = 60
end

`)}func start()
${e(8, `  saque(1)
`)}end

func update()
${e(10, `  if vencedor > 0 then
    if vencedor == 1 then text(10, 13, "VOCE VENCEU!") else text(9, 13, "O SNES VENCEU!") end
    text(7, 15, "START = JOGAR DE NOVO")
    if btnp(START) then go(jogo) end
    return
  end

`)}${e(5, `  // --- jogador (esquerda) ---
  if btn(UP) and p1y > TOPO then p1y -= VEL end
  if btn(DOWN) and p1y < CHAO - ALTURA then p1y += VEL end

`)}${e(7, `  // --- computador (direita): segue a bola, mas é um pouco mais lento ---
  if by > p2y + 20 and p2y < CHAO - ALTURA then p2y += 2 end
  if by < p2y + 4 and p2y > TOPO then p2y -= 2 end

`)}${e(2, `  // --- bola ---
${etapa >= 8 ? `  if espera > 0 then
    espera -= 1
  else
    bx += vx
    by += vy
  end` : `  bx += vx
  by += vy`}
`)}${e(3, `  if by < TOPO then
    by = TOPO
    vy = -vy
${e(9, `    sfx(quique)
`)}  end
  if by > CHAO - 8 then
    by = CHAO - 8
    vy = -vy
${e(9, `    sfx(quique)
`)}  end
`)}${etapa >= 3 && etapa < 8 ? `  // saiu pela lateral? volta para o meio
  if bx < 0 or bx > 248 then
    bx = 124
    by = 108
    vx = -vx
  end
` : ''}${e(6, `
  // --- rebate nas raquetes (colisão de retângulos) ---
  if vx < 0 and overlap(bx, by, 8, 8, 16, p1y, 8, ALTURA) then
    vx = -vx
    if vx < 4 then vx += 1 end
    vy = (by - p1y - 12) / 5
${e(9, `    sfx(quique)
`)}  end
`)}${e(7, `  if vx > 0 and overlap(bx, by, 8, 8, 232, p2y, 8, ALTURA) then
    vx = -vx
    if vx > -4 then vx -= 1 end
    vy = (by - p2y - 12) / 5
${e(9, `    sfx(quique)
`)}  end
`)}${e(8, `
  // --- pontos ---
  if bx < 0 then
    pontos2 += 1
${e(9, `    sfx(ponto)
`)}    saque(1)
  end
  if bx > 248 then
    pontos1 += 1
${e(9, `    sfx(ponto)
`)}    saque(-1)
  end
`)}${e(10, `  if pontos1 == 5 then vencedor = 1 end
  if pontos2 == 5 then vencedor = 2 end
`)}
${e(1, `  // --- desenho ---
`)}${e(5, `  desenha_raquete(0, 16, p1y)
`)}${e(7, `  desenha_raquete(4, 232, p2y)
`)}${etapa >= 2 ? `  spr(8, bola, bx, by)
` : etapa >= 1 ? `  spr(8, bola, 124, 108)
` : ''}${e(8, `  num(12, 0, pontos1)
  num(19, 0, pontos2)
`)}end
`;
}

export function createPong(name, { tutorial = false } = {}) {
  const p = createEmptyProject(name);
  p.palettes.obj[0] = palette([null, '#f8f8f8', '#c8c8d8', '#585878', '#f8a800', '#f8e060']);
  p.palettes.bg[1] = palette([null, '#6878c8', '#303868', '#28305a']);
  const ts = tileset('quadra', 1, [null, { art: PAREDE, solid: true }, { art: REDE }]);
  p.tilesets = [ts];
  const map = layer(ts.id);
  for (let x = 0; x < 32; x++) { map.set(x, 1, 1); map.set(x, 26, 1); }
  for (let y = 2; y < 26; y++) map.set(15, y, 2);
  const jogo = scene('jogo', pongCode(tutorial ? 0 : 11), map, { bgcolor: '#101830' });
  p.scenes = [jogo];
  p.startScene = jogo.id;
  p.sprites = [sprite('raquete', 8, 0, [RAQUETE]), sprite('bola', 8, 0, [BOLA])];
  const files = {};
  if (!tutorial) {
    for (const [n, preset] of [['quique', 'blip'], ['ponto', 'moeda']]) {
      const s = sfx(n, preset);
      p.sounds.push(s.asset);
      files[s.file] = s.data;
    }
  }
  p.globalScript = '// Script global: variáveis e funções que todas as cenas enxergam.\n';
  return { project: finalize(p), files };
}
