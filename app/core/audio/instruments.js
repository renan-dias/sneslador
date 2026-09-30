// Instrumentos sintetizados (originais) do compositor estilo Mario Paint.
// Cada instrumento é UMA amostra curta tocando a nota C4 (Dó central); outras notas mudam a velocidade
// de reprodução — exatamente como o chip de som do SNES faz com amostras BRR.

export const INSTRUMENT_RATE = 12000; // Hz: amostras pequenas cabem na RAM de áudio (64 KB)
export const BASE_MIDI = 60; // C4
const BASE_FREQ = 261.6256;

export const INSTRUMENTS = [
  { id: 'cogumelo', icon: '🍄', name: 'Cogumelo', desc: 'onda quadrada, som clássico de videogame', color: '#e5484d' },
  { id: 'estrela', icon: '⭐', name: 'Estrela', desc: 'onda triangular suave, parece flauta', color: '#f5c542' },
  { id: 'sino', icon: '🔔', name: 'Sino', desc: 'som metálico de sino (síntese FM)', color: '#3ecf6e' },
  { id: 'piano', icon: '🎹', name: 'Piano', desc: 'corda dedilhada (algoritmo Karplus-Strong)', color: '#e8e8f4' },
  { id: 'baixo', icon: '🐘', name: 'Baixo', desc: 'onda dente-de-serra grave', color: '#a48bff' },
  { id: 'gato', icon: '🐱', name: 'Gato', desc: 'miau! (filtro que muda de formato)', color: '#ff9f43' },
  { id: 'tambor', icon: '🥁', name: 'Tambor', desc: 'ruído branco curto (caixa)', color: '#3e8bff' },
  { id: 'bumbo', icon: '💥', name: 'Bumbo', desc: 'bumbo grave (seno que cai de tom)', color: '#ff6b9d' },
];

const cache = new Map();

/** Gera a amostra do instrumento (Float32, mono) em INSTRUMENT_RATE. */
export function renderInstrument(id, rate = INSTRUMENT_RATE) {
  const key = `${id}@${rate}`;
  if (cache.has(key)) return cache.get(key);
  const dur = { piano: 0.5, sino: 0.55, baixo: 0.4, gato: 0.42, tambor: 0.16, bumbo: 0.22 }[id] ?? 0.34;
  const n = Math.floor(rate * dur);
  const out = new Float32Array(n);
  const f = BASE_FREQ;
  const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
  let seed = 12345;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x3fffffff) - 1; };

  if (id === 'piano') {
    // Karplus-Strong: um buffer de ruído que vai sendo filtrado = corda vibrando
    const period = Math.round(rate / f);
    const buf = new Float32Array(period).map(() => noise() * 0.8);
    for (let i = 0; i < n; i++) {
      const j = i % period;
      const next = (j + 1) % period;
      const v = buf[j];
      buf[j] = 0.996 * 0.5 * (buf[j] + buf[next]);
      out[i] = v;
    }
  } else {
    let phase = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let v = 0;
      switch (id) {
        case 'cogumelo': phase += f / rate; v = (phase % 1 < 0.5 ? 0.6 : -0.6) * env(t, 0.005, 0.18); break;
        case 'estrela': phase += f / rate; { const p = phase % 1; v = (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.8 * env(t, 0.02, 0.2); } break;
        case 'sino': { const m = Math.sin(2 * Math.PI * f * 3.5 * t) * 2.2 * Math.exp(-t / 0.15); v = Math.sin(2 * Math.PI * f * t + m) * 0.65 * env(t, 0.002, 0.25); } break;
        case 'baixo': phase += (f / 2) / rate; { const saw = (phase % 1) * 2 - 1; lp += (saw - lp) * 0.25; v = lp * 0.9 * env(t, 0.005, 0.2); } break;
        case 'gato': {
          const vib = 1 + 0.03 * Math.sin(2 * Math.PI * 6 * t);
          phase += (f * vib) / rate;
          const saw = (phase % 1) * 2 - 1;
          const formant = 0.08 + 0.35 * Math.sin(Math.PI * Math.min(1, t / dur)); // "mi-a-u": o filtro abre e fecha
          lp += (saw - lp) * formant;
          v = lp * 0.9 * env(t, 0.03, 0.25) * (t > dur * 0.8 ? (dur - t) / (dur * 0.2) : 1);
        } break;
        case 'tambor': v = noise() * 0.7 * Math.exp(-t / 0.045) + Math.sin(2 * Math.PI * 190 * t) * 0.25 * Math.exp(-t / 0.03); break;
        case 'bumbo': { const fr = 55 + 120 * Math.exp(-t / 0.03); phase += fr / rate; v = Math.sin(2 * Math.PI * phase) * 0.95 * Math.exp(-t / 0.09); } break;
        default: v = 0;
      }
      out[i] = v;
    }
  }
  // suaviza o fim para não estalar
  const fade = Math.min(200, n);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  cache.set(key, out);
  return out;
}
