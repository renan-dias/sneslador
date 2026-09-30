import { h, clear, toast, modal, prompt, confirmDialog, formatBytes, pixelText } from '../shared/ui.js';
import { FONT_GLYPHS } from '../../core/gfx/font.js';
import { store } from './store.js';
import { compileProject } from '../../core/compile.js';
import { emptyScene, emptySprite, emptyTileset, isValidName, sanitizeName, uid, SPRITE_SIZE_MODES } from '../../core/project.js';
import { LIMITS } from '../../core/gamedata.js';
import { drawSpriteThumb } from './views/common.js';
import { Tutorial } from './tutorial.js';

const api = window.sneslador;
const params = new URLSearchParams(location.search);
const dir = params.get('dir');

const VIEWS = {
  game: () => import('./views/game.js'),
  scene: () => import('./views/scene.js'),
  code: () => import('./views/code.js'),
  sprite: () => import('./views/sprite.js'),
  tileset: () => import('./views/tileset.js'),
  sound: () => import('./views/sound.js'),
  music: () => import('./views/music.js'),
  palettes: () => import('./views/palettes.js'),
  settings: () => import('./views/settings.js'),
};

const tabs = []; // {key, kind, id, el, inst}
let activeKey = null;
let lastBuild = null;
let tutorial = null;

