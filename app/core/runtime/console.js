// Console virtual: roda o jogo no editor (live view) imitando o SNES em Mode 1.
// Usa os MESMOS dados binários da ROM (tiles 4bpp, mapas, CGRAM) e a mesma lógica do runtime C.
import { decodeTile4bpp, decodeTile2bpp, bgr555ToRgb, mapAddr } from '../gfx/snes.js';
import { instantiate } from '../lang/compiler.js';

export const W = 256;
export const H = 224;
const NO_SCENE = -1;
const FADE_STEPS = [0, 3, 6, 9, 12, 15];
const MAX_LOOP = 200000;
const MAX_SPRITES_PER_LINE = 32;

export class VirtualSNES {
  /**
   * @param {object} data   resultado de buildGameData()
   * @param {string} code   JS gerado por compileGame()
   * @param {object} hooks  { onSfx(i), onMusic(i|-1), onError({msg,line,file}), onWarn(msg) }
   * @param {object} opts   { startScene } para reiniciar direto numa cena (hot reload)
   */
  constructor(data, code, hooks = {}, opts = {}) {
    this.data = data;
    this.hooks = hooks;
    this.pixels = new Uint32Array(W * H);
    this.layers = { bg1: true, bg2: true, bg3: true, obj: true };
    this.cgram = Uint16Array.from(data.cgram);
    this.rgb = new Uint32Array(256);
    for (let i = 0; i < 256; i++) this.updateColor(i);

    this.objTiles = decodeAll(data.objTiles, 32, decodeTile4bpp);
    this.fontTiles = decodeAll(data.fontTiles, 16, decodeTile2bpp);
    this.bgTiles = [];

    this.oam = Array.from({ length: 128 }, () => ({ x: 0, y: 0, tile: 0, large: 0, size: 8, pal: 0, flags: 0, visible: false }));
    this.map1 = new Uint16Array(2048);
    this.map2 = null;
    this.textmap = new Uint16Array(1024);
    this.scrollX = 0;
    this.scrollY = 0;
    this.brightness = 15;
    this.frame = 0;
    this.pad = 0;
    this.padPrev = 0;
    this.padDown = 0;
    this.scene = NO_SCENE;
    this.nextScene = opts.startScene ?? data.startScene;
    this.fade = null; // {dir:'out'|'in', step}
    this.halted = null;
    this.stats = { spriteOverflowLines: 0, visibleSprites: 0 };
    this.warned = new Set();
    this.loops = 0;
    this.song = -1;

    this.game = instantiate(code, this.makeApi());
    this.game.boot();
  }

  updateColor(i) {
    const [r, g, b] = bgr555ToRgb(this.cgram[i]);
    this.rgb[i] = 0xff000000 | (b << 16) | (g << 8) | r;
  }

