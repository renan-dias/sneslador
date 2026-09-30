// Leitor de arquivos do Aseprite (.ase / .aseprite).
// Especificação: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
// Resultado: quadros em RGBA (camadas visíveis já combinadas) + tags (animações).

/**
 * @param {Uint8Array} bytes
 * @param {(data: Uint8Array) => Promise<Uint8Array>|Uint8Array} inflate  descompactador zlib
 * @returns {Promise<{w:number, h:number, frames:{rgba:Uint8ClampedArray, duration:number}[], tags:{name:string, from:number, to:number}[]}>}
 */
export async function parseAseprite(bytes, inflate) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint16(4, true) !== 0xa5e0) throw new Error('Não é um arquivo do Aseprite');
  const nFrames = dv.getUint16(6, true);
  const w = dv.getUint16(8, true);
  const h = dv.getUint16(10, true);
  const depth = dv.getUint16(12, true);
  const transparentIndex = bytes[28];
  let palette = [];
  const layers = [];
  const tags = [];
  const frames = [];
  const celCache = []; // [frame][layer] -> cel (para cels "linkados")
  let off = 128;

  for (let f = 0; f < nFrames; f++) {
    const frameSize = dv.getUint32(off, true);
    const oldChunks = dv.getUint16(off + 6, true);
    const duration = dv.getUint16(off + 8, true);
    const newChunks = dv.getUint32(off + 12, true);
    const nChunks = newChunks || oldChunks;
    let c = off + 16;
    const cels = [];
    celCache[f] = cels;
    for (let k = 0; k < nChunks; k++) {
      const size = dv.getUint32(c, true);
      const type = dv.getUint16(c + 4, true);
      const d = c + 6;
      if (type === 0x2004) {
        const flags = dv.getUint16(d, true);
        const layerType = dv.getUint16(d + 2, true);
        const blend = dv.getUint16(d + 10, true);
        const opacity = bytes[d + 12];
        layers.push({ visible: !!(flags & 1), group: layerType === 1, blend, opacity });
      } else if (type === 0x2019) {
        const total = dv.getUint32(d, true);
        const first = dv.getUint32(d + 4, true);
        const last = dv.getUint32(d + 8, true);
        palette = palette.length >= total ? palette : [...palette, ...new Array(total - palette.length).fill([0, 0, 0, 255])];
        let e = d + 20;
        for (let i = first; i <= last; i++) {
          const fl = dv.getUint16(e, true);
          palette[i] = [bytes[e + 2], bytes[e + 3], bytes[e + 4], bytes[e + 5]];
          e += 6;
          if (fl & 1) e += 2 + dv.getUint16(e, true);
        }
      } else if ((type === 0x0004 || type === 0x0011) && !palette.length) {
        const packets = dv.getUint16(d, true);
        let e = d + 2, idx = 0;
        for (let p = 0; p < packets; p++) {
          idx += bytes[e];
          let n = bytes[e + 1] || 256;
          e += 2;
          while (n--) {
            const mul = type === 0x0011 ? 4 : 1;
            palette[idx++] = [Math.min(255, bytes[e] * mul), Math.min(255, bytes[e + 1] * mul), Math.min(255, bytes[e + 2] * mul), 255];
            e += 3;
          }
        }
      } else if (type === 0x2005) {
        const layer = dv.getUint16(d, true);
        const x = dv.getInt16(d + 2, true);
        const y = dv.getInt16(d + 4, true);
        const opacity = bytes[d + 6];
        const celType = dv.getUint16(d + 7, true);
        const zIndex = dv.getInt16(d + 9, true);
        let cel = null;
        if (celType === 1) {
          const linked = dv.getUint16(d + 16, true);
          const src = celCache[linked]?.find((cc) => cc.layer === layer);
          if (src) cel = { ...src, x, y };
        } else if (celType === 0 || celType === 2) {
          const cw = dv.getUint16(d + 16, true);
          const chh = dv.getUint16(d + 18, true);
          let px = bytes.subarray(d + 20, c + size);
          if (celType === 2) px = await inflate(px);
          cel = { layer, x, y, w: cw, h: chh, px, opacity, zIndex };
        }
        if (cel) cels.push({ ...cel, layer });
      } else if (type === 0x2018) {
        const n = dv.getUint16(d, true);
        let e = d + 10;
        for (let t = 0; t < n; t++) {
          const from = dv.getUint16(e, true);
          const to = dv.getUint16(e + 2, true);
          const len = dv.getUint16(e + 17, true);
          const name = new TextDecoder().decode(bytes.subarray(e + 19, e + 19 + len));
          tags.push({ name, from, to });
          e += 19 + len;
        }
      }
      c += size;
    }
    // compõe as camadas visíveis (ordem das camadas = de baixo para cima)
    const rgba = new Uint8ClampedArray(w * h * 4);
    const ordered = cels.slice().sort((a, b) => a.layer + (a.zIndex ?? 0) - (b.layer + (b.zIndex ?? 0)));
    for (const cel of ordered) {
      const L = layers[cel.layer];
      if (!L || !L.visible || L.group) continue;
      const alphaMul = (cel.opacity / 255) * (L.opacity / 255);
      for (let yy = 0; yy < cel.h; yy++) {
        for (let xx = 0; xx < cel.w; xx++) {
          const X = cel.x + xx, Y = cel.y + yy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          let r, g, b, a;
          const i = yy * cel.w + xx;
          if (depth === 32) { r = cel.px[i * 4]; g = cel.px[i * 4 + 1]; b = cel.px[i * 4 + 2]; a = cel.px[i * 4 + 3]; }
          else if (depth === 16) { r = g = b = cel.px[i * 2]; a = cel.px[i * 2 + 1]; }
          else {
            const idx = cel.px[i];
            if (idx === transparentIndex) continue;
            [r, g, b, a] = palette[idx] ?? [0, 0, 0, 0];
          }
          a = Math.round(a * alphaMul);
          if (a < 128) continue; // o SNES não tem transparência parcial em sprites
          const o = (Y * w + X) * 4;
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
        }
      }
    }
    frames.push({ rgba, duration });
    off += frameSize;
  }
  return { w, h, frames, tags };
}

