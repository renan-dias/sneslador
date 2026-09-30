// Editor de código SNS: realce de sintaxe, erros ao vivo e referência da API.
import { h, clear } from '../../shared/ui.js';
import { BUILTINS, BUILTIN_CONSTS } from '../../../core/lang/api.js';
import { assetConstants } from '../../../core/project.js';

const KW = new Set(['var', 'const', 'array', 'func', 'if', 'then', 'elseif', 'else', 'end', 'while', 'do', 'for', 'to', 'step', 'return', 'break', 'continue', 'and', 'or', 'not', 'true', 'false']);

const STYLE = `
.code-root { flex: 1; display: flex; min-width: 0; }
.code-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.code-area { flex: 1; position: relative; overflow: auto; background: #14152a; font: 14px/21px var(--mono); }
.code-inner { position: relative; min-height: 100%; display: flex; }
.code-gutter { flex: none; width: 48px; text-align: right; padding: 10px 8px 200px 0; color: #4a4d78; user-select: none; background: #111224; border-right: 1px solid var(--line); white-space: pre; }
.code-gutter .e { color: #ff6b6b; font-weight: bold; }
.code-edit { position: relative; flex: 1; min-width: 0; }
.code-edit pre, .code-edit textarea { margin: 0; padding: 10px 14px 200px; font: inherit; white-space: pre; tab-size: 2; border: 0; min-height: 100%; }
.code-edit pre { pointer-events: none; color: #d6d8f5; position: relative; }
.code-edit textarea { position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; color: transparent; caret-color: #fff; resize: none; outline: none; overflow: hidden; }
.code-edit textarea::selection { background: #7c5cff66; color: transparent; }
.tk-kw { color: #c792ea; font-weight: 600; }
.tk-num { color: #f78c6c; }
.tk-str { color: #c3e88d; }
.tk-com { color: #5c6394; font-style: italic; }
.tk-fn { color: #82aaff; }
.tk-const { color: #ffcb6b; }
.tk-asset { color: #89ddff; }
.errline { background: rgba(229,72,77,0.16); display: inline-block; width: 100%; box-shadow: inset 3px 0 0 #e5484d; }
.hlline { background: rgba(245,197,66,0.14); display: inline-block; width: 100%; }
.code-errors { max-height: 110px; overflow: auto; border-top: 1px solid var(--line); background: var(--bg2); font-size: 12px; }
.code-errors div { padding: 4px 12px; cursor: pointer; color: #ff9a9f; }
.code-errors div:hover { background: var(--panel); }
.code-errors .ok { color: var(--green); cursor: default; }
.ref { width: 300px; border-left: 1px solid var(--line); background: var(--bg2); overflow: auto; flex: none; font-size: 12px; }
.ref .fn { padding: 5px 12px; cursor: pointer; border-bottom: 1px solid #ffffff08; }
.ref .fn:hover { background: var(--panel); }
.ref .fn .sig { font-family: var(--mono); color: #82aaff; }
.ref .fn .d { color: var(--muted); margin-top: 2px; }
.ref .grp { padding: 10px 12px 4px; font-weight: 650; color: var(--accent2); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.ref .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 12px; }
.ref .chip { font-family: var(--mono); font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--panel); border: 1px solid var(--line); cursor: pointer; }
.ref .chip:hover { border-color: var(--accent); }
`;

