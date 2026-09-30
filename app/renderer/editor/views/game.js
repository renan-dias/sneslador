// Live view: roda o jogo dentro do editor no console virtual, com raio-X do hardware.
import { h, clear } from '../../shared/ui.js';
import { VirtualSNES, W, H, BUTTON_BITS } from '../../../core/runtime/console.js';
import { decodeTile4bpp } from '../../../core/gfx/snes.js';
import { bgr555ToHex } from '../../../core/gfx/snes.js';
import { loadSound, playBuffer, playSong, setMuted, isMuted, audioCtx } from '../audio.js';

const STYLE = `
.game-root { flex: 1; display: flex; min-width: 0; }
.game-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #07070d; }
.game-stage { flex: 1; display: grid; place-items: center; position: relative; overflow: hidden; }
.game-stage canvas { image-rendering: pixelated; box-shadow: 0 0 0 1px #222, 0 10px 40px #000a; }
.crt::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px); }
.game-over { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(7,7,13,0.88); padding: 30px; }
.game-over .box { max-width: 620px; background: var(--panel); border: 1px solid #6b2a33; border-radius: 10px; padding: 16px 18px; }
.game-over .e { color: #ff9a9f; font-family: var(--mono); font-size: 12px; margin: 4px 0; cursor: pointer; }
.oam { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11px; }
.oam td, .oam th { padding: 2px 4px; text-align: right; border-bottom: 1px solid #ffffff0a; }
.oam th { color: var(--muted); font-weight: normal; }
.cgram { display: grid; grid-template-columns: repeat(16, 1fr); gap: 1px; }
.cgram div { aspect-ratio: 1; }
.pad { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
.pad span { padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line); }
.pad span.on { background: var(--accent); color: #fff; border-color: var(--accent); }
`;

