import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileGame, instantiate } from '../app/core/lang/compiler.js';

function run(src, calls = {}) {
  const out = compileGame({ global: { src: '' }, scenes: [{ name: 'cena', src }], assetConsts: { heroi: 0 } });
  if (!out.ok) throw new Error(out.errors.map((e) => `${e.line}:${e.col} ${e.msg}`).join('\n'));
  const log = [];
  const api = {
    loop() {}, ai: (a, i) => a[i] ?? 0, as: (a, i, v) => { a[i] = v; },
    num: (x, y, v) => log.push(v), text: (x, y, s) => log.push(s),
    ...calls,
  };
  const game = instantiate(out.js, api);
  game.boot();
  game.scenes[0].init();
  game.scenes[0].start?.();
  return { log, out };
}

test('aritmética de 16 bits com overflow', () => {
  const { log } = run(`
    var a = 32767
    func start()
      a += 1
      num(0,0,a)
      num(0,0, 7 / 2)
      num(0,0, -7 / 2)
      num(0,0, -7 % 3)
      num(0,0, 5 / 0)
      num(0,0, $FFFF)
      num(0,0, 1 << 15)
    end`);
  assert.deepEqual(log, [-32768, 3, -3, -1, 0, -1, -32768]);
});

test('laços, arrays, funções e texto', () => {
  const { log } = run(`
    array t = {1, 2, 3, 4}
    const N = 4
    func soma()
      var s = 0
      for i = 0 to N - 1 do
        s += t[i]
      end
      return s
    end
    func start()
      num(0,0,soma())
      var i = 10
      while i > 0 do
        i -= 3
        if i == 4 then continue end
        if i < 0 then break end
      end
      num(0,0,i)
      for k = 3 to 0 step -1 do num(0,0,k) end
      text(1,1,"OLA")
      if not (1 == 2) and (3 > 2 or false) then num(0,0,99) end
    end`);
  assert.deepEqual(log, [10, -2, 3, 2, 1, 0, 'OLA', 99]);
});

test('erros em português com linha', () => {
  const out = compileGame({ global: { src: '' }, scenes: [{ name: 'c', src: 'func start()\n  x = 1\nend' }], assetConsts: {} });
  assert.equal(out.ok, false);
  assert.equal(out.errors[0].line, 2);
  assert.match(out.errors[0].msg, /não existe/);
});

test('gera C com funções de despacho', () => {
  const { out } = run('var x\nfunc update()\n  x += 1\n  spr(0, heroi, x, 10)\nend');
  assert.match(out.c, /void sl_scene_update\(u16 scene\)/);
  assert.match(out.c, /sl_spr\(0, 0, s0_x, 10, 0, 0\)/);
});
