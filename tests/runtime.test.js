import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGameData } from '../app/core/gamedata.js';
import { compileGame } from '../app/core/lang/compiler.js';
import { assetConstants } from '../app/core/project.js';
import { VirtualSNES, W, H } from '../app/core/runtime/console.js';
import { sampleProject } from './fixtures.js';
import { encodePng } from './png.js';

function boot(p) {
  const data = buildGameData(p);
  const out = compileGame({ global: { src: p.globalScript }, scenes: p.scenes.map((s) => ({ name: s.name, src: s.script })), assetConsts: assetConstants(p) });
  assert.ok(out.ok, JSON.stringify(out.errors));
  const errors = [];
  const vm = new VirtualSNES(data, out.js, { onError: (e) => errors.push(e) });
  return { vm, errors };
}

test('console virtual roda a cena, coleta moeda e troca de cena', () => {
  const { vm, errors } = boot(sampleProject());
  for (let i = 0; i < 90; i++) vm.step();
  assert.deepEqual(errors, []);
  assert.equal(vm.scene, 0);
  // a moeda na coluna 6 da linha 22 foi coletada durante a queda
  assert.equal(vm.makeApi().tile(6, 22), -1);
  assert.equal(vm.makeApi().tile(4, 22), 2);
  fs.writeFileSync('tests/out/cena0.png', encodePng(vm.render(), W, H, 2));
  vm.setPad(1 << 10); vm.step(); vm.setPad(0);
  for (let i = 0; i < 30; i++) vm.step();
  assert.equal(vm.scene, 1);
  fs.writeFileSync('tests/out/cena1.png', encodePng(vm.render(), W, H, 2));
});
