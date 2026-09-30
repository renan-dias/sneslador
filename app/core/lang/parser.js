// Lexer + parser da linguagem SNS (Sneslador Script).
// Sintaxe inspirada em Lua: blocos terminam com `end`, sem ponto-e-vírgula.
// Todo valor é um inteiro de 16 bits com sinal, igual aos registradores do 65816.

export class SnsError extends Error {
  constructor(msg, line, col, file) {
    super(msg);
    this.line = line;
    this.col = col;
    this.file = file;
  }
}

const KEYWORDS = new Set([
  'var', 'const', 'array', 'func', 'if', 'then', 'elseif', 'else', 'end',
  'while', 'do', 'for', 'to', 'step', 'return', 'break', 'continue',
  'and', 'or', 'not', 'true', 'false',
]);

const OPS = ['<<=', '>>=', '==', '!=', '<=', '>=', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', '&', '|', '^', '~'];

export function tokenize(src, file) {
  const toks = [];
  let i = 0, line = 1, col = 1;
  const err = (m) => { throw new SnsError(m, line, col, file); };
  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= src.length) err('Comentário /* não foi fechado com */');
      adv(2);
      continue;
    }
    const sl = line, sc = col;
    if (/[0-9]/.test(c) || (c === '$' && /[0-9a-fA-F]/.test(src[i + 1] || ''))) {
      let text = '';
      let v;
      if (c === '$' || (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X'))) {
        adv(c === '$' ? 1 : 2);
        while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) { text += src[i]; adv(); }
        v = parseInt(text.replace(/_/g, ''), 16);
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        adv(2);
        while (i < src.length && /[01_]/.test(src[i])) { text += src[i]; adv(); }
        v = parseInt(text.replace(/_/g, ''), 2);
      } else {
        while (i < src.length && /[0-9_]/.test(src[i])) { text += src[i]; adv(); }
        v = parseInt(text.replace(/_/g, ''), 10);
      }
      if (Number.isNaN(v)) throw new SnsError('Número inválido', sl, sc, file);
      if (v > 65535) throw new SnsError(`O número ${v} não cabe em 16 bits (máximo 65535, ou -32768..32767 com sinal)`, sl, sc, file);
      if (v > 32767) v -= 65536; // $FFFF vira -1, como no hardware
      toks.push({ t: 'num', v, line: sl, col: sc });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let text = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { text += src[i]; adv(); }
      toks.push({ t: KEYWORDS.has(text) ? 'kw' : 'id', v: text, line: sl, col: sc });
      continue;
    }
    if (c === '"') {
      adv();
      let text = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') err('Texto sem aspas de fechamento');
        if (src[i] === '\\' && src[i + 1] === '"') { text += '"'; adv(2); continue; }
        text += src[i];
        adv();
      }
      if (i >= src.length) err('Texto sem aspas de fechamento');
      adv();
      for (const ch of text) {
        const code = ch.charCodeAt(0);
        if (code < 32 || code > 126) throw new SnsError(`O caractere "${ch}" não existe na fonte do SNES (use só letras sem acento, números e símbolos básicos)`, sl, sc, file);
      }
      toks.push({ t: 'str', v: text, line: sl, col: sc });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { adv(op.length); toks.push({ t: 'op', v: op, line: sl, col: sc }); continue; }
    err(`Caractere inesperado "${c}"`);
  }
  toks.push({ t: 'eof', v: '', line, col });
  return toks;
}

