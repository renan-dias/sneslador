// Leitura/escrita de projetos no disco.
// Estrutura de uma pasta de projeto:
//   project.json        dados (paletas, sprites, tilesets, cenas, músicas...)
//   scripts/*.sns       um script por cena + global.sns
//   sounds/*.wav        efeitos sonoros
//   build/              ROM gerada
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyProject, sanitizeName } from '../core/project.js';
import { TEMPLATES } from '../core/templates/index.js';

export const PROJECT_FILE = 'project.json';

export function isProjectDir(dir) {
  return fs.existsSync(path.join(dir, PROJECT_FILE));
}

export function listProjects(root, extra = []) {
  const dirs = new Set();
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) dirs.add(path.join(root, d.name));
  }
  for (const d of extra) dirs.add(d);
  const out = [];
  for (const dir of dirs) {
    if (!isProjectDir(dir)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, PROJECT_FILE), 'utf8'));
      const st = fs.statSync(path.join(dir, PROJECT_FILE));
      const thumb = path.join(dir, 'thumb.png');
      out.push({
        dir,
        name: meta.name,
        template: meta.template ?? null,
        modified: st.mtimeMs,
        scenes: meta.scenes?.length ?? 0,
        sprites: meta.sprites?.length ?? 0,
        thumb: fs.existsSync(thumb) ? fs.readFileSync(thumb).toString('base64') : null,
      });
    } catch { /* projeto corrompido: ignora na lista */ }
  }
  return out.sort((a, b) => b.modified - a.modified);
}

function uniqueDir(root, name) {
  const base = sanitizeName(name).replace(/_+/g, '_') || 'jogo';
  let dir = path.join(root, base);
  let i = 2;
  while (fs.existsSync(dir)) dir = path.join(root, `${base}_${i++}`);
  return dir;
}

export function createProject(root, name, templateId, tutorial = false) {
  const dir = uniqueDir(root, name);
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  const { project, files } = tpl ? tpl.create(name, { tutorial }) : { project: createEmptyProject(name), files: {} };
  project.name = name;
  if (tpl) project.template = tpl.id;
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, data] of Object.entries(files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), data);
  }
  saveProject(dir, project);
  return dir;
}

const scriptFile = (scene) => `${scene.name}.sns`;

export function loadProject(dir) {
  const project = JSON.parse(fs.readFileSync(path.join(dir, PROJECT_FILE), 'utf8'));
  const sdir = path.join(dir, 'scripts');
  const read = (f, fallback) => {
    try { return fs.readFileSync(path.join(sdir, f), 'utf8'); } catch { return fallback; }
  };
  project.globalScript = read('global.sns', project.globalScript ?? '');
  for (const sc of project.scenes) sc.script = read(scriptFile(sc), sc.script ?? '');
  return project;
}

export function saveProject(dir, project) {
  const clone = JSON.parse(JSON.stringify(project));
  const sdir = path.join(dir, 'scripts');
  fs.mkdirSync(sdir, { recursive: true });
  const keep = new Set(['global.sns']);
  fs.writeFileSync(path.join(sdir, 'global.sns'), clone.globalScript ?? '');
  delete clone.globalScript;
  for (const sc of clone.scenes) {
    fs.writeFileSync(path.join(sdir, scriptFile(sc)), sc.script ?? '');
    keep.add(scriptFile(sc));
    delete sc.script;
  }
  for (const f of fs.readdirSync(sdir)) if (f.endsWith('.sns') && !keep.has(f)) fs.rmSync(path.join(sdir, f));
  const tmp = path.join(dir, PROJECT_FILE + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(clone, null, 1));
  fs.renameSync(tmp, path.join(dir, PROJECT_FILE));
}

/** Caminho seguro dentro da pasta do projeto (impede ../ saindo da pasta). */
export function projectPath(dir, rel) {
  const p = path.resolve(dir, rel);
  if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('Caminho fora do projeto: ' + rel);
  return p;
}
