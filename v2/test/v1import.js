/* Tests for opening v1 (DCART-1) carts in v2.  node v2/test/v1import.js */
global.window = global; global.DC = {};
require('../../js/core.js'); require('../../js/demo.js'); require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/v1import.js');
const S = DC2.studio, V = S.v1;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const press = (w, b, n) => { w.step([{ [b]: true }]); idle(w, n || 2); };
const CARTS = ['DEMO_CART', 'BLANK_CART', 'KART_CART', 'KEEP_CART', 'STACK_CART'];

section('1. telling v1 from v2');
ok(CARTS.every((k) => V.isV1(DC[k])), 'every v1 sample cart is recognised as v1');
ok(!V.isV1(require('../carts/flag-of-gold.json')), 'a v2 cart is not');
ok(!V.isV1(JSON.parse(S.toDcart(require('../carts/flag-of-gold.json')))), 'a .dcart wrapper is not');
ok(!V.isV1({ hello: 1 }) && !V.isV1(null) && !V.isV1([]), 'random JSON is not');

section('2. every sample converts cleanly and plays');
for (const k of CARTS) {
  const { cart, notes } = V.convert(DC[k]), r = S.check(cart);
  ok(r.errors.length === 0, k + ': no errors after converting', r.errors.slice(0, 5));
  ok(notes.every((n) => n.where && n.what), k + ': every report line says where and what');
  const { world: w } = DC2.boot(cart, { seed: 3 });
  idle(w, 20);
  for (let i = 0; i < 4 && !w.player(); i++) { press(w, 'start', 30); press(w, 'a', 30); }
  const p = w.player();
  ok(!!p, k + ': gets past its title screen to a player');
  if (p) { const x0 = p.c.pos.x; for (let i = 0; i < 40; i++) w.step([{ right: true }]); ok(p.c.pos.x > x0 + 20, k + ': the player walks', p.c.pos.x - x0); }
  idle(w, 240);
  ok(w.errors.length === 0, k + ': runs 5 seconds with no runtime errors', w.errors);
  ok(DC2.studio.fromDcart(S.toDcart(cart)) && true, k + ': saves and reopens as a .dcart');
}

section('3. art, sound and music carry over exactly');
{
  const v1 = DC.DEMO_CART, { cart } = V.convert(v1), sc = v1.sprites.hero.scale || 1;
  const want = v1.sprites.hero.frames[0].flatMap((row) => { const d = row.split('').map((c) => c.repeat(sc)).join(''); return Array(sc).fill(d); }).join('/');
  ok(cart.sprites.hero.frames[0] === want, 'hero frame 0 is the same pixels, at the same on-screen size');
  ok(cart.sprites.hero.frames.length === v1.sprites.hero.frames.length, 'every frame is kept');
  ok(JSON.stringify(cart.sounds) === JSON.stringify(v1.sounds), 'sounds are identical');
  ok(JSON.stringify(cart.music) === JSON.stringify(v1.music), 'music is identical');
  ok(JSON.stringify(cart.palettes.main) === JSON.stringify(DC.PALETTE), 'the 32-colour palette is the same');
  ok(cart.sprites.hero.anims && cart.sprites.hero.anims.walk, 'animations move onto the sprite', cart.sprites.hero.anims);
}

