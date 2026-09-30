import { blocosCode } from '../templates/blocos.js';
import { codeStep, soundStep, info, snes, pre } from './common.js';

const step = (n, title, body, must) => codeStep({ title, body, scene: 'blocos', code: blocosCode(n), must });

export const BLOCOS_TUTORIAL = {
  id: 'blocos',
  title: 'Blocos que caem',
  icon: '🧱',
  difficulty: 2,
  template: 'blocos',
  projectName: 'Meus Blocos',
  description: 'Peças que caem, giram e somem ao completar linhas — inspirado no clássico russo de 1984.',
  teaches: ['tiles no mapa', 'arrays', 'tabelas de dados', 'laços', 'funções', 'música'],
  outro: 'Você programou um jogo de blocos completo, com a mesma técnica dos originais: o tabuleiro é um array e a tela é só um desenho dele. Ideias: adicione "hard drop" com o botão B, conte níveis, ou mude a velocidade da música conforme o jogo acelera.',
  steps: [
    info('Blocos que caem 🧱', `
<p>Neste jogo, as peças <b>não são sprites</b>: elas são desenhadas direto no <b>mapa de tiles</b>. Cada quadradinho do tabuleiro é um tile de 8x8.</p>
<p>Abra o tileset <b>pecas</b>: as células 1 a 7 são blocos coloridos, a 8 é a parede e a 9 é o fundo do tabuleiro. O número de cada célula é o que usamos no código.</p>
${snes('mudar um tile do mapa é só escrever 2 bytes na VRAM. É muito mais barato do que mover 200 sprites — e o SNES só aguentaria 128!')}`, { open: { kind: 'tileset', name: 'pecas', opts: { props: true } } }),

    step(1, 'Coloque um tile com código', `
<p>A função <code>settile(coluna, linha, célula)</code> troca um tile do mapa. Vamos criar constantes para a posição do tabuleiro na tela e pintar um bloco vermelho (célula 5):</p>
${pre('const X0 = 11\nconst Y0 = 3\n\nfunc start()\n  settile(X0 + 4, Y0, 5)\nend')}
<p>Aperte <b>▶ Jogar</b> e procure o bloquinho no topo do tabuleiro.</p>
${snes('o mapa do BG1 guarda, para cada posição, o número do tile e a paleta. A tela tem 32 colunas e 28 linhas de tiles visíveis.')}`, ['settile(X0 + 4, Y0, 5)']),

    step(2, 'O tabuleiro é um array', `
<p>Um <b>array</b> é uma fileira de variáveis numeradas. Nosso tabuleiro tem 10 x 20 = 200 casas:</p>
${pre('array tab[200]   // 0 = vazio, 1..7 = cor')}
<p>A casa da coluna <code>x</code>, linha <code>y</code> fica na posição <code>y * LARG + x</code>. A função <code>redesenha()</code> percorre tudo com dois <code>for</code> e copia para a tela.</p>
${snes('arrays ficam na WRAM, a RAM principal de 128 KB. Cada número ocupa 2 bytes (16 bits), então o tabuleiro gasta 400 bytes.')}`, ['array tab[200]', 'func redesenha']),

    step(3, 'As peças são uma tabela de números', `
<p>Cada peça tem 4 blocos, e cada bloco tem uma posição (x, y) dentro de uma caixinha. As 7 peças, com 4 rotações cada, cabem numa tabela de 224 números: <code>PECAS</code>.</p>
<p>Em vez de calcular a rotação na hora (lento para um processador de 3,58 MHz!), os jogos antigos guardavam tudo pronto em tabelas.</p>
<p>As funções <code>bloco_x</code> e <code>bloco_y</code> leem a tabela, e <code>desenha_peca</code> pinta a peça atual. Rode e veja a primeira peça no topo!</p>`, ['array PECAS', 'func desenha_peca', 'nova_peca()']),

    step(4, 'Gravidade', `
<p>A cada <code>veloc</code> quadros a peça desce uma linha — mas só se ela <b>couber</b> lá. A função <code>cabe(p, r, x, y)</code> testa os 4 blocos: fora do tabuleiro ou em cima de outro bloco? Não cabe.</p>
${pre('timer += 1\nif timer >= limite then\n  timer = 0\n  if cabe(peca, rot, px, py + 1) then\n    py += 1\n  end\nend')}
<p>Repare que no começo do <code>update()</code> apagamos a peça (<code>desenha_peca(VAZIO)</code>) e no fim desenhamos de novo, já na posição nova.</p>`, ['func cabe', 'timer += 1']),

    step(5, 'Controles: mover e girar', `
<p>Use <code>btnp</code> (que só vale no quadro em que o botão foi <b>apertado</b>) para mover um passo por vez:</p>
${pre('if btnp(LEFT) and cabe(peca, rot, px - 1, py) then px -= 1 end\nif btnp(RIGHT) and cabe(peca, rot, px + 1, py) then px += 1 end')}
<p>Girar é trocar para a próxima rotação: <code>(rot + 1) % 4</code>. O <code>%</code> é o resto da divisão, então depois do 3 vem o 0. Segurar ↓ faz a peça cair rápido.</p>
${snes('o controle do SNES é lido automaticamente pelo hardware em cada VBlank e vira um número de 16 bits: um bit para cada botão.')}`, ['btnp(LEFT)', '(rot + 1) % 4']),

    step(6, 'Encaixar a peça', `
<p>Quando a peça não consegue mais cair, ela é <b>gravada</b> no array <code>tab</code> e uma nova peça aparece. Se a nova peça já nasce em cima de blocos, é <b>fim de jogo</b>.</p>
${pre('func fixa()\n  for b = 0 to 3 do\n    ...\n    tab[cy * LARG + px + bloco_x(peca, rot, b)] = peca + 1\n  end\n  nova_peca()\nend')}`, ['func fixa', 'fixa()']),

    step(7, 'Completar linhas', `
<p>Depois de encaixar, procuramos linhas cheias. Quando uma linha está completa, tudo que está acima desce uma linha — um <code>for</code> com <code>step -1</code> anda de baixo para cima.</p>
<p>Pontuação: 1 linha = 10, 2 linhas = 40, 3 = 90, 4 = 160 (<code>feitas * feitas * 10</code>). E a cada linha o jogo acelera!</p>`, ['func limpa_linhas', 'limpa_linhas()']),

    step(8, 'Próxima peça e placar', `
<p>Mostre a próxima peça ao lado do tabuleiro e o placar com <code>text()</code> e <code>num()</code>.</p>
${snes('o texto usa a camada BG3. Ela tem só 4 cores por tile, mas fica por cima de todas as outras camadas: perfeita para placares.')}`, ['func mostra_prox', 'num(23, 12, pontos)']),

    soundStep({ title: 'Som: girar', name: 'gira', preset: 'blip', body: '<p>Crie um som chamado <b>gira</b> (clique no <b>+</b> de SONS). O modelo <b>🔘 Menu (blip)</b> funciona bem.</p>' }),
    soundStep({ title: 'Som: encaixar', name: 'encaixa', preset: 'dano', tweak: { dur: 0.12, decay: 0.1 }, body: '<p>Agora o som <b>encaixa</b>, para quando a peça trava. Tente o modelo <b>🤕 Dano</b> com duração curta.</p>' }),
    soundStep({ title: 'Som: linha completa', name: 'linha', preset: 'powerup', body: '<p>E o som <b>linha</b>, para comemorar. O modelo <b>⭐ Power-up</b> é ótimo!</p>' }),

    step(9, 'Toque os sons', `<p>Coloque <code>sfx(gira)</code>, <code>sfx(encaixa)</code> e <code>sfx(linha)</code> nos lugares certos.</p>`, ['sfx(gira)', 'sfx(encaixa)', 'sfx(linha)']),

    info('A música: Korobeiniki 🎵', `
<p>Abra a música <b>korobeiniki</b> na árvore. É uma canção folclórica russa do século XIX (de domínio público) que ficou famosa nos jogos de blocos.</p>
<p>Ela foi escrita no <b>compositor</b>: cada coluna é uma batida e cada carimbo é uma nota. 🍄 é a melodia, 🐘 o baixo e 🥁 a percussão. Aperte <b>▶ Tocar</b> e experimente trocar notas!</p>
${snes('a música vira um módulo de tracker para o chip de som. Cada instrumento é uma amostra BRR curta, tocada mais rápida ou mais devagar para mudar a nota — em até 8 canais ao mesmo tempo.')}`, { open: { kind: 'music', name: 'korobeiniki' } }),

    step(10, 'Toque a música no jogo', `<p>No <code>start()</code>, chame <code>music(korobeiniki)</code>. Ela fica tocando em loop.</p>`, ['music(korobeiniki)']),

    step(11, 'Fim de jogo', `<p>Quando <code>fim</code> for 1, mostramos a mensagem e esperamos o START para recomeçar com <code>go(blocos)</code>. Pronto: gere a ROM e jogue no emulador!</p>`, ['FIM DE JOGO', 'go(blocos)']),
  ],
};
