// Editor de efeitos sonoros: gerador retrô (estilo sfxr) ou WAV importado.
import { h, clear, toast } from '../../shared/ui.js';
import { uid } from '../../../core/project.js';
import { SFX_PRESETS, PRESET_LABELS, randomSfx, renderSfx, SFX_RATE } from '../../../core/audio/sfxgen.js';
import { encodeWav16, parseWav, resample, brrSize } from '../../../core/audio/wav.js';
import { playPcm, loadSound, playBuffer } from '../audio.js';

export async function makeDefaultSound(ctx, name, preset = 'blip') {
  const gen = { ...SFX_PRESETS[preset] };
  const id = uid('snd');
  const file = `sounds/${id}.wav`;
  await ctx.api.writeAsset(ctx.dir, file, encodeWav16(renderSfx(gen), SFX_RATE));
  const s = { id, name, file, volume: 15, gen, rev: 0 };
  ctx.store.change('sound', (p) => { p.sounds.push(s); });
  return s;
}

const PARAMS = [
  ['freq', 'Tom (Hz)', 40, 2000, 1],
  ['slide', 'Deslize', -4, 4, 0.05],
  ['dur', 'Duração (s)', 0.03, 1.2, 0.01],
  ['attack', 'Ataque', 0, 0.3, 0.005],
  ['decay', 'Decaimento', 0.02, 1.2, 0.01],
  ['duty', 'Largura pulso', 0.05, 0.5, 0.01],
  ['arpStep', 'Arpejo (semitons)', -12, 12, 1],
  ['arpTime', 'Tempo arpejo', 0.01, 0.4, 0.01],
  ['vibDepth', 'Vibrato', 0, 1, 0.01],
  ['vibSpeed', 'Vel. vibrato', 1, 60, 1],
  ['noiseMix', 'Ruído', 0, 1, 0.01],
  ['lowpass', 'Brilho (filtro)', 0.02, 1, 0.01],
  ['volume', 'Volume', 0.1, 1, 0.01],
];

