// Editor de cena: pinta o mapa (BG1 = cenário com colisão, BG2 = fundo decorativo) com tiles do tileset.
import { h, clear, toast } from '../../shared/ui.js';
import { bgr555ToHex, hexToBgr555 } from '../../../core/gfx/snes.js';
import { tilesetCanvas, canvasPos, floodFill } from './common.js';
import { colorEditor } from './palette-widget.js';

const TOOLS = [
  { id: 'pencil', icon: '✏️', label: 'Pincel (B)', key: 'b' },
  { id: 'rect', icon: '▭', label: 'Retângulo cheio (U)', key: 'u' },
  { id: 'fill', icon: '🪣', label: 'Balde (G)', key: 'g' },
  { id: 'eraser', icon: '🧽', label: 'Borracha (E)', key: 'e' },
  { id: 'picker', icon: '💧', label: 'Conta-gotas (I)', key: 'i' },
];

export function mount(el, ctx, id) {
  const { store } = ctx;
  const sc = () => store.scene(id);
  let layerKey = 'bg1';
  let tool = 'pencil';
  let zoom = 2;
  let brush = { x: 0, y: 0, w: 1, h: 1 }; // em células do tileset
  let showGrid = true, showSolid = true, showOther = true, showScreen = true;
  let tsCache = new Map();
  let hover = null;
  let editingColor = false;

  const layer = () => sc()[layerKey];
  const tsOf = (l) => (l?.tileset ? store.tileset(l.tileset) : null);
  const tsImg = (ts) => {
    const key = ts.id + ':' + ts.pixels.length + ':' + hashStr(ts.pixels) + ':' + store.project.palettes.bg[ts.palette].join(',');
    let c = tsCache.get(ts.id);
    if (!c || c.key !== key) { c = { key, canvas: tilesetCanvas(ts, store.project) }; tsCache.set(ts.id, c); }
    return c.canvas;
  };

  const canvas = h('canvas', { tabIndex: 0 });
  const wrap = h('div.canvasWrap', h('div', { style: { padding: '20px', display: 'inline-block' } }, canvas));
  const toolbar = h('div.toolbar');
  const side = h('div.sidepanel');
  const status = h('span.hint');
  el.append(h('div.col', { style: { flex: 1, minWidth: 0, gap: 0 } }, toolbar,
    h('div.row', { style: { flex: 1, minHeight: 0, gap: 0, alignItems: 'stretch' } }, wrap, side)));

  // ---------------------------------------------------------------- toolbar
  function drawToolbar() {
    const s = sc();
    clear(toolbar,
      h('div.grp',
        h('button.btn.small', { class: layerKey === 'bg1' ? 'active' : '', 'data-action': 'layer-bg1', onclick: () => { layerKey = 'bg1'; drawAll(); } }, 'BG1 · cenário'),
        h('button.btn.small', { class: layerKey === 'bg2' ? 'active' : '', 'data-action': 'layer-bg2', onclick: () => { layerKey = 'bg2'; drawAll(); } }, 'BG2 · fundo')),
      h('div.sep'),
      h('div.grp', TOOLS.map((t) => h('button.btn.icon', { class: tool === t.id ? 'active' : '', title: t.label, onclick: () => { tool = t.id; drawToolbar(); } }, t.icon))),
      h('div.sep'),
      h('button.btn.small', { class: showGrid ? 'active' : '', onclick: () => { showGrid = !showGrid; drawToolbar(); render(); } }, '# Grade'),
      h('button.btn.small', { class: showSolid ? 'active' : '', title: 'Mostrar tiles sólidos em vermelho', onclick: () => { showSolid = !showSolid; drawToolbar(); render(); } }, '🧱 Colisão'),
      h('button.btn.small', { class: showScreen ? 'active' : '', title: 'Mostrar a área visível da TV (256x224)', onclick: () => { showScreen = !showScreen; drawToolbar(); render(); } }, '📺 Tela'),
      h('button.btn.small', { class: showOther ? 'active' : '', title: 'Mostrar a outra camada', onclick: () => { showOther = !showOther; drawToolbar(); render(); } }, '👁 Outra camada'),
      h('div.sep'),
      h('button.btn.small', { onclick: () => setZoom(zoom - 1) }, '−'), h('span.hint', `${zoom}x`), h('button.btn.small', { onclick: () => setZoom(zoom + 1) }, '+'),
      h('div.spacer'),
      status,
      h('button.btn.small', { onclick: () => ctx.openTab('code', id) }, `📜 ${s.name}.sns`),
      h('button.btn.small.primary', { onclick: () => ctx.showPlay() }, '▶ Jogar'));
  }

  function setZoom(z) { zoom = Math.max(1, Math.min(6, z)); drawToolbar(); render(); }

  // ---------------------------------------------------------------- render do mapa
  function render(preview = null) {
    const s = sc();
    const l1 = s.bg1, l2 = s.bg2;
    const mw = Math.max(l1?.w ?? 32, l2?.w ?? 32), mh = 32;
    canvas.width = mw * 8 * zoom;
    canvas.height = mh * 8 * zoom;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = bgr555ToHex(s.bgcolor);
    g.fillRect(0, 0, canvas.width, canvas.height);
    const drawLayer = (l, alpha, cellsOverride) => {
      const ts = tsOf(l);
      if (!l || !ts) return;
      const img = tsImg(ts);
      const cols = ts.w / 8;
      const cells = cellsOverride ?? l.cells;
      g.globalAlpha = alpha;
      for (let y = 0; y < l.h; y++) {
        for (let x = 0; x < l.w; x++) {
          const c = cells[y * l.w + x];
          if (c < 0 || c === undefined) continue;
          g.drawImage(img, (c % cols) * 8, Math.floor(c / cols) * 8, 8, 8, x * 8 * zoom, y * 8 * zoom, 8 * zoom, 8 * zoom);
        }
      }
      g.globalAlpha = 1;
    };
    const other = layerKey === 'bg1' ? 'bg2' : 'bg1';
    // BG2 fica atrás do BG1 (como no SNES)
    if (layerKey === 'bg1') { if (showOther) drawLayer(l2, 0.55); drawLayer(l1, 1, preview); }
    else { drawLayer(l2, 1, preview); if (showOther) drawLayer(l1, 0.35); }
    void other;

    // colisão
    const ts1 = tsOf(l1);
    if (showSolid && l1 && ts1) {
      g.fillStyle = 'rgba(229,72,77,0.35)';
      const cells = layerKey === 'bg1' && preview ? preview : l1.cells;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c >= 0 && ts1.solid?.[c]) g.fillRect((i % l1.w) * 8 * zoom, Math.floor(i / l1.w) * 8 * zoom, 8 * zoom, 8 * zoom);
      }
    }
    if (showGrid && zoom >= 2) {
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.beginPath();
      for (let x = 1; x < mw; x++) { g.moveTo(x * 8 * zoom + 0.5, 0); g.lineTo(x * 8 * zoom + 0.5, canvas.height); }
      for (let y = 1; y < mh; y++) { g.moveTo(0, y * 8 * zoom + 0.5); g.lineTo(canvas.width, y * 8 * zoom + 0.5); }
      g.stroke();
    }
    if (showScreen) {
      g.strokeStyle = 'rgba(245,197,66,0.9)';
      g.setLineDash([6, 4]);
      g.lineWidth = 2;
      g.strokeRect(1, 1, 256 * zoom - 2, 224 * zoom - 2);
      g.setLineDash([]);
      g.lineWidth = 1;
      g.fillStyle = 'rgba(245,197,66,0.9)';
      g.font = '12px Segoe UI';
      g.fillText('tela 256x224 (scroll 0,0)', 6, 224 * zoom - 6);
    }
    // cursor do pincel
    if (hover && tool !== 'picker') {
      const bw = tool === 'pencil' ? brush.w : 1, bh = tool === 'pencil' ? brush.h : 1;
      g.strokeStyle = tool === 'eraser' ? '#ff6b6b' : '#fff';
      g.lineWidth = 2;
      g.strokeRect(hover.x * 8 * zoom, hover.y * 8 * zoom, bw * 8 * zoom, bh * 8 * zoom);
      g.lineWidth = 1;
    }
  }

  // ---------------------------------------------------------------- pintura
  let drag = null;
  const cellAt = (e) => { const p = canvasPos(canvas, e, 8 * zoom); return p; };

  function paint(cells, l, x, y, erase) {
    const ts = tsOf(l);
    if (!ts) return;
    const cols = ts.w / 8;
    const bw = erase ? 1 : brush.w, bh = erase ? 1 : brush.h;
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const mx = x + dx, my = y + dy;
        if (mx < 0 || my < 0 || mx >= l.w || my >= l.h) continue;
        cells[my * l.w + mx] = erase ? -1 : (brush.y + dy) * cols + brush.x + dx;
      }
    }
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const l = layer();
    if (!l) { toast(layerKey === 'bg2' ? 'Ative a camada BG2 no painel à direita primeiro.' : 'Escolha um tileset para a camada.', 'err'); return; }
    if (!tsOf(l)) { toast('Escolha um tileset para esta camada no painel à direita.', 'err'); return; }
    const p = cellAt(e);
    if (p.x < 0 || p.y < 0 || p.x >= l.w || p.y >= l.h) return;
    const ts = tsOf(l);
    const cols = ts.w / 8;
    if (tool === 'picker' || e.altKey) {
      const c = l.cells[p.y * l.w + p.x];
      if (c >= 0) { brush = { x: c % cols, y: Math.floor(c / cols), w: 1, h: 1 }; tool = 'pencil'; drawToolbar(); drawSide(); }
      return;
    }
    const erase = tool === 'eraser' || e.button === 2;
    const cells = l.cells.slice();
    drag = { cells, start: p, erase };
    if (tool === 'fill') {
      const brushCell = brush.y * cols + brush.x;
      const tmp = Int32Array.from(cells);
      floodFill(tmp, l.w, l.h, p.x, p.y, erase ? -1 : brushCell);
      commit(Array.from(tmp));
      drag = null;
      return;
    }
    if (tool === 'pencil' || tool === 'eraser') paint(cells, l, p.x, p.y, erase);
    render(cells);
  });
  canvas.addEventListener('mousemove', (e) => {
    const p = cellAt(e);
    hover = p;
    const l = layer();
    const ts = tsOf(l);
    status.textContent = l && p.x >= 0 && p.y >= 0 && p.x < l.w && p.y < l.h
      ? `coluna ${p.x}, linha ${p.y} · pixel (${p.x * 8}, ${p.y * 8})${ts ? ` · tile ${l.cells[p.y * l.w + p.x]}` : ''}`
      : '';
    if (!drag) { render(); return; }
    if (tool === 'pencil' || tool === 'eraser') {
      paint(drag.cells, l, p.x, p.y, drag.erase);
      render(drag.cells);
    } else if (tool === 'rect') {
      const cells = l.cells.slice();
      const x0 = Math.min(drag.start.x, p.x), x1 = Math.max(drag.start.x, p.x), y0 = Math.min(drag.start.y, p.y), y1 = Math.max(drag.start.y, p.y);
      const cols = ts.w / 8;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (x >= l.w || y >= l.h) continue;
        cells[y * l.w + x] = drag.erase ? -1 : (brush.y + ((y - y0) % brush.h)) * cols + brush.x + ((x - x0) % brush.w);
      }
      drag.cells = cells;
      render(cells);
    }
  });
  const up = () => { if (drag) { commit(drag.cells); drag = null; } };
  window.addEventListener('mouseup', up);
  canvas.addEventListener('mouseleave', () => { hover = null; if (!drag) render(); });

  function commit(cells) {
    store.change('scene', () => { layer().cells = cells; }, { id });
  }

  // ---------------------------------------------------------------- painel lateral
  function drawSide() {
    const s = sc();
    const l = layer();
    const ts = tsOf(l);
    const tsSel = (lay, key) => h('select', { 'data-action': `tileset-${key}`, onchange: (e) => store.change('scene', () => { lay.tileset = e.target.value || null; }, { id }) },
      h('option', { value: '' }, '(nenhum)'),
      store.project.tilesets.map((t) => h('option', { value: t.id, selected: lay.tileset === t.id }, `${t.name} (paleta ${t.palette})`)));

    const picker = h('div', { style: { position: 'relative', display: 'inline-block', marginTop: '6px', cursor: 'crosshair' } });
    if (ts) {
      const img = tsImg(ts);
      const z = Math.max(1, Math.ceil(250 / ts.w));
      const pc = h('canvas', { width: ts.w * z, height: ts.h * z, 'data-action': 'tile-picker', style: { width: '250px', imageRendering: 'pixelated' } });
      const cellAtPicker = (e) => { const r = pc.getBoundingClientRect(); const cs = r.width / (ts.w / 8); return { x: Math.floor((e.clientX - r.left) / cs), y: Math.floor((e.clientY - r.top) / cs) }; };
      const pg = pc.getContext('2d');
      pg.imageSmoothingEnabled = false;
      pg.fillStyle = '#0b0b14';
      pg.fillRect(0, 0, pc.width, pc.height);
      pg.drawImage(img, 0, 0, ts.w * z, ts.h * z);
      pg.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let x = 8; x < ts.w; x += 8) { pg.beginPath(); pg.moveTo(x * z + 0.5, 0); pg.lineTo(x * z + 0.5, pc.height); pg.stroke(); }
      for (let y = 8; y < ts.h; y += 8) { pg.beginPath(); pg.moveTo(0, y * z + 0.5); pg.lineTo(pc.width, y * z + 0.5); pg.stroke(); }
      pg.strokeStyle = '#fff';
      pg.lineWidth = 2;
      pg.strokeRect(brush.x * 8 * z + 1, brush.y * 8 * z + 1, brush.w * 8 * z - 2, brush.h * 8 * z - 2);
      let sel = null;
      pc.onmousedown = (e) => { const p = cellAtPicker(e); sel = p; brush = { x: p.x, y: p.y, w: 1, h: 1 }; if (tool !== 'rect' && tool !== 'fill') tool = 'pencil'; drawToolbar(); drawSide(); };
      pc.onmousemove = (e) => {
        if (!sel || !(e.buttons & 1)) return;
        const p = cellAtPicker(e);
        const x0 = Math.max(0, Math.min(sel.x, p.x)), y0 = Math.max(0, Math.min(sel.y, p.y));
        const x1 = Math.min(ts.w / 8 - 1, Math.max(sel.x, p.x)), y1 = Math.min(ts.h / 8 - 1, Math.max(sel.y, p.y));
        brush = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        pg.drawImage(img, 0, 0, ts.w * z, ts.h * z);
        pg.strokeRect(brush.x * 8 * z + 1, brush.y * 8 * z + 1, brush.w * 8 * z - 2, brush.h * 8 * z - 2);
      };
      picker.append(pc);
    }

    clear(side,
      h('div.rsec',
        h('h3', layerKey === 'bg1' ? 'Camada BG1 — cenário' : 'Camada BG2 — fundo'),
        layerKey === 'bg2' && !s.bg2
          ? [h('p.hint', 'O BG2 é uma segunda camada atrás do cenário: céu, montanhas, nuvens... Ela pode rolar mais devagar (parallax) para dar profundidade.'),
            h('button.btn.primary', { 'data-action': 'enable-bg2', onclick: () => store.change('scene', () => { sc().bg2 = { tileset: store.project.tilesets[0]?.id ?? null, w: 32, h: 32, cells: new Array(1024).fill(-1), parallax: 4 }; }, { id }) }, 'Ativar BG2')]
          : [
            h('label.field', 'Tileset', tsSel(l, layerKey)),
            layerKey === 'bg1' ? h('label.field', { style: { marginTop: '6px' } }, 'Largura do mapa', h('select', { onchange: (e) => resizeMap(Number(e.target.value)) },
              [32, 64].map((w) => h('option', { value: w, selected: l.w === w }, `${w} tiles (${w * 8} px${w === 32 ? ', 1 tela' : ', 2 telas'})`)))) : null,
            layerKey === 'bg2' ? h('div.slider', { style: { marginTop: '6px' } }, h('span', 'Parallax'), h('input', { type: 'range', min: 0, max: 8, value: l.parallax ?? 4, oninput: (e) => store.change('scene', () => { l.parallax = Number(e.target.value); }, { id, coalesce: 'parallax' }) }), h('span.mono', `${l.parallax ?? 4}/8`)) : null,
            layerKey === 'bg2' ? h('p.hint', 'Parallax 4/8 = o fundo anda na metade da velocidade do cenário.') : null,
            ts ? [h('div.hint', { style: { marginTop: '10px' } }, 'Clique ou arraste para escolher o pincel:'), picker,
              h('div.row', { style: { marginTop: '6px', flexWrap: 'wrap' } },
                h('button.btn.small', { title: 'Coloca o tileset inteiro no mapa a partir do canto (ótimo para telas de abertura)', 'data-action': 'stamp', onclick: stampAll }, '🖼️ Carimbar tileset inteiro'),
                h('button.btn.small', { onclick: () => ctx.openTab('tileset', ts.id) }, '✏️ Editar tileset'),
                h('button.btn.small.danger', { onclick: () => store.change('scene', () => { l.cells = l.cells.map(() => -1); }, { id }) }, 'Limpar'))]
              : h('p.hint', 'Escolha um tileset acima.'),
            layerKey === 'bg2' ? h('button.btn.small.danger', { style: { marginTop: '8px' }, onclick: () => { store.change('scene', () => { sc().bg2 = null; }, { id }); } }, 'Desativar BG2') : null,
          ]),
      h('div.rsec',
        h('h3', 'Cena'),
        h('div.row', h('b.grow', s.name), store.project.startScene === s.id ? h('span.badge.ok', '⭐ cena inicial')
          : h('button.btn.small', { onclick: () => store.change('scene', (p) => { p.startScene = s.id; }, { id }) }, 'Tornar inicial')),
        h('div.row', { style: { marginTop: '8px' } }, h('span', 'Cor de fundo'),
          h('div', { style: { width: '28px', height: '22px', borderRadius: '5px', background: bgr555ToHex(s.bgcolor), border: '1px solid #fff4', cursor: 'pointer' }, onclick: () => { editingColor = !editingColor; drawSide(); } }),
          h('span.hint', '(cor 0 da CGRAM)')),
        editingColor ? colorEditor(s.bgcolor, (v) => store.change('scene', () => { sc().bgcolor = v; }, { id, coalesce: 'bgcolor' }), () => { editingColor = false; drawSide(); }) : null),
      h('div.rsec', h('h3', 'Dicas'),
        h('p.hint', 'Botão direito apaga. Alt+clique copia um tile do mapa. Arraste no tileset para um pincel de vários tiles.'),
        h('p.hint', 'No SNES o mapa do BG1 tem 32 ou 64 colunas por 32 linhas. A tela mostra 32x28 tiles por vez; use scroll(x, y) no código para mover a câmera.')));
    void hexToBgr555;
  }

  function resizeMap(w) {
    store.change('scene', () => {
      const l = sc().bg1;
      const out = new Array(w * 32).fill(-1);
      for (let y = 0; y < 32; y++) for (let x = 0; x < Math.min(w, l.w); x++) out[y * w + x] = l.cells[y * l.w + x];
      l.w = w;
      l.cells = out;
    }, { id });
  }

  function stampAll() {
    const l = layer();
    const ts = tsOf(l);
    const cols = ts.w / 8, rows = ts.h / 8;
    store.change('scene', () => {
      for (let y = 0; y < Math.min(rows, l.h); y++) for (let x = 0; x < Math.min(cols, l.w); x++) l.cells[y * l.w + x] = y * cols + x;
    }, { id });
    toast('Tileset carimbado no mapa', 'ok');
  }

  canvas.addEventListener('keydown', (e) => {
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (t && !e.ctrlKey) { tool = t.id; drawToolbar(); }
  });

  function drawAll() { drawToolbar(); drawSide(); render(); }
  drawAll();
  // zoom inicial: o mapa ocupa bem a área disponível
  requestAnimationFrame(() => {
    const r = wrap.getBoundingClientRect();
    const mw = (sc().bg1?.w ?? 32) * 8;
    if (r.width) setZoom(Math.max(1, Math.min(4, Math.floor(Math.min((r.width - 40) / mw, (r.height - 40) / 256)))));
  });

  return {
    onShow: () => render(),
    refresh() {
      if (!sc()) return;
      drawToolbar();
      if (!side.contains(document.activeElement) || document.activeElement.type !== 'range') drawSide();
      render();
    },
    dispose() { window.removeEventListener('mouseup', up); },
  };
}

function hashStr(s) {
  let x = 0;
  for (let i = 0; i < s.length; i += 7) x = (x * 31 + s.charCodeAt(i)) | 0;
  return x;
}
