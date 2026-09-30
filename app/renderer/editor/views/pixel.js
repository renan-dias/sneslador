// Editor de pixel art (estilo Aseprite) reaproveitado por sprites e tilesets.
import { h, clear } from '../../shared/ui.js';
import { indexedToImageData, line, floodFill, canvasPos, cssColor } from './common.js';

export const TOOLS = [
  { id: 'pencil', icon: '✏️', label: 'Lápis', key: 'b' },
  { id: 'eraser', icon: '🧽', label: 'Borracha', key: 'e' },
  { id: 'fill', icon: '🪣', label: 'Balde', key: 'g' },
  { id: 'line', icon: '📏', label: 'Linha', key: 'l' },
  { id: 'rect', icon: '▭', label: 'Retângulo (Shift = cheio)', key: 'u' },
  { id: 'ellipse', icon: '◯', label: 'Elipse (Shift = cheia)', key: 'o' },
  { id: 'picker', icon: '💧', label: 'Conta-gotas (ou Alt+clique)', key: 'i' },
  { id: 'move', icon: '✥', label: 'Mover desenho', key: 'm' },
];

export class PixelEditor {
  /**
   * @param {object} o
   * @param {number} o.w
   * @param {number} o.h
   * @param {Uint8Array} o.pixels  cópia de trabalho
   * @param {() => number[][]} o.colors
   * @param {(px: Uint8Array) => void} o.onCommit
   * @param {() => Uint8Array|null} [o.onion]
   * @param {number} [o.tileGrid]
   * @param {(g: CanvasRenderingContext2D, zoom: number) => void} [o.overlay]
   * @param {(info) => boolean} [o.onCellClick] se retornar true, consome o clique (modo propriedades)
   */
  constructor(o) {
    this.o = o;
    this.w = o.w;
    this.h = o.h;
    this.pixels = o.pixels;
    this.tool = 'pencil';
    this.primary = 1;
    this.secondary = 0;
    this.zoom = 8;
    this.grid = true;
    this.mirror = false;
    this.showOnion = true;
    this.hover = null;
    this.listeners = new Set();

    this.canvas = h('canvas', { tabIndex: 0 });
    this.wrap = h('div.canvasWrap', h('div', { style: { padding: '24px', display: 'inline-block', minWidth: '100%', minHeight: '100%', boxSizing: 'border-box' } }, this.canvas));
    this.el = this.wrap;
    this.base = document.createElement('canvas');
    this.bindEvents();
    this.resize();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this); }

  setPixels(px, w = this.w, h = this.h) {
    this.pixels = px;
    if (w !== this.w || h !== this.h) { this.w = w; this.h = h; this.resize(); }
    this.redraw();
  }

  setTool(t) { this.tool = t; this.emit(); this.canvas.focus(); }
  setColor(i, secondary = false) { if (secondary) this.secondary = i; else this.primary = i; this.emit(); }

  fitZoom() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width) return;
    const z = Math.floor(Math.min((r.width - 60) / this.w, (r.height - 60) / this.h));
    this.setZoom(Math.max(1, Math.min(40, z)));
  }

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(48, z));
    this.resize();
    this.emit();
  }

  resize() {
    this.canvas.width = this.w * this.zoom;
    this.canvas.height = this.h * this.zoom;
    this.base.width = this.w;
    this.base.height = this.h;
    this.redraw();
  }

  redraw(preview = null) {
    const g = this.canvas.getContext('2d');
    const z = this.zoom;
    const colors = this.o.colors();
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bg = this.base.getContext('2d');
    // onion skin (quadro anterior bem clarinho)
    const onion = this.showOnion ? this.o.onion?.() : null;
    if (onion) {
      bg.putImageData(indexedToImageData(onion, this.w, this.h, colors), 0, 0);
      g.globalAlpha = 0.28;
      g.drawImage(this.base, 0, 0, this.w * z, this.h * z);
      g.globalAlpha = 1;
    }
    bg.putImageData(indexedToImageData(preview ?? this.pixels, this.w, this.h, colors), 0, 0);
    g.drawImage(this.base, 0, 0, this.w * z, this.h * z);

    if (this.grid && z >= 6) {
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < this.w; x++) { g.moveTo(x * z + 0.5, 0); g.lineTo(x * z + 0.5, this.h * z); }
      for (let y = 1; y < this.h; y++) { g.moveTo(0, y * z + 0.5); g.lineTo(this.w * z, y * z + 0.5); }
      g.stroke();
    }
    const tg = this.o.tileGrid ?? 8;
    if (this.grid && tg) {
      g.strokeStyle = 'rgba(124,92,255,0.55)';
      g.beginPath();
      for (let x = tg; x < this.w; x += tg) { g.moveTo(x * z + 0.5, 0); g.lineTo(x * z + 0.5, this.h * z); }
      for (let y = tg; y < this.h; y += tg) { g.moveTo(0, y * z + 0.5); g.lineTo(this.w * z, y * z + 0.5); }
      g.stroke();
    }
    this.o.overlay?.(g, z);
    if (this.hover && this.tool !== 'move' && !this.cellMode) {
      const c = colors[this.primary];
      g.strokeStyle = '#fff';
      g.fillStyle = this.primary && c ? cssColor(c) : 'rgba(0,0,0,0.3)';
      g.globalAlpha = 0.6;
      g.fillRect(this.hover.x * z, this.hover.y * z, z, z);
      g.globalAlpha = 1;
      g.strokeRect(this.hover.x * z + 0.5, this.hover.y * z + 0.5, z - 1, z - 1);
      if (this.mirror) g.strokeRect((this.w - 1 - this.hover.x) * z + 0.5, this.hover.y * z + 0.5, z - 1, z - 1);
    }
  }

  inside(p) { return p.x >= 0 && p.y >= 0 && p.x < this.w && p.y < this.h; }

  plot(px, x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    px[y * this.w + x] = v;
    if (this.mirror) px[y * this.w + (this.w - 1 - x)] = v;
  }

  bindEvents() {
    let drag = null;
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      c.focus();
      const p = canvasPos(c, e, this.zoom);
      if (!this.inside(p)) return;
      if (this.o.onCellClick && this.o.onCellClick({ x: p.x, y: p.y, cx: Math.floor(p.x / 8), cy: Math.floor(p.y / 8), e })) return;
      const color = e.button === 2 ? this.secondary : this.primary;
      let tool = this.tool;
      if (e.altKey || tool === 'picker') {
        const v = this.pixels[p.y * this.w + p.x];
        this.setColor(v, e.button === 2);
        return;
      }
      if (tool === 'eraser') tool = 'pencil';
      const value = this.tool === 'eraser' ? 0 : color;
      drag = { tool, start: p, last: p, value, orig: this.pixels.slice(), shift: e.shiftKey };
      if (tool === 'pencil') { this.plot(this.pixels, p.x, p.y, value); this.redraw(); }
      if (tool === 'fill') {
        floodFill(this.pixels, this.w, this.h, p.x, p.y, value);
        if (this.mirror) floodFill(this.pixels, this.w, this.h, this.w - 1 - p.x, p.y, value);
        this.redraw();
      }
    });
    c.addEventListener('mousemove', (e) => {
      const p = canvasPos(c, e, this.zoom);
      this.hover = this.inside(p) ? p : null;
      if (!drag) { this.redraw(); this.o.onHover?.(this.hover); return; }
      drag.shift = e.shiftKey;
      if (drag.tool === 'pencil') {
        line(drag.last.x, drag.last.y, p.x, p.y, (x, y) => this.plot(this.pixels, x, y, drag.value));
        drag.last = p;
        this.redraw();
      } else if (['line', 'rect', 'ellipse', 'move'].includes(drag.tool)) {
        drag.last = p;
        this.redraw(this.shapePreview(drag));
      }
    });
    const finish = () => {
      if (!drag) return;
      if (['line', 'rect', 'ellipse', 'move'].includes(drag.tool)) this.pixels.set(this.shapePreview(drag));
      drag = null;
      this.redraw();
      this.o.onCommit(this.pixels.slice());
    };
    window.addEventListener('mouseup', finish);
    c.addEventListener('mouseleave', () => { this.hover = null; this.redraw(); this.o.onHover?.(null); });
    this.wrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.altKey) return;
      e.preventDefault();
      this.setZoom(this.zoom + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    c.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) { this.setTool(t.id); e.preventDefault(); }
      if (e.key === '+' || e.key === '=') this.setZoom(this.zoom + 1);
      if (e.key === '-') this.setZoom(this.zoom - 1);
      if (e.key === 'x') { [this.primary, this.secondary] = [this.secondary, this.primary]; this.emit(); }
    });
  }

  shapePreview(d) {
    const out = d.orig.slice();
    const { start: a, last: b } = d;
    if (d.tool === 'line') line(a.x, a.y, b.x, b.y, (x, y) => this.plot(out, x, y, d.value));
    if (d.tool === 'rect') {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d.shift || x === x0 || x === x1 || y === y0 || y === y1) this.plot(out, x, y, d.value);
    }
    if (d.tool === 'ellipse') {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2 + 0.5, ry = Math.abs(b.y - a.y) / 2 + 0.5;
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          const inner = ((x - cx) / (rx - 1)) ** 2 + ((y - cy) / (ry - 1)) ** 2;
          if (v <= 1 && (d.shift || inner > 1 || rx <= 1 || ry <= 1)) this.plot(out, x, y, d.value);
        }
      }
    }
    if (d.tool === 'move') {
      const dx = b.x - a.x, dy = b.y - a.y;
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const sx = (x - dx + this.w * 8) % this.w, sy = (y - dy + this.h * 8) % this.h;
          out[y * this.w + x] = d.orig[sy * this.w + sx];
        }
      }
    }
    return out;
  }

  // transformações do quadro inteiro
  transform(kind) {
    const src = this.pixels.slice();
    const { w, h: hh } = this;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        if (kind === 'flipx') v = src[y * w + (w - 1 - x)];
        else if (kind === 'flipy') v = src[(hh - 1 - y) * w + x];
        else if (kind === 'rot' && w === hh) v = src[(w - 1 - x) * w + y];
        else if (kind === 'clear') v = 0;
        else v = src[y * w + x];
        this.pixels[y * w + x] = v;
      }
    }
    this.redraw();
    this.o.onCommit(this.pixels.slice());
  }

  /** Barra de ferramentas padrão. */
  toolbar(extra = []) {
    const bar = h('div.toolbar');
    const draw = () => clear(bar,
      h('div.grp', TOOLS.map((t) => h('button.btn.icon', { class: this.tool === t.id ? 'active' : '', title: `${t.label} (${t.key.toUpperCase()})`, 'data-tool': t.id, onclick: () => this.setTool(t.id) }, t.icon))),
      h('div.sep'),
      h('button.btn.small', { class: this.mirror ? 'active' : '', title: 'Desenhar espelhado na horizontal', onclick: () => { this.mirror = !this.mirror; this.emit(); } }, '⇋ Espelho'),
      h('button.btn.small', { class: this.grid ? 'active' : '', onclick: () => { this.grid = !this.grid; this.redraw(); this.emit(); } }, '# Grade'),
      this.o.onion ? h('button.btn.small', { class: this.showOnion ? 'active' : '', title: 'Mostrar o quadro anterior transparente (onion skin)', onclick: () => { this.showOnion = !this.showOnion; this.redraw(); this.emit(); } }, '🧅 Onion') : null,
      h('div.sep'),
      h('button.btn.small', { title: 'Inverter na horizontal', onclick: () => this.transform('flipx') }, '↔'),
      h('button.btn.small', { title: 'Inverter na vertical', onclick: () => this.transform('flipy') }, '↕'),
      this.w === this.h ? h('button.btn.small', { title: 'Girar 90°', onclick: () => this.transform('rot') }, '⟳') : null,
      h('div.sep'),
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom - 1) }, '−'),
      h('span.hint', `${this.zoom}x`),
      h('button.btn.small', { onclick: () => this.setZoom(this.zoom + 1) }, '+'),
      h('button.btn.small', { onclick: () => this.fitZoom() }, 'Ajustar'),
      h('div.spacer'),
      extra);
    draw();
    this.on(draw);
    return bar;
  }
}
