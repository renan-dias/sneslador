// Processo principal do Electron: janelas (Hub, Editor, Emulador) e acesso a disco/rede/toolchain.
import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getSettings, setSettings, addRecent } from './lib/settings.js';
import { listProjects, createProject, loadProject, saveProject, projectPath, isProjectDir } from './lib/projects.js';
import { fetchReleases, pickWindowsAsset, compareVersions, downloadFile, installToolchain, PVSNESLIB } from './lib/downloads.js';
import { buildRom, toolchainOk } from './export/snes/exporter.js';
import { TEMPLATES } from './core/templates/index.js';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_TOOLCHAIN = path.resolve(APP_DIR, '..', '.toolchain', 'pvsneslib');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let hubWin = null;
const editors = new Map(); // dir -> BrowserWindow
const emuRoms = new Map(); // webContents.id -> {rom, name}

function resolveToolchain() {
  const s = getSettings();
  // 1) escolhido pelo usuário  2) embutido no instalador  3) baixado pelo Hub  4) pasta de desenvolvimento
  const candidates = [s.toolchainHome, path.join(process.resourcesPath ?? '', 'pvsneslib'), path.join(app.getPath('userData'), 'toolchain', 'pvsneslib'), REPO_TOOLCHAIN];
  return candidates.find((c) => c && toolchainOk(c)) ?? null;
}

