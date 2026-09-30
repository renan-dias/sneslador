import { h, clear, toast, modal, prompt, confirmDialog, formatBytes, timeAgo, pixelText } from '../shared/ui.js';
import { FONT_GLYPHS } from '../../core/gfx/font.js';
import { TUTORIALS } from '../../core/tutorials/index.js';

const api = window.sneslador;
const main = document.getElementById('main');
let current = 'projetos';

const PAGES = [
  { id: 'projetos', icon: '🎮', label: 'Projetos', render: renderProjects },
  { id: 'aprender', icon: '🎓', label: 'Aprender', render: renderLearn },
  { id: 'versoes', icon: '⬇️', label: 'Versões', render: renderUpdates },
  { id: 'toolchain', icon: '🧰', label: 'Toolchain SNES', render: renderToolchain },
  { id: 'config', icon: '⚙️', label: 'Configurações', render: renderSettings },
];

// ------------------------------------------------------------------ layout
function renderNav() {
  clear(document.getElementById('nav'), PAGES.map((p) => h('a', { class: p.id === current ? 'active' : '', onclick: () => go(p.id) }, h('span.ic', p.icon), p.label)));
}

function go(id) {
  current = id;
  renderNav();
  PAGES.find((p) => p.id === id).render();
}

async function init() {
  const logo = document.getElementById('logo');
  logo.append(pixelText('SNESLADOR', FONT_GLYPHS, { scale: 2.5, color: '#fff', shadow: '#7c5cff' }));
  logo.append(h('div.bar', ['#e5484d', '#f5c542', '#3e8bff', '#3ecf6e'].map((c) => h('i', { style: { background: c } }))));
  logo.append(h('div.tag', 'ESTÚDIO DE JOGOS RETRÔ'));
  const info = await api.appInfo();
  document.getElementById('version').textContent = `versão ${info.version}${info.dev ? ' (dev)' : ''}`;
  go('projetos');
}

// ------------------------------------------------------------------ projetos
async function renderProjects() {
  clear(main, h('div.head', h('div.grow', h('h1', 'Meus projetos'), h('p.muted', 'Cada projeto vira uma ROM de Super Nintendo que roda no RetroPie.')),
    h('button.btn', { onclick: importProject }, '📂 Abrir pasta...'),
    h('button.btn.primary', { onclick: () => newProject() }, '＋ Novo projeto')));
  const grid = h('div.grid');
  main.append(grid);
  const list = await api.listProjects();
  grid.append(h('div.card.proj.new-card', { onclick: () => newProject() }, h('div', { style: { textAlign: 'center' } }, h('div', { style: { fontSize: '34px' } }, '＋'), 'Novo projeto')));
  for (const p of list) {
    const thumb = h('div.thumb', p.thumb ? '' : '🕹️');
    if (p.thumb) thumb.style.backgroundImage = `url(data:image/png;base64,${p.thumb})`;
    grid.append(h('div.card.proj', { onclick: () => api.openProject(p.dir) },
      thumb,
      h('div.info', h('div.name', p.name), h('div.meta', `${p.scenes} cena(s) · ${p.sprites} sprite(s) · ${timeAgo(p.modified)}`)),
      h('div.tools',
        h('button.btn.small', { onclick: (e) => { e.stopPropagation(); api.revealProject(p.dir); } }, 'Pasta'),
        h('div.spacer'),
        h('button.btn.small.danger', { onclick: async (e) => {
          e.stopPropagation();
          if (await confirmDialog('Apagar projeto', `Mover "${p.name}" para a Lixeira do Windows?`, 'Mover para a Lixeira', true)) {
            await api.trashProject(p.dir);
            renderProjects();
          }
        } }, 'Apagar'))));
  }
}