section('4. the demo actually plays like the demo');
{
  const { cart } = V.convert(DC.DEMO_CART), { world: w } = DC2.boot(cart, { seed: 3 });
  press(w, 'start', 10);
  ok(w.active().name === 'overworld', 'Start leaves the title screen for the overworld', w.active().name);
  const p = w.player(), ents = () => w.active().ents.filter((e) => !e.dead);
  ok(p.prefab === 'hero_top' && p.c.topdown && !p.c.gravity, 'the overworld hero walks top-down and does not fall');
  ok(ents().filter((e) => e.prefab === 'coin').every((c) => !c.c.gravity), 'overworld coins stay put (no gravity)');
  const coin = ents().find((e) => e.prefab === 'coin'), c0 = w.vars.coins;
  p.c.pos.x = coin.c.pos.x; p.c.pos.y = coin.c.pos.y; idle(w, 3);
  ok(w.vars.coins === c0 + 1 && coin.dead, 'touching a coin collects it', { coins: w.vars.coins });
  const elder = ents().find((e) => e.prefab === 'elder');
  p.c.pos.x = elder.c.pos.x - 16; p.c.pos.y = elder.c.pos.y; p.r.face = { x: 1, y: 0 }; press(w, 'a', 5);
  ok(w.modeView() && w.modeView().kind === 'dialogue' && w.modeView().name === 'Elder', 'A next to the elder starts a conversation', w.modeView());
  for (let i = 0; i < 20 && w.modeView() && w.modeView().kind === 'dialogue'; i++) press(w, 'a', 25);
  const hp = p.c.health.hp, slime = ents().find((e) => e.prefab === 'slime');
  p.c.pos.x = slime.c.pos.x; p.c.pos.y = slime.c.pos.y; idle(w, 3);
  ok(p.c.health.hp < hp && w.vars.hp === p.c.health.hp, 'a slime hurts you, and the "hp" variable the HUD reads follows along', { hp: p.c.health.hp, var: w.vars.hp });
  const door = ents().find((e) => e.prefab === 'cave_door');
  p.c.pos.x = door.c.pos.x; p.c.pos.y = door.c.pos.y; idle(w, 5);
  ok(w.active().name === 'cave', 'the cave door takes you to the cave', w.active().name);
  const q = w.player();
  ok(q && q.prefab === 'hero_side' && q.c.platformer && q.c.gravity, 'in the cave you are the side-view hero, with gravity');
  idle(w, 90);
  ok(q.r.ground, 'who lands on the ground');
  const y0 = q.c.pos.y; press(w, 'a', 8);
  ok(q.c.pos.y < y0 - 8, 'and A jumps', y0 - q.c.pos.y);
  const lift = w.active().ents.find((e) => e.prefab === 'lift');
  ok(lift && lift.c.mover && !lift.c.gravity, 'the lift moves on its path and does not fall');
  const spikes = w.active().ents.find((e) => /^tile_/.test(e.prefab) && (cart.prefabs[e.prefab].rules || []).some((r) => r.then.some((a) => a.act === 'damage')));
  ok(!!spikes && !spikes.c.gravity, 'hurting tiles (spikes) became things that stay in place');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('4b. v1 "follow" attacks stay with the player');
{
  const { cart } = V.convert(DC.DEMO_CART);
  const spawn = cart.prefabs.hero_top.rules.flatMap((r) => r.then).find((a) => a.act === 'spawn' && a.prefab === 'slash');
  ok(spawn && spawn.attach === true && cart.prefabs.slash.c.sprite.turn === true, 'the sword swing is attached and turns with the player', spawn);
}

section('5. what did not come across is reported');
{
  const kart = V.convert(DC.KART_CART).notes.map((n) => n.what).join(' | ');
  ok(/Mode 7/.test(kart), 'Mode 7 is reported', kart);
  const keep = V.convert(DC.KEEP_CART).notes.map((n) => n.what).join(' | ');
  ok(/state machines/.test(keep), 'state machines are reported', keep);
  const demo = V.convert(DC.DEMO_CART).notes;
  ok(demo.length > 0 && demo.length < 30, 'the demo report is short enough to read', demo.length);
  const blank = V.convert(DC.BLANK_CART).notes;
  ok(blank.length === 0, 'a simple game converts with nothing to report', blank);
}

section('6. v1 leniency: undeclared variables and flags get declared');
{
  const c = S.clone(DC.BLANK_CART);
  c.prefabs[Object.keys(c.prefabs)[0]].rules = [{ on: 'button', button: 'x', do: [{ set: 'flags.sawIt', value: true }, { add: 'score', value: 5 }] }];
  c.vars = { flags: {} };
  const { cart, notes } = V.convert(c);
  ok(S.check(cart).errors.length === 0, 'converts with no errors', S.check(cart).errors);
  ok(cart.vars.score === 0 && cart.vars.flags.sawIt === false, 'score and flags.sawIt are declared', cart.vars);
  ok(notes.some((n) => /score/.test(n.what)), 'and the report says so');
}

section('7. real carts made with ChatGPT for v1');
{
  const fs = require('fs'), F = (f) => fs.readFileSync(__dirname + '/fixtures/' + f, 'utf8');
  for (const f of ['shadow-protocol-v1.json', 'farmtest-v1.json', 'talkcart-v1.json']) {
    const { cart, notes } = V.convert(JSON.parse(F(f)));
    ok(S.check(cart).errors.length === 0, f + ': opens with no errors', S.check(cart).errors.slice(0, 4));
    const { world: w } = DC2.boot(cart, { seed: 3 }); idle(w, 20);
    for (let i = 0; i < 4 && !w.player(); i++) { press(w, 'start', 30); press(w, 'a', 30); }
    ok(!!w.player(), f + ': reaches a level with a player');
    idle(w, 300); ok(w.errors.length === 0, f + ': plays 5 seconds without runtime errors', w.errors);
    ok(notes.every((n) => n.what.length < 260), f + ': report lines stay readable');
  }
  const r = DC.scrubJSON(F('shadow-protocol-v1-raw-ai-reply.txt'));
  ok(r.ok && V.isV1(r.data), 'a raw AI reply (curly quotes, extra text) is repaired and recognised');
  const { cart, notes } = V.convert(r.data);
  ok(S.check(cart).errors.length === 0, 'and converts with no errors');
  ok(notes.some((n) => /no player is placed/.test(n.what)), 'its real mistake (no player in the level) is pointed out', notes.map((n) => n.what).filter((t) => /player/.test(t)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
