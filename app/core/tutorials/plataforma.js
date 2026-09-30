import { faseCode } from '../templates/plataforma.js';
import { codeStep, soundStep, info, snes, pre } from './common.js';

const step = (n, title, body, must) => codeStep({ title, body, scene: 'fase1', code: faseCode(n), must });

export const PLATAFORMA_TUTORIAL = {
  id: 'plataforma',
  title: 'Aventura de plataforma',
  icon: '🍄',
  difficulty: 3,
  template: 'plataforma',
  projectName: 'Minha Aventura',
  description: 'Corra, pule em blocos-surpresa, pise em caracóis e chegue na bandeira — no estilo de Super Mario Bros.',
  teaches: ['física com subpixels', 'gravidade e pulo', 'colisão com o cenário', 'câmera e scroll', 'parallax', 'inimigos', 'cenas e variáveis globais'],
  outro: 'Você construiu um jogo de plataforma com as mesmas técnicas dos clássicos! Ideias: crie a fase 2 (duplique a cena fase1 e redesenhe), um power-up que deixa o Bit mais rápido, ou inimigos que pulam.',
  steps: [
    info('A Aventura de Bit 🤖', `
<p>Este projeto tem <b>três cenas</b>: <code>titulo</code> (a tela de abertura), <code>fase1</code> e <code>vitoria</code>. A cena com ⭐ é a primeira a rodar. A tela de título e a de vitória já estão prontas — vamos programar a fase juntos.</p>
<p>Olhe a fase: ela tem <b>64 tiles de largura</b> (512 pixels, duas telas). O retângulo amarelo mostra só a primeira tela: o resto aparece quando a câmera andar.</p>
${snes('o SNES tem até 4 camadas de fundo. Aqui usamos a <b>BG1</b> (a fase, com colisão), a <b>BG2</b> (morros e nuvens) e a <b>BG3</b> (textos). Os sprites ficam por cima de tudo.')}`, { open: { kind: 'scene', name: 'fase1' } }),

    info('A camada de fundo e o parallax', `
<p>Clique no botão <b>BG2 · fundo</b> na barra da cena. Os morros e nuvens estão numa camada separada, com <b>parallax 3/8</b>: quando a câmera anda 8 pixels, o fundo anda só 3.</p>
<p>Como as coisas longe parecem se mover mais devagar, isso cria uma sensação de <b>profundidade</b>. Experimente mudar o valor e jogar depois!</p>
${snes('cada camada tem seus próprios registradores de scroll (BG1HOFS, BG2HOFS...). O parallax é só escrever valores diferentes em cada um, a cada quadro.')}`, { open: { kind: 'scene', name: 'fase1' }, highlight: '[data-action="layer-bg2"]' }),

    step(1, 'O herói na fase', `<p>Abra o sprite <b>heroi</b>: o robô Bit tem 4 quadros (parado, andando 1, andando 2, pulando). Ele tem 16x16 pixels = 4 tiles de 8x8.</p>
<p>Desenhe o Bit na fase:</p>${pre('spr(0, heroi, 32, 176)')}`, ['spr(0, heroi, 32, 176)']),

    step(2, 'Subpixels: andar suave', `
<p>Se o herói andar 1 pixel por quadro, fica lento; 2, rápido demais. E 1,5? A CPU do SNES não tem números com vírgula!</p>
<p>O truque dos jogos clássicos: guardar a posição <b>multiplicada por 16</b> (subpixels). Andar 24 subpixels por quadro = 1,5 pixel. Na hora de desenhar, dividimos por 16:</p>
${pre('var x = 32 * 16\n...\nspr(0, heroi, x / 16, y / 16)')}
<p>E para ficar gostoso de controlar, o herói <b>acelera</b> aos poucos e <b>freia</b> quando você solta o botão (atrito).</p>
${snes('isso se chama <b>ponto fixo</b>. Super Mario World usa exatamente essa ideia: a velocidade do Mario é guardada em 1/16 de pixel.')}`, ['var x = 32 * 16', 'vx = min(vx + ACEL', 'x += vx']),

    step(3, 'Gravidade e chão', `
<p>A gravidade é só somar um pouquinho na velocidade vertical a cada quadro: <code>vy += G</code>. Assim o herói cai cada vez mais rápido, como na vida real.</p>
<p>A função <code>bate(px, py)</code> testa 6 pontos em volta do herói com <code>solid()</code>. Se a nova posição bate em algo, andamos <b>pixel a pixel</b> até encostar — e aí sabemos que ele está no chão.</p>`, ['func bate', 'func move_y', 'vy += G']),

    step(4, 'Paredes e pulo', `
<p>O movimento horizontal usa a mesma ideia (<code>move_x</code>), para o Bit não atravessar paredes.</p>
<p>Pulo: se está no chão e apertou B, a velocidade vertical fica negativa (para cima). A gravidade vai freando até ele cair de novo:</p>
${pre('if chao and btnp(B) then\n  vy = PULO\nend\nif vy < -20 and btn(B) == 0 then vy = -20 end')}
<p>A segunda linha é o <b>pulo variável</b>: soltar o botão cedo faz um pulo mais baixo. Segure <b>Y</b> para correr!</p>`, ['func move_x', 'vy = PULO']),

    step(5, 'Animação e direção', `
<p>Escolhemos o quadro do sprite: no ar = quadro 3 (pulo), andando = animação <code>heroi_anda</code>, parado = quadro 0. Para olhar para a esquerda, <code>FLIPX</code> espelha o sprite.</p>
<p>Veja a animação no editor do sprite <b>heroi</b>: ela usa os quadros 1, 0, 2, 0 trocando a cada 6 quadros de tela.</p>`, ['anim(heroi_anda)', 'olha = FLIPX']),

    step(6, 'Câmera com scroll', `
<p>A fase tem 512 pixels, mas a TV mostra 256. A câmera acompanha o herói e o <code>scroll(cam, 0)</code> move a camada BG1.</p>
<p>Atenção: os sprites <b>não</b> rolam junto! Por isso desenhamos o herói em <code>x / 16 - cam</code>: a posição na tela = posição no mundo menos a câmera.</p>
${snes('mudar o scroll é só escrever 2 bytes num registrador — o hardware faz o resto. Por isso jogos de SNES rolam a tela tão suavemente.')}`, ['scroll(cam, 0)', 'x / 16 - cam']),

    step(7, 'Moedas e blocos-surpresa', `
<p>As moedas são tiles com <b>etiqueta 1</b>: quando o centro do herói passa por uma, apagamos o tile e somamos 1.</p>
<p>Os blocos com "?" têm <b>etiqueta 4</b>. Quando o herói bate a cabeça num deles (<code>cabecada</code>), trocamos o tile pelo bloco usado (célula 5) — igual aos clássicos!</p>`, ['func cabecada', 'moedas += 1']),

    step(8, 'Inimigos: caracóis', `
<p>Os 4 caracóis ficam em <b>arrays</b> (posição, direção, vivo). Eles andam devagar e viram quando encontram uma parede ou a beira de um buraco.</p>
<p>Pular em cima de um caracol derrota ele: testamos se o herói está <b>caindo</b> (<code>vy > 0</code>) e se os pés estão acima do meio do caracol.</p>
<p>Só desenhamos os caracóis que estão na tela; os outros ficam escondidos com <code>hide()</code>.</p>`, ['func move_inimigos', 'eviva[i] = 0']),

    step(9, 'Vidas e buracos', `
<p>Encostar num caracol de lado ou cair num buraco faz o Bit perder uma vida. As variáveis <code>vidas</code> e <code>moedas</code> estão no <b>script global</b> (<code>global.sns</code>), por isso não zeram quando a cena recomeça.</p>
<p>Sem vidas, voltamos para a tela de título, que zera tudo de novo.</p>`, ['func morre', 'vidas -= 1']),

    step(10, 'A bandeira!', '<p>O mastro e a bandeira têm <b>etiqueta 3</b>. Encostou, <code>go(vitoria)</code>!</p>', ['go(vitoria)']),

    soundStep({ title: 'Som: pulo', name: 'pulo', preset: 'pulo', body: '<p>Crie o som <b>pulo</b> (modelo 🦘 Pulo).</p>' }),
    soundStep({ title: 'Som: moeda', name: 'moeda', preset: 'moeda', body: '<p>Crie o som <b>moeda</b> (modelo 🪙 Moeda).</p>' }),
    soundStep({ title: 'Som: pisar', name: 'pisa', preset: 'blip', tweak: { freq: 330, slide: -1, dur: 0.12 }, body: '<p>Crie o som <b>pisa</b>, para quando você derrota um caracol.</p>' }),
    soundStep({ title: 'Som: dano', name: 'dano', preset: 'dano', body: '<p>E o som <b>dano</b>, para quando o Bit perde uma vida.</p>' }),
    step(11, 'Toque os sons', '<p>Coloque os <code>sfx()</code> no pulo, nas moedas, no caracol e no dano.</p>', ['sfx(pulo)', 'sfx(moeda)', 'sfx(pisa)', 'sfx(dano)']),

    info('A trilha sonora', `<p>Abra a música <b>aventura</b>: uma melodia alegre em Dó maior com baixo (🐘) e percussão (🥁). Mude notas, o tempo, troque instrumentos — a música é sua!</p>`, { open: { kind: 'music', name: 'aventura' } }),
    step(12, 'Música na fase', '<p>No <code>start()</code> da fase, chame <code>music(aventura)</code>. Pronto! Gere a ROM e mande para o RetroPie. 🍓</p>', ['music(aventura)']),
  ],
};
