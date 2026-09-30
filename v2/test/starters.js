/* Playthrough tests for the studio's starter projects (especially Farm and Stealth).  node v2/test/starters.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/starters.js');
const S = DC2.studio, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const press = (w, b, hold) => { w.step([{ [b]: true }]); idle(w, hold || 2); };
const boot = (k) => DC2.boot(S.clone(ST[k].cart), { seed: 7 }).world;
const TS = 16, tile = (t) => (t + 0.5) * TS;

section('1. every starter is clean and boots');
for (const k of Object.keys(ST)) {
  const r = S.check(ST[k].cart);
  ok(r.errors.length === 0 && r.warnings.length === 0, k + ': no errors or warnings', r);
  const w = boot(k); idle(w, 60);
  ok(w.errors.length === 0 && !!w.player(), k + ': runs a second with a player and no runtime errors', w.errors);
}
ok(ST.farm && ST.stealth, 'Farm and Stealth appear in the starter list');

section('2. Farm: plant, water, grow, harvest, sell');
{
  const w = boot('farm'), p = w.player(), inv = () => p.c.inventory.items;
  const crops = () => w.active().ents.filter((e) => !e.dead && e.c.growable);
  const n0 = crops().length;
  p.c.pos.x = tile(4); p.c.pos.y = tile(12); p.r.face = { x: 1, y: 0 };
  press(w, 'x', 20);
  ok(crops().length === n0 + 1 && inv().seed === 2, 'X plants a seed in front of the farmer', { n: crops().length, inv: inv() });
  const planted = crops().find((c) => Math.abs(c.c.pos.y - tile(12)) < 2);
  ok(planted && planted.c.growable.stage === 0 && planted.c.sprite.anim === 'seed', 'a new crop starts as a seed', planted && planted.c.sprite);
  press(w, 'a', 5);
  ok(planted.c.growable.watered === true, 'A next to it waters it');
  const clock = w.first('clock'); clock.c.clock.hour = 23.9; idle(w, 30);
  ok(planted.c.growable.stage === 1 && planted.c.sprite.anim === 'sprout', 'overnight a watered crop grows (and shows it)', { g: planted.c.growable, a: planted.c.sprite.anim });
  ok(/^DAY 2/.test(w.hudItems()[0].text), 'the HUD shows the new day', w.hudItems()[0].text);
  const ripe = crops().find((c) => c.c.growable.stage === 3);
  p.c.pos.x = ripe.c.pos.x - 14; p.c.pos.y = ripe.c.pos.y; p.r.face = { x: 1, y: 0 };
  press(w, 'a', 5);
  ok(inv().carrot === 1 && ripe.dead, 'A on the ripe crop harvests a carrot', inv());
  const shop = w.active().ents.find((e) => e.tags.has('shopkeeper'));
  p.c.pos.x = shop.c.pos.x - 18; p.c.pos.y = shop.c.pos.y; p.r.face = { x: 1, y: 0 };
  press(w, 'a', 5);
  let v = w.modeView();
  for (let i = 0; i < 6 && v && !v.choices.length; i++) { press(w, 'a', 3); v = w.modeView(); }
  ok(v && v.choices.join('|') === 'Buy seed|Sell carrot|Bye', 'the shopkeeper offers buy and sell', v);
  press(w, 'down', 3); press(w, 'a', 5);
  for (let i = 0; i < 6 && w.modeView() && w.modeView().kind === 'dialogue'; i++) press(w, 'a', 3);
  ok(inv().carrot === undefined && w.vars.gold === 15, 'selling the carrot pays 5 gold', { inv: inv(), gold: w.vars.gold });
  ok(w.hudItems()[2].text === 'SEEDS 2  CARROTS 0', 'the HUD shows 0 (not blank) once the carrots are gone', w.hudItems()[2].text);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('3. Stealth: cones, cover, getting caught, winning');
{
  const w = boot('stealth'), p = w.player();
  const guards = () => w.active().ents.filter((e) => !e.dead && e.c.vision);
  ok(guards().length === 4, 'four guards', guards().length);
  idle(w, 20);
  ok(guards().every((g) => g.c.vision.state === 'unaware'), 'nobody sees you at the start', guards().map((g) => g.c.vision.state));
  /* the watcher by the first gap: hugging the right-hand wall is safe, the middle is not */
  const watcher = guards().find((g) => g.c.vision.dir === 'down'), sentry = guards().find((g) => g.c.vision.dir === 'up');
  for (const g of guards()) if (g !== watcher && g !== sentry) g.dead = true;   // isolate the two stationary guards
  let seen = false;
  for (let y = tile(16); y >= tile(5); y -= 1.2) { p.c.pos.x = tile(11); p.c.pos.y = y; p.c.vel.x = p.c.vel.y = 0; w.step([{}]); if (watcher.c.vision.sees) seen = true; }
  ok(!seen, 'walking up along the right-hand wall, the watcher never sees you');
  p.c.pos.x = tile(8.5); p.c.pos.y = tile(12); idle(w, 40);
  ok(watcher.c.vision.state === 'alert', 'standing right in front of it gets you spotted', watcher.c.vision);
  ok(watcher.c.ai.mode === 'chase', 'and it gives chase', watcher.c.ai.mode);
  seen = false;
  for (let y = tile(15); y >= tile(2); y -= 1.2) { p.c.pos.x = tile(19); p.c.pos.y = y; p.c.vel.x = p.c.vel.y = 0; w.step([{}]); if (sentry.c.vision.sees) seen = true; }
  ok(!seen, 'going round the sentry by the far wall keeps you hidden');
  /* getting caught */
  const w2 = boot('stealth'), p2 = w2.player(), g2 = w2.active().ents.filter((e) => e.c.vision)[0];
  p2.c.pos.x = g2.c.pos.x; p2.c.pos.y = g2.c.pos.y + 4; idle(w2, 5);
  for (let i = 0; i < 10 && w2.modeView() && w2.modeView().kind === 'dialogue'; i++) press(w2, 'a', 3);
  idle(w2, 5);
  ok(w2.vars.caught === 1, 'touching a guard gets you caught', w2.vars.caught);
  ok(Math.abs(w2.player().c.pos.x - tile(2)) < 2 && Math.abs(w2.player().c.pos.y - tile(15)) < 2, 'and you start again at the entrance', w2.player().c.pos);
  /* winning */
  const w3 = boot('stealth'), goal = w3.active().ents.find((e) => e.tags.has('goal'));
  w3.player().c.pos.x = goal.c.pos.x; w3.player().c.pos.y = goal.c.pos.y + 2; idle(w3, 90);
  const v = w3.modeView();
  ok(v && v.kind === 'dialogue' && /MISSION COMPLETE/.test(v.text), 'reaching the flag completes the mission', v);
  ok(w.errors.length + w2.errors.length + w3.errors.length === 0, 'no runtime errors', [w.errors, w2.errors, w3.errors]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
