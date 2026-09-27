/* Data Console — ECS engine */
(function () {
  const DC = window.DC, I = DC.Input, AU = DC.Audio;
  const DT = 1 / 60;
  const WALL = { solid: true };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hasTag = (e, tags) => {
    if (!tags) return false;
    if (typeof tags === 'string') tags = [tags];
    for (const t of tags) if (e.tags.has(t)) return true;
    return false;
  };
  const TAU = Math.PI * 2;
  const wrapAng = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const isFormula = (v) => typeof v === 'string' && v.length > 1 && v[0] === '=' && v[1] !== '=';
  const BLOCK = new Set(['__proto__', 'prototype', 'constructor']);
  const TILE_ONLY_KEYS = ['sprite', 'solid', 'oneWay', 'hurt', 'kill', 'hit', 'color', 'fps', 'layer', 'entity'];
  const TILE_ENT_KEYS = ['warp', 'talk', 'ai', 'health', 'pickup', 'attack', 'spawner', 'emitter', 'move', 'text', 'control', 'lifetime', 'stompable', 'vel', 'tags', 'body', 'vars'];
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  class Engine {
    constructor(canvas) {
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.W = 256; this.H = 224;
      this.cart = null; this.scene = null;
      this.frames = {};
      this.ents = new Map(); this.nid = 1;
      this.parts = []; this.timers = []; this.vars = {};
      this.mode = 'local'; // local | host | client
      this.localIdx = 0;
      this.remotePlayers = new Set();
      this.active = true; this.paused = false;
      this.acc = 0; this.last = 0; this.t = 0; this.frame = 0;
      this.sfxQueue = []; this.cents = []; this.ccache = new Map();
      this.onWarn = null; this.onSnapshot = null; this.onInput = null;
      this.warned = new Set();
      this.cam = { x: 0, y: 0 };
      this.dev = { god: false, boxes: false };
      this.spawnedOrigins = new Set();
      this.loop = this.loop.bind(this);
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(this.loop);
    }

    warn(m) { if (this.warned.has(m)) return; this.warned.add(m); console.warn('[DC]', m); if (this.onWarn) this.onWarn(m); }
    col(c) { return DC.color(c, this.pal); }

    /* ---------------- loading ---------------- */
    async load(cart) {
      const rep = DC.validateCart(cart);
      if (rep.errors.length) throw new Error(rep.errors.join('\n'));
      this.error = null; this.warned.clear();
      this.cart = cart;
      this.prefabCache = {};
      this.pal = Array.isArray(cart.palette) && cart.palette.length ? cart.palette.map((c) => DC.color(c) || '#ff00ff') : DC.PALETTE;
      this.W = cart.meta.width; this.H = cart.meta.height;
      this.cv.width = this.W; this.cv.height = this.H;
      this.g.imageSmoothingEnabled = false;
      this.base = cart.meta.assets || 'assets/';
      this.frames = await DC.buildFrames(cart, this.pal, this.base);
      for (const [n, f] of Object.entries(this.frames)) if (f.missingSrc) this.warn(`Image not found for sprite "${n}": ${f.missingSrc}`);
      for (const [n, d] of Object.entries(cart.sounds)) if (d && d.src) AU.loadSound(n, /^(data:|https?:|\/)/.test(d.src) ? d.src : this.base + d.src);
      try { if (document.fonts) await document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* font optional */ }
      this.vars = DC.clone(cart.vars) || {};
      this.globalRules = this.prepRules(cart.rules);
      this.paused = false;
      // singletons: one instance for the whole game, carried from scene to scene
      this.ents.clear();
      this.carry = [];
      for (const name of cart.meta.singletons || []) {
        const e = this.spawn(name, 0, 0, { persistent: true });
        if (e) { this.ents.delete(e.id); this.carry.push(e); }
      }
      AU.stopMusic();
      if (this.mode === 'client') this.enterSceneView(cart.meta.start);
      else this.startScene(cart.meta.start);
      if (this.onLoad) this.onLoad(cart);
      return rep;
    }

    prepRules(list) {
      return (list || []).filter((r) => r && typeof r === 'object').map((r) => {
        const o = Object.assign({}, r);
        o._key = JSON.stringify(r);
        o.do = o.do == null ? (o.actions || []) : o.do;
        if (!Array.isArray(o.do)) o.do = [o.do];
        if (o.goto != null) o.do = [...o.do, { goto: o.goto }]; // state-rule shorthand: "goto" alongside "on"/"if"
        return o;
      });
    }
    /* keep rule timers / edge state across a live reload when the rule text is unchanged */
    keepRules(old, list) {
      const byKey = new Map((old || []).map((r) => [r._key, r]));
      return this.prepRules(list).map((r) => {
        const o = byKey.get(r._key);
        if (o) { r._was = o._was; r._t = o._t; r._done = o._done; }
        return r;
      });
    }

    frameSize(name) {
      const f = this.frames[name];
      return f && f[0] ? { w: f[0].dw, h: f[0].dh } : null;
    }

    loadMap(sc) {
      this.ts = +sc.tileSize || 16;
      this.grav = +sc.gravity || 0;
      this.map = (sc.map || []).map((r) => String(r).split(''));
      this.mapH = this.map.length;
      this.mapW = this.mapH ? Math.max(...this.map.map((r) => r.length)) : 0;
      this.texDirty = true;
      const m = sc.mode7;
      if (m) {
        const o = typeof m === 'object' ? m : {};
        const fov = Math.max(20, Math.min(150, +o.fov || 70)) * Math.PI / 180;
        const prevA = this.m7 && this.m7a;
        this.m7 = {
          horizon: o.horizon != null ? +o.horizon : Math.round(this.H * 0.33), height: o.height != null ? +o.height : 22,
          fov, far: +o.far || 1400, near: +o.near || 4, back: o.back != null ? +o.back : 56, lerp: o.turn != null ? +o.turn : 8,
          angle: (o.angle != null ? +o.angle : -90) * Math.PI / 180, spriteScale: o.spriteScale != null ? +o.spriteScale : 0.65,
          outside: o.outside ?? 'wrap', fog: o.fog, fogDepth: o.fogDepth != null ? +o.fogDepth : 0.3, ground: o.ground,
        };
        this.m7focal = this.W / 2 / Math.tan(fov / 2);
        if (prevA == null) { this.m7a = null; this.m7x = null; this.m7y = null; }
      } else this.m7 = null;
    }

    /* A tile becomes an entity when it carries entity components (warp, talk, ai, pickup…) */
    isTileEntity(t) {
      if (!t || typeof t !== 'object') return false;
      if (t.entity === true) return true;
      return TILE_ENT_KEYS.some((k) => k in t) || (t.hurt != null && typeof t.hurt === 'object');
    }
    tileComponents(t, ch) {
      const c = {};
      for (const [k, v] of Object.entries(t)) if (!TILE_ONLY_KEYS.includes(k)) c[k] = DC.clone(v);
      if (t.layer != null) c.layer = +t.layer || 0;
      if (t.sprite) c.sprite = Object.assign({ name: t.sprite, fit: true }, t.fps != null ? { fps: t.fps } : {});
      else if (t.color != null) c.sprite = { color: t.color, w: this.ts, h: this.ts };
      if (t.oneWay) c.solid = { oneWay: true };
      else if (t.solid) c.solid = true;
      if (t.hurt != null && typeof t.hurt !== 'object') c.hurt = { damage: +t.hurt || 1, targets: ['player'] };
      if (t.kill) c.hurt = { damage: 999, targets: ['player'] };
      c.tags = [...new Set([...(c.tags || []), 'tile'])];
      return c;
    }
    /* Every legend / tile-entity spawn in a map, keyed by grid cell so live edits can sync */
    mapSpawns(sc) {
      const out = [];
      const legend = sc.legend || {};
      const rows = sc.map || [];
      for (let y = 0; y < rows.length; y++) {
        const row = String(rows[y]);
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          const L = legend[ch];
          if (L) {
            const pf = typeof L === 'string' ? L : L.prefab;
            out.push({ key: `${x},${y}|p:${pf}|${ch}`, kind: 'legend', ch, pf, with: typeof L === 'object' ? L.with : null, x, y });
          } else if (this.isTileEntity(this.cart.tiles[ch])) {
            out.push({ key: `${x},${y}|t:${ch}`, kind: 'tile', ch, x, y });
          }
        }
      }
      return out;
    }
    spawnFromMap(w) {
      let e;
      if (w.kind === 'legend') { e = this.spawn(w.pf, 0, 0, w.with); if (e) this.placeOnTile(e, w.x, w.y); }
      else e = this.spawnTile(w.ch, w.x, w.y);
      if (e) e.origin = w.key;
      this.spawnedOrigins.add(w.key);
      return e;
    }
    spawnTile(ch, tx, ty) {
      const t = this.cart.tiles[ch];
      if (!t) return null;
      const e = this.spawn(null, tx * this.ts, ty * this.ts, this.tileComponents(t, ch));
      if (!e) return null;
      e.tileCh = ch;
      e.home = { x: e.x, y: e.y };
      return e;
    }

    startScene(name, opts = {}) {
      const sc = this.cart.scenes[name];
      if (!sc) { this.warn(`Scene "${name}" not found`); return false; }
      const keep = [...(this.carry || []), ...[...this.ents.values()].filter((e) => !e.dead && e.c.persistent && !e.c.control && !e.owner)];
      this.carry = null;
      this.sceneName = name; this.scene = sc;
      this.ents.clear(); this.parts = []; this.timers = []; this.pairs = new Set();
      this.dialog = null; this.banner = null; this.shakeT = 0; this.flashT = 0; this.fade = 1;
      this.pendingScene = null; this.tileEdits = []; this.tileHp = {};
      this.spawnedOrigins = new Set();
      this.loadMap(sc);
      if (sc.vars) Object.assign(this.vars, DC.clone(sc.vars));
      this.sceneRules = this.prepRules(sc.rules);
      this.allRules = [...this.globalRules, ...this.sceneRules];
      for (const r of this.globalRules) { r._t = 0; r._done = false; }
      this.startBound = this.allRules.some((r) => r.on === 'button' && r.button === 'start');
      for (const w of this.mapSpawns(sc)) { this.map[w.y][w.x] = '.'; this.spawnFromMap(w); }
      this.texDirty = true; this.m7a = null;
      for (const d of sc.entities || []) {
        if (!d) continue;
        const e = this.spawn(d.prefab, +d.x || 0, +d.y || 0, d.with);
        if (e && d.tx != null) this.placeOnTile(e, +d.tx, +d.ty || 0);
      }
      for (const e of keep) {
        if (e.prefab && [...this.ents.values()].some((o) => !o.dead && o.prefab === e.prefab)) continue;
        this.ents.set(e.id, e);
      }
      this.ensureCoop();
      if (opts.arrive) this.arrive(opts.arrive);
      this.cam = { x: 0, y: 0 };
      this.camera(0, true);
      if (sc.music === null || sc.music === false) AU.stopMusic();
      else if (sc.music) AU.playMusic(sc.music, this.cart.music[sc.music]);
      this.fire('start', {});
      this.seedContacts();
      return true;
    }

    /* ---------------- arrivals: where players appear in a new scene ---------------- */
    arrive(p) {
      let cell = null;
      if (p.tx != null) cell = { x: +p.tx, y: +p.ty || 0 };
      else if (p.x != null) { this.eachPlayer((e, i) => { e.x = +p.x + i * 10; e.y = +p.y || 0; e.home = { x: e.x, y: e.y }; }); return; }
      else if (p.at != null) cell = this.findMarker(String(p.at));
      else if (p.from && p.from !== this.sceneName && this.cart.meta.autoDoors !== false) cell = this.findReturn(p.from);
      if (!cell) { if (p.at != null) this.warn(`Scene "${this.sceneName}" has no "${p.at}" to arrive at`); return; }
      cell = this.standCell(cell);
      this.eachPlayer((e, i) => { this.placeOnTile(e, cell.x, cell.y); e.x += i * 6; e.safe = { x: e.x, y: e.y }; });
    }
    eachPlayer(fn) { let i = 0; for (const e of this.ents.values()) if (e.c.control && !e.dead) fn(e, i++); }
    /* a tile character, a legend character, or a tag/prefab name */
    findMarker(at) {
      const rows = this.scene.map || [];
      if (at.length === 1) for (let y = 0; y < rows.length; y++) { const x = String(rows[y]).indexOf(at); if (x >= 0) return { x, y }; }
      for (const e of this.ents.values()) if (!e.dead && !e.c.control && (e.tags.has(at) || e.prefab === at)) { const c = this.center(e); return { x: Math.floor(c.x / this.ts), y: Math.floor(c.y / this.ts) }; }
      return null;
    }
    /* the doorway in this scene that leads back to the scene we came from */
    findReturn(from) {
      const leadsTo = (acts) => {
        if (!acts) return false;
        for (const a of Array.isArray(acts) ? acts : [acts]) {
          if (!a || typeof a !== 'object') continue;
          if (a.scene === from) return true;
          if (leadsTo(a.then) || leadsTo(a.else) || leadsTo(a.do)) return true;
        }
        return false;
      };
      for (const r of this.allRules) if (r.on === 'tile' && r.tile && leadsTo(r.do)) { const c = this.findMarker(r.tile); if (c) return c; }
      for (const e of this.ents.values()) if (!e.dead && e.c.warp && e.c.warp.scene === from) { const c = this.center(e); return { x: Math.floor(c.x / this.ts), y: Math.floor(c.y / this.ts) }; }
      for (const r of this.allRules) if (r.on === 'collide' && leadsTo(r.do)) { const c = this.findMarker(r.b) || this.findMarker(r.a === 'player' ? '' : r.a); if (c) return c; }
      return null;
    }
    /* don't place players inside a wall: use the nearest open cell */
    standCell(c) {
      const open = (x, y) => { const t = this.tileAt(x, y); return x >= 0 && y >= 0 && x < this.mapW && y < this.mapH && !(t && t.solid); };
      if (open(c.x, c.y)) return c;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) if (open(c.x + dx, c.y + dy)) return { x: c.x + dx, y: c.y + dy };
      return c;
    }
    /* things you start inside of don't fire until you step off them and back on */
    seedContacts() {
      const ents = [...this.ents.values()].filter((e) => !e.dead);
      for (const e of ents) if (e.c.body) e.tset = this.tilesUnder(e);
      const list = ents.filter((e) => !e.c.noCollide);
      this.pairs = new Set();
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (overlap(this.box(a), this.box(b))) this.pairs.add(a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id);
      }
    }

    enterSceneView(name) {
      const sc = this.cart.scenes[name];
      if (!sc) return;
      this.sceneName = name; this.scene = sc;
      this.loadMap(sc);
      for (const w of this.mapSpawns(sc)) this.map[w.y][w.x] = '.';
      this.texDirty = true; this.m7a = null;
      this.tileEditsApplied = 0;
      this.ccache.clear(); this.cents = []; this.parts = [];
      this.cam = { x: 0, y: 0 };
    }

    placeOnTile(e, tx, ty) {
      if (e.tileCh) { e.x = tx * this.ts; e.y = ty * this.ts; }
      else {
        e.x = tx * this.ts + (this.ts - e.sw) / 2;
        e.y = ty * this.ts + this.ts - e.sh;
      }
      e.home = { x: e.x, y: e.y };
    }

    /* ---------------- entities ---------------- */
    /* the fully resolved (extends chain + behaviors) component set for a prefab, cached for
       this cart load — cleared by load()/hotReload() so edits take effect */
    resolvedPrefab(name) {
      this.prefabCache = this.prefabCache || {};
      if (!(name in this.prefabCache)) this.prefabCache[name] = DC.resolvePrefab(this.cart, name, this.prefabCache);
      return this.prefabCache[name];
    }
    spawn(name, x, y, over) {
      let pf = {};
      if (name) {
        pf = this.resolvedPrefab(name);
        if (!pf) { this.warn(`Prefab "${name}" not found`); return null; }
      }
      const c = DC.merge(DC.clone(pf), over || {});
      const e = {
        id: this.nid++, prefab: name || '', over: over ? DC.clone(over) : null, c, tags: new Set(),
        x, y, vx: 0, vy: 0, dx: 0, dy: 0, facing: { x: 1, y: 0 }, lastDirX: 1,
        onGround: false, t: 0, state: 'idle', at: 0, fi: 0, invuln: 0, flash: 0, stun: 0, cd: 0, atkT: 0,
        dead: false, vars: DC.clone(c.vars) || {}, born: true,
      };
      this.applyComponents(e, c, true);
      if (Array.isArray(c.vel)) { e.vx = +c.vel[0] || 0; e.vy = +c.vel[1] || 0; }
      if (c.ai && c.ai.dir) { e.dir = c.ai.dir; e.lastDirX = Math.sign(c.ai.dir) || 1; }
      e.home = { x, y };
      this.ents.set(e.id, e);
      return e;
    }
    /* (re)build an entity's derived data from its components — used at spawn, live reload and the inspector */
    /* merge a state's component-ish fields onto a clone of the entity's base (pre-state)
       components — "health", "enter", "exit" and "rules" are not component overlay keys */
    stateOverlay(base, mode) {
      const sd = base.states && base.states[mode];
      if (!sd || typeof sd !== 'object') return base;
      const eff = DC.clone(base);
      for (const k in sd) {
        if (k === 'enter' || k === 'exit' || k === 'rules' || k === 'health') continue;
        const v = sd[k];
        if (k === 'tags') { eff.tags = [...new Set([...(eff.tags || []), ...(Array.isArray(v) ? v : [v])])]; continue; }
        if (v && typeof v === 'object' && !Array.isArray(v) && eff[k] && typeof eff[k] === 'object' && !Array.isArray(eff[k])) eff[k] = DC.merge(DC.clone(eff[k]), DC.clone(v));
        else eff[k] = DC.clone(v);
      }
      return eff;
    }
    applyComponents(e, c, fresh) {
      if (typeof c.sprite === 'string') c.sprite = { name: c.sprite };
      e.baseC = c;
      if (c.states && typeof c.states === 'object') {
        const names = Object.keys(c.states).filter((k) => k !== 'start');
        if (!e.mode || !c.states[e.mode]) e.mode = c.states.start && c.states[c.states.start] ? c.states.start : names[0];
        c = this.stateOverlay(c, e.mode);
      }
      const prevHp = !fresh && e.c && e.c.health ? e.c.health.hp : null;
      const oldSh = e.sh;
      e.c = c;
      e.tags = new Set(c.tags || []);
      if (e.prefab) e.tags.add(e.prefab);
      for (const t of e.extraTags || []) e.tags.add(t);
      e.rules = Array.isArray(c.rules) && c.rules.length ? this.keepRules(e.rules, c.rules) : null;
      const sp = c.sprite;
      let sw = this.ts || 16, sh = this.ts || 16;
      const fs = sp && sp.name && this.frameSize(sp.name);
      if (e.tileCh || (sp && sp.fit)) { sw = this.ts; sh = this.ts; }
      else if (fs) { sw = fs.w; sh = fs.h; }
      else if (sp && (sp.w || sp.h)) { sw = +sp.w || sw; sh = +sp.h || sh; }
      else if (c.text && !sp) { sw = 8; sh = 8; }
      e.sw = sw; e.sh = sh;
      const b = c.body || {};
      const bw = b.w != null ? +b.w : sw, bh = b.h != null ? +b.h : sh;
      e.hb = { ox: b.ox != null ? +b.ox : (sw - bw) / 2, oy: b.oy != null ? +b.oy : sh - bh, w: bw, h: bh };
      if (!fresh && oldSh != null && oldSh !== sh && !e.tileCh) e.y += oldSh - sh; // keep feet planted
      if (c.health) {
        const h = c.health;
        h.hp = h.hp != null ? +h.hp : 1;
        h.max = h.max != null ? +h.max : h.hp;
        if (prevHp != null) h.hp = Math.min(prevHp, h.max);
        else if (h.var) {
          const v = this.vars[h.var];
          if (v != null && v > 0) h.hp = +v; else this.vars[h.var] = h.hp;
        }
        if (h.var && this.vars[h.var + 'Max'] == null) this.vars[h.var + 'Max'] = h.max;
      }
    }
    box(e) { return { x: e.x + e.hb.ox, y: e.y + e.hb.oy, w: e.hb.w, h: e.hb.h }; }
    center(e) { return { x: e.x + e.sw / 2, y: e.y + e.sh / 2 }; }
    first(tag) { for (const e of this.ents.values()) if (!e.dead && e.tags.has(tag)) return e; return null; }
    count(tag) { let n = 0; for (const e of this.ents.values()) if (!e.dead && e.tags.has(tag)) n++; return n; }
    nearest(e, tag, range, controlOnly) {
      const ec = this.center(e);
      let best = null, bd = range == null ? Infinity : range;
      for (const o of this.ents.values()) {
        if (o === e || o.dead || !o.tags.has(tag)) continue;
        if (controlOnly && !o.c.control) continue;
        const oc = this.center(o), d = Math.hypot(oc.x - ec.x, oc.y - ec.y);
        if (d <= bd) { bd = d; best = o; }
      }
      return best;
    }
    destroy(e) {
      if (!e || e.dead) return;
      e.dead = true;
      for (const r of this.allRules || []) if (r.on === 'destroyed' && e.tags.has(r.tag)) this.runRule(r, { self: e, a: e });
    }

    /* coop players for hosted games */
    ensureCoop() {
      if (this.mode !== 'host' || !this.scene) return;
      const all = [...this.ents.values()];
      const p0 = all.find((e) => !e.dead && e.c.control && !(e.c.control.player > 0));
      if (!p0) return;
      for (const idx of this.remotePlayers) {
        if (all.some((e) => !e.dead && e.c.control && e.c.control.player === idx)) continue;
        const pfName = (this.cart.meta.coop && this.cart.meta.coop[idx]) || p0.prefab;
        const pf = this.cart.prefabs[pfName];
        if (!pf) continue;
        const over = { control: { player: idx } };
        if (pf.health && pf.health.var) {
          over.health = { var: pf.health.var + (idx + 1) };
          if (!(this.vars[over.health.var] > 0)) this.vars[over.health.var] = pf.health.max || pf.health.hp || 1;
        }
        const e = this.spawn(pfName, p0.x + 10 * idx, p0.y, over);
        if (e) { e.extraTags = ['player', 'p' + (idx + 1)]; e.tags.add('player'); e.tags.add('p' + (idx + 1)); }
      }
    }
    addRemotePlayer(idx) { this.remotePlayers.add(idx); this.ensureCoop(); }
    removeRemotePlayer(idx) {
      this.remotePlayers.delete(idx);
      for (const e of this.ents.values()) if (e.c.control && e.c.control.player === idx) e.dead = true;
    }

    /* ---------------- main loop ---------------- */
    loop(ts) {
      requestAnimationFrame(this.loop);
      const now = ts / 1000;
      let dt = now - (this.last || now);
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      if (!this.cart || !this.scene) { this.drawIdle(); return; }
      if (!this.active && this.mode === 'local') return;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 5) { this.acc -= DT; steps++; this.tick(); }
      if (steps === 5) this.acc = 0;
      this.render();
    }

    tick() {
      I.update();
      if (this.mode === 'client') { this.clientTick(); return; }
      if (this.error) return;
      this.frame++;
      const p0 = I.players[0];
      if (this.paused && (p0.pressed.start || p0.pressed.a)) {
        this.paused = false; this.pauseLabel = null; I.consume('start'); I.consume('a');
        AU.play('_pause', { f: [800, 500], d: 0.06, v: 0.12 });
      } else if (p0.pressed.start && this.cart.meta.pause !== false && !this.dialog && !this.startBound) {
        this.paused = true;
        AU.play('_pause', { f: [500, 800], d: 0.06, v: 0.12 });
      }
      if (!this.paused) {
        try { this.update(DT); }
        catch (err) { this.error = err; this.warn('Game stopped: ' + err.message); console.error(err); }
      }
      if (this.mode === 'host' && this.frame % 2 === 0) this.sendSnap();
    }

    update(dt) {
      this.t += dt;
      if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 4);
      if (this.flashT > 0) this.flashT -= dt;
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
      if (this.dialog) { this.updateDialog(dt); this.animate(dt); this.updateParticles(dt); this.camera(dt); return; }

      this.runTimers(dt);
      this.rulesTick(dt);
      for (const e of [...this.ents.values()]) if (!e.dead && (e.rules || (e.baseC && e.baseC.states))) this.entRulesTick(e, dt);
      const ents = [...this.ents.values()];
      for (const e of ents) {
        if (e.dead) continue;
        e.t += dt;
        if (e.invuln > 0) e.invuln -= dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.stun > 0) e.stun -= dt;
        if (e.cd > 0) e.cd -= dt;
        if (e.atkT > 0) e.atkT -= dt;
        if (e.stompT > 0) e.stompT -= dt;
      }
      this.sysTalk(ents);
      if (this.dialog) return;
      this.sysMovers(ents, dt);
      this.solids = ents.filter((e) => !e.dead && e.c.solid);
      for (const e of ents) {
        if (e.dead) continue;
        const c = e.c;
        if (e.dying) { if (c.lifetime) { e.life = (e.life ?? (+c.lifetime.t || 1)) - dt; } continue; }
        if (c.control) this.sysControl(e, dt);
        if (c.ai) this.sysAI(e, dt);
        if (c.attack) this.sysAttack(e);
        if (c.spawner) this.sysSpawner(e, dt);
        if (c.emitter) this.sysEmitter(e, dt);
        if (c.lifetime) { e.life = (e.life ?? (+c.lifetime.t || 1)) - dt; if (e.life <= 0) this.destroy(e); }
      }
      for (const e of ents) if (!e.dead && e.c.body && !e.c.body.static && !e.c.move && !e.owner) this.sysPhysics(e, dt);
      const zg = this.scene.zGravity != null ? +this.scene.zGravity : 600;
      for (const e of ents) {
        if (e.dead || !(e.z > 0 || e.vz)) continue;
        e.vz = (e.vz || 0) - zg * dt;
        e.z = (e.z || 0) + e.vz * dt;
        if (e.z <= 0) { const hard = e.vz < -160; e.z = 0; e.vz = 0; if (hard && e.c.control) this.haptic('light', e); if (this.hasRules(e)) this.entFire(e, 'land', {}); }
      }
      for (const e of ents) {
        if (e.dead) continue;
        if (e.owner) {
          if (e.owner.dead) this.destroy(e);
          else { e.x = e.owner.x + e.follow.x; e.y = e.owner.y + e.follow.y; }
        } else if (!e.c.body && !e.c.move && (e.vx || e.vy)) { e.x += e.vx * dt; e.y += e.vy * dt; }
      }
      this.sysOverlap(ents);
      this.sysTileBreak(ents);
      this.sysTiles(ents);
      for (const e of ents) if (e.dying > 0 && !e.dead) { e.dying -= dt; if (e.dying <= 0) this.finishKill(e); }
      this.animate(dt);
      this.updateParticles(dt);
      this.camera(dt);
      for (const [id, e] of this.ents) if (e.dead) this.ents.delete(id);
      if (this.mode === 'host' && this.frame % 180 === 0) this.ensureCoop();
      if (this.pendingScene) { const p = this.pendingScene; this.pendingScene = null; this.gotoScene(p); }
    }

    gotoScene(p) {
      const from = this.sceneName;
      const arrive = p.restart ? null : { from, at: p.at, tx: p.tx, ty: p.ty, x: p.x, y: p.y };
      this.startScene(p.name, { arrive });
    }

    /* ---------------- systems ---------------- */
    sysMovers(ents, dt) {
      for (const e of ents) {
        const m = e.c.move;
        if (!m || e.dead) continue;
        const ox = e.x, oy = e.y;
        if (Array.isArray(m.path) && m.path.length > 1) {
          if (e.pi == null) { e.pi = 1; e.pdir = 1; }
          const tgt = m.path[e.pi] || [0, 0];
          const tx = e.home.x + (+tgt[0] || 0) * this.ts, ty = e.home.y + (+tgt[1] || 0) * this.ts;
          const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), sp = (+m.speed || 30) * dt;
          if (d <= sp) {
            e.x = tx; e.y = ty;
            if (m.loop) e.pi = (e.pi + 1) % m.path.length;
            else { if (e.pi + e.pdir < 0 || e.pi + e.pdir >= m.path.length) e.pdir *= -1; e.pi += e.pdir; }
          } else { e.x += (dx / d) * sp; e.y += (dy / d) * sp; }
        } else {
          e.x += (+m.vx || 0) * dt; e.y += (+m.vy || 0) * dt;
          if (m.sine) e.y = e.home.y + Math.sin(e.t * (+m.freq || 2)) * m.sine;
        }
        e.dx = e.x - ox; e.dy = e.y - oy;
        e.vx = e.dx / dt; e.vy = e.dy / dt;
      }
    }

    sysControl(e, dt) {
      const c = e.c.control, p = I.players[c.player || 0];
      if (!p || e.stun > 0) return;
      const type = c.type || (this.grav ? 'platformer' : 'topdown');
      if (type === 'kart') return this.kartControl(e, c, p, dt);
      const ctx = { self: e };
      const sp = this.numField(c.speed, 80, ctx);
      const dx = (p.down.right ? 1 : 0) - (p.down.left ? 1 : 0);
      const dy = (p.down.down ? 1 : 0) - (p.down.up ? 1 : 0);
      if (type === 'platformer') {
        const acc = e.onGround ? this.numField(c.accel, 14, ctx) : this.numField(c.airAccel, 9, ctx);
        e.vx += (dx * sp - e.vx) * Math.min(1, acc * dt);
        if (Math.abs(e.vx) < 1 && !dx) e.vx = 0;
        if (dx) e.facing = { x: dx, y: 0 };
        if (e.onGround) { e.coyote = 0.1; e.jumps = 0; } else e.coyote = (e.coyote || 0) - dt;
        const jb = c.jumpButton || 'a';
        e.jbuf = p.pressed[jb] ? 0.12 : (e.jbuf || 0) - dt;
        if (e.jbuf > 0) {
          const maxJ = this.numField(c.jumps, 1, ctx) || 1;
          let ok = false;
          if (e.coyote > 0) { ok = true; e.jumps = 1; }
          else if (maxJ > 1 && Math.max(1, e.jumps || 0) < maxJ) { ok = true; e.jumps = Math.max(1, e.jumps || 0) + 1; }
          if (ok) {
            e.vy = -this.numField(c.jump, 260, ctx);
            e.coyote = 0; e.jbuf = 0; e.onGround = false; e.jumpHeld = true;
            this.sound(c.jumpSound || 'jump');
          }
        }
        if (e.jumpHeld && !p.down[jb]) { if (e.vy < 0) e.vy *= 0.5; e.jumpHeld = false; }
        if (e.vy >= 0) e.jumpHeld = false;
      } else {
        let vx = dx, vy = dy;
        if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
        e.vx = vx * sp; e.vy = vy * sp;
        if (dx && !dy) e.facing = { x: dx, y: 0 };
        else if (dy && !dx) e.facing = { x: 0, y: dy };
        else if (dx && dy && !e.facing.x && !e.facing.y) e.facing = { x: dx, y: 0 };
      }
    }

    /* read a config field that may be a plain number or a "=formula" (used by behaviors to
       parametrize speed/cooldown/etc via self.<param>); mirrors the old "v != null ? +v : dflt" */
    numField(v, dflt, ctx) {
      if (v == null) return dflt;
      if (isFormula(v)) { const r = this.ev(v, ctx); return r == null ? dflt : (+r || 0); }
      return +v;
    }
    strField(v, dflt, ctx) { if (v == null) return dflt; if (isFormula(v)) { const r = this.ev(v, ctx); return r == null ? dflt : String(r); } return String(v); }
    tileUnder(e) {
      if (!this.mapW) return null;
      const b = this.box(e);
      return this.tileAt(Math.floor((b.x + b.w / 2) / this.ts), Math.floor((b.y + b.h / 2) / this.ts));
    }
    /* ground effects shared by karts and racers: "slow" (grass), "boost" (seconds), "jump" (ramp power) */
    groundFx(e) {
      const air = e.z > 0;
      const t = air ? null : this.tileUnder(e);
      if (t && t.boost && !(e.boostT > 0)) { e.boostT = +t.boost || 1; if (e.c.control) this.haptic('medium', e); this.sound(t.sound); }
      if (t && t.jump && !air && !(e.vz > 0)) { e.vz = +t.jump; this.sound(t.sound); }
      return t && t.slow != null ? +t.slow : 1;
    }
    /* Mode-7 style driving: gas / brake / steer, grip, hop */
    kartControl(e, c, p, dt) {
      if (e.heading == null) e.heading = (c.heading != null ? +c.heading : -90) * Math.PI / 180;
      const M = DC.Motion, tiltSteer = M && M.on && M.steer && (c.player || 0) === 0;
      const ctx = { self: e };
      let steer = (p.down.right ? 1 : 0) - (p.down.left ? 1 : 0);
      if (tiltSteer && Math.abs(M.x) > 0.06) steer = Math.max(-1, Math.min(1, M.x * 1.4));
      const gas = p.down[c.gasButton || 'a'] || (!tiltSteer && p.down.up);
      const brake = p.down[c.brakeButton || 'b'] || (!tiltSteer && p.down.down);
      const air = e.z > 0;
      let fx = Math.cos(e.heading), fy = Math.sin(e.heading);
      let spd = e.vx * fx + e.vy * fy, side = -e.vx * fy + e.vy * fx;
      const top = this.numField(c.speed, 150, ctx);
      const slow = this.groundFx(e);
      if (e.boostT > 0) e.boostT -= dt;
      const maxS = top * slow * (e.boostT > 0 ? 1.5 : 1);
      const acc = this.numField(c.accel, 140, ctx), brk = this.numField(c.brake, 260, ctx);
      if (!air) {
        if (gas) spd += acc * dt;
        else if (brake) spd -= (spd > 0 ? brk : acc * 0.6) * dt;
        else spd -= Math.sign(spd) * Math.min(Math.abs(spd), this.numField(c.coast, 60, ctx) * dt);
        if (e.boostT > 0) spd = Math.max(spd, maxS * 0.9);
        if (spd > maxS) spd = Math.max(maxS, spd - brk * 0.8 * dt);
      }
      spd = Math.max(spd, -this.numField(c.reverse, 50, ctx));
      const turn = this.numField(c.turn, 140, ctx) * Math.PI / 180;
      const turnScale = Math.min(1, Math.abs(spd) / Math.max(20, top * 0.25)) * (spd < 0 ? -1 : 1);
      e.heading = wrapAng(e.heading + steer * turn * turnScale * dt * (air ? 0.4 : 1));
      if (p.pressed[c.hopButton || 'x'] && !air) e.vz = this.numField(c.hop, 140, ctx);
      const grip = air ? 0.3 : this.numField(c.grip, 7, ctx);
      side *= Math.max(0, 1 - grip * dt);
      fx = Math.cos(e.heading); fy = Math.sin(e.heading);
      e.vx = fx * spd - fy * side; e.vy = fy * spd + fx * side;
      e.speed = spd;
      e.facing = Math.abs(fx) >= Math.abs(fy) ? { x: Math.sign(fx) || 1, y: 0 } : { x: 0, y: Math.sign(fy) };
    }
    /* follow a list of tile waypoints, steering like a driver */
    racePath(e, a, dt, sp) {
      const pts = Array.isArray(a.path) ? a.path : [];
      if (!pts.length) return;
      const ctx = { self: e };
      if (e.wp == null) e.wp = 0;
      const tgt = pts[e.wp % pts.length] || [0, 0];
      const tx = (+tgt[0] + 0.5) * this.ts, ty = (+tgt[1] + 0.5) * this.ts, c = this.center(e);
      const want = Math.atan2(ty - c.y, tx - c.x);
      if (e.heading == null) e.heading = a.heading != null ? +a.heading * Math.PI / 180 : want;
      const diff = wrapAng(want - e.heading), tr = this.numField(a.turn, 180, ctx) * Math.PI / 180 * dt;
      e.heading = wrapAng(e.heading + Math.max(-tr, Math.min(tr, diff)));
      let v = sp * this.groundFx(e) * (1 - Math.min(0.45, Math.abs(diff) / Math.PI));
      if (e.boostT > 0) { e.boostT -= dt; v *= 1.5; }
      if (!(e.z > 0)) { e.vx = Math.cos(e.heading) * v; e.vy = Math.sin(e.heading) * v; }
      e.speed = v;
      if (Math.hypot(tx - c.x, ty - c.y) < this.numField(a.radius, this.ts * 1.5, ctx)) {
        e.wp++;
        if (e.wp >= pts.length) {
          if (a.loop === false) e.wp = pts.length - 1;
          else { e.wp = 0; e.vars.laps = (+e.vars.laps || 0) + 1; if (this.hasRules(e)) this.entFire(e, 'lap', {}); }
        }
      }
    }
    sysAI(e, dt) {
      const a = e.c.ai;
      if (e.stun > 0) return;
      const ctx = { self: e };
      const sp = this.numField(a.speed, 30, ctx);
      const floats = !this.grav || (e.c.body && e.c.body.gravity === 0);
      const target = () => this.nearest(e, this.strField(a.target, 'player', ctx), this.numField(a.range, 96, ctx));
      switch (a.type || 'patrol') {
        case 'patrol': {
          if (e.dir == null) e.dir = a.dir || -1;
          if (a.axis === 'y') {
            if (e.hitWall) e.dir *= -1;
            e.vy = e.dir * sp; e.vx = 0;
          } else {
            if (e.hitWall) e.dir *= -1;
            if (this.grav && e.onGround && a.edges !== false) {
              const bx = this.box(e);
              const fx = e.dir > 0 ? bx.x + bx.w + 1 : bx.x - 1;
              if (!this.solidAtPx(fx, bx.y + bx.h + 2)) e.dir *= -1;
            }
            e.vx = e.dir * sp;
            if (floats) e.vy = 0;
          }
          break;
        }
        case 'chase': case 'flee': {
          const t = target();
          if (t) {
            const s = a.type === 'flee' ? -1 : 1;
            const ec = this.center(e), tc = this.center(t);
            const dx = tc.x - ec.x, dy = tc.y - ec.y, d = Math.hypot(dx, dy) || 1;
            if (!floats) {
              e.vx = (Math.sign(dx) || 1) * sp * s;
              if (a.jump && e.onGround && (e.hitWall || (tc.y < ec.y - 12 && Math.random() < 0.03))) e.vy = -this.numField(a.jump, 200, ctx);
            } else { e.vx = (dx / d) * sp * s; e.vy = (dy / d) * sp * s; }
          } else if (a.idle === 'wander') this.wander(e, a, dt, floats);
          else if (a.idle === 'patrol') { if (e.dir == null) e.dir = -1; if (e.hitWall) e.dir *= -1; e.vx = e.dir * sp * 0.6; }
          else { e.vx *= 0.8; if (floats) e.vy *= 0.8; }
          break;
        }
        case 'wander': this.wander(e, a, dt, floats); break;
        case 'fly': {
          if (e.dir == null) e.dir = a.dir || -1;
          if (e.hitWall) e.dir *= -1;
          const f = this.numField(a.freq, 3, ctx) || 3;
          e.vx = e.dir * sp;
          e.vy = Math.cos(e.t * f) * this.numField(a.amp, 16, ctx) * f;
          break;
        }
        case 'hop': {
          if (e.onGround) {
            e.vx = 0;
            e.hop = (e.hop ?? 0.5) - dt;
            if (e.hop <= 0) {
              const t = target();
              const dir = t ? Math.sign(this.center(t).x - this.center(e).x) || 1 : Math.random() < 0.5 ? -1 : 1;
              e.vx = dir * sp; e.vy = -this.numField(a.jump, 200, ctx); e.hop = this.numField(a.every, 1.2, ctx) || 1.2; e.onGround = false;
            }
          }
          break;
        }
        case 'turret': e.vx = 0; if (floats) e.vy = 0; break;
        case 'race': case 'path': this.racePath(e, a, dt, sp); return;
      }
      if (Math.abs(e.vx) > 1) e.facing = { x: Math.sign(e.vx), y: 0 };
      else if (floats && Math.abs(e.vy) > 1) e.facing = { x: 0, y: Math.sign(e.vy) };
    }
    wander(e, a, dt, floats) {
      e.wt = (e.wt || 0) - dt;
      if (e.wt <= 0 || e.hitWall) {
        e.wt = 0.8 + Math.random() * 1.5;
        const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
        e.wd = dirs[Math.floor(Math.random() * (floats ? 5 : 3))];
      }
      const sp = a.speed != null ? +a.speed : 30;
      e.vx = e.wd[0] * sp;
      if (floats) e.vy = e.wd[1] * sp;
    }

    sysAttack(e) {
      const a = e.c.attack;
      if (e.cd > 0 || e.stun > 0 || !a.prefab) return;
      const ctx = { self: e };
      const prefab = this.strField(a.prefab, '', ctx);
      if (!prefab) return;
      let fire = false, dir = null;
      if (e.c.control) { const p = I.players[e.c.control.player || 0]; fire = !!(p && p.pressed[a.button || 'b']); }
      else if (a.auto !== false) {
        const t = this.nearest(e, this.strField(a.target, 'player', ctx), this.numField(a.range, 120, ctx));
        if (t) {
          fire = true;
          if (a.aim !== false) {
            const ec = this.center(e), tc = this.center(t);
            const dx = tc.x - ec.x, dy = tc.y - ec.y, d = Math.hypot(dx, dy) || 1;
            dir = { x: dx / d, y: dy / d };
          }
        }
      }
      if (!fire) return;
      e.cd = this.numField(a.cooldown, 0.4, ctx);
      e.atkT = this.numField(a.anim, 0.2, ctx);
      const f = dir || { x: e.facing.x, y: this.grav && e.c.control ? 0 : e.facing.y };
      if (!f.x && !f.y) f.x = e.lastDirX || 1;
      const ec = this.center(e), off = this.numField(a.offset, 12, ctx);
      const p = this.spawn(prefab, 0, 0);
      if (!p) return;
      p.x = ec.x + f.x * off - p.sw / 2;
      p.y = ec.y + f.y * off - p.sh / 2;
      p.facing = { x: f.x, y: f.y };
      p.lastDirX = f.x < 0 ? -1 : 1;
      if (Math.abs(f.y) > Math.abs(f.x) && a.rotate !== false) { p.angle = f.y > 0 ? Math.PI / 2 : -Math.PI / 2; p.lastDirX = 1; }
      else if (dir && a.rotate) { p.angle = Math.atan2(f.y, f.x); p.lastDirX = 1; }
      const pspeed = this.numField(a.speed, 0, ctx);
      if (pspeed) { p.vx = f.x * pspeed; p.vy = f.y * pspeed; }
      if (a.follow) { p.owner = e; p.follow = { x: p.x - e.x, y: p.y - e.y }; }
      p.from = e.id; p.fromTags = [...e.tags];
      this.sound(a.sound);
    }

    sysSpawner(e, dt) {
      const s = e.c.spawner;
      const ctx = { self: e };
      e.st = (e.st ?? this.numField(s.every, 3, ctx)) - dt;
      if (e.st > 0) return;
      e.st = this.numField(s.every, 3, ctx);
      let n = 0;
      for (const o of this.ents.values()) if (!o.dead && o.spawnedBy === e.id) n++;
      if (n >= this.numField(s.max, 5, ctx)) return;
      const prefab = this.strField(s.prefab, '', ctx);
      if (!prefab) return;
      const o = this.spawn(prefab, 0, 0);
      if (!o) return;
      const c = this.center(e);
      o.x = c.x - o.sw / 2 + this.numField(s.dx, 0, ctx) + (Math.random() - 0.5) * this.numField(s.spread, 0, ctx);
      o.y = c.y - o.sh / 2 + this.numField(s.dy, 0, ctx);
      o.home = { x: o.x, y: o.y };
      if (Array.isArray(s.vel)) { o.vx = +s.vel[0] || 0; o.vy = +s.vel[1] || 0; }
      o.spawnedBy = e.id;
    }

    sysEmitter(e, dt) {
      const m = e.c.emitter;
      const ctx = { self: e };
      e.ea = (e.ea || 0) + dt * this.numField(m.rate, 10, ctx);
      const cols = Array.isArray(m.color) ? m.color : [m.color ?? 8];
      while (e.ea >= 1) {
        e.ea--;
        const c = this.center(e);
        const ang = m.angle != null ? (m.angle * Math.PI) / 180 + (Math.random() - 0.5) * (m.spread != null ? (m.spread * Math.PI) / 180 : 0.6) : Math.random() * Math.PI * 2;
        const s = (m.speed != null ? +m.speed : 30) * (0.5 + Math.random() * 0.5);
        this.parts.push({
          x: c.x + (Math.random() - 0.5) * (+m.w || 0), y: c.y + (Math.random() - 0.5) * (+m.h || 0),
          vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: m.life != null ? +m.life : 0.6,
          col: this.col(cols[Math.floor(Math.random() * cols.length)]), g: +m.gravity || 0, size: +m.size || 1,
        });
      }
      if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
    }

    /* ---------------- physics & tiles ---------------- */
    tileAt(tx, ty) {
      if (!this.mapW) return null;
      if (ty < 0) return this.grav ? null : WALL;
      if (ty >= this.mapH) return this.grav ? null : WALL;
      if (tx < 0 || tx >= this.mapW) return WALL;
      const ch = this.map[ty][tx];
      if (ch == null || ch === '.') return null;
      return this.cart.tiles[ch] || null;
    }
    solidAtPx(px, py) {
      const t = this.tileAt(Math.floor(px / this.ts), Math.floor(py / this.ts));
      if (t && (t.solid || t.oneWay)) return true;
      for (const s of this.solids || []) { const b = this.box(s); if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return true; }
      return false;
    }

    sysPhysics(e, dt) {
      const b = e.c.body;
      if (this.grav && b.gravity !== 0) e.vy += this.grav * (b.gravity != null ? +b.gravity : 1) * dt;
      if (!this.grav && e.stun > 0) { e.vx *= 0.86; e.vy *= 0.86; }
      const maxF = b.maxFall != null ? +b.maxFall : 480;
      if (e.vy > maxF) e.vy = maxF;
      const solid = b.solid !== false;
      e.hitWall = false;
      const wasGround = e.onGround;
      e.onGround = false;
      if (wasGround && e.ride && !e.ride.dead) { e.x += e.ride.dx || 0; e.y += e.ride.dy || 0; }
      e.ride = null;
      e.x += e.vx * dt;
      if (solid) this.collideX(e);
      e.prevBottom = e.y + e.hb.oy + e.hb.h;
      e.y += e.vy * dt;
      if (solid) this.collideY(e);
      if (e.c.control && e.c.control.type === 'shmup') {
        e.x = clamp(e.x, this.cam.x - e.hb.ox, this.cam.x + this.W - e.hb.ox - e.hb.w);
        e.y = clamp(e.y, this.cam.y - e.hb.oy, this.cam.y + this.H - e.hb.oy - e.hb.h);
      }
      if (e.onGround && e.c.control) e.safe = { x: e.x, y: e.y };
      if (this.mapH && this.grav && e.y > this.mapH * this.ts + 48) {
        if (this.godFor(e) && e.safe) { e.x = e.safe.x; e.y = e.safe.y - 2; e.vx = e.vy = 0; return; }
        if (e.c.health) { e.c.health.hp = 0; this.syncHp(e); this.kill(e); } else this.destroy(e);
      }
    }
    wallHitX(e) {
      const b = e.c.body;
      e.vx = b.bounce ? -e.vx * b.bounce : 0;
      e.hitWall = true;
    }
    collideX(e) {
      const bx = this.box(e), ts = this.ts;
      if (this.mapW) {
        const y0 = Math.floor(bx.y / ts), y1 = Math.floor((bx.y + bx.h - 0.01) / ts);
        if (e.vx > 0) {
          const tx = Math.floor((bx.x + bx.w - 0.01) / ts);
          for (let ty = y0; ty <= y1; ty++) { const t = this.tileAt(tx, ty); if (t && t.solid && !t.oneWay) { e.x = tx * ts - e.hb.ox - e.hb.w; this.wallHitX(e); break; } }
        } else if (e.vx < 0) {
          const tx = Math.floor(bx.x / ts);
          for (let ty = y0; ty <= y1; ty++) { const t = this.tileAt(tx, ty); if (t && t.solid && !t.oneWay) { e.x = (tx + 1) * ts - e.hb.ox; this.wallHitX(e); break; } }
        }
      }
      for (const s of this.solids || []) {
        if (s === e || s.dead || (s.c.solid && s.c.solid.oneWay)) continue;
        const sb = this.box(s), eb = this.box(e);
        if (!overlap(eb, sb)) continue;
        const dir = e.vx ? Math.sign(e.vx) : (eb.x + eb.w / 2 < sb.x + sb.w / 2 ? 1 : -1);
        e.x = dir > 0 ? sb.x - e.hb.ox - e.hb.w : sb.x + sb.w - e.hb.ox;
        this.wallHitX(e);
      }
    }
    land(e) {
      const b = e.c.body;
      if (b.bounce && e.vy > 40) e.vy = -e.vy * b.bounce;
      else { e.vy = 0; e.onGround = true; }
      if (!this.grav) e.hitWall = true;
    }
    collideY(e) {
      const bx = this.box(e), ts = this.ts;
      if (this.mapW) {
        const x0 = Math.floor(bx.x / ts), x1 = Math.floor((bx.x + bx.w - 0.01) / ts);
        if (e.vy > 0) {
          const ty = Math.floor((bx.y + bx.h - 0.01) / ts);
          for (let tx = x0; tx <= x1; tx++) {
            const t = this.tileAt(tx, ty);
            if (t && (t.solid || t.oneWay) && (!t.oneWay || e.prevBottom <= ty * ts + 0.5)) { e.y = ty * ts - e.hb.oy - e.hb.h; this.land(e); break; }
          }
        } else if (e.vy < 0) {
          const ty = Math.floor(bx.y / ts);
          for (let tx = x0; tx <= x1; tx++) {
            const t = this.tileAt(tx, ty);
            if (t && t.solid && !t.oneWay) {
              e.y = (ty + 1) * ts - e.hb.oy;
              if (t.hit && e.c.control) this.hitTile(tx, ty, t, e);
              e.vy = e.c.body.bounce ? -e.vy * e.c.body.bounce : 0;
              if (!this.grav) e.hitWall = true;
              break;
            }
          }
        }
      }
      for (const s of this.solids || []) {
        if (s === e || s.dead) continue;
        const sb = this.box(s), eb = this.box(e);
        if (!overlap(eb, sb)) continue;
        const oneWay = s.c.solid && s.c.solid.oneWay;
        if (e.vy >= 0 && e.prevBottom <= sb.y + Math.max(3, Math.abs(s.dy || 0) + 2)) {
          e.y = sb.y - e.hb.oy - e.hb.h; this.land(e); e.ride = s;
        } else if (!oneWay) {
          if (e.vy < 0) { e.y = sb.y + sb.h - e.hb.oy; e.vy = 0; }
          else { e.y = sb.y - e.hb.oy - e.hb.h; this.land(e); }
          if (!this.grav) e.hitWall = true;
        }
      }
    }
    hitTile(tx, ty, t, e) {
      const h = t.hit, ts = this.ts, px = tx * ts, py = ty * ts;
      this.haptic('light', e);
      if (h.become != null) this.setTile(tx, ty, h.become);
      this.sound(h.sound);
      if (h.spawn) { const s = this.spawn(h.spawn, 0, 0); if (s) { s.x = px + (ts - s.sw) / 2; s.y = py - s.sh; s.home = { x: s.x, y: s.y }; } }
      if (h.burst) this.burst(px + ts / 2, py + ts / 2, h.burstColor ?? 5, +h.burst);
      if (h.effect) this.effect(h.effect, px + ts / 2, py + ts / 2);
      if (h.drop) this.dropLoot(h.drop, px + ts / 2, py - ts / 2, { self: e, a: e });
      if (h.do) this.exec(h.do, { self: e, a: e, args: { tx, ty } });
      this.fire('break', { self: e, a: e, args: { tx, ty, tile: '' } }, (r) => r.bump === true);
    }
    setTile(tx, ty, ch) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      if (!this.map[ty] || tx < 0 || tx >= this.map[ty].length) return;
      const was = String((this.scene.map || [])[ty] || '')[tx] ?? this.map[ty][tx];
      this.map[ty][tx] = String(ch || '.')[0];
      this.texDirty = true;
      this.tileEdits.push([tx, ty, this.map[ty][tx], was]);
    }

    tilesUnder(e) {
      if (!this.mapW) return '';
      const ts = this.ts, bx = this.box(e);
      const x0 = Math.floor(bx.x / ts), x1 = Math.floor((bx.x + bx.w - 0.01) / ts);
      const y0 = Math.floor(bx.y / ts), y1 = Math.floor((bx.y + bx.h + 0.5) / ts);
      let set = '';
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (ty < 0 || ty >= this.mapH || tx < 0 || tx >= this.mapW) continue;
        const ch = this.map[ty][tx], t = this.cart.tiles[ch];
        if (!t || set.includes(ch)) continue;
        if (ty * ts < bx.y + bx.h || t.solid) set += ch;
      }
      return set;
    }
    sysTiles(ents) {
      if (!this.mapW) return;
      const ts = this.ts;
      const tileRules = this.allRules.filter((r) => r.on === 'tile');
      for (const e of ents) {
        if (e.dead || !e.c.body) continue;
        const bx = this.box(e);
        const x0 = Math.floor(bx.x / ts), x1 = Math.floor((bx.x + bx.w - 0.01) / ts);
        const y0 = Math.floor(bx.y / ts), y1 = Math.floor((bx.y + bx.h + 0.5) / ts);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (ty < 0 || ty >= this.mapH || tx < 0 || tx >= this.mapW) continue;
          const t = this.cart.tiles[this.map[ty][tx]];
          if (!t) continue;
          const inside = ty * ts < bx.y + bx.h;
          if (!inside && !t.solid) continue;
          if (t.hurt && e.c.health) this.damage(e, +t.hurt || 1, { x: tx * ts + ts / 2, y: ty * ts + ts / 2 });
          if (t.kill && e.c.health && !e.dead && !this.godFor(e)) { e.c.health.hp = 0; this.syncHp(e); this.kill(e); }
        }
        const set = this.tilesUnder(e);
        if (tileRules.length) {
          const prev = e.tset || '';
          for (const ch of set) if (!prev.includes(ch)) for (const r of tileRules) if (r.tile === ch && (!r.tag || e.tags.has(r.tag))) this.runRule(r, { self: e, a: e });
        }
        if (this.hasRules(e)) { const prev = e.tset || ''; for (const ch of set) if (!prev.includes(ch)) this.entFire(e, 'tile', {}, (r) => r.tile === ch); }
        e.tset = set;
      }
    }

    sysOverlap(ents) {
      const list = ents.filter((e) => !e.dead && !e.dying && !e.c.noCollide);
      const now = new Set();
      const rules = this.allRules.filter((r) => r.on === 'collide');
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (a.dead || b.dead) continue;
          const pad = a.c.solid || b.c.solid ? 1 : 0; // pressing against something solid counts as touching it
          const A = this.box(a), B = this.box(b);
          if (!(A.x < B.x + B.w + pad && A.x + A.w + pad > B.x && A.y < B.y + B.h + pad && A.y + A.h + pad > B.y)) continue;
          const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
          now.add(key);
          const isNew = !this.pairs.has(key);
          this.interact(a, b, isNew);
          if (!a.dead && !b.dead) this.interact(b, a, isNew);
          if (isNew) {
            if (a.rules) this.entFire(a, 'touch', { other: b }, (r) => !r.tag || b.tags.has(r.tag));
            if (b.rules && !b.dead) this.entFire(b, 'touch', { other: a }, (r) => !r.tag || a.tags.has(r.tag));
          }
          if (isNew) for (const r of rules) {
            if (a.tags.has(r.a) && b.tags.has(r.b)) this.runRule(r, { a, b, self: a });
            else if (b.tags.has(r.a) && a.tags.has(r.b)) this.runRule(r, { a: b, b: a, self: b });
          }
        }
      }
      this.pairs = now;
    }
    interact(s, d, isNew) {
      const c = s.c;
      if (s.dead || d.dead) return;
      if (c.stompable && d.c.control && d.c.body && d.vy > 0 && d.prevBottom != null && d.prevBottom <= this.box(s).y + 6) {
        this.damage(s, c.stompable.damage != null ? +c.stompable.damage : 1, null, true);
        d.vy = -(c.stompable.bounce != null ? +c.stompable.bounce : 220);
        d.onGround = false; d.stompT = 0.12;
        this.haptic('medium', d);
        this.sound(c.stompable.sound || 'stomp');
        return;
      }
      if (c.hurt && hasTag(d, c.hurt.targets || ['player']) && s.from !== d.id && !(d.stompT > 0 && c.stompable)) {
        const hit = this.damage(d, c.hurt.damage != null ? +c.hurt.damage : 1, s);
        if (hit && c.hurt.destroy) this.destroy(s);
      }
      if (c.pickup && hasTag(d, c.pickup.targets || ['player'])) {
        const p = c.pickup;
        if (p.var) this.vars[p.var] = (+this.vars[p.var] || 0) + (p.add != null ? +p.add : 1);
        if (p.heal && d.c.health) { const h = d.c.health; h.hp = Math.min(h.max, h.hp + +p.heal); this.syncHp(d); }
        this.sound(p.sound);
        this.haptic('light', d);
        if (p.do) this.exec(p.do, { self: s, a: d, b: s, other: d });
        const cc = this.center(s);
        this.burst(cc.x, cc.y, p.burstColor ?? [8, 21], 6);
        this.destroy(s);
      }
      if (c.warp && isNew && hasTag(d, c.warp.targets || ['player']) && !this.pendingScene) {
        this.sound(c.warp.sound);
        this.pendingScene = { name: c.warp.scene, tx: c.warp.tx, ty: c.warp.ty, x: c.warp.x, y: c.warp.y, at: c.warp.at };
      }
    }

    damage(e, amt, src, noKnock) {
      const h = e.c.health;
      if (!h || e.dead || e.invuln > 0 || !(amt > 0)) return false;
      if (this.godFor(e)) { e.invuln = 0.5; e.flash = 0.12; return false; }
      h.hp -= amt;
      e.invuln = h.invuln != null ? +h.invuln : 0.5;
      e.flash = 0.12;
      this.syncHp(e);
      if (src && !noKnock) {
        const kb = (src.c && src.c.hurt && src.c.hurt.knockback != null) ? +src.c.hurt.knockback : (h.knockback != null ? +h.knockback : 120);
        if (kb) {
          const sc = src.c ? this.center(src) : src, ec = this.center(e);
          const dx = ec.x - sc.x, dy = ec.y - sc.y;
          if (this.grav) { e.vx = (Math.sign(dx) || 1) * kb; e.vy = -kb * 0.6; e.onGround = false; }
          else { const d = Math.hypot(dx, dy) || 1; e.vx = (dx / d) * kb; e.vy = (dy / d) * kb; }
          e.stun = 0.18;
        }
      }
      if (e.c.control) this.haptic('heavy', e);
      if (h.hitEffect) { const c = this.center(e); this.effect(h.hitEffect, c.x, c.y); }
      if (this.hasRules(e)) this.entFire(e, 'hit', { other: src && src.c ? src : null, args: { amount: amt } });
      if (h.hp <= 0) this.kill(e);
      else if (!e.dead) this.sound(h.hurtSound || 'hurt');
      return true;
    }
    godFor(e) { return !!(this.dev.god && e.c.control); }
    syncHp(e) { const h = e.c.health; if (h && h.var) this.vars[h.var] = Math.max(0, h.hp); }
    kill(e) {
      if (e.dead || e.dying) return;
      const h = e.c.health || {};
      this.sound(h.deathSound || 'die');
      const cc = this.center(e);
      if (h.burst !== false) this.burst(cc.x, cc.y, h.burstColor ?? [21, 23], h.burst != null && h.burst !== true ? +h.burst : 12);
      if (h.effect) this.effect(h.effect, cc.x, cc.y);
      if (e.c.control) this.haptic('error', e);
      e._deathCancelled = false;
      if (this.hasRules(e)) this.entFire(e, 'die', {});
      if (e._deathCancelled) { e._deathCancelled = false; return; } // a state's "die" rule called {"cancelDeath":true} — stays alive, in whatever state it moved to
      if (h.onDeath) this.exec(h.onDeath, { self: e, a: e });
      if (e._deathCancelled) { e._deathCancelled = false; return; }
      // a "die" animation plays before the entity is removed
      const sp = e.c.sprite, A = sp && sp.anim;
      const seq = A && (A.die || A.death);
      const dur = h.dieTime != null ? +h.dieTime : seq && seq.length ? seq.length / (sp.fps != null ? +sp.fps : 6) : 0;
      if (dur > 0) { e.dying = dur; e.vx = 0; if (!this.grav) e.vy = 0; e.invuln = 0; e.state = ''; return; }
      this.finishKill(e);
    }
    finishKill(e) {
      const h = e.c.health || {};
      if (h.drop) {
        const cc = this.center(e);
        const table = typeof h.drop === 'string' && h.dropChance != null ? [{ prefab: h.drop, chance: +h.dropChance }] : h.drop;
        this.dropLoot(table, cc.x, cc.y, { self: e, a: e });
      }
      e.dying = 0;
      this.destroy(e);
    }

    /* ---------------- loot & effects ---------------- */
    /* "coin" · ["coin","coin","heart"] · [{"prefab":"heart","chance":0.3},{"prefab":"coin","count":[1,3]}]
       · {"one":[{"prefab":"heart","weight":1},{"prefab":"rupee","weight":3},{"prefab":null,"weight":2}]} */
    rollLoot(table, ctx, out) {
      if (table == null) return out;
      if (typeof table === 'string') { out.push(table); return out; }
      if (Array.isArray(table)) { for (const t of table) this.rollLoot(t, ctx, out); return out; }
      if (typeof table !== 'object') return out;
      if (Array.isArray(table.one)) {
        const opts = table.one.filter((o) => o != null);
        const wt = (o) => (typeof o === 'object' ? Math.max(0, +this.ev(o.weight ?? 1, ctx) || 0) : 1);
        let r = Math.random() * opts.reduce((n, o) => n + wt(o), 0);
        for (const o of opts) { r -= wt(o); if (r < 0) { if (typeof o === 'string') out.push(o); else if (o.prefab) this.rollLoot(Object.assign({}, o, { weight: undefined }), ctx, out); break; } }
        return out;
      }
      if (!table.prefab) return out;
      if (table.if != null && !this.cond(table.if, ctx)) return out;
      if (table.chance != null && Math.random() >= +this.ev(table.chance, ctx)) return out;
      let n = table.count == null ? 1 : Array.isArray(table.count) ? Math.floor(+table.count[0] + Math.random() * (+table.count[1] - +table.count[0] + 1)) : +this.ev(table.count, ctx) || 0;
      n = Math.max(0, Math.min(50, n));
      for (let i = 0; i < n; i++) out.push(table.prefab);
      return out;
    }
    dropLoot(table, cx, cy, ctx) {
      const list = this.rollLoot(table, ctx || {}, []);
      const n = list.length;
      list.forEach((name, i) => {
        const d = this.spawn(name, 0, 0);
        if (!d) return;
        const ang = n > 1 ? (i / n) * Math.PI * 2 + Math.random() * 0.5 : 0, r = n > 1 ? 5 + Math.random() * 4 : 0;
        d.x = cx - d.sw / 2 + Math.cos(ang) * r; d.y = cy - d.sh / 2 + Math.sin(ang) * r;
        if (d.c.body && d.c.body.solid !== false && this.grav) { d.vy = -140 - Math.random() * 60; d.vx = Math.cos(ang) * 50; }
        else if (d.c.body) { d.vz = 90 + Math.random() * 40; }
        d.home = { x: d.x, y: d.y };
      });
      return list;
    }
    /* one-shot animation: a sprite name (plays its frames once) or a prefab name */
    effect(name, cx, cy, opts = {}) {
      if (!name) return null;
      if (typeof name === 'object') { opts = name; name = name.name || name.sprite || name.prefab; }
      let e;
      if (this.cart.prefabs[name]) e = this.spawn(name, 0, 0);
      else if (this.frames[name]) {
        const n = this.frames[name].length, fps = +opts.fps || 12;
        e = this.spawn(null, 0, 0, { tags: ['effect'], noCollide: true, layer: opts.layer != null ? +opts.layer : 1, lifetime: { t: n / fps },
          sprite: { name, fps, loop: false, noFlip: true, anim: { idle: [...Array(n).keys()] } } });
      } else { this.warn(`Effect "${name}" is not a sprite or prefab`); return null; }
      if (!e) return null;
      e.x = cx - e.sw / 2 + (+opts.dx || 0); e.y = cy - e.sh / 2 + (+opts.dy || 0); e.home = { x: e.x, y: e.y };
      return e;
    }

    /* ---------------- breakable tiles ---------------- */
    breakOpts(t) { return t && t.break ? (t.break === true ? {} : t.break) : null; }
    canBreak(b, attacker) {
      if (attacker.c.hurt && attacker.c.hurt.breaks === false) return false;
      const by = b.by == null ? ['player'] : b.by;
      if (by === 'any' || (Array.isArray(by) && by.includes('any'))) return true;
      const list = Array.isArray(by) ? by : [by];
      const owner = attacker.from != null ? this.ents.get(attacker.from) : null;
      return list.some((t) => attacker.tags.has(t) || (owner && owner.tags.has(t)) || (attacker.fromTags && attacker.fromTags.includes(t)));
    }
    sysTileBreak(ents) {
      if (!this.mapW) return;
      const ts = this.ts;
      for (const e of ents) {
        if (e.dead || e.dying || !e.c.hurt) continue;
        const bx = this.box(e);
        const x0 = Math.floor(bx.x / ts), x1 = Math.floor((bx.x + bx.w - 0.01) / ts);
        const y0 = Math.floor(bx.y / ts), y1 = Math.floor((bx.y + bx.h - 0.01) / ts);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (ty < 0 || ty >= this.mapH || tx < 0 || tx >= this.mapW) continue;
          const t = this.cart.tiles[this.map[ty][tx]], b = this.breakOpts(t);
          if (!b || !this.canBreak(b, e)) continue;
          const key = tx + ',' + ty;
          e.brokeCells = e.brokeCells || new Set();
          if (e.brokeCells.has(key)) continue; // one hit per swing
          e.brokeCells.add(key);
          this.tileHp = this.tileHp || {};
          const hp = (this.tileHp[key] ?? (b.hp != null ? +b.hp : 1)) - (e.c.hurt.damage != null ? +e.c.hurt.damage : 1);
          if (hp > 0) {
            this.tileHp[key] = hp;
            this.sound(b.hitSound); if (b.hitEffect) this.effect(b.hitEffect, tx * ts + ts / 2, ty * ts + ts / 2);
            this.burst(tx * ts + ts / 2, ty * ts + ts / 2, b.burstColor ?? [23, 21], 3);
            continue;
          }
          delete this.tileHp[key];
          this.breakTile(tx, ty, e);
          if (e.c.hurt.destroy) { this.destroy(e); break; }
        }
      }
    }
    breakTile(tx, ty, by) {
      const ts = this.ts, ch = this.map[ty] && this.map[ty][tx], t = this.cart.tiles[ch], b = this.breakOpts(t) || {};
      const cx = tx * ts + ts / 2, cy = ty * ts + ts / 2;
      this.setTile(tx, ty, b.become != null ? b.become : '.');
      this.sound(b.sound);
      const owner = by && by.from != null ? this.ents.get(by.from) : by;
      if (owner && owner.c && owner.c.control) this.haptic(b.haptic || 'light', owner);
      if (b.burst !== false && b.burst !== 0) this.burst(cx, cy, b.burstColor ?? [4, 6], b.burst != null && b.burst !== true ? +b.burst : 8);
      if (b.effect) this.effect(b.effect, cx, cy);
      const ctx = { self: owner || by, a: owner || by, other: by, args: { tx, ty, tile: ch } };
      if (b.drop) this.dropLoot(b.drop, cx, cy, ctx);
      if (b.do) this.exec(b.do, ctx);
      this.fire('break', ctx, (r) => !r.tile || r.tile === ch);
    }

    /* ---------------- talk / dialogue ---------------- */
    sysTalk(ents) {
      for (const e of ents) {
        if (e.dead || !e.c.talk) continue;
        const t = e.c.talk;
        const pl = this.nearest(e, 'player', t.range != null ? +t.range : 22, true);
        e.canTalk = !!pl;
        if (!pl) continue;
        const pi = pl.c.control.player || 0;
        const btn = t.button || 'a';
        if (I.players[pi].pressed[btn]) {
          I.consume(btn);
          const ctx = { self: e, a: e, other: pl };
          // first branch whose "if" is true replaces the default lines (and its "do" replaces "then")
          let lines = t.lines, then = t.then, name = t.name;
          const br = Array.isArray(t.branches) ? t.branches.find((b) => b && (b.if == null || this.cond(b.if, ctx))) : null;
          if (br) { lines = br.lines != null ? br.lines : lines; then = br.do !== undefined ? br.do : br.then !== undefined ? br.then : null; if (br.name != null) name = br.name; }
          this.openDialog(lines, e, then, name, ctx);
          if (this.dialog) this.dialog.talker = e;
          else e.vars.talks = (+e.vars.talks || 0) + 1;
          if (t.once) { e.c.talk = null; e.canTalk = false; }
          return;
        }
      }
    }
    /* lines: "text" or {"text","if","name","do","choices":[{"text","if","do","lines","cancel"}]} */
    normLines(lines) {
      if (lines == null) return [];
      if (!Array.isArray(lines)) lines = [lines];
      return lines.filter((x) => x != null).map((x) => (typeof x === 'object' ? x : { text: String(x) }));
    }
    openDialog(lines, who, then, name, ctx) {
      ctx = ctx || { self: who, a: who };
      const q = this.normLines(lines);
      const d = { q, cur: null, n: 0, sel: 0, choices: null, then, name: name ? this.fmt(name, ctx) : null, who, ctx };
      this.dialog = d;
      if (!this.nextLine()) { if (this.dialog === d) this.endDialog(); return; }
      this.sound('talk');
    }
    /* advance to the next line whose condition holds, running its actions */
    nextLine() {
      const d = this.dialog;
      while (d && d.q.length) {
        const L = d.q.shift();
        if (L.if != null && !this.cond(L.if, d.ctx)) continue;
        if (L.do) { d.ins = 0; this.exec(L.do, d.ctx); if (this.dialog !== d) return !!this.dialog; }
        const ch = Array.isArray(L.choices) ? L.choices.filter((c) => c && (c.if == null || this.cond(c.if, d.ctx))) : null;
        if (L.text == null && !(ch && ch.length)) continue; // an action-only step
        d.cur = L; d.n = 0; d.sel = 0; d.choices = ch && ch.length ? ch : null;
        return true;
      }
      return false;
    }
    endDialog() {
      const d = this.dialog;
      this.dialog = null;
      if (!d) return;
      if (d.talker) d.talker.vars.talks = (+d.talker.vars.talks || 0) + 1;
      if (d.then) this.exec(d.then, d.ctx);
    }
    updateDialog(dt) {
      const d = this.dialog;
      if (!d.cur) { if (!this.nextLine()) this.endDialog(); return; }
      const full = this.fmt(d.cur.text ?? '', d.ctx);
      d.n = Math.min(full.length, d.n + dt * 45);
      let ok = false, back = false, up = false, down = false;
      for (const p of I.players) { if (p.pressed.a) ok = true; if (p.pressed.b) back = true; if (p.pressed.up) up = true; if (p.pressed.down) down = true; }
      const typing = d.n < full.length;
      if (d.choices && !typing) {
        const n = d.choices.length;
        if (up || down) { d.sel = (d.sel + (up ? -1 : 1) + n) % n; this.sound(this.cart.sounds.select ? 'select' : 'talk'); if (DC.Haptics) DC.Haptics.tap(); }
        if (back) { const ci = d.choices.findIndex((c) => c.cancel); if (ci >= 0) { d.sel = ci; ok = true; } }
        if (!ok) return;
        I.consume('a'); I.consume('b');
        const c = d.choices[d.sel];
        d.choices = null;
        const reply = c.lines != null ? this.normLines(c.lines) : [];
        d.q.unshift(...reply);
        if (c.do) { d.ins = reply.length; this.exec(c.do, d.ctx); if (this.dialog !== d) return; }
        if (!this.nextLine()) { if (this.dialog === d) this.endDialog(); } else this.sound('talk');
        return;
      }
      if (!(ok || back)) return;
      I.consume('a'); I.consume('b');
      if (typing) { d.n = full.length; return; }
      if (!this.nextLine()) { if (this.dialog === d) this.endDialog(); } else this.sound('talk');
    }

    /* ---------------- expressions ---------------- */
    /* The whitelist an expression can see. Entities are wrapped so only game fields are readable. */
    wrapEnt(e) { return e ? (e.__w || (e.__w = { __ent: true, e })) : null; }
    exprEnv(ctx) {
      ctx = ctx || {};
      const eng = this;
      return {
        engine: eng, self: ctx.self || ctx.a || null,
        wrap: (e) => eng.wrapEnt(e),
        playerIdx: () => (ctx.self && ctx.self.c.control ? ctx.self.c.control.player || 0 : ctx.player || 0),
        point: (v) => (v && v.__ent ? eng.center(v.e) : v && typeof v === 'object' && 'x' in v ? v : null),
        name(n) {
          if (ctx.args && Object.prototype.hasOwnProperty.call(ctx.args, n)) return ctx.args[n];
          switch (n) {
            case 'self': return eng.wrapEnt(ctx.self || ctx.a);
            case 'other': return eng.wrapEnt(ctx.other || ctx.b);
            case 'a': return eng.wrapEnt(ctx.a);
            case 'b': return eng.wrapEnt(ctx.b);
            case 'player': return eng.wrapEnt(eng.playerEnt(ctx.player));
            case 'time': return eng.t;
            case 'dt': return DT;
            case 'frame': return eng.frame;
            case 'scene': return eng.sceneName;
            case 'tilt': return { x: DC.Motion ? DC.Motion.x : 0, y: DC.Motion ? DC.Motion.y : 0, on: !!(DC.Motion && DC.Motion.on) };
            case 'cam': return { x: eng.cam.x, y: eng.cam.y };
            case 'screen': return { w: eng.W, h: eng.H };
            case 'map': return { w: eng.mapW, h: eng.mapH, tile: eng.ts };
          }
          const v = eng.vars[n];
          return v === undefined ? 0 : v;
        },
        prop(e, k) {
          switch (k) {
            case 'x': case 'y': case 'vx': case 'vy': return e[k];
            case 'cx': return e.x + e.sw / 2;
            case 'cy': return e.y + e.sh / 2;
            case 'w': return e.sw;
            case 'h': return e.sh;
            case 'tx': return Math.floor((e.x + e.sw / 2) / eng.ts);
            case 'ty': return Math.floor((e.y + e.sh - 1) / eng.ts);
            case 'hp': return e.c && e.c.health ? e.c.health.hp : 0;
            case 'maxhp': return e.c && e.c.health ? e.c.health.max : 0;
            case 'onGround': return !!e.onGround;
            case 'dir': return (e.facing && e.facing.x) || e.lastDirX || 1;
            case 'diry': return (e.facing && e.facing.y) || 0;
            case 'age': return e.t;
            case 'id': return e.id;
            case 'alive': return !e.dead;
            case 'prefab': return e.prefab;
            case 'player': return e.c && e.c.control ? (e.c.control.player || 0) + 1 : 0;
            case 'sprite': return (e.c && e.c.sprite && e.c.sprite.name) || '';
            case 'mode': return e.mode || '';
            case 'z': return e.z || 0;
            case 'heading': return e.heading != null ? Math.round(e.heading * 180 / Math.PI * 100) / 100 : 0;
            case 'speed': return e.speed != null ? e.speed : Math.hypot(e.vx || 0, e.vy || 0);
            case 'wp': return e.wp || 0;
          }
          const v = e.vars ? e.vars[k] : undefined;
          return v === undefined ? 0 : v;
        },
      };
    }
    playerEnt(idx) {
      for (const e of this.ents.values()) if (!e.dead && e.c.control && (e.c.control.player || 0) === (idx || 0)) return e;
      return this.first('player');
    }
    /* "=formula" strings are evaluated; everything else passes through */
    ev(v, ctx) {
      if (!isFormula(v)) return v;
      try { return DC.Expr.evaluate(v, this.exprEnv(ctx)); }
      catch (err) { this.warn(`Formula "${v.slice(0, 60)}": ${err.message}`); return undefined; }
    }
    test(src, ctx) {
      try { return DC.Expr.truthy(DC.Expr.evaluate(src, this.exprEnv(ctx))); }
      catch (err) { this.warn(`Condition "${String(src).slice(0, 60)}": ${err.message}`); return false; }
    }
    /* text with {var} or {any expression} */
    fmt(s, ctx) {
      return String(s ?? '').replace(/\{([^{}]+)\}/g, (m, inner) => {
        if (/^\w+$/.test(inner) && inner in this.vars) return DC.Expr.str(this.vars[inner]);
        try { return DC.Expr.str(DC.Expr.evaluate(inner, this.exprEnv(ctx))); } catch (e) { return m; }
      });
    }
    /* read / write "coins", "inv.seeds", "self.stage", "other.hp", "player.x" */
    getPath(path, ctx) {
      const parts = String(path).split('.');
      const head = parts[0];
      const ent = this.pathEnt(head, ctx);
      if (ent !== undefined) {
        if (!ent) return 0;
        return parts.length > 1 ? this.exprEnv(ctx).prop(ent, parts.slice(1).join('.')) : 0;
      }
      let o = this.vars;
      for (const k of parts) { if (o == null || typeof o !== 'object' || BLOCK.has(k)) return 0; o = o[k]; }
      return o === undefined ? 0 : o;
    }
    setPath(path, value, ctx) {
      const parts = String(path).split('.');
      if (parts.some((k) => BLOCK.has(k))) return;
      const ent = this.pathEnt(parts[0], ctx);
      if (ent !== undefined) {
        if (!ent || parts.length < 2) return;
        const k = parts.slice(1).join('.');
        const n = +value || 0;
        switch (k) {
          case 'x': case 'y': case 'vx': case 'vy': ent[k] = n; return;
          case 'hp': if (ent.c.health) { ent.c.health.hp = Math.min(n, ent.c.health.max); this.syncHp(ent); if (ent.c.health.hp <= 0) this.kill(ent); } return;
          case 'maxhp': if (ent.c.health) ent.c.health.max = n; return;
          case 'dir': ent.facing = { x: Math.sign(n) || 1, y: 0 }; ent.dir = Math.sign(n) || 1; return;
          case 'z': ent.z = Math.max(0, n); return;
          case 'vz': ent.vz = n; return;
          case 'heading': ent.heading = n * Math.PI / 180; return;
        }
        ent.vars[k] = value;
        return;
      }
      let o = this.vars;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      o[parts[parts.length - 1]] = value;
    }
    pathEnt(head, ctx) {
      switch (head) {
        case 'self': return ctx.self || ctx.a || null;
        case 'other': return ctx.other || ctx.b || null;
        case 'a': return ctx.a || null;
        case 'b': return ctx.b || null;
        case 'player': return this.playerEnt(ctx.player);
      }
      return undefined;
    }

    /* ---------------- rules ---------------- */
    fire(ev, ctx, match) {
      for (const r of this.allRules || []) if (r.on === ev && (!match || match(r))) this.runRule(r, ctx);
      if (ev !== 'start') for (const e of [...this.ents.values()]) if (!e.dead && this.hasRules(e)) this.entFire(e, ev, Object.assign({}, ctx, { self: e }), match);
    }
    entFire(e, ev, ctx, match) {
      const lists = [];
      if (e.rules) lists.push(e.rules);
      const sr = this.stateRules(e);
      if (sr) lists.push(sr);
      for (const list of lists) for (const r of list) if (r.on === ev && (!match || match(r))) { this.runRule(r, Object.assign({ self: e, a: e }, ctx)); if (e.dead && ev !== 'die') return; }
    }
    /* the current state's own rules, prepared once per state (cached until the state changes) */
    hasRules(e) { return !!(e.rules || (e.baseC && e.baseC.states)); }
    stateRules(e) {
      if (!e.baseC || !e.baseC.states || !e.mode) return null;
      const sd = e.baseC.states[e.mode];
      if (!sd || !Array.isArray(sd.rules) || !sd.rules.length) return null;
      if (e._stateRulesMode !== e.mode) { e._stateRules = this.prepRules(sd.rules); e._stateRulesMode = e.mode; }
      return e._stateRules;
    }
    /* switch an entity's state machine: runs the old state's exit actions, remerges components
       from the new state's overlay, then the new state's enter actions. "silent" (used when
       restoring a save) skips enter/exit so nothing fires twice. */
    enterState(e, name, silent) {
      if (!e || e.dead || !e.baseC || !e.baseC.states) return;
      name = String(name);
      const states = e.baseC.states;
      if (!states[name]) { this.warn(`No state "${name}" on ${e.prefab || 'entity'}`); return; }
      if (name === e.mode) return;
      const old = e.mode && states[e.mode];
      if (!silent && old && old.exit) { this.exec(old.exit, { self: e, a: e }); if (e.dead) return; }
      e.mode = name;
      e._stateRulesMode = null;
      this.applyComponents(e, e.baseC, false);
      const sd = states[name];
      if (!silent && sd && sd.enter) this.exec(sd.enter, { self: e, a: e });
    }
    /* rule-level "if" / "else": {"on":"tile","tile":"F","if":"cp == 1","do":[…],"else":[…]} */
    runRule(r, ctx) {
      if (r.on !== 'when' && r.if != null) this.exec(this.cond(r.if, ctx) ? r.do : r.else, ctx);
      else this.exec(r.do, ctx);
    }
    runTimers(dt) {
      if (!this.timers.length) return;
      const due = [];
      this.timers = this.timers.filter((t) => { t.t -= dt; if (t.t <= 0) { due.push(t); return false; } return true; });
      for (const t of due) this.exec(t.then, t.ctx);
    }
    tickRule(r, dt, ctx, playerIdx) {
      switch (r.on) {
        case 'update': this.runRule(r, ctx); break;
        case 'every': {
          const iv = +this.ev(r.t ?? r.every ?? 1, ctx) || 1;
          r._t = (r._t || 0) + dt;
          if (r._t >= iv) { r._t -= iv; this.runRule(r, ctx); }
          break;
        }
        case 'after':
          if (!r._done) { r._t = (r._t || 0) + dt; if (r._t >= (+this.ev(r.t, ctx) || 1)) { r._done = true; this.runRule(r, ctx); } }
          break;
        case 'button':
          for (let i = 0; i < 4; i++) {
            if (playerIdx != null && playerIdx !== i) continue;
            if (r.player != null && +r.player !== i) continue;
            if (I.players[i].pressed[r.button]) { this.runRule(r, Object.assign({}, ctx, { player: i })); break; }
          }
          break;
        case 'var': case 'count': case 'when': {
          const v = this.ruleCond(r, ctx), was = r._was;
          r._was = v; // record first: the actions may rebuild this entity's rules
          if (v && !was) this.runRule(r, ctx);
          break;
        }
      }
    }
    rulesTick(dt) {
      for (const r of this.allRules) this.tickRule(r, dt, {}, null);
      if (DC.Motion && DC.Motion.shakes !== this.shakeSeen) {
        if (this.shakeSeen != null) this.fire('shake', {});
        this.shakeSeen = DC.Motion.shakes;
      }
    }
    entRulesTick(e, dt) {
      if (e.born) { e.born = false; this.entFire(e, 'spawn', {}); if (e.dead) return; }
      const ctx = { self: e, a: e };
      const pi = e.c.control ? e.c.control.player || 0 : null;
      if (e.rules) for (const r of e.rules) { this.tickRule(r, dt, ctx, pi); if (e.dead) return; }
      const sr = this.stateRules(e);
      if (sr) for (const r of sr) { this.tickRule(r, dt, ctx, pi); if (e.dead) return; }
    }
    ruleCond(r, ctx) {
      if (r.on === 'when') return this.cond(r.if, ctx);
      if (r.on === 'count') return this.cond({ count: r.tag ?? r.count, op: r.op, value: r.value }, ctx);
      return this.cond({ var: r.var, op: r.op, value: r.value }, ctx);
    }
    cond(c, ctx) {
      if (c == null) return true;
      if (typeof c === 'string') return this.test(c, ctx);
      if (Array.isArray(c)) return c.every((x) => this.cond(x, ctx));
      if (typeof c !== 'object') return !!c;
      if (c.all) return c.all.every((x) => this.cond(x, ctx));
      if (c.any) return c.any.some((x) => this.cond(x, ctx));
      if (c.not) return !this.cond(c.not, ctx);
      if (c.chance != null) return Math.random() < +this.ev(c.chance, ctx);
      const lhs = c.var != null ? this.getPath(c.var, ctx || {}) : c.count != null ? this.count(c.count) : 0;
      if (c.op == null && c.value == null) return !!lhs;
      let rhs = this.ev(c.value ?? 0, ctx);
      if (typeof rhs === 'string' && rhs in this.vars) rhs = this.vars[rhs];
      return DC.cmp(lhs, c.op || '==', rhs);
    }
    val(v, ctx) {
      if (isFormula(v)) return this.ev(v, ctx);
      if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k in v) { if (BLOCK.has(k)) continue; const r = this.val(v[k], ctx); if (r !== undefined) o[k] = r; } return o; }
      if (Array.isArray(v) && !(v.length === 2 && typeof v[0] === 'number')) return v.map((x) => this.val(x, ctx));
      if (typeof v === 'string' && v in this.vars) return this.vars[v];
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') return Math.floor(v[0] + Math.random() * (v[1] - v[0] + 1));
      return v;
    }
    refs(r, ctx) {
      if (r == null || r === true) return ctx.self ? [ctx.self] : [];
      if (r === 'a' || r === 'b' || r === 'self') { const e = r === 'self' ? ctx.self || ctx.a : ctx[r]; return e && !e.dead ? [e] : []; }
      if (r === 'other') { const e = ctx.other || ctx.b; return e && !e.dead ? [e] : []; }
      if (r && typeof r === 'object' && r.__ent) return r.e.dead ? [] : [r.e];
      const tag = String(r).replace(/^(tag:|all:)/, '');
      return [...this.ents.values()].filter((e) => !e.dead && e.tags.has(tag));
    }
    exec(list, ctx) {
      if (!list) return;
      if (!Array.isArray(list)) list = [list];
      ctx = ctx || {};
      for (const a of list) {
        if (!a || typeof a !== 'object') continue;
        try { this.act(a, ctx); } catch (err) { this.warn('Action failed: ' + JSON.stringify(a).slice(0, 80) + ' — ' + err.message); }
      }
    }
    act(raw, ctx) {
      if ('if' in raw) { this.exec(this.cond(raw.if, ctx) ? raw.then : raw.else, ctx); return; }
      if ('switch' in raw) {
        for (const c of Array.isArray(raw.switch) ? raw.switch : []) {
          if (!c || typeof c !== 'object') continue;
          if (c.if == null || this.cond(c.if, ctx)) { this.exec(c.then ?? c.do ?? c.else, ctx); break; }
        }
        return;
      }
      // evaluate "=formula" fields once, up front
      const a = {};
      for (const k in raw) a[k] = k === 'then' || k === 'else' || k === 'do' || k === 'value' || k === 'op' || k === 'drop' ? raw[k] : this.ev(raw[k], ctx);
      if ('wait' in a) { this.timers.push({ t: +a.wait || 0, then: a.then || a.do, ctx }); return; }
      if ('set' in a) { const v = this.val(a.value, ctx); if (v !== undefined) this.setPath(a.set, v, ctx); }
      if ('add' in a) {
        const cur = this.getPath(a.add, ctx), d = this.val(a.value ?? 1, ctx);
        if (d !== undefined) this.setPath(a.add, typeof cur === 'string' || typeof d === 'string' ? DC.Expr.str(cur) + DC.Expr.str(d) : (+cur || 0) + (+d || 0), ctx);
      }
      if ('push' in a) { const cur = this.getPath(a.push, ctx); const list = Array.isArray(cur) ? cur.slice() : []; list.push(this.val(a.value, ctx)); this.setPath(a.push, list, ctx); }
      if ('remove' in a) { const cur = this.getPath(a.remove, ctx); if (Array.isArray(cur)) { const v = this.val(a.value, ctx); const i = cur.findIndex((x) => DC.Expr.str(x) === DC.Expr.str(v)); if (i >= 0) { const l = cur.slice(); l.splice(i, 1); this.setPath(a.remove, l, ctx); } } }
      if ('reset' in a && a.reset) this.vars = DC.clone(this.cart.vars) || {};
      if ('sound' in a) this.sound(a.sound);
      if ('music' in a) { if (a.music) AU.playMusic(a.music, this.cart.music[a.music]); else AU.stopMusic(); }
      if ('spawn' in a) {
        const e = this.spawn(a.spawn, 0, 0, a.with);
        if (e) {
          if (a.tx != null) this.placeOnTile(e, +a.tx, +a.ty || 0);
          else if (a.x != null) { e.x = +a.x; e.y = +a.y || 0; }
          else {
            const base = this.refs(a.at || 'self', ctx)[0];
            if (base) { const c = this.center(base); e.x = c.x - e.sw / 2 + (+a.dx || 0); e.y = c.y - e.sh / 2 + (+a.dy || 0); }
          }
          e.home = { x: e.x, y: e.y };
          if (a.vx != null) e.vx = +a.vx;
          if (a.vy != null) e.vy = +a.vy;
          if (a.as) e.spawnedBy = ctx.self ? ctx.self.id : null;
        }
      }
      if ('destroy' in a) for (const e of this.refs(a.destroy, ctx)) this.destroy(e);
      if ('kill' in a) for (const e of this.refs(a.kill, ctx)) { if (e.c.health) { e.c.health.hp = 0; this.syncHp(e); } this.kill(e); }
      if ('damage' in a) for (const e of this.refs(a.damage, ctx)) this.damage(e, +(a.amount ?? 1), null);
      if ('heal' in a) for (const e of this.refs(a.heal, ctx)) { const h = e.c.health; if (h) { h.hp = Math.min(h.max, h.hp + +(a.amount ?? 1)); this.syncHp(e); } }
      if ('velocity' in a) for (const e of this.refs(a.velocity, ctx)) { if (a.vx != null) e.vx = +a.vx; if (a.vy != null) e.vy = +a.vy; }
      if ('move' in a) for (const e of this.refs(a.move, ctx)) { if (a.tx != null) this.placeOnTile(e, +a.tx, +a.ty || 0); else { if (a.x != null) e.x = +a.x; if (a.y != null) e.y = +a.y; } }
      if ('burst' in a) for (const e of this.refs(a.burst, ctx)) { const c = this.center(e); this.burst(c.x, c.y, a.color ?? 21, +(a.count ?? 10)); }
      if ('setTile' in a) this.setTile(+a.tx, +a.ty, a.setTile);
      if ('breakTile' in a && a.tx != null) { const b = this.breakOpts(this.cart.tiles[(this.map[+a.ty] || [])[+a.tx]]); if (b || a.breakTile === 'force') this.breakTile(+a.tx, +a.ty, ctx.self || null); }
      if ('effect' in a) { const base = a.x != null ? null : this.refs(a.at || 'self', ctx)[0]; const c = base ? this.center(base) : { x: +a.x || 0, y: +a.y || 0 }; this.effect(a.effect, c.x, c.y, { dx: a.dx, dy: a.dy, fps: a.fps }); }
      if ('drop' in a) { const base = a.x != null ? null : this.refs(a.at || 'self', ctx)[0]; const c = base ? this.center(base) : { x: +a.x || 0, y: +a.y || 0 }; this.dropLoot(a.drop, c.x, c.y, ctx); }
      // change any entity at runtime
      if ('setSprite' in a) for (const e of this.refs(a.target ?? 'self', ctx)) { const sp = Object.assign({}, typeof e.c.sprite === 'object' ? e.c.sprite : {}, { name: String(a.setSprite) }); if (a.anim) sp.anim = a.anim; e.c.sprite = sp; e.state = ''; this.applyComponents(e, e.c, false); }
      if ('comp' in a) for (const e of this.refs(a.target ?? 'self', ctx)) { const v = this.val(a.value, Object.assign({}, ctx, { self: e })); if (v !== undefined) this.setComponent(e, String(a.comp), v); }
      if ('tag' in a) for (const e of this.refs(a.target ?? 'self', ctx)) { e.tags.add(String(a.tag)); (e.extraTags = e.extraTags || []).push(String(a.tag)); }
      if ('untag' in a) for (const e of this.refs(a.target ?? 'self', ctx)) { e.tags.delete(String(a.untag)); if (e.extraTags) e.extraTags = e.extraTags.filter((t) => t !== String(a.untag)); }
      if ('emit' in a) this.fire('event', Object.assign({}, ctx, { other: ctx.self || ctx.other }), (r) => r.name === String(a.emit));
      if ('say' in a) {
        const lines = this.normLines(a.say).map((L) => (a.name != null && L.name == null ? Object.assign({}, L, { name: a.name }) : L));
        if (a.then) lines.push({ do: a.then });
        const d = this.dialog;
        if (d) { const at = Math.min(d.ins ?? d.q.length, d.q.length); d.q.splice(at, 0, ...lines); d.ins = at + lines.length; }
        else {
          const who = ctx.self || ctx.a, talk = who && who.c && who.c.talk;
          this.openDialog(lines, who, null, talk && talk.name != null ? talk.name : null, ctx);
          if (this.dialog) this.dialog.ins = this.dialog.q.length;
        }
      }
      if ('text' in a && !('say' in a)) this.banner = { text: this.fmt(a.text, ctx), t: +(a.t ?? 2), color: a.color };
      if ('shake' in a) this.shakeT = typeof a.shake === 'number' ? a.shake : 0.3;
      if ('flash' in a) { this.flashT = 0.15; this.flashC = this.col(a.flash === true ? 21 : a.flash); }
      if ('haptic' in a) this.haptic(a.haptic, a.target != null ? this.refs(a.target, ctx)[0] : ctx.self && ctx.self.c.control ? ctx.self : null, true);
      if ('save' in a && a.save) this.saveGame();
      if ('load' in a && a.load) this.loadGame();
      if ('erase' in a && a.erase) this.eraseSave();
      if ('scene' in a) this.pendingScene = { name: a.scene, x: a.x, y: a.y, tx: a.tx, ty: a.ty, at: a.at };
      if ('restart' in a && a.restart) this.pendingScene = { name: this.sceneName, restart: true };
      if ('goto' in a) this.enterState(ctx.self || ctx.a, String(a.goto));
      if ('cancelDeath' in a && a.cancelDeath && ctx.self) ctx.self._deathCancelled = true;
      if ('log' in a) console.log('[cart]', this.fmt(a.log, ctx));
    }
    /* {"comp":"ai.speed","value":60} — edit any component field on a live entity */
    setComponent(e, path, value) {
      const parts = path.split('.');
      if (!parts[0] || parts.some((k) => BLOCK.has(k))) return;
      let o = e.c;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
        o = o[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (value === null) delete o[last]; else o[last] = DC.clone(value);
      if (['sprite', 'body', 'tags', 'health', 'rules', 'layer'].includes(parts[0])) this.applyComponents(e, e.c, false);
    }

    /* ---------------- save data (the cartridge's battery-backed memory) ---------------- */
    saveKey() { return 'dc.save.' + (this.cart.meta.id || DC.slug(this.cart.meta.title)); }
    persistKeys() {
      const p = this.cart.meta.persist;
      if (Array.isArray(p)) return p.map(String);
      return p ? Object.keys(this.vars) : [];
    }
    saveGame() {
      const keys = this.persistKeys();
      if (!keys.length) { this.warn('Add "persist": true (or a list of variable names) to meta to use save'); return; }
      const data = {};
      for (const k of keys) if (k in this.vars) data[k] = DC.clone(this.vars[k]);
      try { localStorage.setItem(this.saveKey(), JSON.stringify({ at: Date.now(), vars: data, scene: this.sceneName })); } catch (e) { this.warn('Could not save — storage is full'); }
    }
    loadGame() {
      try {
        const s = JSON.parse(localStorage.getItem(this.saveKey()) || 'null');
        if (!s || !s.vars) return false;
        const allowed = new Set(this.persistKeys());
        for (const [k, v] of Object.entries(s.vars)) if (allowed.has(k)) this.vars[k] = v;
        return true;
      } catch (e) { return false; }
    }
    eraseSave() { try { localStorage.removeItem(this.saveKey()); } catch (e) { /* ignore */ } }
    hasSave() { try { return !!localStorage.getItem(this.saveKey()); } catch (e) { return false; } }

    /* ---------------- haptics routed to whichever player it concerns ---------------- */
    haptic(kind, ent, explicit) {
      if (!DC.Haptics || (!explicit && this.cart.meta.haptics === false)) return;
      const idx = ent && ent.c.control ? ent.c.control.player || 0 : null;
      if (idx == null || idx === 0) DC.Haptics.play(kind);
      if (this.mode === 'host' && idx !== 0) (this.hxQueue = this.hxQueue || []).push([idx == null ? -1 : idx, kind]);
    }

    sound(name) {
      if (!name || !this.cart) return;
      const d = this.cart.sounds[name];
      if (!d) return;
      AU.play(name, d);
      if (this.mode === 'host') this.sfxQueue.push(name);
    }

    /* ---------------- animation, camera, particles ---------------- */
    animate(dt) {
      for (const e of this.ents.values()) {
        if (e.facing.x) e.lastDirX = e.facing.x;
        const sp = e.c.sprite;
        if (!sp || !sp.name) continue;
        const frames = this.frames[sp.name];
        if (!frames) continue;
        let st = 'idle';
        const moving = Math.abs(e.vx) > 4 || (!this.grav && Math.abs(e.vy) > 4);
        if (e.dying) st = 'die';
        else if (e.atkT > 0) st = 'attack';
        else if (e.flash > 0 && sp.anim && sp.anim.hurt) st = 'hurt';
        else if (this.grav && e.c.body && e.c.body.gravity !== 0 && !e.onGround) st = 'jump';
        else if (moving) st = 'walk';
        const A = sp.anim;
        let seq = null;
        if (A && typeof A === 'object') {
          const dir = !this.grav && e.facing.y ? (e.facing.y < 0 ? 'up' : 'down') : 'side';
          seq = (st === 'die' ? A.die || A.death : null) || A[st + '_' + dir] || (dir !== 'side' && A['idle_' + dir] && st !== 'walk' ? A['idle_' + dir] : null) || A[st] || (st === 'attack' || st === 'jump' || st === 'hurt' ? A.walk || A.idle : null) || A.idle;
          if (!seq) seq = Object.values(A)[0];
        }
        if (!Array.isArray(seq) || !seq.length) seq = frames.map((_, i) => i);
        if (e.state !== st) { e.state = st; e.at = 0; }
        e.at += dt;
        const n = seq.length;
        let k = Math.floor(e.at * (sp.fps != null ? +sp.fps : 6));
        k = sp.loop === false ? Math.min(k, n - 1) : k % n;
        e.fi = seq[k] | 0;
        if (e.fi >= frames.length || e.fi < 0) e.fi = 0;
      }
    }
    camTarget() {
      if (this.mode === 'client') return this.cents.find((e) => e.id === this.myEid) || null;
      const tag = (this.scene.camera && this.scene.camera.follow) || null;
      let best = null;
      for (const e of this.ents.values()) {
        if (e.dead) continue;
        if (tag) { if (e.tags.has(tag)) return e; continue; }
        if (e.c.control && !(e.c.control.player > 0)) return e;
        if (!best && e.tags.has('player')) best = e;
      }
      return best;
    }
    camera(dt, snap) {
      if (this.m7) return this.m7Camera(dt, snap);
      const cfg = (this.scene && this.scene.camera) || {};
      if (Array.isArray(cfg.scroll)) { this.cam.x += (+cfg.scroll[0] || 0) * dt; this.cam.y += (+cfg.scroll[1] || 0) * dt; }
      else {
        const t = this.camTarget();
        if (t) {
          const c = { x: t.x + t.sw / 2, y: t.y + t.sh / 2 };
          const l = snap ? 1 : (cfg.lerp != null ? +cfg.lerp : 0.2);
          this.cam.x += (c.x - this.W / 2 - this.cam.x) * l;
          this.cam.y += (c.y - this.H / 2 - this.cam.y) * l;
        }
      }
      const mw = this.mapW * this.ts, mh = this.mapH * this.ts;
      if (mw) this.cam.x = mw <= this.W ? (mw - this.W) / 2 : clamp(this.cam.x, 0, mw - this.W);
      if (mh) this.cam.y = mh <= this.H ? (mh - this.H) / 2 : clamp(this.cam.y, 0, mh - this.H);
    }
    burst(x, y, col, n) {
      const cols = Array.isArray(col) ? col : [col];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 70;
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (this.grav ? 50 : 0), life: 0.3 + Math.random() * 0.4, col: this.col(cols[i % cols.length]), g: this.grav ? 350 : 0, size: 1 + (Math.random() < 0.3 ? 1 : 0) });
      }
      if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
    }
    updateParticles(dt) {
      for (const p of this.parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      this.parts = this.parts.filter((p) => p.life > 0);
    }

    /* ---------------- rendering ---------------- */
    text(str, x, y, col, align, shadow, size) {
      const g = this.g, px = 8 * (size || 1);
      g.font = px + 'px "Press Start 2P", monospace';
      g.textBaseline = 'top';
      const w = g.measureText(str).width;
      if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
      x = Math.round(x); y = Math.round(y);
      if (shadow !== false) { g.fillStyle = '#000'; g.fillText(str, x + 1, y + 1); }
      g.fillStyle = this.col(col ?? 21) || '#fff';
      g.fillText(str, x, y);
    }
    wrap(str, maxChars) {
      const out = [];
      for (const para of String(str).split('\n')) {
        let line = '';
        for (const w of para.split(' ')) {
          if ((line + (line ? ' ' : '') + w).length > maxChars && line) { out.push(line); line = w; }
          else line += (line ? ' ' : '') + w;
        }
        out.push(line);
      }
      return out;
    }

    render() {
      const g = this.g, W = this.W, H = this.H, sc = this.scene;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.imageSmoothingEnabled = false;
      g.fillStyle = this.col(sc.bg ?? 1) || '#000';
      g.fillRect(0, 0, W, H);
      let sx = 0, sy = 0;
      if (this.shakeT > 0) { sx = Math.round(Math.random() * 4 - 2); sy = Math.round(Math.random() * 4 - 2); }
      const cx = Math.round(this.cam.x) - sx, cy = Math.round(this.cam.y) - sy;

      const layers = this.layerGroups();
      const list = this.mode === 'client' ? this.cents.slice() : [...this.ents.values()];
      if (this.m7) this.renderM7(layers, list);
      else {
        for (const l of layers.back) this.drawLayer(l.L, cx, cy);
        this.drawTiles(cx, cy, false);
        for (const l of layers.mid) this.drawLayer(l.L, cx, cy);
        const lay = (e) => +(e.c.layer ?? (e.c.sprite && e.c.sprite.layer)) || 0;
        list.sort((a, b) => lay(a) - lay(b) || (sc.ysort ? a.y + a.sh - (b.y + b.sh) : a.id - b.id));
        let i = 0;
        for (; i < list.length && lay(list[i]) < 1; i++) this.drawEnt(list[i], cx, cy);
        this.drawTiles(cx, cy, true);
        for (; i < list.length; i++) this.drawEnt(list[i], cx, cy);
        for (const l of layers.front) this.drawLayer(l.L, cx, cy);
        if (this.dev.boxes && this.mode !== 'client') this.drawBoxes(cx, cy);
        for (const p of this.parts) { g.fillStyle = p.col; g.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.size || 1, p.size || 1); }
      }

      this.drawHud();
      const dlg = this.dialogView();
      if (dlg) this.drawDialog(dlg);
      if (this.banner) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H / 2 - 14, W, 26);
        this.text(this.banner.text, W / 2, H / 2 - 5, this.banner.color ?? 8, 'center');
      }
      if (this.paused && this.pauseLabel) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, 16);
        this.text(this.pauseLabel, W / 2, 4, 8, 'center');
      } else if (this.paused) {
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, H);
        this.text('PAUSED', W / 2, H / 2 - 12, 21, 'center');
        this.text('START TO RESUME', W / 2, H / 2 + 4, 23, 'center');
      }
      if (this.flashT > 0) { g.globalAlpha = 0.6; g.fillStyle = this.flashC || '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      if (this.fade > 0) { g.globalAlpha = this.fade; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      if (this.error) {
        g.fillStyle = 'rgba(80,0,0,0.85)'; g.fillRect(0, H - 40, W, 40);
        this.text('CART ERROR', 6, H - 34, 8);
        this.text(String(this.error.message).slice(0, Math.floor((W - 12) / 8)), 6, H - 20, 21);
      }
      if (this.onFrame) this.onFrame();
    }
    /* ---------------- Mode 7: perspective ground plane + scaled, depth-sorted sprites ---------------- */
    buildMapTex(pixels) {
      const ts = this.ts, mw = this.mapW * ts, mh = this.mapH * ts;
      this.texDirty = false;
      if (!mw || !mh || typeof document === 'undefined') { this.mapTex = null; this.m7tex = null; return; }
      const sc = Math.min(1, 2048 / mw, 2048 / mh);
      const tw = Math.max(1, Math.floor(mw * sc)), th = Math.max(1, Math.floor(mh * sc));
      const c = this.mapTex || document.createElement('canvas');
      c.width = tw; c.height = th;
      const g = c.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      const m = this.m7;
      const ground = m && m.ground != null ? m.ground : m && m.outside !== 'wrap' && m.outside != null ? m.outside : this.scene.bg ?? 1;
      g.fillStyle = this.col(ground); g.fillRect(0, 0, tw, th);
      const d = ts * sc;
      for (let y = 0; y < this.mapH; y++) for (let x = 0; x < this.map[y].length; x++) {
        const t = this.cart.tiles[this.map[y][x]];
        if (!t) continue;
        const fr = t.sprite && this.frames[t.sprite];
        if (fr) { const f = fr[0]; g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x * d, y * d, d, d); }
        else if (t.color != null) { g.fillStyle = this.col(t.color); g.fillRect(x * d, y * d, d, d); }
      }
      this.mapTex = c; this.texScale = sc;
      this.m7tex = null;
      if (pixels) {
        const img = g.getImageData && g.getImageData(0, 0, tw, th);
        if (img && img.data) { this.m7tex = new Uint32Array(img.data.buffer); this.m7tw = tw; this.m7th = th; }
      }
    }
    u32(c) {
      const [r, g, b] = DC.hexRGB(this.col(c) || '#000');
      return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    m7Camera(dt, snap) {
      const m = this.m7, t = this.camTarget();
      if (t) {
        const h = t.heading != null ? t.heading : t.facing && (t.facing.x || t.facing.y) ? Math.atan2(t.facing.y || 0, t.facing.x || 0) : this.m7a ?? m.angle;
        const b = t.hb ? { x: t.x + t.hb.ox + t.hb.w / 2, y: t.y + t.hb.oy + t.hb.h / 2 } : { x: t.x + t.sw / 2, y: t.y + t.sh / 2 };
        if (snap || this.m7a == null) this.m7a = h;
        else this.m7a = wrapAng(this.m7a + wrapAng(h - this.m7a) * Math.min(1, m.lerp * dt));
        const px = b.x - Math.cos(this.m7a) * m.back, py = b.y - Math.sin(this.m7a) * m.back;
        if (snap || this.m7x == null) { this.m7x = px; this.m7y = py; }
        else { const k = Math.min(1, 14 * dt); this.m7x += (px - this.m7x) * k; this.m7y += (py - this.m7y) * k; }
      } else if (this.m7a == null) { this.m7a = m.angle; this.m7x = this.mapW * this.ts / 2; this.m7y = this.mapH * this.ts / 2; }
      this.cam.x = this.m7x - this.W / 2; this.cam.y = this.m7y - this.H / 2;
    }
    project(wx, wy) {
      const dx = wx - this.m7x, dy = wy - this.m7y, ca = Math.cos(this.m7a), sa = Math.sin(this.m7a);
      const depth = dx * ca + dy * sa;
      if (depth < this.m7.near) return null;
      const s = this.m7focal / depth;
      return { depth, s, x: this.W / 2 + (-dx * sa + dy * ca) * s, y: this.m7.horizon + this.m7.height * s };
    }
    renderM7(layers, list) {
      const g = this.g, m = this.m7, W = this.W;
      if (this.m7a == null) this.m7Camera(0, true);
      if (this.texDirty || !this.m7tex) this.buildMapTex(true);
      const scroll = this.m7a * (W / m.fov);
      for (const l of layers.back) this.drawLayer(l.L, scroll, 0);
      this.drawM7Floor();
      for (const l of layers.mid) this.drawLayer(l.L, scroll, 0);
      // project every visible thing, then draw far to near
      const items = [];
      for (const e of list) {
        e._scr = null;
        if (e.hidden || (!e.c.sprite && !e.c.text)) continue;
        if (e.invuln > 0 && Math.floor(e.invuln * 20) % 2 === 0) continue;
        const gx = e.hb ? e.x + e.hb.ox + e.hb.w / 2 : e.x + e.sw / 2, gy = e.hb ? e.y + e.hb.oy + e.hb.h / 2 : e.y + e.sh / 2;
        const p = this.project(gx, gy);
        if (!p || p.depth > m.far) continue;
        items.push({ e, p });
      }
      items.sort((a, b) => b.p.depth - a.p.depth);
      for (const { e, p } of items) this.drawM7Sprite(e, p);
      for (const pt of this.parts) {
        const p = this.project(pt.x, pt.y);
        if (!p) continue;
        const sz = Math.max(1, (pt.size || 1) * p.s * m.spriteScale);
        g.fillStyle = pt.col; g.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz), Math.ceil(sz), Math.ceil(sz));
      }
      for (const l of layers.front) this.drawLayer(l.L, scroll, 0);
    }
    drawM7Floor() {
      const m = this.m7, W = this.W, H = this.H, g = this.g;
      const hz = Math.max(0, Math.round(m.horizon)), rows = H - hz;
      if (rows <= 0 || !this.m7tex) return;
      if (!this.m7buf || this.m7buf.width !== W || this.m7buf.height !== rows) {
        this.m7buf = document.createElement('canvas'); this.m7buf.width = W; this.m7buf.height = rows;
        this.m7ctx = this.m7buf.getContext('2d');
        this.m7img = this.m7ctx.createImageData(W, rows);
        this.m7out = new Uint32Array(this.m7img.data.buffer);
      }
      const out = this.m7out, tex = this.m7tex, tw = this.m7tw, th = this.m7th, sc = this.texScale;
      const f = this.m7focal, camH = m.height, ca = Math.cos(this.m7a), sa = Math.sin(this.m7a);
      const cx = this.m7x, cy = this.m7y, half = W / 2;
      const wrap = m.outside === 'wrap';
      const outC = wrap ? 0 : this.u32(m.outside);
      const farC = m.fog != null ? this.u32(m.fog) : outC;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const depth = camH * f / (r + 0.5);
        if (depth > m.far) { out.fill(wrap ? farC || tex[0] : farC, i, i + W); i += W; continue; }
        const k = depth / f;
        let wx = (cx + ca * depth + sa * half * k) * sc, wy = (cy + sa * depth - ca * half * k) * sc;
        const dx = -sa * k * sc, dy = ca * k * sc;
        if (wrap) {
          for (let x = 0; x < W; x++) {
            let tx = Math.floor(wx) % tw, ty = Math.floor(wy) % th;
            if (tx < 0) tx += tw; if (ty < 0) ty += th;
            out[i++] = tex[ty * tw + tx]; wx += dx; wy += dy;
          }
        } else {
          for (let x = 0; x < W; x++) {
            const tx = Math.floor(wx), ty = Math.floor(wy);
            out[i++] = tx >= 0 && ty >= 0 && tx < tw && ty < th ? tex[ty * tw + tx] : outC;
            wx += dx; wy += dy;
          }
        }
      }
      this.m7ctx.putImageData(this.m7img, 0, 0);
      g.drawImage(this.m7buf, 0, hz);
      if (m.fog != null && m.fogDepth > 0) {
        const [R, G, B] = DC.hexRGB(this.col(m.fog));
        const grad = g.createLinearGradient(0, hz, 0, hz + rows * m.fogDepth);
        grad.addColorStop(0, `rgba(${R},${G},${B},1)`); grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
        g.fillStyle = grad; g.fillRect(0, hz, W, Math.ceil(rows * m.fogDepth));
      }
    }
    /* draw a sprite-stack: each layer is the same slice, offset upward by "gap" so the sides
       peek through — a flat pixel-art stack that reads as a chunky 3D voxel object. (x,y,dw,dh)
       is the sprite's normal bounding box; k = dw/f.dw picks up any render-time scale (Mode 7). */
    drawStack(g, f, x, y, dw, dh, flip) {
      const layers = f.layers;
      if (!layers || !layers.length) return;
      const k = dw / f.dw;
      const sliceW = layers[0].dw * k, sliceH = layers[0].dh * k, gap = f.gap * k;
      const baseY = y + dh, cx = x + dw / 2;
      if (flip) { g.save(); g.translate(cx, 0); g.scale(-1, 1); }
      const dx = flip ? -sliceW / 2 : cx - sliceW / 2;
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        g.drawImage(L.src, L.sx, L.sy, L.w, L.h, dx, baseY - sliceH - i * gap, sliceW, sliceH);
      }
      if (flip) g.restore();
    }
    drawM7Sprite(e, p) {
      const g = this.g, sp = e.c.sprite, m = this.m7;
      const s = p.s * m.spriteScale;
      const fr = sp && sp.name && this.frames[sp.name];
      let f = null, flip = false;
      if (fr) {
        if (sp.angles) {
          const n = Math.max(1, +sp.angles | 0), rel = wrapAng((e.heading ?? Math.atan2((e.facing && e.facing.y) || 0, (e.facing && e.facing.x) || 1)) - this.m7a);
          const idx = ((Math.round(rel / (TAU / n)) % n) + n) % n;
          f = fr[(+sp.angleStart || 0) + idx] || fr[0];
        } else { f = fr[e.fi] || fr[0]; flip = e.lastDirX < 0 && !sp.noFlip && !e.tileCh; }
      }
      const bw = f ? (sp.fit ? e.sw : f.dw) : e.sw, bh = f ? (sp.fit ? e.sh : f.dh) : e.sh;
      const w = bw * s, h = bh * s;
      if (w < 0.5 || w > this.W * 3) return;
      const x = p.x - w / 2, y = p.y - h - (e.z || 0) * s;
      if (e.z > 0 && sp && sp.shadow !== false) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(p.x, p.y - 1, w * 0.4, Math.max(1, h * 0.1), 0, 0, TAU); g.fill(); }
      if (f && f.stack) this.drawStack(g, f, x, y, w, h, flip);
      else if (f) {
        if (flip) { g.save(); g.translate(p.x, 0); g.scale(-1, 1); g.drawImage(f.src, f.sx, f.sy, f.w, f.h, -w / 2, y, w, h); g.restore(); }
        else g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x, y, w, h);
      } else if (sp) { g.fillStyle = this.col(sp.color != null ? sp.color : 8); g.fillRect(x, y, w, h); }
      if (e.c.text) { const t = e.c.text, v = typeof t === 'object' ? t.value : t; this.text(this.mode === 'client' ? DC.fmt(v, this.vars) : this.fmt(v, { self: e }), p.x, y - 10, typeof t === 'object' ? t.color : 21, 'center'); }
      if (e.canTalk) this.text('!', p.x + 1, y - 11, 8, 'center');
      e._scr = { x, y, w, h, depth: p.depth };
    }
    /* entity under a screen point (fractions 0-1), in either view */
    pickScreen(fx, fy) {
      if (!this.m7) { const w = this.screenToWorld(fx, fy); return this.pickAt(w.x, w.y); }
      const px = fx * this.W, py = fy * this.H;
      let best = null;
      for (const e of this.ents.values()) {
        const r = e._scr;
        if (e.dead || !r) continue;
        if (px >= r.x - 3 && px <= r.x + r.w + 3 && py >= r.y - 3 && py <= r.y + r.h + 3 && (!best || r.depth < best._scr.depth)) best = e;
      }
      return best;
    }
    drawMinimap(h, x, y) {
      if (this.texDirty || !this.mapTex) this.buildMapTex(!!this.m7);
      if (!this.mapTex) return;
      const g = this.g, w = +h.w || 64, hh = +h.h || Math.round(w * this.mapH / Math.max(1, this.mapW));
      g.globalAlpha = h.alpha != null ? +h.alpha : 0.85;
      g.drawImage(this.mapTex, x, y, w, hh);
      g.globalAlpha = 1;
      g.strokeStyle = this.col(h.border ?? 0); g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, w + 1, hh + 1);
      const colors = Object.assign({ player: 8 }, h.colors || {});
      const mw = this.mapW * this.ts, mh = this.mapH * this.ts;
      const list = this.mode === 'client' ? this.cents : [...this.ents.values()];
      for (const [tag, col] of Object.entries(colors)) {
        g.fillStyle = this.col(col);
        for (const e of list) {
          if (e.dead || !(e.tags ? e.tags.has(tag) : e.c && e.c.tags && e.c.tags.includes(tag))) continue;
          const ex = x + (e.x + e.sw / 2) / mw * w, ey = y + (e.y + e.sh / 2) / mh * hh;
          g.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
        }
      }
    }
    drawTiles(cx, cy, front) {
      if (!this.mapW) return;
      const g = this.g, ts = this.ts, W = this.W, H = this.H;
      const x0 = Math.max(0, Math.floor(cx / ts)), x1 = Math.min(this.mapW - 1, Math.floor((cx + W) / ts));
      const y0 = Math.max(0, Math.floor(cy / ts)), y1 = Math.min(this.mapH - 1, Math.floor((cy + H) / ts));
      for (let ty = y0; ty <= y1; ty++) {
        const row = this.map[ty];
        for (let tx = x0; tx <= x1; tx++) {
          const t = this.cart.tiles[row[tx]];
          if (!t || ((+t.layer || 0) >= 1) !== front) continue;
          const px = tx * ts - cx, py = ty * ts - cy;
          const fr = t.sprite && this.frames[t.sprite];
          if (fr) {
            const f = fr[fr.length > 1 ? Math.floor(this.t * (t.fps != null ? +t.fps : 4)) % fr.length : 0];
            g.drawImage(f.src, f.sx, f.sy, f.w, f.h, px, py, ts, ts);
          } else if (t.color != null) { g.fillStyle = this.col(t.color); g.fillRect(px, py, ts, ts); }
        }
      }
    }
    drawBoxes(cx, cy) {
      const g = this.g, ts = this.ts;
      g.lineWidth = 1;
      if (this.mapW) {
        const trig = new Set(this.allRules.filter((r) => r.on === 'tile').map((r) => r.tile));
        for (let ty = 0; ty < this.mapH; ty++) for (let tx = 0; tx < this.mapW; tx++) {
          const ch = this.map[ty][tx], t = this.cart.tiles[ch];
          if (!t) continue;
          const col = trig.has(ch) ? '#5fcde4' : t.hurt || t.kill ? '#ff4f5e' : t.oneWay ? '#fbf236' : t.solid ? 'rgba(255,255,255,0.35)' : null;
          if (col) { g.strokeStyle = col; g.strokeRect(tx * ts - cx + 0.5, ty * ts - cy + 0.5, ts - 1, ts - 1); }
        }
      }
      for (const e of this.ents.values()) {
        if (e.dead) continue;
        const b = this.box(e);
        g.strokeStyle = e.c.control ? '#99e550' : e.c.warp ? '#5fcde4' : e.c.hurt ? '#ff4f5e' : e.c.pickup ? '#fbf236' : e.c.solid ? '#ffffff' : '#d77bba';
        g.strokeRect(Math.round(b.x - cx) + 0.5, Math.round(b.y - cy) + 0.5, Math.max(1, b.w - 1), Math.max(1, b.h - 1));
      }
    }
    /* layers sort by "z": below 0 behind tiles, 0-1 between tiles and characters, 1+ in front of everything */
    layerGroups() {
      const all = (this.scene.layers || []).filter((L) => L && typeof L === 'object').map((L, i) => ({ L, i, z: L.z != null ? +L.z || 0 : L.front ? 1 : -1 }));
      all.sort((a, b) => a.z - b.z || a.i - b.i);
      return { back: all.filter((l) => l.z < 0), mid: all.filter((l) => l.z >= 0 && l.z < 1), front: all.filter((l) => l.z >= 1) };
    }
    drawLayer(L, cx, cy) {
      const g = this.g, f = L.factor != null ? +L.factor : 0.5, fy = L.factorY != null ? +L.factorY : 0;
      const sp = Array.isArray(L.speed) ? L.speed : [0, 0];
      const ox = cx * f - (+sp[0] || 0) * this.t, oy = cy * fy - (+sp[1] || 0) * this.t;
      if (L.alpha != null) g.globalAlpha = Math.max(0, Math.min(1, +L.alpha));
      if (L.sprite && this.frames[L.sprite]) {
        const fr = this.frames[L.sprite][0];
        const w = fr.dw, h = fr.dh;
        const baseY = L.y != null ? +L.y : this.m7 ? this.m7.horizon - h : 0;
        let y = Math.round(baseY - oy);
        let x = -(((ox % w) + w) % w);
        if (L.repeatY) { y = -(((oy % h) + h) % h); for (let yy = y; yy < this.H; yy += h) for (let xx = x; xx < this.W; xx += w) g.drawImage(fr.src, fr.sx, fr.sy, fr.w, fr.h, Math.round(xx), Math.round(yy), w, h); }
        else for (; x < this.W; x += w) g.drawImage(fr.src, fr.sx, fr.sy, fr.w, fr.h, Math.round(x), y, w, h);
      } else if (L.color != null) {
        g.fillStyle = this.col(L.color);
        g.fillRect(0, Math.round((+L.y || 0) - oy), this.W, L.h != null ? +L.h : this.H);
      }
      g.globalAlpha = 1;
    }
    drawEnt(e, cx, cy) {
      if (e.hidden) return;
      if (e.invuln > 0 && Math.floor(e.invuln * 20) % 2 === 0) return;
      const g = this.g, sp = e.c.sprite;
      const x = Math.round(e.x - cx), y = Math.round(e.y - cy - (e.z || 0));
      if (e.z > 0 && sp && sp.shadow !== false) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + e.sw / 2, y + e.sh + e.z - 1, e.sw * 0.4, Math.max(1.5, e.sh * 0.12), 0, 0, Math.PI * 2); g.fill(); }
      if (x > this.W + 64 || y > this.H + 64 || x + e.sw < -64 || y + e.sh < -64) return;
      const fr = sp && sp.name && this.frames[sp.name];
      if (fr) {
        const f = fr[e.fi] || fr[0];
        const dw = sp.fit ? e.sw : f.dw, dh = sp.fit ? e.sh : f.dh;
        const flip = e.lastDirX < 0 && !sp.noFlip && !e.tileCh && !sp.rotate, ang = sp.rotate && e.heading != null ? e.heading + Math.PI / 2 : e.angle || 0;
        if (f.stack) this.drawStack(g, f, x, y, dw, dh, flip);
        else if (flip || ang) {
          g.save(); g.translate(x + dw / 2, y + dh / 2);
          if (ang) g.rotate(ang);
          if (flip) g.scale(-1, 1);
          g.drawImage(f.src, f.sx, f.sy, f.w, f.h, -dw / 2, -dh / 2, dw, dh);
          g.restore();
        } else g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x, y, dw, dh);
      } else if (sp) {
        g.fillStyle = this.col(sp.color != null ? sp.color : 8);
        if (sp.shape === 'circle') { g.beginPath(); g.arc(x + e.sw / 2, y + e.sh / 2, Math.min(e.sw, e.sh) / 2, 0, Math.PI * 2); g.fill(); }
        else g.fillRect(x, y, e.sw, e.sh);
      }
      if (e.c.text) {
        const t = e.c.text, v = typeof t === 'object' ? t.value : t;
        this.text(this.mode === 'client' ? DC.fmt(v, this.vars) : this.fmt(v, { self: e }), x, y, typeof t === 'object' ? t.color : 21, typeof t === 'object' ? t.align : null, true, typeof t === 'object' ? t.size : 1);
      }
      if (e.canTalk) this.text('!', x + e.sw / 2 + 1, y - 11 + Math.round(Math.sin(this.t * 6) * 2), 8, 'center');
    }
    hudVal(v) { return typeof v === 'number' ? v : +(this.vars[v] ?? 0); }
    drawHud() {
      const sc = this.scene;
      const items = sc.hud === undefined ? this.cart.hud || [] : sc.hud || [];
      const g = this.g;
      for (const h of items) {
        if (!h || typeof h !== 'object') continue;
        if (h.if && !this.cond(h.if, {})) continue;
        const x = h.x === 'center' ? this.W / 2 : h.x != null ? +h.x : 4, y = h.y != null ? +h.y : 4;
        if (h.minimap) { this.drawMinimap(h, x, y); continue; }
        if (h.icons) {
          const fr = this.frames[h.icons];
          if (!fr) continue;
          const n = Math.max(0, Math.floor(this.hudVal(h.count)));
          const max = h.max != null ? Math.floor(this.hudVal(h.max)) : n;
          for (let i = 0; i < Math.max(n, max) && i < 40; i++) {
            const full = i < n;
            const f = fr[full ? 0 : Math.min(1, fr.length - 1)];
            if (!full && fr.length < 2) g.globalAlpha = 0.3;
            g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x + i * (f.dw + (h.gap ?? 1)), y, f.dw, f.dh);
            g.globalAlpha = 1;
          }
        } else if (h.bar != null) {
          const v = this.hudVal(h.bar), m = this.hudVal(h.max ?? 100) || 1, w = +h.w || 40, hh = +h.h || 4;
          g.fillStyle = this.col(h.bg ?? 0); g.fillRect(x, y, w, hh);
          g.fillStyle = this.col(h.color ?? 27); g.fillRect(x, y, Math.round(clamp(v / m, 0, 1) * w), hh);
        } else if (h.sprite) {
          const fr = this.frames[h.sprite];
          if (!fr) continue;
          const f = fr[Math.floor(this.t * (+h.fps || 0)) % fr.length];
          g.drawImage(f.src, f.sx, f.sy, f.w, f.h, x, y, f.dw, f.dh);
        } else if (h.text != null) {
          if (h.blink && Math.floor(this.t * 2.5) % 2) continue;
          this.text(this.fmt(h.text, {}), x, y, h.color ?? 21, h.align || (h.x === 'center' ? 'center' : 'left'), h.shadow, +h.size || 1);
        }
      }
    }
    dialogView() {
      if (this.mode === 'client') return this.cdialog || null;
      const d = this.dialog;
      if (!d || !d.cur) return null;
      const text = this.fmt(d.cur.text ?? '', d.ctx);
      const done = d.n >= text.length;
      return {
        name: d.cur.name != null ? this.fmt(d.cur.name, d.ctx) : d.name, text, n: d.n,
        choices: d.choices && done ? d.choices.map((c) => this.fmt(c.text ?? '', d.ctx)) : null, sel: d.sel,
      };
    }
    drawDialog(d) {
      const g = this.g, W = this.W, H = this.H;
      const maxC = Math.floor((W - 28) / 8);
      const lines = d.text ? this.wrap(d.text, maxC).slice(0, 4) : [];
      const ch = (d.choices || []).slice(0, 6);
      const bh = 16 + lines.length * 11 + (ch.length ? ch.length * 11 + (lines.length ? 4 : 0) : 0);
      const by = H - bh - 6;
      g.fillStyle = this.col(1); g.fillRect(6, by, W - 12, bh);
      g.strokeStyle = this.col(21); g.lineWidth = 1; g.strokeRect(6.5, by + 0.5, W - 13, bh - 1);
      if (d.name) {
        const nw = d.name.length * 8 + 10;
        g.fillStyle = this.col(26); g.fillRect(12, by - 9, nw, 12);
        this.text(d.name, 17, by - 7, 21, null, false);
      }
      let left = Math.floor(d.n);
      lines.forEach((ln, i) => {
        const shown = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        this.text(shown, 14, by + 8 + i * 11, 21, null, false);
      });
      if (ch.length) {
        const y0 = by + 8 + lines.length * 11 + (lines.length ? 4 : 0);
        ch.forEach((c, i) => {
          const on = i === d.sel;
          if (on) { g.fillStyle = this.col(15); g.fillRect(10, y0 + i * 11 - 2, W - 20, 11); }
          this.text((on ? '\u25B6 ' : '  ') + c.slice(0, maxC - 2), 14, y0 + i * 11, on ? 8 : 22, null, false);
        });
      } else if (d.n >= d.text.length && Math.floor(this.t * 3) % 2) this.text('\u25BC', W - 22, by + bh - 12, 8, null, false);
    }
    drawIdle() {
      const g = this.g;
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#222034'; g.fillRect(0, 0, this.cv.width, this.cv.height);
      g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#9badb7'; g.textBaseline = 'top';
      g.fillText('NO CART', this.cv.width / 2 - 28, this.cv.height / 2 - 4);
    }

    /* ---------------- live editing ---------------- */
    /* Apply an edited cart without restarting: same scene, same positions, same variables */
    async hotReload(cart) {
      const rep = DC.validateCart(cart);
      if (rep.errors.length) throw new Error(rep.errors.join('\n'));
      if (!this.scene || !cart.scenes[this.sceneName] || this.mode === 'client') return this.load(cart);
      this.cart = cart;
      this.prefabCache = {};
      this.pal = Array.isArray(cart.palette) && cart.palette.length ? cart.palette.map((c) => DC.color(c) || '#ff00ff') : DC.PALETTE;
      if (cart.meta.width !== this.W || cart.meta.height !== this.H) {
        this.W = cart.meta.width; this.H = cart.meta.height;
        this.cv.width = this.W; this.cv.height = this.H; this.g.imageSmoothingEnabled = false;
      }
      this.frames = await DC.buildFrames(cart, this.pal, this.base);
      for (const [k, v] of Object.entries(cart.vars || {})) if (!(k in this.vars)) this.vars[k] = DC.clone(v);
      const sc = (this.scene = cart.scenes[this.sceneName]);
      this.globalRules = this.keepRules(this.globalRules, cart.rules);
      this.sceneRules = this.keepRules(this.sceneRules, sc.rules);
      this.allRules = [...this.globalRules, ...this.sceneRules];
      this.startBound = this.allRules.some((r) => r.on === 'button' && r.button === 'start');

      // map: take the new layout, keep bricks broken / blocks used this visit
      this.loadMap(sc);
      const want = this.mapSpawns(sc);
      for (const w of want) this.map[w.y][w.x] = '.';
      this.texDirty = true;
      for (const [x, y, ch, was] of this.tileEdits) if (this.map[y] && x < this.map[y].length && String(sc.map[y])[x] === was) this.map[y][x] = ch;

      // entities placed by the map: add new ones, remove ones that were erased
      const keys = new Set(want.map((w) => w.key));
      for (const e of this.ents.values()) if (e.origin && !keys.has(e.origin)) e.dead = true;
      for (const w of want) if (!this.spawnedOrigins.has(w.key)) this.spawnFromMap(w);

      // everything else picks up its new component data but keeps its state
      for (const e of this.ents.values()) {
        if (e.dead) continue;
        let c = null;
        if (e.tileCh) { const t = cart.tiles[e.tileCh]; if (t) c = this.tileComponents(t, e.tileCh); else { e.dead = true; continue; } }
        else if (e.prefab) { const pf = this.resolvedPrefab(e.prefab); if (!pf) { e.dead = true; continue; } c = DC.merge(DC.clone(pf), e.over || {}); }
        if (c) this.applyComponents(e, c, false);
      }
      for (const [id, e] of this.ents) if (e.dead) this.ents.delete(id);
      this.ensureCoop();
      if (sc.music === null || sc.music === false) AU.stopMusic();
      else if (sc.music && AU.songName !== sc.music) AU.playMusic(sc.music, cart.music[sc.music]);
      this.error = null; this.warned.clear();
      return rep;
    }
    /* Save states for testing: everything needed to drop straight back into a moment */
    saveState() {
      const ents = [...this.ents.values()].filter((e) => !e.dead && !e.owner).map((e) => ({
        prefab: e.prefab, over: e.over, tileCh: e.tileCh || null, origin: e.origin || null,
        x: e.x, y: e.y, vx: e.vx, vy: e.vy, facing: e.facing, lastDirX: e.lastDirX, dir: e.dir ?? null,
        home: e.home, hp: e.c.health ? e.c.health.hp : null, extra: e.extraTags || null, vars: e.vars, life: e.life ?? null,
        mode: e.mode ?? null, c: e.prefab || e.tileCh ? null : e.c,
      }));
      return DC.clone({
        v: 1, title: this.cart.meta.title, scene: this.sceneName, vars: this.vars, map: this.map.map((r) => r.join('')),
        tileEdits: this.tileEdits, spawned: [...this.spawnedOrigins], cam: this.cam, ents, at: Date.now(),
      });
    }
    loadState(st) {
      const sc = this.cart.scenes[st.scene];
      if (!sc) throw new Error(`Scene "${st.scene}" no longer exists`);
      this.sceneName = st.scene; this.scene = sc;
      this.ents.clear(); this.parts = []; this.timers = []; this.pairs = new Set();
      this.dialog = null; this.banner = null; this.shakeT = 0; this.flashT = 0; this.fade = 0.5; this.pendingScene = null;
      this.loadMap(sc);
      if (st.map.length === this.mapH) this.map = st.map.map((r) => r.split(''));
      this.texDirty = true; this.m7a = null;
      this.tileEdits = st.tileEdits || [];
      this.vars = DC.clone(st.vars);
      this.spawnedOrigins = new Set(st.spawned || []);
      this.sceneRules = this.prepRules(sc.rules);
      this.allRules = [...this.globalRules, ...this.sceneRules];
      for (const r of this.allRules) if (r.on === 'var' || r.on === 'count' || r.on === 'when') r._was = this.ruleCond(r);
      this.startBound = this.allRules.some((r) => r.on === 'button' && r.button === 'start');
      for (const d of st.ents) {
        let e = null;
        if (d.tileCh) { if (this.cart.tiles[d.tileCh]) e = this.spawnTile(d.tileCh, 0, 0); }
        else if (d.prefab) { if (this.resolvedPrefab(d.prefab)) e = this.spawn(d.prefab, 0, 0, d.over); }
        else if (d.c) e = this.spawn(null, 0, 0, d.c);
        if (!e) continue;
        Object.assign(e, { x: d.x, y: d.y, vx: d.vx, vy: d.vy, facing: d.facing, lastDirX: d.lastDirX, home: d.home, vars: d.vars || {} });
        if (d.dir != null) e.dir = d.dir;
        if (d.life != null) e.life = d.life;
        if (d.origin) e.origin = d.origin;
        if (d.extra) { e.extraTags = d.extra; d.extra.forEach((t) => e.tags.add(t)); }
        if (d.hp != null && e.c.health) e.c.health.hp = d.hp;
        if (d.mode != null) this.enterState(e, d.mode, true);
        e.born = false;
      }
      this.cam = Object.assign({}, st.cam);
      if (sc.music === null || sc.music === false) AU.stopMusic();
      else if (sc.music) AU.playMusic(sc.music, this.cart.music[sc.music]);
      this.seedContacts();
      this.paused = false; this.error = null;
    }
    /* entity under a world point (topmost first) */
    pickAt(wx, wy) {
      const list = [...this.ents.values()].filter((e) => !e.dead);
      const lay = (e) => +(e.c.layer ?? (e.c.sprite && e.c.sprite.layer)) || 0;
      list.sort((a, b) => lay(b) - lay(a) || b.id - a.id);
      const pad = 3;
      for (const e of list) {
        const r = { x: Math.min(e.x, e.x + e.hb.ox) - pad, y: Math.min(e.y, e.y + e.hb.oy) - pad, w: Math.max(e.sw, e.hb.w) + pad * 2, h: Math.max(e.sh, e.hb.h) + pad * 2 };
        if (wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h) return e;
      }
      return null;
    }
    screenToWorld(fx, fy) { return { x: fx * this.W + this.cam.x, y: fy * this.H + this.cam.y }; }

    /* ---------------- networking (host → snapshot, client ← snapshot) ---------------- */
    sendSnap() {
      if (!this.onSnapshot) return;
      const e = [];
      const pids = {};
      for (const en of this.ents.values()) {
        if (en.dead) continue;
        if (en.c.control) pids[en.c.control.player || 0] = en.id;
        if (!en.c.sprite && !en.c.text) continue;
        const pfResolved = this.resolvedPrefab(en.prefab);
        const pfSprite = pfResolved && pfResolved.sprite;
        const pfName = typeof pfSprite === 'string' ? pfSprite : pfSprite && pfSprite.name;
        const sn = en.c.sprite && en.c.sprite.name !== pfName ? en.c.sprite.name || 0 : 0;
        const hide = en.invuln > 0 && Math.floor(en.invuln * 20) % 2 === 0;
        const flags = (en.lastDirX < 0 && !en.tileCh ? 1 : 0) | (hide ? 2 : 0) | (en.canTalk ? 4 : 0) | (en.c.sprite && en.c.sprite.fit ? 8 : 0);
        e.push([en.id, en.prefab, Math.round(en.x), Math.round(en.y), en.fi, flags, en.angle ? +en.angle.toFixed(2) : 0, sn, en.heading != null ? +en.heading.toFixed(3) : null, en.z ? Math.round(en.z) : 0]);
      }
      const dv = this.dialogView();
      this.onSnapshot({
        t: 'snap', sc: this.sceneName, e, p: pids, v: this.vars,
        d: dv ? [dv.name, dv.text, Math.floor(dv.n), dv.choices || 0, dv.sel || 0] : 0,
        bn: this.banner ? [this.banner.text, this.banner.color ?? 8] : 0,
        hx: this.hxQueue && this.hxQueue.length ? this.hxQueue.splice(0) : 0,
        pa: this.paused ? 1 : 0, fx: this.flashT > 0 ? this.flashC : 0, sh: this.shakeT > 0 ? 1 : 0,
        fd: +this.fade.toFixed(2), sfx: this.sfxQueue.splice(0), mu: AU.songName || 0,
        te: { n: this.tileEdits.length, l: this.tileEdits.slice(-24) },
      });
    }
    applySnap(s) {
      if (!this.cart) return;
      if (s.sc !== this.sceneName) this.enterSceneView(s.sc);
      const te = s.te || { n: 0, l: [] };
      const start = te.n - te.l.length;
      for (let i = Math.max(start, this.tileEditsApplied || 0); i < te.n; i++) {
        const [x, y, ch] = te.l[i - start];
        if (this.map[y]) { this.map[y][x] = ch; this.texDirty = true; }
      }
      this.tileEditsApplied = te.n;
      const seen = new Set();
      this.cents = [];
      for (const r of s.e) {
        const [id, pf, x, y, fi, flags, ang, sn, hd, z] = r;
        let en = this.ccache.get(id);
        if (!en) {
          const p = this.resolvedPrefab(pf) || {};
          let sp = typeof p.sprite === 'string' ? { name: p.sprite } : p.sprite ? Object.assign({}, p.sprite) : null;
          if (sn) sp = Object.assign({}, sp || {}, { name: sn });
          if (sp && flags & 8) sp.fit = true;
          const fs = sp && sp.name && this.frameSize(sp.name);
          en = { id, c: { sprite: sp, text: p.text, tags: p.tags || [] }, tags: new Set([...(p.tags || []), pf]), sw: sp && sp.fit ? this.ts : fs ? fs.w : (sp && +sp.w) || 16, sh: sp && sp.fit ? this.ts : fs ? fs.h : (sp && +sp.h) || 16, invuln: 0 };
          this.ccache.set(id, en);
        }
        en.x = x; en.y = y; en.fi = fi; en.heading = hd; en.z = z || 0; en.lastDirX = flags & 1 ? -1 : 1; en.hidden = !!(flags & 2); en.canTalk = !!(flags & 4); en.angle = ang || 0;
        seen.add(id);
        this.cents.push(en);
      }
      for (const id of this.ccache.keys()) if (!seen.has(id)) this.ccache.delete(id);
      this.myEid = s.p ? s.p[this.localIdx] : null;
      this.vars = s.v || {};
      this.cdialog = s.d ? { name: s.d[0], text: s.d[1], n: s.d[2], choices: s.d[3] || null, sel: s.d[4] || 0 } : null;
      this.banner = s.bn ? { text: s.bn[0], color: s.bn[1], t: 1 } : null;
      this.paused = !!s.pa;
      if (s.fx) { this.flashT = 0.05; this.flashC = s.fx; }
      this.shakeT = s.sh ? 0.05 : 0;
      this.fade = s.fd || 0;
      for (const n of s.sfx || []) { const d = this.cart.sounds[n]; if (d) AU.play(n, d); }
      for (const [idx, kind] of s.hx || []) if ((idx === -1 || idx === this.localIdx) && DC.Haptics) DC.Haptics.play(kind);
      if (s.mu && s.mu !== AU.songName) AU.playMusic(s.mu, this.cart.music[s.mu]);
      else if (!s.mu && AU.songName) AU.stopMusic();
    }
    clientTick() {
      this.t += DT;
      this.frame++;
      if (this.flashT > 0) this.flashT -= DT;
      if (this.onInput) this.onInput(I.toMask(I.localDown), this.frame);
      if (this.scene) this.camera(DT);
    }
  }

  DC.Engine = Engine;
})();
