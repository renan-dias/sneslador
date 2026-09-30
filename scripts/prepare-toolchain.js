// Copia só as partes necessárias do PVSnesLib para build-resources/pvsneslib (vai dentro do instalador).
// Se não houver uma cópia local em .toolchain/, baixa o release oficial do GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://github.com/alekmaul/pvsneslib/releases/download/4.6.0/pvsneslib_460_64b_windows_release.zip';
const local = path.join(root, '.toolchain', 'pvsneslib');
const out = path.join(root, 'build-resources', 'pvsneslib');

if (!fs.existsSync(path.join(local, 'devkitsnes', 'bin', '816-tcc.exe'))) {
  console.log('Baixando PVSnesLib 4.6.0...');
  fs.mkdirSync(path.join(root, '.toolchain'), { recursive: true });
  const zip = path.join(root, '.toolchain', 'pvsneslib.zip');
  const res = await fetch(URL);
  if (!res.ok) throw new Error('download falhou: ' + res.status);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(root, '.toolchain')}' -Force`], { stdio: 'inherit' });
}

fs.rmSync(out, { recursive: true, force: true });
for (const part of ['devkitsnes', path.join('pvsneslib', 'lib'), path.join('pvsneslib', 'include'), path.join('pvsneslib', 'pvsneslib_license.txt'), path.join('pvsneslib', 'pvsneslib_version.txt')]) {
  fs.cpSync(path.join(local, part), path.join(out, part), { recursive: true });
}
console.log('Toolchain pronto em', out);
