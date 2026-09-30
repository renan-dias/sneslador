import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileProject } from '../app/core/compile.js';
import { VirtualSNES, W, H } from '../app/core/runtime/console.js';
import { TEMPLATES } from '../app/core/templates/index.js';
import { TUTORIALS } from '../app/core/tutorials/index.js';
import { encodePng } from './png.js';

export function runProject(project, frames = 120, pad = () => 0) {
  const res = compileProject(project);
  assert.ok(res.ok, JSON.stringify([...res.problems, ...res.errors.map((e) => `${e.file}:${e.line} ${e.msg}`)], null, 1));
  const errors = [];
  const vm = new VirtualSNES(res.data, res.compiled.js, { onError: (e) => errors.push(e), onWarn: (w) => errors.push({ msg: 'AVISO ' + w }) });
  for (let i = 0; i < frames; i++) { vm.setPad(pad(i)); vm.step(); }
  assert.deepEqual(errors, []);
  return vm;
}

for (const t of TEMPLATES) {
  test(`modelo ${t.id} compila e roda`, () => {
    const { project } = t.create('Teste');
    const vm = runProject(project, 400, (i) => ((i >> 5) & 1 ? 1 << 10 : 0) | (i % 7 === 0 ? 1 << 3 : 0) | (i % 11 === 0 ? 1 << 5 : 0));
    fs.writeFileSync(`tests/out/tpl_${t.id}.png`, encodePng(vm.render(), W, H, 2));
  });
}

for (const tut of TUTORIALS) {
  test(`tutorial ${tut.id}: cada passo "fazer para mim" deixa o projeto válido`, async () => {
    const tpl = TEMPLATES.find((t) => t.id === tut.template);
    const { project } = tpl.create('Tut', { tutorial: true });
    const hp = (p) => ({
      p,
      scene: (n) => p.scenes.find((s) => s.name === n),
      sprite: (n) => p.sprites.find((s) => s.name === n),
      tileset: (n) => p.tilesets.find((s) => s.name === n),
      song: (n) => (p.songs ?? []).find((s) => s.name === n),
      sound: (n) => p.sounds.find((s) => s.name === n),
      code: (n) => (n === 'global' ? p.globalScript : p.scenes.find((s) => s.name === n)?.script ?? ''),
      compiles: () => compileProject(p).ok,
      has: (n, ...frags) => { const norm = (s) => s.replace(/\/\/.*$/gm, '').replace(/\s+/g, '').toLowerCase(); const src = norm(n === 'global' ? p.globalScript : p.scenes.find((s) => s.name === n)?.script ?? ''); return frags.every((f) => src.includes(norm(f))); },
    });
    const fakeCtx = { store: { change: (k, fn) => fn(project), project }, api: { writeAsset: async () => {} }, dir: '' , testMode: true };
    for (const [i, step] of tut.steps.entries()) {
      if (step.apply) await step.apply(hp(project), fakeCtx);
      if (step.check) assert.ok(step.check(hp(project)), `passo ${i + 1} "${step.title}": check falhou depois do apply`);
      const res = compileProject(project);
      assert.ok(res.ok, `passo ${i + 1} "${step.title}": ${JSON.stringify([...res.problems, ...res.errors])}`);
    }
    runProject(project, 200);
  });
}