export function mount(el, ctx) {
  const { store, api } = ctx;
  if (!document.getElementById('game-style')) document.head.append(h('style#game-style', STYLE));

  const canvas = h('canvas', { width: W, height: H, 'data-game': 'screen' });
  const stage = h('div.game-stage.crt', canvas);
  const bar = h('div.toolbar');
  const side = h('div.sidepanel');
  el.append(h('div.game-root', h('div.game-main', bar, stage), side));
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);

  let vm = null;
  let running = false;
  let paused = false;
  let speed = 1;
  let raf = 0;
  let acc = 0;
  let last = 0;
  let crt = true;
  let visible = true;
  let settings = null;
  let sfxBuffers = [];
  let song = null;
  let thumbSaved = false;
  let dirtyReload = false;
  let sideTab = 'hw';
  let frameCount = 0;
  let pausedByHide = false;

  api.getSettings().then((s) => { settings = s; });

  // ---------------------------------------------------------------- entrada
  const keys = new Set();
  const onKey = (e) => {
    if (!visible || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    const map = settings?.keyboard ?? {};
    if (Object.values(map).includes(e.code)) {
      e.preventDefault();
      if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code);
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function readPad() {
    let mask = 0;
    const map = settings?.keyboard ?? {};
    for (const [btn, code] of Object.entries(map)) if (keys.has(code)) mask |= 1 << BUTTON_BITS[btn];
    // controle USB (layout padrão): 0=B 1=A 2=Y 3=X 4=L 5=R 8=Select 9=Start 12-15 = direcional
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp) continue;
      const b = (i) => gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      if (b(12) || ay < -0.5) mask |= 1 << BUTTON_BITS.UP;
      if (b(13) || ay > 0.5) mask |= 1 << BUTTON_BITS.DOWN;
      if (b(14) || ax < -0.5) mask |= 1 << BUTTON_BITS.LEFT;
      if (b(15) || ax > 0.5) mask |= 1 << BUTTON_BITS.RIGHT;
      if (b(0)) mask |= 1 << BUTTON_BITS.B;
      if (b(1)) mask |= 1 << BUTTON_BITS.A;
      if (b(2)) mask |= 1 << BUTTON_BITS.Y;
      if (b(3)) mask |= 1 << BUTTON_BITS.X;
      if (b(4)) mask |= 1 << BUTTON_BITS.L;
      if (b(5)) mask |= 1 << BUTTON_BITS.R;
      if (b(8)) mask |= 1 << BUTTON_BITS.SELECT;
      if (b(9)) mask |= 1 << BUTTON_BITS.START;
    }
    return mask;
  }

  // ---------------------------------------------------------------- ciclo
  async function start(sceneIndex = null) {
    stopAudio();
    const res = ctx.compile();
    if (!res.ok) { showErrors(res); running = false; vm = null; drawBar(); return; }
    stage.querySelector('.game-over')?.remove();
    const rate = store.project.soundRate ?? 8000;
    sfxBuffers = await Promise.all(store.project.sounds.map((s) => loadSound(api, ctx.dir, s, rate).catch(() => null)));
    vm = new VirtualSNES(res.data, res.compiled.js, {
      onSfx: (i) => { if (!isMuted()) playBuffer(sfxBuffers[i]); },
      onMusic: (m) => {
        song?.stop();
        song = null;
        const s = (store.project.songs ?? [])[m];
        if (s && m >= 0) song = playSong(s, { loop: true });
      },
      onError: (e) => {
        ctx.log(`✖ Erro rodando a cena "${e.scene}": ${e.msg}`, 'err', e.line ? { file: e.scene, line: e.line } : null);
        showErrors({ problems: [], errors: [{ file: e.scene, line: e.line, msg: e.msg }] }, 'O jogo parou');
      },
      onWarn: (m) => ctx.log('⚠ ' + m, 'warn'),
    }, sceneIndex !== null ? { startScene: sceneIndex } : {});
    running = true;
    paused = false;
    frameCount = 0;
    audioCtx();
    drawBar();
    loop();
    canvas.focus();
  }

  function stopAudio() { song?.stop(); song = null; }

  // retoma a música que o jogo estava tocando (depois de pausar)
  function resumeSong() {
    const s = vm && vm.song >= 0 ? (store.project.songs ?? [])[vm.song] : null;
    if (s && !song) song = playSong(s, { loop: true });
  }

  function loop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    acc = 0;
    const tick = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, now - last);
      last = now;
      if (paused || !visible) return;
      acc += dt * speed;
      const frameMs = 1000 / 60;
      let steps = 0;
      while (acc >= frameMs && steps < 4) {
        vm.setPad(readPad());
        vm.step();
        acc -= frameMs;
        steps++;
        frameCount++;
      }
      if (steps) render();
      if (vm.halted) { running = false; drawBar(); }
      if (!thumbSaved && frameCount > 150) { thumbSaved = true; saveThumb(); }
      if (frameCount % 10 === 0) drawSideLive();
    };
    raf = requestAnimationFrame(tick);
  }

  function render() {
    const px = vm.render();
    new Uint32Array(img.data.buffer).set(px);
    g.putImageData(img, 0, 0);
  }

  function fit() {
    const r = stage.getBoundingClientRect();
    const s = Math.max(1, Math.floor(Math.min(r.width / W, r.height / (H * 1.0)) * 2) / 2);
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  async function saveThumb() {
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    api.saveThumb(ctx.dir, b64).catch(() => {});
  }

  function showErrors(res, title = 'O jogo não pode rodar ainda') {
    stage.querySelector('.game-over')?.remove();
    stage.append(h('div.game-over', h('div.box',
      h('h3', { style: { marginBottom: '8px' } }, `🛑 ${title}`),
      res.problems.map((p) => h('div.e', p)),
      res.errors.map((e) => h('div.e', { onclick: () => openErr(e) }, `${e.file}.sns linha ${e.line}: ${e.msg}`)),
      h('p.hint', { style: { marginTop: '10px' } }, 'Clique num erro para ir até a linha. Depois de corrigir, o jogo recarrega sozinho.'))));
  }
  function openErr(e) {
    if (e.file === 'global') ctx.openTab('code', 'global', { line: e.line });
    else { const sc = store.project.scenes.find((s) => s.name === e.file); if (sc) ctx.openTab('code', sc.id, { line: e.line }); }
  }

  // ---------------------------------------------------------------- barra
  function drawBar() {
    const scenes = store.project.scenes;
    clear(bar,
      running && !paused ? h('button.btn', { onclick: () => { paused = true; stopAudio(); drawBar(); } }, '⏸ Pausar')
        : h('button.btn.primary', { 'data-action': 'game-play', onclick: () => { if (vm && !vm.halted && running) { paused = false; resumeSong(); drawBar(); } else start(); } }, '▶ Rodar'),
      h('button.btn', { title: 'Recomeçar do início', onclick: () => start() }, '⟲ Reiniciar'),
      h('button.btn', { title: 'Avançar 1 quadro (com o jogo pausado)', disabled: !paused, onclick: () => { vm.setPad(readPad()); vm.step(); render(); drawSideLive(); } }, '⏭ 1 quadro'),
      h('div.sep'),
      h('select', { title: 'Começar numa cena', onchange: (e) => start(Number(e.target.value)) },
        h('option', { value: '', disabled: true, selected: true }, 'Ir para cena...'), scenes.map((s, i) => h('option', { value: i }, s.name))),
      h('select', { title: 'Velocidade', onchange: (e) => { speed = Number(e.target.value); } },
        [[0.25, '¼x lento'], [0.5, '½x'], [1, '1x'], [2, '2x']].map(([v, l]) => h('option', { value: v, selected: v === speed }, l))),
      h('button.btn.small', { class: crt ? 'active' : '', title: 'Linhas de TV de tubo', onclick: () => { crt = !crt; stage.classList.toggle('crt', crt); drawBar(); } }, '📺 TV'),
      h('button.btn.small', { class: isMuted() ? 'active' : '', onclick: () => { setMuted(!isMuted()); drawBar(); } }, isMuted() ? '🔇' : '🔊'),
      h('div.spacer'),
      h('span.hint', 'Setas · Z=B · X=A · A=Y · S=X · Q/W=L/R · Enter=Start'));
  }

  // ---------------------------------------------------------------- raio-x
  function drawSide() {
    clear(side,
      h('div.tabs', { style: { padding: '0 4px' } }, [['hw', 'Raio-X'], ['oam', 'OAM'], ['vram', 'VRAM']].map(([k, l]) => h('div.tab', { class: sideTab === k ? 'active' : '', onclick: () => { sideTab = k; drawSide(); } }, l))),
      h('div#gameSideBody'));
    drawSideLive();
  }

  function drawSideLive() {
    const body = side.querySelector('#gameSideBody');
    if (!body) return;
    if (!vm) { clear(body, h('div.rsec', h('p.hint', 'Aperte ▶ Rodar para ver o hardware funcionando.'))); return; }
    if (sideTab === 'hw') {
      const pad = vm.pad;
      clear(body,
        h('div.rsec', h('h3', 'Camadas (liga/desliga)'),
          ['bg1', 'bg2', 'bg3', 'obj'].map((l) => h('label.row', h('input', { type: 'checkbox', checked: vm.layers[l], onchange: (e) => { vm.layers[l] = e.target.checked; render(); } }),
            { bg1: 'BG1 — cenário', bg2: 'BG2 — fundo', bg3: 'BG3 — texto', obj: 'OBJ — sprites' }[l]))),
        h('div.rsec', h('h3', 'Agora'),
          h('div.hint', `Cena: ${vm.sceneData?.name ?? '-'} · quadro ${vm.frame}`),
          h('div.hint', `Scroll BG1: ${vm.scrollX}, ${vm.scrollY} · brilho ${vm.brightness}/15`),
          h('div.hint', `Sprites visíveis: ${vm.stats.visibleSprites}/128`),
          vm.stats.spriteOverflowLines ? h('div', { style: { color: 'var(--yellow)', fontSize: '12px' } }, `⚠ ${vm.stats.spriteOverflowLines} linha(s) com mais de 32 sprites: o SNES não desenha os que sobram!`) : null,
          h('div.pad', { style: { marginTop: '6px' } }, Object.entries(BUTTON_BITS).map(([n, b]) => h('span', { class: (pad >> b) & 1 ? 'on' : '' }, n)))),
        h('div.rsec', h('h3', 'CGRAM — 256 cores'),
          h('div.cgram', Array.from(vm.cgram).map((c, i) => h('div', { style: { background: bgr555ToHex(c) }, title: `cor ${i} (${i < 128 ? `BG paleta ${i >> 4}` : `sprite paleta ${(i - 128) >> 4}`})` }))),
          h('p.hint', 'Metade de cima: paletas do cenário. Metade de baixo: paletas dos sprites.')));
    } else if (sideTab === 'oam') {
      const rows = vm.oam.map((o, i) => (o.visible ? h('tr', h('td', i), h('td', vm.data.sprites[o.sprite]?.name ?? '?'), h('td', o.x >= 256 ? o.x - 512 : o.x), h('td', o.y), h('td', o.tile), h('td', o.pal), h('td', o.flags & 1 ? '↔' : '')) : null)).filter(Boolean);
      clear(body, h('div.rsec', h('h3', 'OAM — tabela de sprites'),
        h('p.hint', 'O SNES guarda até 128 sprites na OAM. Cada linha abaixo é um slot usado com spr().'),
        rows.length ? h('table.oam', h('tr', ['slot', 'sprite', 'x', 'y', 'tile', 'pal', ''].map((t) => h('th', t))), rows) : h('p.hint', 'Nenhum sprite visível.')));
    } else {
      const vc = h('canvas', { width: 128, height: 256, style: { width: '100%', imageRendering: 'pixelated', background: '#000' } });
      const bc = h('canvas', { width: 256, height: 256, style: { width: '100%', imageRendering: 'pixelated', background: '#000' } });
      drawTiles(vc, vm.data.objTiles, 16, 128);
      drawTiles(bc, vm.sceneData?.bgTiles ?? new Uint8Array(0), 32, 0, vm.sceneData?.bg1Palette ?? 1);
      clear(body,
        h('div.rsec', h('h3', 'VRAM — tiles dos sprites'), vc, h('p.hint', `${vm.data.objTileCount} de 512 tiles usados. Sprites de 16x16 usam 4 tiles vizinhos.`)),
        h('div.rsec', h('h3', 'VRAM — tiles do cenário'), bc, h('p.hint', `${vm.sceneData?.bgTileCount ?? 0} tiles na cena. Tiles repetidos são guardados uma vez só.`)));
    }
  }

  function drawTiles(c, bytes, perRow, palBase, bgPal = 0) {
    const g2 = c.getContext('2d');
    const im = g2.createImageData(c.width, c.height);
    const d = new Uint32Array(im.data.buffer);
    const n = Math.floor(bytes.length / 32);
    const palStart = palBase === 128 ? 128 : bgPal * 16;
    for (let t = 0; t < n; t++) {
      const px = decodeTile4bpp(bytes, t * 32);
      const tx = (t % perRow) * 8, ty = Math.floor(t / perRow) * 8;
      if (ty >= c.height) break;
      for (let i = 0; i < 64; i++) if (px[i]) d[(ty + (i >> 3)) * c.width + tx + (i & 7)] = vm.rgb[palStart + px[i]];
    }
    g2.putImageData(im, 0, 0);
  }

  // hot reload: quando o projeto muda, recarrega a cena atual
  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      if (!visible) { dirtyReload = true; return; }
      const sceneIdx = vm && vm.scene >= 0 ? vm.scene : null;
      if (running || vm) { ctx.log('↻ Projeto alterado: recarregando a cena no live view.'); start(sceneIdx); }
    }, 500);
  }

  drawBar();
  drawSide();
  fit();

  return {
    restart() { start(); },
    onShow() {
      visible = true;
      fit();
      if (dirtyReload) { dirtyReload = false; scheduleReload(); } else if (pausedByHide) {
        paused = false;
        resumeSong();
        drawBar();
      }
      pausedByHide = false;
    },
    onHide() {
      visible = false;
      keys.clear();
      stopAudio();
      pausedByHide = !!(vm && running && !paused);
      if (pausedByHide) paused = true;
      drawBar();
    },
    refresh(kind) { if (kind === 'palette' || kind === 'sound') { /* sons e paletas recarregam na próxima rodada */ } scheduleReload(); drawBar(); },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopAudio();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    },
    get vm() { return vm; },
  };
}
