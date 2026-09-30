// Compila um projeto inteiro: dados de hardware + scripts. Usado pelo live view e pelo exportador.
import { buildGameData, BuildError } from './gamedata.js';
import { compileGame } from './lang/compiler.js';
import { assetConstants } from './project.js';

export function compileProject(project) {
  let data = null;
  let problems = [];
  try {
    data = buildGameData(project);
  } catch (e) {
    if (e instanceof BuildError) problems = e.problems;
    else throw e;
  }
  const compiled = compileGame({
    global: { src: project.globalScript },
    scenes: project.scenes.map((s) => ({ name: s.name, src: s.script })),
    assetConsts: assetConstants(project),
  });
  return { data, compiled, problems, errors: compiled.errors, ok: !problems.length && compiled.ok };
}
