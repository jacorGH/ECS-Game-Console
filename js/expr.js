/* Data Console — a tiny, sandboxed expression language.
   Carts write formulas like "=self.hp < 3 and chance(0.5)". They are parsed here into a tree and
   evaluated against a whitelist of values and functions. Nothing is ever passed to eval / Function,
   and expressions can only read what the engine hands them — never the page, storage or network. */
(function () {
  const DC = window.DC;
  const MAX_LEN = 600;
  const MAX_STEPS = 20000;

  /* ---------- tokenizer ---------- */
  function tokenize(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
        let j = i;
        while (j < n && /[0-9.]/.test(src[j])) j++;
        if (src[j] === 'e' || src[j] === 'E') { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < n && src[j] !== c) { if (src[j] === '\\' && j + 1 < n) { s += src[j + 1]; j += 2; continue; } s += src[j++]; }
        if (j >= n) throw new Error('Unclosed text in expression');
        out.push({ t: 'str', v: s });
        i = j + 1; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        const w = src.slice(i, j);
        if (w === 'and') out.push({ t: 'op', v: '&&' });
        else if (w === 'or') out.push({ t: 'op', v: '||' });
        else if (w === 'not') out.push({ t: 'op', v: '!' });
        else out.push({ t: 'id', v: w });
        i = j; continue;
      }
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%^<>!?:(),.[]='.includes(c)) { out.push({ t: 'op', v: c === '=' ? '==' : c }); i++; continue; }
      throw new Error(`Unexpected "${c}" in expression`);
    }
    out.push({ t: 'end' });
    return out;
  }

  /* ---------- Pratt parser ---------- */
  const BIN = { '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 8 };
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const expect = (v) => { const t = next(); if (t.t !== 'op' || t.v !== v) throw new Error(`Expected "${v}" in expression`); };
    function expr(minBp) {
      let left = prefix();
      for (;;) {
        const t = peek();
        if (t.t !== 'op') break;
        if (t.v === '?' && minBp <= 1) {
          next(); const a = expr(0); expect(':'); const b = expr(1);
          left = { k: 'if', c: left, a, b }; continue;
        }
        if (t.v === '.') { next(); const id = next(); if (id.t !== 'id') throw new Error('Expected a name after "."'); left = { k: 'get', o: left, p: { k: 'str', v: id.v } }; continue; }
        if (t.v === '[') { next(); const i = expr(0); expect(']'); left = { k: 'get', o: left, p: i }; continue; }
        if (t.v === '(') {
          if (left.k !== 'id') throw new Error('Only built-in functions can be called');
          next(); const args = [];
          if (!(peek().t === 'op' && peek().v === ')')) { do { args.push(expr(0)); } while (peek().t === 'op' && peek().v === ',' && next()); }
          expect(')');
          left = { k: 'call', f: left.v, args }; continue;
        }
        const bp = BIN[t.v];
        if (!bp || bp < minBp) break;
        next();
        const right = expr(t.v === '^' ? bp : bp + 1);
        left = { k: 'bin', op: t.v, a: left, b: right };
      }
      return left;
    }
    function prefix() {
      const t = next();
      if (t.t === 'num' || t.t === 'str') return { k: t.t, v: t.v };
      if (t.t === 'id') {
        if (t.v === 'true') return { k: 'num', v: true };
        if (t.v === 'false') return { k: 'num', v: false };
        if (t.v === 'null') return { k: 'num', v: null };
        return { k: 'id', v: t.v };
      }
      if (t.t === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e; }
      if (t.t === 'op' && (t.v === '-' || t.v === '!' || t.v === '+')) return { k: 'un', op: t.v, a: expr(8) };
      if (t.t === 'end') throw new Error('Expression ended too early');
      throw new Error(`Unexpected "${t.v}" in expression`);
    }
    const tree = expr(0);
    if (peek().t !== 'end') throw new Error(`Unexpected "${peek().v}" in expression`);
    return tree;
  }

  /* ---------- evaluator ---------- */
  const isEnt = (o) => o && typeof o === 'object' && o.__ent === true;
  const plain = (o) => o !== null && typeof o === 'object' && (Array.isArray(o) || Object.getPrototypeOf(o) === Object.prototype);
  const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

  function run(node, env, budget) {
    if (--budget.n < 0) throw new Error('Expression too complex');
    switch (node.k) {
      case 'num': case 'str': return node.v;
      case 'id': return safe(env.name(node.v));
      case 'get': {
        const o = run(node.o, env, budget), key = run(node.p, env, budget);
        if (o == null) return 0;
        const k = String(key);
        if (BLOCKED.has(k)) return 0;
        if (isEnt(o)) return safe(env.prop(o.e, k));
        if (k === 'length' && (Array.isArray(o) || typeof o === 'string')) return o.length;
        if (typeof o === 'string') return o[+key] ?? '';
        if (plain(o) && Object.prototype.hasOwnProperty.call(o, k)) return o[k];
        return 0;
      }
      case 'call': {
        const fn = FUNCS[node.f];
        if (!fn) throw new Error(`Unknown function "${node.f}"`);
        return fn(env, ...node.args.map((a) => run(a, env, budget)));
      }
      case 'un': {
        const v = run(node.a, env, budget);
        return node.op === '-' ? -num(v) : node.op === '+' ? num(v) : !truthy(v);
      }
      case 'if': return truthy(run(node.c, env, budget)) ? run(node.a, env, budget) : run(node.b, env, budget);
      case 'bin': {
        if (node.op === '&&') { const a = run(node.a, env, budget); return truthy(a) ? run(node.b, env, budget) : a; }
        if (node.op === '||') { const a = run(node.a, env, budget); return truthy(a) ? a : run(node.b, env, budget); }
        const a = run(node.a, env, budget), b = run(node.b, env, budget);
        switch (node.op) {
          case '+': return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) === 0 ? 0 : num(a) / num(b);
          case '%': { const m = num(b); return m === 0 ? 0 : ((num(a) % m) + m) % m; }
          case '^': return Math.pow(num(a), num(b));
          case '==': return eq(a, b);
          case '!=': return !eq(a, b);
          case '<': return num(a) < num(b);
          case '<=': return num(a) <= num(b);
          case '>': return num(a) > num(b);
          case '>=': return num(a) >= num(b);
        }
      }
    }
    throw new Error('Bad expression');
  }
  const safe = (v) => (typeof v === 'function' || v === undefined ? 0 : v);
  const num = (v) => (isEnt(v) ? 1 : typeof v === 'boolean' ? +v : +v || 0);
  const str = (v) => (isEnt(v) ? v.e.prefab || 'entity' : v == null ? '' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
  const truthy = (v) => (isEnt(v) ? !v.e.dead : Array.isArray(v) ? v.length > 0 : !!v);
  const eq = (a, b) => (isEnt(a) || isEnt(b) ? isEnt(a) && isEnt(b) && a.e === b.e : typeof a === 'string' || typeof b === 'string' ? str(a) === str(b) : num(a) === num(b));

  const FUNCS = {
    min: (_, ...a) => Math.min(...a.map(num)),
    max: (_, ...a) => Math.max(...a.map(num)),
    abs: (_, a) => Math.abs(num(a)),
    floor: (_, a) => Math.floor(num(a)),
    ceil: (_, a) => Math.ceil(num(a)),
    round: (_, a) => Math.round(num(a)),
    sqrt: (_, a) => Math.sqrt(Math.max(0, num(a))),
    sin: (_, a) => Math.sin(num(a)),
    cos: (_, a) => Math.cos(num(a)),
    atan2: (_, y, x) => Math.atan2(num(y), num(x)),
    sign: (_, a) => Math.sign(num(a)),
    clamp: (_, v, lo, hi) => Math.max(num(lo), Math.min(num(hi), num(v))),
    lerp: (_, a, b, t) => num(a) + (num(b) - num(a)) * num(t),
    rand: (_, a, b) => (a == null ? Math.random() : b == null ? Math.random() * num(a) : num(a) + Math.random() * (num(b) - num(a))),
    randint: (_, a, b) => { const lo = Math.ceil(num(a)), hi = Math.floor(num(b)); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
    chance: (_, p) => Math.random() < num(p),
    pick: (_, ...a) => (a.length === 1 && Array.isArray(a[0]) ? a[0][Math.floor(Math.random() * a[0].length)] : a[Math.floor(Math.random() * a.length)]),
    len: (_, a) => (Array.isArray(a) || typeof a === 'string' ? a.length : plain(a) ? Object.keys(a).length : 0),
    has: (env, a, b) => (isEnt(a) ? a.e.tags.has(String(b)) : Array.isArray(a) ? a.some((x) => eq(x, b)) : plain(a) ? Object.prototype.hasOwnProperty.call(a, String(b)) : typeof a === 'string' && a.includes(str(b))),
    str: (_, a) => str(a),
    num: (_, a) => num(a),
    int: (_, a) => Math.trunc(num(a)),
    pad: (_, a, n, ch) => str(a).padStart(num(n), ch == null ? '0' : str(ch)),
    count: (env, tag) => env.engine.count(String(tag)),
    nearest: (env, tag, range) => env.wrap(env.engine.nearest(env.self || { x: 0, y: 0, sw: 0, sh: 0 }, String(tag), range == null ? Infinity : num(range))),
    first: (env, tag) => env.wrap(env.engine.first(String(tag))),
    dist: (env, a, b) => { const A = env.point(a), B = env.point(b); return A && B ? Math.hypot(A.x - B.x, A.y - B.y) : 9999; },
    angle: (env, a, b) => { const A = env.point(a), B = env.point(b); return A && B ? Math.atan2(B.y - A.y, B.x - A.x) : 0; },
    btn: (env, b, pl) => !!(DC.Input.players[pl == null ? env.playerIdx() : num(pl)] || {}).down?.[String(b)],
    btnp: (env, b, pl) => !!(DC.Input.players[pl == null ? env.playerIdx() : num(pl)] || {}).pressed?.[String(b)],
    tile: (env, tx, ty) => { const e = env.engine, r = e.map[Math.floor(num(ty))]; return (r && r[Math.floor(num(tx))]) || '.'; },
    hasSave: (env) => env.engine.hasSave(),
  };

  const cache = new Map();
  function compile(src) {
    src = String(src).trim();
    if (src[0] === '=') src = src.slice(1);
    let c = cache.get(src);
    if (c) return c;
    if (src.length > MAX_LEN) throw new Error('Expression is too long');
    c = parse(src);
    if (cache.size > 2000) cache.clear();
    cache.set(src, c);
    return c;
  }
  function evaluate(src, env) {
    return run(compile(src), env, { n: MAX_STEPS });
  }
  function check(src) {
    try {
      const tree = compile(src);
      const bad = [];
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.k === 'call' && !FUNCS[n.f]) bad.push(n.f);
        for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(walk) : walk(v);
      };
      walk(tree);
      return bad.length ? `unknown function "${bad[0]}" (available: ${Object.keys(FUNCS).join(', ')})` : null;
    } catch (e) { return e.message; }
  }

  DC.Expr = { compile, evaluate, check, truthy, str, num, FUNCS: Object.keys(FUNCS) };
})();
