// Compilador SNS -> JavaScript (live view) e SNS -> C (ROM do SNES via PVSnesLib).
// As duas saídas seguem exatamente a mesma semântica de inteiros de 16 bits,
// para que o jogo se comporte igual no editor e no console de verdade.

import { parse, SnsError } from './parser.js';
import { BUILTINS, BUILTIN_CONSTS, arity } from './api.js';

const RESERVED_C = new Set(['int', 'char', 'void', 'short', 'long', 'static', 'return']);

/**
 * @param {object} input
 * @param {{src:string}} input.global  script global (variáveis/funções visíveis em todas as cenas)
 * @param {{name:string, src:string}[]} input.scenes
 * @param {Record<string, number>} input.assetConsts  nomes de assets -> índice (sprites, sons, cenas, animações)
 */
export function compileGame(input) {
  const errors = [];
  const units = [];
  const addErr = (e, file) => {
    if (e instanceof SnsError) errors.push({ file: e.file ?? file, line: e.line, col: e.col, msg: e.message });
    else throw e;
  };

  const parseUnit = (file, src, sceneIndex) => {
    try {
      units.push({ file, ast: parse(src ?? '', file), sceneIndex });
    } catch (e) { addErr(e, file); }
  };
  parseUnit('global', input.global?.src ?? '', -1);
  input.scenes.forEach((s, i) => parseUnit(s.name, s.src, i));
  if (errors.length) return { ok: false, errors };

  const assetConsts = input.assetConsts ?? {};
  const globalUnit = units.find((u) => u.sceneIndex === -1);

  // ---------- resolução de símbolos ----------
  // Símbolo: {kind:'var'|'array'|'const'|'func', scope:'global'|'scene'|'local', cname, jsname, value?, size?, params?}
  const makeTable = (parent) => ({ parent, map: new Map() });
  const lookup = (tbl, name) => {
    for (let t = tbl; t; t = t.parent) if (t.map.has(name)) return t.map.get(name);
    return null;
  };

  const rootTbl = makeTable(null);
  for (const [k, v] of Object.entries(BUILTIN_CONSTS)) rootTbl.map.set(k, { kind: 'const', value: v, builtin: true });
  const assetTbl = makeTable(rootTbl);
  for (const [k, v] of Object.entries(assetConsts)) {
    if (rootTbl.map.has(k)) errors.push({ file: 'projeto', line: 0, col: 0, msg: `O asset "${k}" tem o mesmo nome de uma constante do sistema. Renomeie o asset.` });
    assetTbl.map.set(k, { kind: 'const', value: v, asset: true });
  }

  const unitTables = new Map();
  const declare = (tbl, d, sym, file) => {
    if (BUILTINS[d.name]) {
      errors.push({ file, line: d.line, col: d.col, msg: `"${d.name}" já é uma função do sistema. Escolha outro nome.` });
      return;
    }
    const existing = lookup(tbl, d.name);
    if (existing && (existing.builtin || existing.asset)) {
      errors.push({ file, line: d.line, col: d.col, msg: `"${d.name}" já é ${existing.asset ? 'o nome de um asset do projeto' : 'uma constante do sistema'}.` });
      return;
    }
    if (tbl.map.has(d.name)) {
      errors.push({ file, line: d.line, col: d.col, msg: `"${d.name}" foi declarado duas vezes.` });
      return;
    }
    tbl.map.set(d.name, sym);
  };

  const constFold = (e, tbl, file) => {
    const v = evalConst(e, tbl);
    if (v === null) {
      errors.push({ file, line: e.line, col: e.col, msg: 'Aqui é preciso um valor constante (número ou const), calculado na hora de compilar.' });
      return 0;
    }
    return v;
  };
  const evalConst = (e, tbl) => {
    switch (e.k) {
      case 'num': return e.v;
      case 'name': {
        const s = lookup(tbl, e.name);
        return s && s.kind === 'const' ? s.value : null;
      }
      case 'un': {
        const v = evalConst(e.e, tbl);
        if (v === null) return null;
        if (e.op === '-') return w16(-v);
        if (e.op === '~') return w16(~v);
        return v === 0 ? 1 : 0;
      }
      case 'bin': {
        const a = evalConst(e.l, tbl);
        const b = evalConst(e.r, tbl);
        if (a === null || b === null) return null;
        return binConst(e.op, a, b);
      }
      default: return null;
    }
  };

  // Declara globais de cada unidade (em duas passadas: global primeiro, depois cenas)
  const declareUnit = (u, parentTbl) => {
    const tbl = makeTable(parentTbl);
    unitTables.set(u, tbl);
    const isGlobal = u.sceneIndex === -1;
    const prefix = isGlobal ? 'g_' : `s${u.sceneIndex}_`;
    const fprefix = isGlobal ? 'gf_' : `sf${u.sceneIndex}_`;
    for (const d of u.ast.decls) {
      if (d.k === 'var') declare(tbl, d, { kind: 'var', scope: isGlobal ? 'global' : 'scene', cname: prefix + d.name, jsname: prefix + d.name }, u.file);
      else if (d.k === 'const') declare(tbl, d, { kind: 'const', value: constFold(d.expr, tbl, u.file) }, u.file);
      else if (d.k === 'array') {
        let size = d.size ? constFold(d.size, tbl, u.file) : 0;
        if (d.init) size = Math.max(size, d.init.length);
        if (size <= 0 || size > 4096) errors.push({ file: u.file, line: d.line, col: d.col, msg: 'O tamanho do array deve ficar entre 1 e 4096 (a RAM do SNES é pequena!).' });
        declare(tbl, d, { kind: 'array', size, cname: prefix + d.name, jsname: prefix + d.name, decl: d }, u.file);
      } else if (d.k === 'func') {
        declare(tbl, d, { kind: 'func', params: d.params, cname: fprefix + d.name, jsname: fprefix + d.name, decl: d }, u.file);
      }
    }
    return tbl;
  };
  const globalTbl = declareUnit(globalUnit, assetTbl);
  for (const u of units) if (u !== globalUnit) declareUnit(u, globalTbl);
  if (errors.length) return { ok: false, errors };

  // ---------- geração ----------
  const js = [];
  const c = [];
  js.push('"use strict";');
  js.push('const $w=(x)=>(x<<16)>>16;');
  js.push('const $div=(a,b)=>b===0?0:$w(Math.trunc(a/b));');
  js.push('const $mod=(a,b)=>b===0?0:$w(a%b);');
  js.push('const $shl=(a,b)=>(b<0||b>15)?0:$w(a<<b);');
  js.push('const $shr=(a,b)=>(b<0||b>15)?(a<0?-1:0):(a>>b);');
  js.push('const $b=(x)=>x?1:0;');

  c.push('// Gerado pelo Sneslador a partir dos scripts .sns — não edite à mão.');
  c.push('#include "sneslador.h"');
  c.push('');

  const funcsC = [];
  const protosC = [];
  const scenesMeta = [];

  const emitUnit = (u) => {
    const tbl = unitTables.get(u);
    const isGlobal = u.sceneIndex === -1;
    const storage = isGlobal ? '' : 'static ';
    const inits = []; // {sym, init}
    for (const d of u.ast.decls) {
      if (d.k === 'var') {
        const s = tbl.map.get(d.name);
        js.push(`let ${s.jsname}=0;`);
        c.push(`${storage}s16 ${s.cname};`);
        inits.push({ kind: 'var', sym: s, init: d.init });
      } else if (d.k === 'array') {
        const s = tbl.map.get(d.name);
        js.push(`const ${s.jsname}=new Int16Array(${s.size});`);
        c.push(`${storage}s16 ${s.cname}[${s.size}];`);
        if (d.init) {
          const vals = d.init.map((e) => constFold(e, tbl, u.file));
          c.push(`static const s16 ${s.cname}_ini[${vals.length}] = {${vals.join(',')}};`);
          js.push(`const ${s.jsname}_ini=[${vals.join(',')}];`);
        }
        inits.push({ kind: 'array', sym: s, hasInit: !!d.init, initLen: d.init?.length ?? 0 });
      }
    }
    // funções do usuário
    const fns = u.ast.decls.filter((d) => d.k === 'func');
    for (const f of fns) {
      const s = tbl.map.get(f.name);
      if (!isGlobal && (f.name === 'start' || f.name === 'update') && f.params.length) {
        errors.push({ file: u.file, line: f.line, col: f.col, msg: `A função ${f.name}() da cena não recebe parâmetros.` });
      }
      const gen = genFunction(f, s, tbl, u.file);
      js.push(gen.js);
      funcsC.push(gen.c);
      protosC.push(gen.proto);
    }
    // função de inicialização das variáveis (roda no boot para o global, no início da cena para cenas)
    const initName = isGlobal ? 'boot_init' : `scene${u.sceneIndex}_init`;
    const initJs = [];
    const initC = [];
    const ctx = newCtx(tbl, u.file, null);
    for (const it of inits) {
      if (it.kind === 'var') {
        const v = it.init ? genExpr(it.init, ctx) : { js: '0', c: '0' };
        initJs.push(`${it.sym.jsname}=${v.js};`);
        initC.push(`\t${it.sym.cname} = ${v.c};`);
      } else {
        initJs.push(`${it.sym.jsname}.fill(0);`);
        initC.push(`\tsl_memclr(${it.sym.cname}, sizeof(${it.sym.cname}));`);
        if (it.hasInit) {
          initJs.push(`${it.sym.jsname}.set(${it.sym.jsname}_ini);`);
          initC.push(`\tsl_memcpy(${it.sym.cname}, ${it.sym.cname}_ini, ${it.initLen * 2});`);
        }
      }
    }
    js.push(`function ${initName}(){${initJs.join('')}}`);
    funcsC.push(`void ${initName}(void) {\n${initC.join('\n')}\n}`);
    protosC.push(`void ${initName}(void);`);
    if (!isGlobal) {
      const start = tbl.map.get('start');
      const update = tbl.map.get('update');
      scenesMeta.push({
        index: u.sceneIndex,
        init: initName,
        start: start?.kind === 'func' ? start : null,
        update: update?.kind === 'func' ? update : null,
      });
    }
  };

  // contexto de geração de uma função
  function newCtx(tbl, file, fn) {
    return { tbl, file, fn, loopDepth: 0, tmp: 0, locals: fn ? fn.locals : null };
  }

  function genFunction(f, sym, parentTbl, file) {
    const tbl = makeTable(parentTbl);
    const locals = new Map(); // nome -> cname
    for (const p of f.params) {
      if (tbl.map.has(p)) errors.push({ file, line: f.line, col: f.col, msg: `Parâmetro "${p}" repetido.` });
      const cname = 'v_' + p;
      tbl.map.set(p, { kind: 'var', scope: 'local', cname, jsname: cname });
    }
    // pré-coleta de variáveis locais (escopo de função, como no C89)
    const collect = (stmts) => {
      for (const s of stmts) {
        if (s.k === 'local' || s.k === 'for') {
          if (BUILTINS[s.name]) { errors.push({ file, line: s.line, col: s.col, msg: `"${s.name}" já é uma função do sistema.` }); continue; }
          const outer = lookup(parentTbl, s.name);
          if (outer && (outer.asset || outer.builtin)) { errors.push({ file, line: s.line, col: s.col, msg: `"${s.name}" já é ${outer.asset ? 'nome de asset' : 'constante do sistema'}.` }); continue; }
          if (!tbl.map.has(s.name)) {
            const cname = 'v_' + s.name;
            tbl.map.set(s.name, { kind: 'var', scope: 'local', cname, jsname: cname });
            locals.set(s.name, cname);
          }
        }
        if (s.k === 'if') { s.conds.forEach((cd) => collect(cd.body)); if (s.elseBody) collect(s.elseBody); }
        if (s.k === 'while' || s.k === 'for') collect(s.body);
      }
    };
    collect(f.body);
    const ctx = newCtx(tbl, file, { sym, locals });
    ctx.forTemps = [];
    const bodyJs = [];
    const bodyC = [];
    genBlock(f.body, ctx, bodyJs, bodyC, '\t');
    const params = f.params.map((p) => 'v_' + p);
    const allLocals = [...locals.values(), ...ctx.forTemps];
    const localDeclJs = allLocals.length ? `let ${allLocals.map((n) => n + '=0').join(',')};` : '';
    const jsText = `function ${sym.jsname}(${params.join(',')}){${localDeclJs}${bodyJs.join('')}return 0;}`;
    const cParams = params.length ? params.map((p) => 's16 ' + p).join(', ') : 'void';
    const proto = `s16 ${sym.cname}(${cParams});`;
    const localDeclC = allLocals.length ? `\ts16 ${allLocals.join(', ')};\n` : '';
    const cText = `s16 ${sym.cname}(${cParams}) {\n${localDeclC}${bodyC.join('\n')}\n\treturn 0;\n}`;
    return { js: jsText, c: cText, proto };
  }

  function genBlock(stmts, ctx, outJs, outC, ind) {
    for (const s of stmts) genStmt(s, ctx, outJs, outC, ind);
  }

  function err(node, msg, ctx) {
    errors.push({ file: ctx.file, line: node.line, col: node.col, msg });
  }

  function genStmt(s, ctx, oj, oc, ind) {
    switch (s.k) {
      case 'local': {
        const sym = lookup(ctx.tbl, s.name);
        const v = s.init ? genExpr(s.init, ctx) : { js: '0', c: '0' };
        oj.push(`${sym.jsname}=${v.js};`);
        oc.push(`${ind}${sym.cname} = ${v.c};`);
        break;
      }
      case 'assign': {
        const sym = lookup(ctx.tbl, s.name);
        if (!sym) { err(s, `A variável "${s.name}" não existe. Declare com: var ${s.name} = 0`, ctx); return; }
        if (sym.kind === 'const') { err(s, `"${s.name}" é constante e não pode mudar de valor.`, ctx); return; }
        if (sym.kind === 'func') { err(s, `"${s.name}" é uma função, não uma variável.`, ctx); return; }
        const rhs = genExpr(s.expr, ctx);
        const binop = s.op === '=' ? null : s.op.slice(0, -1);
        if (sym.kind === 'array') {
          if (!s.index) { err(s, `"${s.name}" é um array: use ${s.name}[indice] = valor`, ctx); return; }
          const idx = genExpr(s.index, ctx);
          if (binop) {
            const t = `$t${ctx.tmp++}`;
            const cur = { js: `$api.ai(${sym.jsname},${t},${s.line})`, c: `${sym.cname}[${idx.c}]` };
            const val = binExpr(binop, cur, rhs);
            oj.push(`{const ${t}=${idx.js};$api.as(${sym.jsname},${t},${val.js},${s.line});}`);
            oc.push(`${ind}${sym.cname}[${idx.c}] = ${val.c};`);
          } else {
            oj.push(`$api.as(${sym.jsname},${idx.js},${rhs.js},${s.line});`);
            oc.push(`${ind}${sym.cname}[${idx.c}] = ${rhs.c};`);
          }
        } else {
          if (s.index) { err(s, `"${s.name}" não é um array.`, ctx); return; }
          const val = binop ? binExpr(binop, { js: sym.jsname, c: sym.cname }, rhs) : { js: `$w(${rhs.js})`, c: rhs.c };
          oj.push(`${sym.jsname}=${val.js};`);
          oc.push(`${ind}${sym.cname} = ${val.c};`);
        }
        break;
      }
      case 'callstmt': {
        const v = genCall(s.call, ctx, false);
        oj.push(`${v.js};`);
        oc.push(`${ind}${v.c};`);
        break;
      }
      case 'if': {
        s.conds.forEach((cd, i) => {
          const cond = genExpr(cd.cond, ctx);
          const bj = [];
          const bc = [];
          genBlock(cd.body, ctx, bj, bc, ind + '\t');
          oj.push(`${i ? 'else ' : ''}if((${cond.js})!==0){${bj.join('')}}`);
          oc.push(`${ind}${i ? '} else ' : ''}if (${cond.c}) {`);
          oc.push(...bc);
        });
        if (s.elseBody) {
          const bj = [];
          const bc = [];
          genBlock(s.elseBody, ctx, bj, bc, ind + '\t');
          oj.push(`else{${bj.join('')}}`);
          oc.push(`${ind}} else {`);
          oc.push(...bc);
        }
        oc.push(`${ind}}`);
        break;
      }
      case 'while': {
        const cond = genExpr(s.cond, ctx);
        const bj = [];
        const bc = [];
        ctx.loopDepth++;
        genBlock(s.body, ctx, bj, bc, ind + '\t');
        ctx.loopDepth--;
        oj.push(`while((${cond.js})!==0){$api.loop(${s.line});${bj.join('')}}`);
        oc.push(`${ind}while (${cond.c}) {`);
        oc.push(...bc);
        oc.push(`${ind}}`);
        break;
      }
      case 'for': {
        const sym = lookup(ctx.tbl, s.name);
        const from = genExpr(s.from, ctx);
        const to = genExpr(s.to, ctx);
        let step = 1;
        if (s.step) {
          step = evalConst(s.step, ctx.tbl);
          if (step === null || step === 0) { err(s, 'O step do for precisa ser uma constante diferente de zero.', ctx); step = 1; }
        }
        const endVar = `v__fim${ctx.forTemps.length}`;
        ctx.forTemps.push(endVar);
        const cmp = step > 0 ? '<=' : '>=';
        const bj = [];
        const bc = [];
        ctx.loopDepth++;
        genBlock(s.body, ctx, bj, bc, ind + '\t');
        ctx.loopDepth--;
        oj.push(`for(${sym.jsname}=${from.js},${endVar}=${to.js};${sym.jsname}${cmp}${endVar};${sym.jsname}=$w(${sym.jsname}+(${step}))){$api.loop(${s.line});${bj.join('')}}`);
        oc.push(`${ind}for (${sym.cname} = ${from.c}, ${endVar} = ${to.c}; ${sym.cname} ${cmp} ${endVar}; ${sym.cname} += ${step}) {`);
        oc.push(...bc);
        oc.push(`${ind}}`);
        break;
      }
      case 'break':
      case 'continue':
        if (!ctx.loopDepth) { err(s, `${s.k} só pode ser usado dentro de while ou for.`, ctx); return; }
        oj.push(`${s.k};`);
        oc.push(`${ind}${s.k};`);
        break;
      case 'return': {
        const v = s.expr ? genExpr(s.expr, ctx) : { js: '0', c: '0' };
        oj.push(`return ${v.js};`);
        oc.push(`${ind}return ${v.c};`);
        break;
      }
      default:
        err(s, `Comando desconhecido ${s.k}`, ctx);
    }
  }

  function binExpr(op, a, b) {
    switch (op) {
      case '+': return { js: `$w(${a.js}+${b.js})`, c: `(${a.c} + ${b.c})` };
      case '-': return { js: `$w(${a.js}-${b.js})`, c: `(${a.c} - ${b.c})` };
      case '*': return { js: `$w(Math.imul(${a.js},${b.js}))`, c: `(${a.c} * ${b.c})` };
      case '/': return { js: `$div(${a.js},${b.js})`, c: `sl_div(${a.c}, ${b.c})` };
      case '%': return { js: `$mod(${a.js},${b.js})`, c: `sl_mod(${a.c}, ${b.c})` };
      case '&': return { js: `(${a.js}&${b.js})`, c: `(${a.c} & ${b.c})` };
      case '|': return { js: `(${a.js}|${b.js})`, c: `(${a.c} | ${b.c})` };
      case '^': return { js: `(${a.js}^${b.js})`, c: `(${a.c} ^ ${b.c})` };
      case '<<': return { js: `$shl(${a.js},${b.js})`, c: `sl_shl(${a.c}, ${b.c})` };
      case '>>': return { js: `$shr(${a.js},${b.js})`, c: `sl_shr(${a.c}, ${b.c})` };
      case '==': return { js: `$b(${a.js}===${b.js})`, c: `(${a.c} == ${b.c})` };
      case '!=': return { js: `$b(${a.js}!==${b.js})`, c: `(${a.c} != ${b.c})` };
      case '<': return { js: `$b(${a.js}<${b.js})`, c: `(${a.c} < ${b.c})` };
      case '>': return { js: `$b(${a.js}>${b.js})`, c: `(${a.c} > ${b.c})` };
      case '<=': return { js: `$b(${a.js}<=${b.js})`, c: `(${a.c} <= ${b.c})` };
      case '>=': return { js: `$b(${a.js}>=${b.js})`, c: `(${a.c} >= ${b.c})` };
      case 'and': return { js: `$b((${a.js})!==0&&(${b.js})!==0)`, c: `(${a.c} && ${b.c})` };
      case 'or': return { js: `$b((${a.js})!==0||(${b.js})!==0)`, c: `(${a.c} || ${b.c})` };
      default: throw new Error('op ' + op);
    }
  }

  function genExpr(e, ctx) {
    switch (e.k) {
      case 'num': return { js: String(e.v), c: e.v < 0 ? `(${e.v})` : String(e.v) };
      case 'str': err(e, 'Texto entre aspas só pode ser usado na função text().', ctx); return { js: '0', c: '0' };
      case 'name': {
        const sym = lookup(ctx.tbl, e.name);
        if (!sym) {
          err(e, `"${e.name}" não existe. Faltou declarar com var, ou o nome do asset está diferente?`, ctx);
          return { js: '0', c: '0' };
        }
        if (sym.kind === 'const') return { js: String(sym.value), c: sym.value < 0 ? `(${sym.value})` : String(sym.value) };
        if (sym.kind === 'var') return { js: sym.jsname, c: sym.cname };
        if (sym.kind === 'array') { err(e, `"${e.name}" é um array: use ${e.name}[indice]`, ctx); return { js: '0', c: '0' }; }
        err(e, `"${e.name}" é uma função: chame com ${e.name}()`, ctx);
        return { js: '0', c: '0' };
      }
      case 'index': {
        const sym = lookup(ctx.tbl, e.name);
        if (!sym || sym.kind !== 'array') { err(e, `"${e.name}" não é um array.`, ctx); return { js: '0', c: '0' }; }
        const idx = genExpr(e.index, ctx);
        return { js: `$api.ai(${sym.jsname},${idx.js},${e.line})`, c: `${sym.cname}[${idx.c}]` };
      }
      case 'call': return genCall(e, ctx, true);
      case 'un': {
        const folded = evalConst(e, ctx.tbl);
        if (folded !== null) return genExpr({ k: 'num', v: folded }, ctx);
        const v = genExpr(e.e, ctx);
        if (e.op === '-') return { js: `$w(-${wrapParen(v.js)})`, c: `(-${v.c})` };
        if (e.op === '~') return { js: `(~${wrapParen(v.js)})`, c: `(~${v.c})` };
        return { js: `$b((${v.js})===0)`, c: `(!${v.c})` };
      }
      case 'bin': {
        const folded = evalConst(e, ctx.tbl);
        if (folded !== null) return genExpr({ k: 'num', v: folded }, ctx);
        return binExpr(e.op, genExpr(e.l, ctx), genExpr(e.r, ctx));
      }
      default:
        err(e, 'Expressão inválida', ctx);
        return { js: '0', c: '0' };
    }
  }

  function wrapParen(s) { return `(${s})`; }

  function genCall(call, ctx, needValue) {
    const b = BUILTINS[call.name];
    if (b) {
      const { min, max } = arity(call.name);
      if (call.args.length < min || call.args.length > max) {
        const sig = `${call.name}(${b.args.join(', ')})`;
        err(call, `${sig} recebe ${min === max ? min : `de ${min} a ${max}`} argumento(s), mas recebeu ${call.args.length}.`, ctx);
        return { js: '0', c: '0' };
      }
      if (needValue && !b.ret) err(call, `${call.name}() não devolve valor.`, ctx);
      if (call.name === 'text') {
        const s = call.args[2];
        if (s.k !== 'str') { err(call, 'O terceiro argumento de text() deve ser um texto entre aspas. Para números use num().', ctx); return { js: '0', c: '0' }; }
        const x = genExpr(call.args[0], ctx);
        const y = genExpr(call.args[1], ctx);
        return { js: `$api.text(${x.js},${y.js},${JSON.stringify(s.v)})`, c: `sl_text(${x.c}, ${y.c}, ${cString(s.v)})` };
      }
      const args = call.args.map((a) => genExpr(a, ctx));
      // argumentos opcionais viram 0
      while (args.length < max) args.push({ js: '0', c: '0' });
      return {
        js: `$api.${call.name}(${args.map((a) => a.js).join(',')})`,
        c: `sl_${call.name}(${args.map((a) => a.c).join(', ')})`,
      };
    }
    const sym = lookup(ctx.tbl, call.name);
    if (!sym) { err(call, `A função "${call.name}" não existe.`, ctx); return { js: '0', c: '0' }; }
    if (sym.kind !== 'func') { err(call, `"${call.name}" não é uma função.`, ctx); return { js: '0', c: '0' }; }
    if (call.args.length !== sym.params.length) {
      err(call, `${call.name}() espera ${sym.params.length} argumento(s), mas recebeu ${call.args.length}.`, ctx);
      return { js: '0', c: '0' };
    }
    const args = call.args.map((a) => genExpr(a, ctx));
    return { js: `${sym.jsname}(${args.map((a) => a.js).join(',')})`, c: `${sym.cname}(${args.map((a) => a.c).join(', ')})` };
  }

  emitUnit(globalUnit);
  for (const u of units) if (u !== globalUnit) emitUnit(u);
  if (errors.length) return { ok: false, errors };

  // tabela de cenas
  scenesMeta.sort((a, b) => a.index - b.index);
  js.push(`return {boot:boot_init,scenes:[${scenesMeta.map((s) => `{init:${s.init},start:${s.start ? s.start.jsname : 'null'},update:${s.update ? s.update.jsname : 'null'}}`).join(',')}]};`);

  c.push('');
  c.push(...protosC);
  c.push('');
  c.push(...funcsC);
  c.push('');
  // funções de despacho usadas pelo runtime C
  const sw = (field) => scenesMeta.map((s) => (s[field] ? `\tcase ${s.index}: ${field === 'init' ? s.init + '()' : s[field].cname + '()'}; break;` : '')).filter(Boolean).join('\n');
  c.push(`void sl_game_boot(void) {\n\tboot_init();\n}`);
  c.push(`void sl_scene_init(u16 scene) {\n\tswitch (scene) {\n${sw('init')}\n\t}\n}`);
  c.push(`void sl_scene_start(u16 scene) {\n\tswitch (scene) {\n${sw('start')}\n\t}\n}`);
  c.push(`void sl_scene_update(u16 scene) {\n\tswitch (scene) {\n${sw('update')}\n\t}\n}`);

  void RESERVED_C;
  return { ok: true, errors: [], js: js.join('\n'), c: c.join('\n') + '\n' };
}

function w16(x) { return (x << 16) >> 16; }

function binConst(op, a, b) {
  switch (op) {
    case '+': return w16(a + b);
    case '-': return w16(a - b);
    case '*': return w16(Math.imul(a, b));
    case '/': return b === 0 ? 0 : w16(Math.trunc(a / b));
    case '%': return b === 0 ? 0 : w16(a % b);
    case '&': return a & b;
    case '|': return a | b;
    case '^': return a ^ b;
    case '<<': return b < 0 || b > 15 ? 0 : w16(a << b);
    case '>>': return b < 0 || b > 15 ? (a < 0 ? -1 : 0) : a >> b;
    case '==': return a === b ? 1 : 0;
    case '!=': return a !== b ? 1 : 0;
    case '<': return a < b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
    case 'and': return a !== 0 && b !== 0 ? 1 : 0;
    case 'or': return a !== 0 || b !== 0 ? 1 : 0;
    default: return 0;
  }
}

function cString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Instancia o código JS compilado com um objeto de API (runtime). */
export function instantiate(jsCode, api) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('$api', jsCode);
  return factory(api);
}
