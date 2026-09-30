/* v2 extensions: combat (health, damage, lifetime) and ai (simple movement brains).
   Note what is NOT here: hurt, pickup, warp, stompable, loot. In v2 those are just rules. */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT;

  DC2.defineExtension({
    name: 'combat',
    doc: 'Hit points, damage with invulnerability and knockback, and short-lived entities. Contact damage, pickups, drops and doors are ordinary rules.',
    install(r) {
      r.component('health', { doc: 'Hit points. When hp reaches 0 the "die" rules run, then the entity is removed (unless a rule calls keepAlive).', fields: {
        hp: { type: 'number', default: 1 }, max: { type: 'number', default: 1 }, invuln: { type: 'number', default: 0.6, doc: 'seconds of immunity after a hit' },
        t: { type: 'number', default: 0, runtime: true, doc: 'immunity left' } } });
      r.component('lifetime', { doc: 'Removes the entity after t seconds.', fields: { t: { type: 'number', default: 1 } } });
      r.trigger('hit', { doc: 'This entity took damage. args.amount is how much; other is the source.', owners: ['entity'] });
      r.trigger('die', { doc: 'hp reached 0. Call keepAlive to survive (boss phases, respawns).', owners: ['entity'] });
      r.action('damage', { doc: 'Hurt entities that have health.', params: {
        target: { type: 'string', default: 'other', doc: '"self", "other" or a tag' }, amount: { type: 'expr', default: 1 }, knockback: { type: 'expr', default: 0, doc: 'pixels/second away from the source' } },
        run(w, ctx, p, a) {
          for (const e of w.targets(a.target || 'other', ctx)) {
            const h = e.c.health; if (!h || e.dead || h.t > 0) continue;
            const amt = +p.amount || 0; if (amt <= 0) continue;
            h.hp -= amt; h.t = h.invuln;
            const src = ctx.self && ctx.self !== e ? ctx.self : ctx.other;
            if (p.knockback && src && src.c.pos && e.c.pos) {
              const dx = e.c.pos.x - src.c.pos.x, dy = e.c.pos.y - src.c.pos.y, d = Math.hypot(dx, dy) || 1;
              e.r.kb = { x: dx / d * p.knockback, y: dy / d * p.knockback, t: 0.15 };
            }
            w.fireOn(e, 'hit', { other: src, args: { amount: amt } });
            if (h.hp <= 0 && !e.dead) {
              e.r.keep = false; w.fireOn(e, 'die', { other: src });
              if (e.r.keep) e.r.keep = false; else w.destroy(e);
            }
          }
        } });
      r.action('heal', { doc: 'Restore hit points (never above max).', params: { target: { type: 'string', default: 'self' }, amount: { type: 'expr', default: 1 } },
        run(w, ctx, p, a) { for (const e of w.targets(a.target || 'self', ctx)) if (e.c.health) e.c.health.hp = Math.min(e.c.health.max, e.c.health.hp + (+p.amount || 0)); } });
      r.action('keepAlive', { doc: 'Inside a "die" rule: do not remove this entity.', params: {}, run(w, ctx) { if (ctx.self) ctx.self.r.keep = true; } });
      r.system('health', { order: 50, update(w, scene) { for (const e of scene.ents) if (!e.dead && e.c.health && e.c.health.t > 0) e.c.health.t = Math.max(0, e.c.health.t - DT); } });
      r.system('lifetime', { order: 60, update(w, scene) { for (const e of scene.ents) { const l = e.c.lifetime; if (e.dead || !l) continue; l.t -= DT; if (l.t <= 0) w.destroy(e); } } });
    },
  });

  DC2.defineExtension({
    name: 'ai',
    requires: ['space2d'],
    doc: 'Simple movement brains. There is no state machine feature: change ai.mode from rules ("set self.ai.mode").',
    install(r) {
      r.component('ai', { needs: ['pos', 'vel'], doc: 'Sets this entity\'s velocity each frame according to its mode.', fields: {
        mode: { type: 'enum', values: ['idle', 'patrol', 'chase', 'flee', 'wander'], default: 'idle' },
        speed: { type: 'number', default: 30 }, range: { type: 'number', default: 80, doc: 'how far chase/flee can see' },
        target: { type: 'string', default: 'player', doc: 'tag to chase or flee from' },
        dir: { type: 'number', default: -1, doc: 'patrol direction, -1 or 1' }, axis: { type: 'enum', values: ['x', 'y'], default: 'x' },
        t: { type: 'number', default: 0, runtime: true, doc: 'timer' } } });
      const DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      r.system('ai', { order: 20, update(w, scene) {
        for (const e of scene.ents) {
          const a = e.c.ai; if (e.dead || !a || !e.c.vel || !e.c.pos) continue;
          const v = e.c.vel, bump = e.r.bump || {}, keepY = !!e.c.gravity, vy0 = v.y;   // gravity owns vertical speed
          switch (a.mode) {
            case 'idle': v.x = 0; v.y = 0; break;
            case 'patrol':
              if (a.axis === 'x') { if (bump.x) a.dir = -a.dir; v.x = a.dir * a.speed; v.y = 0; }
              else { if (bump.y) a.dir = -a.dir; v.y = a.dir * a.speed; v.x = 0; }
              break;
            case 'chase': case 'flee': {
              const t = w.nearest(e, a.target, a.range);
              if (!t) { v.x = 0; v.y = 0; break; }
              const dx = t.c.pos.x - e.c.pos.x, dy = t.c.pos.y - e.c.pos.y, d = Math.hypot(dx, dy) || 1, k = (a.mode === 'flee' ? -1 : 1) * a.speed / d;
              v.x = dx * k; v.y = dy * k; break;
            }
            case 'wander': {
              a.t -= DT;
              if (a.t <= 0 || bump.x || bump.y) { a.t = 0.8 + w.rand() * 1.5; const d = DIRS[Math.floor(w.rand() * 5)]; v.x = d[0] * a.speed; v.y = d[1] * a.speed; }
              break;
            }
            default: break;
          }
          if (keepY) v.y = vy0;
          if (Math.abs(v.x) > Math.abs(v.y) && v.x) e.r.face = { x: Math.sign(v.x), y: 0 };
          else if (v.y) e.r.face = { x: 0, y: Math.sign(v.y) };
        }
      } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
