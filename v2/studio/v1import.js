/* Opens a v1 cartridge (DCART-1 JSON) in the v2 Studio.
   Art, palette, sounds, music, maps and placements convert exactly. Behaviour converts where v2 has the same idea
   (movement, enemies, health, pickups, doors, talking, attacks, most rules and actions). Everything else is left
   out and listed in the report, so nothing disappears silently. The v1 console still plays the original file.
   Headless: works in node (tests) and the browser. Needs js/core.js (DC.PALETTE, DC.resolvePrefab). */
(function (root) {
  'use strict';
  const DC = root.DC, DC2 = root.DC2, S = DC2.studio;
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const PIX = '0123456789abcdefghijklmnopqrstuv';
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  const isV1 = (o) => isObj(o) && (o.format === 'DCART-1' || (!o.format && isObj(o.scenes) && (isObj(o.tiles) || Object.values(o.prefabs || {}).some((p) => isObj(p) && (p.control || p.pickup || p.talk || p.warp)))));

  function convert(v1in) {
    const v1 = clone(v1in), notes = [], seen = new Set();
    const note = (where, what) => { const k = where + '|' + what; if (!seen.has(k)) { seen.add(k); notes.push({ where, what }); } };
    const palette = (DC && DC.PALETTE) || PIX.split('').map(() => '#000000');
    const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) || 0);
    const nearest = (hex) => { const [r, g, b] = hexRGB(hex); let best = 0, bd = Infinity; palette.forEach((p, i) => { const [R, G, B] = hexRGB(p); const d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2; if (d < bd) { bd = d; best = i; } }); return best; };
    const colorIdx = (c, dflt) => (typeof c === 'number' ? Math.max(0, Math.min(31, c | 0)) : typeof c === 'string' && c[0] === '#' ? nearest(c) : dflt);
    const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

    const meta = v1.meta || {}, scenes = v1.scenes || {}, tiles = v1.tiles || {};
    const cart = { format: 'DCART-2', meta: { title: meta.title || 'Imported game', author: meta.author || '', width: +meta.width || 256, height: +meta.height || 224, start: meta.start || Object.keys(scenes)[0], extensions: [] },
      vars: clone(v1.vars || {}), palettes: { main: palette.slice() }, sprites: {}, tilesets: {}, maps: {}, prefabs: {}, scenes: {}, sounds: {}, music: {}, rules: [] };
    for (const k of ['coop', 'singletons', 'persist', 'motion']) if (meta[k]) note('Settings', `"${k}" isn't in v2 yet, so it was left out`);

    /* ---------------------------------------------------------------- sounds, music (same format) */
    for (const [k, s] of Object.entries(v1.sounds || {})) { if (s && s.src) { note('Sound ' + k, 'audio files aren\'t supported in v2 yet — left out'); continue; } cart.sounds[k] = s; }
    for (const [k, m] of Object.entries(v1.music || {})) cart.music[k] = m;

    /* ---------------------------------------------------------------- sprites */
    const spriteSize = {};
    const frameRows = (fr, w, h, sc) => {
      const out = [];
      for (let y = 0; y < h; y++) { let row = ''; const src = String((fr || [])[y] || ''); for (let x = 0; x < w; x++) { let c = (src[x] || '.').toLowerCase(); if (c !== '.' && PIX.indexOf(c) < 0) c = '.'; row += c.repeat(sc); } for (let i = 0; i < sc; i++) out.push(row); }
      return out.join('/');
    };
    for (const [id, d] of Object.entries(v1.sprites || {})) {
      if (!isObj(d)) continue;
      if (d.src) { note('Sprite ' + id, 'was a PNG file; it\'s now a placeholder box — use Art → Import PNG to bring the picture back'); const w = +d.w || 16, h = +d.h || 16; cart.sprites[id] = { w, h, palette: 'main', frames: [Array(h).fill('t'.repeat(w)).join('/')] }; spriteSize[id] = { w, h }; continue; }
      let sc = Math.max(1, Math.round(+d.scale || 1)); if (d.scale && Math.round(+d.scale) !== +d.scale) note('Sprite ' + id, `scale ${d.scale} was rounded to ${sc}`);
      let frames = Array.isArray(d.frames) ? d.frames : [];
      if (d.stack) { note('Sprite ' + id, 'was a stacked (3D) sprite; only its top layer came across'); frames = frames.map((f) => (Array.isArray(f) && Array.isArray(f[0]) ? f[f.length - 1] : f)); }
      const w = +d.w || 8, h = +d.h || 8;
      if (!frames.length) frames = [[]];
      cart.sprites[id] = { w: w * sc, h: h * sc, palette: 'main', frames: frames.map((f) => frameRows(f, w, h, sc)) };
      spriteSize[id] = { w: w * sc, h: h * sc };
    }
    const addAnims = (id, anim, fps, where) => {
      const d = cart.sprites[id]; if (!d) return; d.anims = d.anims || {};
      const n = d.frames.length, ok = (f) => (Array.isArray(f) ? f : [f]).map((x) => x | 0).filter((x) => x >= 0 && x < n);
      if (isObj(anim)) for (const [k, f] of Object.entries(anim)) { const fr = ok(f); if (!fr.length) continue; if (d.anims[k] && JSON.stringify(d.anims[k].f) !== JSON.stringify(fr)) { note(where, `animation "${k}" differs from another thing using sprite "${id}"; the first one was kept`); continue; } d.anims[k] = { f: fr, fps: +fps || 8 }; }
      if (!d.anims.idle) d.anims.idle = { f: n > 1 && !isObj(anim) ? d.frames.map((_, i) => i) : [0], fps: +fps || 6 };
    };
    /* a flat-colour shape sprite ({color,w,h,shape}) becomes a real sprite */
    const shapeSprite = (name, s) => {
      const id = 'shape_' + slug(name), w = +s.w || 16, h = +s.h || 16, ch = PIX[colorIdx(s.color, 21)], rows = [];
      for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) { const inside = s.shape !== 'circle' || ((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1; r += inside ? ch : '.'; } rows.push(r); }
      cart.sprites[id] = { w, h, palette: 'main', frames: [rows.join('/')], anims: { idle: { f: [0], fps: 1 } } }; spriteSize[id] = { w, h }; return id;
    };

    /* ---------------------------------------------------------------- expressions */
    const FIELD = { x: 'pos.x', y: 'pos.y', vx: 'vel.x', vy: 'vel.y', hp: 'health.hp', maxhp: 'health.max', onGround: 'grounded', dir: 'facing.x' };
    const expr = (src, roles) => {
      let s = String(src).trim(); if (s[0] === '=') s = s.slice(1).trim();
      if (roles) s = s.replace(/\b(a|b)\.(?=[a-zA-Z_])/g, (m, r) => (roles[r] || r) + '.');
      return s.replace(/\b(self|other|player)\.(x|y|vx|vy|hp|maxhp|onGround|dir)\b/g, (m, who, f) => who + '.' + FIELD[f]);
    };
    const varNames = new Set(Object.keys(cart.vars));
    const value = (v, roles) => {
      if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) return `randint(${v[0]}, ${v[1]})`;
      if (typeof v === 'string') { if (v[0] === '=') return expr(v, roles); if (varNames.has(v.split('.')[0]) || /^(self|other|player)\./.test(v)) return expr(v, roles); return JSON.stringify(v).replace(/^"|"$/g, "'"); }
      return v;
    };
    const cond = (c, roles) => {
      if (c == null) return undefined;
      if (typeof c === 'string') return expr(c, roles);
      if (typeof c === 'boolean') return c;
      if (!isObj(c)) return String(c);
      const op = c.op || '==', rhs = typeof c.value === 'string' && !varNames.has(c.value) ? `'${c.value}'` : c.value;
      if (c.var !== undefined) return `${expr(c.var, roles)} ${op} ${rhs}`;
      if (c.count !== undefined) return `count('${c.count}') ${op} ${rhs}`;
      if (c.all) return c.all.map((x) => '(' + cond(x, roles) + ')').join(' and ');
      if (c.any) return c.any.map((x) => '(' + cond(x, roles) + ')').join(' or ');
      if (c.not) return 'not (' + cond(c.not, roles) + ')';
      if (c.chance !== undefined) return `chance(${c.chance})`;
      return 'true';
    };
    const text = (t) => (typeof t === 'string' ? t.replace(/\{([^{}]+)\}/g, (m, e) => '{' + expr(e) + '}') : t);

    /* ---------------------------------------------------------------- targets, markers, loot */
    const targetOf = (t, roles) => { if (t == null || t === true) return 'self'; if (roles && roles[t]) return roles[t]; return String(t); };
    const usedTags = new Set();
    const markerFor = {};                               // scene -> Set of marker requests
    const wantMarker = (scene, key) => { (markerFor[scene] = markerFor[scene] || new Set()).add(key); return key; };
    const loot = (L, where) => {
      if (L == null) return [];
      if (typeof L === 'string') return [{ act: 'spawn', prefab: L }];
      if (Array.isArray(L)) return L.flatMap((x) => {
        if (typeof x === 'string') return [{ act: 'spawn', prefab: x }];
        if (!isObj(x) || !x.prefab) return [];
        const n = Array.isArray(x.count) ? `randint(${x.count[0]}, ${x.count[1]})` : x.count;
        let acts = [{ act: 'spawn', prefab: x.prefab }];
        if (n && n !== 1) { if (typeof n === 'number') acts = Array(n).fill(0).map(() => ({ act: 'spawn', prefab: x.prefab })); else note(where, 'a random loot count became a single drop'); }
        let t = []; if (x.chance != null) t.push(`chance(${x.chance})`); if (x.if) t.push('(' + cond(x.if) + ')');
        return t.length ? [{ act: 'if', test: t.join(' and '), then: acts }] : acts;
      });
      if (isObj(L) && L.one) { note(where, 'a "pick one" loot table became an even random pick'); const opts = L.one.filter((o) => o && o.prefab); return opts.length ? [{ act: 'if', test: `chance(${(opts.length / L.one.length).toFixed(2)})`, then: [{ act: 'spawn', prefab: opts[0].prefab }] }] : []; }
      return [];
    };

    /* ---------------------------------------------------------------- actions */
    const lines = (L, where) => (Array.isArray(L) ? L : [L]).filter((x) => x != null).map((l) => {
      if (typeof l === 'string') return text(l);
      if (!isObj(l)) return String(l);
      if (l.if || l.name || l.do) note(where, 'dialogue lines with their own "if", speaker "name" or "do" were simplified to plain text');
      const out = { text: text(l.text || '') };
      if (Array.isArray(l.choices)) out.choices = l.choices.map((c) => { const o = { text: text(c.text || '') }; if (c.if) o.if = cond(c.if); const then = [...acts(c.do, where), ...(c.lines ? [{ act: 'say', name: '', lines: lines(c.lines, where) }] : [])]; if (then.length) o.then = then; return o; });
      return out;
    });
    const acts = (list, where, roles, ctx) => {
      const out = [];
      for (const a of Array.isArray(list) ? list : list ? [list] : []) {
        if (!isObj(a)) continue;
        const T = (k) => targetOf(a[k] !== undefined && a[k] !== true ? a[k] : a.target, roles);
        if (a.if !== undefined && (a.then || a.else)) { const o = { act: 'if', test: cond(a.if, roles), then: acts(a.then, where, roles, ctx) }; if (a.else) o.else = acts(Array.isArray(a.else) ? a.else : [a.else], where, roles, ctx); out.push(o); continue; }
        if (a.switch) { let tail = null; for (const c of [...a.switch].reverse()) { const body = acts(c.then, where, roles, ctx); tail = c.if === undefined ? body : [{ act: 'if', test: cond(c.if, roles), then: body, ...(tail ? { else: tail } : {}) }]; } out.push(...(tail || [])); continue; }
        const builtin = /^(self|other|player|a|b)\.(speed|heading|z|laps|mode|wp|sprite|diry|age|id)$/.exec(String(a.set !== undefined ? a.set : a.add !== undefined ? a.add : ''));
        if (builtin) { note(where, `changing "${builtin[2]}" (a v1 built-in) isn't in v2 — left out`); continue; }
        if (a.set !== undefined) { out.push({ act: 'set', path: expr(a.set, roles), to: value(a.value, roles) }); continue; }
        if (a.add !== undefined) { const o = { act: 'add', path: expr(a.add, roles) }; if (a.value !== undefined && a.value !== 1) o.by = value(a.value, roles); out.push(o); continue; }
        if (a.scene !== undefined) {
          const o = { act: 'goto', scene: a.scene };
          if (a.at != null) o.at = wantMarker(a.scene, 'at_' + slug(a.at)); else if (a.tx != null) o.at = wantMarker(a.scene, `tile_${a.tx | 0}_${a.ty | 0}`);
          out.push(o); continue;
        }
        if (a.restart) { if (ctx && ctx.scene) out.push({ act: 'goto', scene: ctx.scene }); else note(where, '"restart" inside a thing\'s rule was left out (v2 needs the level name)'); continue; }
        if (a.reset) {
          const lit = (v) => (typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v);
          const put = (path, v) => { if (isObj(v)) { for (const [k2, v2] of Object.entries(v)) put(path + '.' + k2, v2); } else if (Array.isArray(v)) note(where, `resetting the list "${path}" was left out`); else out.push({ act: 'set', path, to: lit(v) }); };
          for (const [k, v] of Object.entries(v1.vars || {})) put(k, v);
          continue;
        }
        if (a.spawn !== undefined) {
          const o = { act: 'spawn', prefab: a.spawn };
          const base = targetOf(a.at, roles); if (base === 'other') o.at = 'other'; else if (base !== 'self' && a.at != null && a.tx == null && a.x == null) note(where, `spawning "at" "${a.at}" became "at self"`);
          if (a.tx != null) { o.at = 'world'; o.x = ((a.tx | 0) + 0.5) * (ctx && ctx.ts || 16); o.y = ((a.ty | 0) + 0.5) * (ctx && ctx.ts || 16); }
          if (a.x != null) { o.at = 'world'; o.x = value(a.x, roles); o.y = value(a.y, roles); }
          for (const k of ['dx', 'dy', 'vx', 'vy']) if (a[k] != null) o[k] = value(a[k], roles);
          out.push(o); continue;
        }
        if (a.destroy !== undefined) { out.push({ act: 'destroy', target: T('destroy') }); continue; }
        if (a.kill !== undefined) { out.push({ act: 'damage', target: T('kill'), amount: 999 }); continue; }
        if (a.damage !== undefined) { out.push({ act: 'damage', target: T('damage'), amount: value(a.amount != null ? a.amount : 1, roles) }); continue; }
        if (a.heal !== undefined) { out.push({ act: 'heal', target: T('heal'), amount: value(a.amount != null ? a.amount : 1, roles) }); continue; }
        if (a.velocity !== undefined) { const t = T('velocity'); if (!['self', 'other', 'player'].includes(t)) { note(where, `setting the velocity of every "${t}" was left out`); continue; } if (a.vx != null) out.push({ act: 'set', path: t + '.vel.x', to: value(a.vx, roles) }); if (a.vy != null) out.push({ act: 'set', path: t + '.vel.y', to: value(a.vy, roles) }); continue; }
        if (a.move !== undefined) { const ts = (ctx && ctx.ts) || 16; out.push({ act: 'move', target: T('move'), x: ((a.tx | 0) + 0.5) * ts, y: ((a.ty | 0) + 0.5) * ts }); continue; }
        if (a.say !== undefined) { out.push({ act: 'say', name: a.name || '', lines: lines(a.say, where) }); continue; }
        if (a.sound !== undefined) { if (cart.sounds[a.sound]) out.push({ act: 'sound', id: a.sound }); continue; }
        if (a.shake !== undefined) { out.push({ act: 'shake', t: +a.shake || 0.3 }); continue; }
        if (a.haptic !== undefined) { out.push({ act: 'haptic', kind: a.haptic }); continue; }
        if (a.wait !== undefined) { out.push({ act: 'wait', t: +a.wait || 0, then: acts(a.then, where, roles, ctx) }); continue; }
        if (a.emit !== undefined) { out.push({ act: 'emit', name: a.emit }); continue; }
        if (a.tag !== undefined && typeof a.tag === 'string') { out.push({ act: 'tag', target: targetOf(a.target, roles), add: a.tag }); continue; }
        if (a.untag !== undefined) { out.push({ act: 'tag', target: targetOf(a.target, roles), remove: a.untag }); continue; }
        const one = (t) => ['self', 'other', 'player'].includes(t);
        if ((a.setSprite !== undefined || a.comp !== undefined) && !one(targetOf(a.target, roles))) { note(where, `changing every "${a.target}" at once was left out (v2 changes one thing at a time)`); continue; }
        if (a.setSprite !== undefined) { out.push({ act: 'set', path: targetOf(a.target, roles) + '.sprite.id', to: `'${a.setSprite}'` }); continue; }
        if (a.comp !== undefined && !/\./.test(String(a.comp))) { note(where, `adding or replacing the whole "${a.comp}" component while playing isn't in v2 — left out`); continue; }
        if (a.comp !== undefined && /^sprite\.(name)$/.test(a.comp)) { out.push({ act: 'set', path: targetOf(a.target, roles) + '.sprite.id', to: value(a.value, roles) }); continue; }
        if (a.comp !== undefined && /^sprite\.(?!anim$|flip$|layer$)/.test(a.comp)) { note(where, `changing "${a.comp}" while playing isn't in v2 — left out`); continue; }
        if (a.comp !== undefined) { let p = String(a.comp).replace(/^ai\.type$/, 'ai.mode').replace(/^control\./, '__control__.'); if (a.value === null) { note(where, `removing the "${a.comp}" component was left out`); continue; } out.push({ act: 'set', path: targetOf(a.target, roles) + '.' + p, to: value(a.value, roles) }); continue; }
        if (a.cancelDeath) { out.push({ act: 'keepAlive' }); continue; }
        if (a.drop !== undefined) { out.push(...loot(a.drop, where)); continue; }
        if (a.setTile !== undefined) { const id = ctx && ctx.tileId ? ctx.tileId(a.setTile) : 0; if (id >= 0) out.push({ act: 'settile', layer: 'tiles', tx: a.tx | 0, ty: a.ty | 0, tile: id }); else note(where, `setTile "${a.setTile}" (not a plain tile in v2) was left out`); continue; }
        const k = Object.keys(a)[0];
        const why = { music: 'switching music from a rule', text: 'on-screen banners', flash: 'screen flashes', burst: 'particle bursts', effect: 'one-shot effects', breakTile: 'breaking tiles from a rule', push: 'list variables', remove: 'list variables', save: 'saving', load: 'loading', erase: 'erasing saves', goto: 'state machines', tag: 'tagging' }[k] || `the "${k}" action`;
        note(where, why + ' isn\'t in v2 yet — left out');
      }
      return out;
    };

    /* ---------------------------------------------------------------- scenes: which prefabs live where */
    const placedIn = {};                                // prefab -> Set(scene)
    const tileEnt = (t) => isObj(t) && (t.entity === true || ['warp', 'talk', 'ai', 'health', 'pickup', 'attack', 'spawner', 'emitter', 'move', 'text', 'control', 'lifetime', 'stompable', 'vel', 'tags', 'body', 'vars'].some((k) => k in t) || t.hurt != null || t.kill || t.hit || t.break);
    const tilePrefab = (ch) => 'tile_' + (/^[a-z0-9]$/i.test(ch) ? ch.toLowerCase() + (ch === ch.toUpperCase() && /[a-z]/i.test(ch) ? '_up' : '') : 'c' + ch.charCodeAt(0));
    for (const [sn, sc] of Object.entries(scenes)) {
      const add = (pf) => { if (pf) (placedIn[pf] = placedIn[pf] || new Set()).add(sn); };
      for (const row of sc.map || []) for (const ch of String(row)) { const L = (sc.legend || {})[ch]; if (L) add(typeof L === 'string' ? L : L.prefab); else if (tileEnt(tiles[ch])) add(tilePrefab(ch)); }
      for (const e of sc.entities || []) add(e.prefab);
    }
    const gravityOf = (pf) => { let g = 0; for (const sn of placedIn[pf] || []) g = Math.max(g, +(scenes[sn].gravity || 0)); return g; };
    const bothViews = (pf) => { const k = new Set([...(placedIn[pf] || [])].map((sn) => +(scenes[sn].gravity || 0) > 0)); return k.size > 1; };

    /* ---------------------------------------------------------------- prefabs */
    const cache = {};
    const resolve = (name) => (DC && DC.resolvePrefab ? DC.resolvePrefab(v1, name, cache) : clone(v1.prefabs[name]));
    const spawners = [], twins = new Set();
    function prefab(name, p, where, gravOverride) {
      const out = { tags: [], c: {}, rules: [] }, c = out.c, R = out.rules;
      for (const t of p.tags || []) if (!out.tags.includes(t)) out.tags.push(t);
      if (isObj(p.vars)) out.v = clone(p.vars);
      if (p.states) note(where, 'state machines ("states") aren\'t in v2 yet — only its normal settings came across');
      for (const k of ['emitter', 'text', 'persistent', 'noCollide']) if (p[k]) note(where, `"${k}" isn't in v2 yet — left out`);
      const grav = gravOverride !== undefined ? gravOverride : p.move || p.solid ? 0 : gravityOf(name), body = isObj(p.body) ? p.body : null, moving = p.control || p.ai || p.move || p.vel || (grav && body && body.gravity !== 0 && !body.static);
      /* sprite */
      let sid = null;
      if (isObj(p.sprite)) {
        if (p.sprite.name && cart.sprites[p.sprite.name]) { sid = p.sprite.name; addAnims(sid, p.sprite.anim, p.sprite.fps, where); }
        else if (p.sprite.name) note(where, `uses sprite "${p.sprite.name}", which doesn't exist`);
        else if (p.sprite.color != null) sid = shapeSprite(name, p.sprite);
        if (p.sprite.angles || p.sprite.rotate) note(where, 'rotating / multi-angle sprites show frame 0 only');
      } else if (typeof p.sprite === 'string' && cart.sprites[p.sprite]) { sid = p.sprite; addAnims(sid, null, 6, where); }
      const ss = sid ? spriteSize[sid] : { w: 16, h: 16 };
      /* body */
      const needsBody = body || p.pickup || p.warp || p.hurt || p.talk || p.solid || p.stompable || p.control || p.ai;
      if (needsBody) {
        const b = { w: +(body && body.w) || Math.round(ss.w * 0.75), h: +(body && body.h) || Math.round(ss.h * 0.75) };
        if (p.solid) { b.solid = true; if (isObj(p.solid) && p.solid.oneWay) b.oneway = true; }
        if (body && body.solid === false) b.blocked = false;
        if (!body && (p.pickup || p.warp || (p.hurt && !p.ai && !p.control))) { b.blocked = false; b.sensor = true; }
        if (body && body.bounce) note(where, 'bouncing off walls isn\'t in v2 yet');
        c.body = b;
      }
      c.pos = {};
      if (moving || p.vel) { c.vel = {}; if (Array.isArray(p.vel)) { c.vel.x = +p.vel[0] || 0; c.vel.y = +p.vel[1] || 0; } }
      if (grav && body && body.gravity !== 0 && !body.static) { /* in v1 only things with a real "body" fall */ c.gravity = { g: Math.round(grav * (body && body.gravity != null ? +body.gravity : 1)) }; c.vel = c.vel || {}; }
      if (sid) { c.sprite = { id: sid }; if (c.body) { const oy = Math.round((c.body.h - ss.h) / 2); if (oy) c.sprite.oy = oy; } const an = cart.sprites[sid].anims || {}; if (!an.walk && !an.walk_up && !an.jump) c.sprite.auto = false; if (isObj(p.sprite) && p.sprite.layer) c.sprite.layer = p.sprite.layer | 0; }
      /* player control */
      if (isObj(p.control)) {
        const t = p.control.type || (grav ? 'platformer' : 'topdown');
        if (t === 'platformer') { c.platformer = { speed: +p.control.speed || 90, jump: +p.control.jump || 300 }; if (!c.gravity) c.gravity = { g: grav || 700 }; c.vel = c.vel || {}; if ((p.control.jumps | 0) > 1) note(where, 'double jump isn\'t in v2 yet'); }
        else { c.topdown = { speed: +p.control.speed || 72 }; if (t !== 'topdown') note(where, `"${t}" controls became top-down walking`); }
        if (p.control.player) (c.platformer || c.topdown).player = p.control.player | 0;
        if (!out.tags.includes('player')) out.tags.push('player');
      }
      /* ai */
      if (isObj(p.ai)) {
        const m = { patrol: 'patrol', chase: 'chase', flee: 'flee', wander: 'wander' }[p.ai.type];
        c.ai = { mode: m || (p.ai.type === 'fly' ? 'patrol' : 'idle'), speed: +p.ai.speed || 30 };
        if (p.ai.range) c.ai.range = +p.ai.range; if (p.ai.target && p.ai.target !== 'player') c.ai.target = p.ai.target;
        if (p.ai.type === 'fly') { c.mover = { dy: +p.ai.amp || 24, speed: 30 }; note(where, '"fly" became patrol plus a bobbing mover'); }
        else if (!m) note(where, `"${p.ai.type}" enemies aren't in v2 yet — it stands still`);
        if (p.ai.idle) note(where, 'what it does when the player is out of range ("idle") was left out');
      }
      /* health */
      if (isObj(p.health)) {
        c.health = { hp: +p.health.hp || 1, max: +p.health.hp || 1 }; if (p.health.invuln) c.health.invuln = +p.health.invuln;
        const die = [...loot(p.health.drop, where), ...acts(p.health.onDeath, where, null, { ts: 16 })];
        if (p.health.var) { const v = p.health.var; if (!(v in cart.vars)) cart.vars[v] = c.health.hp; if (!((v + 'Max') in cart.vars)) cart.vars[v + 'Max'] = c.health.max; varNames.add(v); varNames.add(v + 'Max');
          R.push({ on: 'update', doc: `keeps the "${v}" variable in step with health (v1 did this automatically)`, then: [{ act: 'set', path: v, to: 'self.health.hp' }, { act: 'set', path: v + 'Max', to: 'self.health.max' }] }); }
        if (p.health.effect || p.health.burst) note(where, 'death effects and particle bursts were left out');
        if (die.length) R.push({ on: 'die', then: die });
      }
      if (isObj(p.lifetime)) c.lifetime = { t: +p.lifetime.t || 0.2 };
      /* move path -> back-and-forth mover */
      if (isObj(p.move) && Array.isArray(p.move.path) && p.move.path.length >= 2) {
        const [a0, a1] = p.move.path, ts = 16; c.mover = { dx: ((a1[0] - a0[0]) || 0) * ts, dy: ((a1[1] - a0[1]) || 0) * ts, speed: +p.move.speed || 30 };
        if (p.move.path.length > 2) note(where, 'a path with more than two points became a back-and-forth between the first two');
      }
      /* touch damage, stomping */
      const hurt = isObj(p.hurt) ? p.hurt : null;
      if (hurt) {
        const tg = Array.isArray(hurt.targets) ? hurt.targets : hurt.targets ? [hurt.targets] : ['player'];
        for (const t of tg) {
          const dmg = { act: 'damage', target: 'other', amount: +hurt.damage || 1 }; if (hurt.knockback != null) dmg.knockback = +hurt.knockback;
          const then = [dmg, ...(hurt.destroy ? [{ act: 'destroy' }] : [])];
          if (p.stompable && t === 'player') R.push({ on: 'touch', with: t, doc: 'land on it to stomp it, touch it any other way and you get hurt', then: [{ act: 'if', test: 'other.pos.y < self.pos.y - 2 and other.vel.y > 0', then: [{ act: 'damage', target: 'self', amount: 1 }, { act: 'set', path: 'other.vel.y', to: -(+p.stompable.bounce || 220) }, ...(cart.sounds.stomp ? [{ act: 'sound', id: 'stomp' }] : [])], else: then }] });
          else R.push({ on: 'touch', with: t, then });
          usedTags.add(t);
        }
      } else if (p.stompable) R.push({ on: 'touch', with: 'player', if: 'other.pos.y < self.pos.y - 2 and other.vel.y > 0', then: [{ act: 'damage', target: 'self', amount: 1 }, { act: 'set', path: 'other.vel.y', to: -(+p.stompable.bounce || 220) }] });
      /* pickups */
      if (isObj(p.pickup)) {
        const pk = p.pickup, then = [];
        if (pk.var) { if (!(pk.var in cart.vars)) { cart.vars[pk.var] = 0; varNames.add(pk.var); } then.push({ act: 'add', path: pk.var, ...(pk.add != null && pk.add !== 1 ? { by: value(pk.add) } : {}) }); }
        if (pk.heal) then.push({ act: 'heal', target: 'other', amount: +pk.heal });
        const snd = pk.sound || (cart.sounds.coin ? 'coin' : null); if (snd && cart.sounds[snd]) then.push({ act: 'sound', id: snd });
        then.push(...acts(pk.do, where), { act: 'destroy' });
        R.push({ on: 'touch', with: 'player', then });
      }
      /* doors */
      if (isObj(p.warp)) {
        const o = { act: 'goto', scene: p.warp.scene };
        if (p.warp.at != null) o.at = wantMarker(p.warp.scene, 'at_' + slug(p.warp.at)); else if (p.warp.tx != null) o.at = wantMarker(p.warp.scene, `tile_${p.warp.tx | 0}_${p.warp.ty | 0}`);
        else note(where, 'a door without "at": v2 puts you at the level\'s start point, not the matching doorway — add an arrival spot on the map and set "at"');
        R.push({ on: 'touch', with: 'player', then: [...(cart.sounds.door ? [{ act: 'sound', id: 'door' }] : []), o] });
      }
      /* talking */
      if (isObj(p.talk)) {
        const tk = p.talk, say = (L, then) => { const s = { act: 'say', name: tk.name || '', lines: lines(L, where) }; if (then && then.length) s.then = then; return s; };
        let body = [say(tk.lines || [], acts(tk.then, where))];
        if (Array.isArray(tk.branches)) for (const b of [...tk.branches].reverse()) body = [{ act: 'if', test: cond(b.if), then: [say(b.lines || [], acts(b.do, where))], else: body }];
        if (tk.once) note(where, 'talking only once ("once") was left out');
        out.v = Object.assign({ talks: 0 }, out.v || {});   // v1 counted conversations for you as self.talks
        R.push({ on: 'interact', ...(tk.button && tk.button !== 'a' ? { button: tk.button } : {}), range: +tk.range || 26, then: [...(cart.sounds.talk ? [{ act: 'sound', id: 'talk' }] : []), ...body, { act: 'add', path: 'self.talks' }] });
      }
      /* attacks */
      if (isObj(p.attack) && p.attack.prefab) {
        const at = p.attack, pv = /^=self\.(\w+)$/.exec(String(at.prefab)), sp = { act: 'spawn', prefab: pv ? String((p.vars || {})[pv[1]]) : String(at.prefab), ahead: +at.offset || 12 };
        if (at.follow) sp.attach = true;   // v1 "follow": the swing moves with the player
        if (+at.speed) { sp.vx = `self.facing.x * ${+at.speed}`; sp.vy = `self.facing.y * ${+at.speed}`; }
        const then = [sp, ...(at.sound && cart.sounds[at.sound] ? [{ act: 'sound', id: at.sound }] : []), ...(sid && cart.sprites[sid].anims && cart.sprites[sid].anims.attack ? [{ act: 'anim', name: 'attack', lock: 0.2 }] : [])];
        if (p.control) R.push({ on: 'button', button: at.button || 'b', cooldown: +at.cooldown || 0.35, then });
        else { R.push({ on: 'every', t: +at.cooldown || 1, if: `dist(self, player) < ${+at.range || 120}`, then }); note(where, 'automatic attacks fire in the direction it faces, not aimed at the player'); }
      }
      if (isObj(p.spawner) && p.spawner.prefab) spawners.push([R, p.spawner]);
      /* its own rules */
      for (const r of p.rules || []) { const cr = rule(r, where, 'entity'); if (cr) R.push(...cr); }
      if (!out.tags.length) delete out.tags; if (!R.length) delete out.rules;
      return out;
    }
    /* ---------------------------------------------------------------- rules */
    const perPrefab = [];                               // collide rules become touch rules on the prefabs they involve
    function rule(r, where, owner, ctx) {
      if (!isObj(r)) return null;
      const then = () => acts(r.do || (r.goto ? [{ goto: r.goto }] : []), where, null, ctx), els = () => (r.else ? acts(Array.isArray(r.else) ? r.else : [r.else], where, null, ctx) : null);
      const fin = (o) => { if (r.if !== undefined && o.on !== 'when') o.if = cond(r.if); const e = els(); if (e && e.length) o.else = e; return [o]; };
      switch (r.on) {
        case 'start': case 'spawn': return fin({ on: owner === 'entity' ? 'spawn' : 'start', then: then() });
        case 'update': return fin({ on: 'update', then: then() });
        case 'every': case 'after': return fin({ on: r.on, t: +r.t || 1, then: then() });
        case 'button': return fin({ on: 'button', button: r.button || 'a', then: then() });
        case 'when': return [{ on: 'when', if: cond(r.if), then: then() }];
        case 'var': return [{ on: 'when', if: cond({ var: r.var, op: r.op, value: r.value }), then: then() }];
        case 'count': return [{ on: 'when', if: `count('${r.tag}') ${r.op || '=='} ${r.value}`, then: then() }];
        case 'event': return fin({ on: 'event', name: r.name, then: then() });
        case 'hit': case 'die': return fin({ on: r.on, then: then() });
        case 'touch': { const o = { on: 'touch', then: then() }; if (r.tag) { o.with = r.tag; usedTags.add(r.tag); } else o.with = 'player'; return fin(o); }
        case 'collide': {
          const roles = { a: 'other', b: 'self' };
          const o = { on: 'touch', with: r.a, then: acts(r.do, where, roles, ctx) }; if (r.if !== undefined) o.if = cond(r.if, roles);
          usedTags.add(r.a); usedTags.add(r.b); perPrefab.push([r.b, o, where]); return [];
        }
        case 'destroyed': { perPrefab.push([r.tag, { on: 'die', then: then() }, where]); note(where, '"destroyed" became "when it dies" on each thing tagged ' + r.tag); usedTags.add(r.tag); return []; }
        default: note(where, `"${r.on}" rules aren't in v2 yet — left out`); return null;
      }
    }

    /* ---------------------------------------------------------------- build prefabs from v1 prefabs and entity tiles */
    for (const name of Object.keys(v1.prefabs || {})) {
      const p = resolve(name); if (!isObj(p)) continue;
      /* used in both a top-down and a side-view level: v2 gravity belongs to the thing, so make a side-view twin */
      if (bothViews(name) && !p.control && !p.move && !p.solid && isObj(p.body) && p.body.gravity !== 0 && !p.body.static) {
        cart.prefabs[name] = prefab(name, p, 'Thing ' + name, 0);
        cart.prefabs[name + '_side'] = Object.assign(prefab(name, p, 'Thing ' + name), { doc: `the side-view copy of "${name}" (it falls); v1 used one thing for both` });
        twins.add(name);
      } else cart.prefabs[name] = prefab(name, p, 'Thing ' + name);
    }
    for (const [ch, t] of Object.entries(tiles)) {
      if (!tileEnt(t)) continue;
      const p = clone(t), name = tilePrefab(ch), where = `Tile "${ch}"`;
      if (typeof t.sprite === 'string') p.sprite = { name: t.sprite }; else if (t.color != null) p.sprite = { color: t.color, w: 16, h: 16 };
      if (t.hurt != null || t.kill) { p.hurt = { damage: t.kill ? 999 : +(isObj(t.hurt) ? t.hurt.damage : t.hurt) || 1, targets: ['player'], knockback: 0 }; }
      if (t.solid) p.solid = true;
      p.body = Object.assign({ w: 16, h: 16 }, p.body || {}, { static: true });   // tiles never fall
      if (!t.solid && !t.hit && !t.break) p.body.solid = false;
      const pf = prefab(name, p, where); pf.doc = `was tile "${ch}" in v1`;
      if (t.solid || t.hit || t.break) { pf.c.body.solid = true; delete pf.c.body.sensor; delete pf.c.body.blocked; }
      if (!t.solid && !t.hit && !t.break && (t.hurt != null || t.kill || t.warp)) { pf.c.body.sensor = true; pf.c.body.blocked = false; }
      if (isObj(t.hit)) {
        const h = t.hit, then = [];
        if (h.sound && cart.sounds[h.sound]) then.push({ act: 'sound', id: h.sound });
        if (h.spawn) then.push({ act: 'spawn', prefab: h.spawn, dy: -16 });
        then.push(...loot(h.drop, where), ...acts(h.do, where));
        if (h.become === '.') then.push({ act: 'destroy' }); else { pf.v = Object.assign(pf.v || {}, { used: false }); then.unshift({ act: 'set', path: 'self.used', to: true }); if (h.become) note(where, `turning into tile "${h.become}" when hit became "only works once"`); }
        pf.rules = pf.rules || []; pf.rules.push({ on: 'touch', with: 'player', if: (h.become === '.' ? '' : 'not self.used and ') + 'other.pos.y > self.pos.y + 6', doc: 'bump it from below', then });
      }
      if (t.break) {
        const b = isObj(t.break) ? t.break : {}; pf.tags = [...(pf.tags || []), 'breakable']; pf.c.health = { hp: +b.hp || 1, max: +b.hp || 1 };
        const die = [...(b.sound && cart.sounds[b.sound] ? [{ act: 'sound', id: b.sound }] : []), ...loot(b.drop, where), ...acts(b.do, where)];
        if (die.length) { pf.rules = pf.rules || []; pf.rules.push({ on: 'die', then: die }); }
        usedTags.add('breakable');
      }
      if (t.slow || t.boost || t.jump) note(where, 'driving surfaces (slow / boost / ramps) aren\'t in v2 yet');
      cart.prefabs[name] = pf;
    }
    for (const [R, sp] of spawners) { R.push({ on: 'every', t: +sp.every || 3, if: `count('${sp.prefab}') < ${+sp.max || 4}`, then: [{ act: 'spawn', prefab: sp.prefab }] }); usedTags.add(sp.prefab); }
    /* attacks that hurt enemies also break breakable tiles, as in v1 */
    if (usedTags.has('breakable')) for (const [n, pf] of Object.entries(cart.prefabs)) for (const r of pf.rules || []) if (r.on === 'touch' && r.with === 'enemy' && (cart.prefabs[n].c.lifetime || cart.prefabs[n].c.vel)) { pf.rules.push({ on: 'touch', with: 'breakable', then: [{ act: 'damage', target: 'other', amount: 1 }] }); break; }

    /* ---------------------------------------------------------------- tilesets and maps */
    const tsets = {};                                   // tileSize -> { id, chars: [], frames: [] }
    const tileImg = (t, ts) => {
      let rows = null;
      if (typeof t.sprite === 'string' && cart.sprites[t.sprite]) {
        const d = cart.sprites[t.sprite], src = d.frames[0].split('/');
        rows = []; for (let y = 0; y < ts; y++) { let r = ''; for (let x = 0; x < ts; x++) r += (src[y] || '')[x] || '.'; rows.push(r); }
        if (d.w !== ts || d.h !== ts) note(`Tile sprite "${t.sprite}"`, `is ${d.w}×${d.h} but tiles are ${ts}×${ts}; it was cropped or padded`);
        if (d.frames.length > 1) note(`Tile sprite "${t.sprite}"`, 'animated tiles show their first frame');
      } else { const ch = PIX[colorIdx(t.color, 23)]; rows = Array(ts).fill(ch.repeat(ts)); }
      return rows.join('/');
    };
    const tsetFor = (ts) => {
      if (!tsets[ts]) { const id = ts === 16 ? 'world' : 'world' + ts; tsets[ts] = { id, chars: [], frames: [] }; }
      return tsets[ts];
    };
    const tileIdIn = (T, ch) => { const t = tiles[ch]; if (!isObj(t) || tileEnt(t)) return -1; let i = T.chars.indexOf(ch); if (i < 0) { T.chars.push(ch); T.frames.push(tileImg(t, T.ts)); i = T.chars.length - 1; } return i + 1; };
    const enc = (ids, w, h) => DC2.encodeRows ? DC2.encodeRows(ids, w, h) : Array.from({ length: h }, (_, y) => ids.slice(y * w, y * w + w).map((n) => B36[Math.floor(n / 36)] + B36[n % 36]).join(''));

    for (const [sn, sc] of Object.entries(scenes)) {
      const where = 'Scene ' + sn, out = {}, ctx = { scene: sn, ts: +sc.tileSize || 16 };
      for (const k of ['mode7', 'layers']) if (sc[k] && (!Array.isArray(sc[k]) || sc[k].length)) note(where, { mode7: 'Mode 7 (3D ground) isn\'t in v2 yet — it shows as a flat map', layers: 'parallax background layers aren\'t in v2 yet', ysort: 'depth sorting is automatic in v2' }[k]);
      if (sc.camera) note(where, 'camera settings were left out');
      if (sc.music !== undefined && sc.music !== null && cart.music[sc.music]) out.music = sc.music;
      const rows = Array.isArray(sc.map) ? sc.map.map(String) : [];
      if (rows.length) {
        const ts = ctx.ts, T = tsetFor(ts); T.ts = ts;
        const H = rows.length, W = Math.max(...rows.map((r) => r.length)), back = new Array(W * H).fill(0), front = new Array(W * H).fill(0), objects = [], names = new Set();
        ctx.tileId = (ch) => tileIdIn(T, ch);
        const place = (pf, tx, ty, extra) => {
          if (twins.has(pf) && +(sc.gravity || 0) > 0) pf = pf + '_side';
          const P = cart.prefabs[pf]; if (!P) { note(where, `places "${pf}", which doesn't exist`); return null; }
          const bh = P.c.body ? P.c.body.h : P.c.sprite && spriteSize[P.c.sprite.id] ? spriteSize[P.c.sprite.id].h : ts;
          const o = Object.assign({ prefab: pf, x: (tx + 0.5) * ts, y: (ty + 1) * ts - bh / 2 }, extra || {});
          if (pf.startsWith('tile_')) o.y = (ty + 0.5) * ts;
          objects.push(o); return o;
        };
        rows.forEach((row, ty) => [...row].forEach((ch, tx) => {
          if (ch === '.' || ch === ' ') return;
          const L = (sc.legend || {})[ch];
          if (L) {
            const o = place(typeof L === 'string' ? L : L.prefab, tx, ty);
            if (o && isObj(L) && isObj(L.with)) note(where, `per-placement settings on legend "${ch}" were left out`);
            if (o) { const nm = 'at_' + slug(ch); if (!names.has(nm)) { names.add(nm); o.name = nm; } }
            return;
          }
          const t = tiles[ch];
          if (!isObj(t)) { note(where, `map character "${ch}" isn't a tile or legend entry`); return; }
          if (tileEnt(t)) { const o = place(tilePrefab(ch), tx, ty); if (o) { const nm = 'at_' + slug(ch); if (!names.has(nm)) { names.add(nm); o.name = nm; } } return; }
          const id = tileIdIn(T, ch); (t.layer >= 1 ? front : back)[ty * W + tx] = id;
        }));
        for (const e of sc.entities || []) place(e.prefab, +e.tx || 0, +e.ty || 0);
        /* the player's spawn gets the name "start" if nothing else claimed it */
        const pl = objects.find((o) => (cart.prefabs[o.prefab].tags || []).includes('player'));
        if (pl && !pl.name) pl.name = 'start';
        cart.maps[sn] = { w: W, h: H, tileset: T.id, layers: [{ name: 'tiles', rows: enc(back, W, H) }], objects };
        if (front.some((n) => n)) { cart.maps[sn].layers.push({ name: 'front', rows: enc(front, W, H) }); note(where, 'tiles drawn in front of characters ("layer": 1) are drawn behind them in v2'); }
        out.map = sn;
        if (+sc.gravity) note(where, 'falling off the bottom of the map doesn\'t kill in v2 — the edge is a floor');
      }
      const hud = [...(sc.hud !== undefined ? sc.hud : v1.hud || [])].map((h) => {
        if (!isObj(h)) return null;
        if (h.text !== undefined) { const o = { text: text(String(h.text).replace(/^=/, '')), x: h.x === 'center' ? 0 : +h.x || 0, y: +h.y || 0, color: colorIdx(h.color, 21) }; if (h.x === 'center' || h.align === 'center') o.align = 'center'; else if (h.align === 'right') o.align = 'right'; if (h.if !== undefined) o.if = cond(h.if); return o; }
        if (h.bar) return { text: `${h.bar.toUpperCase()} {${expr(h.bar)}}/{${expr(h.max || h.bar + 'Max')}}`, x: +h.x || 0, y: +h.y || 0, color: colorIdx(h.color, 27) };
        if (h.icons) return { text: `{${expr(h.count)}}/{${expr(h.max || h.count + 'Max')}}`, x: +h.x || 0, y: +h.y || 0, color: 27 };
        note(where, 'HUD pictures and minimaps became nothing (v2 HUDs are text)'); return null;
      }).filter(Boolean);
      if (hud.some((h) => /\{/.test(h.text)) && (sc.hud || v1.hud || []).some((h) => h && (h.bar || h.icons))) note(where, 'HUD bars and hearts became text like "HP 3/6"');
      if (hud.length) out.hud = hud;
      const rs = []; for (const r of sc.rules || []) { const cr = rule(r, where, 'scene', ctx); if (cr) rs.push(...cr); }
      if (rs.length) out.rules = rs;
      if (sc.vars) note(where, 'variables set on entering the scene were left out');
      cart.scenes[sn] = out;
    }
    for (const r of v1.rules || []) { const cr = rule(r, 'Game rules', 'world', { scene: null, ts: 16 }); if (cr) cart.rules.push(...cr); }

    /* collide / destroyed rules land on each prefab carrying the tag (v1 tags every prefab with its own name too) */
    const hasTag = (name, t) => name === t || (cart.prefabs[name].tags || []).includes(t);
    for (const [tag, r, where] of perPrefab) { const hit = Object.keys(cart.prefabs).filter((n) => hasTag(n, tag)); if (!hit.length) note(where, `a rule about "${tag}" matched no thing`); for (const n of hit) (cart.prefabs[n].rules = cart.prefabs[n].rules || []).push(clone(r)); }
    /* anything with a touch rule needs a body to be touched */
    for (const [n, pf] of Object.entries(cart.prefabs)) if (!pf.c.body && (pf.rules || []).some((r) => r.on === 'touch')) { const sz = pf.c.sprite && spriteSize[pf.c.sprite.id] || { w: 16, h: 16 }; pf.c.body = { w: Math.round(sz.w * 0.75), h: Math.round(sz.h * 0.75), blocked: false, sensor: true }; }
    for (const t of usedTags) for (const n of Object.keys(cart.prefabs)) if (n === t && !(cart.prefabs[n].tags || []).includes(t)) cart.prefabs[n].tags = [...(cart.prefabs[n].tags || []), t];

    /* tilesets: one sheet sprite per tile size, tile number = frame + 1 */
    for (const T of Object.values(tsets)) {
      const sid = T.id === 'world' ? 'tiles' : 'tiles' + T.ts, defs = {};
      cart.sprites[sid] = { w: T.ts, h: T.ts, palette: 'main', frames: T.frames.length ? T.frames : [Array(T.ts).fill('.'.repeat(T.ts)).join('/')] };
      T.chars.forEach((ch, i) => { const t = tiles[ch], d = { name: 'tile ' + ch }; if (t.solid) d.solid = true; if (t.oneWay) d.oneway = true; defs[i + 1] = d; });
      cart.tilesets[T.id] = { tileSize: T.ts, sprite: sid, tiles: defs };
    }
    if (!Object.keys(cart.tilesets).length) { cart.sprites.tiles = { w: 16, h: 16, palette: 'main', frames: [Array(16).fill('.'.repeat(16)).join('/')] }; cart.tilesets.world = { tileSize: 16, sprite: 'tiles', tiles: {} }; }

    /* markers requested by doors/scene changes ("at" a legend character or a tile) */
    for (const [sn, keys] of Object.entries(markerFor)) {
      const m = cart.maps[(cart.scenes[sn] || {}).map]; if (!m) continue; const ts = cart.tilesets[m.tileset].tileSize;
      for (const k of keys) {
        if (m.objects.some((o) => o.name === k)) continue;
        const mt = /^tile_(\d+)_(\d+)$/.exec(k); if (mt) { m.objects.push({ name: k, x: (+mt[1] + 0.5) * ts, y: (+mt[2] + 0.5) * ts }); continue; }
        note('Scene ' + sn, `a door arrives "at" something that isn't on this map (${k.slice(3)}); you'll arrive at the start instead`);
        const walk = (list) => { for (const a of list || []) { if (a.act === 'goto' && a.scene === sn && a.at === k) delete a.at; walk(a.then); walk(a.else); } };
        for (const pf of Object.values(cart.prefabs)) for (const r of pf.rules || []) { walk(r.then); walk(r.else); }
        for (const s of Object.values(cart.scenes)) for (const r of s.rules || []) { walk(r.then); walk(r.else); }
        walk(cart.rules.flatMap((r) => [r]).flatMap((r) => r.then || []));
      }
    }

    /* player, start scene, and which extensions the game needs */
    const players = Object.keys(cart.prefabs).filter((n) => (cart.prefabs[n].tags || []).includes('player') && (cart.prefabs[n].c.topdown || cart.prefabs[n].c.platformer));
    if (players.length) cart.meta.player = (cart.maps[cart.meta.start] && cart.maps[cart.meta.start].objects.map((o) => o.prefab).find((p) => players.includes(p))) || players[0];
    if (!cart.scenes[cart.meta.start]) cart.meta.start = Object.keys(cart.scenes)[0];
    for (const [sn, sd] of Object.entries(cart.scenes)) { const m = cart.maps[sd.map]; if (m && cart.meta.player && !m.objects.some((o) => o.prefab && (cart.prefabs[o.prefab].tags || []).includes('player')) && m.objects.length) note('Scene ' + sn, 'no player is placed in this level (it wasn\'t in v1 either) — add one from the Map tab'); }
    /* v1's one "control" component is topdown or platformer in v2, depending on the player */
    { const pp = cart.prefabs[cart.meta.player], mv = pp && pp.c.platformer ? 'platformer' : 'topdown', fixed = JSON.stringify(Object.assign({}, cart, { meta: undefined })).split('__control__').join(mv), back = JSON.parse(fixed); for (const k of Object.keys(back)) cart[k] = back[k]; }
    const need = new Set(['space2d', 'sprite']), compExt = { topdown: 'topdown', platformer: 'platformer', gravity: 'platformer', mover: 'platformer', health: 'combat', lifetime: 'combat', ai: 'ai' };
    for (const pf of Object.values(cart.prefabs)) for (const k of Object.keys(pf.c)) if (compExt[k]) need.add(compExt[k]);
    const json = JSON.stringify(cart);
    if (/"act":"say"/.test(json)) need.add('dialogue');
    if (/"act":"(damage|heal|keepAlive)"/.test(json) || /"on":"(hit|die)"/.test(json)) need.add('combat');
    const order = ['space2d', 'sprite', 'combat', 'topdown', 'platformer', 'ai', 'dialogue'];
    cart.meta.extensions = order.filter((e) => need.has(e));
    for (const k of ['sounds', 'music', 'rules']) if (!Object.keys(cart[k]).length) delete cart[k];
    /* v1 made variables and flag keys up on first use; v2 wants them declared. Declare whatever the checker asks for. */
    if (S.check) for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const e of S.check(cart).errors) {
        let m = /^unknown variable "([\w$]+)"/.exec(e.msg);
        if (m && !(m[1] in cart.vars)) { cart.vars[m[1]] = 0; note('Variables', `"${m[1]}" was used without being declared; it now starts at 0`); changed = true; continue; }
        m = /^"([\w.$]+)" has no "([\w$]+)"/.exec(e.msg);
        if (m) { let o = cart.vars; for (const k of m[1].split('.')) o = isObj(o) ? o[k] : null; if (isObj(o) && !(m[2] in o)) { o[m[2]] = /^flags?$/i.test(m[1]) ? false : 0; note('Variables', `"${m[1]}.${m[2]}" was used without being declared; it now starts as ${o[m[2]]}`); changed = true; } }
      }
      if (!changed) break;
    }
    if (S.splitTileSheet) S.splitTileSheet(cart);   // one sprite per tile, like every v2 project
    /* v1 turned an attack that follows the player toward where they face; v2 does that with sprite "turn" */
    { const walk = (list) => { for (const a of list || []) { if (a && a.act === 'spawn' && a.attach && cart.prefabs[a.prefab]) { const sp = cart.prefabs[a.prefab].c.sprite, d = sp && cart.sprites[sp.id]; if (sp && sp.turn === undefined && d && Object.keys(d.anims || { idle: 1 }).length <= 1) sp.turn = true; } if (a) { walk(a.then); walk(a.else); } } };
      for (const p of Object.values(cart.prefabs)) for (const r of p.rules || []) { walk(r.then); walk(r.else); } }
    /* Safety net: any rule, action or HUD line that still doesn't make sense to v2 is taken out and listed, so the
       game always opens clean. (Anything else wrong is left for the Problems list, where it can be fixed by hand.) */
    const toks = (path) => path.replace(/\[(\d+)\]/g, '.$1').split('.').map((t) => (/^\d+$/.test(t) ? +t : t));
    const getAt = (ts) => ts.reduce((o, k) => (o == null ? o : o[k]), cart);
    const brief = (v) => { const t = JSON.stringify(v); return t.length > 90 ? t.slice(0, 87) + '…' : t; };
    const whereOf = (ts) => (ts[0] === 'prefabs' ? 'Thing ' + ts[1] : ts[0] === 'scenes' ? 'Scene ' + ts[1] : 'Game rules');
    if (S.check) for (let n = 0; n < 300; n++) {
      let done = false;
      for (const e of S.check(cart).errors) {
        const ts = toks(e.path);
        let cut = -1; for (let i = ts.length - 1; i > 0; i--) if (typeof ts[i] === 'number' && ['then', 'else', 'rules', 'hud'].includes(ts[i - 1])) { cut = i; break; }
        if (cut < 0) continue;
        const holder = getAt(ts.slice(0, cut)), item = holder && holder[ts[cut]]; if (!Array.isArray(holder) || item === undefined) continue;
        holder.splice(ts[cut], 1);
        const kind = ts[cut - 1] === 'rules' ? 'a rule' : ts[cut - 1] === 'hud' ? 'a HUD line' : 'an action';
        note(whereOf(ts), `${kind} v2 couldn't use was left out (${e.msg}): ${brief(item)}`);
        done = true; break;
      }
      if (!done) break;
    }
    return { cart, notes };
  }

  S.v1 = { isV1, convert };
})(typeof window !== 'undefined' ? window : globalThis);
