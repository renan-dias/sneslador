import { pongCode } from '../templates/pong.js';
import { codeStep, soundStep, info, snes, pre } from './common.js';

const step = (n, title, body, must) => codeStep({ title, body, scene: 'jogo', code: pongCode(n), must });

export const PONG_TUTORIAL = {
  id: 'pong',
  title: 'Pong',
  icon: '🏓',
  difficulty: 1,
  template: 'pong',
  projectName: 'Meu Pong',
  description: 'Faça o clássico de 1972: raquetes, bola quicando, placar e sons. O melhor primeiro jogo!',
  teaches: ['sprites', 'variáveis', 'controle', 'colisão', 'placar', 'som'],
  outro: 'Você fez um Pong completo! Ideias: deixe o computador mais rápido a cada ponto, troque as cores na aba Paletas, ou faça um modo de 2 jogadores usando os botões X e B.',
  steps: [
    info('Bem-vindo ao Pong! 🏓', `
<p>Em 1972 a Atari lançou <b>Pong</b>, um tênis de mesa na TV, e ele virou febre. Hoje você vai refazer esse jogo — e ele vai rodar num Super Nintendo de verdade!</p>
<p>Este projeto já vem com a <b>quadra desenhada</b> (a cena <code>jogo</code>) e dois <b>sprites</b>: <code>raquete</code> e <code>bola</code>. Nós vamos escrever o <b>código</b> juntos.</p>
<p>Olhe o mapa ao lado: as linhas vermelhas são os tiles <b>sólidos</b> (paredes). O retângulo amarelo tracejado é a área que aparece na TV: 256x224 pixels.</p>
${snes('o cenário é uma camada chamada <b>BG1</b>, montada com pedacinhos de 8x8 pixels chamados <b>tiles</b>. A rede do meio é o mesmo tile repetido várias vezes: ele ocupa a memória só uma vez!')}`, { open: { kind: 'scene', name: 'jogo' } }),

    info('Conheça os sprites', `
<p>Sprites são os objetos que se movem por cima do cenário. Abra o sprite <b>bola</b> na árvore à esquerda (ou olhe esta aba) e veja: é um desenho de 8x8 pixels.</p>
<p>Experimente pintar com o lápis e trocar as cores na paleta à direita. Duplo clique numa cor muda o tom dela.</p>
${snes('cada sprite só pode usar <b>16 cores</b> (4 bits por pixel), e a cor 0 é sempre transparente. O console guarda até <b>128 sprites</b> numa memória chamada <b>OAM</b>.')}`, { open: { kind: 'sprite', name: 'bola' }, highlight: '[data-tree^="sprite:"]' }),

    step(1, 'Seu primeiro código: mostre a bola', `
<p>Todo script de cena tem duas funções especiais:</p>
<p>• <code>start()</code> roda <b>uma vez</b>, quando a cena começa.<br>• <code>update()</code> roda <b>60 vezes por segundo</b>, para sempre.</p>
<p>Dentro do <code>update()</code>, escreva:</p>
${pre('spr(8, bola, 124, 108)')}
<p>Isso coloca o sprite <code>bola</code> no <b>slot 8</b> da OAM, na posição x=124, y=108. Depois aperte <b>▶ Jogar</b> (ou F5)!</p>
${snes('o ponto (0,0) fica no canto de <b>cima à esquerda</b>. O x cresce para a direita e o y cresce para <b>baixo</b>.')}`, ['spr(8, bola, 124, 108)']),

    step(2, 'Faça a bola andar', `
<p>Para algo se mexer, a posição precisa <b>mudar</b> a cada quadro. Para isso usamos <b>variáveis</b>: nomes que guardam números.</p>
<p>No topo do script (fora das funções) crie a posição e a velocidade da bola:</p>
${pre('var bx = 124\nvar by = 108\nvar vx = 2\nvar vy = 1')}
<p>E no <code>update()</code> some a velocidade na posição e desenhe a bola onde ela está:</p>
${pre('bx += vx\nby += vy\nspr(8, bola, bx, by)')}
<p>Rode o jogo: a bola vai sair da tela... já vamos resolver isso!</p>
${snes('<code>bx += vx</code> é o mesmo que <code>bx = bx + vx</code>. Como roda 60 vezes por segundo, a bola anda 120 pixels por segundo na horizontal.')}`, ['var bx', 'bx += vx', 'spr(8, bola, bx, by)']),

    step(3, 'Quicar nas paredes', `
<p>Quando a bola encosta na parede de cima ou de baixo, a velocidade vertical tem que <b>inverter de sinal</b>: <code>vy = -vy</code>.</p>
<p>Crie duas <b>constantes</b> (números que nunca mudam) no topo:</p>
${pre('const TOPO = 16\nconst CHAO = 208')}
<p>E no <code>update()</code>, depois de mover a bola:</p>
${pre('if by < TOPO then\n  by = TOPO\n  vy = -vy\nend\nif by > CHAO - 8 then\n  by = CHAO - 8\n  vy = -vy\nend')}
<p>O "Fazer para mim" também adiciona um trecho que traz a bola de volta ao centro quando ela sai pela lateral.</p>
${snes('<code>CHAO - 8</code> porque a posição do sprite é o canto de cima dele, e a bola tem 8 pixels de altura.')}`, ['const TOPO', 'vy = -vy']),

    info('Teste! ▶', `
<p>Aperte <b>▶ Jogar</b> e veja a bola quicando.</p>
<p>Abra a aba <b>OAM</b> no painel do jogo: você vê o slot 8 sendo atualizado com a posição da bola, quadro a quadro. Pause e use <b>⏭ 1 quadro</b> para ver cada passo.</p>
${snes('isso tudo acontece 60 vezes por segundo, sincronizado com o feixe de elétrons da TV de tubo. O intervalo em que o feixe volta para o topo se chama <b>VBlank</b>, e é só nele que dá para mexer na memória de vídeo.')}`, { open: { kind: 'game' }, highlight: '#btnPlay' }),

    step(5, 'A raquete do jogador', `
<p>A raquete tem 32 pixels de altura, mas o sprite <code>raquete</code> tem só 8x8. Solução dos jogos antigos: desenhar <b>4 sprites empilhados</b> — um <b>metasprite</b>!</p>
<p>Crie uma <b>função</b> (um pedaço de código reutilizável) que desenha os 4 pedaços usando um laço <code>for</code>:</p>
${pre('func desenha_raquete(slot, x, y)\n  for i = 0 to 3 do\n    spr(slot + i, raquete, x, y + i * 8)\n  end\nend')}
<p>No <code>update()</code>, leia o controle com <code>btn()</code>:</p>
${pre('if btn(UP) and p1y > TOPO then p1y -= VEL end\nif btn(DOWN) and p1y < CHAO - ALTURA then p1y += VEL end\ndesenha_raquete(0, 16, p1y)')}
<p>(Use o "Fazer para mim" para receber também as constantes e a variável <code>p1y</code>.) Jogue com as <b>setas ↑ ↓</b>!</p>
${snes('a raquete usa os slots 0, 1, 2 e 3 da OAM. O SNES consegue mostrar no máximo <b>32 sprites na mesma linha</b> da tela — por isso metasprites grandes precisavam ser planejados com cuidado.')}`, ['func desenha_raquete', 'btn(UP)', 'desenha_raquete(0, 16, p1y)']),

    step(6, 'Rebatendo: colisão de retângulos', `
<p>Como saber se a bola encostou na raquete? Comparamos dois retângulos. A função <code>overlap(x1,y1,l1,a1, x2,y2,l2,a2)</code> devolve 1 quando eles se tocam.</p>
${pre('if vx < 0 and overlap(bx, by, 8, 8, 16, p1y, 8, ALTURA) then\n  vx = -vx\n  if vx < 4 then vx += 1 end\n  vy = (by - p1y - 12) / 5\nend')}
<p>A última linha é um truque dos jogos: se a bola bate na <b>ponta</b> da raquete, ela sai inclinada; no meio, sai reta. E a cada rebatida a bola fica mais rápida!</p>
${snes('esse teste se chama <b>AABB</b> (caixas alinhadas aos eixos). É barato para a CPU de 3,58 MHz do SNES, por isso quase todo jogo 2D usa.')}`, ['overlap(bx, by, 8, 8, 16, p1y']),

    step(7, 'Um adversário: o computador', `
<p>Vamos dar vida à raquete da direita. A "inteligência artificial" é simples: se a bola está abaixo, desce; se está acima, sobe — mas com velocidade 2, mais lenta que a sua (3). Assim dá para ganhar!</p>
${pre('if by > p2y + 20 and p2y < CHAO - ALTURA then p2y += 2 end\nif by < p2y + 4 and p2y > TOPO then p2y -= 2 end')}
<p>E também a colisão com a raquete dela, e o desenho nos slots 4 a 7.</p>`, ['p2y += 2', 'desenha_raquete(4, 232, p2y)']),

    step(8, 'Placar e saque', `
<p>Quando a bola passa de uma raquete, é ponto do outro lado. Crie a função <code>saque</code>, que recoloca a bola no meio com uma direção sorteada por <code>rnd()</code>:</p>
${pre('func saque(direcao)\n  bx = 124\n  by = 108\n  vx = direcao * 2\n  vy = rnd(3) - 1\n  if vy == 0 then vy = 1 end\n  espera = 60\nend')}
<p>E mostre o placar com <code>num(coluna, linha, valor)</code>. Texto no SNES é posicionado em <b>tiles</b>: a tela tem 32 colunas e 28 linhas.</p>
${snes('o texto fica numa terceira camada, a <b>BG3</b>, que tem só 4 cores por tile e fica por cima de tudo. A fonte é um conjunto de 95 tiles de 8x8.')}`, ['func saque', 'num(12, 0, pontos1)']),

    soundStep({
      title: 'Crie os efeitos sonoros',
      name: 'quique',
      preset: 'blip',
      body: `
<p>Hora do som! Clique no <b>+</b> ao lado de <b>SONS</b> na árvore e crie um som chamado <b>quique</b>. Escolha o modelo <b>🔘 Menu (blip)</b> ou invente o seu com os controles.</p>
${snes('o som é gerado por outro processador, o <b>SPC700</b> da Sony, com 64 KB de RAM só para áudio. Os sons ficam comprimidos em um formato chamado <b>BRR</b>.')}`,
    }),

    soundStep({
      title: 'Mais um som: ponto!',
      name: 'ponto',
      preset: 'moeda',
      body: `<p>Crie agora o som <b>ponto</b> (o modelo <b>🪙 Moeda</b> combina bem). Aperte <b>▶ Tocar (como no SNES)</b> para ouvir como ele fica na taxa de amostragem do console.</p>`,
    }),

    step(9, 'Toque os sons no jogo', `
<p>Com os sons criados, basta chamar <code>sfx(nome)</code> onde a bola quica e onde sai ponto:</p>
${pre('sfx(quique)   // nas paredes e raquetes\nsfx(ponto)    // quando alguém marca')}`, ['sfx(quique)', 'sfx(ponto)']),

    step(10, 'Fim de jogo', `
<p>Quem fizer 5 pontos vence. Guardamos o vencedor numa variável e, quando ela for maior que zero, mostramos a mensagem e esperamos o <b>START</b>:</p>
${pre('if vencedor > 0 then\n  ...\n  if btnp(START) then go(jogo) end\n  return\nend')}
<p><code>go(jogo)</code> recarrega a cena, zerando tudo. <code>return</code> sai da função na hora, pulando o resto do <code>update()</code>.</p>`, ['vencedor = 1', 'go(jogo)']),

    info('Gere a ROM! 🕹️', `
<p>Seu Pong está pronto. Agora aperte <b>🛠️ Gerar ROM</b> (F6): a engine transforma seus scripts em código C, compila para o processador <b>65816</b> e monta um arquivo <b>.sfc</b> — igual a um cartucho!</p>
<p>Depois use <b>🕹️ Rodar no emulador</b> para jogar a ROM de verdade no snes9x, ou <b>🍓 Enviar ao RetroPie</b> para jogar no Raspberry Pi.</p>
${snes('o jogo compilado cabe em poucos KB. Os cartuchos da época tinham de 256 KB a 6 MB.')}`, { highlight: '#btnBuild, #btnEmu' }),
  ],
};