  // ------------------------------------------------------------------ API
  makeApi() {
    const self = this;
    const sc = () => self.sceneData;
    return {
      loop(line) {
        if (++self.loops > MAX_LOOP) throw runtimeError(`Laço infinito? O while/for da linha ${line} rodou mais de ${MAX_LOOP} vezes num único quadro. No SNES o jogo travaria.`, line);
      },
      ai(arr, i, line) {
        if (i < 0 || i >= arr.length) { self.warnOnce(`ai${line}`, `Linha ${line}: leitura fora do array (índice ${i}, tamanho ${arr.length}). No SNES isso leria lixo da memória.`); return 0; }
        return arr[i];
      },
      as(arr, i, v, line) {
        if (i < 0 || i >= arr.length) { self.warnOnce(`as${line}`, `Linha ${line}: escrita fora do array (índice ${i}, tamanho ${arr.length}). No SNES isso corromperia outra variável!`); return; }
        arr[i] = v;
      },
      btn: (b) => (b >= 0 && b < 12 && (self.pad >> b) & 1 ? 1 : 0),
      btnp: (b) => (b >= 0 && b < 12 && (self.padDown >> b) & 1 ? 1 : 0),
      spr(slot, spr, x, y, frame, flags) {
        if (slot < 0 || slot > 127) return;
        const s = self.data.sprites[spr];
        if (!s) return;
        const o = self.oam[slot];
        const f = frame < 0 ? 0 : frame;
        o.tile = s.frames[(f & 0xffff) % s.frames.length];
        o.x = x & 0x1ff;
        o.y = y & 0xff;
        o.large = s.large;
        o.size = s.large ? self.data.spriteMode.large : self.data.spriteMode.small;
        o.pal = s.palette;
        o.flags = flags & 3;
        o.visible = true;
        o.sprite = spr;
      },
      hide(slot) { if (slot >= 0 && slot < 128) self.oam[slot].visible = false; },
      animt(a, t) {
        const an = self.data.anims[a];
        if (!an) return 0;
        if (t < 0) t = 0;
        let idx = Math.floor((t & 0xffff) / an.speed);
        idx = an.loop ? idx % an.frames.length : Math.min(idx, an.frames.length - 1);
        return an.frames[idx];
      },
      anim(a) { return this.animt(a, self.frame & 0x7fff); },
      scroll(x, y) { self.scrollX = x; self.scrollY = y; },
      tile(tx, ty) {
        const s = sc();
        const w = s.bg1 ? s.bg1.w : 32;
        if (tx < 0 || ty < 0 || tx >= w || ty >= 32) return -1;
        const e = self.map1[mapAddr(w, tx, ty)] & 0x3ff;
        if (e === 0 || e >= s.bgTileCount) return -1;
        return s.tileCell[e];
      },
      settile(tx, ty, cell) {
        const s = sc();
        const w = s.bg1 ? s.bg1.w : 32;
        if (tx < 0 || ty < 0 || tx >= w || ty >= 32) return;
        let v = 0;
        if (cell >= 0 && cell < s.cellTile.length) {
          v = s.cellTile[cell];
          if (v) v |= s.bg1Palette << 10;
        }
        self.map1[mapAddr(w, tx, ty)] = v;
      },
      solid: (px, py) => (self.flagsAt(px, py) & 0x80 ? 1 : 0),
      tiletag: (px, py) => self.flagsAt(px, py) & 15,
      text(x, y, str) {
        if (y < 0 || y > 27) return;
        for (let i = 0; i < str.length; i++, x++) {
          if (x < 0 || x >= 32) continue;
          let c = str.charCodeAt(i);
          if (c < 32 || c > 126) c = 63;
          self.textmap[y * 32 + x] = c === 32 ? 0 : (c - 32) | 0x2000;
        }
      },
      num(x, y, v) { this.text(x, y, String(v)); },
      cls() { self.textmap.fill(0); },
      go(s) { if (s >= 0 && s < self.data.scenes.length) self.nextScene = s; },
      brightness(n) { self.brightness = Math.max(0, Math.min(15, n)); },
      bgcolor(r, g, b) { self.cgram[0] = (r & 31) | ((g & 31) << 5) | ((b & 31) << 10); self.updateColor(0); },
      sfx(n) { if (n >= 0) self.hooks.onSfx?.(n); },
      music(m) { if (m >= 0 && m !== self.song) { self.song = m; self.hooks.onMusic?.(m); } },
      stopmusic() { if (self.song !== -1) { self.song = -1; self.hooks.onMusic?.(-1); } },
      rnd: (n) => (n <= 0 ? 0 : Math.floor(Math.random() * n)),
      abs: (v) => ((Math.abs(v) << 16) >> 16),
      min: Math.min,
      max: Math.max,
      overlap: (x1, y1, w1, h1, x2, y2, w2, h2) => (x1 < x2 + w2 && x2 < x1 + w1 && y1 < y2 + h2 && y2 < y1 + h1 ? 1 : 0),
      frames: () => ((self.frame << 16) >> 16),
    };
  }

  flagsAt(px, py) {
    const s = this.sceneData;
    if (px < 0 || py < 0) return 0;
    const tx = px >> 3, ty = py >> 3;
    const w = s.bg1 ? s.bg1.w : 32;
    if (tx >= w || ty >= 32) return 0;
    const e = this.map1[mapAddr(w, tx, ty)] & 0x3ff;
    return e < s.bgTileCount ? s.tileFlags[e] : 0;
  }

  warnOnce(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.hooks.onWarn?.(msg);
  }

  // ------------------------------------------------------------------ ciclo
  setPad(mask) { this.pad = mask; }

  loadScene(i) {
    const s = this.data.scenes[i];
    this.scene = i;
    this.sceneData = s;
    this.bgTiles = decodeAll(s.bgTiles, 32, decodeTile4bpp);
    this.map1.fill(0);
    if (s.bg1) this.map1.set(s.bg1.map);
    this.map2 = s.bg2 ? Uint16Array.from(s.bg2.map) : null;
    this.textmap.fill(0);
    this.oam.forEach((o) => { o.visible = false; });
    this.scrollX = this.scrollY = 0;
    this.cgram[0] = s.bgcolor;
    this.updateColor(0);
    this.frame = 0;
    this.brightness = 15;
    const g = this.game.scenes[i];
    this.guard(() => { g.init(); g.start?.(); });
  }

  guard(fn) {
    this.loops = 0;
    try {
      fn();
    } catch (e) {
      this.halted = e;
      this.hooks.onError?.({ msg: e.message, line: e.line ?? 0, scene: this.sceneData?.name });
    }
  }

  /** Avança um quadro (1/60 s). */
  step() {
    if (this.halted) return;
    this.padDown = this.pad & ~this.padPrev;
    this.padPrev = this.pad;

    if (this.fade) {
      const f = this.fade;
      if (f.step < FADE_STEPS.length) {
        this.brightness = f.dir === 'in' ? Math.min(FADE_STEPS[f.step], f.target) : Math.min(f.from, 15 - FADE_STEPS[f.step]);
        f.step++;
        return;
      }
      this.brightness = f.dir === 'in' ? f.target : 0;
      this.fade = null;
      if (f.dir === 'out') { this.doSceneChange(); return; }
    }
    if (this.nextScene !== NO_SCENE) {
      if (this.scene === NO_SCENE) this.doSceneChange();
      else this.fade = { dir: 'out', step: 0, from: this.brightness };
      return;
    }
    const g = this.game.scenes[this.scene];
    this.guard(() => g.update?.());
    this.frame = (this.frame + 1) & 0xffff;
  }

