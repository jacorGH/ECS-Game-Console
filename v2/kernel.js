/* Data Console v2 — kernel.
   Small, deterministic, data-only. Everything a cart can do is registered by an extension;
   the kernel itself only knows: worlds, scenes (a stack), entities, rules, expressions,
   a schema registry, validation, and save/restore. No DOM, no canvas, no audio in here. */
(function (root) {
  'use strict';
  const DC2 = (root.DC2 = root.DC2 || {});
  DC2.ext = DC2.ext || {};
  const DT = 1 / 60;
  const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'start', 'select'];
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  Object.assign(DC2, { DT, BUTTONS, B36 });

  const X = () => {
    const x = root.DC && root.DC.Expr;
    if (!x) throw new Error('DC2 needs the expression engine (js/expr.js) loaded first');
    return x;
  };

  /* ------------------------------------------------------------------ utils */
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  class TagList extends Array { has(t) { return this.includes(t); } }
  const tagList = (a) => { const t = new TagList(); for (const x of a || []) if (!t.includes(x)) t.push(x); return t; };
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function suggest(name, options) {
    let best = null, bd = 3;
    for (const o of options) { const d = lev(String(name).toLowerCase(), String(o).toLowerCase()); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  DC2.hash = (o) => {
    const s = JSON.stringify(o); let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };

  /* Tile layers are stored as one string per row, two base-36 characters per tile (0 = empty). */
  DC2.decodeRows = (rows, w) => {
    const out = [];
    for (const r of rows) for (let i = 0; i < w; i++) out.push(parseInt(r.substr(i * 2, 2), 36));
    return out;
  };
  DC2.encodeRows = (ids, w, h) => {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) { const v = ids[y * w + x] | 0; s += B36[Math.floor(v / 36)] + B36[v % 36]; }
      rows.push(s);
    }
    return rows;
  };
  /* which frame of a sprite to show for an entity's sprite component */
  /* Tiles. A tile can have its own sprite ("sprite" in its tileset entry, animated with that sprite's "idle"), or be
     frame n-1 of the tileset's sheet sprite (the older layout). Tile numbers are what map rows store. */
  DC2.tileIds = (cart, tsId) => {
    const t = (cart.tilesets || {})[tsId]; if (!t) return [];
    const ids = new Set(), sheet = t.sprite && (cart.sprites || {})[t.sprite];
    if (sheet) for (let i = 1; i <= sheet.frames.length; i++) ids.add(i);
    for (const [n, d] of Object.entries(t.tiles || {})) if (d && d.sprite && (cart.sprites || {})[d.sprite]) ids.add(+n);
    return [...ids].sort((a, b) => a - b);
  };
  /* which of a tile's picture's animations it plays: the one named in its settings, else "idle", else the first one */
  DC2.tileAnimName = (cart, tsId, n) => {
    const d = (((cart.tilesets || {})[tsId] || {}).tiles || {})[n], def = d && d.sprite && (cart.sprites || {})[d.sprite], an = def && def.anims;
    if (!an) return null;
    return d.anim && an[d.anim] ? d.anim : an.idle ? 'idle' : Object.keys(an)[0] || null;
  };
  /* -> { sprite, frame } for drawing tile n at time t (seconds) */
  DC2.tileArt = (cart, tsId, n, time) => {
    const t = (cart.tilesets || {})[tsId]; if (!t) return null;
    const d = (t.tiles || {})[n];
    if (d && d.sprite && cart.sprites[d.sprite]) { const def = cart.sprites[d.sprite], an = DC2.tileAnimName(cart, tsId, n); return { sprite: d.sprite, frame: an ? DC2.spriteFrame(def, { anim: an, t: time || 0 }) : 0 }; }
    if (t.sprite && cart.sprites[t.sprite] && n >= 1 && n <= cart.sprites[t.sprite].frames.length) return { sprite: t.sprite, frame: n - 1 };
    return null;
  };
  DC2.spriteFrame = (def, c) => {
    const an = def && def.anims && def.anims[c.anim];
    if (!an) return 0;
    const n = an.f.length, fps = an.fps || 8;
    const i = an.loop === false ? Math.min(n - 1, Math.floor(c.t * fps)) : Math.floor(c.t * fps) % n;
    return an.f[i];
  };

  /* --------------------------------------------------------- schema language */
  /* 'number' 'int' 'bool' 'string' 'text' (has {expr}) 'expr' 'path' 'any' 'ref:<kind>' 'list:<type>'
     or {type, default, optional, required, min, max, values, fields, of, doc, check} */
  function spec(s) {
    s = typeof s === 'string' ? { type: s } : Object.assign({}, s);
    if (typeof s.type === 'string') {
      if (s.type.startsWith('ref:')) { s.to = s.type.slice(4); s.type = 'ref'; }
      else if (s.type.startsWith('list:')) { s.of = s.type.slice(5); s.type = 'list'; }
    }
    return s;
  }
  function typeLabel(sp) {
    sp = spec(sp);
    if (sp.type === 'ref') return `${sp.to} name`;
    if (sp.type === 'enum') return sp.values.join('|');
    if (sp.type === 'list') return `list of ${typeLabel(sp.of || 'any')}`;
    return sp.type;
  }
  const REFS = { prefab: 'prefabs', scene: 'scenes', sprite: 'sprites', map: 'maps', tileset: 'tilesets', palette: 'palettes', sound: 'sounds' };

  function unknownName(kind, name, available, other) {
    const s = suggest(name, available);
    let m = `unknown ${kind} "${name}"`;
    if (other && hasOwn(other, name)) m += ` — it comes from the "${other[name]}" extension; add it to meta.extensions`;
    else if (s) m += ` — did you mean "${s}"?`;
    return m;
  }

  /* ---------------------------------------------------------------- registry */
  class Registry {
    constructor() {
      this.components = {}; this.actions = {}; this.triggers = {}; this.systems = [];
      this.modes = {}; this.hooks = {}; this.extNames = []; this._ext = null;
    }
    component(name, def) {
      const fields = {}, defaults = {};
      for (const k in def.fields || {}) {
        const sp = spec(def.fields[k]); fields[k] = sp;
        if (sp.default !== undefined) defaults[k] = sp.default;
        else if (!sp.optional && !sp.required) throw new Error(`component ${name}.${k} needs a default, or optional/required`);
      }
      this.components[name] = Object.assign({ name, ext: this._ext, needs: [] }, def, { fields, defaults });
    }
    action(name, def) {
      const _specs = {};
      for (const k in def.params || {}) _specs[k] = spec(def.params[k]);
      this.actions[name] = Object.assign({ name, ext: this._ext }, def, { _specs });
    }
    trigger(name, def) {
      const _specs = {};
      for (const k in def.params || {}) _specs[k] = spec(def.params[k]);
      this.triggers[name] = Object.assign({ name, ext: this._ext }, def, { _specs });
    }
    system(name, def) {
      this.systems.push(Object.assign({ name, ext: this._ext, order: 50 }, def));
      this.systems.sort((a, b) => a.order - b.order);
    }
    mode(name, def) { this.modes[name] = Object.assign({ name, ext: this._ext }, def); }
    hook(name, fn) { (this.hooks[name] = this.hooks[name] || []).push(fn); }
    use(name) {
      if (this.extNames.includes(name)) return this;
      const ext = DC2.ext[name];
      if (!ext) throw new Error(`unknown extension "${name}"`);
      (ext.requires || []).forEach((r) => this.use(r));
      this._ext = name; ext.install(this); this._ext = null;
      this.extNames.push(name);
      return this;
    }
  }
  DC2.Registry = Registry;
  DC2.defineExtension = (ext) => { DC2.ext[ext.name] = ext; DC2._index = null; };
  /* which extension each name belongs to, across ALL known extensions (for helpful errors) */
  Object.defineProperty(DC2, 'index', {
    get() {
      if (!DC2._index) {
        const idx = { components: {}, actions: {}, triggers: {} };
        for (const name in DC2.ext) {
          const probe = new Registry(); probe._ext = name; DC2.ext[name].install(probe);
          for (const k in probe.components) idx.components[k] = name;
          for (const k in probe.actions) idx.actions[k] = name;
          for (const k in probe.triggers) idx.triggers[k] = name;
        }
        DC2._index = idx;
      }
      return DC2._index;
    },
  });
  DC2.registryFor = (cart) => {
    const errors = [], reg = new Registry();
    reg.use('core');
    for (const n of (cart && cart.meta && cart.meta.extensions) || []) {
      if (!DC2.ext[n]) errors.push({ path: 'meta.extensions', msg: `unknown extension "${n}" (available: ${Object.keys(DC2.ext).join(', ')})` });
      else reg.use(n);
    }
    return { reg, errors };
  };

  /* -------------------------------------------------------------- validation */
  const BUILTIN_IDS = ['self', 'other', 'player', 'time', 'frame', 'scene', 'args'];
  const ENTITY_BUILTINS = ['id', 'name', 'facing', 'alive', 'grounded', 'ontile'];

  function chain(node) {
    const names = [];
    while (node && node.k === 'get' && node.p && node.p.k === 'str') { names.unshift(node.p.v); node = node.o; }
    return { root: node, names };
  }
  function walkExpr(node, path, cx) {
    if (!node || typeof node !== 'object') return;
    switch (node.k) {
      case 'id': checkId(node.v, null, path, cx); break;
      case 'get': {
        if (node.p && node.p.k === 'str') {
          const c = chain(node);
          if (c.root && c.root.k === 'id') { checkId(c.root.v, c.names, path, cx); return; }
        }
        walkExpr(node.o, path, cx); walkExpr(node.p, path, cx); break;
      }
      case 'call': (node.args || []).forEach((a) => walkExpr(a, path, cx)); break;
      case 'un': walkExpr(node.a, path, cx); break;
      case 'bin': walkExpr(node.a, path, cx); walkExpr(node.b, path, cx); break;
      case 'if': walkExpr(node.c, path, cx); walkExpr(node.a, path, cx); walkExpr(node.b, path, cx); break;
      default: break;
    }
  }
  function checkSelfChain(names, path, cx) {
    const sc = cx.scope;
    const first = names[0];
    if (ENTITY_BUILTINS.includes(first)) return;
    if (sc.comps.has(first)) {
      const def = cx.reg.components[first];
      if (names[1] && def && !hasOwn(def.fields, names[1]))
        cx.E(path, `component "${first}" has no field "${names[1]}"${suggest(names[1], Object.keys(def.fields)) ? ` — did you mean "${suggest(names[1], Object.keys(def.fields))}"?` : ''}`);
      return;
    }
    if (sc.vars.has(first)) return;
    const pool = [...sc.comps, ...sc.vars];
    cx.E(path, `this prefab has no component or var "${first}"${suggest(first, pool) ? ` — did you mean "${suggest(first, pool)}"?` : ` (has: ${pool.join(', ') || 'nothing'})`}`);
  }
  function checkDeclared(val, names, prefix, path, cx) {
    let cur = val;
    for (const n of names) {
      if (!isObj(cur)) return;
      if (!hasOwn(cur, n)) { cx.E(path, `"${prefix}" has no "${n}"${suggest(n, Object.keys(cur)) ? ` — did you mean "${suggest(n, Object.keys(cur))}"?` : ''}`); return; }
      cur = cur[n]; prefix += '.' + n;
    }
  }
  function checkId(name, names, path, cx) {
    if (name === 'self') {
      if (!cx.scope || cx.scope.kind !== 'entity') return cx.E(path, '"self" only exists inside prefab rules');
      if (names && names.length) checkSelfChain(names, path, cx);
      return;
    }
    if (BUILTIN_IDS.includes(name)) return;
    const decl = cx.cart.vars || {};
    if (!hasOwn(decl, name)) {
      const s = suggest(name, [...Object.keys(decl), ...BUILTIN_IDS]);
      return cx.E(path, `unknown variable "${name}"${s ? ` — did you mean "${s}"?` : ' (declare it in "vars")'}`);
    }
    if (names && names.length) checkDeclared(decl[name], names, name, path, cx);
  }
  function checkExpr(src, path, cx) {
    if (typeof src === 'number' || typeof src === 'boolean') return;
    if (typeof src !== 'string') return cx.E(path, 'must be an expression (a string, number or true/false)');
    const x = X();
    if (src.trim()[0] === '=') return cx.E(path, 'v2 expressions do not start with "=" — write the expression directly');
    const msg = x.check(src);
    if (msg) return cx.E(path, msg);
    let tree;
    try { tree = x.compile(src); } catch (e) { return cx.E(path, e.message); }
    walkExpr(tree, path, cx);
  }
  function checkPath(v, path, cx) {
    if (typeof v !== 'string' || !v) return cx.E(path, 'must be a variable path like "coins" or "self.health.hp"');
    const parts = v.split('.');
    if (parts[0] === 'self') {
      if (!cx.scope || cx.scope.kind !== 'entity') return cx.E(path, '"self" only exists inside prefab rules');
      if (parts.length < 2) return cx.E(path, '"self" needs a field, e.g. "self.health.hp"');
      return checkSelfChain(parts.slice(1), path, cx);
    }
    if (parts[0] === 'other') return;
    checkId(parts[0], parts.slice(1), path, cx);
  }

  function checkValue(sp, v, path, cx) {
    sp = spec(sp);
    if (v === undefined || v === null) {
      if (sp.optional || sp.default !== undefined || sp.type === 'any' || cx.partial) return;
      return cx.E(path, `missing required value (${typeLabel(sp)})`);
    }
    switch (sp.type) {
      case 'number':
        if (typeof v !== 'number' || !isFinite(v)) return cx.E(path, `must be a number, got ${JSON.stringify(v)}`);
        if (sp.min != null && v < sp.min) cx.E(path, `must be at least ${sp.min}`);
        if (sp.max != null && v > sp.max) cx.E(path, `must be at most ${sp.max}`);
        return;
      case 'int':
        if (!Number.isInteger(v)) return cx.E(path, `must be a whole number, got ${JSON.stringify(v)}`);
        if (sp.min != null && v < sp.min) cx.E(path, `must be at least ${sp.min}`);
        if (sp.max != null && v > sp.max) cx.E(path, `must be at most ${sp.max}`);
        return;
      case 'bool': if (typeof v !== 'boolean') cx.E(path, `must be true or false, got ${JSON.stringify(v)}`); return;
      case 'string': if (typeof v !== 'string') cx.E(path, `must be text, got ${JSON.stringify(v)}`); return;
      case 'enum': if (!sp.values.includes(v)) cx.E(path, `must be one of ${sp.values.join(', ')}${typeof v === 'string' && suggest(v, sp.values) ? ` — did you mean "${suggest(v, sp.values)}"?` : ''}`); return;
      case 'expr': return checkExpr(v, path, cx);
      case 'text':
        if (typeof v !== 'string') return cx.E(path, `must be text, got ${JSON.stringify(v)}`);
        v.replace(/\{([^{}]+)\}/g, (m, inner) => { checkExpr(inner, path, cx); return m; });
        return;
      case 'path': return checkPath(v, path, cx);
      case 'ref': {
        if (typeof v !== 'string') return cx.E(path, `must be a ${sp.to} name`);
        const coll = cx.cart[REFS[sp.to]];
        if (!isObj(coll) || !hasOwn(coll, v)) cx.E(path, `unknown ${sp.to} "${v}"${suggest(v, Object.keys(coll || {})) ? ` — did you mean "${suggest(v, Object.keys(coll || {}))}"?` : ''}`);
        return;
      }
      case 'list':
        if (!Array.isArray(v)) return cx.E(path, 'must be a list');
        v.forEach((x, i) => checkValue(sp.of || 'any', x, `${path}[${i}]`, cx));
        return;
      case 'object': {
        if (!isObj(v)) return cx.E(path, 'must be an object { ... }');
        const fields = sp.fields || {};
        for (const k of Object.keys(v)) {
          if (k === 'doc') continue;
          if (!hasOwn(fields, k)) cx.soft(`${path}.${k}`, `ignored: unknown field "${k}"${suggest(k, Object.keys(fields)) ? ` — did you mean "${suggest(k, Object.keys(fields))}"?` : ` (allowed: ${Object.keys(fields).join(', ')})`}`);
        }
        for (const k in fields) checkValue(fields[k], v[k], `${path}.${k}`, cx);
        return;
      }
      case 'actions': return checkActions(v, path, cx);
      case 'custom': return sp.check(v, path, cx);
      case 'any': return;
      default: cx.E(path, `internal: unknown schema type "${sp.type}"`);
    }
  }
  function checkActions(list, path, cx) {
    if (!Array.isArray(list)) return cx.E(path, 'must be a list of actions');
    list.forEach((a, i) => checkAction(a, `${path}[${i}]`, cx));
  }
  function checkAction(a, path, cx) {
    if (!isObj(a)) return cx.E(path, 'an action is an object like {"act":"add","path":"coins"}');
    if (typeof a.act !== 'string') return cx.E(path, 'missing "act" (the action name)');
    const def = cx.reg.actions[a.act];
    if (!def) return cx.E(`${path}.act`, unknownName('action', a.act, Object.keys(cx.reg.actions), DC2.index.actions));
    cx.used.add(def.ext);
    const allowed = Object.keys(def._specs);
    for (const k of Object.keys(a)) {
      if (k === 'act' || k === 'doc' || hasOwn(def._specs, k)) continue;
      cx.soft(`${path}.${k}`, `ignored: "${a.act}" has no parameter "${k}"${suggest(k, allowed) ? ` — did you mean "${suggest(k, allowed)}"?` : ` (parameters: ${allowed.join(', ') || 'none'})`}`);
    }
    for (const k in def._specs) checkValue(def._specs[k], a[k], `${path}.${k}`, cx);
    if (def.check) def.check(a, path, cx);
  }
  function checkRule(r, path, cx, owner) {
    if (!isObj(r)) return cx.E(path, 'a rule is an object like {"on":"touch","then":[...]}');
    if (typeof r.on !== 'string') return cx.E(path, 'missing "on" (the trigger name)');
    const t = cx.reg.triggers[r.on];
    if (!t) return cx.E(`${path}.on`, unknownName('trigger', r.on, Object.keys(cx.reg.triggers), DC2.index.triggers));
    cx.used.add(t.ext);
    if (t.owners && !t.owners.includes(owner)) cx.E(`${path}.on`, `trigger "${r.on}" only works in ${t.owners.join(' or ')} rules (this is a ${owner} rule)`);
    const allowed = ['on', 'if', 'then', 'else', 'doc', ...Object.keys(t._specs)];
    for (const k of Object.keys(r)) if (!allowed.includes(k)) cx.soft(`${path}.${k}`, `ignored: "${r.on}" rules have no "${k}"${suggest(k, allowed) ? ` — did you mean "${suggest(k, allowed)}"?` : ''}`);
    for (const k in t._specs) checkValue(t._specs[k], r[k], `${path}.${k}`, cx);
    if (r.if !== undefined) checkExpr(r.if, `${path}.if`, cx);
    else if (t.requiresIf) cx.E(path, `"${r.on}" rules need an "if" condition`);
    if (r.then === undefined) cx.E(path, 'rule has no "then" actions');
    else checkActions(r.then, `${path}.then`, cx);
    if (r.else !== undefined) checkActions(r.else, `${path}.else`, cx);
  }
  function checkRules(list, path, cx, owner) {
    if (list === undefined) return;
    if (!Array.isArray(list)) return cx.E(path, 'rules must be a list');
    list.forEach((r, i) => checkRule(r, `${path}[${i}]`, cx, owner));
  }

  DC2._checkValue = checkValue;
  DC2.spec = spec; DC2.typeLabel = typeLabel; DC2.REFS = REFS;
  /* Two severities. ERRORS are things that would break the game (bad references, unknown names, wrong types, missing
     required values). WARNINGS are things the game will simply ignore (an extra or misspelt optional field). With
     opts.strict every warning becomes an error. */
  DC2.validate = function (cart, reg, opts) {
    const errs = [], warns = [], strict = !!(opts && opts.strict);
    const cx = { cart, reg, errs, warns, used: new Set(), scope: null, partial: false,
      E: (path, msg) => errs.push({ path, msg }), W: (path, msg) => warns.push({ path, msg }),
      soft: (path, msg) => (strict ? errs : warns).push({ path, msg }) };
    const finish = () => {
      cx.used.delete('core'); cx.used.delete(null); cx.used.delete(undefined);
      const listed = (cart && cart.meta && cart.meta.extensions) || [];
      for (const u of cx.used) if (!listed.includes(u)) cx.E('meta.extensions', `the cart uses "${u}" features but does not list it`);
      for (const l of listed) if (!cx.used.has(l) && DC2.ext[l] && !(DC2.ext[l].requires || []).length && !listedRequired(l)) cx.W('meta.extensions', `"${l}" is listed but nothing uses it`);
      return { ok: errs.length === 0, errors: errs, warnings: warns, used: [...cx.used] };
    };
    const listedRequired = (l) => (cart.meta.extensions || []).some((o) => DC2.ext[o] && (DC2.ext[o].requires || []).includes(l));
    if (!isObj(cart)) { cx.E('', 'a cart must be one JSON object'); return finish(); }
    if (cart.format !== 'DCART-2') cx.E('format', 'must be "DCART-2"');
    const top = ['format', 'meta', 'vars', 'palettes', 'sprites', 'tilesets', 'sounds', 'music', 'prefabs', 'maps', 'scenes', 'rules', 'db', 'doc'];
    for (const k of Object.keys(cart)) if (!top.includes(k)) cx.soft(k, `ignored: unknown top-level key "${k}"${suggest(k, top) ? ` — did you mean "${suggest(k, top)}"?` : ''}`);
    for (const k of ['sprites', 'tilesets', 'maps', 'prefabs', 'scenes', 'palettes']) if (cart[k] !== undefined && !isObj(cart[k])) { cx.E(k, 'must be an object'); cart = Object.assign({}, cart, { [k]: {} }); cx.cart = cart; }
    cart.vars = cart.vars || {};

    checkValue({ type: 'object', fields: {
      title: 'string', author: { type: 'string', optional: true },
      width: { type: 'int', default: 256, min: 64, max: 640 }, height: { type: 'int', default: 224, min: 64, max: 480 },
      start: 'ref:scene', player: { type: 'ref:prefab', optional: true }, extensions: { type: 'list:string', default: [] },
    } }, cart.meta, 'meta', cx);

    for (const k of Object.keys(cart.vars)) {
      if (BUILTIN_IDS.includes(k) || reg.components[k]) cx.E(`vars.${k}`, `"${k}" is a reserved name`);
    }

    /* palettes */
    for (const [id, p] of Object.entries(cart.palettes || {})) {
      if (!Array.isArray(p) || !p.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) cx.E(`palettes.${id}`, 'must be a list of "#rrggbb" colours');
    }
    /* sprites */
    for (const [id, s] of Object.entries(cart.sprites || {})) {
      const P = `sprites.${id}`;
      if (!isObj(s)) { cx.E(P, 'must be an object'); continue; }
      for (const k of Object.keys(s)) if (!['w', 'h', 'palette', 'frames', 'anims', 'doc'].includes(k)) cx.soft(`${P}.${k}`, `ignored: unknown sprite field "${k}"`);
      if (!Number.isInteger(s.w) || s.w < 1 || !Number.isInteger(s.h) || s.h < 1) { cx.E(P, '"w" and "h" must be whole numbers'); continue; }
      const pal = (cart.palettes || {})[s.palette || 'main'];
      if (!pal) { cx.E(`${P}.palette`, `palette "${s.palette || 'main'}" does not exist`); continue; }
      if (!Array.isArray(s.frames) || !s.frames.length) { cx.E(`${P}.frames`, 'needs a list of frames (one string per frame, rows joined with "/")'); continue; }
      const okChars = '.' + B36.slice(0, Math.min(36, pal.length));
      s.frames.forEach((f, i) => {
        if (typeof f !== 'string') return cx.E(`${P}.frames[${i}]`, 'a frame is one string, rows joined with "/"');
        const rows = f.split('/');
        if (rows.length !== s.h) return cx.E(`${P}.frames[${i}]`, `has ${rows.length} rows, needs ${s.h}`);
        rows.forEach((r, y) => {
          if (r.length !== s.w) cx.E(`${P}.frames[${i}]`, `row ${y + 1} is ${r.length} wide, needs ${s.w}`);
          for (const ch of r) if (!okChars.includes(ch)) { cx.E(`${P}.frames[${i}]`, `row ${y + 1} uses "${ch}" which is not a colour in palette "${s.palette || 'main'}"`); break; }
        });
      });
      for (const [an, a] of Object.entries(s.anims || {})) {
        if (!isObj(a) || !Array.isArray(a.f) || !a.f.length || !a.f.every((n) => Number.isInteger(n) && n >= 0 && n < s.frames.length)) cx.E(`${P}.anims.${an}`, `needs "f": a list of frame numbers 0..${s.frames.length - 1}`);
        else if (a.fps !== undefined && !(a.fps > 0)) cx.E(`${P}.anims.${an}.fps`, 'must be above 0');
      }
    }
    /* tilesets */
    for (const [id, t] of Object.entries(cart.tilesets || {})) {
      const P = `tilesets.${id}`;
      if (!isObj(t)) { cx.E(P, 'must be an object'); continue; }
      if (!Number.isInteger(t.tileSize) || t.tileSize < 4) cx.E(`${P}.tileSize`, 'must be a whole number, 4 or more');
      /* "sprite" (optional): an older-style sheet whose frames are tiles 1, 2, 3…; each tile may instead name its own sprite */
      const sp = t.sprite !== undefined ? (cart.sprites || {})[t.sprite] : null;
      if (t.sprite !== undefined && !sp) cx.E(`${P}.sprite`, `unknown sprite "${t.sprite}"`);
      if (sp && (sp.w !== t.tileSize || sp.h !== t.tileSize)) cx.E(`${P}.sprite`, `sprite is ${sp.w}x${sp.h} but tileSize is ${t.tileSize}`);
      const nSheet = sp ? sp.frames.length : 0;
      for (const [n, d] of Object.entries(t.tiles || {})) {
        const k = Number(n), TP = `${P}.tiles.${n}`;
        if (!isObj(d)) { cx.E(TP, 'must be an object like {"solid":true}'); continue; }
        for (const f of Object.keys(d)) if (!['solid', 'oneway', 'name', 'sprite', 'tags', 'anim', 'doc'].includes(f)) cx.soft(`${TP}.${f}`, `ignored: unknown tile field "${f}"`);
        if (!Number.isInteger(k) || k < 1 || k > 1295) { cx.E(TP, 'tile numbers are whole numbers from 1'); continue; }
        if (d.sprite !== undefined) {
          const ds = (cart.sprites || {})[d.sprite];
          if (!ds) cx.E(`${TP}.sprite`, `unknown sprite "${d.sprite}"${suggest(d.sprite, Object.keys(cart.sprites || {})) ? ` — did you mean "${suggest(d.sprite, Object.keys(cart.sprites))}"?` : ''}`);
          else if (ds.w !== t.tileSize || ds.h !== t.tileSize) cx.E(`${TP}.sprite`, `sprite "${d.sprite}" is ${ds.w}x${ds.h} but tiles are ${t.tileSize}x${t.tileSize}`);
        } else if (k > nSheet) cx.E(TP, sp ? `tile ${k} has no picture (the sheet has ${nSheet} frames) — give it a "sprite"` : 'needs a "sprite"');
        if (d.anim !== undefined) {
          const ds = d.sprite && (cart.sprites || {})[d.sprite];
          if (typeof d.anim !== 'string') cx.E(`${TP}.anim`, 'must be the name of one of the picture\'s animations');
          else if (ds && !(ds.anims && ds.anims[d.anim])) cx.E(`${TP}.anim`, `"${d.sprite}" has no animation "${d.anim}"${suggest(d.anim, Object.keys(ds.anims || {})) ? ` — did you mean "${suggest(d.anim, Object.keys(ds.anims))}"?` : ''}`);
        }
        if (d.tags !== undefined && (!Array.isArray(d.tags) || d.tags.some((x) => typeof x !== 'string' || !x))) cx.E(`${TP}.tags`, 'must be a list of words, like ["water"]');
      }
    }
    /* sounds */
    for (const [id, s] of Object.entries(cart.sounds || {})) if (!isObj(s)) cx.E(`sounds.${id}`, 'must be an object');

    /* prefabs */
    for (const [name, p] of Object.entries(cart.prefabs || {})) {
      const P = `prefabs.${name}`;
      if (!isObj(p)) { cx.E(P, 'must be an object'); continue; }
      for (const k of Object.keys(p)) if (!['tags', 'c', 'v', 'rules', 'carry', 'doc'].includes(k)) cx.soft(`${P}.${k}`, `ignored: unknown prefab field "${k}"${suggest(k, ['tags', 'c', 'v', 'rules', 'carry']) ? ` — did you mean "${suggest(k, ['tags', 'c', 'v', 'rules', 'carry'])}"?` : ' (a prefab has tags, c, v, rules, carry)'}`);
      checkValue({ type: 'list:string', optional: true }, p.tags, `${P}.tags`, cx);
      checkValue({ type: 'list:string', optional: true }, p.carry, `${P}.carry`, cx);
      for (const cn of Array.isArray(p.carry) ? p.carry : []) if (!reg.components[cn]) cx.E(`${P}.carry`, unknownName('component', cn, Object.keys(reg.components), DC2.index.components));
      const comps = new Set(Object.keys(p.c || {}));
      if (p.c !== undefined && !isObj(p.c)) cx.E(`${P}.c`, 'must be an object of components');
      else for (const [cn, cv] of Object.entries(p.c || {})) {
        const def = reg.components[cn];
        if (!def) { cx.E(`${P}.c.${cn}`, unknownName('component', cn, Object.keys(reg.components), DC2.index.components)); continue; }
        cx.used.add(def.ext);
        checkValue({ type: 'object', fields: def.fields }, cv, `${P}.c.${cn}`, cx);
        for (const n of def.needs) if (!comps.has(n)) cx.E(`${P}.c.${cn}`, `"${cn}" needs the "${n}" component`);
      }
      const vars = new Set(Object.keys(p.v || {}));
      for (const k of vars) if (reg.components[k] || ENTITY_BUILTINS.includes(k)) cx.E(`${P}.v.${k}`, `"${k}" is a reserved name`);
      cx.scope = { kind: 'entity', comps, vars };
      checkRules(p.rules, `${P}.rules`, cx, 'entity');
      cx.scope = null;
    }
    /* maps */
    for (const [id, m] of Object.entries(cart.maps || {})) {
      const P = `maps.${id}`;
      if (!isObj(m)) { cx.E(P, 'must be an object'); continue; }
      for (const k of Object.keys(m)) if (!['w', 'h', 'tileset', 'layers', 'objects', 'doc'].includes(k)) cx.soft(`${P}.${k}`, `ignored: unknown map field "${k}"`);
      if (!Number.isInteger(m.w) || !Number.isInteger(m.h) || m.w < 1 || m.h < 1) { cx.E(P, '"w" and "h" must be whole numbers'); continue; }
      const ts = (cart.tilesets || {})[m.tileset];
      if (!ts) { cx.E(`${P}.tileset`, `unknown tileset "${m.tileset}"`); continue; }
      const valid = new Set(DC2.tileIds(cart, m.tileset));
      const names = new Set();
      (Array.isArray(m.layers) ? m.layers : []).forEach((L, li) => {
        const LP = `${P}.layers[${li}]`;
        if (!isObj(L) || !Array.isArray(L.rows)) return cx.E(LP, 'a layer needs "name" and "rows"');
        if (L.rows.length !== m.h) return cx.E(LP, `has ${L.rows.length} rows, map is ${m.h} high`);
        L.rows.forEach((r, y) => {
          if (typeof r !== 'string' || r.length !== m.w * 2 || !/^[0-9a-z]+$/.test(r)) return cx.E(LP, `row ${y + 1} must be ${m.w * 2} characters (two per tile, 0-9a-z)`);
          for (let x = 0; x < m.w; x++) { const id = parseInt(r.substr(x * 2, 2), 36); if (id && !valid.has(id)) { cx.E(LP, `row ${y + 1}, column ${x + 1}: tile ${id} does not exist in tileset "${m.tileset}"`); break; } }
        });
      });
      if (!Array.isArray(m.layers) || !m.layers.length) cx.E(`${P}.layers`, 'needs at least one layer');
      (m.objects || []).forEach((o, oi) => {
        const OP = `${P}.objects[${oi}]`;
        if (!isObj(o)) return cx.E(OP, 'must be an object');
        for (const k of Object.keys(o)) if (!['prefab', 'name', 'x', 'y', 'c', 'v', 'tags', 'doc'].includes(k)) cx.soft(`${OP}.${k}`, `ignored: unknown object field "${k}"`);
        if (typeof o.x !== 'number' || typeof o.y !== 'number') cx.E(OP, '"x" and "y" (pixels) are required');
        else if (o.x < 0 || o.y < 0 || o.x > m.w * ts.tileSize || o.y > m.h * ts.tileSize) cx.W(OP, 'is outside the map');
        if (o.name !== undefined) { if (names.has(o.name)) cx.E(OP, `name "${o.name}" is used twice in this map`); names.add(o.name); }
        if (o.prefab !== undefined) {
          const pf = (cart.prefabs || {})[o.prefab];
          if (!pf) cx.E(`${OP}.prefab`, `unknown prefab "${o.prefab}"${suggest(o.prefab, Object.keys(cart.prefabs || {})) ? ` — did you mean "${suggest(o.prefab, Object.keys(cart.prefabs))}"?` : ''}`);
          else if (o.c !== undefined) {
            if (!isObj(o.c)) cx.E(`${OP}.c`, 'must be an object');
            else for (const [cn, cv] of Object.entries(o.c)) {
              const def = reg.components[cn];
              if (!def) { cx.E(`${OP}.c.${cn}`, unknownName('component', cn, Object.keys(reg.components), DC2.index.components)); continue; }
              cx.partial = true; checkValue({ type: 'object', fields: def.fields }, cv, `${OP}.c.${cn}`, cx); cx.partial = false;
            }
          }
        } else if (o.name === undefined) cx.E(OP, 'an object needs a "prefab" or a "name" (a marker)');
      });
    }
    /* scenes */
    for (const [name, s] of Object.entries(cart.scenes || {})) {
      const P = `scenes.${name}`;
      if (!isObj(s)) { cx.E(P, 'must be an object'); continue; }
      for (const k of Object.keys(s)) if (!['map', 'music', 'camera', 'persist', 'rules', 'hud', 'bg', 'doc'].includes(k)) cx.soft(`${P}.${k}`, `ignored: unknown scene field "${k}"`);
      checkValue({ type: 'ref:map', optional: true }, s.map, `${P}.map`, cx);
      checkRules(s.rules, `${P}.rules`, cx, 'scene');
      (s.hud || []).forEach((h, i) => checkValue({ type: 'object', fields: {
        text: 'text', x: { type: 'number', default: 0 }, y: { type: 'number', default: 0 }, color: { type: 'int', default: 21 },
        align: { type: 'enum', values: ['left', 'center', 'right'], default: 'left' }, if: { type: 'expr', optional: true },
      } }, h, `${P}.hud[${i}]`, cx));
    }
    checkRules(cart.rules, 'rules', cx, 'world');
    if (cart.meta && cart.meta.start && cart.scenes && cart.scenes[cart.meta.start] && !cart.scenes[cart.meta.start].map && cart.meta.player) cx.W('meta.player', 'the start scene has no map, so no player can spawn there');
    return finish();
  };
  DC2.formatReport = (r) => [...r.errors.map((e) => `✗ ${e.path}: ${e.msg}`), ...r.warnings.map((e) => `! ${e.path}: ${e.msg}`)].join('\n');

  /* ------------------------------------------------------------------ world */
  const WRAP = new WeakMap();
  class World {
    constructor(cart, reg, opts) {
      opts = opts || {};
      this.cart = cart; this.reg = reg; this.onError = opts.onError || null;
      this.frame = 0; this.time = 0;
      this.rng = ((opts.seed != null ? opts.seed : 12345) >>> 0);
      this.vars = clone(cart.vars || {});
      this.nextId = 1; this.stack = []; this.parked = {}; this.timers = []; this.rs = {};
      this.prevDown = []; this.input = { players: [] };
      this.fx = []; this.errors = []; this._errKeys = new Set(); this.pending = [];
      this._depth = 0; this._ruleIdx = {};
    }
    /* ---- basics */
    rand() { this.rng = (this.rng + 0x6D2B79F5) >>> 0; let t = this.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    error(where, err) {
      const msg = `${where}: ${err && err.message ? err.message : err}`;
      if (this._errKeys.has(msg)) return;
      this._errKeys.add(msg); this.errors.push(msg);
      if (this.onError) this.onError(msg);
    }
    active() { for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].kind === 'scene') return this.stack[i]; return null; }
    top() { return this.stack[this.stack.length - 1] || null; }
    byId(id) { for (const s of this.stack) if (s.ents) for (const e of s.ents) if (e.id === id && !e.dead) return e; return null; }
    player() { const s = this.active(); return s ? s.ents.find((e) => !e.dead && e.tags.has('player')) || null : null; }
    count(tag) { const s = this.active(); return s ? s.ents.filter((e) => !e.dead && e.tags.has(tag)).length : 0; }
    first(tag) { const s = this.active(); return s ? s.ents.find((e) => !e.dead && e.tags.has(tag)) || null : null; }
    nearest(e, tag, range) {
      const s = this.active(); if (!s) return null;
      const o = e && e.c && e.c.pos ? e.c.pos : { x: 0, y: 0 };
      let best = null, bd = range == null ? Infinity : range;
      for (const t of s.ents) {
        if (t.dead || t === e || !t.tags.has(tag) || !t.c.pos) continue;
        const d = Math.hypot(t.c.pos.x - o.x, t.c.pos.y - o.y);
        if (d <= bd) { bd = d; best = t; }
      }
      return best;
    }
    targets(spec_, ctx) {
      if (spec_ === 'self') return ctx.self ? [ctx.self] : [];
      if (spec_ === 'other') return ctx.other ? [ctx.other] : [];
      const s = this.active(); return s ? s.ents.filter((e) => !e.dead && e.tags.has(spec_)) : [];
    }
    hasRule(prefab, trig) {
      let s = this._ruleIdx[prefab];
      if (!s) { s = this._ruleIdx[prefab] = new Set(); const p = this.cart.prefabs[prefab]; for (const r of (p && p.rules) || []) s.add(r.on); }
      return s.has(trig);
    }
    queue(op) { this.pending.push(op); }
    sfx(type, data) { this.fx.push(Object.assign({ type }, data)); }

    /* ---- expressions */
    _env(ctx) {
      const w = this;
      const wrap = (e) => { if (!e) return null; let o = WRAP.get(e); if (!o) { o = { __ent: true, e }; WRAP.set(e, o); } return o; };
      return {
        engine: { count: (t) => w.count(t), nearest: (e, t, r) => w.nearest(e && e.c ? e : ctx.self, t, r), first: (t) => w.first(t), map: [], hasSave: () => false },
        self: ctx.self || null, wrap,
        playerIdx: () => (ctx.self && ctx.self.c.topdown ? ctx.self.c.topdown.player | 0 : 0),
        point: (v) => {
          if (v && v.__ent) return v.e.c.pos ? { x: v.e.c.pos.x, y: v.e.c.pos.y } : null;
          return v && typeof v === 'object' && 'x' in v ? v : null;
        },
        name(n) {
          switch (n) {
            case 'self': return wrap(ctx.self); case 'other': return wrap(ctx.other); case 'player': return wrap(w.player());
            case 'time': return w.time; case 'frame': return w.frame; case 'scene': { const s = w.active(); return s ? s.name : ''; }
            case 'args': return ctx.args || {};
            default: if (hasOwn(w.vars, n)) return w.vars[n]; throw new Error(`unknown name "${n}"`);
          }
        },
        prop(e, k) {
          if (hasOwn(e.v, k)) return e.v[k];
          if (hasOwn(e.c, k)) return e.c[k];
          if (k === 'id') return e.id; if (k === 'name') return e.prefab; if (k === 'alive') return !e.dead;
          if (k === 'facing') return e.r.face || { x: 0, y: 1 };
          if (k === 'grounded') return !!e.r.ground;
          if (k === 'ontile') { const o = {}; if (DC2.tileTagsAt && e.c.pos) for (const t of DC2.tileTagsAt(w, w.active(), e.c.pos.x, e.c.pos.y)) o[t] = true; return o; }   // self.ontile.water
          throw new Error(`"${k}" is not a var or component of ${e.prefab}`);
        },
      };
    }
    evalExpr(src, ctx) {
      if (typeof src !== 'string') return src;
      const saved = Math.random; Math.random = () => this.rand();
      try { return X().evaluate(src, this._env(ctx || {})); }
      catch (err) { this.error(`expression "${src.slice(0, 60)}"`, err); return 0; }
      finally { Math.random = saved; }
    }
    test(src, ctx) { return typeof src === 'boolean' ? src : X().truthy(this.evalExpr(src, ctx)); }
    fmt(text, ctx) { return String(text == null ? '' : text).replace(/\{([^{}]+)\}/g, (m, inner) => X().str(this.evalExpr(inner, ctx))); }

    /* ---- variable paths: "coins", "flags.x", "self.health.hp", "self.stage", "other.pos.x" */
    _pathTarget(path, ctx) {
      const parts = path.split('.');
      if (parts[0] === 'self' || parts[0] === 'other' || parts[0] === 'player') {
        const e = parts[0] === 'player' ? this.player() : ctx[parts[0]];
        if (!e) throw new Error(`"${parts[0]}" is not available here`);
        const name = parts[1];
        const holder = hasOwn(e.v, name) ? e.v : hasOwn(e.c, name) ? e.c : null;
        if (!holder) throw new Error(`"${name}" is not a var or component of ${e.prefab}`);
        return { obj: holder, keys: parts.slice(1) };
      }
      if (!hasOwn(this.vars, parts[0])) throw new Error(`undeclared variable "${parts[0]}"`);
      return { obj: this.vars, keys: parts };
    }
    getPath(path, ctx) { const t = this._pathTarget(path, ctx); let o = t.obj; for (const k of t.keys) { if (o == null) return undefined; o = o[k]; } return o; }
    setPath(path, value, ctx) {
      const t = this._pathTarget(path, ctx); let o = t.obj;
      for (let i = 0; i < t.keys.length - 1; i++) { o = o[t.keys[i]]; if (o == null || typeof o !== 'object') throw new Error(`"${path}" does not exist`); }
      const last = t.keys[t.keys.length - 1];
      if (!hasOwn(o, last)) throw new Error(`"${path}" does not exist`);
      o[last] = value;
    }

    /* ---- actions and rules */
    run(list, ctx) {
      if (!list) return;
      if (this._depth > 24) { this.error('actions', new Error('actions are nested too deeply (a loop?)')); return; }
      this._depth++;
      try {
        for (const a of list) {
          const def = this.reg.actions[a.act];
          if (!def) { this.error('action', new Error(`unknown action "${a.act}"`)); continue; }
          try {
            const p = {};
            for (const k in def._specs) {
              const sp = def._specs[k]; let v = a[k];
              if (v === undefined) v = sp.default;
              if (sp.type === 'expr') v = this.evalExpr(v, ctx); else if (sp.type === 'text') v = this.fmt(v, ctx);
              p[k] = v;
            }
            def.run(this, ctx, p, a);
          } catch (err) { this.error(`action ${a.act}`, err); }
        }
      } finally { this._depth--; }
    }
    _runRule(r, ctx) {
      const t = this.reg.triggers[r.on];
      let ok = true;
      if (r.if !== undefined && !(t && t.edgeIf)) ok = this.test(r.if, ctx);
      const list = ok ? r.then : r.else;
      if (list) this.run(list, ctx);
    }
    _containers(scene) {
      const cs = [{ rules: this.cart.rules || [], st: this.rs, self: null }];
      const sd = this.cart.scenes[scene.name];
      if (sd && sd.rules) cs.push({ rules: sd.rules, st: scene.rs, self: null });
      for (const e of scene.ents) {
        if (e.dead) continue;
        const p = this.cart.prefabs[e.prefab];
        if (p && p.rules && p.rules.length) cs.push({ rules: p.rules, st: (e.r.rs = e.r.rs || {}), self: e });
      }
      return cs;
    }
    _poll(scene, dt) {
      for (const c of this._containers(scene)) {
        for (let i = 0; i < c.rules.length; i++) {
          const r = c.rules[i], t = this.reg.triggers[r.on];
          if (!t || !t.poll) continue;
          const st = c.st[i] || (c.st[i] = {});
          const ctx = { self: c.self, other: null, args: {}, scene };
          let fire = false;
          try { fire = t.poll(this, r, st, ctx, dt); } catch (err) { this.error(`rule ${r.on}`, err); continue; }
          if (fire) this._runRule(r, ctx);
        }
      }
    }
    /* Fire a world/scene-level trigger (no entity of its own) — built-in "start", and any extension's own
       triggers with owners: ['world','scene'] (a clock's "newday", say). Not for entity events; use fireOn for those. */
    broadcast(scene, name, extra) {
      const cs = this._containers(scene).filter((c) => !c.self);
      for (const c of cs) for (const r of c.rules) if (r.on === name) this._runRule(r, Object.assign({ self: null, other: null, args: {}, scene }, extra));
    }
    /* run one entity's own rules for a pushed trigger (touch, hit, die ...) */
    fireOn(e, name, extra) {
      const p = this.cart.prefabs[e.prefab]; if (!p || !p.rules) return;
      const t = this.reg.triggers[name];
      for (const r of p.rules) {
        if (r.on !== name) continue;
        const ctx = Object.assign({ self: e, other: null, args: {}, scene: this.active() }, extra);
        if (t && t.match && !t.match(r, ctx, this)) continue;
        this._runRule(r, ctx);
      }
    }
    fireEvent(name, args) {
      const scene = this.active(); if (!scene) return;
      for (const c of this._containers(scene)) for (const r of c.rules) {
        if (r.on !== 'event' || r.name !== name) continue;
        this._runRule(r, { self: c.self, other: null, args: args || {}, scene });
      }
    }
    _timers(dt) {
      const due = [];
      this.timers = this.timers.filter((t) => { t.t -= dt; if (t.t <= 0) { due.push(t); return false; } return true; });
      for (const t of due) {
        const self = t.self ? this.byId(t.self) : null, other = t.other ? this.byId(t.other) : null;
        if (t.self && !self) continue;
        this.run(t.then, { self, other, args: t.args || {}, scene: this.active() });
      }
    }

    /* ---- entities and scenes */
    /* an entity with no prefab (effects and other short-lived extras): tags + components, defaults filled in */
    spawnRaw(tags, comps, scene) {
      scene = scene || this.active();
      const e = { id: this.nextId++, prefab: '@raw', tags: tagList(tags || []), c: {}, v: {}, r: {}, dead: false };
      for (const [cn, data] of Object.entries(comps || {})) e.c[cn] = Object.assign(clone(this.reg.components[cn] ? this.reg.components[cn].defaults : {}), clone(data));
      scene.ents.push(e); return e;
    }
    spawn(name, over, scene) {
      scene = scene || this.active();
      const pf = this.cart.prefabs[name];
      if (!pf) throw new Error(`unknown prefab "${name}"`);
      over = over || {};
      const e = { id: this.nextId++, prefab: name, tags: tagList([...(pf.tags || []), name, ...(over.tags || [])]), c: {}, v: clone(pf.v || {}), r: {}, dead: false };
      const build = (cn, data) => Object.assign(clone(this.reg.components[cn] ? this.reg.components[cn].defaults : {}), clone(data));
      for (const cn of Object.keys(pf.c || {})) e.c[cn] = build(cn, pf.c[cn]);
      for (const cn of Object.keys(over.c || {})) e.c[cn] = Object.assign(e.c[cn] || build(cn, {}), clone(over.c[cn]));
      Object.assign(e.v, clone(over.v || {}));
      if (over.x != null && e.c.pos) { e.c.pos.x = over.x; e.c.pos.y = over.y; }
      scene.ents.push(e);
      return e;
    }
    destroy(e) { e.dead = true; }
    _build(name) {
      const sd = this.cart.scenes[name], md = sd.map ? this.cart.maps[sd.map] : null;
      const inst = { kind: 'scene', name, started: false, ents: [], rs: {}, contacts: {}, markers: {}, map: null };
      if (md) {
        const ts = this.cart.tilesets[md.tileset];
        inst.map = { w: md.w, h: md.h, ts: ts.tileSize, tileset: md.tileset, layers: md.layers.map((L) => ({ name: L.name, collide: !!L.collide, ids: DC2.decodeRows(L.rows, md.w) })) };
      }
      return inst;
    }
    /* a map object whose prefab is tagged "player" is the scene's spawn point. If a player is being carried in from
       another scene it is not spawned; the carried player is placed there instead. */
    _populate(inst, carrying) {
      const sd = this.cart.scenes[inst.name], md = sd.map ? this.cart.maps[sd.map] : null;
      for (const o of (md && md.objects) || []) {
        if (o.name) inst.markers[o.name] = { x: o.x, y: o.y };
        if (!o.prefab) continue;
        const isPlayer = (this.cart.prefabs[o.prefab].tags || []).includes('player');
        if (isPlayer && !inst.spawn) { inst.spawn = { prefab: o.prefab, x: o.x, y: o.y }; inst.markers['@player'] = { x: o.x, y: o.y }; }
        if (isPlayer && carrying) continue;
        this.spawn(o.prefab, { x: o.x, y: o.y, c: o.c, v: o.v, tags: o.tags }, inst);
      }
    }
    _enter(name, at, mode) {
      const sd = this.cart.scenes[name];
      if (!sd) throw new Error(`unknown scene "${name}"`);
      const old = this.active();
      const carried = [];
      if (mode === 'replace' && old) for (const e of old.ents) if (!e.dead && e.tags.has('player')) carried.push(e);
      let inst, fresh = false;
      if (this.parked[name]) { inst = this.parked[name]; delete this.parked[name]; } else { inst = this._build(name); fresh = true; }
      if (fresh) this._populate(inst, carried.length > 0);
      if (mode === 'replace' && old) {
        old.ents = old.ents.filter((e) => !carried.includes(e));
        if (this.cart.scenes[old.name].persist) this.parked[old.name] = old;
      }
      for (const e of carried) {
        const m = (at && inst.markers[at]) || inst.markers['@player'] || (inst.map ? { x: inst.map.w * inst.map.ts / 2, y: inst.map.h * inst.map.ts / 2 } : { x: 0, y: 0 });
        const target = inst.spawn && inst.spawn.prefab;
        if (target && target !== e.prefab) {
          /* this scene uses a different player prefab (topdown hero -> side-view hero): build it, and copy over only
             the components it lists in "carry" (e.g. health), plus same-named vars */
          const n = this.spawn(target, { x: m.x, y: m.y }, inst);
          for (const cn of this.cart.prefabs[target].carry || []) if (e.c[cn] && n.c[cn]) n.c[cn] = clone(e.c[cn]);
          for (const k of Object.keys(n.v)) if (hasOwn(e.v, k)) n.v[k] = clone(e.v[k]);
        } else {
          if (e.c.pos) { e.c.pos.x = m.x; e.c.pos.y = m.y; }
          e.r.kb = null; inst.ents.push(e);
        }
      }
      inst.started = false;
      const ai = this.stack.indexOf(old);
      if (mode === 'replace' && ai >= 0) this.stack.splice(ai, this.stack.length - ai, inst); else this.stack.push(inst);
      for (const h of this.reg.hooks.sceneEnter || []) h(this, inst);
      if (mode === 'replace' && this.cart.meta.player && (this.cart.scenes[name] || {}).map && old && old.ents.some((e) => e.tags.has('player')) && !inst.ents.some((e) => e.tags.has('player')))   /* arrived from a level with a player, but this map has no spot for one (title screens and cutscenes are fine) */ this.error(`scene ${name}`, new Error(`has no player (meta.player is "${this.cart.meta.player}") — add a ${this.cart.meta.player} object to its map`));
    }
    _apply(op) {
      switch (op.type) {
        case 'goto': this._enter(op.scene, op.at, 'replace'); break;
        case 'push': this._enter(op.scene, op.at, 'push'); break;
        case 'pop': while (this.top() && this.top().kind === 'mode') this.stack.pop(); if (this.stack.length > 1) this.stack.pop(); break;
        case 'mode': this.stack.push({ kind: 'mode', mode: op.mode, data: op.data }); break;
        case 'popmode': if (this.top() && this.top().kind === 'mode') this.stack.pop(); break;
        default: break;
      }
    }
    _flush() {
      let guard = 0;
      while (this.pending.length && guard++ < 64) {
        const op = this.pending.shift();
        try { this._apply(op); } catch (err) { this.error(`scene change (${op.type})`, err); }
      }
      for (const s of this.stack) if (s.ents) s.ents = s.ents.filter((e) => !e.dead);
    }
    start() { this._enter(this.cart.meta.start, null, 'replace'); }
    /* Swap in an edited cart without losing the running game. Entities keep their runtime state; a component field
       follows the new prefab only if it still had the old prefab's value (so hp you've lost isn't reset, but a speed
       you just tweaked takes effect). Entities of deleted prefabs are removed. */
    hotReload(cart) {
      const old = this.cart, notes = [];
      const authored = (c, prefab, cn, k) => { const pf = c.prefabs[prefab], f = this.reg.components[cn]; return pf && pf.c && pf.c[cn] && k in pf.c[cn] ? pf.c[cn][k] : f ? f.defaults[k] : undefined; };
      this.cart = cart; this._ruleIdx = {};
      for (const sc of [...this.stack, ...Object.values(this.parked)]) {
        if (!sc.ents) continue;
        sc.ents = sc.ents.filter((e) => { if (cart.prefabs[e.prefab]) return true; if (e.prefab === '@raw') return false; notes.push(`removed a ${e.prefab} (its prefab is gone)`); return false; });
        for (const e of sc.ents) {
          const pf = cart.prefabs[e.prefab];
          for (const cn of Object.keys(pf.c || {})) {
            const def = this.reg.components[cn]; if (!def) continue;
            if (!e.c[cn]) { e.c[cn] = Object.assign(clone(def.defaults), clone(pf.c[cn])); continue; }
            for (const k of Object.keys(def.fields)) {
              const was = authored(old, e.prefab, cn, k), now = authored(cart, e.prefab, cn, k);
              if (!(k in e.c[cn]) || JSON.stringify(e.c[cn][k]) === JSON.stringify(was)) if (now !== undefined) e.c[cn][k] = clone(now);
            }
          }
          for (const k of Object.keys(pf.v || {})) if (!hasOwn(e.v, k)) e.v[k] = clone(pf.v[k]);
        }
        const sd = cart.scenes[sc.name], md = sd && sd.map ? cart.maps[sd.map] : null;
        if (md && sc.map && (md.w !== sc.map.w || md.h !== sc.map.h)) { sc.map.w = md.w; sc.map.h = md.h; sc.map.layers = md.layers.map((L) => ({ name: L.name, collide: !!L.collide, ids: DC2.decodeRows(L.rows, md.w) })); notes.push(`map "${sd.map}" changed size, so its runtime tile edits were reset`); }
        else if (md && sc.map) for (const L of md.layers) if (!sc.map.layers.some((x) => x.name === L.name)) { sc.map.layers.push({ name: L.name, collide: !!L.collide, ids: DC2.decodeRows(L.rows, md.w) }); }
        if (md && sc.map) for (const L of sc.map.layers) { const nl = md.layers.find((x) => x.name === L.name); if (nl) L.collide = !!nl.collide; }
      }
      return notes;
    }
    pushMode(mode, data) { this.queue({ type: 'mode', mode, data }); }

    /* ---- the fixed-timestep update. `inputs` = array (per player) of {up:true,a:true,...} held buttons */
    _inputs(inputs) {
      const P = this.input.players;
      for (let i = 0; i < 4; i++) {
        const down = (inputs && inputs[i]) || {}, prev = this.prevDown[i] || {}, pressed = {};
        for (const b of BUTTONS) pressed[b] = !!down[b] && !prev[b];
        P[i] = { down: Object.assign({}, down), pressed };
        this.prevDown[i] = Object.assign({}, down);
      }
      const D = root.DC;
      if (D && (!D.Input || D.Input.__shim)) { D.Input = D.Input || { __shim: true }; D.Input.players = P; }
    }
    step(inputs) {
      this.fx.length = 0;
      this._inputs(inputs);
      const top = this.top();
      if (top && top.kind === 'mode') {
        const m = this.reg.modes[top.mode];
        try { m.update(this, top, this.input); } catch (err) { this.error(`mode ${top.mode}`, err); }
      } else if (top) {
        if (!top.started) { top.started = true; this.broadcast(top, 'start'); }
        for (const s of this.reg.systems) { try { s.update(this, top, DT); } catch (err) { this.error(`system ${s.name}`, err); } }
        this._poll(top, DT);
        this._timers(DT);
      }
      this._flush();
      this.frame++; this.time = this.frame * DT;
    }
    modeView() { const t = this.top(); return t && t.kind === 'mode' ? this.reg.modes[t.mode].view(this, t) : null; }
    hudItems() {
      const sc = this.active(), sd = sc && this.cart.scenes[sc.name], out = [];
      for (const h of (sd && sd.hud) || []) {
        const ctx = { self: null, other: null, args: {}, scene: sc };
        if (h.if !== undefined && !this.test(h.if, ctx)) continue;
        out.push(Object.assign({}, h, { text: this.fmt(h.text, ctx) }));
      }
      return out;
    }
    save() {
      return JSON.parse(JSON.stringify({ frame: this.frame, rng: this.rng, vars: this.vars, nextId: this.nextId, stack: this.stack, parked: this.parked, timers: this.timers, rs: this.rs, prevDown: this.prevDown }));
    }
  }
  DC2.World = World;
  DC2.restore = (cart, reg, snap, opts) => {
    const w = new World(cart, reg, opts), s = JSON.parse(JSON.stringify(snap));
    Object.assign(w, { frame: s.frame, rng: s.rng, vars: s.vars, nextId: s.nextId, stack: s.stack, parked: s.parked, timers: s.timers, rs: s.rs, prevDown: s.prevDown });
    w.time = w.frame * DT;
    for (const sc of [...w.stack, ...Object.values(w.parked)]) if (sc.ents) sc.ents.forEach((e) => { e.tags = tagList(e.tags); });
    return w;
  };
  /* validate + build a registry + create a world in one call */
  DC2.boot = (cart, opts) => {
    const { reg, errors } = DC2.registryFor(cart);
    const report = DC2.validate(cart, reg, opts);
    report.errors.unshift(...errors); report.ok = report.errors.length === 0;
    if (!report.ok && !(opts && opts.force)) return { world: null, report, reg };
    const world = new World(cart, reg, opts); world.start();
    return { world, report, reg };
  };

  /* --------------------------------------------- docs generated from the registry */
  const fieldLine = (sp) => `${typeLabel(sp)}${sp.default !== undefined ? ` = ${JSON.stringify(sp.default)}` : sp.optional ? ' (optional)' : ' (required)'}${sp.doc ? ' — ' + sp.doc : ''}`;
  DC2.docsMarkdown = (reg) => {
    const L = ['# Reference', '', '_Generated from the extension registry. Do not edit by hand._', ''];
    for (const ext of reg.extNames) {
      L.push(`## ${ext}`, '', (DC2.ext[ext].doc || ''), '');
      const comps = Object.values(reg.components).filter((c) => c.ext === ext);
      const trigs = Object.values(reg.triggers).filter((c) => c.ext === ext);
      const acts = Object.values(reg.actions).filter((c) => c.ext === ext);
      if (comps.length) { L.push('### Components', ''); for (const c of comps) { L.push(`**${c.name}** — ${c.doc || ''}${c.needs.length ? ` (needs ${c.needs.join(', ')})` : ''}`, ''); for (const k in c.fields) L.push(`- \`${k}\`: ${fieldLine(c.fields[k])}`); L.push(''); } }
      if (trigs.length) { L.push('### Triggers (`"on"`)', ''); for (const c of trigs) { L.push(`**${c.name}** — ${c.doc || ''}`, ''); for (const k in c._specs) L.push(`- \`${k}\`: ${fieldLine(c._specs[k])}`); L.push(''); } }
      if (acts.length) { L.push('### Actions (`"act"`)', ''); for (const c of acts) { L.push(`**${c.name}** — ${c.doc || ''}`, ''); for (const k in c._specs) L.push(`- \`${k}\`: ${fieldLine(c._specs[k])}`); L.push(''); } }
    }
    return L.join('\n');
  };
  /* the compact prompt for an AI: a primer plus ONLY the extensions this cart uses */
  DC2.aiPrimer = 'A Data Console cart is one JSON object: {"format":"DCART-2","meta":{title,width,height,start,player,extensions:[...]},"vars":{},"palettes":{"main":[...]},"sprites":{},"tilesets":{},"maps":{},"prefabs":{},"scenes":{},"rules":[]}.\nA prefab is {"tags":[],"c":{component:{fields}},"v":{entity vars},"rules":[rule]}. A rule is {"on":trigger,...trigger params,"if":expression,"then":[action],"else":[action]}. An action is {"act":name,...params}.\nExpressions are plain strings (no leading "="): "coins >= 8 and not flags.done", "dist(self,player) < 60", "self.health.hp / self.health.max". Text fields may embed {expressions}. Every variable must be declared in "vars"; unknown names and references are errors; unknown extra keys are warnings.\nA player-tagged map object is the spawn point of its scene; a prefab may list "carry":["health"] to keep those components when the player arrives from a scene that used a different player prefab.\nSprites: {"w","h","palette","frames":["row/row/..."],"anims":{"walk":{"f":[0,1],"fps":8}}}. Maps: {"w","h","tileset","layers":[{"name","collide","rows":[2 base-36 chars per tile]}],"objects":[{"prefab","name","x","y"}]}.';
  DC2.aiSpec = (reg) => {
    const L = [DC2.aiPrimer, ''];
    for (const ext of reg.extNames) {
      L.push(`# ${ext}: ${DC2.ext[ext].doc || ''}`);
      for (const c of Object.values(reg.components).filter((c) => c.ext === ext)) L.push(`component ${c.name}${c.needs.length ? ' (needs ' + c.needs.join(',') + ')' : ''}: ${Object.entries(c.fields).map(([k, s]) => `${k}:${typeLabel(s)}${s.default !== undefined ? '=' + JSON.stringify(s.default) : ''}`).join(' ')}`);
      for (const c of Object.values(reg.triggers).filter((c) => c.ext === ext)) L.push(`trigger ${c.name}${Object.keys(c._specs).length ? ': ' + Object.entries(c._specs).map(([k, s]) => `${k}:${typeLabel(s)}${s.default !== undefined ? '=' + JSON.stringify(s.default) : ''}`).join(' ') : ''}${c.doc ? ' — ' + c.doc : ''}`);
      for (const c of Object.values(reg.actions).filter((c) => c.ext === ext)) L.push(`action ${c.name}: ${Object.entries(c._specs).map(([k, s]) => `${k}:${typeLabel(s)}${s.default !== undefined ? '=' + JSON.stringify(s.default) : ''}`).join(' ')}${c.doc ? ' — ' + c.doc : ''}`);
    }
    return L.join('\n');
  };

  /* ---------------------------------------------- core extension (built in) */
  DC2.defineExtension({
    name: 'core',
    doc: 'Variables, control flow, timers, events, spawning, scenes and effects.',
    install(r) {
      const targetSpec = { type: 'string', default: 'self', doc: '"self", "other", or a tag name' };
      r.trigger('start', { doc: 'The scene has just started.', owners: ['world', 'scene'] });
      r.trigger('spawn', { doc: 'The entity has just appeared.', owners: ['entity'], poll(w, rule, st) { if (st.done) return false; st.done = true; return true; } });
      r.trigger('update', { doc: 'Every frame.', poll: () => true });
      r.trigger('every', { doc: 'Repeatedly, every t seconds.', params: { t: { type: 'number', min: 0.01, required: true } }, poll(w, rule, st, ctx, dt) { st.t = (st.t || 0) + dt; if (st.t >= rule.t) { st.t -= rule.t; return true; } return false; } });
      r.trigger('after', { doc: 'Once, t seconds after the scene or entity starts.', params: { t: { type: 'number', min: 0, required: true } }, poll(w, rule, st, ctx, dt) { if (st.done) return false; st.t = (st.t || 0) + dt; if (st.t >= rule.t) { st.done = true; return true; } return false; } });
      r.trigger('when', { doc: 'Fires when the "if" condition turns from false to true.', requiresIf: true, edgeIf: true, poll(w, rule, st, ctx) { const v = w.test(rule.if, ctx); const f = v && !st.was; st.was = v; return f; } });
      r.trigger('button', { doc: 'A button was just pressed.', params: { button: { type: 'enum', values: BUTTONS, required: true }, player: { type: 'int', default: 0, min: 0, max: 3 }, cooldown: { type: 'number', default: 0, doc: 'seconds before it can fire again' } },
        poll(w, rule, st, ctx, dt) { st.cd = Math.max(0, (st.cd || 0) - dt); const inp = w.input.players[rule.player | 0]; if (inp && inp.pressed[rule.button] && st.cd <= 0) { st.cd = rule.cooldown || 0; return true; } return false; } });
      r.trigger('event', { doc: 'Another rule emitted this event.', params: { name: { type: 'string', required: true } } });

      r.action('set', { doc: 'Set a variable.', params: { path: { type: 'path', required: true }, to: { type: 'expr', required: true } }, run(w, ctx, p, a) { w.setPath(a.path, p.to, ctx); } });
      r.action('add', { doc: 'Add to a number variable (negative to subtract).', params: { path: { type: 'path', required: true }, by: { type: 'expr', default: 1 } }, run(w, ctx, p, a) { w.setPath(a.path, (+w.getPath(a.path, ctx) || 0) + (+p.by || 0), ctx); } });
      r.action('if', { doc: 'Run "then" when the test is true, otherwise "else".', params: { test: { type: 'expr', required: true }, then: { type: 'actions', required: true }, else: { type: 'actions', optional: true } },
        run(w, ctx, p, a) { w.run(X().truthy(p.test) ? a.then : a.else, ctx); } });
      r.action('wait', { doc: 'Run "then" after t seconds.', params: { t: { type: 'number', min: 0, required: true }, then: { type: 'actions', required: true } },
        run(w, ctx, p, a) { w.timers.push({ t: p.t, then: a.then, self: ctx.self ? ctx.self.id : 0, other: ctx.other ? ctx.other.id : 0, args: ctx.args || {} }); } });
      r.action('emit', { doc: 'Send an event to every "event" rule with this name.', params: { name: { type: 'string', required: true } }, run(w, ctx, p, a) { w.fireEvent(a.name, ctx.args); } });
      r.action('spawn', { doc: 'Create an entity from a prefab.', params: {
        prefab: { type: 'ref:prefab', required: true }, at: { type: 'enum', values: ['self', 'other', 'world'], default: 'self' },
        x: { type: 'expr', optional: true }, y: { type: 'expr', optional: true }, dx: { type: 'expr', default: 0 }, dy: { type: 'expr', default: 0 },
        ahead: { type: 'expr', default: 0, doc: 'pixels in front of "at", in the direction it faces' },
        vx: { type: 'expr', optional: true }, vy: { type: 'expr', optional: true },
        attach: { type: 'bool', default: false, doc: 'stays stuck to "at" as it moves and turns (a sword swing, a shield, a held torch)' } },
        run(w, ctx, p, a) {
          const base = a.at === 'other' ? ctx.other : a.at === 'world' ? null : ctx.self;
          let x = base && base.c.pos ? base.c.pos.x : 0, y = base && base.c.pos ? base.c.pos.y : 0;
          if (p.ahead && base) { const f = base.r.face || { x: 0, y: 1 }; x += f.x * p.ahead; y += f.y * p.ahead; }
          x += +p.dx || 0; y += +p.dy || 0;
          if (p.x != null) x = +p.x; if (p.y != null) y = +p.y;
          const e = w.spawn(a.prefab, { x, y });
          if (base && base.r.face && ctx.self === base) e.r.face = { x: base.r.face.x, y: base.r.face.y };
          if (e.c.vel) { if (p.vx != null) e.c.vel.x = +p.vx; if (p.vy != null) e.c.vel.y = +p.vy; }
          if (a.attach && base) { e.r.attach = { id: base.id, ahead: +p.ahead || 0, dx: +p.dx || 0, dy: +p.dy || 0 }; e.r.face = base.r.face ? { x: base.r.face.x, y: base.r.face.y } : e.r.face; }
        } });
      r.action('destroy', { doc: 'Remove entities.', params: { target: targetSpec }, run(w, ctx, p, a) { w.targets(a.target || 'self', ctx).forEach((e) => w.destroy(e)); } });
      r.action('tag', { doc: 'Add or remove a tag.', params: { target: targetSpec, add: { type: 'string', optional: true }, remove: { type: 'string', optional: true } },
        run(w, ctx, p, a) { for (const e of w.targets(a.target || 'self', ctx)) { if (a.add && !e.tags.has(a.add)) e.tags.push(a.add); if (a.remove) { const i = e.tags.indexOf(a.remove); if (i >= 0) e.tags.splice(i, 1); } } } });
      r.action('goto', { doc: 'Switch to another scene. The player is carried over and placed at the named map object "at".', params: { scene: { type: 'ref:scene', required: true }, at: { type: 'string', optional: true } },
        run(w, ctx, p, a) { w.queue({ type: 'goto', scene: a.scene, at: a.at }); },
        check(a, path, cx) {
          const sd = cx.cart.scenes[a.scene], md = sd && sd.map ? cx.cart.maps[sd.map] : null;
          if (a.at && md && !(md.objects || []).some((o) => o.name === a.at)) cx.E(`${path}.at`, `map "${sd.map}" has no object named "${a.at}"${suggest(a.at, (md.objects || []).map((o) => o.name).filter(Boolean)) ? ` — did you mean "${suggest(a.at, (md.objects || []).map((o) => o.name).filter(Boolean))}"?` : ''}`);
        } });
      r.action('push', { doc: 'Open another scene on top of this one (a battle, a menu). "pop" returns.', params: { scene: { type: 'ref:scene', required: true }, at: { type: 'string', optional: true } }, run(w, ctx, p, a) { w.queue({ type: 'push', scene: a.scene, at: a.at }); } });
      r.action('pop', { doc: 'Close the top scene and return to the one below.', params: {}, run(w) { w.queue({ type: 'pop' }); } });
      r.action('settile', { doc: 'Change one tile of the current map.', params: { layer: { type: 'string', required: true }, tx: { type: 'expr', required: true }, ty: { type: 'expr', required: true }, tile: { type: 'expr', required: true, doc: 'tile number, 0 = empty' } },
        run(w, ctx, p, a) { const m = w.active().map; const L = m && m.layers.find((l) => l.name === a.layer); if (!L) throw new Error(`no layer "${a.layer}"`); const x = Math.floor(p.tx), y = Math.floor(p.ty); if (x >= 0 && y >= 0 && x < m.w && y < m.h) L.ids[y * m.w + x] = p.tile | 0; } });
      r.action('sound', { doc: 'Play a sound.', params: { id: { type: 'ref:sound', required: true } }, run(w, ctx, p, a) { w.sfx('sound', { id: a.id }); } });
      r.action('shake', { doc: 'Shake the screen.', params: { t: { type: 'number', default: 0.3 } }, run(w, ctx, p, a) { w.sfx('shake', { t: a.t == null ? 0.3 : a.t }); } });
      r.action('haptic', { doc: 'Vibrate the device.', params: { kind: { type: 'enum', values: ['light', 'medium', 'heavy', 'double', 'success', 'warning', 'error'], default: 'light' } }, run(w, ctx, p, a) { w.sfx('haptic', { kind: a.kind || 'light' }); } });
      r.action('log', { doc: 'Write to the developer log.', params: { text: { type: 'text', required: true } }, run(w, ctx, p) { w.sfx('log', { text: p.text }); } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
