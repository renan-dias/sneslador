// Visão geral das 16 paletas (CGRAM): 8 de cenário e 8 de sprites.
import { h, clear } from '../../shared/ui.js';
import { bgr555ToHex } from '../../../core/gfx/snes.js';
import { colorEditor } from './palette-widget.js';

export function mount(el, ctx) {
  const { store } = ctx;
  const root = h('div', { style: { flex: 1, overflow: 'auto', padding: '18px 22px' } });
  el.append(root);
  let sel = null; // {kind, pal, idx}

  function users(kind, i) {
    const p = store.project;
    if (kind === 'bg') return p.tilesets.filter((t) => t.palette === i).map((t) => t.name);
    return p.sprites.filter((s) => s.palette === i).map((s) => s.name);
  }

  function draw() {
    const p = store.project;
    const block = (kind, title, desc) => h('div', { style: { marginBottom: '22px' } },
      h('h3', { style: { marginBottom: '4px' } }, title), h('p.hint', { style: { marginTop: 0 } }, desc),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', alignItems: 'center', maxWidth: '900px' } },
        p.palettes[kind].map((pal, i) => [
          h('div', { style: { fontSize: '12px', color: 'var(--muted)', minWidth: '150px' } }, h('b', { style: { color: 'var(--text)' } }, `Paleta ${i}`),
            kind === 'bg' && i === 0 ? ' · sistema (fundo e texto)' : users(kind, i).length ? ` · ${users(kind, i).join(', ')}` : ' · livre'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: '3px' } },
            pal.map((c, k) => h('div.swatch', {
              class: `${k === 0 ? 'transp' : ''} ${sel && sel.kind === kind && sel.pal === i && sel.idx === k ? 'sel' : ''}`,
              style: { background: bgr555ToHex(c), height: '26px', opacity: kind === 'bg' && i === 0 ? 0.5 : 1 },
              title: `cor ${k} · CGRAM ${(kind === 'obj' ? 128 : 0) + i * 16 + k}`,
              onclick: () => { if (k === 0 || (kind === 'bg' && i === 0)) return; sel = { kind, pal: i, idx: k }; draw(); },
            }))),
        ])),
      sel && sel.kind === kind ? colorEditor(p.palettes[kind][sel.pal][sel.idx], (v) => store.change('palette', (pr) => { pr.palettes[sel.kind][sel.pal][sel.idx] = v; }, { coalesce: `pal-${sel.kind}-${sel.pal}-${sel.idx}` }), () => { sel = null; draw(); }) : null);

    clear(root,
      h('h2', { style: { marginBottom: '6px' } }, '🎨 Paletas de cores (CGRAM)'),
      h('div.fact', { style: { maxWidth: '900px', marginBottom: '18px' } },
        'O SNES guarda as cores numa memória chamada ', h('b', 'CGRAM'), ', com espaço para ', h('b', '256 cores'),
        '. Elas são divididas em paletas de 16. Cada tile e cada sprite escolhe ', h('b', 'uma'),
        ' paleta. Truque clássico: mudar uma cor da paleta muda na hora todos os desenhos que usam ela — é assim que os jogos faziam água piscando e inimigos de outra cor sem gastar mais memória!'),
      block('bg', 'Paletas de cenário (BG)', 'Usadas pelos tilesets. A paleta 0 é reservada: cor 0 = cor de fundo da cena, cores 1 e 2 = texto.'),
      block('obj', 'Paletas de sprites (OBJ)', 'Usadas pelos sprites. A cor 0 de cada paleta é sempre transparente.'));
  }
  draw();
  return { refresh() { if (!root.contains(document.activeElement) || document.activeElement.type !== 'range') draw(); } };
}
