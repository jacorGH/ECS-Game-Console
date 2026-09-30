/* v2 extension: platformer. Gravity, side-view movement with a forgiving jump (coyote time, jump buffering,
   variable height), ground detection, and moving platforms that carry what stands on them.
   Stomping, question blocks, bricks and spikes are NOT here — they are ordinary rules (see the cave in the demo cart). */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT;

  DC2.defineExtension({
    name: 'platformer',
    requires: ['space2d'],
    doc: 'Gravity, side-view player control, and moving platforms.',
    install(r) {
      r.component('gravity', { needs: ['pos', 'vel'], doc: 'Pulls this entity down. Rules can read self.grounded.', fields: {
        g: { type: 'number', default: 700, doc: 'pixels/second squared' }, maxFall: { type: 'number', default: 420 } } });
      r.component('platformer', { needs: ['pos', 'vel', 'body', 'gravity'], doc: 'Left/right + jump control from a player\'s d-pad and A button.', fields: {
        speed: { type: 'number', default: 90 }, accel: { type: 'number', default: 900, doc: 'how quickly it reaches speed (and stops)' },
        jump: { type: 'number', default: 300, doc: 'take-off speed; height ≈ jump² / (2·g)' },
        coyote: { type: 'number', default: 0.08, doc: 'seconds after leaving a ledge you can still jump' },
        buffer: { type: 'number', default: 0.1, doc: 'seconds a too-early jump press is remembered' },
        player: { type: 'int', default: 0, min: 0, max: 3 } } });
      r.component('mover', { needs: ['pos'], doc: 'Moves back and forth between where it started and start + (dx, dy). If it has a solid body, riders standing on it are carried.', fields: {
        dx: { type: 'number', default: 0 }, dy: { type: 'number', default: 0 }, speed: { type: 'number', default: 30, doc: 'pixels/second along the path' } } });

      r.system('mover', { order: 5, update(w, scene) {
        for (const e of scene.ents) {
          const m = e.c.mover; if (e.dead || !m) continue;
          const len = Math.hypot(m.dx, m.dy) || 1, st = e.r.mv || (e.r.mv = { d: 0, dir: 1 });
          const before = st.d;
          st.d += st.dir * m.speed * DT;
          if (st.d >= len) { st.d = len; st.dir = -1; } else if (st.d <= 0) { st.d = 0; st.dir = 1; }
          const mx = m.dx * (st.d - before) / len, my = m.dy * (st.d - before) / len, p = e.c.pos, b = e.c.body;
          const riders = [];
          if (b && b.solid) {
            const top = p.y + b.oy - b.h / 2;
            for (const o of scene.ents) {
              if (o === e || o.dead || !o.r.ground || !o.c.body || !o.c.pos) continue;
              const ob = o.c.body, bottom = o.c.pos.y + ob.oy + ob.h / 2;
              if (Math.abs(bottom - top) <= 3 && Math.abs(o.c.pos.x + ob.ox - (p.x + b.ox)) < (ob.w + b.w) / 2) riders.push(o);
            }
          }
          p.x += mx; p.y += my;
          for (const o of riders) { o.c.pos.x += mx; o.c.pos.y += my; }
        }
      } });

      r.system('platformer', { order: 10, update(w, scene) {
        for (const e of scene.ents) {
          const c = e.c.platformer; if (e.dead || !c || !e.c.vel) continue;
          const v = e.c.vel, inp = w.input.players[c.player | 0], d = inp ? inp.down : {}, pr = inp ? inp.pressed : {};
          const dir = (d.right ? 1 : 0) - (d.left ? 1 : 0), target = dir * c.speed, a = c.accel * DT;
          v.x = v.x < target ? Math.min(target, v.x + a) : Math.max(target, v.x - a);
          if (dir) e.r.face = { x: dir, y: 0 }; else if (!e.r.face) e.r.face = { x: 1, y: 0 };
          e.r.buf = pr.a ? c.buffer : Math.max(0, (e.r.buf || 0) - DT);
          e.r.coy = e.r.ground ? c.coyote : Math.max(0, (e.r.coy || 0) - DT);
          if (e.r.buf > 0 && e.r.coy > 0) { v.y = -c.jump; e.r.buf = 0; e.r.coy = 0; e.r.jumping = true; e.r.ground = false; }
          if (e.r.jumping && !d.a && v.y < 0) { v.y *= 0.45; e.r.jumping = false; }
          if (v.y >= 0) e.r.jumping = false;
        }
      } });
      r.system('gravity', { order: 15, update(w, scene) {
        for (const e of scene.ents) { const g = e.c.gravity; if (e.dead || !g || !e.c.vel) continue; e.c.vel.y = Math.min(g.maxFall, e.c.vel.y + g.g * DT); }
      } });
      /* after movement: "grounded" means we were moving down and something stopped us */
      r.system('ground', { order: 35, update(w, scene) {
        for (const e of scene.ents) { if (e.dead || !e.c.gravity) continue; const b = e.r.bump; e.r.ground = !!(b && b.y && b.dy > 0); e.r.air = !e.r.ground; }
      } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