/** Descompactador zlib usando a API do navegador (DecompressionStream). */
export async function browserInflate(data) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Escreve um .aseprite (RGBA, 1 camada) com quadros e tags. Útil para editar no Aseprite e reimportar.
 * @param {{w:number, h:number, frames:{rgba:Uint8Array|Uint8ClampedArray, duration:number}[], tags:{name:string, from:number, to:number}[]}} spr
 * @param {(data: Uint8Array) => Promise<Uint8Array>|Uint8Array} deflate  compactador zlib
 */
export async function writeAseprite(spr, deflate) {
  const parts = [];
  const u8 = (n) => Uint8Array.of(n & 255);
  const u16 = (n) => Uint8Array.of(n & 255, (n >> 8) & 255);
  const u32 = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
  const zeros = (n) => new Uint8Array(n);
  const str = (s) => { const b = new TextEncoder().encode(s); return concat([u16(b.length), b]); };
  const chunk = (type, body) => concat([u32(body.length + 6), u16(type), body]);
  const frames = [];
  for (let f = 0; f < spr.frames.length; f++) {
    const chunks = [];
    if (f === 0) {
      chunks.push(chunk(0x2004, concat([u16(1 | 2), u16(0), u16(0), u16(0), u16(0), u16(0), u8(255), zeros(3), str('Camada 1')])));
      if (spr.tags.length) {
        chunks.push(chunk(0x2018, concat([u16(spr.tags.length), zeros(8), ...spr.tags.map((t) => concat([u16(t.from), u16(t.to), u8(0), u16(0), zeros(6), zeros(3), u8(0), str(t.name)]))])));
      }
    }
    const px = await deflate(new Uint8Array(spr.frames[f].rgba));
    chunks.push(chunk(0x2005, concat([u16(0), u16(0), u16(0), u8(255), u16(2), u16(0), zeros(5), u16(spr.w), u16(spr.h), px])));
    const body = concat(chunks);
    frames.push(concat([u32(body.length + 16), u16(0xf1fa), u16(chunks.length), u16(spr.frames[f].duration || 100), zeros(2), u32(chunks.length), body]));
  }
  const all = concat(frames);
  const header = concat([u32(128 + all.length), u16(0xa5e0), u16(spr.frames.length), u16(spr.w), u16(spr.h), u16(32), u32(1), u16(100), u32(0), u32(0), u8(0), zeros(3), u16(0), u8(1), u8(1), u16(0), u16(0), u16(0), u16(0), zeros(84)]);
  parts.push(header, all);
  return concat(parts);
}

function concat(list) {
  const n = list.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}

export async function browserDeflate(data) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