  doSceneChange() {
    const next = this.nextScene;
    this.nextScene = NO_SCENE;
    this.loadScene(next);
    // o fade de entrada vai até o brilho que o start() deixou (normalmente 15)
    const target = this.brightness;
    this.brightness = 0;
    this.fade = { dir: 'in', step: 0, target };
  }

  // ------------------------------------------------------------------ vídeo
  render() {
    const px = this.pixels;
    const s = this.sceneData;
    if (!s) { px.fill(0xff000000); return px; }
    const rgb = this.rgb;
    const bright = this.brightness;
    const w1 = s.bg1 ? s.bg1.w : 32;
    const w1px = w1 * 8;
    const par = s.parallax | 0;
    const b2x = (this.scrollX * par) >> 3, b2y = (this.scrollY * par) >> 3;
    const objLine = new Int16Array(W);
    let overflow = 0, visible = 0;
    const visibleOam = this.layers.obj ? this.oam.map((o, i) => (o.visible ? i : -1)).filter((i) => i >= 0) : [];
    visible = visibleOam.length;

    for (let y = 0; y < H; y++) {
      // --- sprites desta linha (máx 32, índice menor tem prioridade) ---
      objLine.fill(-1);
      let count = 0;
      for (const i of visibleOam) {
        const o = this.oam[i];
        const row = (y - o.y) & 0xff;
        if (row >= o.size) continue;
        if (++count > MAX_SPRITES_PER_LINE) { overflow++; break; }
        const sx = o.x >= 256 ? o.x - 512 : o.x;
        const r = o.flags & 2 ? o.size - 1 - row : row;
        const cells = o.size >> 3;
        for (let c = 0; c < o.size; c++) {
          const x = sx + c;
          if (x < 0 || x >= W || objLine[x] >= 0) continue;
          const cc = o.flags & 1 ? o.size - 1 - c : c;
          const tnum = (o.tile + (r >> 3) * 16 + (cc >> 3)) & 511;
          const t = this.objTiles[tnum];
          const v = t ? t[(r & 7) * 8 + (cc & 7)] : 0;
          if (v) objLine[x] = 128 + o.pal * 16 + v;
        }
        void cells;
      }
      for (let x = 0; x < W; x++) {
        let color = 0;
        // BG3 (texto, prioridade alta)
        if (this.layers.bg3) {
          const e = this.textmap[(y >> 3) * 32 + (x >> 3)];
          if (e) {
            const t = this.fontTiles[e & 0x3ff];
            const v = t ? t[(y & 7) * 8 + (x & 7)] : 0;
            if (v) color = v; // paleta 0 do BG3 = cores 0..3 da CGRAM
          }
        }
        if (!color && objLine[x] >= 0) color = objLine[x];
        if (!color && this.layers.bg1 && s.bg1) {
          const mx = (x + this.scrollX) & (w1px - 1);
          const my = (y + this.scrollY) & 255;
          color = this.bgPixel(this.map1[mapAddr(w1, mx >> 3, my >> 3)], mx & 7, my & 7);
        }
        if (!color && this.layers.bg2 && this.map2) {
          const mx = (x + b2x) & 255;
          const my = (y + b2y) & 255;
          color = this.bgPixel(this.map2[(my >> 3) * 32 + (mx >> 3)], mx & 7, my & 7);
        }
        px[y * W + x] = applyBrightness(rgb[color], bright);
      }
    }
    this.stats.spriteOverflowLines = overflow;
    this.stats.visibleSprites = visible;
    return px;
  }

  bgPixel(e, fx, fy) {
    const num = e & 0x3ff;
    if (!num) return 0;
    const t = this.bgTiles[num];
    if (!t) return 0;
    const xx = e & 0x4000 ? 7 - fx : fx;
    const yy = e & 0x8000 ? 7 - fy : fy;
    const v = t[yy * 8 + xx];
    return v ? ((e >> 10) & 7) * 16 + v : 0;
  }
}

function applyBrightness(c, b) {
  if (b >= 15) return c;
  if (b <= 0) return 0xff000000;
  const k = (b + 1) / 16;
  const r = (c & 255) * k, g = ((c >> 8) & 255) * k, bl = ((c >> 16) & 255) * k;
  return 0xff000000 | (bl << 16) | (g << 8) | r;
}

function decodeAll(bytes, per, fn) {
  const out = [];
  for (let o = 0; o + per <= bytes.length; o += per) out.push(fn(bytes, o));
  return out;
}

function runtimeError(msg, line) {
  const e = new Error(msg);
  e.line = line;
  return e;
}

/** Botões na mesma ordem das constantes UP..SELECT */
export const BUTTON_BITS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, A: 4, B: 5, X: 6, Y: 7, L: 8, R: 9, START: 10, SELECT: 11 };
