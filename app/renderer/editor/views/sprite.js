// Editor de sprites: pixel art, quadros (frames), animações e importação de PNG / sprite sheet.
import { h, clear, toast, modal } from '../../shared/ui.js';
import { pixelsFromHex, pixelsToHex, cutTile } from '../../../core/gfx/snes.js';
import { quantize } from '../../../core/gfx/quantize.js';
import { SPRITE_SIZE_MODES, isValidName, sanitizeName } from '../../../core/project.js';
import { parseAseprite, writeAseprite, browserInflate, browserDeflate } from '../../../core/gfx/aseprite.js';
import { bgr555ToRgb } from '../../../core/gfx/snes.js';
import { PixelEditor } from './pixel.js';
import { paletteWidget } from './palette-widget.js';
import { paletteRgb, indexedToImageData, decodeImage, canvasToPngBytes } from './common.js';

export function mount(el, ctx, id) {
  const { store } = ctx;
  const spr = () => store.sprite(id);
  let frame = 0;
  let selAnim = 0;
  const N = () => spr().size;
  const framePx = (f) => pixelsFromHex(spr().frames[f] ?? '', N() * N());

  const editor = new PixelEditor({
    w: N(), h: N(),
    pixels: framePx(0),
    colors: () => paletteRgb(store.project, 'obj', spr().palette),
    onion: () => (frame > 0 ? framePx(frame - 1) : null),
    tileGrid: 8,
    onCommit: (px) => store.change('sprite', () => { spr().frames[frame] = pixelsToHex(px); }, { id }),
  });

  const pal = paletteWidget(ctx, {
    kind: 'obj',
    editor,
    getPalette: () => spr().palette,
    setPalette: (i) => store.change('sprite', () => { spr().palette = i; }, { id }),
  });

  const framesBar = h('div.frames');
  const props = h('div.rsec');
  const anims = h('div.rsec');
  const preview = h('canvas.pixel', { style: { width: '96px', height: '96px', background: '#0b0b14', borderRadius: '6px' } });
  const snippet = h('div.rsec');

  el.append(h('div.col', { style: { flex: 1, minWidth: 0, gap: 0 } },
    editor.toolbar([
      h('button.btn.small', { onclick: importPng, title: 'Importar PNG (um quadro ou uma folha de sprites) ou arquivo do Aseprite (.aseprite / .ase)' }, '📥 Importar'),
      h('button.btn.small', { onclick: exportPng, title: 'Salvar como folha de sprites PNG' }, '📤 PNG'),
      h('button.btn.small', { onclick: exportAse, title: 'Salvar como .aseprite para editar no Aseprite' }, '📤 Aseprite'),
    ]),
    h('div.row', { style: { flex: 1, minHeight: 0, gap: 0, alignItems: 'stretch' } }, editor.el,
      h('div.sidepanel', pal.el, props, anims, snippet)),
    framesBar));

  function selectFrame(f) {
    frame = Math.max(0, Math.min(spr().frames.length - 1, f));
    editor.setPixels(framePx(frame));
    drawFrames();
  }

  function drawFrames() {
    const s = spr();
    const colors = paletteRgb(store.project, 'obj', s.palette);
    clear(framesBar,
      h('span.hint', { style: { marginRight: '4px' } }, 'Quadros:'),
      s.frames.map((fr, i) => {
        const c = h('canvas');
        c.width = c.height = s.size;
        c.getContext('2d').putImageData(indexedToImageData(pixelsFromHex(fr, s.size * s.size), s.size, s.size, colors), 0, 0);
        return h('div.frame', { class: i === frame ? 'sel' : '', title: `Quadro ${i}`, onclick: () => selectFrame(i) }, c, h('span.n', i));
      }),
      h('div.col', { style: { gap: '3px' } },
        h('div.row', { style: { gap: '3px' } },
          h('button.btn.small', { title: 'Novo quadro vazio', 'data-action': 'add-frame', onclick: () => { store.change('sprite', () => { spr().frames.splice(frame + 1, 0, '0'.repeat(N() * N())); }, { id }); selectFrame(frame + 1); } }, '＋'),
          h('button.btn.small', { title: 'Duplicar quadro', 'data-action': 'dup-frame', onclick: () => { store.change('sprite', () => { spr().frames.splice(frame + 1, 0, spr().frames[frame]); }, { id }); selectFrame(frame + 1); } }, '⧉'),
          h('button.btn.small', { title: 'Apagar quadro', onclick: () => { if (spr().frames.length < 2) return; store.change('sprite', () => { spr().frames.splice(frame, 1); fixAnims(frame); }, { id }); selectFrame(frame - 1); } }, '🗑')),
        h('div.row', { style: { gap: '3px' } },
          h('button.btn.small', { title: 'Mover para a esquerda', onclick: () => moveFrame(-1) }, '◀'),
          h('button.btn.small', { title: 'Mover para a direita', onclick: () => moveFrame(1) }, '▶'))),
      h('span.hint', { style: { marginLeft: '8px' } }, `Cada quadro de ${s.size}x${s.size} ocupa ${(s.size / 8) ** 2} tiles de 8x8 na VRAM.`));
  }

  function fixAnims(removed) {
    for (const a of spr().anims) a.frames = a.frames.filter((f) => f !== removed).map((f) => (f > removed ? f - 1 : f));
  }

  function moveFrame(d) {
    const s = spr();
    const j = frame + d;
    if (j < 0 || j >= s.frames.length) return;
    store.change('sprite', () => { [s.frames[frame], s.frames[j]] = [s.frames[j], s.frames[frame]]; }, { id });
    selectFrame(j);
  }

  function drawProps() {
    const s = spr();
    const mode = SPRITE_SIZE_MODES[store.project.spriteSize];
    clear(props,
      h('h3', 'Sprite'),
      h('div.row', h('span.grow', h('b', s.name)), h('span.badge', `OBJ ${s.size}x${s.size}`)),
      h('label.field', { style: { marginTop: '8px' } }, 'Tamanho',
        h('select', { onchange: (e) => resize(Number(e.target.value)) },
          [mode.small, mode.large].map((z) => h('option', { value: z, selected: z === s.size }, `${z}x${z}${z === mode.large ? ' (grande)' : ' (pequeno)'}`)))),
      h('div.row', { style: { marginTop: '10px' } }, preview, h('div.hint', 'Prévia em tamanho 3x.', h('br'), 'O SNES desenha sprites na OAM, acima do cenário.')));
  }

  function resize(z) {
    const s = spr();
    if (z === s.size) return;
    store.change('sprite', () => {
      s.frames = s.frames.map((fr) => {
        const src = pixelsFromHex(fr, s.size * s.size);
        const out = new Uint8Array(z * z);
        for (let y = 0; y < Math.min(z, s.size); y++) for (let x = 0; x < Math.min(z, s.size); x++) out[y * z + x] = src[y * s.size + x];
        return pixelsToHex(out);
      });
      s.size = z;
    }, { id });
    editor.setPixels(framePx(frame), z, z);
    editor.fitZoom();
  }

  function drawAnims() {
    const s = spr();
    if (selAnim >= s.anims.length) selAnim = Math.max(0, s.anims.length - 1);
    const a = s.anims[selAnim];
    clear(anims,
      h('div.row', h('h3.grow', 'Animações'), h('button.btn.small', { 'data-action': 'add-anim', onclick: addAnim }, '＋ Nova')),
      s.anims.length ? h('div.list', s.anims.map((an, i) => h('div.it', { class: i === selAnim ? 'sel' : '', onclick: () => { selAnim = i; drawAnims(); } },
        h('span.grow.mono', `${s.name}_${an.name}`), h('span.hint', `${an.frames.length}q`)))) : h('p.hint', 'Nenhuma animação. Uma animação é uma lista de quadros tocados em sequência.'),
      a ? h('div.col', { style: { marginTop: '8px' } },
        h('label.field', 'Nome', h('input', { type: 'text', value: a.name, onchange: (e) => {
          const v = e.target.value.trim();
          if (!isValidName(v)) { toast('Nome inválido (use letras, números e _)', 'err'); e.target.value = a.name; return; }
          store.change('sprite', () => { a.name = v; }, { id });
        } })),
        h('label.field', 'Quadros (separados por vírgula)', h('input', { type: 'text', value: a.frames.join(','), onchange: (e) => {
          const fr = e.target.value.split(/[ ,;]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < s.frames.length);
          store.change('sprite', () => { a.frames = fr.length ? fr : [0]; }, { id });
        } })),
        h('div.row', h('button.btn.small', { onclick: () => store.change('sprite', () => { a.frames.push(frame); }, { id }) }, `＋ quadro atual (${frame})`),
          h('button.btn.small', { onclick: () => store.change('sprite', () => { a.frames = s.frames.map((_, i) => i); }, { id }) }, 'todos')),
        h('div.slider', h('span', 'Velocidade'), h('input', { type: 'range', min: 1, max: 30, value: a.speed, oninput: (e) => store.change('sprite', () => { a.speed = Number(e.target.value); }, { id, coalesce: 'animspeed' }) }), h('span.mono', `${a.speed}`)),
        h('p.hint', `Troca de quadro a cada ${a.speed} quadro(s) da tela = ${(60 / a.speed).toFixed(1)} quadros de animação por segundo.`),
        h('label.row', h('input', { type: 'checkbox', checked: a.loop !== false, onchange: (e) => store.change('sprite', () => { a.loop = e.target.checked; }, { id }) }), 'Repetir (loop)'),
        h('button.btn.small.danger', { onclick: () => { store.change('sprite', () => { s.anims.splice(selAnim, 1); }, { id }); } }, 'Apagar animação')) : null);
    drawSnippet();
  }

  function addAnim() {
    const s = spr();
    let n = 'anda', i = 2;
    while (s.anims.some((a) => a.name === n)) n = `anda${i++}`;
    store.change('sprite', () => { s.anims.push({ name: n, frames: s.frames.map((_, k) => k), speed: 8, loop: true }); }, { id });
    selAnim = s.anims.length - 1;
    drawAnims();
  }

  function drawSnippet() {
    const s = spr();
    const a = s.anims[selAnim];
    clear(snippet, h('h3', 'Como usar no código'),
      h('pre.mono', { style: { background: 'var(--bg)', padding: '8px', borderRadius: '6px', fontSize: '11.5px', whiteSpace: 'pre-wrap', margin: 0 } },
        `// slot 0 da OAM, na posição x,y\nspr(0, ${s.name}, x, y${a ? `, anim(${s.name}_${a.name})` : ''})\n\n// virado para a esquerda:\nspr(0, ${s.name}, x, y, ${a ? `anim(${s.name}_${a.name})` : '0'}, FLIPX)`));
  }

  // prévia animada
  let t = 0;
  const timer = setInterval(() => {
    const s = spr();
    if (!s) return;
    const a = s.anims[selAnim];
    t++;
    let f = frame;
    if (a && a.frames.length) {
      let idx = Math.floor(t / Math.max(1, a.speed));
      idx = a.loop !== false ? idx % a.frames.length : Math.min(idx, a.frames.length - 1);
      f = a.frames[idx];
    }
    preview.width = preview.height = s.size;
    preview.getContext('2d').putImageData(indexedToImageData(framePx(f), s.size, s.size, paletteRgb(store.project, 'obj', s.palette)), 0, 0);
  }, 1000 / 60);

  // ---------- importar / exportar ----------
  async function importPng() {
    const files = await ctx.api.openFileDialog({ title: 'Importar imagem ou Aseprite', filters: [{ name: 'Imagens e Aseprite', extensions: ['png', 'gif', 'bmp', 'jpg', 'aseprite', 'ase'] }] });
    if (!files.length) return;
    const s = spr();
    const z = s.size;
    // cada "imagem" vira um ou mais quadros de z x z
    let images = [];
    let tags = [];
    try {
      if (/\.(aseprite|ase)$/i.test(files[0].name)) {
        const ase = await parseAseprite(files[0].data, browserInflate);
        images = ase.frames.map((f) => ({ w: ase.w, h: ase.h, data: f.rgba, duration: f.duration }));
        tags = ase.tags;
      } else {
        const img = await decodeImage(files[0].data);
        images = [{ w: img.width, h: img.height, data: img.data, duration: 100 }];
      }
    } catch (e) { toast('Não consegui ler o arquivo: ' + e.message, 'err'); return; }
    const { w, h: hh } = images[0];
    if (w % z || hh % z) {
      toast(`A imagem tem ${w}x${hh}. Ela precisa ter largura e altura múltiplas de ${z} (tamanho do sprite).`, 'err');
      return;
    }
    const perImage = (w / z) * (hh / z);
    const mode = await modal('Importar', h('div.col',
      h('p', `${images.length} imagem(ns) de ${w}x${hh} = até ${images.length * perImage} quadro(s) de ${z}x${z}${tags.length ? ` e ${tags.length} animação(ões) (tags)` : ''}.`),
      h('p.hint', 'Cores novas: a engine escolhe até 15 cores e grava na paleta deste sprite. Usar paleta atual: cada pixel vira a cor mais parecida que já existe.')),
    [{ label: 'Cancelar' }, { label: 'Usar paleta atual', value: 'keep' }, { label: 'Cores novas na paleta', primary: true, value: 'new' }]);
    if (!mode) return;
    // junta tudo numa imagem alta para todas as partes dividirem a mesma paleta de 16 cores
    const all = new Uint8ClampedArray(w * hh * images.length * 4);
    images.forEach((im, i) => all.set(im.data, i * w * hh * 4));
    const q = quantize(all, w, hh * images.length, { palette: mode === 'keep' ? store.project.palettes.obj[s.palette] : null });
    if (q.reduced) toast('Havia mais de 15 cores: reduzi para 15 (limite de 4 bits por pixel).');
    const frames = [];
    const firstFrameOfImage = [];
    images.forEach((im, i) => {
      firstFrameOfImage.push(frames.length);
      for (let fy = 0; fy < hh / z; fy++) {
        for (let fx = 0; fx < w / z; fx++) {
          const out = new Uint8Array(z * z);
          for (let y = 0; y < z; y++) for (let x = 0; x < z; x++) out[y * z + x] = q.pixels[(i * hh + fy * z + y) * w + fx * z + x];
          if (out.some((v) => v) || images.length > 1) frames.push(pixelsToHex(out));
        }
      }
    });
    if (!frames.length) { toast('A imagem está vazia (tudo transparente).', 'err'); return; }
    store.change('sprite', (p) => {
      if (mode === 'new') p.palettes.obj[s.palette] = q.palette;
      if (frames.length === 1 && images.length === 1) s.frames[frame] = frames[0];
      else s.frames = frames;
      for (const t of tags) {
        let name = sanitizeName(t.name).toLowerCase();
        if (!isValidName(name)) name = 'anim';
        const ids = [];
        for (let k = t.from; k <= t.to; k++) if (firstFrameOfImage[k] !== undefined) ids.push(firstFrameOfImage[k]);
        const dur = images[t.from]?.duration ?? 100;
        const existing = s.anims.find((a) => a.name === name);
        const an = { name, frames: ids, speed: Math.max(1, Math.round((dur * 60) / 1000)), loop: true };
        if (existing) Object.assign(existing, an); else s.anims.push(an);
      }
    }, { id });
    selectFrame(frames.length === 1 ? frame : 0);
    toast(`${frames.length} quadro(s)${tags.length ? ` e ${tags.length} animação(ões)` : ''} importado(s)`, 'ok');
    void cutTile;
  }

  async function exportAse() {
    const s = spr();
    const colors = paletteRgb(store.project, 'obj', s.palette);
    const frames = s.frames.map((fr) => {
      const px = pixelsFromHex(fr, s.size * s.size);
      const rgba = new Uint8Array(s.size * s.size * 4);
      px.forEach((v, i) => { if (v) { const c = colors[v]; rgba.set([c[0], c[1], c[2], 255], i * 4); } });
      return { rgba, duration: 100 };
    });
    const tags = s.anims.filter((a) => a.frames.length).map((a) => ({ name: a.name, from: Math.min(...a.frames), to: Math.max(...a.frames) }));
    const bytes = await writeAseprite({ w: s.size, h: s.size, frames, tags }, browserDeflate);
    const p = await ctx.api.saveFileDialog({ defaultPath: `${s.name}.aseprite`, filters: [{ name: 'Aseprite', extensions: ['aseprite'] }] }, bytes);
    if (p) toast('Salvo! Abra no Aseprite, edite e importe de volta.', 'ok');
    void bgr555ToRgb;
  }

  async function exportPng() {
    const s = spr();
    const c = document.createElement('canvas');
    c.width = s.size * s.frames.length;
    c.height = s.size;
    const g = c.getContext('2d');
    s.frames.forEach((fr, i) => g.putImageData(indexedToImageData(pixelsFromHex(fr, s.size * s.size), s.size, s.size, paletteRgb(store.project, 'obj', s.palette)), i * s.size, 0));
    const bytes = await canvasToPngBytes(c);
    const p = await ctx.api.saveFileDialog({ defaultPath: `${s.name}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] }, bytes);
    if (p) toast('Sprite sheet exportada', 'ok');
  }

  drawFrames();
  drawProps();
  drawAnims();
  requestAnimationFrame(() => editor.fitZoom());

  return {
    onShow: () => requestAnimationFrame(() => editor.redraw()),
    refresh() {
      if (!spr()) return;
      if (frame >= spr().frames.length) frame = spr().frames.length - 1;
      const px = framePx(frame);
      if (spr().size !== editor.w) editor.setPixels(px, spr().size, spr().size);
      else if (px.some((v, i) => v !== editor.pixels[i])) editor.setPixels(px);
      else editor.redraw();
      pal.refresh();
      drawFrames();
      drawProps();
      // não redesenha o painel enquanto o usuário arrasta um slider / digita nele
      if (!anims.contains(document.activeElement)) drawAnims();
      else drawSnippet();
    },
    dispose() { clearInterval(timer); },
  };
}
