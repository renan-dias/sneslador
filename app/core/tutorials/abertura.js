import { splashCode, menuCode, CREDITOS_CODE } from '../templates/abertura.js';
import { emptyScene } from '../project.js';
import { hexToBgr555 } from '../gfx/snes.js';
import { codeStep, soundStep, info, snes, pre } from './common.js';

export const ABERTURA_TUTORIAL = {
  id: 'abertura',
  title: 'Primeiros passos: abertura e menu',
  icon: '🎬',
  difficulty: 1,
  template: 'abertura',
  projectName: 'Meu Primeiro Jogo',
  description: 'Conheça a engine criando uma tela de abertura (splash), um menu com cursor e uma tela de créditos.',
  teaches: ['a interface', 'cenas', 'splash screen', 'brilho e fade', 'menu com cursor', 'texto'],
  outro: 'Agora você sabe montar a "casca" de qualquer jogo: abertura, menu e telas. Troque a imagem da abertura por uma sua (importe um PNG de 256x224 no tileset logo) e depois faça um dos outros tutoriais para criar o jogo de verdade!',
  steps: [
    info('Bem-vindo ao Sneslador! 🎮', `
<p>Esta é a sua oficina de jogos de Super Nintendo. Um tour rápido:</p>
<p>• <b>À esquerda</b>, a árvore do projeto: <b>cenas</b> (telas do jogo), <b>sprites</b> (personagens), <b>tilesets</b> (pedaços do cenário), <b>sons</b> e <b>músicas</b>.<br>
• <b>No meio</b>, os editores abertos em abas.<br>
• <b>À direita</b>, o <b>Raio-X do console</b>: quanto da memória do SNES você já usou.<br>
• <b>Embaixo</b>, o console com mensagens e erros.</p>
<p>Aperte <b>▶ Jogar</b> (F5) a qualquer momento para testar. Tudo é salvo automaticamente.</p>
${snes('este projeto vai virar uma ROM <b>.sfc</b>, o mesmo tipo de arquivo que tem dentro de um cartucho.')}`, { highlight: '#btnPlay' }),

    info('A cena de abertura', `
<p>A cena <b>splash</b> (com ⭐, porque é a primeira) mostra o logo. O logo é um <b>tileset</b> de 256x224 pixels — o tamanho exato da tela — "carimbado" no mapa com o botão <b>🖼️ Carimbar tileset inteiro</b>.</p>
<p>Quer usar a sua própria imagem? Abra o tileset <b>logo</b> e use <b>📥 Importar PNG</b>. A engine reduz as cores para 15, como o SNES exige.</p>
${snes('uma imagem de tela cheia tem 896 tiles de 8x8. A VRAM do cenário comporta 1024 por cena — por isso telas de abertura bem detalhadas eram um luxo!')}`, { open: { kind: 'scene', name: 'splash' } }),

    codeStep({
      title: 'Programe a abertura', scene: 'splash', code: splashCode(1), must: ['tempo += 1', 'go(menu)'],
      body: `<p>A abertura deve ficar 3 segundos na tela e ir para o menu. Contamos os quadros numa variável: 60 quadros = 1 segundo.</p>
${pre('var tempo = 0\n\nfunc update()\n  tempo += 1\n  if tempo > 180 or btnp(START) then go(menu) end\nend')}
<p><code>go(menu)</code> troca de cena com um <b>fade</b> automático. Rode e veja!</p>`,
    }),

    codeStep({
      title: 'Fade manual com o brilho', scene: 'splash', code: splashCode(2), must: ['brightness(0)', 'brightness(luz)'],
      body: `<p>O SNES controla o brilho da tela inteira com um único registrador, de 0 (preto) a 15 (máximo). Vamos acender o logo devagarinho:</p>
${pre('func start()\n  brightness(0)\nend\n\n// no update():\nif tempo % 4 == 0 and luz < 15 then\n  luz += 1\n  brightness(luz)\nend')}
${snes('o registrador se chama <b>INIDISP</b> ($2100). Todo fade de jogo de SNES é feito mudando esse número quadro a quadro.')}`,
    }),

    codeStep({
      title: 'O menu', scene: 'menu', code: menuCode(3), must: ['text(12, 13, "JOGAR")'],
      body: `<p>Abra a cena <b>menu</b>: ela já tem uma moldura desenhada com tiles (cantos, bordas e miolo — a técnica "9-slice"). Escreva as opções com <code>text(coluna, linha, "texto")</code>:</p>
${pre('text(12, 13, "JOGAR")\ntext(12, 15, "COMO JOGAR")\ntext(12, 17, "CREDITOS")')}
<p>A tela tem 32 colunas e 28 linhas de texto. A fonte do SNES só tem letras sem acento!</p>`,
    }),

    info('O cursor', `<p>Abra o sprite <b>seta</b>: é o cursor do menu, com 8x8 pixels. Que tal redesenhar? Use o lápis, a borracha e o balde. Clique com o botão direito para usar a segunda cor.</p>
${snes('os sprites de 8x8 são os menores que o SNES aceita. Cada um ocupa só 32 bytes de VRAM.')}`, { open: { kind: 'sprite', name: 'seta' } }),

    codeStep({
      title: 'Mover o cursor', scene: 'menu', code: menuCode(4), must: ['opcao = (opcao + 1) % OPCOES', 'spr(0, seta'],
      body: `<p>Guardamos a opção escolhida numa variável. <code>btnp</code> vale só no quadro em que o botão foi apertado — assim o cursor anda uma opção por toque.</p>
${pre('if btnp(DOWN) then opcao = (opcao + 1) % OPCOES end\nspr(0, seta, 80, 104 + opcao * 16)')}
<p>O <code>%</code> (resto da divisão) faz o cursor dar a volta: depois da última opção, volta para a primeira.</p>`,
    }),

    soundStep({ title: 'Som do cursor', name: 'cursor', preset: 'blip', body: '<p>Todo menu precisa de um "blip"! Crie um som chamado <b>cursor</b> clicando no <b>+</b> de SONS.</p>' }),
    codeStep({ title: 'Toque o blip', scene: 'menu', code: menuCode(5), must: ['sfx(cursor)'], body: '<p>Chame <code>sfx(cursor)</code> sempre que o cursor andar.</p>' }),

    {
      title: 'Crie a cena de créditos',
      body: `<p>Clique no <b>+</b> ao lado de <b>CENAS</b> e crie uma cena chamada <b>creditos</b> (sem acento).</p>
${snes('cada cena carrega o seu próprio cenário na VRAM quando começa. Por isso há um fade: a tela é desligada enquanto os gráficos são copiados.')}`,
      task: 'Crie a cena "creditos".',
      highlight: '[data-add="Cenas"]',
      check: (hp) => !!hp.scene('creditos'),
      apply: (hp, ctx) => {
        if (hp.scene('creditos')) return;
        const sc = emptyScene('creditos', hp.tileset('moldura')?.id ?? null);
        sc.bgcolor = hexToBgr555('#28185a');
        ctx.store.change('scene', (p) => { p.scenes.push(sc); });
      },
    },
    codeStep({
      title: 'Escreva os créditos', scene: 'creditos', code: CREDITOS_CODE, must: ['go(menu)'],
      body: `<p>Coloque seu nome nos créditos! E volte ao menu com o botão B:</p>${pre('if btnp(B) then go(menu) end')}`,
    }),

    codeStep({
      title: 'Escolher uma opção', scene: 'menu', code: menuCode(7), must: ['go(jogo)', 'go(creditos)'],
      body: `<p>Quando o jogador apertar A ou START, vamos para a cena escolhida:</p>
${pre('if opcao == 0 then go(jogo) end\nif opcao == 1 then go(ajuda) end\nif opcao == 2 then go(creditos) end')}
<p>A cena <b>jogo</b> já tem um mini-jogo de pegar estrelas. Rode tudo desde a abertura!</p>`,
    }),

    info('Cores de fundo e paletas', `<p>Abra a cena <b>menu</b> e clique na <b>Cor de fundo</b> no painel direito. Cada canal (vermelho, verde, azul) vai de 0 a 31.</p>
<p>Depois abra <b>🎨 Paletas de cores</b> na árvore: são as 256 cores que o SNES tem na memória ao mesmo tempo.</p>
${snes('o SNES consegue exibir 32.768 cores diferentes, mas só 256 de cada vez na tela.')}`, { open: { kind: 'scene', name: 'menu' } }),

    info('Gere a sua primeira ROM! 🕹️', `<p>Aperte <b>🛠️ Gerar ROM</b>. Na primeira vez, se o toolchain não estiver instalado, abra o Hub > <b>Toolchain SNES</b> e clique em Instalar.</p>
<p>Depois: <b>🕹️ Rodar no emulador</b> para ver a ROM de verdade, ou <b>🍓 Enviar ao RetroPie</b> para jogar no Raspberry Pi da feira!</p>`, { highlight: '#btnBuild, #btnEmu, #btnPie' }),
  ],
};