export function mount(el, ctx, id) {
  const { store, api } = ctx;
  const snd = () => store.sound(id);
  const wave = h('canvas', { width: 600, height: 110, style: { width: '100%', height: '110px', background: '#0b0b14', borderRadius: '8px' } });
  const left = h('div.col', { style: { flex: 1, padding: '16px', overflow: 'auto', minWidth: 0 } });
  const side = h('div.sidepanel');
  el.append(h('div.row', { style: { flex: 1, alignItems: 'stretch', gap: 0, minHeight: 0 } }, left, side));
  let writeTimer = null;
  let cachedPcm = null;

  async function currentPcm() {
    const s = snd();
    if (s.gen) return { pcm: renderSfx(s.gen), rate: SFX_RATE };
    const bytes = await api.readAsset(ctx.dir, s.file);
    if (!bytes) return { pcm: new Float32Array(1), rate: 8000 };
    const w = parseWav(bytes);
    return { pcm: w.samples, rate: w.rate };
  }

  async function drawWave() {
    const { pcm, rate } = await currentPcm();
    cachedPcm = { pcm, rate };
    const g = wave.getContext('2d');
    g.clearRect(0, 0, wave.width, wave.height);
    g.strokeStyle = '#34365a';
    g.beginPath(); g.moveTo(0, 55); g.lineTo(600, 55); g.stroke();
    g.strokeStyle = '#7c5cff';
    g.beginPath();
    for (let x = 0; x < 600; x++) {
      const a = Math.floor((x / 600) * pcm.length), b = Math.floor(((x + 1) / 600) * pcm.length);
      let mn = 0, mx = 0;
      for (let i = a; i < Math.max(b, a + 1); i++) { mn = Math.min(mn, pcm[i] ?? 0); mx = Math.max(mx, pcm[i] ?? 0); }
      g.moveTo(x + 0.5, 55 - mx * 50);
      g.lineTo(x + 0.5, 55 - mn * 50 + 1);
    }
    g.stroke();
    drawSide();
  }

  function play(authentic = true) {
    if (!cachedPcm) return;
    const { pcm, rate } = cachedPcm;
    const vol = (snd().volume ?? 15) / 15;
    if (authentic) {
      const r = store.project.soundRate ?? 8000;
      playPcm(resample(pcm, rate, r), r, { gain: vol });
    } else playPcm(pcm, rate, { gain: vol });
  }

  function setGen(patch, playIt = true) {
    const s = snd();
    const gen = { ...(s.gen ?? SFX_PRESETS.blip), ...patch };
    store.change('sound', () => { s.gen = gen; }, { id, coalesce: 'sfxparam' });
    drawWave().then(() => { if (playIt) play(); });
    clearTimeout(writeTimer);
    writeTimer = setTimeout(async () => {
      await api.writeAsset(ctx.dir, s.file, encodeWav16(renderSfx(gen), SFX_RATE));
      store.change('sound', () => { s.rev = (s.rev ?? 0) + 1; }, { id, undoable: false });
    }, 300);
  }

  function drawLeft() {
    const s = snd();
    const gen = s.gen;
    clear(left,
      h('div.row', h('h2.grow', `🔊 ${s.name}`),
        h('button.btn.primary', { onclick: () => play(true), title: 'Toca na qualidade da ROM' }, '▶ Tocar (como no SNES)'),
        h('button.btn', { onclick: () => play(false), title: 'Toca na qualidade original' }, '▶ Original')),
      wave,
      h('div', h('h3', { style: { margin: '10px 0 6px', fontSize: '13px' } }, 'Comece por um modelo'),
        h('div.row', { style: { flexWrap: 'wrap' } },
          Object.keys(SFX_PRESETS).map((k) => h('button.btn.small', { 'data-preset': k, onclick: () => { setGen(SFX_PRESETS[k]); drawLeft(); } }, PRESET_LABELS[k])),
          h('button.btn.small.y', { onclick: () => { setGen(randomSfx()); drawLeft(); } }, '🎲 Aleatório'))),
      gen ? h('div', { style: { marginTop: '12px', maxWidth: '560px' } },
        h('div.row', h('span', { style: { width: '120px' } }, 'Forma de onda'),
          ['square', 'triangle', 'saw', 'sine', 'noise'].map((w) => h('button.btn.small', { class: gen.wave === w ? 'active' : '', onclick: () => { setGen({ wave: w }); drawLeft(); } },
            { square: '⊓ Quadrada', triangle: '△ Triangular', saw: '⩘ Serra', sine: '∿ Seno', noise: '▒ Ruído' }[w]))),
        PARAMS.map(([k, label, min, max, step]) => h('div.slider', { style: { gridTemplateColumns: '120px 1fr 50px' } }, h('span', label),
          h('input', { type: 'range', min, max, step, value: gen[k], oninput: (e) => { setGen({ [k]: Number(e.target.value) }, false); e.target.nextSibling.textContent = e.target.value; }, onchange: () => play() }),
          h('span.mono', String(gen[k])))))
        : h('p.hint', { style: { marginTop: '12px' } }, 'Este som veio de um arquivo WAV importado. Para usar o gerador, clique num modelo acima.'));
  }

  function drawSide() {
    const s = snd();
    const rate = store.project.soundRate ?? 8000;
    const samples = cachedPcm ? Math.round((cachedPcm.pcm.length * rate) / cachedPcm.rate) : 0;
    clear(side,
      h('div.rsec', h('h3', 'Som'),
        h('div.slider', h('span', 'Volume'), h('input', { type: 'range', min: 0, max: 15, value: s.volume ?? 15, oninput: (e) => store.change('sound', () => { s.volume = Number(e.target.value); }, { id, coalesce: 'vol' }) }), h('span.mono', String(s.volume ?? 15))),
        h('button.btn.small', { style: { marginTop: '8px' }, onclick: importWav }, '📥 Importar WAV...')),
      h('div.rsec', h('h3', 'No SNES'),
        h('p.hint', `Taxa do projeto: ${rate} Hz · ${samples} amostras · ~${brrSize(samples)} bytes em BRR.`),
        h('p.hint', 'O chip de som SPC700 tem só 64 KB de RAM para TODOS os sons e músicas. Por isso os sons de SNES são curtos e com taxa baixa — é daí que vem aquele "chiado" característico!'),
        h('div.fact', 'No código: ', h('span.mono', `sfx(${s.name})`))));
  }

  async function importWav() {
    const files = await api.openFileDialog({ title: 'Importar WAV', filters: [{ name: 'Áudio WAV', extensions: ['wav'] }] });
    if (!files.length) return;
    try {
      const w = parseWav(files[0].data);
      const pcm = resample(w.samples, w.rate, 22050);
      if (pcm.length / 22050 > 3) toast('Som longo! Na ROM ele vai ocupar bastante RAM de áudio. Prefira sons com menos de 1 segundo.', '');
      const s = snd();
      await api.writeAsset(ctx.dir, s.file, encodeWav16(pcm, 22050));
      store.change('sound', () => { s.gen = null; s.rev = (s.rev ?? 0) + 1; }, { id });
      drawLeft();
      await drawWave();
      play();
    } catch (e) { toast('Não consegui ler o WAV: ' + e.message, 'err'); }
  }

  drawLeft();
  drawWave();
  void loadSound; void playBuffer;
  return {
    refresh(kind) { if (kind === 'sound' || kind === 'all') { if (!left.contains(document.activeElement)) drawLeft(); drawWave(); } },
    dispose() { clearTimeout(writeTimer); },
  };
}
