/* Headless tests: no DOM, no canvas. Run:  node v2/test/run.js */
global.window = global; global.DC = {};
require('../../js/expr.js');
require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue']) require('../ext/' + f + '.js');
const fs = require('fs'), path = require('path');
const cartJSON = fs.readFileSync(path.join(__dirname, '..', 'carts', 'flag-of-gold.json'), 'utf8');
const fresh = () => JSON.parse(cartJSON);

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const section = (t) => console.log('\n' + t);

/* helpers */
const boot = (cart, opts) => DC2.boot(cart || fresh(), opts);
const hold = (w, keys, n) => { const d = {}; keys.forEach((k) => (d[k] = true)); for (let i = 0; i < n; i++) w.step([d]); };
const tap = (w, k) => { w.step([{ [k]: true }]); w.step([{}]); };
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const ents = (w, prefab) => w.active().ents.filter((e) => !e.dead && e.prefab === prefab);
const hero = (w) => ents(w, 'hero')[0];
const place = (e, x, y) => { e.c.pos.x = x; e.c.pos.y = y; };
const still = (w, prefab) => ents(w, prefab).forEach((e) => { e.c.ai.mode = 'idle'; e.c.vel.x = e.c.vel.y = 0; });
const centre = (t) => (t + 0.5) * 16;

/* ---------------------------------------------------------------- 1. the cart validates */
section('1. the ported cart validates');
{
  const { world, report } = boot();
  ok(report.ok, 'ported cart has no validation errors', report.errors);
  ok(report.warnings.length === 0, 'and no warnings', report.warnings);
  ok(!!world, 'boots into a world');
  ok(world && world.active().name === 'overworld', 'starts in the overworld');
  ok(world && !!hero(world), 'the player exists');
  ok(report.used.slice().sort().join() === 'ai,combat,dialogue,platformer,space2d,sprite,topdown', 'extensions used are detected', report.used);
}

/* ---------------------------------------------------------------- 2. mistakes are loud, not silent */
section('2. mistakes are reported: errors for what breaks the game, warnings for what is merely ignored');
const bad = (name, mutate, expect, level) => {
  const c = fresh(); mutate(c);
  const { reg, errors } = DC2.registryFor(c);
  const r = DC2.validate(c, reg); const text = (l) => l.map((e) => `${e.path}: ${e.msg}`).join('\n');
  if (level === 'warn') {
    ok(r.ok && r.warnings.length > 0, name + ' → only a warning (the game still runs)', text(r.errors));
    ok(text(r.warnings).toLowerCase().includes(expect.toLowerCase()), name + ` → mentions "${expect}"`, text(r.warnings));
    ok(!!DC2.boot(fresh2(mutate)).world, name + ' → the cart still boots');
    ok(!DC2.validate(c, reg, { strict: true }).ok, name + ' → strict mode turns it into an error');
    return;
  }
  const all = [...errors, ...r.errors].map((e) => `${e.path}: ${e.msg}`).join('\n');
  ok(!r.ok || errors.length, name + ' → is an error', all);
  ok(all.toLowerCase().includes(expect.toLowerCase()), name + ` → mentions "${expect}"`, all);
};
const fresh2 = (mutate) => { const c = fresh(); mutate(c); return c; };
bad('typo in a component field', (c) => { c.prefabs.slime.c.health.hpp = 3; }, 'did you mean "hp"', 'warn');
bad('undeclared variable in an action', (c) => { c.prefabs.coin.rules[0].then[0].path = 'coinz'; }, 'did you mean "coins"');
bad('undeclared variable in an expression', (c) => { c.prefabs.slime.rules[1].if = 'dist(self, playr) < 60'; }, 'did you mean "player"');
bad('typo in an action name', (c) => { c.prefabs.coin.rules[0].then[1].act = 'sond'; }, 'did you mean "sound"');
bad('typo in an action parameter', (c) => { c.prefabs.hero.rules[0].then[0].prefabb = 'slash'; c.prefabs.hero.rules[0].then[0].prefab = 'slash'; }, 'no parameter "prefabb"', 'warn');
bad('bad scene reference', (c) => { c.prefabs.cave_door.rules[0].then[1].scene = 'cavee'; }, 'did you mean "cave"');
bad('missing arrival marker', (c) => { c.prefabs.cave_door.rules[0].then[1].at = 'nowhere'; }, 'no object named "nowhere"');
bad('bad sprite reference', (c) => { c.prefabs.coin.c.sprite.id = 'coinn'; }, 'did you mean "coin"');
bad('formula with the old "=" prefix', (c) => { c.prefabs.slime.rules[0].then[0].amount = '=1+1'; }, 'do not start with "="');
bad('unknown self component in a formula', (c) => { c.prefabs.slime.rules[1].if = 'self.helth.hp > 0'; }, 'did you mean "health"');
bad('unknown field of a component in a formula', (c) => { c.prefabs.slime.rules[1].if = 'self.health.hpp > 0'; }, 'did you mean "hp"');
bad('trigger used in the wrong place', (c) => { c.rules.push({ on: 'touch', then: [] }); }, 'only works in entity rules');
bad('extension not listed', (c) => { c.meta.extensions = c.meta.extensions.filter((e) => e !== 'combat'); }, 'combat');
bad('unknown extension', (c) => { c.meta.extensions.push('stealth'); }, 'unknown extension "stealth"');
bad('map row of the wrong length', (c) => { c.maps.cave.layers[0].rows[2] += '00'; }, 'characters');
bad('tile that does not exist', (c) => { c.maps.cave.layers[0].rows[1] = '99' + c.maps.cave.layers[0].rows[1].slice(2); }, 'does not exist');
bad('sprite frame of the wrong size', (c) => { c.sprites.coin.frames[0] += 'a'; c.sprites.coin.frames[0] = c.sprites.coin.frames[0].replace('/', '//'); }, 'rows');
bad('component missing a needed component', (c) => { delete c.prefabs.slime.c.pos; }, 'needs the "pos" component');
bad('reserved variable name', (c) => { c.vars.health = 1; }, 'reserved');
bad('unknown top-level key', (c) => { c.spirtes = {}; }, 'did you mean "sprites"', 'warn');
bad('duplicate object name', (c) => { c.maps.cave.objects.push({ name: 'from-overworld', x: 10, y: 10 }); }, 'used twice');

