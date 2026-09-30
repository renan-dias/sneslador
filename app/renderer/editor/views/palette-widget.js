// Seletor de paleta + amostras de cor + editor de cor de 15 bits (5 bits por canal).
import { h, clear } from '../../shared/ui.js';
import { bgr555ToRgb, bgr555ToHex, hexToBgr555 } from '../../../core/gfx/snes.js';

/**
 * @param {object} ctx  contexto do editor
 * @param {object} o
 * @param {'bg'|'obj'} o.kind
 * @param {() => number} o.getPalette   índice da paleta usada pelo asset
 * @param {(i:number) => void} o.setPalette
 * @param {import('./pixel.js').PixelEditor} o.editor
 */
export function paletteWidget(ctx, o) {
  const { store } = ctx;
  const el = h('div.rsec');
  let editing = null;

  const draw = () => {
    const p = store.project;
    const palIdx = o.getPalette();
    const pal = p.palettes[o.kind][palIdx];
    const first = o.kind === 'bg' ? 1 : 0;
    const palButtons = [];
    for (let i = first; i < 8; i++) {
      palButtons.push(h('button.btn.small', { class: i === palIdx ? 'active' : '', title: `Paleta ${i}`, onclick: () => o.setPalette(i) }, String(i)));
    }
    clear(el,
      h('h3', o.kind === 'bg' ? 'Paleta de cenário' : 'Paleta de sprite'),
      h('div.row', { style: { gap: '2px', marginBottom: '8px', flexWrap: 'wrap' } }, palButtons),
      h('div.swatches', pal.map((c, i) => {
        const sw = h('div.swatch', {
          class: `${i === 0 ? 'transp' : ''} ${o.editor.primary === i ? 'sel' : ''}`,
          style: { background: bgr555ToHex(c), outline: o.editor.secondary === i ? '2px dashed #aaa' : '' },
          title: i === 0 ? 'Cor 0 = transparente' : `Cor ${i} — clique: cor principal · botão direito: secundária · duplo clique: editar`,
          onclick: () => { o.editor.setColor(i); },
          oncontextmenu: (e) => { e.preventDefault(); o.editor.setColor(i, true); },
          ondblclick: () => { if (i) { editing = i; draw(); } },
        }, h('span.n', i));
        return sw;
      })),
      h('p.hint', { style: { marginTop: '6px' } }, '4 bits por pixel = 16 cores. A cor 0 é sempre transparente. Duplo clique numa cor para editar.'),
      editing ? colorEditor(pal[editing], (v) => {
        store.change('palette', (pr) => { pr.palettes[o.kind][palIdx][editing] = v; }, { coalesce: `pal-${o.kind}-${palIdx}-${editing}` });
      }, () => { editing = null; draw(); }) : null,
    );
  };
  o.editor.on(draw);
  draw();
  return { el, refresh: draw };
}

export function colorEditor(value, onChange, onClose) {
  let v = value;
  const rgb = () => [v & 31, (v >> 5) & 31, (v >> 10) & 31];
  const box = h('div', { style: { marginTop: '10px', padding: '10px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' } });
  const draw = () => {
    const [r, g, b] = rgb();
    const hex = bgr555ToHex(v);
    const hexInput = h('input', { type: 'text', value: hex, style: { width: '84px' }, onchange: (e) => { if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) { v = hexToBgr555(e.target.value); onChange(v); draw(); } } });
    const slider = (label, val, shift, color) => h('div.slider', h('span', { style: { color } }, label),
      h('input', { type: 'range', min: 0, max: 31, value: val, oninput: (e) => { v = (v & ~(31 << shift)) | (Number(e.target.value) << shift); onChange(v); draw(); } }),
      h('span.mono', String(val)));
    clear(box,
      h('div.row', h('div', { style: { width: '34px', height: '34px', borderRadius: '6px', background: hex, border: '1px solid #fff4' } }), hexInput,
        h('span.hint.mono', `$${v.toString(16).padStart(4, '0').toUpperCase()}`), h('div.spacer'), h('button.btn.small', { onclick: onClose }, 'OK')),
      slider('Vermelho', r, 0, '#ff8080'),
      slider('Verde', g, 5, '#80ff80'),
      slider('Azul', b, 10, '#80a0ff'),
      h('p.hint', 'Cada canal tem 5 bits (0 a 31): 32 x 32 x 32 = 32.768 cores. O valor em $ é como a cor fica gravada na CGRAM.'));
    void bgr555ToRgb;
  };
  draw();
  return box;
}
