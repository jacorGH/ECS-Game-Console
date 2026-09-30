/* v2 extensions for a Harvest-Moon-style slice: time, farm, economy.
   Planting is not a special action — spawn a growable prefab ahead of the player, same as any other spawn.
   There is no wilting/death: an unwatered crop simply waits. Selling/buying needs no "shop" trigger — use
   interact + dialogue choices whose actions call buy/sell (see ext/dialogue.js). */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT;

  DC2.defineExtension({
    name: 'time',
    doc: 'A day/night clock. Put the "clock" component on one entity (a marker in your first scene works well).',
    install(r) {
      r.component('clock', { doc: 'Advances in real time. Rules can read self.clock.hour (0-23) and self.clock.day.', fields: {
        hour: { type: 'number', default: 6, min: 0, max: 24, doc: 'starting hour, 0-24' },
        day: { type: 'int', default: 1, min: 1 },
        length: { type: 'number', default: 120, min: 1, doc: 'real seconds per in-game day' },
        paused: { type: 'bool', default: false, doc: 'stop the clock (while a dialogue or menu is open, say)' } } });
      r.trigger('hour', { doc: 'The in-game hour just changed. args.hour is the new hour (0-23).', owners: ['world', 'scene'] });
      r.trigger('newday', { doc: 'A new day just began. args.day is the new day number.', owners: ['world', 'scene'] });
      r.system('clock', { order: 1, update(w, scene) {
        for (const e of scene.ents) {
          const c = e.c.clock; if (e.dead || !c || c.paused) continue;
          const beforeHour = Math.floor(c.hour), beforeDay = c.day;
          c.hour += (24 / c.length) * DT;
          if (c.hour >= 24) { c.hour -= 24; c.day += 1; }
          const h = Math.floor(c.hour);
          if (h !== beforeHour) w.broadcast(scene, 'hour', { args: { hour: h } });
          if (c.day !== beforeDay) w.broadcast(scene, 'newday', { args: { day: c.day } });
        }
      } });
    },
  });

  DC2.defineExtension({
    name: 'farm',
    requires: ['time', 'sprite'],
    doc: 'Growable crops. A crop is an ordinary prefab with pos + sprite + growable; water it with a rule, harvest it with a rule.',
    install(r) {
      r.component('growable', { needs: ['pos'], doc: 'Grows one stage per day it was watered. self.growable.stage reaches stages-1 when ready; set sprite.anim (or a "grown" rule) to show it.', fields: {
        stage: { type: 'int', default: 0, min: 0, doc: 'current growth stage, 0 = just planted' },
        stages: { type: 'int', default: 4, min: 2, doc: 'stage number that counts as fully grown' },
        watered: { type: 'bool', default: false, doc: 'reset to false every day; water it again to keep it growing' } } });
      r.system('growable', { order: 45, update(w, scene) {
        const clk = scene.ents.find((e) => !e.dead && e.c.clock); if (!clk) return;
        const day = clk.c.clock.day;
        if (scene.rs.$farmDay == null) scene.rs.$farmDay = day;
        if (day === scene.rs.$farmDay) return;
        scene.rs.$farmDay = day;
        for (const e of scene.ents) {
          const g = e.c.growable; if (e.dead || !g) continue;
          if (g.watered && g.stage < g.stages - 1) g.stage++;
          g.watered = false;
        }
      } });
    },
  });

  DC2.defineExtension({
    name: 'economy',
    doc: 'A carried inventory of items, and buy/sell actions against a currency variable (default "gold").',
    install(r) {
      r.component('inventory', { doc: 'Items this entity is carrying.', fields: {
        items: { type: 'any', default: {}, doc: 'item id -> count' },
        cap: { type: 'int', default: 0, min: 0, doc: 'total items allowed, 0 = unlimited' } } });
      const total = (inv) => Object.values(inv.items).reduce((s, n) => s + (+n || 0), 0);
      r.action('give', { doc: 'Add an item to an inventory. Stops at "cap" if it has one.', params: {
        target: { type: 'string', default: 'self' }, item: { type: 'string', required: true }, count: { type: 'expr', default: 1 } },
        run(w, ctx, p, a) {
          for (const e of w.targets(a.target || 'self', ctx)) {
            const inv = e.c.inventory; if (!inv) continue;
            let n = Math.round(+p.count || 0); if (n <= 0) continue;
            if (inv.cap) n = Math.min(n, Math.max(0, inv.cap - total(inv)));
            if (n <= 0) continue;
            inv.items[p.item] = (inv.items[p.item] || 0) + n;
          }
        } });
      r.action('take', { doc: 'Remove an item from an inventory. Does nothing if it does not have enough.', params: {
        target: { type: 'string', default: 'self' }, item: { type: 'string', required: true }, count: { type: 'expr', default: 1 } },
        run(w, ctx, p, a) {
          for (const e of w.targets(a.target || 'self', ctx)) {
            const inv = e.c.inventory; if (!inv) continue;
            const n = Math.round(+p.count || 0); if (n <= 0 || (inv.items[p.item] || 0) < n) continue;
            inv.items[p.item] -= n; if (inv.items[p.item] <= 0) delete inv.items[p.item];
          }
        } });
      r.action('buy', { doc: 'Spend from a currency variable to receive an item. Typically used in a shopkeeper\'s "interact" rule, where the customer is "other".', params: {
        target: { type: 'string', default: 'other', doc: 'who receives the item — "other" (usually the customer), "self", or a tag' },
        item: { type: 'string', required: true }, count: { type: 'expr', default: 1 }, price: { type: 'expr', required: true, doc: 'cost per item' }, gold: { type: 'path', default: 'gold', doc: 'which variable is spent' } },
        run(w, ctx, p, a) {
          const e = w.targets(a.target || 'other', ctx)[0]; if (!e || !e.c.inventory) return;
          const n = Math.round(+p.count || 0); if (n <= 0) return;
          const cost = n * (+p.price || 0), have = +w.getPath(p.gold, ctx) || 0; if (have < cost) return;
          w.setPath(p.gold, have - cost, ctx);
          let g = n; if (e.c.inventory.cap) g = Math.min(g, Math.max(0, e.c.inventory.cap - total(e.c.inventory)));
          e.c.inventory.items[p.item] = (e.c.inventory.items[p.item] || 0) + g;
        } });
      r.action('sell', { doc: 'Give up an item to receive a currency variable. Typically used in a shopkeeper\'s "interact" rule, where the seller is "other".', params: {
        target: { type: 'string', default: 'other', doc: 'who gives up the item — "other" (usually the customer), "self", or a tag' },
        item: { type: 'string', required: true }, count: { type: 'expr', default: 1 }, price: { type: 'expr', required: true, doc: 'payment per item' }, gold: { type: 'path', default: 'gold', doc: 'which variable is paid into' } },
        run(w, ctx, p, a) {
          const e = w.targets(a.target || 'other', ctx)[0]; if (!e || !e.c.inventory) return;
          const n = Math.round(+p.count || 0); if (n <= 0 || (e.c.inventory.items[p.item] || 0) < n) return;
          e.c.inventory.items[p.item] -= n; if (e.c.inventory.items[p.item] <= 0) delete e.c.inventory.items[p.item];
          w.setPath(p.gold, (+w.getPath(p.gold, ctx) || 0) + n * (+p.price || 0), ctx);
        } });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
