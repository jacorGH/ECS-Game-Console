/* Tests for the Harvest-Moon slice: time, farm, economy.  node v2/test/farm.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
require('../ext/space.js'); require('../ext/farm.js');
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };

const base = () => ({
  format: 'DCART-2', meta: { title: 'Farm', width: 256, height: 224, start: 'field', player: 'farmer', extensions: ['space2d', 'topdown', 'sprite', 'time', 'farm', 'economy'] },
  vars: { gold: 10, daysSeen: 0, wateredCount: 0 }, palettes: { main: ['#000000', '#ffffff', '#77aa55', '#aa5522'] },
  sprites: {
    px: { w: 16, h: 16, palette: 'main', frames: ['1'.repeat(16) + Array(15).fill('/' + '1'.repeat(16)).join('')], anims: { idle: { f: [0], fps: 1 } } },
    carrot: { w: 16, h: 16, palette: 'main', frames: Array.from({ length: 4 }, (_, k) => Array(16).fill(String(2 + (k % 2)).repeat(16)).join('/')), anims: { idle: { f: [0], fps: 1 } } },
  },
  tilesets: { world: { sprite: 'px', tileSize: 16, tiles: {} } },
  maps: { field: { w: 10, h: 10, tileset: 'world', layers: [{ name: 'ground', rows: Array(10).fill('01'.repeat(10)) }], objects: [{ prefab: 'farmer', name: 'start', x: 40, y: 40 }, { prefab: 'sun', name: 'sun', x: 0, y: 0 }] } },
  prefabs: {
    sun: { c: { pos: {}, clock: { hour: 5.9, day: 1, length: 24 } } },   // length=24 real seconds/day => 60 frames = 1 in-game hour, 1440 frames = 1 day
    farmer: { tags: ['player'], c: { pos: {}, vel: {}, body: { w: 8, h: 8 }, topdown: { speed: 60 }, sprite: { id: 'px', auto: false }, inventory: { items: {}, cap: 5 } },
      rules: [{ on: 'button', button: 'x', then: [{ act: 'spawn', prefab: 'crop', at: 'self', ahead: 6 }] }] },
    crop: { c: { pos: {}, sprite: { id: 'carrot', auto: false }, growable: { stage: 0, stages: 4 } },
      rules: [
        { on: 'interact', button: 'a', if: 'self.growable.stage < self.growable.stages - 1', then: [{ act: 'set', path: 'self.growable.watered', to: true }] },
        { on: 'interact', button: 'a', if: 'self.growable.stage >= self.growable.stages - 1', then: [{ act: 'give', target: 'other', item: 'carrot', count: 1 }, { act: 'destroy' }] } ] },
    shopkeep: { c: { pos: {} }, rules: [{ on: 'interact', button: 'a', then: [{ act: 'buy', item: 'seed', count: 1, price: 3 }] }] },
    seller: { c: { pos: {} }, rules: [{ on: 'interact', button: 'a', then: [{ act: 'sell', item: 'carrot', count: 1, price: 4 }] }] },
  },
  scenes: { field: { map: 'field', rules: [{ on: 'newday', then: [{ act: 'add', path: 'daysSeen' }] }] } },
  rules: [],
});
const fresh = () => base();

section('1. clock');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  const sun = () => w.active().ents.find((e) => e.prefab === 'sun');
  idle(w, 1); ok(sun().c.clock.hour > 5.9, 'the clock advances every frame', sun().c.clock.hour);
  idle(w, 59);   // 60 frames total = 1 in-game hour
  ok(Math.floor(sun().c.clock.hour) === 6, 'and reaches the next hour on schedule', sun().c.clock.hour);
  idle(w, 1100);   // well past the 1086 frames needed to reach hour 24 from 5.9
  ok(sun().c.clock.day >= 2, 'a day boundary rolls hour back and day forward', { day: sun().c.clock.day, hour: sun().c.clock.hour });
  ok(sun().c.clock.hour < 24 && sun().c.clock.hour >= 0, 'hour stays in range after wrapping', sun().c.clock.hour);
}

section('2. newday event reaches scene rules');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  idle(w, 1086 + 1440 + 100);   // two day boundaries: 5.9->24 (1086 frames), then a full day (1440)
  ok(w.vars.daysSeen >= 2, 'a scene rule listening for "newday" fires each day', w.vars.daysSeen);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('3. growable: watering and stage advance');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  w.spawn('crop', { x: 60, y: 60 });
  const crop = () => w.active().ents.find((e) => e.prefab === 'crop');
  ok(crop().c.growable.stage === 0, 'starts at stage 0');
  idle(w, 1100);   // one day passes (1086 frames needed from hour 5.9), unwatered
  ok(crop().c.growable.stage === 0, 'an unwatered crop does not grow', crop().c.growable.stage);
  crop().c.growable.watered = true;
  idle(w, 1450);   // one more full day (1440 frames)
  ok(crop().c.growable.stage === 1 && crop().c.growable.watered === false, 'watering advances one stage, then resets', crop().c.growable);
  for (let i = 0; i < 3; i++) { crop().c.growable.watered = true; idle(w, 1450); }
  ok(crop().c.growable.stage === 3, 'reaches the final stage after enough watered days', crop().c.growable.stage);
  crop().c.growable.watered = true; idle(w, 1450);
  ok(crop().c.growable.stage === 3, 'and does not overshoot past the last stage', crop().c.growable.stage);
}

section('4. plant, water and harvest through real rules');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  const farmer = () => w.active().ents.find((e) => e.prefab === 'farmer');
  w.step([{ x: true }]); w.step([{}]);
  const crop = () => w.active().ents.find((e) => e.prefab === 'crop');
  ok(!!crop(), 'pressing X spawns a crop ahead of the player (planting)', w.active().ents.map((e) => e.prefab));
  for (let d = 0; d < 3; d++) { w.step([{ a: true }]); w.step([{}]); idle(w, d === 0 ? 1100 : 1450); }
  ok(crop() && crop().c.growable.stage === 3, 'watering it via interact each day grows it to maturity', crop() && crop().c.growable.stage);
  w.step([{ a: true }]); w.step([{}]);
  ok(!crop(), 'harvesting (interact when ripe) removes the crop');
  ok(farmer().c.inventory.items.carrot === 1, 'and gives the player one carrot', farmer().c.inventory.items);
  ok(w.errors.length === 0, 'no runtime errors through the whole cycle', w.errors);
}

section('5. inventory cap');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  const farmer = () => w.active().ents.find((e) => e.prefab === 'farmer');
  farmer().c.inventory.items.carrot = 4;   // cap is 5
  w.run([{ act: 'give', item: 'carrot', count: 10 }], { self: farmer(), other: null, args: {}, scene: w.active() });
  ok(farmer().c.inventory.items.carrot === 5, 'give stops at the inventory cap, not a partial-then-error', farmer().c.inventory.items.carrot);
  w.run([{ act: 'take', item: 'carrot', count: 99 }], { self: farmer(), other: null, args: {}, scene: w.active() });
  ok(farmer().c.inventory.items.carrot === 5, 'take does nothing if there is not enough', farmer().c.inventory.items.carrot);
  w.run([{ act: 'take', item: 'carrot', count: 5 }], { self: farmer(), other: null, args: {}, scene: w.active() });
  ok(farmer().c.inventory.items.carrot === undefined, 'taking exactly what exists removes the key entirely', farmer().c.inventory.items);
}

section('6. buy and sell');
{
  const { world: w } = DC2.boot(fresh(), { seed: 1 });
  const farmer = () => w.active().ents.find((e) => e.prefab === 'farmer');
  const shopkeep = w.spawn('shopkeep', { x: 44, y: 40 });   // seller is spawned later, out of range, so only one NPC fires per test
  w.step([{ a: true }]); w.step([{}]);
  ok(w.vars.gold === 7 && farmer().c.inventory.items.seed === 1, 'buying spends gold and gives the item', { gold: w.vars.gold, inv: farmer().c.inventory.items });
  w.destroy(shopkeep);
  farmer().c.inventory.items.carrot = 2;
  w.spawn('seller', { x: 36, y: 40 });
  const before = w.vars.gold;
  w.step([{ a: true }]); w.step([{}]);
  ok(w.vars.gold === before + 4 && farmer().c.inventory.items.carrot === 1, 'selling removes the item and pays gold', { gold: w.vars.gold, inv: farmer().c.inventory.items });
  w.vars.gold = 0;
  const ctxAt = { self: null, other: farmer(), args: {}, scene: w.active() };
  w.run([{ act: 'buy', item: 'seed', count: 1, price: 3 }], ctxAt);
  ok(w.vars.gold === 0 && farmer().c.inventory.items.seed === 1, 'buying with insufficient gold does nothing', { gold: w.vars.gold, seed: farmer().c.inventory.items.seed });
  w.run([{ act: 'sell', item: 'nonexistent', count: 1, price: 4 }], ctxAt);
  ok(w.vars.gold === 0, 'selling an item you do not have does nothing', w.vars.gold);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('7. validation catches farm-specific mistakes');
{
  const c = fresh(); c.prefabs.crop.c.growable.stages = 1;
  let rep = DC2.validate(c, DC2.registryFor(c).reg);
  ok(!rep.ok, 'stages below its minimum (2) is an error', rep.errors);
  const c2 = fresh(); delete c2.prefabs.shopkeep.rules[0].then[0].price;
  rep = DC2.validate(c2, DC2.registryFor(c2).reg);
  ok(!rep.ok, 'a "buy" action missing its required price is an error', rep.errors);
  const c3 = fresh(); c3.prefabs.shopkeep.rules[0].then[0].gold = 'notagoldvar';
  rep = DC2.validate(c3, DC2.registryFor(c3).reg);
  ok(!rep.ok, 'a "buy" pointing at an undeclared variable is an error', rep.errors);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
