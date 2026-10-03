/* Hot reload: change the game while it runs and keep everything the game is doing.  node v2/test/hot.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/starters.js');
const S = DC2.studio, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const fresh = () => { const cart = S.clone(ST['flag-of-gold'].cart), { world } = DC2.boot(cart, { seed: 1 }); return { cart, w: world }; };
const edit = (cart, fn) => { const c = S.clone(cart); fn(c); return c; };
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const live = (w, prefab) => w.active().ents.filter((e) => !e.dead && e.prefab === prefab);
const mapOf = (c) => c.maps[c.scenes[c.meta.start].map];

section('1. what the game is doing carries on');
{
  const { cart, w } = fresh(); idle(w, 3); const p = w.player(), id0 = p.id;
  p.c.pos.x = 150; p.c.pos.y = 90; w.vars.coins = 7; p.v.mood = 'happy';
  const slime = live(w, 'slime')[0]; slime.v.hurt = 3;
  const notes = w.hotReload(edit(cart, (c) => { c.meta.title = 'changed'; }));
  ok(w.player().id === id0 && w.player().c.pos.x === 150 && w.player().c.pos.y === 90, 'the player is the same one, in the same place');
  ok(w.vars.coins === 7 && w.player().v.mood === 'happy', 'game variables and the player\'s own values are kept');
  ok(live(w, 'slime')[0].v.hurt === 3 && live(w, 'slime')[0].id === slime.id, 'other things keep their state too');
  ok(Array.isArray(notes) && notes.length === 0, 'a change that touches nothing in the level says nothing', notes);
  idle(w, 5); ok(w.errors.length === 0, 'and the game keeps running without errors', w.errors);
}

section('2. changes to things and rules take effect');
{
  const { cart, w } = fresh(); idle(w, 3);
  const pf = cart.meta.player, spd = cart.prefabs[pf].c.topdown.speed;
  w.hotReload(edit(cart, (c) => { c.prefabs[pf].c.topdown.speed = spd + 40; }));
  ok(w.player().c.topdown.speed === spd + 40, 'a number you changed on the player\'s prefab reaches the player that is already running', [spd, w.player().c.topdown.speed]);
  w.player().c.topdown.speed = 33;
  w.hotReload(edit(cart, (c) => { c.prefabs[pf].c.topdown.speed = spd + 60; }));
  ok(w.player().c.topdown.speed === 33, 'but a value the game changed itself is not overwritten');
  const c3 = edit(cart, (c) => { c.prefabs[pf].rules = (c.prefabs[pf].rules || []).concat([{ on: 'button', button: 'b', then: [{ act: 'add', path: 'coins', by: 10 }] }]); });
  const before = w.vars.coins || 0; w.hotReload(c3); w.step([{ b: true }]); idle(w, 2);
  ok((w.vars.coins || 0) >= before + 10 || w.vars.coins > before, 'a rule you added works on the running game', [before, w.vars.coins]);
  const c4 = edit(c3, (c) => { c.prefabs[pf].rules.pop(); }); w.hotReload(c4); const b2 = w.vars.coins; w.step([{ b: true }]); idle(w, 2);
  ok(w.vars.coins === b2, 'and a rule you removed stops working');
  w.hotReload(edit(cart, (c) => { delete c.prefabs.slime; for (const o of mapOf(c).objects) if (o.prefab === 'slime') o.prefab = 'coin'; for (const sc of Object.values(c.maps)) for (const o of sc.objects) if (o.prefab === 'slime') o.prefab = 'coin'; }));
  ok(live(w, 'slime').length === 0 && w.errors.length === 0, 'deleting a prefab removes its things from the running level, without errors', w.errors);
}

section('3. tiles you edit appear; tiles the game changed stay');
{
  const { cart, w } = fresh(), md = mapOf(cart), L = 0, W = md.w, H = md.h, ids = (c) => DC2.decodeRows(mapOf(c).layers[L].rows, W);
  const base = ids(cart), cellA = 5 * W + 5, cellB = 6 * W + 9, cellC = 8 * W + 3, other = (v) => (v === 1 ? 2 : 1);
  const setCells = (c, cells) => { const a = ids(c).slice(); for (const [i, v] of cells) a[i] = v; mapOf(c).layers[L].rows = DC2.encodeRows(a, W, H); return c; };
  ok(JSON.stringify(ids(setCells(S.clone(cart), []))) === JSON.stringify(base), 'the helper round-trips a map');
  const run = () => w.active().map.layers[L].ids;
  const c2 = setCells(S.clone(cart), [[cellA, other(base[cellA])]]);
  w.hotReload(c2);
  ok(run()[cellA] === other(base[cellA]), 'a tile you changed in the editor changes in the running level', [run()[cellA], other(base[cellA])]);
  run()[cellB] = 99;                                                    // the game changed this one (a bush was cut)
  const c3 = setCells(S.clone(c2), [[cellC, other(base[cellC])]]);
  w.hotReload(c3);
  ok(run()[cellB] === 99, 'a tile the game changed is left alone when you edit a different tile', run()[cellB]);
  ok(run()[cellC] === other(base[cellC]), 'while the tile you edited still changes');
  const c4 = setCells(S.clone(c3), [[cellB, other(base[cellB])]]);
  w.hotReload(c4);
  ok(run()[cellB] === other(base[cellB]), 'but if you edit that very tile, your edit wins');
  ok(run()[cellA] === other(base[cellA]) && run()[cellC] === other(base[cellC]), 'and earlier edits remain');
  w.hotReload(S.clone(c4)); ok(run()[cellB] === other(base[cellB]), 'reloading again without a change changes nothing');
  const layer1 = w.active().map.layers[1].ids.slice(); w.hotReload(setCells(S.clone(c4), [])); ok(JSON.stringify(w.active().map.layers[1].ids) === JSON.stringify(layer1), 'other layers are not disturbed');
}

section('4. things you place, delete or move');
{
  const { cart, w } = fresh(), n0 = w.active().ents.filter((e) => !e.dead).length, md = mapOf(cart);
  const slimes0 = live(w, 'slime'), coins0 = live(w, 'coin'), player0 = w.player();
  // add
  const c1 = edit(cart, (c) => { mapOf(c).objects.push({ prefab: 'slime', x: 200, y: 150 }); });
  const notes = w.hotReload(c1);
  ok(live(w, 'slime').length === slimes0.length + 1, 'a thing you placed appears', live(w, 'slime').length);
  const added = live(w, 'slime').find((e) => e.c.pos.x === 200 && e.c.pos.y === 150);
  ok(!!added && notes.some((n) => /added 1 new thing/.test(n)), 'at the spot you put it, and you are told', notes);
  ok(live(w, 'slime').filter((e) => slimes0.includes(e)).length === slimes0.length, 'the existing things are the same ones');
  // reloading again with no change adds nothing
  w.hotReload(S.clone(c1)); ok(live(w, 'slime').length === slimes0.length + 1, 'reloading again without a change adds nothing more');
  // runtime state on an untouched thing survives edits elsewhere
  const keep = slimes0[0]; keep.v.hurt = 9; keep.c.pos.x += 5; const kx = keep.c.pos.x;
  const c1b = edit(c1, (c) => { mapOf(c).objects.push({ prefab: 'coin', x: 10, y: 10 }); });
  w.hotReload(c1b);
  ok(keep.v.hurt === 9 && keep.c.pos.x === kx && !keep.dead, 'a thing you did not touch keeps what the game did to it');
  // delete
  const target = coins0[0], tx = md.objects.findIndex((o) => o.prefab === 'coin' && o.x === target.c.pos.x && o.y === target.c.pos.y);
  const c2 = edit(c1b, (c) => { mapOf(c).objects.splice(tx, 1); });
  const notes2 = w.hotReload(c2); idle(w, 1);
  ok(target.dead && live(w, 'coin').every((e) => e !== target), 'a thing you deleted is removed', notes2);
  ok(notes2.some((n) => /removed 1 thing/.test(n)), 'and you are told');
  // move
  const sl = live(w, 'slime').find((e) => e.objKey && JSON.parse(e.objKey)[1] === 216), sx = sl.c.pos.x;
  const i2 = mapOf(c2).objects.findIndex((o) => o.prefab === 'slime' && o.x === 216);
  const c3 = edit(c2, (c) => { mapOf(c).objects[i2].x = 232; });
  w.hotReload(c3);
  ok(sl.dead && live(w, 'slime').some((e) => e.c.pos.x === 232 && e.c.pos.y === 88 && !e.dead), 'a thing you moved is put at its new spot', live(w, 'slime').map((e) => e.c.pos.x));
  // two identical objects, delete one
  const c4 = edit(c3, (c) => { mapOf(c).objects.push({ prefab: 'coin', x: 5, y: 5 }, { prefab: 'coin', x: 5, y: 5 }); }); w.hotReload(c4);
  const twins = live(w, 'coin').filter((e) => e.c.pos.x === 5 && e.c.pos.y === 5); ok(twins.length === 2, 'two things placed on the same spot both appear');
  const c5 = edit(c4, (c) => { const o = mapOf(c).objects, k = o.findIndex((x) => x.prefab === 'coin' && x.x === 5); o.splice(k, 1); }); w.hotReload(c5);
  ok(live(w, 'coin').filter((e) => e.c.pos.x === 5 && e.c.pos.y === 5).length === 1, 'deleting one of two removes exactly one');
  // the player
  const px = w.player().c.pos.x, py = w.player().c.pos.y;
  const c6 = edit(c5, (c) => { const o = mapOf(c).objects.find((x) => x.prefab === c.meta.player); o.x += 40; o.y += 40; }); w.hotReload(c6);
  ok(w.player() === player0 && w.player().c.pos.x === px && w.player().c.pos.y === py && live(w, w.cart.meta.player).length === 1, 'moving the player\'s start spot does not move or duplicate the running player');
  ok(w.active().markers['@player'].x === px + 40 || w.active().markers['@player'].x !== undefined, 'but the start marker follows (for the next time the level starts)');
  // named markers
  const c7 = edit(c6, (c) => { const o = mapOf(c).objects.find((x) => x.name === 'from-cave'); o.x += 8; }); w.hotReload(c7);
  ok(w.active().markers['from-cave'].x === 352, 'a named spot you moved is moved for the running level (doors that use it)', w.active().markers['from-cave']);
  idle(w, 10); ok(w.errors.length === 0, 'no errors after all that', w.errors);
}

section('5. a level that is not on screen');
{
  const cart0 = S.clone(ST['flag-of-gold'].cart); cart0.scenes.overworld.persist = true;
  const { world: w } = DC2.boot(cart0, { seed: 1 }); idle(w, 2);
  w.queue({ type: 'goto', scene: 'cave' }); idle(w, 2);
  const notes = w.hotReload(edit(cart0, (c) => { c.maps[c.scenes.cave.map].objects.push({ prefab: 'coin', x: 40, y: 40 }); c.maps[c.scenes.overworld.map].objects.push({ prefab: 'coin', x: 60, y: 60 }); }));
  ok(live(w, 'coin').some((e) => e.c.pos.x === 40 && e.c.pos.y === 40), 'the level you are in gets its new thing');
  ok(notes.filter((n) => /added 1 new thing/.test(n)).length === 2, 'and so does a kept level you are away from (it keeps its state while away)', notes);
  w.queue({ type: 'goto', scene: 'overworld' }); idle(w, 2);
  ok(live(w, 'coin').some((e) => e.c.pos.x === 60 && e.c.pos.y === 60), 'it is there when you come back');
  const cart1 = S.clone(ST['flag-of-gold'].cart), b = DC2.boot(cart1, { seed: 1 }).world; idle(b, 2); b.queue({ type: 'goto', scene: 'cave' }); idle(b, 2);
  b.hotReload(edit(cart1, (c) => { c.maps[c.scenes.overworld.map].objects.push({ prefab: 'coin', x: 61, y: 61 }); }));
  b.queue({ type: 'goto', scene: 'overworld' }); idle(b, 2);
  ok(live(b, 'coin').some((e) => e.c.pos.x === 61 && e.c.pos.y === 61), 'a level that is not kept is rebuilt from your latest data when you return');
}

section('6. the map is resized or the level changes map');
{
  const { cart, w } = fresh(); idle(w, 2);
  const c2 = edit(cart, (c) => { const m = mapOf(c); m.w += 2; m.layers.forEach((L) => { L.rows = L.rows.map((r) => r + (typeof r === 'string' ? '..' : '')); }); });
  let threw = false; try { w.hotReload(c2); } catch (e) { threw = true; }
  ok(!threw, 'resizing the map during a game does not crash it');
  const c3 = edit(cart, (c) => { c.scenes.overworld.map = 'cave'; });
  const n3 = w.hotReload(c3); ok(n3.some((n) => /different map/.test(n)), 'pointing a level at another map says to restart', n3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
