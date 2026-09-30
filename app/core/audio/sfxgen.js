// Gerador de efeitos sonoros retrô (inspirado no sfxr): alguns controles simples viram um som.
export const SFX_RATE = 22050;

export const SFX_PRESETS = {
  moeda: { wave: 'square', freq: 988, slide: 0, dur: 0.28, attack: 0, decay: 0.2, duty: 0.5, arpStep: 5, arpTime: 0.06, vibDepth: 0, vibSpeed: 0, noiseMix: 0, lowpass: 1, volume: 0.7 },
  pulo: { wave: 'square', freq: 300, slide: 1.2, dur: 0.25, attack: 0, decay: 0.2, duty: 0.25, arpStep: 0, arpTime: 0, vibDepth: 0, vibSpeed: 0, noiseMix: 0, lowpass: 1, volume: 0.7 },
  tiro: { wave: 'saw', freq: 900, slide: -2.4, dur: 0.22, attack: 0, decay: 0.12, duty: 0.5, arpStep: 0, arpTime: 0, vibDepth: 0, vibSpeed: 0, noiseMix: 0.2, lowpass: 0.8, volume: 0.6 },
  explosao: { wave: 'noise', freq: 120, slide: -0.6, dur: 0.7, attack: 0, decay: 0.45, duty: 0.5, arpStep: 0, arpTime: 0, vibDepth: 0, vibSpeed: 0, noiseMix: 1, lowpass: 0.35, volume: 0.9 },
  dano: { wave: 'square', freq: 220, slide: -1.5, dur: 0.3, attack: 0, decay: 0.25, duty: 0.4, arpStep: 0, arpTime: 0, vibDepth: 0.3, vibSpeed: 30, noiseMix: 0.35, lowpass: 0.7, volume: 0.7 },
  powerup: { wave: 'triangle', freq: 330, slide: 0.6, dur: 0.6, attack: 0.01, decay: 0.5, duty: 0.5, arpStep: 4, arpTime: 0.07, vibDepth: 0, vibSpeed: 0, noiseMix: 0, lowpass: 1, volume: 0.8 },
  blip: { wave: 'square', freq: 660, slide: 0, dur: 0.07, attack: 0, decay: 0.06, duty: 0.5, arpStep: 0, arpTime: 0, vibDepth: 0, vibSpeed: 0, noiseMix: 0, lowpass: 1, volume: 0.6 },
  laser: { wave: 'sine', freq: 1500, slide: -3, dur: 0.3, attack: 0, decay: 0.25, duty: 0.5, arpStep: 0, arpTime: 0, vibDepth: 0.1, vibSpeed: 40, noiseMix: 0, lowpass: 1, volume: 0.7 },
};

export const PRESET_LABELS = { moeda: '🪙 Moeda', pulo: '🦘 Pulo', tiro: '🔫 Tiro', explosao: '💥 Explosão', dano: '🤕 Dano', powerup: '⭐ Power-up', blip: '🔘 Menu (blip)', laser: '⚡ Laser' };

export function randomSfx(base = 'blip') {
  const p = { ...SFX_PRESETS[base] };
  const r = (a, b) => a + Math.random() * (b - a);
  p.wave = ['square', 'saw', 'sine', 'triangle', 'noise'][Math.floor(Math.random() * 5)];
  p.freq = Math.round(r(100, 1500));
  p.slide = +r(-3, 2).toFixed(2);
  p.dur = +r(0.08, 0.6).toFixed(2);
  p.decay = +(p.dur * r(0.5, 1)).toFixed(2);
  p.duty = +r(0.1, 0.5).toFixed(2);
  p.arpStep = Math.random() < 0.3 ? Math.round(r(-7, 12)) : 0;
  p.arpTime = +r(0.03, 0.15).toFixed(2);
  p.vibDepth = Math.random() < 0.3 ? +r(0, 0.4).toFixed(2) : 0;
  p.vibSpeed = Math.round(r(5, 40));
  p.noiseMix = Math.random() < 0.2 ? +r(0, 0.6).toFixed(2) : 0;
  p.lowpass = +r(0.3, 1).toFixed(2);
  return p;
}

export function renderSfx(p, rate = SFX_RATE) {
  const n = Math.max(1, Math.floor(p.dur * rate));
  const out = new Float32Array(n);
  let phase = 0;
  let lp = 0;
  let seed = 22222;
  let noiseVal = 0;
  let noisePhase = 0;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let f = p.freq * Math.pow(2, p.slide * t * 2);
    if (p.arpStep && t >= p.arpTime) f *= Math.pow(2, p.arpStep / 12);
    if (p.vibDepth) f *= 1 + p.vibDepth * 0.5 * Math.sin(2 * Math.PI * p.vibSpeed * t);
    f = Math.max(20, Math.min(10000, f));
    phase += f / rate;
    const ph = phase % 1;
    let v;
    switch (p.wave) {
      case 'square': v = ph < p.duty ? 1 : -1; break;
      case 'saw': v = ph * 2 - 1; break;
      case 'sine': v = Math.sin(2 * Math.PI * ph); break;
      case 'triangle': v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      default: v = 0;
    }
    noisePhase += (f * 2) / rate;
    if (noisePhase >= 1) { noisePhase -= Math.floor(noisePhase); noiseVal = noise(); }
    if (p.wave === 'noise') v = noiseVal;
    else if (p.noiseMix) v = v * (1 - p.noiseMix) + noiseVal * p.noiseMix;
    lp += (v - lp) * Math.max(0.02, p.lowpass);
    v = lp;
    const env = t < p.attack ? t / Math.max(0.001, p.attack) : Math.max(0, 1 - (t - p.attack) / Math.max(0.01, p.decay));
    out[i] = v * env * p.volume;
  }
  return out;
}
