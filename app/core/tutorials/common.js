// Ajudantes para escrever tutoriais.
import { sfx } from '../templates/art.js';

/** Passo que escreve código numa cena. `must` = trechos que precisam existir no script. */
export function codeStep({ title, body, scene, code, must, task }) {
  return {
    title,
    body,
    task: task ?? 'Digite o código mostrado (ou use "Fazer para mim").',
    open: { kind: 'code', name: scene },
    check: (hp) => hp.has(scene, ...must) && hp.compiles(),
    apply: (hp) => {
      const sc = scene === 'global' ? null : hp.scene(scene);
      if (sc) sc.script = code;
      else hp.p.globalScript = code;
    },
  };
}

/** Passo que cria um efeito sonoro a partir de um modelo do gerador. */
export function soundStep({ title, body, name, preset, tweak }) {
  return {
    title,
    body,
    task: `Crie um som chamado "${name}".`,
    highlight: '[data-add="Sons"]',
    check: (hp) => !!hp.sound(name),
    apply: async (hp, ctx) => {
      if (hp.sound(name)) return;
      const s = sfx(name, preset, tweak);
      await ctx.api.writeAsset(ctx.dir, s.file, s.data);
      ctx.store.change('sound', (p) => { p.sounds.push(s.asset); });
    },
  };
}

export function info(title, body, extra = {}) {
  return { title, body, ...extra };
}

/** Caixa amarela "No SNES de verdade..." */
export const snes = (html) => `<div class="snes">🎮 <b>No SNES de verdade:</b> ${html}</div>`;
export const pre = (code) => `<pre>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