const BINPREC = [
  ['or'], ['and'],
  ['==', '!=', '<', '>', '<=', '>='],
  ['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
];

export function parse(src, file = 'script') {
  const toks = tokenize(src, file);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const err = (m, tk = peek()) => { throw new SnsError(m, tk.line, tk.col, file); };
  const is = (t, v) => peek().t === t && (v === undefined || peek().v === v);
  const accept = (t, v) => (is(t, v) ? next() : null);
  const describe = (tk) => (tk.t === 'eof' ? 'o fim do arquivo' : `"${tk.v}"`);
  const expect = (t, v, hint) => {
    if (is(t, v)) return next();
    const want = v ?? (t === 'id' ? 'um nome' : t);
    err(`Esperava "${want}" mas encontrei ${describe(peek())}${hint ? ` — ${hint}` : ''}`);
  };
  const ident = (what) => {
    if (peek().t === 'kw') err(`"${peek().v}" é uma palavra reservada e não pode ser usada como ${what}`);
    return expect('id', undefined);
  };

  function program() {
    const decls = [];
    while (!is('eof')) {
      const tk = peek();
      if (is('kw', 'var')) decls.push(...varDecl());
      else if (is('kw', 'const')) decls.push(constDecl());
      else if (is('kw', 'array')) decls.push(arrayDecl());
      else if (is('kw', 'func')) decls.push(funcDecl());
      else err(`No topo do script só pode haver var, const, array ou func (encontrei ${describe(tk)})`);
    }
    return { decls };
  }

  function varDecl() {
    const kw = expect('kw', 'var');
    const out = [];
    do {
      const name = ident('nome de variável');
      let init = null;
      if (accept('op', '=')) init = expr();
      out.push({ k: 'var', name: name.v, init, line: name.line, col: name.col });
    } while (accept('op', ','));
    void kw;
    return out;
  }

  function constDecl() {
    expect('kw', 'const');
    const name = ident('nome de constante');
    expect('op', '=', 'constantes precisam de um valor');
    return { k: 'const', name: name.v, expr: expr(), line: name.line, col: name.col };
  }

  function arrayDecl() {
    expect('kw', 'array');
    const name = ident('nome de array');
    let size = null;
    let init = null;
    if (accept('op', '[')) {
      size = expr();
      expect('op', ']');
    }
    if (accept('op', '=')) {
      expect('op', '{');
      init = [];
      if (!is('op', '}')) {
        do { init.push(expr()); } while (accept('op', ','));
      }
      expect('op', '}');
    }
    if (!size && !init) err('Um array precisa de um tamanho, ex: array tabela[10]', name);
    return { k: 'array', name: name.v, size, init, line: name.line, col: name.col };
  }

  function funcDecl() {
    expect('kw', 'func');
    const name = ident('nome de função');
    expect('op', '(');
    const params = [];
    if (!is('op', ')')) {
      do { params.push(ident('parâmetro').v); } while (accept('op', ','));
    }
    expect('op', ')');
    const body = block(['end']);
    expect('kw', 'end', `a função "${name.v}" precisa terminar com end`);
    return { k: 'func', name: name.v, params, body, line: name.line, col: name.col };
  }

  function block(terminators) {
    const stmts = [];
    while (!terminators.some((t) => is('kw', t))) {
      if (is('eof')) err(`Faltou fechar um bloco com "${terminators[0]}"`);
      stmts.push(...statement());
    }
    return stmts;
  }

  function statement() {
    const tk = peek();
    const at = { line: tk.line, col: tk.col };
    if (is('kw', 'var')) return varDecl().map((d) => ({ ...d, k: 'local' }));
    if (accept('kw', 'if')) {
      const conds = [];
      let cond = expr();
      expect('kw', 'then', 'depois da condição do if vem "then"');
      let body = block(['end', 'elseif', 'else']);
      conds.push({ cond, body });
      let elseBody = null;
      for (;;) {
        if (accept('kw', 'elseif')) {
          cond = expr();
          expect('kw', 'then');
          body = block(['end', 'elseif', 'else']);
          conds.push({ cond, body });
        } else if (accept('kw', 'else')) {
          elseBody = block(['end']);
          expect('kw', 'end');
          break;
        } else {
          expect('kw', 'end', 'o if precisa terminar com end');
          break;
        }
      }
      return [{ k: 'if', conds, elseBody, ...at }];
    }
    if (accept('kw', 'while')) {
      const cond = expr();
      expect('kw', 'do', 'depois da condição do while vem "do"');
      const body = block(['end']);
      expect('kw', 'end');
      return [{ k: 'while', cond, body, ...at }];
    }
    if (accept('kw', 'for')) {
      const v = ident('variável do for');
      expect('op', '=');
      const from = expr();
      expect('kw', 'to', 'use: for i = 0 to 9 do ... end');
      const to = expr();
      let step = null;
      if (accept('kw', 'step')) step = expr();
      expect('kw', 'do');
      const body = block(['end']);
      expect('kw', 'end');
      return [{ k: 'for', name: v.v, from, to, step, body, ...at }];
    }
    if (accept('kw', 'return')) {
      let e = null;
      if (!is('kw', 'end') && !is('kw', 'else') && !is('kw', 'elseif') && startsExpr()) e = expr();
      return [{ k: 'return', expr: e, ...at }];
    }
    if (accept('kw', 'break')) return [{ k: 'break', ...at }];
    if (accept('kw', 'continue')) return [{ k: 'continue', ...at }];
    if (is('id')) {
      const name = next();
      if (is('op', '(')) {
        const call = callRest(name);
        return [{ k: 'callstmt', call, ...at }];
      }
      let index = null;
      if (accept('op', '[')) {
        index = expr();
        expect('op', ']');
      }
      const opTok = peek();
      const assignOps = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '<<=', '>>='];
      if (opTok.t === 'op' && assignOps.includes(opTok.v)) {
        next();
        return [{ k: 'assign', name: name.v, index, op: opTok.v, expr: expr(), ...at }];
      }
      err(`Depois de "${name.v}" esperava "=" (atribuição) ou "(" (chamada de função)`);
    }
    if (tk.t === 'kw' && ['end', 'else', 'elseif'].includes(tk.v)) err(`"${tk.v}" sobrando: não há bloco aberto para fechar`);
    err(`Comando inesperado: ${describe(tk)}`);
  }

  function startsExpr() {
    const tk = peek();
    return tk.t === 'num' || tk.t === 'id' || tk.t === 'str' ||
      (tk.t === 'kw' && ['not', 'true', 'false'].includes(tk.v)) ||
      (tk.t === 'op' && ['(', '-', '~'].includes(tk.v));
  }

  function callRest(name) {
    expect('op', '(');
    const args = [];
    if (!is('op', ')')) {
      do { args.push(expr()); } while (accept('op', ','));
    }
    expect('op', ')', 'faltou fechar os parênteses da chamada');
    return { k: 'call', name: name.v, args, line: name.line, col: name.col };
  }

  function expr() { return binary(0); }

  function binary(level) {
    if (level >= BINPREC.length) return unary();
    let left = binary(level + 1);
    for (;;) {
      const tk = peek();
      const isOp = (tk.t === 'op' || tk.t === 'kw') && BINPREC[level].includes(tk.v);
      if (!isOp) return left;
      next();
      const right = binary(level + 1);
      left = { k: 'bin', op: tk.v, l: left, r: right, line: tk.line, col: tk.col };
    }
  }

  function unary() {
    const tk = peek();
    if (accept('op', '-')) return { k: 'un', op: '-', e: unary(), line: tk.line, col: tk.col };
    if (accept('op', '~')) return { k: 'un', op: '~', e: unary(), line: tk.line, col: tk.col };
    if (accept('kw', 'not')) return { k: 'un', op: 'not', e: unary(), line: tk.line, col: tk.col };
    return primary();
  }

  function primary() {
    const tk = peek();
    if (accept('num')) return { k: 'num', v: tk.v, line: tk.line, col: tk.col };
    if (accept('str')) return { k: 'str', v: tk.v, line: tk.line, col: tk.col };
    if (accept('kw', 'true')) return { k: 'num', v: 1, line: tk.line, col: tk.col };
    if (accept('kw', 'false')) return { k: 'num', v: 0, line: tk.line, col: tk.col };
    if (accept('op', '(')) {
      const e = expr();
      expect('op', ')', 'faltou fechar parênteses');
      return e;
    }
    if (is('id')) {
      const name = next();
      if (is('op', '(')) return callRest(name);
      if (accept('op', '[')) {
        const index = expr();
        expect('op', ']');
        return { k: 'index', name: name.v, index, line: name.line, col: name.col };
      }
      return { k: 'name', name: name.v, line: name.line, col: name.col };
    }
    if (tk.t === 'kw') err(`"${tk.v}" é palavra reservada e não pode aparecer aqui`);
    err(`Esperava um valor mas encontrei ${describe(tk)}`);
  }

  return program();
}