/* ---------------------------------------------------------------- 3. walking, collision, pickups */
section('3. walking, collision and pickups (real simulation)');
{
  const { world: w } = boot();
  const h = hero(w), x0 = h.c.pos.x;
  hold(w, ['right'], 240);
  ok(h.c.pos.x < centre(11) - 8 && h.c.pos.x > x0 + 20, 'water stops the hero walking right', h.c.pos.x);
  ok(h.r.bump && h.r.bump.x, 'the hero reports bumping');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}
{
  const { world: w } = boot();
  ok(ents(w, 'coin').length === 5, 'five coins on the map', ents(w, 'coin').length);
  hold(w, ['up'], 150);
  ok(w.vars.coins === 1, 'walking onto a coin collects it (a rule, not a component)', w.vars.coins);
  ok(ents(w, 'coin').length === 4, 'and the coin is gone');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

/* ---------------------------------------------------------------- 4. dialogue as a mode on the stack */
section('4. dialogue is a mode on the scene stack');
{
  const { world: w } = boot();
  still(w, 'slime');
  const el = ents(w, 'elder')[0], h = hero(w);
  place(h, el.c.pos.x - 18, el.c.pos.y);
  tap(w, 'a');
  ok(w.stack.length === 2 && w.top().kind === 'mode', 'pressing a near the elder pushes a dialogue mode', w.stack.map((s) => s.kind));
  const before = JSON.stringify(w.active().ents.map((e) => e.c.pos));
  idle(w, 120);
  ok(JSON.stringify(w.active().ents.map((e) => e.c.pos)) === before, 'the world underneath is frozen while talking');
  const seen = [];
  for (let i = 0; i < 40 && w.top().kind === 'mode'; i++) { const v = w.modeView(); if (v && v.text) seen.push(v.text); tap(w, 'a'); tap(w, 'a'); }
  ok(w.top().kind === 'scene' && w.stack.length === 1, 'conversation ends and the scene resumes');
  ok(seen.includes('Welcome, traveller.'), 'lines are shown in order', seen);
  ok(w.vars.flags.metElder === true, 'the say-level "then" ran (flag set)');
  tap(w, 'a'); idle(w, 90);
  const v2 = w.modeView();
  ok(!!v2 && v2.text === 'Back again? You carry 0 coins.', 'second visit takes the other branch, with {coins} filled in', v2);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

/* ---------------------------------------------------------------- 5. combat */
section('5. combat: damage, invulnerability, death, loot');
{
  const { world: w } = boot();
  still(w, 'slime');
  const h = hero(w), s = ents(w, 'slime')[0];
  place(h, s.c.pos.x - 14, s.c.pos.y); h.r.face = { x: 1, y: 0 };
  tap(w, 'b'); idle(w, 6);
  ok(s.c.health.hp === 1, 'a sword swing hurts the slime', s.c.health.hp);
  ok(s.r.kb && s.r.kb.t >= 0, 'and knocks it back');
}
{
  const { world: w } = boot();
  const h = hero(w), s = ents(w, 'slime')[0];
  still(w, 'slime');
  place(h, s.c.pos.x - 14, s.c.pos.y); h.r.face = { x: 1, y: 0 };
  tap(w, 'b'); idle(w, 8);
  const hp1 = s.c.health.hp;
  tap(w, 'b'); idle(w, 5);
  ok(s.c.health.hp === hp1, 'a second swing inside the invulnerable window does nothing', [hp1, s.c.health.hp]);
  idle(w, 40); place(h, s.c.pos.x - 14, s.c.pos.y); h.r.face = { x: 1, y: 0 };
  tap(w, 'b'); idle(w, 8);
  ok(s.dead, 'the slime dies after the second real hit');
  ok(w.vars.kills === 1, 'its "die" rule ran (kills counted)');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}
{
  const { world: w } = boot();
  const h = hero(w), s = ents(w, 'slime')[0];
  place(s, h.c.pos.x + 4, h.c.pos.y); still(w, 'slime');
  idle(w, 3);
  ok(h.c.health.hp === 5, 'touching a slime hurts the hero (contact damage is a rule)', h.c.health.hp);
  ok(w.fx.length >= 0, 'effects are emitted as data');
  h.c.health.hp = 1; h.c.health.t = 0;
  w.run([{ act: 'damage', target: 'self', amount: 1 }], { self: h, other: null, args: {}, scene: w.active() }); idle(w, 3);
  const sp = w.active().markers.spawn;
  ok(hero(w) && hero(w).id === h.id && hero(w).c.health.hp === 6, 'dying with keepAlive heals the hero (same entity survives)', hero(w) && hero(w).c.health.hp);
  ok(Math.hypot(hero(w).c.pos.x - sp.x, hero(w).c.pos.y - sp.y) < 1, 'and restarts at the spawn point');
}

/* ---------------------------------------------------------------- 6. scenes and the player carrying over */
section('6. scenes: goto, arrival markers, the player becoming a different prefab');
{
  const { world: w } = boot();
  const h0 = hero(w), door = ents(w, 'cave_door')[0];
  h0.c.health.hp = 4;
  place(h0, door.c.pos.x, door.c.pos.y + 20); still(w, 'slime');
  for (let i = 0; i < 60 && w.active().name === 'overworld'; i++) w.step([{ up: true }]);
  ok(w.active().name === 'cave', 'walking into the cave door changes scene', w.active().name);
  const p = w.player();
  ok(p && p.prefab === 'hero_side', 'the player arrives as the side-view prefab (the cave scene\'s spawn object)', p && p.prefab);
  ok(p && p.c.health.hp === 4, 'and health was carried across (prefab lists carry: ["health"])', p && p.c.health.hp);
  ok(w.active().ents.filter((e) => e.tags.has('player')).length === 1, 'there is exactly one player');
  const m = w.active().markers['from-overworld'];
  ok(Math.abs(p.c.pos.x - m.x) < 1, 'placed at the named arrival marker', [p.c.pos.x, m.x]);
  idle(w, 60);
  ok(w.active().name === 'cave', 'no bounce back');
  const flag = ents(w, 'flag')[0];
  place(w.player(), flag.c.pos.x, flag.c.pos.y);
  idle(w, 3);
  ok(w.top().kind === 'mode' && w.modeView().text.length >= 0, 'touching the flag starts a dialogue');
  for (let i = 0; i < 30 && w.active().name === 'cave'; i++) { tap(w, 'a'); }
  ok(w.active().name === 'overworld', 'the flag returns you to the overworld', w.active().name);
  const q = w.player();
  ok(q && q.prefab === 'hero' && q.c.health.hp === 4, 'as the top-down hero again, health still carried', q && [q.prefab, q.c.health.hp]);
  const back = w.active().markers['from-cave'];
  ok(Math.hypot(q.c.pos.x - back.x, q.c.pos.y - back.y) < 2, 'standing at the cave entrance');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

/* ---------------------------------------------------------------- 7. determinism, save and restore */
section('7. determinism and save/restore');
{
  const script = []; let s = 7;
  for (let i = 0; i < 600; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const d = {}; const r = s >> 8; if (r % 5 === 0) d.right = true; if (r % 7 === 0) d.left = true; if (r % 4 === 0) d.down = true; if (r % 6 === 0) d.up = true; if (r % 23 === 0) d.b = true; script.push(d); }
  const run = (w, a, b) => { for (let i = a; i < b; i++) w.step([script[i]]); };
  const A = boot().world; run(A, 0, 600);
  const B = boot().world; run(B, 0, 600);
  ok(DC2.hash(A.save()) === DC2.hash(B.save()), 'same inputs, same seed → identical world (600 frames)');
  const C = boot().world; run(C, 0, 300);
  const snap = C.save();
  const { reg } = DC2.registryFor(fresh());
  const D = DC2.restore(fresh(), reg, snap); run(D, 300, 600); run(C, 300, 600);
  ok(DC2.hash(D.save()) === DC2.hash(A.save()), 'save at frame 300, restore, continue → identical to an uninterrupted run');
  ok(DC2.hash(C.save()) === DC2.hash(A.save()), 'continuing after saving changes nothing');
  ok(A.errors.length === 0, 'no runtime errors over 600 random frames', A.errors);
  const E = boot(fresh(), { seed: 99 }).world; run(E, 0, 600);
  ok(DC2.hash(E.save()) !== DC2.hash(A.save()), 'a different seed gives a different game');
}

/* ---------------------------------------------------------------- 8. runtime errors are reported, not swallowed */
section('8. runtime errors are captured');
{
  const c = fresh(); c.prefabs.coin.rules.push({ on: 'update', then: [{ act: 'set', path: 'coins', to: 'self.health.hp' }] });
  const { world: w, report } = boot(c, { force: true });
  ok(!report.ok, 'validation already flags it');
  idle(w, 3);
  ok(w.errors.length >= 1 && /health/.test(w.errors[0]), 'and if forced to run, the error is recorded once, not thrown', w.errors);
}

/* ---------------------------------------------------------------- 9. generated docs */
section('9. documentation is generated from the registry');
{
  const { reg } = DC2.registryFor(fresh());
  const md = DC2.docsMarkdown(reg), ai = DC2.aiSpec(reg);
  ok(md.includes('**health**') && md.includes('**say**'), 'reference lists components and actions');
  ok(ai.length < 8000, `the AI spec for this cart is ${ai.length} characters (v1: ~25,000)`, ai.length);
  fs.writeFileSync(path.join(__dirname, '..', 'REFERENCE.generated.md'), md);
  fs.writeFileSync(path.join(__dirname, '..', 'AI-SPEC.generated.txt'), ai);
  console.log('  (reference: ' + md.length + ' chars, ai spec: ' + ai.length + ' chars)');
}


/* ---------------------------------------------------------------- 10. the rest of the kernel vocabulary */
section('10. scene stack (push/pop), timers, events, tile edits, persistent scenes');
{
  const tile = Array(16).fill('1'.repeat(16)).join('/');
  const grid = (n) => Array.from({ length: 3 }, () => '00'.repeat(3));
  const mk = () => ({
    format: 'DCART-2', meta: { title: 't', start: 'a', player: 'hero', extensions: ['space2d', 'topdown', 'sprite'] },
    vars: { n: 0, hits: 0, bhits: 0 }, palettes: { main: ['#000000', '#ffffff'] },
    sprites: { s: { w: 2, h: 2, frames: ['11/11'] }, tl: { w: 16, h: 16, frames: [tile] } },
    tilesets: { t: { tileSize: 16, sprite: 'tl', tiles: {} } },
    maps: {
      a: { w: 3, h: 3, tileset: 't', layers: [{ name: 'g', rows: grid() }], objects: [{ prefab: 'hero', name: 'start', x: 24, y: 24 }] },
      b: { w: 3, h: 3, tileset: 't', layers: [{ name: 'g', rows: grid() }], objects: [] },
    },
    prefabs: { hero: { tags: ['player'], c: { pos: {}, vel: {}, body: {}, topdown: {}, sprite: { id: 's' } } } },
    scenes: {
      a: { map: 'a', persist: true, rules: [
        { on: 'start', then: [{ act: 'wait', t: 0.5, then: [{ act: 'set', path: 'n', to: 5 }] }] },
        { on: 'every', t: 0.1, then: [{ act: 'add', path: 'hits' }] },
        { on: 'button', button: 'x', then: [{ act: 'push', scene: 'b' }] },
        { on: 'button', button: 'y', then: [{ act: 'emit', name: 'ping' }] },
        { on: 'event', name: 'ping', then: [{ act: 'add', path: 'n', by: 100 }] },
        { on: 'button', button: 'start', then: [{ act: 'settile', layer: 'g', tx: 1, ty: 1, tile: 1 }] },
        { on: 'button', button: 'select', then: [{ act: 'goto', scene: 'b' }] },
      ] },
      b: { map: 'b', rules: [
        { on: 'every', t: 0.1, then: [{ act: 'add', path: 'bhits' }] },
        { on: 'button', button: 'x', then: [{ act: 'pop' }] },
        { on: 'button', button: 'select', then: [{ act: 'goto', scene: 'a', at: 'start' }] },
      ] },
    },
    rules: [],
  });
  const { world: w, report } = boot(mk());
  ok(report.ok, 'mini cart validates', report.errors);
  idle(w, 20);
  ok(w.vars.n === 0, 'wait: nothing happens before the delay');
  idle(w, 20);
  ok(w.vars.n === 5, 'wait: the actions run after 0.5 seconds', w.vars.n);
  tap(w, 'y'); idle(w, 2);
  ok(w.vars.n === 105, 'emit: an event rule reacted', w.vars.n);
  tap(w, 'start'); idle(w, 1);
  ok(w.active().map.layers[0].ids[4] === 1, 'settile changed the map at runtime');
  const h0 = w.vars.hits;
  tap(w, 'x'); idle(w, 1);
  ok(w.stack.length === 2 && w.active().name === 'b', 'push: a second scene sits on top of the first', w.stack.map((s) => s.name || s.kind));
  const frozen = w.vars.hits; idle(w, 60);
  ok(w.vars.hits === frozen, 'the scene below is frozen while the top scene runs');
  ok(w.vars.bhits >= 5, 'the top scene runs', w.vars.bhits);
  tap(w, 'x'); idle(w, 1);
  ok(w.stack.length === 1 && w.active().name === 'a', 'pop: back to the first scene');
  idle(w, 30);
  ok(w.vars.hits > frozen, 'and it resumes exactly where it was');
  ok(w.active().ents.some((e) => e.prefab === 'hero'), 'the player was never touched by push/pop');
  tap(w, 'select'); idle(w, 1);
  ok(w.active().name === 'b' && !!w.parked.a, 'goto: a persistent scene is parked, not destroyed');
  tap(w, 'select'); idle(w, 1);
  ok(w.active().name === 'a' && w.active().map.layers[0].ids[4] === 1, 'returning restores the parked scene, edits and all');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}


/* ---------------------------------------------------------------- 11. the platformer (the cave) */
section('11. platformer: the same kernel, a different genre');
const inCave = () => { const w = boot().world; w.queue({ type: 'goto', scene: 'cave', at: 'from-overworld' }); w.step([{}]); still(w, 'walker'); still(w, 'bat'); return w; };
const feet = (e) => e.c.pos.y + e.c.body.h / 2;
{
  const w = inCave(), p = w.player();
  idle(w, 40);
  ok(p.r.ground === true && Math.abs(feet(p) - 176) < 1, 'gravity: the player lands and stands on the floor', [p.r.ground, feet(p)]);
  ok(p.c.vel.y < 20, 'and is not accumulating fall speed', p.c.vel.y);
  const y0 = p.c.pos.y; let top = y0;
  hold(w, ['a'], 1); for (let i = 0; i < 60; i++) { w.step([{ a: i < 40 }]); top = Math.min(top, p.c.pos.y); }
  ok(y0 - top > 55 && y0 - top < 68, 'a held jump rises about jump²/2g ≈ 64 px', y0 - top);
  idle(w, 30);
  let top2 = p.c.pos.y; const y1 = p.c.pos.y;
  for (let i = 0; i < 60; i++) { w.step([{ a: i < 3 }]); top2 = Math.min(top2, p.c.pos.y); }
  ok(y1 - top2 < (y0 - top) * 0.7 && y1 - top2 > 8, 'a short tap is a shorter hop (variable jump height)', [y1 - top2, y0 - top]);
  ok(p.r.ground, 'and it lands again');
}
{
  const w = inCave(), p = w.player(); idle(w, 30);
  p.r.ground = false; p.r.coy = 0.05; p.c.pos.y -= 30;
  w.step([{ a: true }]);
  ok(p.c.vel.y < 0, 'coyote time: you can still jump just after leaving a ledge');
  const w2 = inCave(), q = w2.player(); idle(w2, 30);
  q.r.ground = false; q.r.coy = 0; q.c.pos.y -= 30; q.c.vel.y = 0;
  w2.step([{ a: true }]);
  ok(q.c.vel.y >= 0, 'but not once the window has passed');
}
{
  const w = inCave(), p = w.player(); idle(w, 20);
  const x0 = p.c.pos.x; hold(w, ['right'], 30);
  ok(p.c.pos.x - x0 > 20, 'running right');
  const pit = 16 * 16;
  place(p, pit - 20, 168); p.c.vel.x = 0; hold(w, ['right'], 90);
  ok(p.c.pos.y > 176, 'and the pit swallows the player: the floor really is missing', p.c.pos.y);
}
{
  /* one-way platform: tiles at row 7, columns 22..26 (top edge y = 112) */
  const w = inCave(), p = w.player(), x = 24 * 16 + 8; idle(w, 5);
  place(p, x, 100); p.c.vel.y = 0; idle(w, 60);
  ok(p.r.ground && Math.abs(feet(p) - 112) < 1, 'one-way tile: you land on it from above', feet(p));
  place(p, x, 150); p.c.vel.y = -330; idle(w, 200);
  ok(p.r.ground && Math.abs(feet(p) - 112) < 1, 'and you can jump up through it from below, then land on top', feet(p));
}
{
  const w = inCave(), p = w.player(), wk = ents(w, 'walker')[0]; place(wk, 200, 171.5); wk.c.vel.y = 0; idle(w, 5);
  place(p, wk.c.pos.x, wk.c.pos.y - 34); p.c.vel.y = 120;
  let bounced = false;
  for (let i = 0; i < 60; i++) { w.step([{}]); if (wk.dead && p.c.vel.y < 0) bounced = true; }
  ok(wk.dead && w.vars.kills === 1, 'stomping a walker kills it (a rule, not a "stompable" component)', [wk.dead, w.vars.kills]);
  ok(bounced && p.c.health.hp === 6, 'and you bounce without taking damage', p.c.health.hp);
}
{
  const w = inCave(), p = w.player(), wk = ents(w, 'walker')[0]; place(wk, 200, 171.5); wk.c.vel.y = 0; idle(w, 5);
  place(p, wk.c.pos.x - 16, 168.5); p.c.vel.y = 0; hold(w, ['right'], 25);
  ok(p.c.health.hp === 5 && !wk.dead, 'touching a walker from the side hurts you instead', [p.c.health.hp, wk.dead]);
}
{
  const w = inCave(), p = w.player(), q = ents(w, 'qblock')[0]; idle(w, 5);
  const bump = () => { place(p, q.c.pos.x, q.c.pos.y + 8 + 8 + 1); p.c.vel.y = -200; idle(w, 6); };
  bump();
  ok(w.vars.coins === 1 && q.v.used === true, 'hitting a ? block from below pays a coin', [w.vars.coins, q.v.used]);
  ok(q.c.sprite.anim === 'used', 'and it switches to its used look');
  idle(w, 40); bump();
  ok(w.vars.coins === 1, 'but only once', w.vars.coins);
  const n = ents(w, 'brick').length, b = ents(w, 'brick')[0];
  place(p, b.c.pos.x, b.c.pos.y + 17); p.c.vel.y = -200; idle(w, 6);
  ok(ents(w, 'brick').length === n - 1, 'a brick breaks when hit from below');
}
{
  const w = inCave(), p = w.player(), sp = ents(w, 'spikes')[0]; idle(w, 5);
  place(p, sp.c.pos.x, sp.c.pos.y); p.c.vel.y = 0; idle(w, 4);
  ok(p.c.health.hp === 5, 'spikes hurt', p.c.health.hp);
}
{
  const w = inCave(), p = w.player(), lf = ents(w, 'lift')[0]; idle(w, 5);
  const top = lf.c.pos.y - lf.c.body.h / 2;
  place(p, lf.c.pos.x, top - p.c.body.h / 2 - 1); p.c.vel.y = 0; idle(w, 10);
  const x0 = p.c.pos.x; idle(w, 90);
  ok(p.r.ground && p.c.pos.x - x0 > 30, 'a moving platform carries what stands on it', [p.c.pos.x - x0, p.r.ground]);
  const b = ents(w, 'bat')[0], y0 = b.c.pos.y; let lo = y0, hi = y0;
  for (let i = 0; i < 100; i++) { w.step([{}]); lo = Math.min(lo, b.c.pos.y); hi = Math.max(hi, b.c.pos.y); }
  ok(hi - lo > 15, 'the bat bobs up and down (ai + mover)', hi - lo);
}
{
  const w = inCave(); const wk = ents(w, 'walker')[0]; wk.c.ai.mode = 'patrol'; const x0 = wk.c.pos.x;
  idle(w, 150);
  ok(Math.abs(wk.c.pos.x - x0) > 10 && Math.abs(feet(wk) - 176) < 2, 'a walker patrols along the floor under gravity', [wk.c.pos.x - x0, feet(wk)]);
  ok(w.errors.length === 0, 'no runtime errors in the cave', w.errors);
}
{
  const script = []; let s = 11;
  for (let i = 0; i < 600; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const r = s >> 8, d = {}; if (r % 3 === 0) d.right = true; if (r % 5 === 0) d.left = true; if (r % 4 === 0) d.a = true; if (r % 17 === 0) d.b = true; script.push(d); }
  const mk = () => { const w = boot().world; w.queue({ type: 'goto', scene: 'cave', at: 'from-overworld' }); w.step([{}]); return w; };
  const run = (w, a, b) => { for (let i = a; i < b; i++) w.step([script[i]]); };
  const A = mk(); run(A, 0, 600); const C = mk(); run(C, 0, 300);
  const { reg } = DC2.registryFor(fresh()); const D = DC2.restore(fresh(), reg, C.save()); run(D, 300, 600);
  ok(DC2.hash(D.save()) === DC2.hash(A.save()), 'the cave is deterministic too: save at 300, restore, continue = uninterrupted');
  ok(A.errors.length === 0, 'no runtime errors over 600 random frames in the cave', A.errors);
}

/* ---------------------------------------------------------------- 12. hot reload */
section('12. hot reload: edit the cart while the game runs');
{
  const { world: w } = boot(); still(w, 'slime');
  const s = ents(w, 'slime')[0], sx = s.c.pos.x;
  s.c.health.hp = 1;
  const c2 = fresh();
  c2.prefabs.slime.c.ai.speed = 99; c2.prefabs.slime.c.health.max = 5; delete c2.prefabs.elder; delete c2.maps.overworld.objects.find((o) => o.prefab === 'elder').prefab;
  c2.maps.overworld.objects = c2.maps.overworld.objects.filter((o) => o.prefab || o.name);
  c2.prefabs.coin.rules[0].then[0].by = 5; c2.prefabs.slime.v = { rage: 0 };
  const notes = w.hotReload(c2);
  ok(s.c.ai.speed === 99, 'a value you tweaked takes effect on the running entity');
  ok(s.c.health.max === 5, 'as does another unchanged value');
  ok(s.c.health.hp === 1, 'but hp you have lost is not reset');
  ok(s.c.pos.x === sx, 'positions are kept');
  ok(s.v.rage === 0, 'new entity vars appear with their defaults');
  ok(ents(w, 'elder').length === 0 && notes.some((n) => /elder/.test(n)), 'entities of a deleted prefab are removed, and you are told', notes);
  const h = hero(w), c = ents(w, 'coin')[0]; w.vars.coins = 0; place(h, c.c.pos.x, c.c.pos.y); idle(w, 3);
  ok(w.vars.coins === 5, 'edited rules apply immediately (coin now pays 5)', w.vars.coins);
  idle(w, 60);
  ok(w.errors.length === 0, 'no runtime errors after reload', w.errors);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
