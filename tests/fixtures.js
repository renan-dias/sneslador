// Projeto de teste gerado por código (sprite, tileset com tile sólido, 2 cenas).
import { createEmptyProject, emptySprite, emptyScene } from '../app/core/project.js';

export function sampleProject() {
  const p = createEmptyProject('Teste');
  const ts = p.tilesets[0];
  // célula 1: tijolo sólido (cor 4 com borda 3); célula 2: moeda (tag 1)
  const px = ts.pixels.split('');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      px[y * ts.w + 8 + x] = (x === 0 || y === 0 || x === 7 || y === 7) ? '3' : '4';
      const dx = x - 3.5, dy = y - 3.5;
      if (dx * dx + dy * dy < 9) px[y * ts.w + 16 + x] = '5';
    }
  }
  ts.pixels = px.join('');
  ts.solid[1] = true;
  ts.tags[2] = 1;
  const sc = p.scenes[0];
  for (let x = 0; x < 32; x++) { sc.bg1.cells[26 * 32 + x] = 1; sc.bg1.cells[27 * 32 + x] = 1; }
  for (let x = 4; x < 12; x += 2) sc.bg1.cells[22 * 32 + x] = 2;

  const hero = emptySprite('heroi', 16, 0);
  const f = (color) => {
    let s = '';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s += (x > 1 && x < 14 && y > 1 && y < 15) ? color : '0';
    return s;
  };
  hero.frames = [f('9'), f('7')];
  hero.anims = [{ name: 'pisca', frames: [0, 1], speed: 15, loop: true }];
  p.sprites.push(hero);

  sc.script = `
var x = 40
var y = 100
var vy = 0
var moedas = 0

func start()
  text(1, 1, "TESTE SNESLADOR")
  text(1, 3, "DIV:")
  num(6, 3, -7 / 2)
  num(10, 3, -7 % 3)
  num(14, 3, 32767 + 1)
  num(22, 3, -100 >> 2)
end

func update()
  if btn(LEFT) then x -= 2 end
  if btn(RIGHT) then x += 2 end
  vy += 1
  if vy > 6 then vy = 6 end
  y += vy
  if solid(x + 8, y + 16) then
    y = ((y + 16) / 8) * 8 - 16
    vy = 0
    if btnp(B) then vy = -10 end
  end
  if tiletag(x + 8, y + 8) == 1 then
    settile((x + 8) / 8, (y + 8) / 8, -1)
    moedas += 1
  end
  text(1, 5, "MOEDAS:")
  num(9, 5, moedas)
  spr(0, heroi, x, y, anim(heroi_pisca))
  spr(1, heroi, -8, 60, 1)
  if btnp(START) then go(fim) end
end
`;
  const sc2 = emptyScene('fim', ts.id);
  sc2.script = 'func start()\n  text(10, 12, "FIM! START VOLTA")\nend\nfunc update()\n  if btnp(START) then go(inicio) end\nend\n';
  p.scenes.push(sc2);
  return p;
}

// Som de teste (bipe) e uma música curta
import { encodeWav16 } from '../app/core/audio/wav.js';
import { newSong } from '../app/core/audio/song.js';

export function beepWav() {
  const rate = 22050, n = 4000;
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin(2 * Math.PI * 880 * i / rate) * (1 - i / n) * 0.8;
  return Buffer.from(encodeWav16(pcm, rate));
}

export function withAudio(p) {
  p.sounds.push({ id: 'snd1', name: 'bipe', file: 'sounds/bipe.wav', volume: 15 });
  const song = newSong('tema');
  const melody = [0, 2, 4, 5, 7, 5, 4, 2];
  melody.forEach((pos, c) => { song.notes.push({ c: c * 4, p: pos + 4, i: 'cogumelo', a: 0 }); song.notes.push({ c: c * 4, p: pos, i: 'baixo', a: 0 }); song.notes.push({ c: c * 4 + 2, p: 3, i: 'tambor', a: 0 }); });
  p.songs = [song];
  p.scenes[0].script = p.scenes[0].script.replace('func start()', 'func start()\n  music(tema)').replace('if btnp(B) then vy = -10 end', 'if btnp(B) then\n      vy = -10\n      sfx(bipe)\n    end');
  return p;
}
