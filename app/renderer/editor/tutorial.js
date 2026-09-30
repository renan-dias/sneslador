// Executor de tutoriais passo a passo (painel à direita do editor).
import { h, clear, toast } from '../shared/ui.js';

export class Tutorial {
  constructor(def, ctx, container) {
    this.def = def;
    this.ctx = ctx;
    this.container = container;
    this.el = h('div.rsec.tutorial');
    const saved = ctx.store.project.tutorial;
    this.i = saved && saved.id === def.id ? Math.min(saved.step, def.steps.length - 1) : 0;
    this.passed = false;
  }

  start() {
    this.container.prepend(this.el);
    this.enter();
  }

  get step() { return this.def.steps[this.i]; }

  helpers() {
    const { store } = this.ctx;
    const p = store.project;
    return {
      p,
      scene: (name) => p.scenes.find((s) => s.name === name),
      sprite: (name) => p.sprites.find((s) => s.name === name),
      tileset: (name) => p.tilesets.find((t) => t.name === name),
      song: (name) => (p.songs ?? []).find((s) => s.name === name),
      sound: (name) => p.sounds.find((s) => s.name === name),
      code: (name) => (name === 'global' ? p.globalScript : p.scenes.find((s) => s.name === name)?.script ?? ''),
      compiles: () => this.ctx.compile().errors.length === 0,
      has: (name, ...fragments) => {
        const src = norm(name === 'global' ? p.globalScript : p.scenes.find((s) => s.name === name)?.script ?? '');
        return fragments.every((f) => src.includes(norm(f)));
      },
    };
  }

  async enter() {
    const s = this.step;
    this.ctx.store.change('project', (p) => { p.tutorial = { id: this.def.id, step: this.i }; }, { undoable: false });
    if (s.open) await this.openTarget(s.open);
    this.passed = !s.check;
    this.evaluate();
    this.render();
    this.highlight();
  }

  async openTarget(o) {
    const hp = this.helpers();
    if (o.kind === 'game') return this.ctx.openTab('game', 'game');
    if (o.kind === 'palettes') return this.ctx.openTab('palettes', 'all');
    if (o.kind === 'code') {
      const sc = o.name === 'global' ? { id: 'global' } : hp.scene(o.name);
      if (sc) return this.ctx.openTab('code', sc.id);
    }
    const map = { scene: hp.scene, sprite: hp.sprite, tileset: hp.tileset, music: hp.song, sound: hp.sound };
    const a = map[o.kind]?.(o.name);
    if (a) return this.ctx.openTab(o.kind, a.id, o.opts ?? {});
    return null;
  }

  evaluate() {
    const s = this.step;
    if (!s.check) { this.passed = true; return; }
    try { this.passed = !!s.check(this.helpers()); } catch { this.passed = false; }
  }

  onProjectChange() {
    const was = this.passed;
    this.evaluate();
    if (this.passed !== was) this.render();
  }

  onUiChange() { this.highlight(); }

  highlight() {
    document.querySelectorAll('.highlight').forEach((e) => e.classList.remove('highlight'));
    const sel = this.step?.highlight;
    if (!sel) return;
    setTimeout(() => {
      document.querySelectorAll(sel).forEach((e) => e.classList.add('highlight'));
    }, 60);
  }

  async doIt() {
    const s = this.step;
    if (!s.apply) return;
    await s.apply(this.helpers(), this.ctx);
    this.ctx.store.change('project', () => {}, { undoable: false });
    this.evaluate();
    this.render();
    if (s.open) await this.openTarget(s.open);
    toast('Feito! Dê uma olhada no que mudou.', 'ok');
  }

  go(d) {
    const j = this.i + d;
    if (j < 0) return;
    if (j >= this.def.steps.length) { this.finish(); return; }
    this.i = j;
    this.enter();
  }

  async finish() {
    const settings = await this.ctx.api.getSettings();
    await this.ctx.api.setSettings({ tutorialsDone: { ...settings.tutorialsDone, [this.def.id]: true } });
    clear(this.el,
      h('div.step-n', 'Tutorial concluído'),
      h('h2', `🏆 ${this.def.title}`),
      h('div.body', h('p', this.def.outro ?? 'Parabéns! Agora é com você: mude as regras, desenhe novos sprites e transforme em um jogo seu.'),
        h('p', 'Aperte ', h('b', '🕹️ Rodar no emulador'), ' para ver a ROM de verdade, ou ', h('b', '🍓 Enviar ao RetroPie'), ' para jogar no Raspberry Pi.')),
      h('div.row', h('div.spacer'), h('button.btn', { onclick: () => this.dispose() }, 'Fechar')));
    document.querySelectorAll('.highlight').forEach((e) => e.classList.remove('highlight'));
  }

  render() {
    const s = this.step;
    const n = this.def.steps.length;
    clear(this.el,
      h('div.row', h('div.step-n.grow', `${this.def.icon} ${this.def.title} · passo ${this.i + 1} de ${n}`),
        h('button.btn.small', { title: 'Fechar tutorial', onclick: () => this.dispose() }, '✕')),
      h('h2', s.title),
      h('div.body', { html: s.body }),
      s.check ? h('div.check', { class: this.passed ? 'ok' : '' }, this.passed ? '✔ Pronto! Pode avançar.' : `⏳ ${s.task ?? 'Faça o passo acima para continuar.'}`) : null,
      h('div.row', { style: { marginTop: '12px' } },
        h('button.btn.small', { disabled: this.i === 0, onclick: () => this.go(-1) }, '◀'),
        s.apply ? h('button.btn.small.y', { title: 'A engine faz este passo por você', onclick: () => this.doIt() }, '🪄 Fazer para mim') : null,
        h('div.spacer'),
        h('button.btn.primary', { disabled: !this.passed, onclick: () => this.go(1) }, this.i === n - 1 ? 'Concluir 🏁' : 'Próximo ▶')),
      h('div.dots', this.def.steps.map((_, k) => h('i', { class: k < this.i ? 'done' : k === this.i ? 'cur' : '' }))));
  }

  dispose() {
    this.el.remove();
    document.querySelectorAll('.highlight').forEach((e) => e.classList.remove('highlight'));
  }
}

/** Normaliza código para comparação: sem comentários, sem espaços, minúsculas. */
export function norm(src) {
  return src.replace(/\/\/.*$/gm, '').replace(/\s+/g, '').toLowerCase();
}
