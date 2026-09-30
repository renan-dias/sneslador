// O makensis (32 bits) do electron-builder falha com "error creating mmap" em pacotes Electron grandes.
// Marcar o executável como LARGE_ADDRESS_AWARE dá a ele 4 GB de endereçamento no Windows 64 bits.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const cache = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache');
if (!fs.existsSync(cache)) { console.log('[patch-makensis] cache ainda não existe (rode o build uma vez).'); process.exit(0); }
let n = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/^makensis\.exe$/i.test(e.name)) {
      const b = fs.readFileSync(p);
      const pe = b.readUInt32LE(0x3c);
      if (b.toString('ascii', pe, pe + 4) !== 'PE\0\0') continue;
      const off = pe + 4 + 18;
      const ch = b.readUInt16LE(off);
      if (!(ch & 0x20)) { b.writeUInt16LE(ch | 0x20, off); fs.writeFileSync(p, b); n++; console.log('[patch-makensis] ajustado:', p); }
    }
  }
};
walk(cache);
if (!n) console.log('[patch-makensis] nada a ajustar.');
