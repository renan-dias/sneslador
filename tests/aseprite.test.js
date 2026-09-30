import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseAseprite, writeAseprite } from '../app/core/gfx/aseprite.js';

test('aseprite: escreve e lê de volta (quadros, cores e tags)', async () => {
  const w = 16, h = 16;
  const frame = (r) => { const a = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) if (i % 3 === 0) { a[i * 4] = r; a[i * 4 + 1] = 20; a[i * 4 + 2] = 200; a[i * 4 + 3] = 255; } return a; };
  const bytes = await writeAseprite({ w, h, frames: [{ rgba: frame(250), duration: 100 }, { rgba: frame(10), duration: 50 }], tags: [{ name: 'anda', from: 0, to: 1 }] }, (d) => zlib.deflateSync(d));
  const out = await parseAseprite(bytes, (d) => zlib.inflateSync(d));
  assert.equal(out.w, 16);
  assert.equal(out.frames.length, 2);
  assert.equal(out.frames[1].duration, 50);
  assert.deepEqual(out.tags, [{ name: 'anda', from: 0, to: 1 }]);
  assert.equal(out.frames[0].rgba[0], 250);
  assert.equal(out.frames[1].rgba[0], 10);
  assert.equal(out.frames[0].rgba[7], 0);
});
