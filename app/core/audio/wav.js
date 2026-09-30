// Leitura/escrita de WAV PCM e reamostragem simples (sem dependências).

export function parseWav(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Arquivo não é um WAV válido');
  let o = 12;
  let fmt = null;
  let data = null;
  while (o + 8 <= u8.length) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(o + 8, true),
        channels: dv.getUint16(o + 10, true),
        rate: dv.getUint32(o + 12, true),
        bits: dv.getUint16(o + 22, true),
      };
    } else if (id === 'data') {
      data = { off: o + 8, size: Math.min(size, u8.length - o - 8) };
    }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV sem blocos fmt/data');
  if (fmt.format !== 1 && fmt.format !== 3) throw new Error('Só WAV PCM é suportado (sem compressão)');
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.size / (bytes * fmt.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = data.off + (i * fmt.channels + c) * bytes;
      let v;
      if (fmt.format === 3) v = bytes === 4 ? dv.getFloat32(p, true) : dv.getFloat64(p, true);
      else if (bytes === 1) v = (u8[p] - 128) / 128;
      else if (bytes === 2) v = dv.getInt16(p, true) / 32768;
      else if (bytes === 3) v = ((u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16)) << 8 >> 8) / 8388608;
      else v = dv.getInt32(p, true) / 2147483648;
      acc += v;
    }
    out[i] = acc / fmt.channels;
  }
  return { rate: fmt.rate, samples: out };
}

export function resample(samples, from, to) {
  if (from === to) return samples;
  const len = Math.max(1, Math.round(samples.length * to / from));
  const out = new Float32Array(len);
  const ratio = from / to;
  for (let i = 0; i < len; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i0 + 1] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

export function encodeWav16(samples, rate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Uint8Array(buf);
}

/** Tamanho aproximado em BRR: blocos de 9 bytes para cada 16 amostras. */
export function brrSize(sampleCount) {
  return Math.ceil(sampleCount / 16) * 9;
}
