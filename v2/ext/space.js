/* v2 extensions: space2d (positions, bodies, tile + body collision, contact triggers),
   topdown (player movement), sprite (animation state). */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT, BUTTONS = DC2.BUTTONS;

  /* 0 = empty, 1 = solid, 2 = one-way (solid only when landing on it from above) */
  function tileKind(w, scene, tx, ty) {
    const m = scene.map; if (!m) return 0;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 1;
    const defs = (w.cart.tilesets[m.tileset] || {}).tiles || {};
    let kind = 0;
    for (const L of m.layers) {
      const id = L.ids[ty * m.w + tx]; if (!id) continue;
      if (L.collide) return 1;
      const d = defs[id]; if (d && d.solid) return 1; if (d && d.oneway) kind = 2;
    }
    return kind;
  }
  const tileSolid = (w, scene, tx, ty) => tileKind(w, scene, tx, ty) === 1;
  DC2.tileSolid = tileSolid;
  /* the tags of every tile (on any layer) under a point, e.g. ["water"] */
  DC2.tileTagsAt = (w, scene, x, y) => {
    const m = scene && scene.map; if (!m) return [];
    const tx = Math.floor(x / m.ts), ty = Math.floor(y / m.ts); if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return [];
    const defs = (w.cart.tilesets[m.tileset] || {}).tiles || {}, out = [];
    for (const L of m.layers) { const d = defs[L.ids[ty * m.w + tx]]; if (d && d.tags) for (const t of d.tags) if (!out.includes(t)) out.push(t); }
    return out;
  };
  const onTile = (w, e, tag) => !!(e && e.c.pos && DC2.tileTagsAt(w, w.active(), e.c.pos.x, e.c.pos.y).includes(tag));

  function resolveTiles(w, scene, e, axis, vel) {
    const p = e.c.pos, b = e.c.body, m = scene.map; if (!m) return false;
    const ts = m.ts; let hit = false;
    const prevBottom = axis === 'y' ? p.y - vel * DT + b.oy + b.h / 2 : 0;
    for (let iter = 0; iter < 3; iter++) {
      const l = p.x + b.ox - b.w / 2, t = p.y + b.oy - b.h / 2;
      const tx0 = Math.floor(l / ts), tx1 = Math.floor((l + b.w - 0.001) / ts), ty0 = Math.floor(t / ts), ty1 = Math.floor((t + b.h - 0.001) / ts);
      let pushed = false;
      for (let ty = ty0; ty <= ty1 && !pushed; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const kind = tileKind(w, scene, tx, ty);
        if (!kind) continue;
        if (kind === 2 && (axis === 'x' || vel <= 0 || prevBottom > ty * ts + 0.5)) continue;
        if (axis === 'x') p.x = vel > 0 ? tx * ts - b.w / 2 - b.ox : (tx + 1) * ts + b.w / 2 - b.ox;
        else p.y = vel > 0 ? ty * ts - b.h / 2 - b.oy : (ty + 1) * ts + b.h / 2 - b.oy;
        hit = pushed = true; break;
      }
      if (!pushed) break;
    }
    return hit;
  }
  function resolveBodies(w, scene, e, axis, vel) {
    const p = e.c.pos, b = e.c.body; let hit = false;
    const prevBottom = axis === 'y' ? p.y - vel * DT + b.oy + b.h / 2 : 0;
    for (const o of scene.ents) {
      if (o === e || o.dead || !o.c.pos || !o.c.body || !o.c.body.solid) continue;
      const q = o.c.pos, c = o.c.body;
      if (c.oneway && (axis === 'x' || vel <= 0 || prevBottom > q.y + c.oy - c.h / 2 + 0.5)) continue;
      const dx = Math.abs(p.x + b.ox - (q.x + c.ox)), dy = Math.abs(p.y + b.oy - (q.y + c.oy));
      if (dx >= (b.w + c.w) / 2 || dy >= (b.h + c.h) / 2) continue;
      if (axis === 'x') p.x = vel > 0 ? q.x + c.ox - c.w / 2 - b.w / 2 - b.ox : q.x + c.ox + c.w / 2 + b.w / 2 - b.ox;
      else p.y = vel > 0 ? q.y + c.oy - c.h / 2 - b.h / 2 - b.oy : q.y + c.oy + c.h / 2 + b.h / 2 - b.oy;
      hit = true;
    }
    return hit;
  }
  /* Tiles with tags count as things you can touch. A body overlapping a tagged tile cell is a contact, keyed "entity:tCELL";
     what the rule sees as "other" is a stand-in for the tile: its tags, and a position at the middle of that cell. */
  function tileContacts(w, scene, list, now) {
    const m = scene.map; if (!m) return;
    const defs = (w.cart.tilesets[m.tileset] || {}).tiles || {}, tagged = new Set(); for (const n in defs) if (defs[n] && defs[n].tags && defs[n].tags.length) tagged.add(+n);
    if (!tagged.size) return;
    for (const e of list) {
      if (!(w.hasRule(e.prefab, 'touch') || w.hasRule(e.prefab, 'untouch'))) continue;
      const B = e.c.body, bx = e.c.pos.x + B.ox, by = e.c.pos.y + B.oy;
      /* look one pixel past the body: a solid tile it is pressed flat against counts as touched (like a solid thing does) */
      const x0 = Math.max(0, Math.floor((bx - B.w / 2 - 1) / m.ts)), x1 = Math.min(m.w - 1, Math.floor((bx + B.w / 2 + 1) / m.ts));
      const y0 = Math.max(0, Math.floor((by - B.h / 2 - 1) / m.ts)), y1 = Math.min(m.h - 1, Math.floor((by + B.h / 2 + 1) / m.ts));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const tags = []; let solid = false;
        for (const L of m.layers) { const id = L.ids[ty * m.w + tx]; if (id && tagged.has(id)) { for (const t of defs[id].tags) if (!tags.includes(t)) tags.push(t); if (L.collide || defs[id].solid) solid = true; } }
        if (!tags.length) continue;
        const cx = (tx + 0.5) * m.ts, cy = (ty + 0.5) * m.ts, pad = solid ? 1 : 0;
        if (Math.abs(bx - cx) < (B.w + m.ts) / 2 + pad && Math.abs(by - cy) < (B.h + m.ts) / 2 + pad) now[`${e.id}:t${ty * m.w + tx}`] = { tags, x: cx, y: cy };
      }
    }
  }
  const tileStandIn = (info) => ({ id: -1, prefab: '@tile', isTile: true, tags: new Set(info.tags), c: { pos: { x: info.x, y: info.y } }, v: {}, r: {}, dead: false });
  function pairsNow(w, scene) {
    const list = scene.ents.filter((e) => !e.dead && e.c.pos && e.c.body), now = {};
    tileContacts(w, scene, list, now);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!(w.hasRule(a.prefab, 'touch') || w.hasRule(a.prefab, 'untouch') || w.hasRule(b.prefab, 'touch') || w.hasRule(b.prefab, 'untouch'))) continue;
      const A = a.c.body, B = b.c.body, pad = A.solid || B.solid ? 1 : 0;
      if (Math.abs(a.c.pos.x + A.ox - (b.c.pos.x + B.ox)) < (A.w + B.w) / 2 + pad && Math.abs(a.c.pos.y + A.oy - (b.c.pos.y + B.oy)) < (A.h + B.h) / 2 + pad)
        now[a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`] = true;
    }
    return now;
  }
  /* "with" names a tag on the other thing or, now, on a tile. Without "with", only things count (never tiles). */
  const tagMatch = (rule, ctx) => (rule.with ? ctx.other.tags.has(rule.with) : !ctx.other.isTile);

  DC2.defineExtension({
    name: 'space2d',
    doc: 'Positions, bodies, movement, collision against tiles and solid bodies, and contact/interact triggers.',
    install(r) {
      r.component('pos', { doc: 'Where the entity is: the centre of its body, in pixels.', fields: { x: { type: 'number', default: 0, runtime: true }, y: { type: 'number', default: 0, runtime: true } } });
      r.component('vel', { needs: ['pos'], doc: 'Velocity in pixels per second. Something (topdown, ai, a rule) sets it; movement applies it.', fields: { x: { type: 'number', default: 0 }, y: { type: 'number', default: 0 } } });
      r.component('body', { needs: ['pos'], doc: 'A box for collision and contact triggers.', fields: {
        w: { type: 'number', default: 12, min: 1 }, h: { type: 'number', default: 12, min: 1 }, ox: { type: 'number', default: 0 }, oy: { type: 'number', default: 0 },
        blocked: { type: 'bool', default: true, doc: 'stopped by solid tiles and solid bodies' },
        solid: { type: 'bool', default: false, doc: 'stops other bodies (an NPC, a crate)' },
        oneway: { type: 'bool', default: false, doc: 'with solid: only stops things landing on it from above (a platform)' },
        sensor: { type: 'bool', default: false, doc: 'only detects contacts (a pickup, a hitbox)' } } });
      const withSpec = { with: { type: 'string', optional: true, doc: 'only when the other thing, or a tile, has this tag' } };
      r.trigger('touch', { doc: 'Two bodies start overlapping — or this one starts overlapping a tile that has the tag in "with". self = this entity, other = the one it touched (for a tile, other is at the middle of that tile).', owners: ['entity'], params: withSpec, match: tagMatch });
      r.trigger('untouch', { doc: 'Two bodies stop overlapping.', owners: ['entity'], params: withSpec, match: tagMatch });
      r.trigger('interact', { doc: 'A player presses a button while standing near this entity.', owners: ['entity'],
        params: { button: { type: 'enum', values: BUTTONS, default: 'a' }, range: { type: 'number', default: 24 } },
        poll(w, rule, st, ctx) {
          const self = ctx.self; if (!self || !self.c.pos) return false;
          for (const p of w.active().ents) {
            if (p.dead || !p.tags.has('player') || !p.c.pos) continue;
            const inp = w.input.players[p.c.topdown ? p.c.topdown.player | 0 : 0];
            if (!inp || !inp.pressed[rule.button || 'a']) continue;
            if (Math.hypot(p.c.pos.x - self.c.pos.x, p.c.pos.y - self.c.pos.y) <= (rule.range == null ? 24 : rule.range)) { ctx.other = p; return true; }
          }
          return false;
        } });
      const tileSpec = { tag: { type: 'string', required: true, doc: 'a tag you gave tiles in their settings, like "water"' } };
      r.trigger('entertile', { doc: 'This entity steps onto a tile with this tag (checked at its centre).', owners: ['entity'], params: tileSpec,
        poll(w, rule, st, ctx) { const on = onTile(w, ctx.self, rule.tag); const f = on && !st.was; st.was = on; return f; } });
      r.trigger('leavetile', { doc: 'This entity steps off the last tile with this tag.', owners: ['entity'], params: tileSpec,
        poll(w, rule, st, ctx) { const on = onTile(w, ctx.self, rule.tag); const f = !on && st.was === true; st.was = on; return f; } });
      r.component('follow', { needs: ['pos'], doc: 'Sticks to another entity (a ripple under a swimmer, a hat, a shadow).', fields: {
        target: { type: 'string', default: 'player', doc: 'tag of the entity to follow (the nearest one)' },
        ox: { type: 'number', default: 0 }, oy: { type: 'number', default: 0 } } });
      r.system('follow', { order: 35, update(w, scene) {
        /* things spawned with "attach": stay "ahead" of whoever made them, in the direction they face now */
        let byId = null;
        for (const e of scene.ents) {
          const at = e.r.attach; if (e.dead || !at || !e.c.pos) continue;
          if (!byId) { byId = new Map(); for (const o of scene.ents) byId.set(o.id, o); }
          const o = byId.get(at.id); if (!o || o.dead || !o.c.pos) continue;
          const f = o.r.face || { x: 0, y: 1 };
          e.c.pos.x = o.c.pos.x + f.x * at.ahead + at.dx; e.c.pos.y = o.c.pos.y + f.y * at.ahead + at.dy; e.r.face = { x: f.x, y: f.y };
        }
        for (const e of scene.ents) {
          const f = e.c.follow; if (e.dead || !f || !e.c.pos) continue;
          const t = w.nearest(e, f.target); if (!t || !t.c.pos) continue;
          e.c.pos.x = t.c.pos.x + (+f.ox || 0); e.c.pos.y = t.c.pos.y + (+f.oy || 0);
          if (t.r.face) e.r.face = { x: t.r.face.x, y: t.r.face.y };
        }
      } });
      r.action('move', { doc: 'Set an entity\'s position.', params: { target: { type: 'string', default: 'self' }, x: { type: 'expr', required: true }, y: { type: 'expr', required: true } },
        run(w, ctx, p, a) { for (const e of w.targets(a.target || 'self', ctx)) if (e.c.pos) { e.c.pos.x = +p.x; e.c.pos.y = +p.y; } } });
      r.system('movement', { order: 30, update(w, scene) {
        for (const e of scene.ents) {
          if (e.dead || !e.c.pos || !e.c.vel) continue;
          const p = e.c.pos, v = e.c.vel, b = e.c.body; let vx = v.x, vy = v.y;
          const kb = e.r.kb; if (kb && kb.t > 0) { vx += kb.x; vy += kb.y; kb.t -= DT; }
          const bump = { x: false, y: false, dx: 0, dy: 0 };
          p.x += vx * DT;
          if (b && b.blocked && vx && (resolveTiles(w, scene, e, 'x', vx) | resolveBodies(w, scene, e, 'x', vx))) { bump.x = true; bump.dx = Math.sign(vx); v.x = 0; }
          p.y += vy * DT;
          if (b && b.blocked && vy && (resolveTiles(w, scene, e, 'y', vy) | resolveBodies(w, scene, e, 'y', vy))) { bump.y = true; bump.dy = Math.sign(vy); v.y = 0; }
          e.r.bump = bump;
        }
      } });
      r.system('contacts', { order: 40, update(w, scene) {
        const now = pairsNow(w, scene), old = scene.contacts || {};
        scene.contacts = now;
        const find = (id) => scene.ents.find((e) => e.id === id && !e.dead);
        const fire = (k, trig) => {
          const [xs, ys] = k.split(':'), a = find(+xs); if (!a) return;
          if (ys[0] === 't') { w.fireOn(a, trig, { other: tileStandIn((trig === 'touch' ? now : old)[k]) }); return; }   // a tagged tile: only this entity has rules
          const b = find(+ys); if (!b) return; w.fireOn(a, trig, { other: b }); w.fireOn(b, trig, { other: a });
        };
        for (const k in now) if (!old[k]) fire(k, 'touch');
        for (const k in old) if (!now[k]) fire(k, 'untouch');
      } });
      /* arriving in a scene while already overlapping something must not count as a new touch */
      r.hook('sceneEnter', (w, scene) => { scene.contacts = pairsNow(w, scene); });
    },
  });

  DC2.defineExtension({
    name: 'topdown',
    requires: ['space2d'],
    doc: 'Four/eight-direction player movement from the d-pad.',
    install(r) {
      r.component('topdown', { needs: ['pos', 'vel'], doc: 'Moves this entity from a player\'s d-pad and remembers which way it faces (self.facing).', fields: { speed: { type: 'number', default: 70 }, player: { type: 'int', default: 0, min: 0, max: 3 } } });
      r.system('topdown', { order: 10, update(w, scene) {
        for (const e of scene.ents) {
          const t = e.c.topdown; if (e.dead || !t || !e.c.vel) continue;
          const inp = w.input.players[t.player | 0], d = inp ? inp.down : {};
          let x = (d.right ? 1 : 0) - (d.left ? 1 : 0), y = (d.down ? 1 : 0) - (d.up ? 1 : 0);
          if (x && y) { x *= 0.7071; y *= 0.7071; }
          e.c.vel.x = x * t.speed; e.c.vel.y = y * t.speed;
          if (x || y) e.r.face = Math.abs(x) >= Math.abs(y) ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };
        }
      } });
    },
  });

  DC2.defineExtension({
    name: 'sprite',
    doc: 'Drawing state: which sprite, which animation. The platform draws it; the kernel only keeps time.',
    install(r) {
      r.component('sprite', { doc: 'A sprite (see "sprites" in the cart). Centre is pos + (ox, oy).', fields: {
        id: { type: 'ref:sprite', required: true }, anim: { type: 'string', default: 'idle', label: 'Animation' }, t: { type: 'number', default: 0, runtime: true },
        flip: { type: 'bool', default: false }, layer: { type: 'int', default: 0, doc: 'higher draws in front' },
        ox: { type: 'number', default: 0 }, oy: { type: 'number', default: 0 },
        turn: { type: 'bool', default: false, doc: 'turn with facing: drawn rotated toward where it faces (draw the art pointing right)' },
        sink: { type: 'int', default: 0, min: 0, doc: 'hide this many pixels at the bottom (wading, swimming, sinking in sand)' },
        auto: { type: 'bool', default: true, label: 'Pick animation automatically', doc: 'chooses idle or walk from how it moves' } } });
      r.action('anim', { doc: 'Play an animation from the start.', params: { target: { type: 'string', default: 'self' }, name: { type: 'string', required: true, label: 'Animation' }, lock: { type: 'number', default: 0, doc: 'seconds automatic animation is paused' } },
        run(w, ctx, p, a) { for (const e of w.targets(a.target || 'self', ctx)) if (e.c.sprite) { e.c.sprite.anim = a.name; e.c.sprite.t = 0; e.r.animLock = a.lock || 0; } } });
      /* effect: plays a sprite's animation once at a spot, then disappears (a splash, a puff of smoke, a sparkle) */
      r.action('effect', { doc: 'Play a picture\'s animation once at a spot (splash, smoke, sparkle). Nothing to set up first.', params: {
        sprite: { type: 'ref:sprite', required: true }, anim: { type: 'string', optional: true, label: 'Animation', doc: 'which animation (default: its first)' },
        at: { type: 'enum', values: ['self', 'other', 'world'], default: 'self' }, x: { type: 'expr', optional: true }, y: { type: 'expr', optional: true },
        dx: { type: 'expr', default: 0 }, dy: { type: 'expr', default: 0 }, layer: { type: 'int', default: 2, doc: 'higher draws in front' } },
        run(w, ctx, p, a) {
          const def = w.cart.sprites[a.sprite]; if (!def) return;
          const base = a.at === 'world' ? null : a.at === 'other' ? ctx.other : ctx.self;
          const x = (a.at === 'world' || !base || !base.c.pos ? +p.x || 0 : base.c.pos.x) + (+p.dx || 0), y = (a.at === 'world' || !base || !base.c.pos ? +p.y || 0 : base.c.pos.y) + (+p.dy || 0);
          const names = Object.keys(def.anims || {}), anim = a.anim && def.anims && def.anims[a.anim] ? a.anim : names[0] || 'idle', an = (def.anims || {})[anim];
          const e = w.spawnRaw(['effect'], { pos: { x, y }, sprite: { id: a.sprite, anim, auto: false, layer: a.layer == null ? 2 : a.layer } });
          e.r.ttl = an ? an.f.length / (an.fps || 8) : Math.max(0.1, def.frames.length / 8);
          if (base && base.c.sprite && base.c.sprite.flip) e.c.sprite.flip = true;
        } });
      r.action('setsprite', { doc: 'Change a thing\'s picture (and optionally its animation).', params: {
        target: { type: 'string', default: 'self' }, sprite: { type: 'ref:sprite', required: true }, anim: { type: 'string', optional: true, label: 'Animation' } },
        run(w, ctx, p, a) { for (const e of w.targets(a.target || 'self', ctx)) if (e.c.sprite) { e.c.sprite.id = a.sprite; if (a.anim) e.c.sprite.anim = a.anim; else if (!(w.cart.sprites[a.sprite].anims || {})[e.c.sprite.anim]) e.c.sprite.anim = 'idle'; e.c.sprite.t = 0; } } });
      r.system('animate', { order: 80, update(w, scene) {
        for (const e of scene.ents) {
          if (e.r.ttl != null && !e.dead) { e.r.ttl -= DC2.DT; if (e.r.ttl <= 0) { e.dead = true; continue; } }
          const s = e.c.sprite; if (e.dead || !s) continue;
          const def = w.cart.sprites[s.id]; if (!def) continue;
          if (s.auto && e.c.vel && !(e.r.animLock > 0)) {
            const an = def.anims || {}, f = e.r.face || { x: 0, y: 1 };
            const base = Math.hypot(e.c.vel.x, e.c.vel.y) > 1 ? 'walk' : 'idle';
            const dir = f.y < 0 ? '_up' : f.y > 0 ? '_down' : '_side';
            const pick = e.r.air && an.jump ? 'jump' : an[base + dir] ? base + dir : an[base] ? base : an.idle ? 'idle' : s.anim;
            if (pick !== s.anim) { s.anim = pick; s.t = 0; }
            if (f.x) s.flip = f.x < 0;
          }
          if (e.r.animLock > 0) e.r.animLock -= DT;
          s.t += DT;
        }
      } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
