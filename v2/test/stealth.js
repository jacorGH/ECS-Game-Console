/* Tests for the stealth extension (vision cones, detection).  node v2/test/stealth.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
require('../ext/space.js'); require('../ext/stealth.js');
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };

function wallRows() {
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz', enc = (id) => B36[Math.floor(id / 36)] + B36[id % 36];
  const w = 20, h = 20, ids = new Array(w * h).fill(0);
  for (let x = 0; x < w; x++) ids[10 * w + x] = 1;   // a solid wall straight across row 10 (y = 160..176)
  const rows = []; for (let y = 0; y < h; y++) { let s = ''; for (let x = 0; x < w; x++) s += enc(ids[y * w + x]); rows.push(s); } return rows;
}
const cart = (wall) => ({
  format: 'DCART-2', meta: { title: 'Stealth', width: 256, height: 224, start: 'room', player: 'hero', extensions: ['space2d', 'topdown', 'sprite', 'stealth'] },
  vars: { timesSpotted: 0, timesLost: 0 }, palettes: { main: ['#000000', '#ffffff'] },
  sprites: { px: { w: 16, h: 16, palette: 'main', frames: ['1'.repeat(16) + Array(15).fill('/' + '1'.repeat(16)).join('')], anims: { idle: { f: [0], fps: 1 } } } },
  tilesets: { world: { sprite: 'px', tileSize: 16, tiles: {} } },
  maps: { room: { w: 20, h: 20, tileset: 'world', layers: [{ name: 'walls', collide: true, rows: wall ? wallRows() : Array(20).fill('00'.repeat(20)) }], objects: [
    { prefab: 'hero', name: 'start', x: 40, y: 160 }, { prefab: 'guard', name: 'guard', x: 40, y: 40 } ] } },
  prefabs: {
    hero: { tags: ['player'], c: { pos: {}, vel: {}, body: { w: 8, h: 8 }, topdown: { speed: 60 }, sprite: { id: 'px', auto: false } } },
    guard: { c: { pos: {}, vision: { range: 100, fov: 90, dir: 'down', alertTime: 0.3, loseTime: 0.5 } },
      rules: [{ on: 'spotted', then: [{ act: 'add', path: 'timesSpotted' }] }, { on: 'lost', then: [{ act: 'add', path: 'timesLost' }] }] },
  },
  scenes: { room: { map: 'room' } }, rules: [],
});
const fresh = (wall) => cart(wall);
const guard = (w) => w.active().ents.find((e) => e.prefab === 'guard');
const hero = (w) => w.active().ents.find((e) => e.prefab === 'hero');

section('1. cone geometry: range, field of view, facing');
{
  const { world: w } = DC2.boot(fresh(false), { seed: 1 });
  hero(w).c.pos.x = 40; hero(w).c.pos.y = 130;   // 90px straight below the guard, facing down: dead ahead, in range
  idle(w, 5);
  ok(guard(w).c.vision.sees === true, 'in range, dead ahead, is seen', guard(w).c.vision);
  hero(w).c.pos.y = 250; idle(w, 5);
  ok(guard(w).c.vision.sees === false, 'out of range is not seen');
  hero(w).c.pos.x = 40; hero(w).c.pos.y = 130;
  guard(w).c.vision.dir = 'up'; idle(w, 5);
  ok(guard(w).c.vision.sees === false, 'facing away, not seen even in range');
  guard(w).c.vision.dir = 'down';
  hero(w).c.pos.x = 138; hero(w).c.pos.y = 42;   // almost due right, well outside a 90° cone facing down
  idle(w, 5);
  ok(guard(w).c.vision.sees === false, 'outside the field of view, not seen');
  hero(w).c.pos.x = 55; hero(w).c.pos.y = 90;   // within 90° of straight down
  idle(w, 5);
  ok(guard(w).c.vision.sees === true, 'inside the field of view is seen', { fov: guard(w).c.vision, gx: guard(w).c.pos });
}

section('2. walls block sight');
{
  const { world: w } = DC2.boot(fresh(true), { seed: 1 });
  hero(w).c.pos.x = 40; hero(w).c.pos.y = 130; idle(w, 5);   // guard(y=40) and hero(y=130) straddle the wall at y=160..176? adjust below
  ok(guard(w).c.vision.sees === true, 'sanity: nothing blocking yet, seen', guard(w).c.vision);
  hero(w).c.pos.y = 172; idle(w, 5);   // now below the wall row (160-176), guard above it
  ok(guard(w).c.vision.sees === false, 'a solid wall between them blocks the line of sight', guard(w).c.vision);
  hero(w).c.pos.y = 90; idle(w, 5);   // above the wall, same side as the guard now
  ok(guard(w).c.vision.sees === true, 'once nothing is in the way, it sees again', guard(w).c.vision);
}

section('3. alert builds and decays gradually, not instantly');
{
  const { world: w } = DC2.boot(fresh(false), { seed: 1 });
  hero(w).c.pos.x = 40; hero(w).c.pos.y = 130;
  idle(w, 5);
  ok(guard(w).c.vision.state === 'unaware', 'seen for only a moment is not yet alert', guard(w).c.vision.state);
  idle(w, 25);   // alertTime 0.3s = 18 frames; 5+25=30 frames ≈ 0.5s total, comfortably past it
  ok(guard(w).c.vision.state === 'alert', 'seen continuously past alertTime becomes alert', guard(w).c.vision);
  ok(w.vars.timesSpotted === 1, 'and "spotted" fires exactly once', w.vars.timesSpotted);
  hero(w).c.pos.y = 250; idle(w, 10);   // out of range, but within loseTime (0.5s = 30 frames)
  ok(guard(w).c.vision.state === 'alert', 'briefly out of sight does not immediately drop the alert', guard(w).c.vision);
  idle(w, 40);
  ok(guard(w).c.vision.state === 'unaware', 'but staying out of sight past loseTime does', guard(w).c.vision);
  ok(w.vars.timesLost === 1, 'and "lost" fires exactly once', w.vars.timesLost);
}

section('4. a full sneak: hide behind the wall, guard never alerts');
{
  const { world: w } = DC2.boot(fresh(true), { seed: 1 });
  hero(w).c.pos.x = 40; hero(w).c.pos.y = 172;   // below the wall the whole time (guard is above it, at y=40)
  idle(w, 180);
  ok(guard(w).c.vision.state === 'unaware' && w.vars.timesSpotted === 0, 'staying behind cover the whole time, never spotted', { state: guard(w).c.vision.state, spotted: w.vars.timesSpotted });
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('5. validation');
{
  const c = fresh(false); c.prefabs.guard.c.vision.fov = 400;
  const rep = DC2.validate(c, DC2.registryFor(c).reg);
  ok(!rep.ok, 'a field of view above 360° is an error', rep.errors);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