// ------------------------------------------------------------------ console
const consoleEl = document.getElementById('console');
export function log(msg, kind = '', meta = null) {
  const t = new Date().toLocaleTimeString('pt-BR');
  const line = h('div.l', { class: kind, onclick: meta?.file ? () => openCodeAt(meta.file, meta.line) : null }, h('span.t', t), msg);
  consoleEl.append(line);
  while (consoleEl.childElementCount > 400) consoleEl.firstChild.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
document.getElementById('consoleClear').onclick = () => clear(consoleEl);

function openCodeAt(file, line) {
  if (file === 'global') openTab('code', 'global', { line });
  else {
    const sc = store.project.scenes.find((s) => s.name === file);
    if (sc) openTab('code', sc.id, { line });
  }
}

// ------------------------------------------------------------------ contexto passado às views
const ctx = {
  store,
  api,
  log,
  openTab: (...a) => openTab(...a),
  compile: () => compileProject(store.project),
  get dir() { return dir; },
  tutorial: () => tutorial,
  refreshTree: () => renderTree(),
  showPlay: () => openTab('game', 'game'),
};

// ------------------------------------------------------------------ abas
async function openTab(kind, id, opts = {}) {
  const key = `${kind}:${id}`;
  let tab = tabs.find((t) => t.key === key);
  if (!tab) {
    const el = h('div.view');
    document.getElementById('views').append(el);
    tab = { key, kind, id, el, inst: null };
    tabs.push(tab);
    const mod = await VIEWS[kind]();
    tab.inst = mod.mount(el, ctx, id, opts) ?? {};
  } else if (opts && tab.inst.reveal) {
    tab.inst.reveal(opts);
  }
  activate(key);
  return tab;
}

function activate(key) {
  activeKey = key;
  for (const t of tabs) {
    t.el.classList.toggle('hidden', t.key !== key);
    if (t.key === key) t.inst.onShow?.();
    else t.inst.onHide?.();
  }
  renderTabs();
  renderTree();
  updateHardware();
  tutorial?.onUiChange();
}

function closeTab(key) {
  const i = tabs.findIndex((t) => t.key === key);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  t.inst.dispose?.();
  t.el.remove();
  if (activeKey === key) {
    const next = tabs[Math.max(0, i - 1)];
    if (next) activate(next.key);
    else { activeKey = null; renderTabs(); renderEmpty(); }
  } else renderTabs();
}

function tabTitle(t) {
  const p = store.project;
  switch (t.kind) {
    case 'game': return '▶ Jogo (live view)';
    case 'scene': return `🗺️ ${store.scene(t.id)?.name ?? '?'}`;
    case 'code': return t.id === 'global' ? '📜 global.sns' : `📜 ${store.scene(t.id)?.name ?? '?'}.sns`;
    case 'sprite': return `🧍 ${store.sprite(t.id)?.name ?? '?'}`;
    case 'tileset': return `🧱 ${store.tileset(t.id)?.name ?? '?'}`;
    case 'sound': return `🔊 ${store.sound(t.id)?.name ?? '?'}`;
    case 'music': return `🎵 ${store.song(t.id)?.name ?? '?'}`;
    case 'palettes': return '🎨 Paletas';
    case 'settings': return `⚙️ ${p.name}`;
    default: return t.key;
  }
}

function renderTabs() {
  clear(document.getElementById('tabs'), tabs.map((t) => h('div.tab', {
    class: t.key === activeKey ? 'active' : '',
    'data-tab': t.key,
    onclick: () => activate(t.key),
    onauxclick: (e) => { if (e.button === 1) closeTab(t.key); },
  }, tabTitle(t), h('span.x', { onclick: (e) => { e.stopPropagation(); closeTab(t.key); } }, '✕'))));
}

function renderEmpty() {
  if (tabs.length) return;
  const views = document.getElementById('views');
  views.querySelector('.empty-view')?.remove();
  views.append(h('div.view.empty-view', h('div', h('div.big', '🕹️'), h('div', 'Escolha algo na árvore à esquerda para editar,'), h('div', 'ou aperte ', h('b', '▶ Jogar'), ' para testar o jogo.'))));
}

// ------------------------------------------------------------------ barra superior
function renderTop() {
  const p = store.project;
  const saveLbl = h('span.save.muted', 'salvo');
  store.on('dirty', ({ dirty, error }) => {
    saveLbl.textContent = error ? 'erro ao salvar!' : dirty ? 'salvando...' : 'salvo';
    saveLbl.style.color = error ? 'var(--red)' : '';
  });
  clear(document.getElementById('top'),
    h('span.logo', { title: 'Abrir o Hub', onclick: () => api.openHub() }, pixelText('SNES', FONT_GLYPHS, { scale: 2, shadow: '#7c5cff' })),
    h('span.pname', { title: 'Configurações do projeto', style: { cursor: 'pointer' }, onclick: () => openTab('settings', 'project') }, p.name),
    saveLbl,
    h('div.sep'),
    h('button.btn.icon', { title: 'Desfazer (Ctrl+Z)', onclick: () => store.undo() }, '↶'),
    h('button.btn.icon', { title: 'Refazer (Ctrl+Y)', onclick: () => store.redo() }, '↷'),
    h('div.spacer'),
    h('button.btn.primary.play', { id: 'btnPlay', title: 'Testar no live view (F5)', onclick: () => play() }, '▶ Jogar'),
    h('div.sep'),
    h('button.btn', { id: 'btnBuild', title: 'Compilar a ROM .sfc (F6)', onclick: () => buildRom() }, '🛠️ Gerar ROM'),
    h('button.btn', { id: 'btnEmu', title: 'Gerar e rodar a ROM real no emulador snes9x (F7)', onclick: () => buildRom('run') }, '🕹️ Rodar no emulador'),
    h('button.btn', { id: 'btnPie', title: 'Gerar e copiar para o RetroPie', onclick: () => buildRom('pie') }, '🍓 Enviar ao RetroPie'),
    h('div.sep'),
    h('button.btn', { id: 'btnTutorial', onclick: () => chooseTutorial() }, '🎓 Tutoriais'),
  );
}

async function play() {
  const t = await openTab('game', 'game');
  t.inst.restart?.();
}

// ------------------------------------------------------------------ árvore de assets
function renderTree() {
  const p = store.project;
  if (!p) return;
  const left = document.getElementById('left');
  const tree = left.querySelector('.tree') ?? h('div.tree');
  if (!tree.parentNode) left.append(tree);
  const isActive = (kind, id) => activeKey === `${kind}:${id}`;
  const item = (kind, id, icon, name, extra, menu) => h('div.titem', {
    class: isActive(kind, id) ? 'active' : '',
    'data-tree': `${kind}:${id}`,
    onclick: () => openTab(kind, id),
    oncontextmenu: (e) => { e.preventDefault(); menu && contextMenu(e, menu); },
  }, typeof icon === 'string' ? h('span.ic', icon) : icon, h('span.nm', name), extra ? h('span.extra', extra) : null);
  const group = (title, addFn, addTitle, children) => h('div.tgroup', h('div.thead', title, addFn ? h('span.add', { title: addTitle, 'data-add': title, onclick: addFn }, '+') : null), children);

  clear(tree,
    h('div.tgroup', item('game', 'game', '▶', 'Jogo (live view)')),
    group('Cenas', addScene, 'Nova cena', p.scenes.map((s) => [
      item('scene', s.id, s.id === p.startScene ? '⭐' : '🗺️', s.name, s.id === p.startScene ? 'início' : '', sceneMenu(s)),
      h('div.titem.sub', { class: isActive('code', s.id) ? 'active' : '', 'data-tree': `code:${s.id}`, onclick: () => openTab('code', s.id) }, h('span.ic', '📜'), `${s.name}.sns`),
    ])),
    group('Sprites', addSprite, 'Novo sprite', p.sprites.map((s) => {
      const c = document.createElement('canvas');
      drawSpriteThumb(c, s, p);
      return item('sprite', s.id, c, s.name, `${s.size}px · ${s.frames.length}q`, assetMenu('sprite', s));
    })),
    group('Tilesets', addTileset, 'Novo tileset', p.tilesets.map((t) => item('tileset', t.id, '🧱', t.name, `${t.w}x${t.h}`, assetMenu('tileset', t)))),
    group('Sons', addSound, 'Novo som', p.sounds.map((s) => item('sound', s.id, '🔊', s.name, null, assetMenu('sound', s)))),
    group('Músicas', addSong, 'Nova música', (p.songs ?? []).map((s) => item('music', s.id, '🎵', s.name, null, assetMenu('song', s)))),
    group('Projeto', null, null, [
      item('palettes', 'all', '🎨', 'Paletas de cores'),
      item('code', 'global', '📜', 'global.sns', 'script'),
      item('settings', 'project', '⚙️', 'Configurações'),
    ]),
  );
}

function contextMenu(e, items) {
  document.querySelector('.ctxmenu')?.remove();
  const m = h('div.ctxmenu.card', { style: { position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`, zIndex: 3000, padding: '4px', minWidth: '180px' } },
    items.map((it) => h('div.titem', { style: { paddingLeft: '10px', color: it.danger ? 'var(--red)' : '' }, onclick: () => { m.remove(); it.fn(); } }, it.label)));
  document.body.append(m);
  setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
}

function nameValidator(exceptId) {
  return (v) => {
    if (!isValidName(v)) return 'Use só letras sem acento, números e _ (sem espaços). Ex: heroi, fase_1';
    const p = store.project;
    const all = [...p.sprites, ...p.sounds, ...p.scenes, ...(p.songs ?? [])];
    if (all.some((a) => a.name === v && a.id !== exceptId)) return 'Já existe um asset com esse nome.';
    return null;
  };
}

async function askName(title, suggestion, exceptId) {
  let base = sanitizeName(suggestion);
  const p = store.project;
  const all = new Set([...p.sprites, ...p.sounds, ...p.scenes, ...(p.songs ?? [])].map((a) => a.name));
  let n = base, i = 2;
  while (all.has(n)) n = `${base}${i++}`;
  return prompt(title, 'Nome (usado no código)', n, { validate: nameValidator(exceptId) });
}

async function addScene() {
  const name = await askName('Nova cena', 'fase');
  if (!name) return;
  const sc = emptyScene(name, store.project.tilesets[0]?.id ?? null);
  store.change('scene', (p) => { p.scenes.push(sc); });
  openTab('scene', sc.id);
}

async function addSprite() {
  const mode = SPRITE_SIZE_MODES[store.project.spriteSize];
  const size = h('select', h('option', { value: mode.large }, `${mode.large}x${mode.large} (grande)`), h('option', { value: mode.small }, `${mode.small}x${mode.small} (pequeno)`));
  const nm = h('input', { type: 'text', value: 'heroi' });
  const err = h('div', { style: { color: 'var(--red)', minHeight: '18px' } });
  for (;;) {
    const ok = await modal('Novo sprite', h('div.col', h('label.field', 'Nome (usado no código)', nm), h('label.field', 'Tamanho', size),
      h('p.hint', `O projeto usa sprites de ${mode.label}. O SNES só permite dois tamanhos de sprite ao mesmo tempo (registrador OBSEL).`), err),
    [{ label: 'Cancelar' }, { label: 'Criar', primary: true }]);
    if (!ok) return;
    const problem = nameValidator(null)(nm.value.trim());
    if (problem) { err.textContent = problem; continue; }
    const s = emptySprite(nm.value.trim(), Number(size.value), 0);
    store.change('sprite', (p) => { p.sprites.push(s); });
    openTab('sprite', s.id);
    return;
  }
}

async function addTileset() {
  const name = await prompt('Novo tileset', 'Nome', 'blocos', { validate: (v) => (v ? null : 'Digite um nome') });
  if (!name) return;
  const used = new Set(store.project.tilesets.map((t) => t.palette));
  const pal = [1, 2, 3, 4, 5, 6, 7].find((x) => !used.has(x)) ?? 1;
  const t = emptyTileset(name, pal);
  store.change('tileset', (p) => { p.tilesets.push(t); });
  openTab('tileset', t.id);
}

async function addSound() {
  const name = await askName('Novo efeito sonoro', 'som');
  if (!name) return;
  const { makeDefaultSound } = await import('./views/sound.js');
  const s = await makeDefaultSound(ctx, name);
  openTab('sound', s.id);
}

async function addSong() {
  const name = await askName('Nova música', 'musica');
  if (!name) return;
  const { newSong } = await import('../../core/audio/song.js');
  const s = newSong(name);
  store.change('music', (p) => { (p.songs ??= []).push(s); });
  openTab('music', s.id);
}

function sceneMenu(s) {
  return [
    { label: '⭐ Definir como cena inicial', fn: () => store.change('scene', (p) => { p.startScene = s.id; }) },
    { label: '✏️ Renomear', fn: () => renameAsset('scene', s) },
    { label: '📄 Duplicar', fn: () => duplicate('scene', s) },
    { label: '🗑️ Apagar', danger: true, fn: () => deleteAsset('scene', s) },
  ];
}

function assetMenu(kind, a) {
  const items = [];
  if (kind !== 'tileset') items.push({ label: '✏️ Renomear', fn: () => renameAsset(kind, a) });
  else items.push({ label: '✏️ Renomear', fn: async () => { const n = await prompt('Renomear', 'Nome', a.name); if (n) store.change('tileset', () => { a.name = n; }); } });
  if (kind === 'sprite' || kind === 'tileset' || kind === 'song') items.push({ label: '📄 Duplicar', fn: () => duplicate(kind, a) });
  items.push({ label: '🗑️ Apagar', danger: true, fn: () => deleteAsset(kind, a) });
  return items;
}

const LIST = { scene: 'scenes', sprite: 'sprites', tileset: 'tilesets', sound: 'sounds', song: 'songs' };

async function renameAsset(kind, a) {
  const old = a.name;
  const n = await prompt('Renomear', 'Novo nome (usado no código)', old, { validate: nameValidator(a.id) });
  if (!n || n === old) return;
  store.change('project', (p) => {
    const target = p[LIST[kind]].find((x) => x.id === a.id);
    target.name = n;
    // atualiza referências nos scripts: heroi -> novo, heroi_corre -> novo_corre
    const re = new RegExp(`\\b${old}(_\\w+)?\\b`, 'g');
    const fix = (src) => src.replace(re, (m, suffix) => {
      if (!suffix) return n;
      if (kind === 'sprite' && target.anims?.some((an) => `_${an.name}` === suffix)) return n + suffix;
      return m;
    });
    p.globalScript = fix(p.globalScript);
    for (const sc of p.scenes) sc.script = fix(sc.script);
  });
  log(`"${old}" renomeado para "${n}" (e atualizado nos scripts).`, 'ok');
  renderTree();
  renderTabs();
}

async function duplicate(kind, a) {
  const copy = JSON.parse(JSON.stringify(a));
  copy.id = uid(kind.slice(0, 3));
  if (kind === 'tileset') copy.name = a.name + ' (cópia)';
  else copy.name = await askName('Duplicar', a.name + '_2');
  if (!copy.name) return;
  store.change(kind, (p) => { (p[LIST[kind]] ??= []).push(copy); });
  openTab(kind === 'song' ? 'music' : kind, copy.id);
}

async function deleteAsset(kind, a) {
  const p = store.project;
  if (kind === 'scene' && p.scenes.length === 1) { toast('O jogo precisa de pelo menos uma cena.', 'err'); return; }
  if (!(await confirmDialog('Apagar', `Apagar "${a.name}"? Você pode desfazer com Ctrl+Z.`, 'Apagar', true))) return;
  store.change('project', (pr) => {
    pr[LIST[kind]] = pr[LIST[kind]].filter((x) => x.id !== a.id);
    if (kind === 'scene' && pr.startScene === a.id) pr.startScene = pr.scenes[0].id;
    if (kind === 'tileset') for (const sc of pr.scenes) { if (sc.bg1?.tileset === a.id) sc.bg1.tileset = null; if (sc.bg2?.tileset === a.id) sc.bg2.tileset = null; }
  });
  const tabKind = kind === 'song' ? 'music' : kind;
  closeTab(`${tabKind}:${a.id}`);
  if (kind === 'scene') closeTab(`code:${a.id}`);
}

// ------------------------------------------------------------------ painel direito: hardware
let hwTimer = null;
function updateHardware() {
  clearTimeout(hwTimer);
  hwTimer = setTimeout(renderHardware, 250);
}

const FACTS = [
  'O Super Nintendo tem só <b>128 KB de RAM</b> de trabalho e <b>64 KB de VRAM</b> para todos os gráficos.',
  'A CPU é um <b>65816 a 3,58 MHz</b> — mais de mil vezes mais lenta que um celular.',
  'Cada tile tem <b>8x8 pixels</b> e usa <b>4 bits por pixel</b>: 16 cores, sendo a cor 0 transparente.',
  'As cores têm <b>15 bits</b>: 32 tons de vermelho, verde e azul = 32.768 cores possíveis.',
  'A OAM guarda até <b>128 sprites</b>, mas só <b>32 cabem na mesma linha</b> da tela. Passou disso, eles piscam ou somem!',
  'O som é feito por outro processador, o <b>SPC700 da Sony</b>, com 64 KB de RAM só para áudio.',
  'Os sons são comprimidos em <b>BRR</b>: cada 16 amostras viram 9 bytes.',
  'A tela tem <b>256x224 pixels</b> e é desenhada <b>60 vezes por segundo</b> (NTSC).',
  'Só dá para mexer na VRAM durante o <b>VBlank</b>, o intervalo em que o feixe de elétrons volta para o topo da TV.',
  'Neste projeto a ROM usa o mapeamento <b>LoROM</b>: bancos de 32 KB, como a maioria dos cartuchos.',
];
let factIdx = Math.floor(Math.random() * FACTS.length);

function meter(label, used, max, unit = '') {
  const pct = Math.min(100, (used / max) * 100);
  return h('div.meter', { class: pct >= 100 ? 'full' : pct > 80 ? 'warn' : '' },
    h('div.lbl', h('span', label), h('span.muted', `${used}${unit} / ${max}${unit}`)),
    h('div.bar', h('div', { style: { width: `${pct}%` } })));
}

function renderHardware() {
  const right = document.getElementById('right');
  let box = right.querySelector('#hw');
  if (!box) { box = h('div#hw'); right.append(box); }
  let res;
  try { res = compileProject(store.project); } catch (e) { res = { problems: [e.message], errors: [] }; }
  const d = res.data;
  const activeScene = tabs.find((t) => t.key === activeKey && (t.kind === 'scene' || (t.kind === 'code' && t.id !== 'global')))?.id;
  const sceneIdx = Math.max(0, store.project.scenes.findIndex((s) => s.id === activeScene));
  const sc = d?.scenes[sceneIdx];
  clear(box,
    h('div.rsec', h('h3', '🔬 Raio-X do console'),
      d ? [
        meter('VRAM de sprites (tiles 8x8)', d.objTileCount, LIMITS.objTiles),
        sc ? meter(`Tiles de cenário em "${sc.name}"`, sc.bgTileCount, LIMITS.bgTiles) : null,
        meter('Sprites diferentes', d.sprites.length, 128),
        meter('Efeitos sonoros', store.project.sounds.length, 16),
      ] : h('p.hint', 'Corrija os problemas abaixo para ver o uso de hardware.'),
      res.problems.map((pr) => h('div.l', { style: { color: 'var(--red)', fontSize: '12px', margin: '6px 0' } }, '⚠ ' + pr)),
      res.errors.length ? h('div', { style: { color: 'var(--red)', fontSize: '12px', marginTop: '6px', cursor: 'pointer' }, onclick: () => openCodeAt(res.errors[0].file, res.errors[0].line) },
        `✖ ${res.errors.length} erro(s) nos scripts — clique para ver`) : h('div', { style: { color: 'var(--green)', fontSize: '12px', marginTop: '6px' } }, '✔ scripts sem erros')),
    h('div.rsec', h('h3', '💡 Você sabia?'), h('div.fact', { html: FACTS[factIdx % FACTS.length], onclick: () => { factIdx++; renderHardware(); }, title: 'clique para outra curiosidade', style: { cursor: 'pointer' } })));
}

// ------------------------------------------------------------------ build
async function buildRom(then = null) {
  await store.save();
  const res = compileProject(store.project);
  if (!res.ok) {
    log('A ROM não foi gerada. Corrija primeiro:', 'err');
    res.problems.forEach((p) => log('  ' + p, 'err'));
    res.errors.forEach((e) => log(`  ${e.file}.sns linha ${e.line}: ${e.msg}`, 'err', e));
    toast('Há erros no projeto. Veja o console.', 'err');
    return null;
  }
  const buttons = ['btnBuild', 'btnEmu', 'btnPie'].map((id) => document.getElementById(id));
  buttons.forEach((b) => { b.disabled = true; });
  log('🛠️ Gerando a ROM...', '');
  const off = api.onBuildLog((m) => log(m));
  try {
    const r = await api.buildRom(dir, store.project);
    lastBuild = r;
    log(`✔ ROM gerada: ${r.rom} (${formatBytes(r.size)})`, 'ok');
    const romName = sanitizeName(store.project.name).toLowerCase();
    if (then === 'run') await api.runRom(r.rom, store.project.name);
    else if (then === 'pie') {
      try {
        const dest = await api.sendToRetroPie(r.rom, romName);
        log(`🍓 Copiada para ${dest}. No RetroPie: Start > Quit > Restart EmulationStation.`, 'ok');
        toast('ROM enviada ao RetroPie!', 'ok');
      } catch (e) { log(cleanErr(e), 'err'); toast(cleanErr(e), 'err'); }
    } else {
      const choice = await modal('ROM pronta! 🎉', h('div.col',
        h('p', `Seu jogo virou um arquivo de ${formatBytes(r.size)} que roda em qualquer emulador de Super Nintendo, inclusive no RetroPie.`),
        h('p.mono.muted', r.summary.replace(/\r/g, ''))),
      [{ label: 'Fechar' }, { label: '📁 Mostrar pasta', value: 'show' }, { label: '💾 Salvar como...', value: 'save' }, { label: '🍓 Enviar ao RetroPie', value: 'pie' }, { label: '🕹️ Rodar no emulador', primary: true, value: 'run' }]);
      if (choice === 'run') api.runRom(r.rom, store.project.name);
      if (choice === 'save') { const p = await api.saveRomAs(r.rom, romName); if (p) log(`ROM salva em ${p}`, 'ok'); }
      if (choice === 'show') api.revealFile(r.rom);
      if (choice === 'pie') {
        try { const dest = await api.sendToRetroPie(r.rom, romName); log(`🍓 Copiada para ${dest}`, 'ok'); toast('ROM enviada ao RetroPie!', 'ok'); } catch (e) { log(cleanErr(e), 'err'); toast(cleanErr(e), 'err'); }
      }
    }
    return r;
  } catch (e) {
    log('✖ Falha ao gerar a ROM:', 'err');
    log(cleanErr(e), 'err');
    toast('Falha ao gerar a ROM. Veja o console.', 'err');
    return null;
  } finally {
    off();
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function cleanErr(e) {
  return String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ------------------------------------------------------------------ tutoriais
async function chooseTutorial() {
  const { TUTORIALS } = await import('../../core/tutorials/index.js');
  const list = h('div.list', TUTORIALS.map((t) => h('div.it', { onclick: () => { back.value = t.id; document.querySelector('.modal-back .btn.primary')?.click(); } },
    h('span', { style: { fontSize: '22px' } }, t.icon), h('div.grow', h('b', t.title), h('div.hint', t.description)))));
  const back = { value: null };
  const ok = await modal('Tutoriais', h('div.col', h('p.hint', 'Os tutoriais funcionam melhor num projeto novo criado pelo Hub (aba Aprender), que já vem com as artes prontas.'), list), [{ label: 'Fechar' }]);
  void ok;
  if (back.value) startTutorial(back.value);
}

async function startTutorial(id) {
  const { TUTORIALS } = await import('../../core/tutorials/index.js');
  const def = TUTORIALS.find((t) => t.id === id);
  if (!def) return;
  tutorial?.dispose();
  tutorial = new Tutorial(def, ctx, document.getElementById('right'));
  tutorial.start();
}

// ------------------------------------------------------------------ atalhos e divisórias
document.addEventListener('keydown', (e) => {
  const inText = e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.type === 'text');
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); store.save(); }
  else if (!inText && e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); store.undo(); }
  else if (!inText && e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); store.redo(); }
  else if (e.key === 'F5') { e.preventDefault(); play(); }
  else if (e.key === 'F6') { e.preventDefault(); buildRom(); }
  else if (e.key === 'F7') { e.preventDefault(); buildRom('run'); }
});

function splitter(id, target, side) {
  const sp = document.getElementById(id);
  sp.onmousedown = (e) => {
    const startX = e.clientX, startW = target.offsetWidth;
    const move = (ev) => { target.style.width = `${Math.max(160, startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX))}px`; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); window.dispatchEvent(new Event('resize')); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
}

window.addEventListener('beforeunload', () => { if (store.dirty) store.save(); });

// ------------------------------------------------------------------ início
async function init() {
  await store.load(dir);
  document.title = `${store.project.name} — Sneslador`;
  renderTop();
  renderTree();
  splitter('splitL', document.getElementById('left'), 'left');
  splitter('splitR', document.getElementById('right'), 'right');
  store.on('change', ({ kind }) => {
    renderTree();
    renderTabs();
    updateHardware();
    for (const t of tabs) t.inst.refresh?.(kind);
    tutorial?.onProjectChange();
  });
  const start = store.project.scenes.find((s) => s.id === store.project.startScene) ?? store.project.scenes[0];
  await openTab('scene', start.id);
  log(`Projeto "${store.project.name}" aberto. F5 = jogar, F6 = gerar ROM, F7 = rodar no emulador.`, 'ok');
  // gancho usado pelos testes automáticos de interface
  window.__sneslador = { openTab, store, startTutorial, buildRom };
  const tut = params.get('tutorial');
  if (tut) startTutorial(tut);
  updateHardware();
}

init().catch((e) => { log('Erro ao abrir o projeto: ' + e.message, 'err'); console.error(e); });
