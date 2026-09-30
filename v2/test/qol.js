/* Picker suggestions, turning pictures into things/tiles, effect + setsprite actions.  node v2/test/qol.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/starters.js');
const S = DC2.studio, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const reg = () => S.allReg();

section('1. the ＋ picker offers what fits the field');
{
  const cart = S.clone(ST.topdown.cart), pl = cart.meta.player, ids = (items, g) => items.filter((i) => i.group === g).map((i) => i.id);
  let it = S.pickItems(cart, reg(), { prefabId: pl, kind: 'expr', target: S.pathSpec(cart, reg(), pl, 'self.sprite.id') });
  ok(it[0].group === 'Pictures' && ids(it, 'Pictures').includes("'hero'") && it.find((i) => i.group === 'Pictures').thumb, 'setting self.sprite.id: pictures come first, with thumbnails', it.slice(0, 3));
  it = S.pickItems(cart, reg(), { prefabId: pl, kind: 'expr', target: S.pathSpec(cart, reg(), pl, 'self.sprite.anim') });
  ok(ids(it, 'Animations').includes("'walk_down'") || ids(it, 'Animations').includes("'walk'"), 'setting self.sprite.anim: its own animations', ids(it, 'Animations'));
  const enemy = Object.keys(cart.prefabs).find((k) => cart.prefabs[k].c.ai);
  it = S.pickItems(cart, reg(), { prefabId: enemy, kind: 'expr', target: S.pathSpec(cart, reg(), enemy, 'self.ai.mode') });
  ok(['patrol', 'chase', 'flee'].every((m) => ids(it, 'Choices').includes(`'${m}'`)), 'setting self.ai.mode: every mode it can be', ids(it, 'Choices'));
  it = S.pickItems(cart, reg(), { prefabId: pl, kind: 'expr', target: S.pathSpec(cart, reg(), pl, 'self.sprite.flip') });
  ok(ids(it, 'Choices').join() === 'true,false', 'a switch: true / false');
  it = S.pickItems(cart, reg(), { prefabId: pl, kind: 'expr' });
  ok(ids(it, 'This thing').includes('self.health.hp') && ids(it, 'This thing').includes('self.ontile.water') && ids(it, 'This thing').includes('self.facing.x'), 'this thing: its parts, facing, and tile tags', ids(it, 'This thing').slice(0, 30));
  ok(ids(it, 'The other thing').includes('other.pos.x') && ids(it, 'The other thing').length > 8, 'the other thing: parts any thing has');
  ok(ids(it, 'Formulas').includes('dist(self, player)') && ids(it, 'Tags (as words)').length > 0, 'formulas and tags');
  const other = Object.keys(cart.prefabs).find((k) => k !== pl);
  it = S.pickItems(cart, reg(), { prefabId: other, kind: 'path' });
  ok(ids(it, 'The player').includes('player.health.hp') && !it.some((i) => i.group === 'Formulas'), 'a variable field: things you can change (the player too), no formulas');
  ok(S.pathSpec(cart, reg(), pl, 'coins') && S.pathSpec(cart, reg(), pl, 'coins').type === 'number', 'a game variable\'s kind is known');
}

section('2. a picture becomes a thing, a thing gets a new picture, a picture becomes a tile');
{
  const doc = new S.Doc(S.clone(ST.topdown.cart)), SP = S.sprite;
  const sid = SP.create(doc, 'barrel', 16, 16);
  doc.set(['sprites', sid, 'frames', 0], SP.encode(Array.from({ length: 256 }, (_, i) => (i % 16 >= 4 && i % 16 < 12 && Math.floor(i / 16) >= 6 ? 4 : -1)), 16, 16));
  const pid = S.thingFromSprite(doc, sid, 'barrel');
  const p = doc.cart.prefabs[pid];
  ok(p && p.c.sprite.id === sid && p.c.pos && p.c.body, 'Make a thing: prefab with the picture, a position and a body', p);
  ok(p.c.body.w <= 8 && p.c.body.h <= 10, 'the body fits the drawn pixels, not the empty space', p.c.body);
  ok(p.c.sprite.oy < 0 || p.c.sprite.oy > 0, 'and the picture is shifted so the body sits on the drawing', p.c.sprite);
  ok(S.check(doc.cart).errors.length === 0, 'valid', S.check(doc.cart).errors);
  const u = doc.undos.length; doc.undo(); ok(!doc.cart.prefabs[pid], 'one undo step'); doc.redo();
  const enemy = Object.keys(doc.cart.prefabs).find((k) => doc.cart.prefabs[k].c.ai);
  S.setThingSprite(doc, enemy, sid);
  ok(doc.cart.prefabs[enemy].c.sprite.id === sid && S.check(doc.cart).errors.length === 0, 'Give to a thing: swaps its picture', doc.cart.prefabs[enemy].c.sprite);
  const bare = 'bare'; doc.set(['prefabs', bare], { tags: [], c: {} }); S.setThingSprite(doc, bare, sid);
  ok(doc.cart.prefabs[bare].c.sprite && doc.cart.prefabs[bare].c.pos, 'a thing with no picture gets the Sprite part');
  const n = S.tileFromSprite(doc, sid, 'world');
  ok(doc.cart.tilesets.world.tiles[n].sprite === sid && DC2.tileIds(doc.cart, 'world').includes(n), 'Make it a tile: joins the palette', n);
  ok(S.tileFromSprite(doc, sid, 'world') === n, 'doing it twice does not duplicate');
  const big = SP.create(doc, 'big', 24, 24); let msg = ''; try { S.tileFromSprite(doc, big, 'world'); } catch (e) { msg = e.message; }
  ok(/16×16/.test(msg), 'a picture of the wrong size says what size tiles are', msg);
  ok(S.sprite.bounds({ w: 4, h: 4, frames: ['..../..../..../....'] }).w === 4, 'an empty picture gets the whole box');
}

section('3. effect and change-picture actions');
{
  const cart = S.clone(ST.topdown.cart), pl = cart.meta.player;
  cart.sprites.puff = { w: 8, h: 8, palette: 'main', frames: [Array(8).fill('l'.repeat(8)).join('/'), Array(8).fill('m'.repeat(8)).join('/'), Array(8).fill('n'.repeat(8)).join('/')], anims: { go: { f: [0, 1, 2], fps: 10 } } };
  cart.prefabs[pl].rules = (cart.prefabs[pl].rules || []).concat([
    { on: 'button', button: 'x', then: [{ act: 'effect', sprite: 'puff', dy: -8 }] },
    { on: 'button', button: 'y', then: [{ act: 'setsprite', sprite: 'puff', anim: 'go' }] }]);
  ok(S.check(cart).errors.length === 0, 'rules using them are valid', S.check(cart).errors);
  const { world: w } = DC2.boot(cart, { seed: 1 }), p = w.player(), fx = () => w.active().ents.filter((e) => !e.dead && e.tags.has('effect'));
  w.step([{ x: true }]); idle(w, 1);
  const e = fx()[0];
  ok(e && e.c.sprite.id === 'puff' && e.c.sprite.anim === 'go' && Math.abs(e.c.pos.y - (p.c.pos.y - 8)) < 0.01, 'effect appears at the thing, offset, playing its animation', e && e.c);
  idle(w, 12);
  ok(fx().length === 1, 'it plays for its whole animation (3 frames at 10 fps)');
  idle(w, 12);
  ok(fx().length === 0, 'then disappears by itself');
  w.step([{ y: true }]); idle(w, 1);
  ok(p.c.sprite.id === 'puff' && p.c.sprite.anim === 'go', 'change picture swaps the sprite and animation while playing', p.c.sprite);
  w.step([{ x: true }]); idle(w, 1);
  w.hotReload(S.clone(cart)); idle(w, 2);
  ok(w.errors.length === 0, 'effects survive a hot reload quietly (no errors)', w.errors);
  const bad = S.clone(cart); bad.prefabs[pl].rules.push({ on: 'button', button: 'a', then: [{ act: 'effect', sprite: 'nope' }] });
  ok(S.check(bad).errors.some((x) => /nope/.test(x.msg)), 'an effect with a missing picture is caught');
}

section('4. the sword swing sticks to the player and turns with them');
{
  const fog = S.clone(require('../carts/flag-of-gold.json'));
  const { world: w } = DC2.boot(fog, { seed: 1 }), p = w.player(), sl = () => w.active().ents.find((e) => !e.dead && e.prefab === 'slash');
  idle(w, 5); p.r.face = { x: 1, y: 0 };
  w.step([{ b: true }]);
  let s = sl();
  ok(s && s.r.attach && Math.abs(s.c.pos.x - (p.c.pos.x + 12)) < 0.01, 'B swings: the slash appears 12px ahead', s && [s.c.pos, p.c.pos]);
  for (let i = 0; i < 5; i++) w.step([{ right: true }]);
  s = sl();
  ok(s && Math.abs(s.c.pos.x - (p.c.pos.x + 12)) < 0.01 && Math.abs(s.c.pos.y - p.c.pos.y) < 0.01, 'walking while it swings: it stays with the player (not left behind)', s && [s.c.pos, p.c.pos]);
  w.step([{ down: true }]); s = sl();
  ok(s && s.r.face.y === 1 && Math.abs(s.c.pos.y - (p.c.pos.y + 12)) < 0.01, 'turning: it swings round to the new direction and faces that way', s && [s.c.pos, s.r.face, p.r.face]);
  ok(fog.prefabs.slash.c.sprite.turn === true, 'the slash picture turns with facing (drawn rotated)');
  idle(w, 15); ok(!sl(), 'and it still disappears after its short life');
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
  for (const k of ['topdown', 'platformer']) { const c = ST[k].cart, pl = c.prefabs[c.meta.player]; ok(JSON.stringify(pl.rules).includes('"attach":true'), k + ' starter: its sword is attached'); }
}

section('5. older projects get the fix when opened');
{
  const old = S.clone(require('../carts/flag-of-gold.json'));
  for (const h of ['hero', 'hero_side']) for (const r of old.prefabs[h].rules) for (const a of r.then) delete a.attach;
  delete old.prefabs.slash.c.sprite.turn;
  old.prefabs.arrow = { c: { pos: {}, vel: {}, body: { w: 4, h: 4 }, lifetime: { t: 0.3 } } };
  old.prefabs.hero.rules.push({ on: 'button', button: 'x', then: [{ act: 'spawn', prefab: 'arrow', ahead: 8, vx: 'self.facing.x * 200' }] });
  ok(S.needsUpgrade(old), 'an old sword is spotted');
  S.upgrade(old);
  ok(old.prefabs.hero.rules[0].then[0].attach === true && old.prefabs.hero_side.rules[0].then[0].attach === true && old.prefabs.slash.c.sprite.turn === true, 'its swings become attached and turning');
  ok(old.prefabs.hero.rules.slice(-1)[0].then[0].attach === undefined, 'but a flying arrow is left alone');
  ok(!S.needsUpgrade(old) && S.check(old).errors.length === 0, 'done once, valid', S.check(old).errors);
}

section('6. animation lists');
{
  const cart = S.clone(ST.topdown.cart), pl = cart.meta.player, hero = cart.prefabs[pl].c.sprite.id;
  const names = (g) => g.flatMap((x) => x.names);
  ok(names(S.animChoices(cart, pl, { act: 'anim', target: 'self' })).join() === Object.keys(cart.sprites[hero].anims).join(), '"Play animation" on self: this thing\'s animations');
  const enemy = Object.keys(cart.prefabs).find((k) => cart.prefabs[k].c.ai);
  ok(S.animChoices(cart, enemy, { act: 'anim', target: 'player' })[0].sprite === hero, 'on the player: the player\'s animations');
  const g = S.animChoices(cart, pl, { act: 'anim', target: 'other' });
  ok(g.length > 1 && g.every((x) => x.names.length), 'on "other": every picture\'s animations, grouped by picture', g.map((x) => x.sprite));
  ok(names(S.animChoices(cart, pl, { act: 'effect', sprite: 'coin' })).join() === Object.keys(cart.sprites.coin.anims).join(), 'an effect: the chosen picture\'s animations');
  ok(S.animChoices(cart, pl, { act: 'anim', target: 'enemy' }).every((x) => Object.values(cart.prefabs).some((p) => (p.tags || []).includes('enemy') && p.c.sprite && p.c.sprite.id === x.sprite)), 'on a tag: the pictures of things with that tag');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
