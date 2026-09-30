// Gera o ícone do app (controle em pixel art) em 256x256.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.......PPPPPP.......PPPPPP......',
  '.....PPLLLLLLPPPPPPPLLLLLLPP....',
  '....PLLLLLLLLLLLLLLLLLLLLLLLP...',
  '...PLLLLLLLLLLLLLLLLLLLLLYYLLP..',
  '...PLLLDDLLLLLLLLLLLLLLLYYYYLP..',
  '..PLLLLDDLLLLLLLLLLLLLBBLYYLGGP.',
  '..PLLDDDDDDLLLLLLLLLLBBBBLLGGGGP',
  '..PLLDDDDDDLLLSSLSSLLLBBLRRLGGLP',
  '..PLLLLDDLLLLLLLLLLLLLLLLRRRRLLP',
  '..PLLLLDDLLLLLLLLLLLLLLLLLRRLLLP',
  '..PLLLLLLLLLLLLLLLLLLLLLLLLLLLLP',
  '...PLLLLLLLLLLLPPPPPLLLLLLLLLLP.',
  '...PLLLLLLLLLPP....PPLLLLLLLLLP.',
  '....PLLLLLLPP.......PPLLLLLLP...',
  '.....PPPPPP..........PPPPPP.....',
  '................................',
];
const C = { '.': 0, P: 0xff5a3c28, L: 0xffd8c8c0, D: 0xff403838, S: 0xff807070, Y: 0xff30c8f8, B: 0xfff88840, G: 0xff48c850, R: 0xff4848e8 };
// cores em ABGR (little-endian RGBA do encoder)
const px = new Uint32Array(32 * 32);
art.forEach((row, y) => [...row].forEach((ch, x) => { px[(y + 5) * 32 + x] = C[ch] ?? 0; }));
// fundo roxo arredondado
const bg = new Uint32Array(32 * 32);
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const corner = (x < 2 || x > 29) && (y < 2 || y > 29);
  bg[y * 32 + x] = corner ? 0 : 0xfff05c7c;
  if (px[y * 32 + x]) bg[y * 32 + x] = px[y * 32 + x];
}
const png = encodePng(bg, 32, 32, 8, true);
fs.mkdirSync(path.join(root, 'build-resources'), { recursive: true });
fs.writeFileSync(path.join(root, 'build-resources', 'icon.png'), png);
fs.writeFileSync(path.join(root, 'app', 'renderer', 'shared', 'icon.png'), png);
console.log('ícone gerado');
