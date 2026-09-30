/* v2 extension: stealth. A guard's "vision" component watches for a target inside a cone, blocked by solid tiles.
   Building and losing suspicion are both gradual (alertTime / loseTime), not instant, so a rule reacting to
   "spotted" is a real detection, not a single frame's flicker. What happens on "spotted" (chase, alarm, battle) is
   left to ordinary rules — this only answers "can the guard see the target right now, and for how long". */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT;
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  /* Walks the segment in half-tile steps; blocked as soon as one step lands in a solid tile. Cheap and good enough
     for a top-down guard's sightline — it is not a precise physics raycast. */
  function lineOfSight(w, scene, ax, ay, bx, by) {
    const m = scene.map; if (!m) return true;
    const ts = m.ts, dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy) || 1, steps = Math.max(1, Math.ceil(dist / (ts / 2)));
    for (let i = 1; i < steps; i++) {
      const x = ax + (dx * i) / steps, y = ay + (dy * i) / steps;
      if (DC2.tileSolid(w, scene, Math.floor(x / ts), Math.floor(y / ts))) return false;
    }
    return true;
  }

  const facing = (e, v) => (v.dir ? DIRS[v.dir] : (e.r.face || { x: 0, y: 1 }));
  /* How far a ray from the guard gets before a wall stops it (for drawing the cone, not for detection). */
  function reach(w, scene, x, y, ang, range) {
    const m = scene.map; if (!m) return range;
    const step = m.ts / 4, dx = Math.cos(ang), dy = Math.sin(ang);
    for (let d = step; d < range; d += step) if (DC2.tileSolid(w, scene, Math.floor((x + dx * d) / m.ts), Math.floor((y + dy * d) / m.ts))) return d;
    return range;
  }
  /* Screen overlay: yellow while unaware (getting more orange as suspicion builds), red once alert. */
  DC2.drawHooks = DC2.drawHooks || [];
  DC2.drawHooks.push((g, w, scene, cx, cy) => {
    if (!w.reg.components.vision) return;
    for (const e of scene.ents) {
      const v = e.c.vision; if (e.dead || !v || !v.show || !e.c.pos) continue;
      const f = facing(e, v), mid = Math.atan2(f.y, f.x), half = (v.fov / 2) * Math.PI / 180, x = e.c.pos.x, y = e.c.pos.y, n = Math.max(6, Math.round(v.fov / 6));
      const sus = v.state === 'alert' ? 1 : v.alertTime > 0 ? Math.min(1, v.t / v.alertTime) : 0;
      g.fillStyle = v.state === 'alert' ? 'rgba(255,70,70,0.30)' : `rgba(255,${Math.round(220 - 110 * sus)},60,${0.22 + 0.12 * sus})`;
      g.beginPath(); g.moveTo(x - cx, y - cy);
      for (let i = 0; i <= n; i++) { const a = mid - half + (2 * half * i) / n, d = reach(w, scene, x, y, a, v.range); g.lineTo(x + Math.cos(a) * d - cx, y + Math.sin(a) * d - cy); }
      g.closePath(); g.fill();
    }
  });

  DC2.defineExtension({
    name: 'stealth',
    requires: ['space2d'],
    doc: 'Vision cones and detection. Combine with ai (chase) or dialogue (an alarm) to decide what happens when spotted.',
    install(r) {
      r.component('vision', { needs: ['pos'], doc: 'Watches for "target" inside a cone, blocked by walls. self.vision.state is "unaware" or "alert".', fields: {
        range: { type: 'number', default: 120, min: 1, doc: 'how far it can see, in pixels' },
        fov: { type: 'number', default: 90, min: 1, max: 360, doc: 'width of the cone, in degrees' },
        target: { type: 'string', default: 'player', doc: 'tag to look for' },
        dir: { type: 'enum', values: ['up', 'down', 'left', 'right'], optional: true, doc: 'fixed facing for a guard that never moves; leave unset to face the way it last moved' },
        alertTime: { type: 'number', default: 0.5, min: 0, doc: 'seconds it must be seen, continuously, to go from unaware to alert' },
        loseTime: { type: 'number', default: 1.5, min: 0, doc: 'seconds out of sight before it gives up and goes back to unaware' },
        state: { type: 'enum', values: ['unaware', 'alert'], default: 'unaware', runtime: true },
        sees: { type: 'bool', default: false, runtime: true, doc: 'seeing the target this very frame' },
        show: { type: 'bool', default: true, doc: 'draw the vision cone on screen so the player can see where it is looking' },
        t: { type: 'number', default: 0, runtime: true } } });
      r.trigger('spotted', { doc: 'Just went from unaware to alert. other is what it saw.', owners: ['entity'] });
      r.trigger('lost', { doc: 'Lost track and just went back to unaware.', owners: ['entity'] });
      r.system('vision', { order: 25, update(w, scene) {
        for (const e of scene.ents) {
          const v = e.c.vision; if (e.dead || !v || !e.c.pos) continue;
          const target = w.nearest(e, v.target, v.range);
          let sees = false;
          if (target && target.c.pos) {
            const face = facing(e, v);
            const dx = target.c.pos.x - e.c.pos.x, dy = target.c.pos.y - e.c.pos.y;
            let diff = Math.abs(Math.atan2(dy, dx) - Math.atan2(face.y, face.x));
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff <= ((v.fov / 2) * Math.PI) / 180) sees = lineOfSight(w, scene, e.c.pos.x, e.c.pos.y, target.c.pos.x, target.c.pos.y);
          }
          v.sees = sees;
          if (v.state === 'unaware') {
            if (sees) { v.t += DT; if (v.t >= v.alertTime) { v.state = 'alert'; v.t = 0; w.fireOn(e, 'spotted', { other: target }); } }
            else v.t = 0;
          } else {
            if (sees) v.t = 0;
            else { v.t += DT; if (v.t >= v.loseTime) { v.state = 'unaware'; v.t = 0; w.fireOn(e, 'lost', { other: target }); } }
          }
        }
      } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
