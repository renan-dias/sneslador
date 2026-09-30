// Pequenos utilitários de interface sem framework.

/** Cria um elemento: h('div.card#id', {onclick}, filhos...) */
export function h(tag, props = {}, ...children) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

let toastBox = null;
export function toast(msg, kind = '') {
  if (!toastBox) { toastBox = h('div.toasts'); document.body.append(toastBox); }
  const t = h('div.toast', { class: kind }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}

export function modal(title, body, actions = [{ label: 'OK', primary: true }]) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        const p = actions.find((a) => a.primary);
        if (p) { e.preventDefault(); close(p.value ?? true); }
      }
    };
    const back = h('div.modal-back', { onmousedown: (e) => { if (e.target === back) close(null); } },
      h('div.modal', title ? h('h2', title) : null, body,
        h('div.actions', actions.map((a) => h('button.btn', { class: a.primary ? 'primary' : a.danger ? 'danger' : '', onclick: () => close(a.value ?? (a.primary ? true : null)) }, a.label)))));
    document.body.append(back);
    document.addEventListener('keydown', onKey);
    setTimeout(() => back.querySelector('input,select,textarea')?.focus(), 30);
  });
}

export async function prompt(title, label, value = '', { placeholder = '', validate } = {}) {
  const input = h('input', { type: 'text', value, placeholder, style: { width: '100%' } });
  const err = h('div.muted', { style: { minHeight: '18px', color: 'var(--red)', marginTop: '4px' } });
  for (;;) {
    const ok = await modal(title, h('div', h('label.field', label, input), err), [{ label: 'Cancelar' }, { label: 'OK', primary: true }]);
    if (!ok) return null;
    const v = input.value.trim();
    const problem = validate?.(v);
    if (!problem) return v;
    err.textContent = problem;
    input.value = v;
  }
}

export async function confirmDialog(title, text, okLabel = 'Confirmar', danger = false) {
  return !!(await modal(title, h('p', text), [{ label: 'Cancelar' }, { label: okLabel, primary: !danger, danger, value: true }]));
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} dias`;
}

/** Desenha texto com a fonte 8x8 do SNES num canvas (usado no logo). */
export function pixelText(text, glyphs, { scale = 3, color = '#fff', shadow = '#000' } = {}) {
  const c = document.createElement('canvas');
  c.width = text.length * 8 * scale;
  c.height = 8 * scale;
  const g = c.getContext('2d');
  [...text].forEach((ch, i) => {
    const gl = glyphs[ch.charCodeAt(0) - 32];
    if (!gl) return;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = gl[y * 8 + x];
        if (!v) continue;
        g.fillStyle = v === 1 ? color : shadow;
        g.fillRect((i * 8 + x) * scale, y * scale, scale, scale);
      }
    }
  });
  c.className = 'pixel';
  return c;
}
