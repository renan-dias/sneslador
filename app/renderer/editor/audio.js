// Áudio do editor (Web Audio): toca efeitos e músicas imitando a taxa de amostragem da ROM.
import { parseWav, resample } from '../../core/audio/wav.js';
import { renderInstrument, INSTRUMENT_RATE, BASE_MIDI } from '../../core/audio/instruments.js';
import { songColumns, noteMidi } from '../../core/audio/song.js';

let ac = null;
let master = null;
const buffers = new Map(); // chave -> AudioBuffer
let muted = false;

export function audioCtx() {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export function isMuted() { return muted; }

export function pcmBuffer(pcm, rate) {
  const ctx = audioCtx();
  const b = ctx.createBuffer(1, Math.max(1, pcm.length), rate);
  b.copyToChannel(pcm, 0);
  return b;
}

export function playPcm(pcm, rate, { playbackRate = 1, when = 0, gain = 1 } = {}) {
  const ctx = audioCtx();
  const src = ctx.createBufferSource();
  src.buffer = pcmBuffer(pcm, rate);
  src.playbackRate.value = playbackRate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(when || 0);
  return src;
}

/** Carrega o WAV do som e reamostra para a taxa do projeto (soa como no SNES). */
export async function loadSound(api, dir, sound, projectRate) {
  const key = `${sound.id}:${sound.file}:${sound.rev ?? 0}:${projectRate}`;
  if (buffers.has(key)) return buffers.get(key);
  const bytes = await api.readAsset(dir, sound.file);
  if (!bytes) return null;
  const { rate, samples } = parseWav(bytes);
  const pcm = resample(samples, rate, projectRate);
  const vol = (sound.volume ?? 15) / 15;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= vol;
  const buf = pcmBuffer(pcm, projectRate);
  buffers.set(key, buf);
  return buf;
}

export function playBuffer(buf) {
  if (!buf) return;
  const ctx = audioCtx();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start();
}

// ------------------------------------------------------------------ música
const instBuffers = new Map();
function instBuffer(id) {
  if (!instBuffers.has(id)) instBuffers.set(id, pcmBuffer(renderInstrument(id), INSTRUMENT_RATE));
  return instBuffers.get(id);
}

export function playNote(inst, midi, when = 0) {
  const ctx = audioCtx();
  const src = ctx.createBufferSource();
  src.buffer = instBuffer(inst);
  src.playbackRate.value = Math.pow(2, (midi - BASE_MIDI) / 12);
  src.connect(master);
  src.start(when || ctx.currentTime);
  return src;
}

/**
 * Toca uma música com agendamento antecipado. Retorna {stop(), position()}.
 * Cada canal (0..2) corta a nota anterior, como no módulo .it da ROM.
 */
export function playSong(song, { loop = true, onColumn } = {}) {
  const ctx = audioCtx();
  const cols = songColumns(song);
  const spc = 60 / song.tempo;
  let col = 0;
  let next = ctx.currentTime + 0.06;
  const startTime = next;
  const channels = [null, null, null];
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    while (next < ctx.currentTime + 0.15) {
      if (col >= cols.length) {
        if (!loop) { stopped = true; return; }
        col = 0;
      }
      const notes = cols[col];
      notes.forEach((n, ch) => {
        try { channels[ch]?.stop(next); } catch { /* já terminou */ }
        channels[ch] = playNote(n.i, noteMidi(n), next);
      });
      if (onColumn) { const c = col, t = next; setTimeout(() => !stopped && onColumn(c), Math.max(0, (t - ctx.currentTime) * 1000)); }
      col++;
      next += spc;
    }
  };
  tick();
  const iv = setInterval(tick, 25);
  return {
    stop() { stopped = true; clearInterval(iv); channels.forEach((c) => { try { c?.stop(); } catch { /* ok */ } }); },
    get elapsed() { return ctx.currentTime - startTime; },
  };
}