function baseWindow(opts) {
  const win = new BrowserWindow({
    backgroundColor: '#12121f',
    icon: path.join(APP_DIR, 'renderer', 'shared', 'icon.png'),
    autoHideMenuBar: true,
    ...opts,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      ...(opts.webPreferences ?? {}),
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

function openHub() {
  if (hubWin && !hubWin.isDestroyed()) { hubWin.focus(); return; }
  hubWin = baseWindow({ width: 1180, height: 760, minWidth: 900, minHeight: 600, title: 'Sneslador Hub' });
  hubWin.loadURL('app://sneslador/renderer/hub/index.html');
  hubWin.on('closed', () => { hubWin = null; });
}

function openEditor(dir, extra = {}) {
  const existing = editors.get(dir);
  if (existing && !existing.isDestroyed()) { existing.focus(); return; }
  addRecent(dir);
  const win = baseWindow({ width: 1500, height: 920, minWidth: 1100, minHeight: 680, title: 'Sneslador' });
  win.maximize();
  const q = new URLSearchParams({ dir, ...extra });
  win.loadURL(`app://sneslador/renderer/editor/index.html?${q}`);
  editors.set(dir, win);
  win.on('closed', () => { editors.delete(dir); if (!editors.size && !hubWin) openHub(); });
}

function openEmulator(rom, name) {
  const win = baseWindow({ width: 820, height: 700, title: `SNES — ${name}` });
  emuRoms.set(win.webContents.id, { rom, name });
  win.loadURL('app://sneslador/renderer/emulator/emulator.html');
  win.on('closed', () => emuRoms.delete(win.webContents.id));
  return win;
}

// ---------------------------------------------------------------- IPC
const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...args) => fn(e, ...args));

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, dev: !app.isPackaged }));
  handle('settings:get', () => getSettings());
  handle('settings:set', (_e, patch) => setSettings(patch));

  // Hub
  handle('hub:templates', () => TEMPLATES.map(({ id, name, description, difficulty, icon, tutorial }) => ({ id, name, description, difficulty, icon, tutorial: !!tutorial })));
  handle('hub:list', () => listProjects(getSettings().projectsDir, getSettings().recent));
  handle('hub:create', (_e, name, templateId, withTutorial) => {
    const dir = createProject(getSettings().projectsDir, name, templateId, !!withTutorial);
    openEditor(dir, withTutorial ? { tutorial: withTutorial } : {});
    return dir;
  });
  handle('hub:open', (_e, dir) => { openEditor(dir); });
  handle('hub:import', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Abrir pasta de projeto', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (!isProjectDir(r.filePaths[0])) throw new Error('Essa pasta não tem um project.json do Sneslador.');
    openEditor(r.filePaths[0]);
    return r.filePaths[0];
  });
  handle('hub:trash', async (_e, dir) => {
    if (!isProjectDir(dir)) throw new Error('Não é uma pasta de projeto.');
    await shell.trashItem(dir);
    setSettings({ recent: getSettings().recent.filter((d) => d !== dir) });
  });
  handle('hub:reveal', (_e, dir) => shell.openPath(dir));
  handle('hub:chooseProjectsDir', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return null;
    setSettings({ projectsDir: r.filePaths[0] });
    return r.filePaths[0];
  });
  handle('hub:openEditorWindow', () => openHub());

  // Atualizações (GitHub releases/latest)
  handle('updates:check', async () => {
    const { latest, all } = await fetchReleases(getSettings().githubRepo);
    const current = app.getVersion();
    return { current, latest, all, newer: compareVersions(latest.tag, current) > 0, asset: pickWindowsAsset(latest.assets) };
  });
  handle('updates:install', async (e, release) => {
    const asset = pickWindowsAsset(release.assets);
    if (!asset) throw new Error('Essa release não tem instalador para Windows (.exe).');
    if (!/^https:\/\/github\.com\//.test(asset.url)) throw new Error('Endereço de download inesperado.');
    const dest = path.join(app.getPath('userData'), 'downloads', asset.name);
    await downloadFile(asset.url, dest, (p) => e.sender.send('updates:progress', p));
    const choice = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
      type: 'question', buttons: ['Instalar agora', 'Depois'], defaultId: 0,
      message: `Versão ${release.tag} baixada.`, detail: 'O Sneslador vai fechar para instalar a nova versão. Seus projetos não são afetados.',
    });
    if (choice.response === 0) {
      await shell.openPath(dest);
      setTimeout(() => app.quit(), 500);
    }
    return dest;
  });

  // Toolchain PVSnesLib
  handle('toolchain:status', () => ({ home: resolveToolchain(), version: PVSNESLIB.version }));
  handle('toolchain:install', async (e) => {
    const base = path.join(app.getPath('userData'), 'toolchain');
    const home = await installToolchain(base, (step, p) => e.sender.send('toolchain:progress', { step, p }));
    if (!toolchainOk(home)) throw new Error('O toolchain foi baixado mas algo está faltando.');
    setSettings({ toolchainHome: home });
    return home;
  });

  // Projeto
  handle('project:load', (_e, dir) => loadProject(dir));
  handle('project:save', (_e, dir, project) => { saveProject(dir, project); return true; });
  handle('project:thumb', (_e, dir, b64) => { fs.writeFileSync(path.join(dir, 'thumb.png'), Buffer.from(b64, 'base64')); });
  handle('asset:read', (_e, dir, rel) => {
    const p = projectPath(dir, rel);
    return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
  });
  handle('asset:write', (_e, dir, rel, bytes) => {
    const p = projectPath(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(bytes));
  });
  handle('asset:delete', (_e, dir, rel) => { fs.rmSync(projectPath(dir, rel), { force: true }); });
  handle('dialog:open', async (e, opts = {}) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: opts.title, filters: opts.filters, properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])],
    });
    if (r.canceled) return [];
    return r.filePaths.map((p) => ({ name: path.basename(p), path: p, data: new Uint8Array(fs.readFileSync(p)) }));
  });
  handle('dialog:save', async (e, opts, bytes) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), opts);
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, Buffer.from(bytes));
    return r.filePath;
  });

  // Build / ROM
  handle('build:rom', async (e, dir, project) => {
    const home = resolveToolchain();
    if (!home) throw new Error('O toolchain PVSnesLib não está instalado. Abra o Hub > Toolchain e clique em Instalar.');
    const log = (msg) => e.sender.send('build:log', msg);
    return buildRom(project, {
      toolchainHome: home,
      buildDir: path.join(dir, 'build'),
      readAsset: (rel) => fs.readFileSync(projectPath(dir, rel)),
      log,
    });
  });
  handle('rom:run', (_e, rom, name) => { openEmulator(rom, name); });
  handle('emu:rom', (e) => {
    const r = emuRoms.get(e.sender.id);
    if (!r) return null;
    return { name: r.name, data: new Uint8Array(fs.readFileSync(r.rom)) };
  });
  handle('rom:saveAs', async (e, rom, name) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: `${name}.sfc`, filters: [{ name: 'ROM de Super Nintendo', extensions: ['sfc'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(rom, r.filePath);
    return r.filePath;
  });
  handle('rom:retropie', (_e, rom, name) => {
    const target = getSettings().retropiePath;
    if (!target) throw new Error('Configure a pasta do RetroPie no Hub > Configurações.');
    if (!fs.existsSync(target)) throw new Error(`Não encontrei ${target}. O Raspberry está ligado e na mesma rede? (compartilhamento Samba do RetroPie)`);
    const dest = path.join(target, `${name}.sfc`);
    fs.copyFileSync(rom, dest);
    return dest;
  });
  handle('shell:external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
}

// ---------------------------------------------------------------- boot
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(APP_DIR, rel);
    if (!file.startsWith(APP_DIR + path.sep)) return new Response('proibido', { status: 403 });
    if (!fs.existsSync(file)) return new Response('não encontrado', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  registerIpc();
  const argv = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  let win;
  if (argv('emu')) win = openEmulator(argv('emu'), 'teste');
  else if (argv('open')) { openEditor(argv('open'), argv('tutorial') ? { tutorial: argv('tutorial') } : {}); win = editors.get(argv('open')); }
  else { openHub(); win = hubWin; }
  // Modo de captura (testes automáticos): --capture=arquivo.png [--wait=ms] [--js=codigo]
  const capture = argv('capture');
  if (capture && win) {
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) console.log('[console]', e.message); });
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (argv('js')) {
          try { console.log('[js]', JSON.stringify(await win.webContents.executeJavaScript(argv('js')))); } catch (err) { console.log('[js-erro]', err.message); }
          await new Promise((r) => setTimeout(r, Number(argv('wait2') ?? 800)));
        }
        const img = await win.webContents.capturePage();
        fs.writeFileSync(capture, img.toPNG());
        app.exit(0);
      }, Number(argv('wait') ?? 2500));
    });
  }
});

app.on('window-all-closed', () => app.quit());
