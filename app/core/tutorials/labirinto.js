import { labirintoCode, temaLabirinto } from '../templates/labirinto.js';
import { codeStep, soundStep, info, snes, pre } from './common.js';

const step = (n, title, body, must) => codeStep({ title, body, scene: 'labirinto', code: labirintoCode(n), must });

export const LABIRINTO_TUTORIAL = {
  id: 'labirinto',
  title: 'Labirinto come-bolinhas',
  icon: '👻',
  difficulty: 2,
  template: 'labirinto',
  projectName: 'Meu Labirinto',
  description: 'Um herói que come bolinhas fugindo de fantasmas — inspirado no fliperama de 1980. Com música feita por você!',
  teaches: ['movimento em grade', 'etiquetas de tiles', 'inteligência artificial', 'estados do jogo', 'compositor'],
  outro: 'Você criou um jogo de labirinto com inteligência artificial! Ideias: um quarto fantasma que foge quando você chega perto, frutas bônus, ou fases com labirintos diferentes (duplique a cena e redesenhe o mapa).',
  steps: [
    info('O labirinto 👻', `
<p>Este projeto já tem o labirinto desenhado. Repare nas <b>paredes</b>: cada pedaço escolhe um tile diferente dependendo de quais vizinhos também são parede — é o <b>autotile</b>, que deixa as bordas certinhas.</p>
<p>Abra o tileset <b>labirinto</b> em modo <b>Propriedades</b>: as paredes são <b>sólidas</b>, a bolinha tem a <b>etiqueta 1</b> e a bolinha de energia a <b>etiqueta 2</b>.</p>
${snes('o labirinto inteiro usa só 18 tiles diferentes de 8x8, mas ocupa quase a tela toda. Reaproveitar tiles era o segredo para caber tudo na VRAM de 64 KB.')}`, { open: { kind: 'tileset', name: 'labirinto', opts: { props: true } } }),

    step(1, 'O herói aparece', `
<p>Crie variáveis para a posição do herói e desenhe o sprite <code>heroi</code>. O quinto argumento de <code>spr</code> é o <b>quadro</b> (frame) do sprite — o quadro 1 é o herói de boca aberta.</p>
${pre('var x = INICIO_X\nvar y = INICIO_Y\n\nfunc update()\n  spr(0, heroi, x, y, 1)\nend')}`, ['spr(0, heroi, x, y']),

    step(2, 'Andando com as setas', `
<p>Guardamos a direção que o jogador <b>quer</b> numa variável (0 = direita, 1 = baixo, 2 = esquerda, 3 = cima). Por enquanto o herói atravessa as paredes — já vamos consertar.</p>
${pre('if btn(RIGHT) then quer = 0 end\nif btn(DOWN) then quer = 1 end\n...')}
<p>Truque: uma comparação vale 1 ou 0. Então <code>(quer == 0) - (quer == 2)</code> dá +1, -1 ou 0!</p>`, ['quer = 0', 'x += (quer == 0) - (quer == 2)']),

    step(3, 'Movimento em grade', `
<p>Em jogos de labirinto, o personagem só pode <b>virar</b> quando está exatamente em cima de um tile (x e y múltiplos de 8). Usamos duas tabelas para as direções:</p>
${pre('array DX = {1, 0, -1, 0}\narray DY = {0, 1, 0, -1}')}
<p>E a função <code>pode(px, py, d)</code> olha, com <code>solid()</code>, se o tile vizinho naquela direção é parede. A boca abre e fecha trocando de quadro, e <code>FLIPX</code>/<code>FLIPY</code> espelham o sprite para as outras direções.</p>
${snes('o SNES não gira sprites, mas consegue <b>espelhar</b> na horizontal e na vertical de graça. Por isso só desenhamos o herói olhando para a direita e para baixo.')}`, ['array DX', 'func pode', 'x % 8 == 0']),

    step(4, 'Comendo as bolinhas', `
<p>Quando o herói está alinhado, olhamos a <b>etiqueta</b> do tile embaixo dele com <code>tiletag()</code>. Se for bolinha, apagamos o tile com <code>settile(..., -1)</code> e somamos pontos.</p>
<p>No <code>start()</code>, contamos todas as bolinhas com <code>tile()</code> para saber quando o jogador venceu.</p>`, ['tiletag(x + 4, y + 4)', 'restam -= 1']),

    step(5, 'Os fantasmas', `
<p>Cada fantasma, ao chegar num cruzamento, testa as direções possíveis (sem dar meia-volta) e escolhe a que deixa ele <b>mais perto do alvo</b>. A distância usada é a "de táxi": <code>abs(dx) + abs(dy)</code>.</p>
<p>E cada um tem uma <b>personalidade</b>: o vermelho persegue você, o rosa mira 4 tiles na sua frente, e o azul-claro escolhe alvos aleatórios.</p>
${snes('usamos abs(dx)+abs(dy) em vez de dx²+dy² porque os números têm só 16 bits: 216² já passa de 32767 e daria resultado errado!')}`, ['func escolhe', 'move_fantasmas()']),

    step(6, 'Cuidado com os fantasmas!', `
<p>Se o herói encostar num fantasma, perde uma vida e todo mundo volta para o começo. Usamos um contador <code>pausa</code> para congelar o jogo por 90 quadros (1,5 segundo).</p>`, ['func perde_vida', 'overlap(x + 1, y + 1, 6, 6']),

    step(7, 'Bolinha de energia', `
<p>A bolinha grande (etiqueta 2) deixa os fantasmas com <b>medo</b> por 400 quadros: eles ficam azuis, mais lentos (andam só em quadros pares) e passam a andar ao acaso. Aí dá para comê-los!</p>
<p>No fim do medo eles piscam — trocamos o quadro do sprite a cada 8 quadros de tela.</p>`, ['medo = 400', 'if medo > 0 then']),

    step(8, 'Vitória e fim de jogo', '<p>Se as bolinhas acabarem, você venceu; se as vidas acabarem, fim de jogo. START recomeça.</p>', ['fim = 2', 'go(labirinto)']),

    soundStep({ title: 'Som: bolinha', name: 'bolinha', preset: 'blip', tweak: { freq: 520, dur: 0.05, decay: 0.04 }, body: '<p>Crie o som <b>bolinha</b> — bem curtinho, porque vai tocar muitas vezes.</p>' }),
    soundStep({ title: 'Som: energia', name: 'poder', preset: 'powerup', body: '<p>Crie o som <b>poder</b> para a bolinha de energia.</p>' }),
    soundStep({ title: 'Som: comer fantasma', name: 'come', preset: 'moeda', body: '<p>Crie o som <b>come</b>, para quando você pega um fantasma.</p>' }),
    soundStep({ title: 'Som: perder vida', name: 'morre', preset: 'dano', tweak: { dur: 0.8, decay: 0.7, slide: -0.8 }, body: '<p>E o som <b>morre</b>. Deixe ele mais longo e descendo de tom (controle "Deslize" negativo).</p>' }),
    step(9, 'Toque os sons', '<p>Agora coloque <code>sfx()</code> nos lugares certos.</p>', ['sfx(bolinha)', 'sfx(morre)']),

    {
      title: 'Componha a música! 🎵',
      body: `
<p>Clique no <b>+</b> ao lado de <b>MÚSICAS</b> e crie uma música chamada <b>tema</b>. Escolha um instrumento no topo (🍄 ⭐ 🔔 🎹 🐘 🐱 🥁 💥) e clique na pauta para carimbar notas, igual ao Mario Paint!</p>
<p>Coloque pelo menos <b>8 notas</b>. Dica: notas mais altas na pauta são mais agudas. Até 3 notas por coluna.</p>
${snes('o chip de som toca cada nota mudando a velocidade da mesma amostra: mais rápido = mais agudo. Cada instrumento vira uma amostra BRR de ~2 KB.')}`,
      task: 'Crie a música "tema" com pelo menos 8 notas.',
      highlight: '[data-add="Músicas"]',
      check: (hp) => (hp.song('tema')?.notes.length ?? 0) >= 8,
      apply: (hp, ctx) => {
        const exist = hp.song('tema');
        const t = temaLabirinto();
        ctx.store.change('music', (p) => {
          if (exist) exist.notes = t.notes;
          else (p.songs ??= []).push(t);
        });
      },
    },
    step(10, 'Música no jogo', '<p>Chame <code>music(tema)</code> no <code>start()</code>. Pronto: gere a ROM e jogue no emulador!</p>', ['music(tema)']),
  ],
};
