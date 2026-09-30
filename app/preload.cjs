// Ponte segura entre as páginas (renderer) e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('sneslador', {
  appInfo: invoke('app:info'),
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),

  templates: invoke('hub:templates'),
  listProjects: invoke('hub:list'),
  createProject: invoke('hub:create'),
  openProject: invoke('hub:open'),
  importProject: invoke('hub:import'),
  trashProject: invoke('hub:trash'),
  revealProject: invoke('hub:reveal'),
  chooseProjectsDir: invoke('hub:chooseProjectsDir'),
  openHub: invoke('hub:openEditorWindow'),

  checkUpdates: invoke('updates:check'),
  installUpdate: invoke('updates:install'),
  onUpdateProgress: on('updates:progress'),

  toolchainStatus: invoke('toolchain:status'),
  installToolchain: invoke('toolchain:install'),
  onToolchainProgress: on('toolchain:progress'),

  loadProject: invoke('project:load'),
  saveProject: invoke('project:save'),
  saveThumb: invoke('project:thumb'),
  readAsset: invoke('asset:read'),
  writeAsset: invoke('asset:write'),
  deleteAsset: invoke('asset:delete'),
  openFileDialog: invoke('dialog:open'),
  saveFileDialog: invoke('dialog:save'),

  buildRom: invoke('build:rom'),
  onBuildLog: on('build:log'),
  runRom: invoke('rom:run'),
  emulatorRom: invoke('emu:rom'),
  saveRomAs: invoke('rom:saveAs'),
  sendToRetroPie: invoke('rom:retropie'),
  openExternal: invoke('shell:external'),
  revealFile: invoke('shell:reveal'),
});
