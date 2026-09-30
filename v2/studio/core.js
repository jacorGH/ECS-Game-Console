/* Data Console v2 studio — core (no DOM). Everything the editors need, testable in Node:
   Doc (one live cart + one undo system), storage (IndexedDB or memory) with autosave and restore points,
   map operations, recipes ("add a Walker enemy"), rename-with-references, and form descriptors generated from
   the extension registry. The UI files only draw these. */
(function (root) {
  'use strict';
  const DC2 = (root.DC2 = root.DC2 || {}), S = (DC2.studio = {});
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const enc = (id) => B36[Math.floor(id / 36)] + B36[id % 36];
  const KINDS = ['sprites', 'tilesets', 'maps', 'prefabs', 'scenes', 'sounds', 'music', 'palettes'];
  const REFS = { prefab: 'prefabs', scene: 'scenes', sprite: 'sprites', map: 'maps', tileset: 'tilesets', palette: 'palettes', sound: 'sounds' };
  Object.assign(S, { KINDS, clone });

  /* ------------------------------------------------------------------ paths */
  S.pathStr = (p) => p.map((k, i) => (typeof k === 'number' ? `[${k}]` : (i ? '.' : '') + k)).join('');
  S.getIn = (o, p) => { for (const k of p) { if (o == null) return undefined; o = o[k]; } return o; };
  S.setIn = (o, p, v) => {
    for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = typeof p[i + 1] === 'number' ? [] : {}; o = o[p[i]]; }
    o[p[p.length - 1]] = v;
  };
  S.delIn = (o, p) => {
    const parent = S.getIn(o, p.slice(0, -1)); if (parent == null) return;
    const k = p[p.length - 1]; if (Array.isArray(parent)) parent.splice(k, 1); else delete parent[k];
  };
  /* which stored file a changed path belongs to (null = "some whole kind changed") */
  S.fileOf = (p) => {
    if (!p.length) return null;
    if (KINDS.includes(p[0])) return p.length === 1 ? null : `${p[0]}/${p[1]}.json`;
    return 'project.json';
  };

  /* --------------------------------------------------------------- commands */
  const C = (S.cmd = {});
  C.set = (path, value, label) => ({
    label: label || 'Change', touched: [path], value: clone(value),
    do(c) { const par = S.getIn(c, path.slice(0, -1)), k = path[path.length - 1]; this.had = par != null && hasOwn(par, k); this.prev = this.had ? clone(par[k]) : undefined; S.setIn(c, path, clone(this.value)); },
    undo(c) { if (this.had) S.setIn(c, path, clone(this.prev)); else S.delIn(c, path); },
  });
  C.del = (path, label) => ({
    label: label || 'Delete', touched: [path],
    do(c) { const par = S.getIn(c, path.slice(0, -1)), k = path[path.length - 1]; this.had = par != null && hasOwn(par, k); this.prev = this.had ? clone(par[k]) : undefined; if (this.had) S.delIn(c, path); },
    undo(c) { if (this.had) S.setIn(c, path, clone(this.prev)); },
  });
  C.insert = (path, index, value, label) => ({
    label: label || 'Add', touched: [path],
    do(c) { let a = S.getIn(c, path); if (!Array.isArray(a)) { a = []; S.setIn(c, path, a); } a.splice(index == null ? a.length : index, 0, clone(value)); this.at = index == null ? a.length - 1 : index; },
    undo(c) { S.getIn(c, path).splice(this.at, 1); },
  });
  C.remove = (path, index, label) => ({
    label: label || 'Remove', touched: [path],
    do(c) { this.prev = S.getIn(c, path).splice(index, 1)[0]; },
    undo(c) { S.getIn(c, path).splice(index, 0, this.prev); },
  });
  C.move = (path, from, to, label) => ({
    label: label || 'Move', touched: [path],
    do(c) { const a = S.getIn(c, path); a.splice(to, 0, a.splice(from, 1)[0]); },
    undo(c) { const a = S.getIn(c, path); a.splice(from, 0, a.splice(to, 1)[0]); },
  });
  /* tile edits: cells = [{x,y,id}], on layer li of a map. Row strings are patched in place. */
  C.cells = (mapId, li, cells, label) => ({
    label: label || 'Paint', touched: [['maps', mapId, 'layers', li, 'rows']], cells,
    do(c) {
      const L = c.maps[mapId].layers[li]; this.old = [];
      for (const { x, y, id } of this.cells) { const row = L.rows[y]; this.old.push(parseInt(row.substr(x * 2, 2), 36)); L.rows[y] = row.slice(0, x * 2) + enc(id) + row.slice(x * 2 + 2); }
    },
    undo(c) {
      const L = c.maps[mapId].layers[li];
      for (let i = this.cells.length - 1; i >= 0; i--) { const { x, y } = this.cells[i], row = L.rows[y]; L.rows[y] = row.slice(0, x * 2) + enc(this.old[i]) + row.slice(x * 2 + 2); }
    },
  });
  const composite = (label, cmds) => ({
    label, cmds, touched: cmds.flatMap((c) => c.touched),
    do(c) { this.cmds.forEach((k) => k.do(c)); }, undo(c) { for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i].undo(c); },
  });

  /* --------------------------------------------------------------------- Doc */
  /* One live cart, one undo history. Everything that edits the game goes through here. */
  class Doc {
    constructor(cart) { this.cart = cart; this.undos = []; this.redos = []; this.subs = []; this.group = null; this.rev = 0; this.max = 200; }
    on(fn) { this.subs.push(fn); return () => { this.subs = this.subs.filter((f) => f !== fn); }; }
    _emit(kind, cmd) { this.rev++; for (const f of this.subs) f({ kind, label: cmd.label, touched: cmd.touched, cmd }); }
    run(cmd) {
      cmd.do(this.cart);
      if (this.group) { this.group.cmds.push(cmd); return cmd; }
      this.undos.push(cmd); if (this.undos.length > this.max) this.undos.shift();
      this.redos.length = 0; this._emit('do', cmd); return cmd;
    }
    /* group several edits into one undo step (a paint stroke, "add a walker") */
    begin(label) { if (this.group) this.group.depth++; else this.group = { label, cmds: [], depth: 1 }; }
    end() {
      if (!this.group || --this.group.depth > 0) return;
      const g = this.group; this.group = null;
      if (!g.cmds.length) return;
      const cmd = composite(g.label, g.cmds);
      this.undos.push(cmd); this.redos.length = 0; this._emit('do', cmd);
    }
    transact(label, fn) { this.begin(label); try { return fn(); } finally { this.end(); } }
    undo() { const c = this.undos.pop(); if (!c) return false; c.undo(this.cart); this.redos.push(c); this._emit('undo', c); return true; }
    redo() { const c = this.redos.pop(); if (!c) return false; c.do(this.cart); this.undos.push(c); this._emit('redo', c); return true; }
    get canUndo() { return this.undos.length > 0; }
    get canRedo() { return this.redos.length > 0; }
    get(path) { return S.getIn(this.cart, path); }
    /* opt.coalesce: repeated sets of the same path within 800 ms (a slider drag, typing) become one undo step */
    set(path, value, opt) {
      opt = opt || {};
      const top = this.undos[this.undos.length - 1], now = Date.now();
      if (opt.coalesce && !this.group && top && top.co && top.coPath === S.pathStr(path) && now - top.coT < 800) {
        top.value = clone(value); top.coT = now; top.cmdSet = true;
        const prev = top.prev, had = top.had; top.do(this.cart); top.prev = prev; top.had = had;   // keep the ORIGINAL previous value
        this.redos.length = 0; this._emit('do', top); return top;
      }
      const cmd = C.set(path, value, opt.label);
      if (opt.coalesce) { cmd.co = true; cmd.coPath = S.pathStr(path); cmd.coT = now; }
      return this.run(cmd);
    }
    del(path, label) { return this.run(C.del(path, label)); }
    insert(path, index, value, label) { return this.run(C.insert(path, index, value, label)); }
    remove(path, index, label) { return this.run(C.remove(path, index, label)); }
    move(path, from, to, label) { return this.run(C.move(path, from, to, label)); }
  }
  S.Doc = Doc;

  /* ------------------------------------------------------- canonical JSON, .dcart */
  const canonical = (v) => (Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : isObj(v) ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v));
  S.canonical = canonical;
  S.toDcart = (cart) => JSON.stringify({ dcart: 1, hash: DC2.hash(canonical(cart)), extensions: (cart.meta && cart.meta.extensions) || [], cart }, null, 1);
  S.fromDcart = (text) => {
    let d; try { d = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON (' + e.message + ').'); }
    if (!d || d.dcart !== 1 || !d.cart) throw new Error('That does not look like a Data Console cartridge (.dcart).');
    if (d.hash !== DC2.hash(canonical(d.cart))) throw new Error('This cartridge was edited or damaged after it was saved (its checksum does not match).');
    return d.cart;
  };

  /* ------------------------------------------------- project <-> files (split/join) */
  S.split = (cart) => {
    const files = {}, rest = {};
    for (const k of Object.keys(cart)) { if (!KINDS.includes(k)) rest[k] = cart[k]; }
    for (const kind of KINDS) for (const id of Object.keys(cart[kind] || {})) files[`${kind}/${id}.json`] = JSON.stringify(cart[kind][id], null, 1);
    files['project.json'] = JSON.stringify(rest, null, 1);
    return files;
  };
  S.join = (files) => {
    if (!files['project.json']) throw new Error('project.json is missing');
    const cart = JSON.parse(files['project.json']);
    for (const kind of KINDS) cart[kind] = {};
    for (const p of Object.keys(files).sort()) {
      const m = /^([a-z]+)\/(.+)\.json$/.exec(p); if (!m || !KINDS.includes(m[1])) continue;
      cart[m[1]][m[2]] = JSON.parse(files[p]);
    }
    return cart;
  };
  S.slug = (s, taken) => {
    let base = String(s || 'thing').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thing', id = base, n = 2;
    while (taken && (Array.isArray(taken) ? taken.includes(id) : hasOwn(taken, id))) id = `${base}-${n++}`;
    return id;
  };

  /* ---------------------------------------------------------------- storage */
  class MemoryBackend {
    constructor() { this.s = {}; }
    _st(n) { return this.s[n] || (this.s[n] = new Map()); }
    async get(store, key) { const v = this._st(store).get(key); return v === undefined ? undefined : clone(v); }
    async put(store, key, val) { this._st(store).set(key, clone(val)); }
    async del(store, key) { this._st(store).delete(key); }
    async keys(store, prefix) { return [...this._st(store).keys()].filter((k) => k.startsWith(prefix || '')).sort(); }
    async values(store, prefix) { return (await this.keys(store, prefix)).map((k) => clone(this._st(store).get(k))); }
  }
  class IDBBackend {
    constructor(name) { this.name = name || 'dc2-studio'; this.db = null; }
    async open() {
      if (this.db) return this.db;
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(this.name, 1);
        r.onupgradeneeded = () => { for (const s of ['projects', 'files', 'snapshots']) r.result.createObjectStore(s); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return this.db;
    }
    async _do(store, mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => { const t = db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    }
    get(store, key) { return this._do(store, 'readonly', (o) => o.get(key)); }
    put(store, key, val) { return this._do(store, 'readwrite', (o) => o.put(val, key)); }
    del(store, key) { return this._do(store, 'readwrite', (o) => o.delete(key)); }
    keys(store, prefix) { return this._do(store, 'readonly', (o) => o.getAllKeys(IDBKeyRange.bound(prefix || '', (prefix || '') + '\uffff'))); }
    values(store, prefix) { return this._do(store, 'readonly', (o) => o.getAll(IDBKeyRange.bound(prefix || '', (prefix || '') + '\uffff'))); }
  }
  Object.assign(S, { MemoryBackend, IDBBackend });

  class Library {
    constructor(backend) { this.b = backend; }
    async list() { return (await this.b.values('projects', '')).sort((a, b) => b.updated - a.updated); }
    async create(name, cart) {
      const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), meta = { id, name: name || (cart.meta && cart.meta.title) || 'Untitled', created: Date.now(), updated: Date.now() };
      await this.b.put('projects', id, meta); await this.saveAll(id, cart); return meta;
    }
    async _touch(id) { const m = await this.b.get('projects', id); if (m) { m.updated = Date.now(); await this.b.put('projects', id, m); } }
    async saveAll(id, cart) {
      const files = S.split(cart), have = await this.b.keys('files', id + '/');
      for (const k of have) if (!hasOwn(files, k.slice(id.length + 1))) await this.b.del('files', k);
      for (const p of Object.keys(files)) await this.b.put('files', id + '/' + p, { path: p, content: files[p], hash: DC2.hash(files[p]) });
      await this._touch(id);
    }
    /* write only the files that changed */
    async saveFiles(id, cart, paths) {
      const all = S.split(cart);
      for (const p of paths) {
        if (hasOwn(all, p)) await this.b.put('files', id + '/' + p, { path: p, content: all[p], hash: DC2.hash(all[p]) });
        else await this.b.del('files', id + '/' + p);
      }
      await this._touch(id);
    }
    async open(id) {
      const meta = await this.b.get('projects', id); if (!meta) throw new Error('That project no longer exists.');
      const files = {}; for (const e of await this.b.values('files', id + '/')) files[e.path] = e.content;
      return { meta, cart: S.join(files) };
    }
    async rename(id, name) { const m = await this.b.get('projects', id); m.name = name; await this.b.put('projects', id, m); }
    async remove(id) {
      for (const s of ['files', 'snapshots']) for (const k of await this.b.keys(s, id + '/')) await this.b.del(s, k);
      await this.b.del('projects', id);
    }
    async snapshot(id, cart, label, keep) {
      const ts = Date.now();
      await this.b.put('snapshots', `${id}/${String(ts).padStart(13, '0')}`, { ts, label: label || 'Snapshot', files: S.split(cart) });
      const ks = await this.b.keys('snapshots', id + '/');
      for (const k of ks.slice(0, Math.max(0, ks.length - (keep || 20)))) await this.b.del('snapshots', k);
      return ts;
    }
    async snapshots(id) { return (await this.b.values('snapshots', id + '/')).map((s) => ({ ts: s.ts, label: s.label })).sort((a, b) => b.ts - a.ts); }
    async snapshotCart(id, ts) { const s = await this.b.get('snapshots', `${id}/${String(ts).padStart(13, '0')}`); if (!s) throw new Error('That restore point is gone.'); return S.join(s.files); }
    async exportDcart(id) { return S.toDcart((await this.open(id)).cart); }
    async importDcart(text, name) { const cart = S.fromDcart(text); return this.create(name || (cart.meta && cart.meta.title), cart); }
  }
  S.Library = Library;

  /* Saves changed files shortly after every edit; a restore point every 25 saves. */
  class Autosaver {
    constructor(lib, id, doc, opt) {
      Object.assign(this, { lib, id, doc, dirty: new Set(), all: false, status: 'saved', t: null, delay: opt && opt.delay != null ? opt.delay : 500, saves: 0, q: Promise.resolve(), subs: [], error: null });
      this.off = doc.on((ev) => { for (const p of ev.touched || []) { const f = S.fileOf(p); if (f === null) this.all = true; else this.dirty.add(f); } this._sched(); });
    }
    onStatus(fn) { this.subs.push(fn); }
    _set(s) { this.status = s; this.subs.forEach((f) => f(s, this.error)); }
    _sched() { this._set('dirty'); clearTimeout(this.t); this.t = setTimeout(() => this.flush(), this.delay); }
    flush() {
      clearTimeout(this.t);
      this.q = this.q.then(async () => {
        if (!this.dirty.size && !this.all) return;
        const files = [...this.dirty], all = this.all; this.dirty.clear(); this.all = false; this._set('saving');
        try {
          if (all) await this.lib.saveAll(this.id, this.doc.cart); else await this.lib.saveFiles(this.id, this.doc.cart, files);
          if (++this.saves % 25 === 0) await this.lib.snapshot(this.id, this.doc.cart, 'Automatic');
          this.error = null; this._set(this.dirty.size || this.all ? 'dirty' : 'saved');
        } catch (e) { this.error = e; files.forEach((f) => this.dirty.add(f)); if (all) this.all = true; this._set('error'); }
      });
      return this.q;
    }
    stop() { this.off(); clearTimeout(this.t); }
  }
  S.Autosaver = Autosaver;

  /* --------------------------------------------------------- checking the cart */
  S.check = (cart, opts) => {
    const { reg, errors } = DC2.registryFor(cart), r = DC2.validate(cart, reg, opts);
    return { ok: !errors.length && r.ok, errors: [...errors, ...r.errors], warnings: r.warnings, reg };
  };
  /* problems at or under a path (for badges next to fields) */
  S.issuesAt = (report, pathStr) => [...report.errors.map((e) => ({ level: 'error', ...e })), ...report.warnings.map((e) => ({ level: 'warn', ...e }))].filter((e) => e.path === pathStr || e.path.startsWith(pathStr + '.') || e.path.startsWith(pathStr + '['));

  /* ------------------------------------------------------------- map operations */
  const M = (S.map = {});
  M.get = (cart, id) => cart.maps[id];
  M.layerIds = (cart, id, li) => DC2.decodeRows(cart.maps[id].layers[li].rows, cart.maps[id].w);
  const inMap = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  M.line = (x0, y0, x1, y1) => {
    const out = []; let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { out.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return out;
  };
  M.rect = (x0, y0, x1, y1) => { const out = []; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]); return out; };
  M.flood = (cart, id, li, x, y) => {
    const m = cart.maps[id]; if (!inMap(m, x, y)) return [];
    const ids = M.layerIds(cart, id, li), target = ids[y * m.w + x], seen = new Uint8Array(m.w * m.h), out = [], stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop(); if (!inMap(m, cx, cy) || seen[cy * m.w + cx] || ids[cy * m.w + cx] !== target) continue;
      seen[cy * m.w + cx] = 1; out.push([cx, cy]); stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return out;
  };
  /* set cells [[x,y]...] of a layer to `tile`; only cells that actually change are recorded. Returns how many. */
  M.paint = (doc, id, li, cells, tile) => {
    const m = doc.cart.maps[id], L = m.layers[li], out = [], seen = new Set();
    for (const [x, y] of cells) {
      if (!inMap(m, x, y) || seen.has(y * m.w + x)) continue; seen.add(y * m.w + x);
      if (parseInt(L.rows[y].substr(x * 2, 2), 36) !== tile) out.push({ x, y, id: tile });
    }
    if (out.length) doc.run(C.cells(id, li, out, tile ? 'Paint' : 'Erase'));
    return out.length;
  };
  /* ---- more shapes */
  M.frame = (x0, y0, x1, y1) => { const out = [], ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1); for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (x === ax || x === bx || y === ay || y === by) out.push([x, y]); return out; };
  /* set individual cells of one layer to individual tiles: cells = [{x, y, id}]; one command; returns how many actually changed */
  M.setCells = (doc, id, li, cells, label) => {
    const m = doc.cart.maps[id], L = m.layers[li]; if (!L) return 0;
    const last = new Map(); for (const c of cells) if (inMap(m, c.x, c.y)) last.set(c.y * m.w + c.x, c);
    const out = []; for (const c of last.values()) if (parseInt(L.rows[c.y].substr(c.x * 2, 2), 36) !== c.id) out.push({ x: c.x, y: c.y, id: c.id });
    if (out.length) doc.run(C.cells(id, li, out, label || 'Paint'));
    return out.length;
  };
  /* ---- selections. A selection is a Set of cell numbers (y * width + x). Box, wand and the rest all produce one. */
  M.selRect = (m, x0, y0, x1, y1) => { const s = new Set(); for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(m.h - 1, Math.max(y0, y1)); y++) for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(m.w - 1, Math.max(x0, x1)); x++) s.add(y * m.w + x); return s; };
  M.selAll = (m) => M.selRect(m, 0, 0, m.w - 1, m.h - 1);
  M.selInvert = (m, sel) => { const s = new Set(); for (let i = 0; i < m.w * m.h; i++) if (!sel || !sel.has(i)) s.add(i); return s; };
  M.selCombine = (a, b, mode) => { if (mode === 'add') return new Set([...(a || []), ...b]); if (mode === 'sub') { const s = new Set(a || []); for (const i of b) s.delete(i); return s; } return new Set(b); };
  M.selCells = (m, sel) => [...sel].filter((i) => i >= 0 && i < m.w * m.h).map((i) => [i % m.w, Math.floor(i / m.w)]);
  M.selBounds = (m, sel) => { const cs = M.selCells(m, sel || []); if (!cs.length) return null; let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1; for (const [x, y] of cs) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  /* the cells of a selection that touch the outside of it (its border, or the edge of the level) */
  M.selEdge = (m, sel) => { const s = new Set(); for (const [x, y] of M.selCells(m, sel)) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inMap(m, x + dx, y + dy) || !sel.has((y + dy) * m.w + x + dx))) s.add(y * m.w + x); return s; };
  /* what is at a cell: the tile on layer li; if that is empty, the first tile found on the layers below (then the ones above),
     the same search the eyedropper uses. -> { li, id } (id 0 = nothing on any layer) */
  M.findTile = (cart, id, li, x, y) => {
    const m = cart.maps[id], n = m.layers.length; if (!inMap(m, x, y)) return { li, id: 0 };
    for (let k = 0, l = li; k < n; k++, l = (l + n - 1) % n) { const t = parseInt(m.layers[l].rows[y].substr(x * 2, 2), 36); if (t) return { li: l, id: t }; }
    return { li, id: 0 };
  };
  /* every cell of layer li holding the same tile as (x, y): everywhere in the level (the wand) */
  M.selSame = (cart, id, li, x, y) => { const m = cart.maps[id]; if (!inMap(m, x, y)) return new Set(); const ids = M.layerIds(cart, id, li), t = ids[y * m.w + x], s = new Set(); for (let i = 0; i < ids.length; i++) if (ids[i] === t) s.add(i); return s; };
  /* only the touching patch of that tile */
  M.selConnected = (cart, id, li, x, y) => { const m = cart.maps[id]; return new Set(M.flood(cart, id, li, x, y).map(([cx, cy]) => cy * m.w + cx)); };
  M.layersFor = (m, li, all, hidden) => (all ? m.layers.map((_, i) => i).filter((i) => !(hidden && hidden.has(i))) : [li]);
  /* paint one tile over a selection (tile 0 deletes) on the given layers: one undo step */
  M.fillSel = (doc, id, lis, sel, tile, label) => {
    const m = doc.cart.maps[id], cells = M.selCells(m, sel).map(([x, y]) => ({ x, y, id: tile })); let n = 0;
    doc.transact(label || (tile ? 'Fill selection' : 'Delete'), () => { for (const li of lis) n += M.setCells(doc, id, li, cells, label || (tile ? 'Fill selection' : 'Delete')); });
    return n;
  };
  /* scatter a tile over ~density (0..1) of the selection, seeded so it is repeatable */
  M.sprinkle = (doc, id, lis, sel, tile, density, seed) => {
    const m = doc.cart.maps[id]; let t = (seed >>> 0) || 1; const rnd = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    const cells = M.selCells(m, sel).filter(() => rnd() < density).map(([x, y]) => ({ x, y, id: tile })); let n = 0;
    doc.transact('Sprinkle', () => { for (const li of lis) n += M.setCells(doc, id, li, cells, 'Sprinkle'); });
    return n;
  };
  /* ---- clipboard. { tileset, w, h, abs, layers: [{ li, ids }] } with ids -1 = not selected, 0 = selected but empty.
     abs: the layers are fixed (copied from several layers, or a move); otherwise it lands on whichever layer is current. */
  M.copy = (cart, id, sel, lis, abs) => {
    const m = cart.maps[id], b = M.selBounds(m, sel); if (!b) return null;
    const layers = lis.map((li) => { const ids = M.layerIds(cart, id, li), out = new Array(b.w * b.h).fill(-1); for (const [x, y] of M.selCells(m, sel)) out[(y - b.y) * b.w + (x - b.x)] = ids[y * m.w + x]; return { li, ids: out }; });
    return { tileset: m.tileset, w: b.w, h: b.h, abs: !!abs || lis.length > 1, layers };
  };
  const mapClip = (c, f) => ({ tileset: c.tileset, w: c.w, h: c.h, abs: c.abs, layers: c.layers.map((L) => ({ li: L.li, ids: f(L.ids, c.w, c.h) })) });
  M.clipFlipH = (c) => mapClip(c, (ids, w, h) => ids.map((_, k) => ids[Math.floor(k / w) * w + (w - 1 - (k % w))]));
  M.clipFlipV = (c) => mapClip(c, (ids, w, h) => ids.map((_, k) => ids[(h - 1 - Math.floor(k / w)) * w + (k % w)]));
  /* the cells a clipboard covers when its top-left is at (x, y) */
  M.clipCells = (m, c, x, y) => { const s = new Set(); for (const L of c.layers) for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) if (L.ids[j * c.w + i] >= 0 && inMap(m, x + i, y + j)) s.add((y + j) * m.w + x + i); return s; };
  /* put a clipboard down with its top-left at (x, y). Empty cells in it leave what is underneath alone. Runs inside the caller's undo step. */
  M.pasteRaw = (doc, id, c, x, y, curLayer) => {
    const m = doc.cart.maps[id]; let n = 0;
    for (const L of c.layers) {
      const li = c.abs ? L.li : curLayer, cells = []; if (!m.layers[li]) continue;
      for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const v = L.ids[j * c.w + i]; if (v > 0) cells.push({ x: x + i, y: y + j, id: v }); }
      n += M.setCells(doc, id, li, cells, 'Paste');
    }
    return n;
  };
  M.paste = (doc, id, c, x, y, curLayer, label) => {
    if (c.tileset !== doc.cart.maps[id].tileset) throw new Error('That was copied from a level with a different set of tiles.');
    let n = 0; doc.transact(label || 'Paste', () => { n = M.pasteRaw(doc, id, c, x, y, curLayer); }); return n;
  };
  /* pick the selection up and put it down offset by (dx, dy): clears where it was, then pastes. One undo step. */
  M.moveSel = (doc, id, sel, lis, dx, dy) => {
    const m = doc.cart.maps[id], b = M.selBounds(m, sel); if (!b) return 0; let n = 0;
    const clip = M.copy(doc.cart, id, sel, lis, true);
    doc.transact('Move', () => { for (const li of lis) M.setCells(doc, id, li, M.selCells(m, sel).map(([x, y]) => ({ x, y, id: 0 })), 'Move'); n = M.pasteRaw(doc, id, clip, b.x + dx, b.y + dy, lis[0]); });
    return n;
  };
  /* put a floating clipboard down, first clearing the place it was lifted from (lift = { sel, lis }). One undo step. */
  M.placeFloat = (doc, id, f, curLayer) => {
    const m = doc.cart.maps[id]; if (f.clip.tileset !== m.tileset) throw new Error('That was copied from a level with a different set of tiles.');
    let n = 0;
    doc.transact(f.lift ? 'Move' : 'Paste', () => {
      if (f.lift) for (const li of f.lift.lis) M.setCells(doc, id, li, M.selCells(m, f.lift.sel).map(([x, y]) => ({ x, y, id: 0 })), 'Move');
      n = M.pasteRaw(doc, id, f.clip, f.x, f.y, curLayer);
    });
    return n;
  };
  M.resize = (doc, id, w, h) => doc.transact('Resize map', () => {
    const m = doc.cart.maps[id];
    m.layers.forEach((L, li) => {
      const ids = DC2.decodeRows(L.rows, m.w), out = new Array(w * h).fill(0);
      for (let y = 0; y < Math.min(h, m.h); y++) for (let x = 0; x < Math.min(w, m.w); x++) out[y * w + x] = ids[y * m.w + x];
      doc.set(['maps', id, 'layers', li, 'rows'], DC2.encodeRows(out, w, h));
    });
    doc.set(['maps', id, 'w'], w); doc.set(['maps', id, 'h'], h);
  });
  M.addLayer = (doc, id, name, collide) => { const m = doc.cart.maps[id]; doc.insert(['maps', id, 'layers'], null, Object.assign({ name: name || 'layer ' + (m.layers.length + 1) }, collide ? { collide: true } : {}, { rows: DC2.encodeRows(new Array(m.w * m.h).fill(0), m.w, m.h) }), 'Add layer'); return m.layers.length - 1; };
  M.removeLayer = (doc, id, li) => { if (doc.cart.maps[id].layers.length > 1) doc.remove(['maps', id, 'layers'], li, 'Remove layer'); };
  M.uniqueName = (m, base) => { const names = new Set((m.objects || []).map((o) => o.name).filter(Boolean)); let n = 1, s = base; while (names.has(s)) s = base + ++n; return s; };
  M.addObject = (doc, id, obj) => { const m = doc.cart.maps[id]; doc.insert(['maps', id, 'objects'], null, obj, 'Place'); return m.objects.length - 1; };
  M.removeObject = (doc, id, i) => doc.remove(['maps', id, 'objects'], i, 'Delete');
  M.moveObject = (doc, id, i, x, y) => doc.transact('Move', () => { doc.set(['maps', id, 'objects', i, 'x'], x); doc.set(['maps', id, 'objects', i, 'y'], y); });
  M.tileSize = (cart, id) => cart.tilesets[cart.maps[id].tileset].tileSize;
  /* a new level = a map + a scene, laid out like an existing map (same tileset and layer names) */
  S.addLevel = (doc, name, w, h, like) => doc.transact('New level', () => {
    const cart = doc.cart, id = S.slug(name, cart.maps), src = cart.maps[like] || Object.values(cart.maps)[0];
    const layers = (src ? src.layers : [{ name: 'ground' }, { name: 'walls', collide: true }]).map((L) => Object.assign({ name: L.name }, L.collide ? { collide: true } : {}, { rows: DC2.encodeRows(new Array(w * h).fill(0), w, h) }));
    const objects = []; const ts = src ? cart.tilesets[src.tileset].tileSize : 16;
    if (cart.meta.player) objects.push({ prefab: cart.meta.player, name: 'start', x: ts * 2.5, y: ts * 2.5 });
    doc.set(['maps', id], { w, h, tileset: src ? src.tileset : Object.keys(cart.tilesets)[0], layers, objects }, 'New map');
    const sid = S.slug(name, cart.scenes);
    const like2 = cart.scenes[Object.keys(cart.scenes).find((k) => cart.scenes[k].map === like)] || {};
    doc.set(['scenes', sid], Object.assign({}, like2.hud ? { hud: clone(like2.hud) } : {}, { map: id }), 'New scene');
    return { map: id, scene: sid };
  });

  /* ------------------------------------------------- walking every reference in a cart */
  function visit(sp, v, path, cx, cb) {
    sp = DC2.spec(sp);
    if (v === undefined || v === null) return;
    switch (sp.type) {
      case 'ref': if (typeof v === 'string') cb({ path, kind: sp.to, id: v }); break;
      case 'list': if (Array.isArray(v)) v.forEach((x, i) => visit(sp.of || 'any', x, [...path, i], cx, cb)); break;
      case 'object': if (isObj(v)) for (const k of Object.keys(sp.fields || {})) visit(sp.fields[k], v[k], [...path, k], cx, cb); break;
      case 'actions': if (Array.isArray(v)) v.forEach((a, i) => { const d = a && cx.reg.actions[a.act]; if (d) for (const k of Object.keys(d._specs)) visit(d._specs[k], a[k], [...path, i, k], cx, cb); }); break;
      default: break;
    }
  }
  function visitRules(rules, path, cx, cb) {
    (rules || []).forEach((r, i) => {
      const t = r && cx.reg.triggers[r.on]; if (!t) return;
      for (const k of Object.keys(t._specs)) visit(t._specs[k], r[k], [...path, i, k], cx, cb);
      visit('actions', r.then, [...path, i, 'then'], cx, cb); visit('actions', r.else, [...path, i, 'else'], cx, cb);
    });
  }
  S.refs = (cart, reg) => {
    const out = [], cb = (r) => out.push(r), cx = { reg };
    if (cart.meta) { if (cart.meta.start) cb({ path: ['meta', 'start'], kind: 'scene', id: cart.meta.start }); if (cart.meta.player) cb({ path: ['meta', 'player'], kind: 'prefab', id: cart.meta.player }); }
    for (const [id, s] of Object.entries(cart.sprites || {})) if (s.palette) cb({ path: ['sprites', id, 'palette'], kind: 'palette', id: s.palette });
    for (const [id, t] of Object.entries(cart.tilesets || {})) {
      if (t.sprite) cb({ path: ['tilesets', id, 'sprite'], kind: 'sprite', id: t.sprite });
      for (const [n, d] of Object.entries(t.tiles || {})) if (d && d.sprite) cb({ path: ['tilesets', id, 'tiles', n, 'sprite'], kind: 'sprite', id: d.sprite });
    }
    for (const [id, m] of Object.entries(cart.maps || {})) {
      cb({ path: ['maps', id, 'tileset'], kind: 'tileset', id: m.tileset });
      (m.objects || []).forEach((o, i) => {
        if (o.prefab) cb({ path: ['maps', id, 'objects', i, 'prefab'], kind: 'prefab', id: o.prefab });
        for (const [cn, cv] of Object.entries(o.c || {})) { const d = reg.components[cn]; if (d) visit({ type: 'object', fields: d.fields }, cv, ['maps', id, 'objects', i, 'c', cn], cx, cb); }
      });
    }
    for (const [id, p] of Object.entries(cart.prefabs || {})) {
      for (const [cn, cv] of Object.entries(p.c || {})) { const d = reg.components[cn]; if (d) visit({ type: 'object', fields: d.fields }, cv, ['prefabs', id, 'c', cn], cx, cb); }
      visitRules(p.rules, ['prefabs', id, 'rules'], cx, cb);
    }
    for (const [id, s] of Object.entries(cart.scenes || {})) { if (s.map) cb({ path: ['scenes', id, 'map'], kind: 'map', id: s.map }); visitRules(s.rules, ['scenes', id, 'rules'], cx, cb); }
    visitRules(cart.rules, ['rules'], cx, cb);
    return out;
  };
  S.usage = (cart, reg, kind, id) => S.refs(cart, reg).filter((r) => r.kind === kind && r.id === id);
  /* rename an asset and every reference to it, as ONE undo step */
  S.renameAsset = (doc, kind, oldId, newId) => {
    const cart = doc.cart, coll = REFS[kind] || kind;
    if (!cart[coll] || !hasOwn(cart[coll], oldId)) throw new Error(`There is no ${kind} "${oldId}".`);
    if (!/^[A-Za-z0-9_-]+$/.test(newId)) throw new Error('Use letters, numbers, - and _ only.');
    if (hasOwn(cart[coll], newId)) throw new Error(`A ${kind} called "${newId}" already exists.`);
    const { reg } = DC2.registryFor(cart);
    doc.transact('Rename', () => {
      const uses = S.usage(cart, reg, kind, oldId);
      doc.set([coll, newId], cart[coll][oldId]); doc.del([coll, oldId]);
      for (const u of uses) doc.set(u.path, newId);
    });
  };
  S.deleteAsset = (doc, kind, id) => { const coll = REFS[kind] || kind; doc.del([coll, id], 'Delete ' + kind); };

  /* ---------------------------------------------------------- form descriptors */
  const LABELS = { x: 'X', y: 'Y', w: 'Width', h: 'Height', ox: 'Offset X', oy: 'Offset Y', dx: 'Move X', dy: 'Move Y', vx: 'Speed X', vy: 'Speed Y', hp: 'Health', max: 'Max health', fps: 'Frames per second', t: 'Seconds', g: 'Gravity', id: 'Picture', ai: 'Brain', c: 'Parts', v: 'Values', invuln: 'Safe time after a hit (s)', anim: 'Animation', auto: 'Automatic', dir: 'Direction', oneway: 'Jump-through', sensor: 'Passes through (only detects touches)', blocked: 'Blocked by walls', entertile: 'Enters a tile', leavetile: 'Leaves a tile', effect: 'Effect (play a picture once)', setsprite: 'Change picture', sink: 'Sink (hide bottom pixels)', follow: 'Follow', ontile: 'On tile' };
  const humanize = (k) => hasOwn(LABELS, k) ? LABELS[k] : String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  S.humanize = humanize;
  S.describe = (sp, key, cx) => {
    sp = DC2.spec(sp);
    const d = { key, label: sp.label || humanize(key), doc: sp.doc || '', optional: !!sp.optional, required: !!sp.required, default: sp.default, runtime: !!sp.runtime };
    switch (sp.type) {
      case 'number': return Object.assign(d, { kind: 'number', min: sp.min, max: sp.max });
      case 'int': return Object.assign(d, { kind: 'int', min: sp.min, max: sp.max });
      case 'bool': return Object.assign(d, { kind: 'bool' });
      case 'string': case 'text': return Object.assign(d, { kind: 'text' });
      case 'expr': return Object.assign(d, { kind: 'expr' });
      case 'path': return Object.assign(d, { kind: 'path' });
      case 'enum': return Object.assign(d, { kind: 'enum', options: sp.values });
      case 'ref': return Object.assign(d, { kind: 'ref', to: sp.to, options: Object.keys((cx && cx.cart && cx.cart[REFS[sp.to]]) || {}) });
      case 'list': return Object.assign(d, { kind: 'list', of: S.describe(sp.of || 'any', 'item', cx) });
      case 'object': return Object.assign(d, { kind: 'object', fields: Object.entries(sp.fields || {}).map(([k, s]) => S.describe(s, k, cx)).filter((f) => !f.runtime) });
      case 'actions': return Object.assign(d, { kind: 'actions' });
      case 'custom': return Object.assign(d, { kind: sp.editor || 'json' });
      default: return Object.assign(d, { kind: 'json' });
    }
  };
  S.describeComponent = (name, cx) => { const def = cx.reg.components[name]; return def ? Object.assign(S.describe({ type: 'object', fields: def.fields }, name, cx), { label: humanize(name), doc: def.doc, needs: def.needs }) : null; };
  S.describeAction = (name, cx) => { const def = cx.reg.actions[name]; return def ? { name, label: humanize(name), doc: def.doc || '', fields: Object.entries(def._specs).map(([k, s]) => S.describe(s, k, cx)) } : null; };
  S.describeTrigger = (name, cx) => { const def = cx.reg.triggers[name]; return def ? { name, label: humanize(name), doc: def.doc || '', owners: def.owners || null, requiresIf: !!def.requiresIf, fields: Object.entries(def._specs).map(([k, s]) => S.describe(s, k, cx)) } : null; };
  /* the blank value for a newly added item of this kind */
  S.blankValue = (d, cx) => {
    if (d.default !== undefined) return clone(d.default);
    switch (d.kind) {
      case 'number': case 'int': return d.min != null ? d.min : 0;
      case 'bool': return false;
      case 'text': case 'path': return '';
      case 'expr': return '0';
      case 'enum': return d.options[0];
      case 'ref': return d.options[0] || '';
      case 'list': return [];
      case 'actions': return [];
      case 'object': { const o = {}; for (const f of d.fields) if (!f.optional && (f.required || f.default === undefined)) o[f.key] = S.blankValue(f, cx); return o; }
      default: return null;
    }
  };
  S.blankAction = (name, cx) => { const a = { act: name }, d = S.describeAction(name, cx); for (const f of d.fields) if (!f.optional && f.default === undefined) a[f.key] = f.kind === 'actions' ? [] : S.blankValue(f, cx); return a; };
  S.blankRule = (trigger, cx) => { const r = { on: trigger }, d = S.describeTrigger(trigger, cx); for (const f of d.fields) if (!f.optional && f.default === undefined) r[f.key] = S.blankValue(f, cx); if (d.requiresIf) r.if = 'true'; r.then = []; return r; };
  /* names the user may pick for a variable/expression */
  S.suggest = (cart, reg, prefabId) => {
    const vars = [], flat = (o, pre) => { for (const k of Object.keys(o)) { if (isObj(o[k])) flat(o[k], pre + k + '.'); else vars.push(pre + k); } };
    flat(cart.vars || {}, '');
    const self = [], p = prefabId && cart.prefabs[prefabId];
    if (p) { for (const [cn, cv] of Object.entries(p.c || {})) { const d = reg.components[cn]; for (const f of Object.keys(d ? d.fields : cv)) self.push(`self.${cn}.${f}`); } for (const k of Object.keys(p.v || {})) self.push('self.' + k); }
    return { vars, self, other: ['other.pos.x', 'other.pos.y', 'other.vel.y', 'other.health.hp'], builtin: ['player', 'time', 'frame', 'scene'] };
  };
  /* ---- turning a picture into things */
  /* the box around a sprite's visible pixels (all frames), for a body that fits the drawing */
  /* a new thing (prefab) that shows this picture, with a body the size of the drawing; returns its name */
  S.thingFromSprite = (doc, spriteId, name) => {
    const cart = doc.cart, d = cart.sprites[spriteId]; if (!d) throw new Error('No sprite "' + spriteId + '".');
    const id = S.slug(name || spriteId, cart.prefabs), b = S.sprite.bounds(d), an = d.anims || {};
    const bw = Math.max(2, Math.round(b.w * 0.8)), bh = Math.max(2, Math.round(b.h * 0.8));
    const sprite = { id: spriteId }; if (!an.walk && !an.walk_side && !an.walk_down) sprite.auto = false;
    const oy = Math.round((b.y + b.h / 2) - d.h / 2), ox = Math.round((b.x + b.w / 2) - d.w / 2); if (oy) sprite.oy = -oy; if (ox) sprite.ox = -ox;
    doc.transact('New thing from picture', () => { doc.set(['prefabs', id], { tags: [], c: { pos: {}, body: { w: bw, h: bh }, sprite } }); S.ensureExt(doc, 'space2d'); S.ensureExt(doc, 'sprite'); });
    return id;
  };
  /* give an existing thing this picture (adds the Sprite part if it has none) */
  S.setThingSprite = (doc, prefabId, spriteId) => {
    const p = doc.cart.prefabs[prefabId]; if (!p) return;
    doc.transact('Change picture', () => {
      if (!p.c || !p.c.pos) doc.set(['prefabs', prefabId, 'c', 'pos'], {});
      if (p.c.sprite) { doc.set(['prefabs', prefabId, 'c', 'sprite', 'id'], spriteId); const a = p.c.sprite.anim; if (a && !(doc.cart.sprites[spriteId].anims || {})[a]) doc.del(['prefabs', prefabId, 'c', 'sprite', 'anim']); }
      else doc.set(['prefabs', prefabId, 'c', 'sprite'], { id: spriteId, auto: false });
      S.ensureExt(doc, 'space2d'); S.ensureExt(doc, 'sprite');
    });
  };
  /* make an existing picture a tile (it must be the tile size); returns the tile number */
  S.tileFromSprite = (doc, spriteId, tsId) => {
    const cart = doc.cart, t = cart.tilesets[tsId], d = cart.sprites[spriteId];
    if (!t || !d) throw new Error('Nothing to make a tile from.');
    if (d.w !== t.tileSize || d.h !== t.tileSize) throw new Error(`Tiles are ${t.tileSize}×${t.tileSize}; this picture is ${d.w}×${d.h}. Make a copy and resize it first.`);
    const had = S.tileOfSprite(cart, spriteId); if (had) return had.n;
    const n = Math.max(0, ...DC2.tileIds(cart, tsId)) + 1;
    doc.set(['tilesets', tsId, 'tiles', String(n)], { name: spriteId, sprite: spriteId }, 'Make tile');
    return n;
  };
  /* Every tag in the project, for pickers: on things (prefabs) and on tiles. */
  S.allTags = (cart) => {
    const things = new Map(), tiles = new Map();
    for (const [id, p] of Object.entries(cart.prefabs || {})) for (const t of p.tags || []) { if (!things.has(t)) things.set(t, []); things.get(t).push(id); }
    for (const [tsId, ts] of Object.entries(cart.tilesets || {})) for (const [n, d] of Object.entries(ts.tiles || {})) for (const t of (d && d.tags) || []) { if (!tiles.has(t)) tiles.set(t, []); tiles.get(t).push({ tileset: tsId, n: +n, name: d.name || 'tile ' + n, sprite: d.sprite }); }
    return { things: [...things].map(([tag, by]) => ({ tag, by })).sort((a, b) => a.tag.localeCompare(b.tag)), tiles: [...tiles].map(([tag, by]) => ({ tag, by })).sort((a, b) => a.tag.localeCompare(b.tag)) };
  };
  /* Which animations an animation field can name, as [{ sprite, names }]. parent is the object holding the field:
     a picture next to it (sprite / id) wins; else the thing the "Play animation" action targets; else every picture. */
  S.animChoices = (cart, prefabId, parent) => {
    const of = (sid) => (sid && cart.sprites[sid] ? [{ sprite: sid, names: Object.keys(cart.sprites[sid].anims || {}) }] : []);
    const spriteOf = (pid) => { const p = cart.prefabs[pid]; return p && p.c && p.c.sprite && p.c.sprite.id; };
    parent = parent || {};
    if (parent.sprite || (parent.id && cart.sprites[parent.id])) return of(parent.sprite || parent.id);
    const t = parent.target || 'self';
    let sids = [];
    if (t === 'self') sids = [spriteOf(prefabId)];
    else if (t === 'player') sids = [spriteOf((cart.meta || {}).player)];
    else if (t !== 'other') sids = Object.keys(cart.prefabs || {}).filter((k) => k === t || (cart.prefabs[k].tags || []).includes(t)).map(spriteOf);
    sids = [...new Set(sids.filter((x) => x && cart.sprites[x]))];
    if (!sids.length) sids = Object.keys(cart.sprites || {}).filter((k) => Object.keys(cart.sprites[k].anims || {}).length > 1 || !S.tileSpriteIds(cart).has(k));
    return sids.flatMap(of).filter((g) => g.names.length);
  };
  /* What a path like "self.ai.mode" or "coins" holds, so the picker can offer the right values for it. */
  S.pathSpec = (cart, reg, prefabId, pathStr) => {
    const parts = String(pathStr || '').trim().split('.'); if (!parts[0]) return null;
    const root = parts[0], pf = root === 'self' ? cart.prefabs[prefabId] : root === 'player' ? cart.prefabs[(cart.meta || {}).player] : null;
    if (root === 'self' || root === 'other' || root === 'player') {
      const cn = parts[1], f = parts[2], comp = reg.components[cn];
      if (comp && f && comp.fields[f]) { const sp = comp.fields[f]; if (cn === 'sprite' && f === 'anim') { const sid = pf && pf.c && pf.c.sprite && pf.c.sprite.id; return { type: 'anim', sprite: sid }; } return sp; }
      if (pf && pf.v && cn in pf.v && parts.length === 2) { const v = pf.v[cn]; return { type: typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'number' : 'string' }; }
      return null;
    }
    let v = cart.vars || {}; for (const k of parts) v = isObj(v) ? v[k] : undefined;
    return v === undefined ? null : { type: typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'number' : 'string' };
  };
  /* Everything a formula or variable field could want, grouped, most relevant first. o = { prefabId, kind: 'expr'|'path', target: spec } */
  S.pickItems = (cart, reg, o) => {
    const items = [], add = (group, id, title, doc, thumb) => items.push({ group, id, title: title || id, doc, thumb });
    const lit = (x) => `'${String(x).replace(/'/g, "\\'")}'`, t = o.target, expr = o.kind !== 'path';
    const compFields = (pf, root, runtimeToo) => { const out = []; for (const [cn, cv] of Object.entries((pf && pf.c) || {})) { const d = reg.components[cn]; for (const [f, sp] of Object.entries(d ? d.fields : cv)) if (runtimeToo || !(sp && sp.runtime)) out.push(`${root}.${cn}.${f}`); } for (const k of Object.keys((pf && pf.v) || {})) out.push(`${root}.${k}`); return out; };
    const tileTags = [...new Set(Object.values(cart.tilesets || {}).flatMap((ts) => Object.values(ts.tiles || {}).flatMap((d) => (d && d.tags) || [])))];
    /* 1. the values this particular thing can be set to */
    if (t && expr) {
      const tp = t.type === 'ref' ? 'ref:' + t.to : t.type || '';   // registry specs say {type:'ref', to:'sprite'}
      if (tp === 'bool') { add('Choices', 'true', 'true', 'on / yes'); add('Choices', 'false', 'false', 'off / no'); }
      if (tp === 'enum') for (const v of t.values || []) add('Choices', lit(v), v);
      if (tp === 'ref:sprite') for (const id of Object.keys(cart.sprites || {})) add('Pictures', lit(id), id, null, id);
      if (tp === 'ref:prefab') for (const id of Object.keys(cart.prefabs || {})) add('Things', lit(id), id);
      if (tp === 'ref:scene') for (const id of Object.keys(cart.scenes || {})) add('Scenes', lit(id), id);
      if (tp === 'ref:sound') for (const id of Object.keys(cart.sounds || {})) add('Sounds', lit(id), id);
      if (tp === 'anim') { const ids = t.sprite ? [t.sprite] : Object.keys(cart.sprites || {}); for (const sid of ids) for (const a of Object.keys((cart.sprites[sid] || {}).anims || {})) if (!items.some((i) => i.id === lit(a))) add('Animations', lit(a), a, t.sprite ? null : sid); }
    }
    /* 2. variables and parts of things */
    const flat = (obj, pre) => { for (const k of Object.keys(obj || {})) { if (isObj(obj[k])) flat(obj[k], pre + k + '.'); else add('Game variables', pre + k); } };
    flat(cart.vars, '');
    const me = cart.prefabs[o.prefabId];
    if (me) { for (const p of compFields(me, 'self', true)) add('This thing', p); if (expr) { for (const b of ['self.facing.x', 'self.facing.y', 'self.grounded', 'self.alive']) add('This thing', b); for (const tg of tileTags) add('This thing', `self.ontile.${tg}`, null, 'standing on a tile tagged ' + tg); } }
    const pl = cart.prefabs[(cart.meta || {}).player];
    if (pl && o.prefabId !== (cart.meta || {}).player) for (const p of compFields(pl, 'player', true)) add('The player', p);
    const others = new Set(); for (const pf of Object.values(cart.prefabs || {})) for (const p of compFields(pf, 'other', true)) if (!/\.(t|rs|sees|state)$/.test(p) || /^other\.(vision)/.test(p)) others.add(p);
    for (const p of [...others].sort()) add('The other thing', p, null, 'the one touched, talked to, or that did the hitting');
    /* 3. formula helpers */
    if (expr) {
      for (const [f, d] of [['dist(self, player)', 'distance to the player'], ["count('enemy')", 'how many things have a tag'], ['chance(0.5)', 'true half the time'], ['randint(1, 6)', 'a random whole number'], ['rand()', 'random 0..1'], ['min(a, b)', ''], ['max(a, b)', ''], ['abs(x)', ''], ['floor(x)', ''], ['clamp(x, 0, 10)', '']]) add('Formulas', f, f, d);
      for (const b of ['time', 'frame', 'scene']) add('Formulas', b, b, { time: 'seconds since the game started', frame: 'frames since the game started', scene: 'name of the current scene' }[b]);
      const tags = new Set(); for (const pf of Object.values(cart.prefabs || {})) for (const tg of pf.tags || []) tags.add(tg);
      for (const tg of tags) add('Tags (as words)', lit(tg), tg);
    }
    return items;
  };
  /* tile properties are stored in the tileset, described here so they get a form too */
  S.tileSpec = { type: 'object', fields: { name: { type: 'string', optional: true }, solid: { type: 'bool', default: false, doc: 'blocks movement' }, oneway: { type: 'bool', default: false, doc: 'can be jumped up through' },
    tags: { type: 'list', of: { type: 'string' }, optional: true, doc: 'words rules can check, like "water": a "Touches" rule with that tag fires when something walks onto it (also "Enters a tile", or self.ontile.water)' },
    anim: { type: 'string', optional: true, label: 'Animation', doc: 'which of its picture\'s animations it plays (default: idle, else the first)' } } };

  /* ---- tiles as their own sprites. Older carts keep every tile as a frame of one sheet sprite; this gives each tile its
     own sprite (named after the tile) so it shows up, and can be animated, on its own. Mutates cart; true if changed. */
  S.splitTileSheet = (cart) => {
    let changed = false;
    for (const [tsId, t] of Object.entries(cart.tilesets || {})) {
      const sheet = t.sprite && cart.sprites[t.sprite]; if (!sheet) { if (t.sprite !== undefined && !cart.sprites[t.sprite]) { delete t.sprite; changed = true; } continue; }
      t.tiles = t.tiles || {};
      sheet.frames.forEach((fr, i) => {
        const n = String(i + 1), d = t.tiles[n] || (t.tiles[n] = {}); if (d.sprite) return;
        const id = S.slug((d.name || 'tile ' + n), cart.sprites);
        cart.sprites[id] = { w: sheet.w, h: sheet.h, palette: sheet.palette, frames: [fr], anims: { idle: { f: [0], fps: 4 } } };
        d.sprite = id; if (!d.name) d.name = id;
      });
      const old = t.sprite; delete t.sprite; changed = true;
      const still = Object.values(cart.tilesets).some((o) => o.sprite === old) || Object.values(cart.prefabs || {}).some((p) => p.c && p.c.sprite && p.c.sprite.id === old) || JSON.stringify(cart.prefabs || {}).includes('"' + old + '"');
      if (!still) delete cart.sprites[old];
    }
    return changed;
  };
  /* Older projects: a melee swing (a short-lived thing spawned "ahead" by a rule) was left behind where it appeared and
     always pointed right. Make such swings stick to whoever swung (attach) and turn with them. Mutates; true if changed. */
  S.upgradeSwings = (cart) => {
    let changed = false;
    const swing = (name) => { const p = cart.prefabs[name]; return p && p.c && p.c.lifetime && +(p.c.lifetime.t) <= 0.5 && !p.c.vel && !p.c.mover; };
    const walk = (list) => { for (const a of list || []) { if (!a || typeof a !== 'object') continue;
      if (a.act === 'spawn' && a.attach === undefined && a.ahead && swing(a.prefab)) {
        a.attach = true; changed = true;
        const sp = cart.prefabs[a.prefab].c.sprite, def = sp && cart.sprites[sp.id];
        if (sp && sp.turn === undefined && def && Object.keys(def.anims || { idle: 1 }).length <= 1) sp.turn = true;   // one picture, not drawn per direction
      }
      walk(a.then); walk(a.else); } };
    for (const p of Object.values(cart.prefabs || {})) for (const r of p.rules || []) { walk(r.then); walk(r.else); }
    return changed;
  };
  S.needsUpgrade = (cart) => S.needsTileSplit(cart) || S.upgradeSwings(S.clone(cart));
  S.upgrade = (cart) => { const a = S.splitTileSheet(cart), b = S.upgradeSwings(cart); return a || b; };
  S.needsTileSplit = (cart) => Object.values(cart.tilesets || {}).some((t) => t.sprite !== undefined);
  S.tileSpriteIds = (cart) => new Set(Object.values(cart.tilesets || {}).flatMap((t) => Object.values(t.tiles || {}).map((d) => d && d.sprite).filter(Boolean)));
  /* a new blank tile (its own sprite) in a tileset; returns { n, sprite } */
  S.addTile = (doc, tsId, name, from) => {
    const cart = doc.cart, t = cart.tilesets[tsId], ts = t.tileSize, n = Math.max(0, ...DC2.tileIds(cart, tsId)) + 1;
    if (n > 1295) throw new Error('A tileset can hold at most 1295 tiles.');
    const id = S.slug(name || 'tile ' + n, cart.sprites), pal = Object.keys(cart.palettes)[0];
    const sprite = from && cart.sprites[from] ? S.clone(cart.sprites[from]) : { w: ts, h: ts, palette: pal, frames: [Array(ts).fill('.'.repeat(ts)).join('/')], anims: { idle: { f: [0], fps: 4 } } };
    doc.transact('New tile', () => { doc.set(['sprites', id], sprite); doc.set(['tilesets', tsId, 'tiles', String(n)], { name: id, sprite: id }); });
    return { n, sprite: id };
  };
  S.tileOfSprite = (cart, spriteId) => { for (const [tsId, t] of Object.entries(cart.tilesets || {})) for (const [n, d] of Object.entries(t.tiles || {})) if (d && d.sprite === spriteId) return { tsId, n: +n }; return null; };

  /* ------------------------------------------------------------------ recipes */
  /* A recipe is a ready-made "thing". Adding one also switches on the extensions it needs and declares its variables. */
  const first = (cart, ids) => ids.find((i) => cart.sprites && cart.sprites[i]) || Object.keys(cart.sprites || {})[0] || 'missing';
  const snd = (cart, id) => (cart.sounds && cart.sounds[id] ? [{ act: 'sound', id }] : []);
  const R = (S.recipes = [
    { id: 'slash', title: 'Sword swing', group: 'Parts', doc: 'The short-lived hitbox a player swings. Used by the players.', requires: ['space2d', 'sprite', 'combat'], hidden: true,
      make: (cx) => ({ doc: 'a short-lived hitbox in front of the player', c: { pos: {}, body: { w: 14, h: 14, blocked: false, sensor: true }, sprite: { id: first(cx.cart, ['slash']), layer: 1, auto: false, turn: true }, lifetime: { t: 0.16 } }, rules: [{ on: 'touch', with: 'enemy', then: [{ act: 'damage', target: 'other', amount: 1, knockback: 120 }] }] }) },
    { id: 'player-side', title: 'Player (side view)', group: 'Players', doc: 'Runs and jumps. B swings a sword.', requires: ['space2d', 'topdown', 'platformer', 'sprite', 'combat'], deps: ['slash'], player: true,
      make: (cx) => ({ tags: ['player'], carry: ['health'], c: { pos: {}, vel: {}, body: { w: 10, h: 15 }, gravity: {}, platformer: { speed: 92, jump: 300 }, sprite: { id: first(cx.cart, ['hero']) }, health: { hp: 6, max: 6, invuln: 1 } },
        rules: [{ on: 'button', button: 'b', cooldown: 0.3, then: [{ act: 'spawn', prefab: cx.name('slash'), ahead: 12, attach: true }, ...snd(cx.cart, 'sword'), { act: 'anim', name: 'attack', lock: 0.2 }] },
          { on: 'hit', then: [...snd(cx.cart, 'hurt'), { act: 'shake', t: 0.2 }] },
          { on: 'die', doc: 'get back up and start the level again', then: [{ act: 'keepAlive' }, { act: 'set', path: 'self.health.hp', to: 'self.health.max' }, { act: 'goto', scene: cx.cart.meta.start }] }] }) },
    { id: 'player-top', title: 'Player (top-down)', group: 'Players', doc: 'Walks in four directions. B swings a sword.', requires: ['space2d', 'topdown', 'sprite', 'combat'], deps: ['slash'], player: true,
      make: (cx) => ({ tags: ['player'], carry: ['health'], c: { pos: {}, vel: {}, body: { w: 10, h: 8 }, topdown: { speed: 72 }, sprite: { id: first(cx.cart, ['hero']), oy: -4 }, health: { hp: 6, max: 6, invuln: 1 } },
        rules: [{ on: 'button', button: 'b', cooldown: 0.3, then: [{ act: 'spawn', prefab: cx.name('slash'), ahead: 12, attach: true }, ...snd(cx.cart, 'sword'), { act: 'anim', name: 'attack', lock: 0.2 }] },
          { on: 'hit', then: [...snd(cx.cart, 'hurt'), { act: 'shake', t: 0.2 }] },
          { on: 'die', then: [{ act: 'keepAlive' }, { act: 'set', path: 'self.health.hp', to: 'self.health.max' }, { act: 'goto', scene: cx.cart.meta.start }] }] }) },
    { id: 'coin', title: 'Coin', group: 'Pickups', doc: 'Touch it to collect it.', requires: ['space2d', 'sprite'], vars: { coins: 0 },
      make: (cx) => ({ doc: 'a pickup is a body plus one rule', c: { pos: {}, body: { w: 8, h: 8, blocked: false, sensor: true }, sprite: { id: first(cx.cart, ['coin']), auto: false } }, rules: [{ on: 'touch', with: 'player', then: [{ act: 'add', path: 'coins' }, ...snd(cx.cart, 'coin'), { act: 'destroy' }] }] }) },
    { id: 'walker', title: 'Walker enemy (stompable)', group: 'Enemies', doc: 'Patrols along the ground. Jump on it to defeat it; touch it any other way and it hurts.', requires: ['space2d', 'sprite', 'platformer', 'combat', 'ai'], vars: { kills: 0 },
      make: (cx) => ({ tags: ['enemy'], c: { pos: {}, vel: {}, body: { w: 12, h: 9 }, gravity: {}, ai: { mode: 'patrol', speed: 24 }, sprite: { id: first(cx.cart, ['slime', 'walker']), oy: -3 }, health: { hp: 1, max: 1 } },
        rules: [{ on: 'touch', with: 'player', doc: 'land on it from above to defeat it', then: [{ act: 'if', test: 'other.pos.y < self.pos.y - 2 and other.vel.y > 0', then: [{ act: 'damage', target: 'self', amount: 1 }, { act: 'set', path: 'other.vel.y', to: -230 }, ...snd(cx.cart, 'stomp')], else: [{ act: 'damage', target: 'other', amount: 1, knockback: 120 }] }] },
          { on: 'die', then: [{ act: 'add', path: 'kills' }] }] }) },
    { id: 'chaser', title: 'Chaser enemy (top-down)', group: 'Enemies', doc: 'Wanders, then chases the player when close. Swords defeat it.', requires: ['space2d', 'sprite', 'combat', 'ai'], vars: { kills: 0 },
      make: (cx) => ({ tags: ['enemy'], c: { pos: {}, vel: {}, body: { w: 12, h: 8 }, ai: { mode: 'wander', speed: 26, range: 70 }, sprite: { id: first(cx.cart, ['slime']), oy: -3 }, health: { hp: 2, max: 2, invuln: 0.5 } },
        rules: [{ on: 'touch', with: 'player', then: [{ act: 'damage', target: 'other', amount: 1, knockback: 140 }] },
          { on: 'when', if: 'dist(self, player) < 60', then: [{ act: 'set', path: 'self.ai.mode', to: "'chase'" }] },
          { on: 'when', if: 'dist(self, player) > 90', then: [{ act: 'set', path: 'self.ai.mode', to: "'wander'" }] },
          { on: 'die', then: [{ act: 'add', path: 'kills' }, ...snd(cx.cart, 'die')] }] }) },
    { id: 'qblock', title: '? Block', group: 'Blocks', doc: 'Pays a coin once when hit from below.', requires: ['space2d', 'sprite'], vars: { coins: 0 },
      make: (cx) => ({ v: { used: false }, c: { pos: {}, body: { w: 16, h: 16, solid: true }, sprite: { id: first(cx.cart, ['qblock']), anim: 'idle', auto: false } },
        rules: [{ on: 'touch', with: 'player', if: 'not self.used and other.pos.y > self.pos.y + 6', then: [{ act: 'set', path: 'self.used', to: true }, { act: 'add', path: 'coins' }, ...snd(cx.cart, 'coin'), { act: 'anim', name: 'used' }] }] }) },
    { id: 'brick', title: 'Brick', group: 'Blocks', doc: 'Breaks when hit from below.', requires: ['space2d', 'sprite'],
      make: (cx) => ({ c: { pos: {}, body: { w: 16, h: 16, solid: true }, sprite: { id: first(cx.cart, ['brick']), auto: false } }, rules: [{ on: 'touch', with: 'player', if: 'other.pos.y > self.pos.y + 6', then: [...snd(cx.cart, 'break'), { act: 'destroy' }] }] }) },
    { id: 'spikes', title: 'Spikes', group: 'Hazards', doc: 'Hurts the player on touch.', requires: ['space2d', 'sprite', 'combat'],
      make: (cx) => ({ c: { pos: {}, body: { w: 14, h: 10, oy: 3, blocked: false, sensor: true }, sprite: { id: first(cx.cart, ['spikes']), auto: false } }, rules: [{ on: 'touch', with: 'player', then: [{ act: 'damage', target: 'other', amount: 1 }] }] }) },
    { id: 'lift', title: 'Moving platform', group: 'Blocks', doc: 'Slides back and forth. Riders are carried.', requires: ['space2d', 'sprite', 'platformer'],
      make: (cx) => ({ c: { pos: {}, body: { w: 32, h: 8, solid: true, oneway: true, blocked: false }, mover: { dx: 64, speed: 28 }, sprite: { id: first(cx.cart, ['lift']), auto: false } } }) },
    { id: 'goal', title: 'Goal flag', group: 'Other', doc: 'Touch it to win. Shows a message, then restarts.', requires: ['space2d', 'sprite', 'dialogue'],
      make: (cx) => ({ tags: ['goal'], c: { pos: {}, body: { w: 12, h: 16, blocked: false, sensor: true }, sprite: { id: first(cx.cart, ['flag']), auto: false } }, rules: [{ on: 'touch', with: 'player', then: [...snd(cx.cart, 'win'), { act: 'say', name: '', lines: ['YOU WIN!'], then: [{ act: 'goto', scene: cx.cart.meta.start }] }] }] }) },
    { id: 'door', title: 'Door to another level', group: 'Other', doc: 'Touch it to go to another level. Set which one in its rules.', requires: ['space2d', 'sprite'],
      make: (cx) => ({ c: { pos: {}, body: { w: 12, h: 12, blocked: false, sensor: true }, sprite: { id: first(cx.cart, ['door']), auto: false } }, rules: [{ on: 'touch', with: 'player', then: [...snd(cx.cart, 'door'), { act: 'goto', scene: Object.keys(cx.cart.scenes).find((s) => s !== cx.cart.meta.start) || cx.cart.meta.start }] }] }) },
    { id: 'npc', title: 'Character to talk to', group: 'Other', doc: 'Press A next to them to talk.', requires: ['space2d', 'sprite', 'dialogue'],
      make: (cx) => ({ tags: ['npc'], c: { pos: {}, body: { w: 12, h: 10, solid: true }, sprite: { id: first(cx.cart, ['elder', 'hero']), oy: -3, auto: false } }, rules: [{ on: 'interact', range: 26, then: [{ act: 'say', name: 'Someone', lines: ['Hello there!'] }] }] }) },
    { id: 'clock', title: 'Day/night clock', group: 'Farming', doc: 'Place one per game, anywhere. Keeps the hour and day; other rules can react to "newday" or "hour".', requires: ['time'],
      make: () => ({ doc: 'an invisible marker — one per game is enough', c: { clock: { hour: 6, day: 1, length: 120 } } }) },
    { id: 'crop', title: 'Crop', group: 'Farming', doc: 'Plant it with a "spawn" rule (see the Sword swing recipe for the trick). Water it each day; harvest when ripe.', requires: ['space2d', 'sprite', 'farm', 'economy'],
      make: (cx) => ({ c: { pos: {}, sprite: { id: first(cx.cart, ['carrot', 'crop']), auto: false }, growable: { stage: 0, stages: 4 } },
        rules: [
          { on: 'update', doc: 'show the growth stage', then: [
            { act: 'if', test: 'self.growable.stage == 0', then: [{ act: 'set', path: 'self.sprite.anim', to: "'seed'" }] },
            { act: 'if', test: 'self.growable.stage == 1', then: [{ act: 'set', path: 'self.sprite.anim', to: "'sprout'" }] },
            { act: 'if', test: 'self.growable.stage == 2', then: [{ act: 'set', path: 'self.sprite.anim', to: "'grown'" }] },
            { act: 'if', test: 'self.growable.stage >= 3', then: [{ act: 'set', path: 'self.sprite.anim', to: "'ripe'" }] } ] },
          { on: 'interact', range: 20, if: 'self.growable.stage < self.growable.stages - 1', then: [{ act: 'set', path: 'self.growable.watered', to: true }] },
          { on: 'interact', range: 20, if: 'self.growable.stage >= self.growable.stages - 1', then: [{ act: 'give', target: 'other', item: 'carrot', count: 1 }, { act: 'destroy' }] } ] }) },
    { id: 'shopkeeper', title: 'Shopkeeper', group: 'Farming', doc: 'Press A next to them to buy a seed for gold.', requires: ['space2d', 'sprite', 'dialogue', 'economy'], vars: { gold: 10 },
      make: (cx) => ({ tags: ['shopkeeper'], c: { pos: {}, body: { w: 12, h: 12, solid: true }, sprite: { id: first(cx.cart, ['shopkeeper', 'elder', 'hero']), oy: -3, auto: false } },
        rules: [{ on: 'interact', range: 26, then: [{ act: 'say', name: 'Shopkeeper', lines: [{ text: 'Buy a seed for 3 gold?', choices: [{ text: 'Buy', then: [{ act: 'buy', item: 'seed', count: 1, price: 3 }] }, { text: 'No thanks' }] }] }] }] }) },
    { id: 'guard', title: 'Guard (vision cone)', group: 'Stealth', doc: 'Sees the player inside a cone in front of it — blocked by walls. Reacts once it has watched them a moment, not the instant they cross the line.', requires: ['space2d', 'sprite', 'stealth', 'ai'],
      make: (cx) => ({ tags: ['guard'], c: { pos: {}, vel: {}, body: { w: 10, h: 10 }, ai: { mode: 'patrol', speed: 20 }, vision: { range: 90, fov: 80, alertTime: 0.4, loseTime: 1.5 }, sprite: { id: first(cx.cart, ['guard', 'elder', 'slime']), oy: -3, auto: false } },
        rules: [
          { on: 'spotted', doc: 'give chase — change to whatever fits your game (an alarm, a battle, a game over)', then: [{ act: 'set', path: 'self.ai.mode', to: "'chase'" }, { act: 'set', path: 'self.ai.speed', to: 55 }] },
          { on: 'lost', then: [{ act: 'set', path: 'self.ai.mode', to: "'patrol'" }, { act: 'set', path: 'self.ai.speed', to: 20 }] } ] }) },
  ]);
  S.recipeById = (id) => R.find((r) => r.id === id);
  /* Adds a recipe (and the parts it depends on) as ONE undo step. Returns the new prefab's name. */
  S.addRecipe = (doc, id, wantedName) => {
    const rec = S.recipeById(id); if (!rec) throw new Error('Unknown recipe ' + id);
    return doc.transact('Add ' + rec.title, () => {
      const cart = doc.cart, names = {};
      for (const dep of rec.deps || []) names[dep] = cart.prefabs[dep] ? dep : S.addRecipe(doc, dep, dep);
      const name = S.slug(wantedName || id, cart.prefabs);
      const cx = { cart, name: (d) => names[d] || d };
      doc.set(['prefabs', name], rec.make(cx), 'Add ' + rec.title);
      const exts = cart.meta.extensions || [], need = (rec.requires || []).filter((e) => !exts.includes(e));
      if (need.length) doc.set(['meta', 'extensions'], [...exts, ...need]);
      for (const [k, v] of Object.entries(rec.vars || {})) if (!hasOwn(cart.vars || {}, k)) doc.set(['vars', k], v);
      if (rec.player && !cart.meta.player) doc.set(['meta', 'player'], name);
      return name;
    });
  };
  /* A registry with EVERY extension: the editors offer all parts and actions, and switch the right extension on when one is used. */
  let _all = null;
  S.allReg = () => (_all = _all || DC2.registryFor({ meta: { extensions: Object.keys(DC2.ext) } }).reg);
  S.ensureExt = (doc, ext) => { const exts = doc.cart.meta.extensions || []; if (ext && ext !== 'core' && !exts.includes(ext)) doc.set(['meta', 'extensions'], [...exts, ext]); };
  /* add a component to a thing, plus the components it needs, plus the extension that provides it */
  S.addPart = (doc, prefabId, name) => doc.transact('Add part', () => {
    const reg = S.allReg(), cx = { cart: doc.cart, reg };
    const add = (n) => {
      const def = reg.components[n]; if (!def) throw new Error(`There is no part called "${n}".`);
      if (S.getIn(doc.cart, ['prefabs', prefabId, 'c', n])) return;
      for (const need of def.needs) add(need);
      doc.set(['prefabs', prefabId, 'c', n], S.blankValue(S.describeComponent(n, cx), cx) || {});
      S.ensureExt(doc, def.ext);
    };
    add(name);
  });
  /* which other parts of this thing need `name`? */
  S.partDependents = (cart, prefabId, name) => { const reg = S.allReg(); return Object.keys(cart.prefabs[prefabId].c || {}).filter((k) => k !== name && (reg.components[k] ? reg.components[k].needs : []).includes(name)); };
  S.removePart = (doc, prefabId, name) => {
    const deps = S.partDependents(doc.cart, prefabId, name);
    if (deps.length) throw new Error(`"${S.humanize(name)}" is needed by ${deps.map(S.humanize).join(', ')}. Remove those first.`);
    doc.del(['prefabs', prefabId, 'c', name], 'Remove part');
  };
  /* delete a thing, everywhere it is placed, and un-set it as the player */
  S.deleteThing = (doc, id) => doc.transact('Delete thing', () => {
    for (const [mid, m] of Object.entries(doc.cart.maps)) for (let i = (m.objects || []).length - 1; i >= 0; i--) if (m.objects[i].prefab === id) doc.remove(['maps', mid, 'objects'], i);
    if (doc.cart.meta.player === id) doc.del(['meta', 'player']);
    doc.del(['prefabs', id]);
  });
  S.placedCount = (cart, id) => Object.values(cart.maps).reduce((n, m) => n + (m.objects || []).filter((o) => o.prefab === id).length, 0);
  S.usedExtensions = (cart) => DC2.validate(cart, DC2.registryFor(cart).reg).used;

  /* ------------------------------------------------------------ sprite operations */
  /* A frame is "row/row/..." with one char per pixel: a base-36 palette index, or "." for transparent. */
  const SP = (S.sprite = {});
  C.pix = (id, f, cells, label) => ({
    label: label || 'Draw', touched: [['sprites', id, 'frames', f]], cells,
    do(c) { const d = c.sprites[id], rows = d.frames[f].split('/'); this.old = []; for (const { x, y, c: col } of this.cells) { const r = rows[y]; this.old.push(r[x]); rows[y] = r.slice(0, x) + (col < 0 ? '.' : B36[col]) + r.slice(x + 1); } d.frames[f] = rows.join('/'); },
    undo(c) { const d = c.sprites[id], rows = d.frames[f].split('/'); for (let i = this.cells.length - 1; i >= 0; i--) { const { x, y } = this.cells[i], r = rows[y]; rows[y] = r.slice(0, x) + this.old[i] + r.slice(x + 1); } d.frames[f] = rows.join('/'); },
  });
  SP.decode = (def, f) => { const out = new Array(def.w * def.h).fill(-1); def.frames[f].split('/').forEach((r, y) => { for (let x = 0; x < def.w; x++) { const ch = r[x]; out[y * def.w + x] = ch === undefined || ch === '.' ? -1 : B36.indexOf(ch); } }); return out; };
  SP.encode = (px, w, h) => { const rows = []; for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) { const v = px[y * w + x]; r += v < 0 ? '.' : B36[v]; } rows.push(r); } return rows.join('/'); };
  SP.blank = (w, h) => SP.encode(new Array(w * h).fill(-1), w, h);
  /* set pixels [[x,y]...] of frame f to colour col (-1 = transparent). Only real changes are recorded. */
  SP.paint = (doc, id, f, cells, col) => {
    const d = doc.cart.sprites[id], rows = d.frames[f].split('/'), want = col < 0 ? '.' : B36[col], out = [], seen = new Set();
    for (const [x, y] of cells) { if (x < 0 || y < 0 || x >= d.w || y >= d.h || seen.has(y * d.w + x)) continue; seen.add(y * d.w + x); if (rows[y][x] !== want) out.push({ x, y, c: col }); }
    if (out.length) doc.run(C.pix(id, f, out, col < 0 ? 'Erase' : 'Draw'));
    return out.length;
  };
  SP.flood = (def, f, x, y) => {
    if (x < 0 || y < 0 || x >= def.w || y >= def.h) return [];
    const px = SP.decode(def, f), t = px[y * def.w + x], seen = new Uint8Array(px.length), out = [], st = [[x, y]];
    while (st.length) { const [cx, cy] = st.pop(); if (cx < 0 || cy < 0 || cx >= def.w || cy >= def.h || seen[cy * def.w + cx] || px[cy * def.w + cx] !== t) continue; seen[cy * def.w + cx] = 1; out.push([cx, cy]); st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]); }
    return out;
  };
  const setFrame = (doc, id, f, px, label) => doc.set(['sprites', id, 'frames', f], SP.encode(px, doc.cart.sprites[id].w, doc.cart.sprites[id].h), { label: label || 'Transform' });
  SP.flipH = (doc, id, f) => { const d = doc.cart.sprites[id], px = SP.decode(d, f), o = px.slice(); for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) o[y * d.w + x] = px[y * d.w + d.w - 1 - x]; setFrame(doc, id, f, o); };
  SP.flipV = (doc, id, f) => { const d = doc.cart.sprites[id], px = SP.decode(d, f), o = px.slice(); for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) o[y * d.w + x] = px[(d.h - 1 - y) * d.w + x]; setFrame(doc, id, f, o); };
  SP.rotate = (doc, id, f) => { const d = doc.cart.sprites[id]; if (d.w !== d.h) throw new Error('Only square sprites can be rotated.'); const px = SP.decode(d, f), o = px.slice(), n = d.w; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) o[x * n + (n - 1 - y)] = px[y * n + x]; setFrame(doc, id, f, o); };
  /* slide the picture; what falls off one side comes back on the other */
  SP.shift = (doc, id, f, dx, dy) => { const d = doc.cart.sprites[id], px = SP.decode(d, f), o = px.slice(); for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) o[((y + dy + d.h * 9) % d.h) * d.w + ((x + dx + d.w * 9) % d.w)] = px[y * d.w + x]; setFrame(doc, id, f, o); };
  /* ---- clipboard: a rectangle of pixels ({w,h,px}, -1 = transparent) that can be pasted into any sprite or frame */
  const clipRect = (d, r) => { const x0 = Math.max(0, Math.min(r.x, r.x + r.w)), y0 = Math.max(0, Math.min(r.y, r.y + r.h)), x1 = Math.min(d.w, Math.max(r.x, r.x + r.w)), y1 = Math.min(d.h, Math.max(r.y, r.y + r.h)); return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }; };
  SP.normRect = (d, r) => clipRect(d, r);
  SP.copy = (def, f, r) => { const q = clipRect(def, r || { x: 0, y: 0, w: def.w, h: def.h }), src = SP.decode(def, f), px = []; for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) px.push(src[(q.y + y) * def.w + q.x + x]); return { w: q.w, h: q.h, px }; };
  SP.clearRect = (doc, id, f, r) => { const d = doc.cart.sprites[id], q = clipRect(d, r), px = SP.decode(d, f); for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) px[(q.y + y) * d.w + q.x + x] = -1; setFrame(doc, id, f, px, 'Delete pixels'); };
  /* paste with its top-left at (x, y); transparent pixels leave what's underneath (opts.opaque paints them clear) */
  SP.paste = (doc, id, f, clip, x, y, opts) => { const d = doc.cart.sprites[id], px = SP.decode(d, f); let n = 0; for (let j = 0; j < clip.h; j++) for (let i = 0; i < clip.w; i++) { const v = clip.px[j * clip.w + i], X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= d.w || Y >= d.h || (v < 0 && !(opts && opts.opaque))) continue; px[Y * d.w + X] = v; n++; } if (n) setFrame(doc, id, f, px, 'Paste'); return n; };
  SP.clipFlipH = (c) => ({ w: c.w, h: c.h, px: c.px.map((_, k) => c.px[Math.floor(k / c.w) * c.w + (c.w - 1 - (k % c.w))]) });
  SP.clipFlipV = (c) => ({ w: c.w, h: c.h, px: c.px.map((_, k) => c.px[(c.h - 1 - Math.floor(k / c.w)) * c.w + (k % c.w)]) });
  SP.fromClip = (doc, name, clip, palette) => { const id = S.slug(name || 'pasted', doc.cart.sprites); doc.set(['sprites', id], { w: clip.w, h: clip.h, palette: palette || Object.keys(doc.cart.palettes)[0], frames: [SP.encode(clip.px, clip.w, clip.h)], anims: { idle: { f: [0], fps: 1 } } }, 'New sprite from selection'); return id; };
  SP.bounds = (def) => { let x0 = def.w, y0 = def.h, x1 = -1, y1 = -1; def.frames.forEach((_, f) => { const px = SP.decode(def, f); for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (px[y * def.w + x] >= 0) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }); return x1 < 0 ? { x: 0, y: 0, w: def.w, h: def.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  SP.clear = (doc, id, f) => { const d = doc.cart.sprites[id]; doc.set(['sprites', id, 'frames', f], SP.blank(d.w, d.h), { label: 'Clear' }); };
  /* animations refer to frames by number; whenever frames move, renumber them */
  function remapAnims(doc, id, fn) {
    const an = doc.cart.sprites[id].anims || {};
    for (const [name, a] of Object.entries(an)) { const nf = a.f.map(fn).filter((v) => v !== null); doc.set(['sprites', id, 'anims', name, 'f'], nf.length ? nf : [0]); }
  }
  /* add a frame at the END (blank, or a copy of frame copyOf) without renumbering anything; returns its number */
  SP.appendFrame = (doc, id, copyOf) => { const d = doc.cart.sprites[id], at = d.frames.length; doc.insert(['sprites', id, 'frames'], at, copyOf == null ? SP.blank(d.w, d.h) : d.frames[copyOf], 'Add frame'); return at; };
  SP.addFrame = (doc, id, copyOf) => doc.transact('Add frame', () => {
    const d = doc.cart.sprites[id], at = copyOf == null ? d.frames.length : copyOf + 1;
    doc.insert(['sprites', id, 'frames'], at, copyOf == null ? SP.blank(d.w, d.h) : d.frames[copyOf]);
    if (copyOf != null) remapAnims(doc, id, (k) => (k >= at ? k + 1 : k));
    return at;
  });
  SP.removeFrame = (doc, id, f) => {
    if (doc.cart.sprites[id].frames.length < 2) throw new Error('A sprite needs at least one frame.');
    doc.transact('Delete frame', () => { doc.remove(['sprites', id, 'frames'], f); remapAnims(doc, id, (k) => (k === f ? null : k > f ? k - 1 : k)); });
  };
  SP.moveFrame = (doc, id, from, to) => doc.transact('Move frame', () => { doc.move(['sprites', id, 'frames'], from, to); remapAnims(doc, id, (k) => (k === from ? to : from < to && k > from && k <= to ? k - 1 : from > to && k >= to && k < from ? k + 1 : k)); });
  SP.resize = (doc, id, w, h) => doc.transact('Resize sprite', () => {
    const d = doc.cart.sprites[id];
    d.frames.forEach((_, f) => { const px = SP.decode(d, f), o = new Array(w * h).fill(-1); for (let y = 0; y < Math.min(h, d.h); y++) for (let x = 0; x < Math.min(w, d.w); x++) o[y * w + x] = px[y * d.w + x]; doc.set(['sprites', id, 'frames', f], SP.encode(o, w, h)); });
    doc.set(['sprites', id, 'w'], w); doc.set(['sprites', id, 'h'], h);
  });
  SP.create = (doc, name, w, h, palette) => doc.transact('New sprite', () => {
    const id = S.slug(name, doc.cart.sprites);
    doc.set(['sprites', id], { w, h, palette: palette || Object.keys(doc.cart.palettes)[0], frames: [SP.blank(w, h)], anims: { idle: { f: [0], fps: 1 } } });
    return id;
  });
  SP.setAnim = (doc, id, name, a) => doc.set(['sprites', id, 'anims', name], a, { label: 'Animation' });
  SP.delAnim = (doc, id, name) => doc.del(['sprites', id, 'anims', name], 'Delete animation');
  SP.renameAnim = (doc, id, from, to) => { const an = doc.cart.sprites[id].anims; if (an[to]) throw new Error('That name is taken.'); if (!/^[A-Za-z0-9_]+$/.test(to)) throw new Error('Use letters, numbers and _ only.'); doc.transact('Rename animation', () => { doc.set(['sprites', id, 'anims', to], S.clone(an[from])); doc.del(['sprites', id, 'anims', from]); }); };
  SP.setColor = (doc, pal, idx, hex) => doc.set(['palettes', pal, idx], hex, { coalesce: true, label: 'Colour' });
  /* image pixels -> frame string using the nearest palette colour; mostly-transparent pixels become "." */
  SP.fromRGBA = (rgba, w, h, palette) => {
    const rgb = palette.map((hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]), px = new Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (rgba[i * 4 + 3] < 128) { px[i] = -1; continue; }
      let best = 0, bd = Infinity; for (let k = 0; k < rgb.length; k++) { const dr = rgba[i * 4] - rgb[k][0], dg = rgba[i * 4 + 1] - rgb[k][1], db = rgba[i * 4 + 2] - rgb[k][2], dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } }
      px[i] = best;
    }
    return SP.encode(px, w, h);
  };
})(typeof window !== 'undefined' ? window : globalThis);
