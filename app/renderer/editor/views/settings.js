// Configurações do projeto (nome, título da ROM, tamanhos de sprite, qualidade do som).
import { h, clear, toast } from '../../shared/ui.js';
import { SPRITE_SIZE_MODES } from '../../../core/project.js';

export function mount(el, ctx) {
  const { store } = ctx;
  const root = h('div', { style: { flex: 1, overflow: 'auto', padding: '18px 22px', maxWidth: '760px' } });
  el.append(root);

  function draw() {
    const p = store.project;
    const field = (label, input, hint) => h('div', { style: { marginBottom: '14px' } }, h('label.field', label, input), hint ? h('p.hint', { style: { margin: '4px 0 0' } }, hint) : null);
    clear(root,
      h('h2', { style: { marginBottom: '16px' } }, '⚙️ Configurações do projeto'),
      field('Nome do jogo', h('input', { type: 'text', value: p.name, onchange: (e) => store.change('project', () => { p.name = e.target.value.trim() || p.name; }) })),
      field('Título gravado na ROM', h('input', { type: 'text', value: p.romTitle, maxLength: 21, style: { fontFamily: 'var(--mono)', textTransform: 'uppercase' },
        onchange: (e) => store.change('project', () => { p.romTitle = e.target.value.toUpperCase().replace(/[^A-Z0-9 !.-]/g, '').slice(0, 21); }) }),
      'O cabeçalho de todo cartucho de SNES tem 21 letras para o nome do jogo (só maiúsculas, sem acento). É o que o emulador mostra.'),
      field('Tamanhos de sprite', h('select', { onchange: (e) => { store.change('project', () => { p.spriteSize = e.target.value; }); toast('Sprites com tamanho diferente dos novos precisam ser ajustados.'); } },
        Object.entries(SPRITE_SIZE_MODES).map(([k, m]) => h('option', { value: k, selected: p.spriteSize === k }, m.label))),
      'O SNES só permite 2 tamanhos de sprite ao mesmo tempo (um pequeno e um grande), escolhidos no registrador OBSEL.'),
      field('Qualidade do som', h('select', { onchange: (e) => store.change('project', () => { p.soundRate = Number(e.target.value); }) },
        [[4000, '4 kHz — bem chiado, ocupa pouco'], [8000, '8 kHz — clássico (recomendado)'], [12000, '12 kHz — mais nítido'], [16000, '16 kHz — melhor, ocupa o dobro']].map(([v, l]) => h('option', { value: v, selected: (p.soundRate ?? 8000) === v }, l))),
      'Taxa usada para os efeitos sonoros na ROM. Quanto maior, mais RAM de áudio (64 KB no total) cada som gasta.'),
      h('div.fact', 'A ROM é gerada no formato ', h('b', 'LoROM'), ' (bancos de 32 KB), com o compilador ', h('b', '816-tcc'), ' e a biblioteca ', h('b', 'PVSnesLib'),
        '. O arquivo .sfc roda no snes9x do RetroPie, no bsnes, no Mesen e em cartuchos flash (como o SD2SNES / FXPak).'));
  }
  draw();
  return { refresh() { if (!root.contains(document.activeElement)) draw(); } };
}
