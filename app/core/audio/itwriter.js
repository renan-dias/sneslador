// Escreve módulos Impulse Tracker (.it) — formato que o smconv (PVSnesLib/snesmod) converte para o SPC700.
import { INSTRUMENTS, INSTRUMENT_RATE, renderInstrument } from './instruments.js';
import { songColumns, noteMidi, instrumentsUsed } from './song.js';

/**
 * @param {object} m
 * @param {string} m.name
 * @param {{name:string, pcm:Float32Array, rate:number}[]} m.samples
 * @param {{rows:number, events:{row:number, ch:number, note:number, sample:number, vol?:number}[]}[]} m.patterns
 * @param {number[]} m.orders
 * @param {number} m.speed
 * @param {number} m.tempo
 */
export function writeIT(m) {
  const chunks = [];
  let size = 0;
  const push = (u8) => { chunks.push(u8); size += u8.length; return size - u8.length; };

  const ordNum = m.orders.length + 1;
  const headerSize = 0xc0 + ordNum + m.samples.length * 4 + m.patterns.length * 4;
  const header = new Uint8Array(headerSize);
  const hv = new DataView(header.buffer);
  str(header, 0, 'IMPM', 4);
  str(header, 4, m.name.slice(0, 25), 26);
  hv.setUint16(0x1e, 0x1004, true);
  hv.setUint16(0x20, ordNum, true);
  hv.setUint16(0x22, 0, true);
  hv.setUint16(0x24, m.samples.length, true);
  hv.setUint16(0x26, m.patterns.length, true);
  hv.setUint16(0x28, 0x0214, true);
  hv.setUint16(0x2a, 0x0214, true);
  hv.setUint16(0x2c, 0x0009, true); // estéreo + slides lineares, modo amostra (sem instrumentos)
  header[0x30] = 128; // volume global
  header[0x31] = 48; // mix
  header[0x32] = m.speed;
  header[0x33] = m.tempo;
  header[0x34] = 128;
  for (let c = 0; c < 64; c++) { header[0x40 + c] = c < 8 ? 32 : 32 | 128; header[0x80 + c] = 64; }
  m.orders.forEach((o, i) => { header[0xc0 + i] = o; });
  header[0xc0 + m.orders.length] = 255;
  push(header);

  const smpHdrOffsets = [];
  const smpHeaders = m.samples.map((s) => {
    const hd = new Uint8Array(0x50);
    smpHdrOffsets.push(push(hd));
    return hd;
  });
  const patOffsets = m.patterns.map((p) => push(packPattern(p)));
  m.samples.forEach((s, i) => {
    const pcm = new Uint8Array(s.pcm.length * 2);
    const dv = new DataView(pcm.buffer);
    for (let k = 0; k < s.pcm.length; k++) dv.setInt16(k * 2, Math.round(Math.max(-1, Math.min(1, s.pcm[k])) * 32767), true);
    const ptr = push(pcm);
    const hd = smpHeaders[i];
    const d = new DataView(hd.buffer);
    str(hd, 0, 'IMPS', 4);
    str(hd, 4, `S${i}.RAW`, 12);
    hd[0x11] = 64;
    hd[0x12] = 0x01 | 0x02; // tem amostra + 16 bits
    hd[0x13] = 64;
    str(hd, 0x14, s.name.slice(0, 25), 26);
    hd[0x2e] = 0x01; // com sinal
    hd[0x2f] = 32;
    d.setUint32(0x30, s.pcm.length, true);
    d.setUint32(0x3c, s.rate, true);
    d.setUint32(0x48, ptr, true);
  });

  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  const ov = new DataView(out.buffer);
  const tbl = 0xc0 + ordNum;
  smpHdrOffsets.forEach((off, i) => ov.setUint32(tbl + i * 4, off, true));
  patOffsets.forEach((off, i) => ov.setUint32(tbl + m.samples.length * 4 + i * 4, off, true));
  return out;
}

function packPattern(p) {
  const bytes = [];
  const byRow = new Map();
  for (const e of p.events) {
    if (!byRow.has(e.row)) byRow.set(e.row, []);
    byRow.get(e.row).push(e);
  }
  for (let r = 0; r < p.rows; r++) {
    for (const e of byRow.get(r) ?? []) {
      bytes.push((e.ch + 1) | 0x80, 0x01 | 0x02 | 0x04, e.note, e.sample, e.vol ?? 64);
    }
    bytes.push(0);
  }
  const out = new Uint8Array(8 + bytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, bytes.length, true);
  dv.setUint16(2, p.rows, true);
  out.set(bytes, 8);
  return out;
}

function str(u8, off, s, len) {
  for (let i = 0; i < len; i++) u8[off + i] = i < s.length ? s.charCodeAt(i) & 0x7f : 0;
}

/** Tempo em "colunas por minuto" -> speed/tempo do Impulse Tracker (linha = speed * 2,5 / tempo segundos). */
export function itTiming(colsPerMinute) {
  let speed = Math.max(1, Math.ceil(768 / colsPerMinute));
  let tempo = Math.round((speed * colsPerMinute) / 24);
  while (tempo > 255 && speed > 1) { speed--; tempo = Math.round((speed * colsPerMinute) / 24); }
  return { speed: Math.min(31, speed), tempo: Math.max(32, Math.min(255, tempo)) };
}

/** Módulo 0: só as amostras dos efeitos sonoros (convenção do snesmod). */
export function effectsModule(sounds) {
  return writeIT({
    name: 'efeitos',
    samples: sounds.map((s) => ({ name: s.name, pcm: s.pcm, rate: s.rate })),
    patterns: [{ rows: 32, events: [] }],
    orders: [0],
    speed: 6,
    tempo: 125,
  });
}

/** Converte uma música do compositor num módulo .it. */
export function songModule(song) {
  const used = instrumentsUsed(song).filter((i) => INSTRUMENTS.some((x) => x.id === i));
  const sampleOf = new Map(used.map((id, k) => [id, k + 1]));
  const samples = used.map((id) => ({ name: id, pcm: renderInstrument(id, INSTRUMENT_RATE), rate: INSTRUMENT_RATE }));
  if (!samples.length) samples.push({ name: 'vazio', pcm: new Float32Array(16), rate: INSTRUMENT_RATE });
  const cols = songColumns(song);
  const ROWS = 64;
  const patterns = [];
  for (let start = 0; start < cols.length; start += ROWS) {
    const rows = Math.min(ROWS, cols.length - start);
    const events = [];
    for (let r = 0; r < rows; r++) {
      cols[start + r].forEach((n, ch) => {
        if (!sampleOf.has(n.i)) return;
        events.push({ row: r, ch, note: Math.max(0, Math.min(119, noteMidi(n))), sample: sampleOf.get(n.i), vol: 64 });
      });
    }
    patterns.push({ rows: Math.max(rows, 1), events });
  }
  const { speed, tempo } = itTiming(song.tempo);
  return writeIT({ name: song.name, samples, patterns, orders: patterns.map((_, i) => i), speed, tempo });
}
