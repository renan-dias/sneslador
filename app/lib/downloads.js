// Downloads com progresso, atualizações pelo GitHub (releases/latest) e instalação do toolchain.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const UA = { 'User-Agent': 'Sneslador-Hub', Accept: 'application/vnd.github+json' };

export async function downloadFile(url, dest, onProgress = () => {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Sneslador-Hub' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Falha no download (${res.status}) ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(value)) await new Promise((r) => out.once('drain', r));
    onProgress(total ? got / total : 0, got, total);
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  fs.renameSync(tmp, dest);
  return dest;
}

/** Lista releases de um repositório "dono/repo". */
export async function fetchReleases(repo) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido. Use o formato dono/repositorio.');
  const [latestRes, listRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA }),
    fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: UA }),
  ]);
  if (latestRes.status === 404) throw new Error(`Nenhuma release publicada em ${repo} (ou o repositório é privado).`);
  if (!latestRes.ok) throw new Error(`GitHub respondeu ${latestRes.status}. Tente novamente mais tarde.`);
  const simplify = (r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    date: r.published_at,
    notes: r.body || '',
    prerelease: r.prerelease,
    url: r.html_url,
    assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
  });
  const latest = simplify(await latestRes.json());
  const all = listRes.ok ? (await listRes.json()).map(simplify) : [latest];
  return { latest, all };
}

/** Escolhe o instalador Windows dentro dos assets de uma release. */
export function pickWindowsAsset(assets) {
  return assets.find((a) => /setup.*\.exe$/i.test(a.name)) ?? assets.find((a) => /\.exe$/i.test(a.name)) ?? assets.find((a) => /win.*\.zip$/i.test(a.name)) ?? null;
}

export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export function extractZip(zip, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`], { windowsHide: true });
    let err = '';
    ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Falha ao extrair: ' + err))));
  });
}

export const PVSNESLIB = {
  version: '4.6.0',
  url: 'https://github.com/alekmaul/pvsneslib/releases/download/4.6.0/pvsneslib_460_64b_windows_release.zip',
};

export async function installToolchain(baseDir, onProgress) {
  const zip = path.join(baseDir, 'pvsneslib.zip');
  await downloadFile(PVSNESLIB.url, zip, (p) => onProgress?.('Baixando PVSnesLib', p));
  onProgress?.('Extraindo', 1);
  await extractZip(zip, baseDir);
  fs.rmSync(zip, { force: true });
  return path.join(baseDir, 'pvsneslib');
}
