// Compositor estilo Mario Paint: clique na pauta para carimbar notas com o instrumento escolhido.
import { h, clear, toast, confirmDialog } from '../../shared/ui.js';
import { INSTRUMENTS } from '../../../core/audio/instruments.js';
import { STAFF, STAFF_LINES, MAX_NOTES_PER_COLUMN, noteMidi } from '../../../core/audio/song.js';
import { playNote, playSong } from '../audio.js';

const COL_W = 44;
const STEP = 19; // pixels por posição da pauta (linha/espaço)
const TOP = 36;
const LEFT = 104;

export function mount(el, ctx, id) {
  const { store } = ctx;
  const song = () => store.song(id);
  let inst = 'cogumelo';
  let acc = 0;
  let eraser = false;
  let player = null;
  let playCol = -1;
  let hover = null;

  const canvas = h('canvas');
  const wrap = h('div', { style: { flex: 1, overflow: 'auto', background: '#f4efe0', position: 'relative' } }, canvas);
  const top = h('div.toolbar');
  const bottom = h('div.toolbar');
  el.append(h('div.col', { style: { flex: 1, minWidth: 0, gap: 0 } }, top, wrap, bottom));

  const H = TOP + STEP * (STAFF.length + 1) + 30;

  function drawTop() {
    const s = song();
    clear(top,
      h('div.grp', INSTRUMENTS.map((it) => h('button.btn', {
        class: inst === it.id && !eraser ? 'active' : '',
        title: `${it.name}: ${it.desc}`,
        'data-inst': it.id,
        style: { fontSize: '20px', padding: '2px 8px' },
        onclick: () => { inst = it.id; eraser = false; drawTop(); playNote(it.id, 72); },
      }, it.icon))),
      h('button.btn', { class: eraser ? 'active' : '', title: 'Borracha (ou botão direito na nota)', style: { fontSize: '18px', padding: '2px 8px' }, onclick: () => { eraser = !eraser; drawTop(); } }, '🧽'),
      h('div.sep'),
      h('div.grp',
        h('button.btn.small', { class: acc === 1 ? 'active' : '', title: 'Sustenido: meio tom acima', onclick: () => { acc = acc === 1 ? 0 : 1; drawTop(); } }, '♯'),
        h('button.btn.small', { class: acc === -1 ? 'active' : '', title: 'Bemol: meio tom abaixo', onclick: () => { acc = acc === -1 ? 0 : -1; drawTop(); } }, '♭')),
      h('div.sep'),
      player ? h('button.btn.a', { onclick: stop }, '■ Parar') : h('button.btn.primary', { 'data-action': 'play-song', onclick: play }, '▶ Tocar'),
      h('div.slider', { style: { gridTemplateColumns: '50px 140px 60px' } }, h('span', 'Tempo'),
        h('input', { type: 'range', min: 60, max: 400, step: 5, value: s.tempo, oninput: (e) => { store.change('music', () => { s.tempo = Number(e.target.value); }, { id, coalesce: 'tempo' }); e.target.nextSibling.textContent = `${e.target.value}`; } }),
        h('span.mono', `${s.tempo}`)),
      h('span.hint', 'batidas/min'),
      h('div.spacer'),
      h('span.hint', `${INSTRUMENTS.find((x) => x.id === inst)?.name ?? ''}`));
  }

  function drawBottom() {
    const s = song();
    const used = new Set(s.notes.map((n) => n.i));
    clear(bottom,
      h('span', 'Compassos:'),
      h('button.btn.small', { onclick: () => setLength(s.length - 4) }, '−'),
      h('b', `${s.length / 4}`),
      h('button.btn.small', { onclick: () => setLength(s.length + 4) }, '+'),
      h('span.hint', `(${s.length} batidas)`),
      h('div.sep'),
      h('span.hint', `${s.notes.length} notas · ${used.size} instrumento(s) · na ROM: 3 canais do SPC700, cada instrumento vira uma amostra BRR`),
      h('div.spacer'),
      h('span.hint', 'No código: '), h('span.mono', `music(${s.name})`),
      h('button.btn.small.danger', { onclick: async () => { if (await confirmDialog('Limpar música', 'Apagar todas as notas?', 'Apagar', true)) store.change('music', () => { s.notes = []; }, { id }); } }, 'Limpar'));
  }

  function setLength(n) {
    const s = song();
    n = Math.max(32, Math.min(256, n));
    store.change('music', () => { s.length = n; s.notes = s.notes.filter((x) => x.c < n); }, { id });
  }

  const yOf = (pos) => TOP + (STAFF.length - 1 - pos) * STEP + STEP;

  function draw() {
    const s = song();
    canvas.width = LEFT + s.length * COL_W + 40;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#f4efe0';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // colunas / compassos
    for (let c = 0; c < s.length; c++) {
      const x = LEFT + c * COL_W;
      if (c === playCol) { g.fillStyle = 'rgba(124,92,255,0.25)'; g.fillRect(x, 0, COL_W, H); }
      else if (hover && hover.c === c) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, COL_W, H); }
      if (c % 4 === 0) {
        g.fillStyle = '#9b8f6e';
        g.font = '11px Segoe UI';
        g.fillText(String(c / 4 + 1), x + 3, 14);
        g.strokeStyle = '#8a7f60';
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x + 0.5, yOf(STAFF_LINES[4])); g.lineTo(x + 0.5, yOf(STAFF_LINES[0])); g.stroke();
      }
    }
    // linhas da pauta
    g.strokeStyle = '#4b4536';
    g.lineWidth = 1;
    for (const pos of STAFF_LINES) {
      const y = yOf(pos) + 0.5;
      g.beginPath(); g.moveTo(10, y); g.lineTo(canvas.width - 20, y); g.stroke();
    }
    // clave de sol
    g.fillStyle = '#4b4536';
    g.font = `${STEP * 6}px serif`;
    g.fillText('𝄞', 8, yOf(2) + STEP * 1.2);
    // nomes das notas
    g.font = '11px Segoe UI';
    g.fillStyle = '#a89c7a';
    STAFF.forEach((n, pos) => g.fillText(`${n.name}${n.oct}`, LEFT - 34, yOf(pos) + 4));
    // notas
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const n of s.notes) {
      if (n.c >= s.length) continue;
      const x = LEFT + n.c * COL_W + COL_W / 2;
      const y = yOf(n.p);
      // linhas suplementares
      g.strokeStyle = '#4b4536';
      for (const lp of [0, 12, 14]) if ((lp === 0 && n.p <= 0) || (lp > 10 && n.p >= lp)) { g.beginPath(); g.moveTo(x - 18, yOf(lp) + 0.5); g.lineTo(x + 18, yOf(lp) + 0.5); g.stroke(); }
      g.font = '28px "Segoe UI Emoji"';
      g.fillText(INSTRUMENTS.find((it) => it.id === n.i)?.icon ?? '?', x, y);
      if (n.a) { g.font = 'bold 18px serif'; g.fillStyle = '#4b4536'; g.fillText(n.a > 0 ? '♯' : '♭', x - 20, y); }
    }
    // prévia do carimbo
    if (hover && !eraser && hover.c < s.length) {
      g.globalAlpha = 0.4;
      g.font = '28px "Segoe UI Emoji"';
      g.fillText(INSTRUMENTS.find((it) => it.id === inst).icon, LEFT + hover.c * COL_W + COL_W / 2, yOf(hover.p));
      g.globalAlpha = 1;
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function posAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const c = Math.floor((x - LEFT) / COL_W);
    const p = STAFF.length - 1 - Math.round((y - TOP - STEP) / STEP);
    if (c < 0 || p < 0 || p >= STAFF.length) return null;
    return { c, p };
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousemove', (e) => { hover = posAt(e); draw(); });
  canvas.addEventListener('mouseleave', () => { hover = null; draw(); });
  canvas.addEventListener('mousedown', (e) => {
    const at = posAt(e);
    const s = song();
    if (!at || at.c >= s.length) return;
    const existing = s.notes.findIndex((n) => n.c === at.c && n.p === at.p);
    if (e.button === 2 || eraser) {
      if (existing >= 0) store.change('music', () => { s.notes.splice(existing, 1); }, { id });
      return;
    }
    if (existing >= 0) {
      // clicar numa nota existente troca o instrumento
      store.change('music', () => { Object.assign(s.notes[existing], { i: inst, a: acc }); }, { id });
    } else {
      if (s.notes.filter((n) => n.c === at.c).length >= MAX_NOTES_PER_COLUMN) {
        toast('Máximo de 3 notas por coluna (igual ao Mario Paint).', 'err');
        return;
      }
      store.change('music', () => { s.notes.push({ c: at.c, p: at.p, i: inst, a: acc }); }, { id });
    }
    playNote(inst, noteMidi({ p: at.p, a: acc }));
  });

  function play() {
    stop();
    player = playSong(song(), { loop: true, onColumn: (c) => { playCol = c; draw(); const x = LEFT + c * COL_W; if (x > wrap.scrollLeft + wrap.clientWidth - 80 || x < wrap.scrollLeft) wrap.scrollLeft = x - 60; } });
    drawTop();
  }
  function stop() {
    player?.stop();
    player = null;
    playCol = -1;
    drawTop();
    draw();
  }

  drawTop();
  drawBottom();
  draw();
  return {
    refresh() { if (!song()) return; if (!top.contains(document.activeElement)) drawTop(); drawBottom(); draw(); },
    onHide() { stop(); },
    dispose() { stop(); },
  };
}
