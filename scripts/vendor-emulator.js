// Copia o EmulatorJS e o core snes9x (WASM) para app/vendor/emulatorjs, para rodar offline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@emulatorjs', 'emulatorjs', 'data');
const core = path.join(root, 'node_modules', '@emulatorjs', 'core-snes9x');
const dst = path.join(root, 'app', 'vendor', 'emulatorjs');

if (!fs.existsSync(src) || !fs.existsSync(core)) {
  console.warn('[vendor-emulator] pacotes do EmulatorJS não encontrados, pulando.');
  process.exit(0);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
fs.mkdirSync(path.join(dst, 'cores', 'reports'), { recursive: true });
for (const f of fs.readdirSync(core)) {
  if (f.endsWith('.data')) fs.copyFileSync(path.join(core, f), path.join(dst, 'cores', f));
}
if (fs.existsSync(path.join(core, 'reports'))) {
  for (const f of fs.readdirSync(path.join(core, 'reports'))) fs.copyFileSync(path.join(core, 'reports', f), path.join(dst, 'cores', 'reports', f));
}
console.log('[vendor-emulator] EmulatorJS + snes9x copiados para app/vendor/emulatorjs');