async function importProject() {
  try { await api.importProject(); } catch (e) { toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err'); }
}

async function newProject(presetTemplate = null, tutorialId = null) {
  const templates = await api.templates();
  let sel = presetTemplate ?? templates[0].id;
  const name = h('input', { type: 'text', value: 'Meu Jogo', style: { width: '100%' } });
  const list = h('div.tpl-list');
  const draw = () => clear(list, templates.map((t) => h('div.card.tpl', { class: t.id === sel ? 'sel' : '', onclick: () => { sel = t.id; draw(); } },
    h('div.ic', t.icon), h('div.t', t.name), h('div.stars', '★'.repeat(t.difficulty) + '☆'.repeat(3 - t.difficulty)), h('div.d', t.description))));
  draw();
  const ok = await modal('Novo projeto', h('div.col', h('label.field', 'Nome do jogo', name), h('div.muted', 'Comece de um modelo:'), list),
    [{ label: 'Cancelar' }, { label: 'Criar e abrir', primary: true }]);
  if (!ok) return;
  const n = name.value.trim() || 'Meu Jogo';
  try {
    await api.createProject(n, sel, tutorialId);
    renderProjects();
  } catch (e) { toast(cleanErr(e), 'err'); }
}

// ------------------------------------------------------------------ aprender
async function renderLearn() {
  const settings = await api.getSettings();
  clear(main, h('div.head', h('div.grow', h('h1', 'Aprender fazendo'),
    h('p.muted', 'Tutoriais passo a passo: a engine explica cada conceito do SNES e vai construindo o jogo junto com você.'))));
  const list = h('div.tut-list');
  for (const t of TUTORIALS) {
    const done = settings.tutorialsDone?.[t.id];
    list.append(h('div.card.tut',
      h('div.big', t.icon),
      h('div.grow',
        h('div.row', h('h3', t.title), h('span.stars', '★'.repeat(t.difficulty) + '☆'.repeat(3 - t.difficulty)), done ? h('span.badge.ok', 'concluído') : null),
        h('p', { style: { margin: '4px 0' } }, t.description),
        h('div.steps', `${t.steps.length} passos · aprende: ${t.teaches.join(', ')}`)),
      h('button.btn.primary', { onclick: async () => {
        const n = await prompt(t.title, 'Nome do projeto', t.projectName);
        if (!n) return;
        try { await api.createProject(n, t.template, t.id); } catch (e) { toast(cleanErr(e), 'err'); }
      } }, '▶ Começar')));
  }
  main.append(list);
}

// ------------------------------------------------------------------ versões
async function renderUpdates() {
  const settings = await api.getSettings();
  const box = h('div.section.card', h('p.muted', 'Consultando o GitHub...'));
  clear(main, h('div.head', h('div.grow', h('h1', 'Versões do Sneslador'),
    h('p.muted', `Baixa as versões publicadas em github.com/${settings.githubRepo}/releases (a mais recente é a "latest").`)),
  h('button.btn', { onclick: renderUpdates }, '↻ Verificar')), box);
  try {
    const r = await api.checkUpdates();
    const releases = r.all.length ? r.all : [r.latest];
    clear(box,
      h('div.row', h('h3.grow', `Você está na versão ${r.current}`), r.newer ? h('span.badge.warn', `nova versão: ${r.latest.tag}`) : h('span.badge.ok', 'atualizado')),
      releases.map((rel) => {
        const bar = h('div.progress.hidden', h('div'));
        return h('div.release',
          h('div.row', h('b', rel.name), rel.tag === r.latest.tag ? h('span.badge.ok', 'latest') : null, rel.prerelease ? h('span.badge.warn', 'pré-lançamento') : null,
            h('span.muted', new Date(rel.date).toLocaleDateString('pt-BR')), h('div.spacer'),
            h('button.btn.small', { onclick: () => api.openExternal(rel.url) }, 'Ver no GitHub'),
            h('button.btn.small.primary', { disabled: !rel.assets.length, onclick: async (e) => {
              e.target.disabled = true;
              bar.classList.remove('hidden');
              const off = api.onUpdateProgress((p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; });
              try { await api.installUpdate(rel); } catch (err) { toast(cleanErr(err), 'err'); } finally { off(); e.target.disabled = false; }
            } }, 'Baixar e instalar')),
          rel.assets.length ? h('div.muted', { style: { fontSize: '12px' } }, rel.assets.map((a) => `${a.name} (${formatBytes(a.size)})`).join(' · ')) : h('div.muted', 'sem arquivos anexados'),
          bar,
          rel.notes ? h('div.notes', rel.notes) : null);
      }));
  } catch (e) {
    clear(box, h('h3', 'Não foi possível consultar as versões'), h('p.muted', cleanErr(e)),
      h('div.explain', 'Verifique a conexão com a internet e se o repositório configurado em ', h('b', 'Configurações'), ' está correto e tem releases publicadas.'));
  }
}

// ------------------------------------------------------------------ toolchain
async function renderToolchain() {
  const st = await api.toolchainStatus();
  const bar = h('div.progress.hidden', h('div'));
  const stepLbl = h('span.muted');
  clear(main, h('div.head', h('div.grow', h('h1', 'Toolchain do SNES'), h('p.muted', 'As ferramentas que transformam o seu jogo numa ROM de verdade.'))),
    h('div.section.card',
      h('div.row', h('h3.grow', `PVSnesLib ${st.version}`), st.home ? h('span.badge.ok', 'instalado') : h('span.badge.err', 'não instalado')),
      st.home ? h('p.mono.muted', st.home) : h('p', 'Sem o toolchain você ainda pode criar e testar no live view, mas não consegue gerar a ROM (.sfc).'),
      h('div.row', h('button.btn.primary', { onclick: async (e) => {
        e.target.disabled = true;
        bar.classList.remove('hidden');
        const off = api.onToolchainProgress(({ step, p }) => { stepLbl.textContent = step; bar.firstChild.style.width = `${Math.round(p * 100)}%`; });
        try { await api.installToolchain(); toast('Toolchain instalado!', 'ok'); renderToolchain(); } catch (err) { toast(cleanErr(err), 'err'); e.target.disabled = false; } finally { off(); }
      } }, st.home ? 'Reinstalar' : '⬇ Instalar (~12 MB)'), stepLbl),
      bar,
      h('div.explain',
        h('b', 'Como a ROM nasce: '), 'seus scripts viram código C → o compilador ', h('b', '816-tcc'), ' traduz para assembly do processador ',
        h('b', '65816'), ' (a CPU do Super Nintendo) → o ', h('b', 'wla-65816'), ' monta o código de máquina → o ', h('b', 'wlalink'),
        ' junta tudo com os gráficos e sons num arquivo .sfc, igual a um cartucho. Os sons viram amostras ', h('b', 'BRR'),
        ' para o chip de som SPC700 da Sony.')));
}

// ------------------------------------------------------------------ configurações
async function renderSettings() {
  const s = await api.getSettings();
  const repo = h('input', { type: 'text', value: s.githubRepo, placeholder: 'dono/repositorio', style: { width: '100%' } });
  const pie = h('input', { type: 'text', value: s.retropiePath, style: { width: '100%' } });
  const dir = h('span.mono', s.projectsDir);
  clear(main, h('div.head', h('h1', 'Configurações')),
    h('div.section.card', h('div.kv',
      h('span', 'Pasta dos projetos'), h('div.row', dir, h('div.spacer'), h('button.btn.small', { onclick: async () => { const d = await api.chooseProjectsDir(); if (d) dir.textContent = d; } }, 'Trocar...')),
      h('span', 'Repositório do GitHub'), repo,
      h('span', 'Pasta de ROMs do RetroPie'), pie),
    h('div.explain', h('b', 'RetroPie: '), 'com o Raspberry Pi ligado na mesma rede, o RetroPie compartilha a pasta ', h('span.mono', '\\\\RETROPIE\\roms\\snes'),
      '. O botão "Enviar para o RetroPie" do editor copia a ROM direto para lá. Depois é só reiniciar o EmulationStation (Start > Quit > Restart EmulationStation).'),
    h('div.row', { style: { marginTop: '14px' } }, h('div.spacer'), h('button.btn.primary', { onclick: async () => {
      await api.setSettings({ githubRepo: repo.value.trim(), retropiePath: pie.value.trim() });
      toast('Configurações salvas', 'ok');
    } }, 'Salvar'))),
    h('div.section.card', h('h3', 'Controles no live view (teclado)'),
      h('div.kv', Object.entries(s.keyboard).map(([btn, key]) => [h('span', btnLabel(btn)), h('span', h('kbd', key.replace(/^Key/, '').replace(/^Arrow/, '')))])),
      h('p.muted', 'Controles USB (joystick) também funcionam automaticamente.')));
}

function btnLabel(b) {
  return { UP: 'Cima', DOWN: 'Baixo', LEFT: 'Esquerda', RIGHT: 'Direita', START: 'Start', SELECT: 'Select' }[b] ?? `Botão ${b}`;
}

function cleanErr(e) {
  return String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

init();
