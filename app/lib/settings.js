import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const DEFAULTS = {
  projectsDir: '',
  githubRepo: 'seu-usuario/sneslador',
  retropiePath: '\\\\RETROPIE\\roms\\snes',
  toolchainHome: '',
  recent: [],
  keyboard: { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', A: 'KeyX', B: 'KeyZ', X: 'KeyS', Y: 'KeyA', L: 'KeyQ', R: 'KeyW', START: 'Enter', SELECT: 'ShiftRight' },
  tutorialsDone: {},
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'settings.json');

export function getSettings() {
  if (cache) return cache;
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { /* primeira execução */ }
  cache = { ...DEFAULTS, ...saved, keyboard: { ...DEFAULTS.keyboard, ...(saved.keyboard ?? {}) } };
  if (!cache.projectsDir) cache.projectsDir = path.join(app.getPath('documents'), 'Sneslador', 'Projetos');
  fs.mkdirSync(cache.projectsDir, { recursive: true });
  return cache;
}

export function setSettings(patch) {
  cache = { ...getSettings(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

export function addRecent(dir) {
  const s = getSettings();
  setSettings({ recent: [dir, ...s.recent.filter((d) => d !== dir)].slice(0, 20) });
}
