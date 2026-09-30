# 🎮 Sneslador — estúdio de jogos retrô

Engine educacional (no estilo Unity/Godot, só que bem mais simples) para **criar jogos de Super Nintendo** e rodá-los no **RetroPie** (Raspberry Pi) ou em qualquer emulador. Feita para feiras e oficinas: tudo em português e com tutoriais passo a passo que explicam como o console funciona por dentro.

- **Hub**: lista de projetos, modelos prontos, tutoriais, instalação do toolchain e download das versões publicadas no GitHub (`releases/latest`).
- **Editor**: cenas com mapas de tiles (BG1 + BG2 com parallax), editor de pixel art estilo Aseprite (quadros, animações, onion skin, espelho, importação de PNG, sprite sheets e **.aseprite**), paletas de 15 bits, gerador de efeitos sonoros estilo sfxr, **compositor de música estilo Mario Paint**, editor de código com erros ao vivo e referência da API.
- **Live view**: o jogo roda dentro do editor num "SNES virtual" (Mode 1, OAM, limite de 32 sprites por linha, brilho, fade) com **Raio-X** do hardware (camadas, OAM, VRAM, CGRAM) e recarga automática.
- **ROM de verdade**: gera um arquivo `.sfc` com o compilador **PVSnesLib** (816-tcc + WLA-DX + snesmod) e roda no emulador **snes9x** embutido, ou envia direto para a pasta do RetroPie.

## Para quem vai usar

1. Baixe o instalador `Sneslador-Setup-x.y.z.exe` na página de *Releases* e instale (Windows 10/11, 64 bits). O toolchain do SNES já vem junto — funciona sem internet.
2. Abra o Sneslador → aba **Aprender** → escolha um tutorial:
   | Tutorial | Ensina |
   |---|---|
   | 🎬 Primeiros passos: abertura e menu | interface, cenas, splash screen, fade, menu com cursor |
   | 🏓 Pong | sprites, variáveis, controle, colisão, placar, sons |
   | 🧱 Blocos que caem | tiles no mapa, arrays, tabelas de dados, música |
   | 👻 Labirinto come-bolinhas | movimento em grade, etiquetas de tiles, IA dos fantasmas, compositor |
   | 🍄 Aventura de plataforma | física com subpixels, pulo, câmera/scroll, parallax, inimigos, 3 cenas |
3. Em cada passo, faça você mesmo ou clique em **🪄 Fazer para mim**. O painel confere sozinho quando o passo está pronto.
4. **▶ Jogar** (F5) testa no editor. **🛠️ Gerar ROM** (F6) cria o `.sfc`. **🕹️ Rodar no emulador** (F7) roda a ROM de verdade.

### Levando o jogo para o RetroPie
Com o Raspberry Pi na mesma rede, o RetroPie compartilha a pasta `\\RETROPIE\roms\snes`. Configure esse caminho no Hub (**Configurações**) e use **🍓 Enviar ao RetroPie**. No Raspberry: *Start → Quit → Restart EmulationStation* e o jogo aparece na lista do Super Nintendo. Também dá para copiar o `.sfc` num pendrive.

Controles no live view: setas, `Z` = B, `X` = A, `A` = Y, `S` = X, `Q`/`W` = L/R, `Enter` = Start, `Shift direito` = Select. Controles USB funcionam automaticamente.

## A linguagem SNS (Sneslador Script)

Parecida com Lua. **Todo número é inteiro de 16 bits** (-32768 a 32767), como no processador 65816 — `7 / 2` dá `3`, e `32767 + 1` dá `-32768`.

```
var x = 10            // variável
const VEL = 2         // constante
array grade[200]      // array (ou: array t = {1, 2, 3})

func start()          // roda 1 vez quando a cena começa
  text(2, 2, "OLA!")
end

func update()         // roda 60 vezes por segundo
  if btn(RIGHT) then x += VEL end
  for i = 0 to 3 do spr(i, heroi, x + i * 8, 100) end
  while cond do ... end
end
```

Funções (a lista completa aparece no editor de código): `btn`, `btnp`, `spr`, `hide`, `anim`, `animt`, `scroll`, `tile`, `settile`, `solid`, `tiletag`, `text`, `num`, `cls`, `go`, `brightness`, `bgcolor`, `sfx`, `music`, `stopmusic`, `rnd`, `abs`, `min`, `max`, `overlap`, `frames`.
Constantes: `UP DOWN LEFT RIGHT A B X Y L R START SELECT`, `FLIPX FLIPY`, `SCREEN_W SCREEN_H`, e o **nome de cada asset** (sprites, sons, músicas, cenas e animações `sprite_animacao`).

O mesmo script é compilado para **JavaScript** (live view) e para **C** (ROM), com a mesma aritmética de 16 bits — o jogo se comporta igual nos dois.

## Limites (os mesmos do SNES)
- Tela 256x224, 60 quadros por segundo; tiles de 8x8 e 4 bits por pixel (15 cores + transparente).
- Até 1024 tiles de cenário por cena; mapa do BG1 com até 64x32 tiles (duas telas de largura).
- 512 tiles de sprite no total, 128 sprites na OAM, 32 por linha; dois tamanhos de sprite por projeto.
- 8 paletas de cenário (a 0 é do sistema) e 8 de sprite.
- Até 16 efeitos sonoros; efeitos + a maior música precisam caber em ~58 KB de RAM de áudio.

## Para desenvolver a engine

Requisitos: Node.js 22+ e Windows.

```bash
npm install          # instala o Electron e copia o EmulatorJS para app/vendor
npm start            # abre o Hub
npm test             # testes: compilador, runtime, modelos e todos os passos dos tutoriais
npm run dist         # gera dist/Sneslador-Setup-<versão>.exe (baixa o PVSnesLib se precisar)
```

Estrutura:
```
app/main.js                  processo principal (janelas, disco, rede, build)
app/core/lang/               lexer, parser e compilador SNS → JS e → C
app/core/gamedata.js         projeto → tiles 4bpp/2bpp, mapas, CGRAM (usado pelo live view e pela ROM)
app/core/runtime/console.js  SNES virtual do live view
app/core/audio/              WAV, gerador de efeitos, instrumentos, músicas e escritor de módulos .it
app/core/templates/          modelos de jogo (arte original gerada por código)
app/core/tutorials/          roteiros dos tutoriais
app/export/snes/             exportador e runtime C para PVSnesLib
app/renderer/hub|editor/     interfaces
```

Teste automático de ROM (abre o emulador, espera e salva um print):
```bash
npx electron . --emu=caminho/game.sfc --capture=print.png --wait=8000
```

### Publicando uma versão (para o Hub baixar)
1. Troque `seu-usuario/sneslador` pelo seu repositório no Hub (**Configurações**) e em `package.json` (`homepage`).
2. Envie uma tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. O GitHub Actions (`.github/workflows/release.yml`) roda os testes, gera o instalador e publica a release como **latest**. O Hub de todo mundo mostra a nova versão na aba **Versões**.

## Outros consoles
Por enquanto o Sneslador exporta só para **Super Nintendo**. O exportador fica isolado em `app/export/snes/`, e o núcleo (linguagem, projeto, tiles) foi pensado para receber outros alvos no futuro (NES, Mega Drive, Game Boy), cada um com o seu runtime e as suas limitações.

## Licenças
Sneslador: MIT. Inclui PVSnesLib (zlib), EmulatorJS (GPL-3.0) e o núcleo snes9x (uso **não comercial**). Detalhes em `LICENSE.txt`. Os modelos de jogo usam arte e personagens originais, apenas inspirados nos clássicos.
