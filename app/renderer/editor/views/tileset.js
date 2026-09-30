// Editor de tilesets: desenha a imagem inteira e marca propriedades de cada tile 8x8 (sólido, etiqueta).
import { h, clear, toast, modal } from '../../shared/ui.js';
import { pixelsFromHex, pixelsToHex, cutTile } from '../../../core/gfx/snes.js';
import { quantize } from '../../../core/gfx/quantize.js';
import { PixelEditor } from './pixel.js';
import { paletteWidget } from './palette-widget.js';
import { paletteRgb, decodeImage, indexedToImageData, canvasToPngBytes } from './common.js';

export const TAG_NAMES = ['nenhuma', '1 moeda/item', '2 perigo', '3 porta/saída', '4 água', '5 escada', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

export function mount(el, ctx, id) {
  const { store } = ctx;
  const ts = () => store.tileset(id);
  let propsMode = false;
  let selCell = 0;
  const cols = () => ts().w / 8;

  const editor = new PixelEditor({
    w: ts().w, h: ts().h,
    pixels: pixelsFromHex(ts().pixels, ts().w * ts().h),
    colors: () => paletteRgb(store.project, 'bg', ts().palette),
    tileGrid: 8,
    onCommit: (px) => store.change('tileset', () => { ts().pixels = pixelsToHex(px); }, { id }),
    overlay: (g, z) => {
      const t = ts();
      const c = cols();
      for (let i = 0; i < c * (t.h / 8); i++) {
        const x = (i % c) * 8 * z, y = Math.floor(i / c) * 8 * z;
        if (t.solid?.[i]) {
          g.fillStyle = propsMode ? 'rgba(229,72,77,0.38)' : 'rgba(229,72,77,0.14)';
          g.fillRect(x, y, 8 * z, 8 * z);
        }
        if (t.tags?.[i]) {
          g.fillStyle = '#ffd84a';
          g.font = `bold ${Math.max(9, z * 3)}px Segoe UI`;
          g.fillText(String(t.tags[i]), x + 2, y + Math.max(9, z * 3));
        }
        if (propsMode && z >= 3) {
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.font = `${Math.max(8, z * 2)}px Consolas`;
          g.fillText(String(i), x + 2, y + 8 * z - 3);
        }
      }
      if (propsMode) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.strokeRect((selCell % c) * 8 * z + 1, Math.floor(selCell / c) * 8 * z + 1, 8 * z - 2, 8 * z - 2);
        g.lineWidth = 1;
      }
    },
    onCellClick: ({ cx, cy, e }) => {
      if (!propsMode) return false;
      selCell = cy * cols() + cx;
      if (e.shiftKey) store.change('tileset', () => { const t = ts(); t.solid[selCell] = !t.solid[selCell]; }, { id });
      drawInspector();
      editor.redraw();
      return true;
    },
  });
  editor.cellMode = false;

  const pal = paletteWidget(ctx, {
    kind: 'bg', editor,
    getPalette: () => ts().palette,
    setPalette: (i) => store.change('tileset', () => { ts().palette = i; }, { id }),
  });
  const inspector = h('div.rsec');
  const sizeSec = h('div.rsec');
  const modeBtns = h('div.grp');

  const drawMode = () => clear(modeBtns,
    h('button.btn.small', { class: !propsMode ? 'active' : '', onclick: () => setMode(false) }, '🖌️ Desenhar'),
    h('button.btn.small', { class: propsMode ? 'active' : '', 'data-action': 'tile-props', onclick: () => setMode(true), title: 'Marcar tiles sólidos (colisão) e etiquetas' }, '🧱 Propriedades'));
  const setMode = (m) => { propsMode = m; editor.cellMode = m; drawMode(); drawInspector(); editor.redraw(); };

  el.append(h('div.col', { style: { flex: 1, minWidth: 0, gap: 0 } },
    editor.toolbar([modeBtns,
      h('button.btn.small', { onclick: importPng }, '📥 Importar PNG'),
      h('button.btn.small', { onclick: exportPng }, '📤 Exportar')]),
    h('div.row', { style: { flex: 1, minHeight: 0, gap: 0, alignItems: 'stretch' } }, editor.el,
      h('div.sidepanel', inspector, pal.el, sizeSec))));

  function uniqueTiles() {
    const t = ts();
    const px = pixelsFromHex(t.pixels, t.w * t.h);
    const set = new Set();
    for (let cy = 0; cy < t.h / 8; cy++) for (let cx = 0; cx < t.w / 8; cx++) set.add(cutTile(px, t.w, cx, cy).join(''));
    return set.size;
  }

  function drawInspector() {
    const t = ts();
    if (!propsMode) {
      clear(inspector, h('h3', 'Tileset'),
        h('p.hint', 'Um tileset é uma imagem cortada em pedaços de 8x8 pixels (tiles). Você monta os cenários encaixando esses pedaços no mapa da cena.'),
        h('p.hint', `${(t.w / 8) * (t.h / 8)} células · ${uniqueTiles()} tiles diferentes (tiles repetidos ocupam a VRAM só uma vez).`),
        h('button.btn.small', { onclick: () => setMode(true) }, '🧱 Marcar tiles sólidos'));
      return;
    }
    clear(inspector,
      h('h3', `Tile nº ${selCell}`),
      h('p.hint', 'Clique num tile para selecionar. Shift+clique liga/desliga "sólido" rapidinho.'),
      h('label.row', { style: { margin: '8px 0' } }, h('input', { type: 'checkbox', 'data-action': 'solid', checked: !!t.solid[selCell], onchange: (e) => store.change('tileset', () => { t.solid[selCell] = e.target.checked; }, { id }) }),
        h('b', 'Sólido'), h('span.hint', '(o herói não atravessa)')),
      h('label.field', 'Etiqueta', h('select', { onchange: (e) => store.change('tileset', () => { t.tags[selCell] = Number(e.target.value); }, { id }) },
        TAG_NAMES.map((n, i) => h('option', { value: i, selected: (t.tags[selCell] ?? 0) === i }, n)))),
      h('p.hint', { style: { marginTop: '8px' } }, 'No código: ', h('span.mono', 'solid(x, y)'), ' devolve 1 em tiles sólidos e ', h('span.mono', 'tiletag(x, y)'),
        ' devolve a etiqueta. Use ', h('span.mono', `tile(tx, ty) == ${selCell}`), ' para testar este tile e ', h('span.mono', `settile(tx, ty, ${selCell})`), ' para colocá-lo no mapa.'));
  }

  function drawSize() {
    const t = ts();
    const wSel = h('select', [8, 16, 32, 64, 128, 256].map((v) => h('option', { value: v, selected: v === t.w }, v)));
    const hSel = h('select', [8, 16, 32, 64, 128, 256].map((v) => h('option', { value: v, selected: v === t.h }, v)));
    clear(sizeSec, h('h3', 'Tamanho da imagem'),
      h('div.row', wSel, 'x', hSel, h('button.btn.small', { onclick: () => resize(Number(wSel.value), Number(hSel.value)) }, 'Aplicar')),
      h('p.hint', 'Aumentar mantém o desenho; diminuir corta a borda direita/de baixo.'));
  }

  function resize(nw, nh) {
    const t = ts();
    if (nw === t.w && nh === t.h) return;
    const src = pixelsFromHex(t.pixels, t.w * t.h);
    const out = new Uint8Array(nw * nh);
    for (let y = 0; y < Math.min(nh, t.h); y++) for (let x = 0; x < Math.min(nw, t.w); x++) out[y * nw + x] = src[y * t.w + x];
    const oc = t.w / 8, nc = nw / 8, nr = nh / 8;
    const solid = new Array(nc * nr).fill(false), tags = new Array(nc * nr).fill(0);
    for (let cy = 0; cy < Math.min(nr, t.h / 8); cy++) for (let cx = 0; cx < Math.min(nc, oc); cx++) { solid[cy * nc + cx] = !!t.solid[cy * oc + cx]; tags[cy * nc + cx] = t.tags[cy * oc + cx] ?? 0; }
    store.change('tileset', (p) => {
      // células do mapa usam o número da célula: remapeia para a nova largura
      for (const sc of p.scenes) for (const layer of [sc.bg1, sc.bg2]) {
        if (!layer || layer.tileset !== t.id) continue;
        layer.cells = layer.cells.map((c) => {
          if (c < 0) return c;
          const cx = c % oc, cy = Math.floor(c / oc);
          return cx < nc && cy < nr ? cy * nc + cx : -1;
        });
      }
      Object.assign(t, { w: nw, h: nh, pixels: pixelsToHex(out), solid, tags });
    }, { id });
    editor.setPixels(out, nw, nh);
    editor.fitZoom();
    drawSize();
  }

  async function importPng() {
    const files = await ctx.api.openFileDialog({ title: 'Importar imagem para o tileset', filters: [{ name: 'Imagens', extensions: ['png', 'gif', 'bmp', 'jpg'] }] });
    if (!files.length) return;
    const img = await decodeImage(files[0].data);
    const w = Math.min(256, Math.ceil(img.width / 8) * 8), hh = Math.min(256, Math.ceil(img.height / 8) * 8);
    const mode = await modal('Importar para o tileset', h('div.col',
      h('p', `Imagem ${img.width}x${img.height} → tileset ${w}x${hh} (${(w / 8) * (hh / 8)} células).`),
      img.width > 256 || img.height > 256 ? h('p', { style: { color: 'var(--yellow)' } }, 'A imagem é maior que 256x256 e será cortada.') : null,
      h('p.hint', 'Para uma tela de abertura (splash), use uma imagem de 256x224: depois, na cena, use "Carimbar tileset inteiro".')),
    [{ label: 'Cancelar' }, { label: 'Usar paleta atual', value: 'keep' }, { label: 'Cores novas na paleta', primary: true, value: 'new' }]);
    if (!mode) return;
    const crop = new Uint8ClampedArray(w * hh * 4);
    for (let y = 0; y < Math.min(hh, img.height); y++) for (let x = 0; x < Math.min(w, img.width); x++) for (let k = 0; k < 4; k++) crop[(y * w + x) * 4 + k] = img.data[(y * img.width + x) * 4 + k];
    const t = ts();
    const q = quantize(crop, w, hh, { palette: mode === 'keep' ? store.project.palettes.bg[t.palette] : null });
    if (q.reduced) toast('A imagem tinha mais de 15 cores: reduzi para 15 (4 bits por pixel).');
    const nc = w / 8, nr = hh / 8;
    store.change('tileset', (p) => {
      if (mode === 'new') p.palettes.bg[t.palette] = q.palette;
      Object.assign(t, { w, h: hh, pixels: pixelsToHex(q.pixels), solid: new Array(nc * nr).fill(false), tags: new Array(nc * nr).fill(0) });
    }, { id });
    editor.setPixels(q.pixels, w, hh);
    editor.fitZoom();
    drawSize();
    drawInspector();
  }

  async function exportPng() {
    const t = ts();
    const c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    c.getContext('2d').putImageData(indexedToImageData(pixelsFromHex(t.pixels, t.w * t.h), t.w, t.h, paletteRgb(store.project, 'bg', t.palette)), 0, 0);
    const p = await ctx.api.saveFileDialog({ defaultPath: `${t.name}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] }, await canvasToPngBytes(c));
    if (p) toast('Tileset exportado', 'ok');
  }

  drawMode();
  drawInspector();
  drawSize();
  requestAnimationFrame(() => editor.fitZoom());

  return {
    onShow: () => requestAnimationFrame(() => editor.redraw()),
    refresh() {
      const t = ts();
      if (!t) return;
      const px = pixelsFromHex(t.pixels, t.w * t.h);
      if (t.w !== editor.w || t.h !== editor.h) editor.setPixels(px, t.w, t.h);
      else if (px.some((v, i) => v !== editor.pixels[i])) editor.setPixels(px);
      else editor.redraw();
      pal.refresh();
      if (!inspector.contains(document.activeElement)) drawInspector();
    },
    reveal(opts) { if (opts?.props) setMode(true); },
  };
}