export function mount(el, ctx, id, opts = {}) {
  const { store } = ctx;
  if (!document.getElementById('code-style')) document.head.append(h('style#code-style', STYLE));
  const isGlobal = id === 'global';
  const getSrc = () => (isGlobal ? store.project.globalScript : store.scene(id)?.script) ?? '';
  const fileName = () => (isGlobal ? 'global' : store.scene(id)?.name);

  const ta = h('textarea', { spellcheck: false, autocomplete: 'off', 'data-code': id });
  const pre = h('pre');
  const gutter = h('div.code-gutter');
  const area = h('div.code-area', h('div.code-inner', gutter, h('div.code-edit', pre, ta)));
  const errBox = h('div.code-errors');
  const ref = h('div.ref');
  el.append(h('div.code-root', h('div.code-main',
    h('div.toolbar', h('b', `${fileName()}.sns`), h('span.hint', isGlobal ? 'variáveis e funções visíveis em todas as cenas' : 'start() roda 1 vez · update() roda 60x por segundo'),
      h('div.spacer'), h('span.hint', 'Ctrl+Espaço: sugestões'), h('button.btn.small.primary', { onclick: () => ctx.showPlay() }, '▶ Jogar')),
    area, errBox), ref));

  ta.value = getSrc();
  let errors = [];
  let highlightLine = opts.line ?? null;

  function assetNames() {
    return new Set(Object.keys(assetConstants(store.project)));
  }

  function highlight(src) {
    const assets = assetNames();
    const errLines = new Set(errors.map((e) => e.line));
    const lines = src.split('\n');
    const out = lines.map((ln, i) => {
      let html = '';
      let j = 0;
      while (j < ln.length) {
        const rest = ln.slice(j);
        let m;
        if ((m = rest.match(/^\/\/.*/))) { html += `<span class="tk-com">${esc(m[0])}</span>`; j += m[0].length; continue; }
        if ((m = rest.match(/^"([^"\\]|\\.)*"?/))) { html += `<span class="tk-str">${esc(m[0])}</span>`; j += m[0].length; continue; }
        if ((m = rest.match(/^(\$[0-9a-fA-F_]+|0x[0-9a-fA-F_]+|0b[01_]+|\d[\d_]*)/))) { html += `<span class="tk-num">${esc(m[0])}</span>`; j += m[0].length; continue; }
        if ((m = rest.match(/^[A-Za-z_]\w*/))) {
          const w = m[0];
          const cls = KW.has(w) ? 'tk-kw' : BUILTINS[w] ? 'tk-fn' : w in BUILTIN_CONSTS ? 'tk-const' : assets.has(w) ? 'tk-asset' : '';
          html += cls ? `<span class="${cls}">${w}</span>` : w;
          j += w.length;
          continue;
        }
        html += esc(ln[j]);
        j++;
      }
      const lineNo = i + 1;
      if (errLines.has(lineNo)) return `<span class="errline">${html || ' '}</span>`;
      if (highlightLine === lineNo) return `<span class="hlline">${html || ' '}</span>`;
      return html;
    });
    pre.innerHTML = out.join('\n') + '\n';
    gutter.innerHTML = lines.map((_, i) => (errLines.has(i + 1) ? `<span class="e">● ${i + 1}</span>` : String(i + 1))).join('\n');
    ta.style.height = `${pre.scrollHeight}px`;
    ta.style.width = `${Math.max(pre.scrollWidth, area.clientWidth - 48)}px`;
  }

  function compileCheck() {
    const res = ctx.compile();
    errors = res.errors.filter((e) => e.file === fileName());
    const others = res.errors.filter((e) => e.file !== fileName());
    clear(errBox,
      errors.length ? errors.map((e) => h('div', { onclick: () => goLine(e.line, e.col) }, `✖ linha ${e.line}: ${e.msg}`))
        : h('div.ok', '✔ Sem erros neste script.'),
      others.length ? h('div', { onclick: () => ctx.openTab('code', others[0].file === 'global' ? 'global' : store.project.scenes.find((s) => s.name === others[0].file)?.id) },
        `⚠ Há ${others.length} erro(s) em outro script (${others[0].file}.sns). Clique para ver.`) : null);
    highlight(ta.value);
  }

  let timer = null;
  ta.addEventListener('input', () => {
    highlightLine = null;
    highlight(ta.value);
    store.change('script', (p) => {
      if (isGlobal) p.globalScript = ta.value;
      else store.scene(id).script = ta.value;
    }, { id, undoable: false });
    clearTimeout(timer);
    timer = setTimeout(compileCheck, 350);
    hideSuggest();
  });

  ta.addEventListener('keydown', (e) => {
    if (suggestBox && handleSuggestKey(e)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText(e.shiftKey ? '' : '  ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const before = ta.value.slice(0, ta.selectionStart);
      const cur = before.split('\n').pop();
      let indent = cur.match(/^\s*/)[0];
      if (/^\s*(func|if|while|for|else|elseif)\b/.test(cur) && !/\bend\s*$/.test(cur)) indent += '  ';
      insertText('\n' + indent);
    } else if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      showSuggest();
    }
    stopShortcuts(e);
  });

  function stopShortcuts(e) {
    // Ctrl+Z / Ctrl+Y ficam com o desfazer nativo do texto
    if (e.ctrlKey && ['z', 'y'].includes(e.key.toLowerCase())) e.stopPropagation();
  }

  function insertText(text) {
    ta.focus();
    document.execCommand('insertText', false, text);
  }

  function goLine(line, col = 1) {
    const lines = ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos + col - 1, pos + (lines[line - 1]?.length ?? 0));
    highlightLine = line;
    highlight(ta.value);
    area.scrollTop = Math.max(0, (line - 6) * 21);
  }

  // ---------------- sugestões (Ctrl+Espaço)
  let suggestBox = null, suggestItems = [], suggestSel = 0;
  function wordBefore() {
    const m = ta.value.slice(0, ta.selectionStart).match(/[A-Za-z_]\w*$/);
    return m ? m[0] : '';
  }
  function showSuggest() {
    const w = wordBefore();
    const all = [...Object.keys(BUILTINS).map((n) => ({ n, t: 'fn' })), ...Object.keys(BUILTIN_CONSTS).map((n) => ({ n, t: 'const' })), ...[...assetNames()].map((n) => ({ n, t: 'asset' })), ...[...KW].map((n) => ({ n, t: 'kw' }))];
    suggestItems = all.filter((x) => x.n.toLowerCase().startsWith(w.toLowerCase())).slice(0, 12);
    if (!suggestItems.length) return;
    suggestSel = 0;
    hideSuggest();
    suggestBox = h('div.card', { style: { position: 'fixed', zIndex: 50, padding: '4px', fontFamily: 'var(--mono)', fontSize: '12px', minWidth: '220px' } });
    const r = ta.getBoundingClientRect();
    const lineNo = ta.value.slice(0, ta.selectionStart).split('\n').length;
    const colNo = ta.value.slice(0, ta.selectionStart).split('\n').pop().length;
    suggestBox.style.left = `${r.left + 14 + colNo * 7.7}px`;
    suggestBox.style.top = `${r.top + 10 + lineNo * 21}px`;
    drawSuggest();
    document.body.append(suggestBox);
  }
  function drawSuggest() {
    clear(suggestBox, suggestItems.map((it, i) => h('div', { style: { padding: '3px 8px', borderRadius: '4px', background: i === suggestSel ? 'var(--accent)' : '', cursor: 'pointer' }, onmousedown: (e) => { e.preventDefault(); suggestSel = i; acceptSuggest(); } },
      it.n, h('span', { style: { float: 'right', opacity: 0.6, marginLeft: '12px' } }, { fn: 'função', const: 'constante', asset: 'asset', kw: 'palavra' }[it.t]))));
  }
  function acceptSuggest() {
    const it = suggestItems[suggestSel];
    const w = wordBefore();
    ta.setSelectionRange(ta.selectionStart - w.length, ta.selectionStart);
    insertText(it.t === 'fn' ? `${it.n}(` : it.n);
    hideSuggest();
  }
  function hideSuggest() { suggestBox?.remove(); suggestBox = null; }
  function handleSuggestKey(e) {
    if (e.key === 'ArrowDown') { suggestSel = (suggestSel + 1) % suggestItems.length; drawSuggest(); e.preventDefault(); return true; }
    if (e.key === 'ArrowUp') { suggestSel = (suggestSel + suggestItems.length - 1) % suggestItems.length; drawSuggest(); e.preventDefault(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { acceptSuggest(); e.preventDefault(); return true; }
    if (e.key === 'Escape') { hideSuggest(); return true; }
    return false;
  }
  ta.addEventListener('blur', () => setTimeout(hideSuggest, 150));

  // ---------------- referência
  function drawRef() {
    const groups = {};
    for (const [name, b] of Object.entries(BUILTINS)) (groups[b.group] ??= []).push([name, b]);
    const p = store.project;
    const chips = (title, names) => (names.length ? [h('div.grp', title), h('div.chips', names.map((n) => h('span.chip', { title: 'clique para inserir', onclick: () => insertText(n) }, n)))] : null);
    const animNames = p.sprites.flatMap((s) => s.anims.map((a) => `${s.name}_${a.name}`));
    clear(ref,
      h('div.grp', 'Seus assets'),
      chips('Sprites', p.sprites.map((s) => s.name)),
      chips('Animações', animNames),
      chips('Sons', p.sounds.map((s) => s.name)),
      chips('Músicas', (p.songs ?? []).map((s) => s.name)),
      chips('Cenas', p.scenes.map((s) => s.name)),
      chips('Botões do controle', ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT']),
      Object.entries(groups).map(([g, list]) => [h('div.grp', g), list.map(([name, b]) => h('div.fn', { title: 'clique para inserir', onclick: () => insertText(`${name}(${b.args.filter((a) => !a.endsWith('?')).join(', ')})`) },
        h('div.sig', `${name}(${b.args.join(', ')})${b.ret ? ' → valor' : ''}`), h('div.d', b.doc)))]),
      h('div.grp', 'Linguagem'),
      h('div', { style: { padding: '4px 12px 20px', color: 'var(--muted)', lineHeight: 1.6 } },
        h('div.mono', 'var x = 10'), h('div.mono', 'const VEL = 2'), h('div.mono', 'array grade[200]'), h('div.mono', 'if a > b then ... elseif ... else ... end'),
        h('div.mono', 'while cond do ... end'), h('div.mono', 'for i = 0 to 9 do ... end'), h('div.mono', 'func soma(a, b) return a + b end'),
        h('p', 'Todos os números são inteiros de 16 bits (-32768 a 32767), igual ao processador do SNES. Divisão ignora a parte decimal: 7 / 2 = 3.')));
  }

  ta.addEventListener('scroll', () => { ta.scrollTop = 0; ta.scrollLeft = 0; });
  drawRef();
  compileCheck();
  if (opts.line) setTimeout(() => goLine(opts.line), 50);

  return {
    onShow: () => { highlight(ta.value); },
    reveal: (o) => { if (o?.line) goLine(o.line); },
    refresh(kind) {
      const src = getSrc();
      if (src !== ta.value && document.activeElement !== ta) { ta.value = src; }
      else if (src !== ta.value && kind !== 'script') { ta.value = src; }
      if (kind !== 'script') { drawRef(); }
      clearTimeout(timer);
      timer = setTimeout(compileCheck, 200);
    },
    insert: insertText,
    get textarea() { return ta; },
  };
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
