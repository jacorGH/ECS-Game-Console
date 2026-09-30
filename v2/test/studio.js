/* Studio core tests (no DOM).  node v2/test/studio.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/v1import.js'); require('../studio/starters.js');
const S = DC2.studio, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗', n, x === undefined ? '' : JSON.stringify(x)); } };
const section = (t) => console.log('\n' + t);
const fresh = (k) => S.clone(ST[k || 'platformer'].cart);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canon = (c) => S.canonical(c);

(async () => {
  /* ------------------------------------------------------------------ 1. documents and undo */
  section('1. Doc: one history for every edit');
  {
    const d = new S.Doc(fresh()), events = [];
    d.on((e) => events.push(e));
    d.set(['meta', 'title'], 'A'); d.set(['meta', 'title'], 'B');
    ok(d.cart.meta.title === 'B' && d.undos.length === 2, 'sets are undo steps');
    d.undo(); ok(d.cart.meta.title === 'A', 'undo');
    d.redo(); ok(d.cart.meta.title === 'B', 'redo');
    d.undo(); d.set(['meta', 'title'], 'C'); ok(!d.canRedo, 'a new edit clears redo');
    ok(events.length === 6 && events[0].touched[0].join('.') === 'meta.title', 'subscribers are told what changed', events.map((e) => e.kind));
    const before = canon(d.cart);
    d.begin('many'); d.set(['meta', 'title'], 'X'); d.set(['vars', 'coins'], 9); d.set(['meta', 'width'], 300); d.end();
    ok(d.undos.length === 3 && events[events.length - 1].touched.length === 3, 'a group is one undo step and ONE notification');
    d.undo(); ok(canon(d.cart) === before, 'undoing a group restores everything exactly');
    let n = 0; const off = d.on(() => n++); d.set(['meta', 'title'], 'Z'); off(); d.set(['meta', 'title'], 'Y'); ok(n === 1, 'unsubscribe works');
    const d2 = new S.Doc(fresh());
    d2.set(['meta', 'width'], 100, { coalesce: true }); d2.set(['meta', 'width'], 120, { coalesce: true }); d2.set(['meta', 'width'], 140, { coalesce: true });
    ok(d2.undos.length === 1 && d2.cart.meta.width === 140, 'rapid edits to one field (a slider drag) merge into one step');
    d2.undo(); ok(d2.cart.meta.width === 256, 'and undo goes back to the value before the drag', d2.cart.meta.width);
    d2.insert(['meta', 'extensions'], null, 'zzz'); d2.undo(); ok(!d2.cart.meta.extensions.includes('zzz'), 'insert/undo');
    const a = d2.cart.meta.extensions.slice(); d2.move(['meta', 'extensions'], 0, 2); d2.undo(); ok(JSON.stringify(d2.cart.meta.extensions) === JSON.stringify(a), 'move/undo');
    d2.del(['vars', 'kills']); ok(!('kills' in d2.cart.vars), 'delete'); d2.undo(); ok(d2.cart.vars.kills === 0, 'and undo brings it back');
  }

  /* ------------------------------------------------------------------ 2. map operations */
  section('2. Map operations');
  {
    const d = new S.Doc(fresh()), M = S.map, m = d.cart.maps.level1, li = 1;
    const stone = 3, cellId = (x, y) => parseInt(m.layers[li].rows[y].substr(x * 2, 2), 36);
    ok(cellId(5, 5) === 0, 'starts empty');
    d.begin('stroke'); M.paint(d, 'level1', li, M.line(2, 3, 8, 3), stone); M.paint(d, 'level1', li, [[8, 4]], stone); d.end();
    ok(cellId(2, 3) === stone && cellId(8, 3) === stone && cellId(8, 4) === stone, 'a stroke paints cells');
    ok(d.undos.length === 1, 'and is one undo step');
    d.undo(); ok(cellId(2, 3) === 0 && cellId(8, 4) === 0, 'undo removes the whole stroke');
    d.redo(); ok(cellId(5, 3) === stone, 'redo');
    ok(M.paint(d, 'level1', li, [[5, 3]], stone) === 0, 'painting what is already there changes nothing');
    ok(d.undos.length === 1, 'and adds no undo step');
    ok(M.paint(d, 'level1', li, [[-1, 0], [999, 0], [0, -4]], stone) === 0, 'cells outside the map are ignored');
    ok(M.paint(d, 'level1', li, M.rect(20, 1, 22, 3), stone) === 9, 'rectangle');
    const big = M.flood(d.cart, 'level1', li, 15, 5); ok(big.length > 200 && !big.some(([x, y]) => x === 5 && y === 3), 'flood fill finds the connected empty region and stops at walls', big.length);
    const region = M.flood(d.cart, 'level1', li, 21, 2); ok(region.length === 9, 'flood fill of a solid block finds exactly the block', region.length);
    ok(M.paint(d, 'level1', li, M.flood(d.cart, 'level1', li, 21, 2), 0) === 9, 'erase by filling with 0');
    const ids0 = S.map.layerIds(d.cart, 'level1', li).slice();
    M.resize(d, 'level1', 40, 16);
    ok(m.w === 40 && m.h === 16 && m.layers[0].rows.length === 16 && m.layers[0].rows[0].length === 80, 'resize grows every layer');
    ok(DC2.decodeRows(m.layers[li].rows, 40)[13 * 40 + 5] === 3, 'and keeps existing tiles where they were');
    d.undo(); ok(m.w === 32 && m.h === 14 && JSON.stringify(S.map.layerIds(d.cart, 'level1', li)) === JSON.stringify(ids0), 'resize is one undo step');
    const ix = M.addLayer(d, 'level1', 'sky'); ok(m.layers[ix].name === 'sky' && m.layers[ix].rows.length === 14, 'add layer'); d.undo();
    ok(m.layers.length === 2, 'undo add layer');
    const n0 = m.objects.length, i = M.addObject(d, 'level1', { prefab: 'coin', x: 40, y: 40 });
    ok(m.objects.length === n0 + 1 && m.objects[i].prefab === 'coin', 'place an object');
    d.begin('drag'); M.moveObject(d, 'level1', i, 50, 60); M.moveObject(d, 'level1', i, 70, 80); d.end();
    ok(m.objects[i].x === 70 && d.undos.length >= 1, 'move object'); d.undo(); ok(m.objects[i].x === 40, 'a whole drag undoes in one step');
    M.removeObject(d, 'level1', i); ok(m.objects.length === n0, 'delete'); d.undo(); ok(m.objects.length === n0 + 1, 'undo delete');
    ok(M.uniqueName(m, 'start') === 'start2', 'unique marker names');
    ok(S.check(d.cart).ok, 'the cart is still valid after all of that', S.check(d.cart).errors);
  }

  /* ------------------------------------------------------------------ 3. storage */
  section('3. Storage: projects, partial saves, restore points, .dcart');
  {
    class Spy extends S.MemoryBackend { constructor() { super(); this.puts = []; } async put(s, k, v) { if (s === 'files') this.puts.push(k); return super.put(s, k, v); } }
    const be = new Spy(), lib = new S.Library(be), cart = fresh();
    const meta = await lib.create('Mine', cart);
    ok((await lib.list()).length === 1 && (await lib.list())[0].name === 'Mine', 'create + list');
    const { cart: back } = await lib.open(meta.id);
    ok(canon(back) === canon(cart), 'a project reopens identical to what was saved');
    const files = Object.keys(S.split(cart));
    ok(files.includes('project.json') && files.includes('maps/level1.json') && files.some((f) => f.startsWith('prefabs/')), 'saved as one file per asset', files.slice(0, 6));
    be.puts.length = 0;
    const d = new S.Doc(back); d.set(['prefabs', 'coin', 'c', 'body', 'w'], 9);
    await lib.saveFiles(meta.id, d.cart, ['prefabs/coin.json']);
    ok(be.puts.length === 1 && be.puts[0].endsWith('prefabs/coin.json'), 'saving one change writes ONE file', be.puts);
    ok((await lib.open(meta.id)).cart.prefabs.coin.c.body.w === 9, 'and it is there on reopen');
    d.del(['prefabs', 'brick']); await lib.saveFiles(meta.id, d.cart, ['prefabs/brick.json']);
    ok(!('brick' in (await lib.open(meta.id)).cart.prefabs), 'deleting an asset deletes its file');
    for (let i = 0; i < 5; i++) { await lib.snapshot(meta.id, d.cart, 'snap ' + i, 3); await sleep(3); }
    const snaps = await lib.snapshots(meta.id);
    ok(snaps.length === 3 && snaps[0].label === 'snap 4', 'restore points keep only the newest few', snaps);
    const old = await lib.snapshotCart(meta.id, snaps[2].ts); ok(canon(old) === canon(d.cart), 'a restore point holds the whole project');
    const text = await lib.exportDcart(meta.id), imp = await lib.importDcart(text, 'Copy');
    ok(canon((await lib.open(imp.id)).cart) === canon(d.cart), '.dcart export/import round-trips');
    let err = ''; try { S.fromDcart(text.replace('"coins": 0', '"coins": 5')); } catch (e) { err = e.message; }
    ok(/edited or damaged/.test(err), 'a tampered .dcart is refused with a plain message', err);
    try { S.fromDcart('not json'); } catch (e) { err = e.message; } ok(/not valid JSON/.test(err), 'garbage is refused politely', err);
    await lib.remove(meta.id);
    ok((await lib.list()).length === 1 && (await be.keys('files', meta.id + '/')).length === 0, 'delete removes the project and every file');
  }

  /* ------------------------------------------------------------------ 4. autosave */
  section('4. Autosave');
  {
    class Spy extends S.MemoryBackend { constructor() { super(); this.puts = []; this.fail = false; } async put(s, k, v) { if (this.fail && s === 'files') throw new Error('disk full'); if (s === 'files') this.puts.push(k); return super.put(s, k, v); } }
    const be = new Spy(), lib = new S.Library(be), meta = await lib.create('A', fresh());
    const { cart } = await lib.open(meta.id), d = new S.Doc(cart), a = new S.Autosaver(lib, meta.id, d, { delay: 20 }), seen = [];
    a.onStatus((s) => seen.push(s)); be.puts.length = 0;
    d.set(['prefabs', 'coin', 'c', 'body', 'w'], 7); d.set(['prefabs', 'coin', 'c', 'body', 'h'], 7); d.set(['meta', 'title'], 'Renamed');
    ok(a.status === 'dirty', 'edits mark the project dirty');
    await sleep(80); await a.flush();
    ok(a.status === 'saved' && seen.includes('saving'), 'and it saves by itself', seen);
    ok(be.puts.length === 2 && be.puts.some((k) => k.endsWith('project.json')) && be.puts.some((k) => k.endsWith('prefabs/coin.json')), 'only the touched files were written', be.puts);
    const re = (await lib.open(meta.id)).cart; ok(re.meta.title === 'Renamed' && re.prefabs.coin.c.body.h === 7, 'a fresh open sees every edit');
    be.fail = true; d.set(['meta', 'title'], 'Nope'); await sleep(60); await a.flush();
    ok(a.status === 'error' && a.dirty.has('project.json'), 'a failed save is reported and NOT forgotten', a.status);
    be.fail = false; await a.flush(); ok(a.status === 'saved' && (await lib.open(meta.id)).cart.meta.title === 'Nope', 'and retried successfully');
    d.set(['sprites'], d.cart.sprites); await a.flush(); ok(a.status === 'saved', 'a whole-collection change saves everything');
    a.stop();
  }

  /* ------------------------------------------------------------------ 5. recipes */
  section('5. Recipes: add a ready-made thing');
  {
    for (const r of S.recipes.filter((x) => !x.hidden)) {
      const d = new S.Doc(fresh('platformer'));
      const before = canon(d.cart), name = S.addRecipe(d, r.id);
      const rep = S.check(d.cart);
      ok(rep.ok && rep.warnings.length === 0, `"${r.title}" adds a valid thing`, rep.errors.concat(rep.warnings));
      ok(d.undos.length >= 1 && !!d.cart.prefabs[name], `"${r.title}" exists as prefab "${name}"`);
      const steps = d.undos.length; d.undo(); ok(canon(d.cart) === before, `"${r.title}" is fully undone in one step`, steps);
    }
    const bare = fresh('platformer'); bare.prefabs = {}; bare.meta.extensions = []; bare.maps.level1.objects = []; delete bare.meta.player;
    const d = new S.Doc(bare); const p = S.addRecipe(d, 'player-side');
    ok(d.cart.prefabs.slash && d.cart.prefabs[p].rules[0].then[0].prefab === 'slash', 'a player brings the sword swing it depends on');
    ok(['space2d', 'platformer', 'combat', 'sprite', 'topdown'].every((e) => d.cart.meta.extensions.includes(e)), 'and switches on the extensions it needs', d.cart.meta.extensions);
    ok(d.cart.meta.player === p, 'and becomes the cart\'s player');
    ok(S.addRecipe(d, 'coin') === 'coin' && S.addRecipe(d, 'coin') === 'coin-2', 'names stay unique');
    ok(d.cart.vars.coins === 0, 'a coin declares its variable');
  }

  /* ------------------------------------------------------------------ 6. rename, usage */
  section('6. Rename with references, and "where is this used?"');
  {
    const d = new S.Doc(fresh('platformer')), { reg } = DC2.registryFor(d.cart);
    ok(S.usage(d.cart, reg, 'prefab', 'coin').length === 3, 'usage lists every place a prefab is placed', S.usage(d.cart, reg, 'prefab', 'coin').map((u) => S.pathStr(u.path)));
    ok(S.usage(d.cart, reg, 'prefab', 'slash').some((u) => /rules\[0\]\.then\[0\]\.prefab/.test(S.pathStr(u.path))), 'and finds references inside rules');
    const before = canon(d.cart);
    S.renameAsset(d, 'prefab', 'slash', 'sword');
    ok(!d.cart.prefabs.slash && d.cart.prefabs.sword && d.cart.prefabs['player-side'].rules[0].then[0].prefab === 'sword', 'renaming a prefab updates the rule that spawns it');
    ok(S.check(d.cart).ok, 'and the project is still valid');
    S.renameAsset(d, 'prefab', 'player-side', 'hero');
    ok(d.cart.meta.player === 'hero' && d.cart.maps.level1.objects.some((o) => o.prefab === 'hero'), 'renaming the player updates meta.player and the map');
    S.renameAsset(d, 'scene', 'level1', 'world-1');
    ok(d.cart.meta.start === 'world-1' && d.cart.prefabs.hero.rules[2].then[2].scene === 'world-1', 'renaming a scene updates start and every goto', d.cart.prefabs.hero.rules[2].then[2]);
    S.renameAsset(d, 'sprite', 'coin', 'gold');
    ok(d.cart.prefabs.coin.c.sprite.id === 'gold' && S.check(d.cart).ok, 'renaming a sprite updates the things that use it');
    S.renameAsset(d, 'map', 'level1', 'big-map'); ok(d.cart.scenes['world-1'].map === 'big-map' && S.check(d.cart).ok, 'renaming a map updates its scene');
    let e = ''; try { S.renameAsset(d, 'prefab', 'coin', 'walker'); } catch (x) { e = x.message; } ok(/already exists/.test(e), 'a clashing name is refused', e);
    try { S.renameAsset(d, 'prefab', 'coin', 'bad name!'); } catch (x) { e = x.message; } ok(/letters, numbers/.test(e), 'a bad name is refused', e);
    ok(d.undos.length === 5, 'each rename is exactly one undo step', d.undos.length);
    while (d.undo());
    ok(canon(d.cart) === before, 'undoing them all restores the project exactly');
  }

  /* ------------------------------------------------------------------ 7. forms from schemas */
  section('7. Form descriptors are generated from the extension schemas');
  {
    const cart = fresh(), cx = { cart, reg: DC2.registryFor(cart).reg };
    const h = S.describeComponent('health', cx);
    ok(h.kind === 'object' && h.fields.map((f) => f.key).join() === 'hp,max,invuln' && h.fields[0].kind === 'number' && h.fields[0].default === 1, 'a component becomes a list of typed fields, without engine-internal ones', h.fields.map((f) => f.key));
    ok(h.label === 'Health' && h.doc.length > 10 && h.fields[1].label === 'Max health', 'with friendly labels and its documentation', h.fields.map((f) => f.label));
    const sp = S.describeComponent('sprite', cx), id = sp.fields.find((f) => f.key === 'id');
    ok(id.kind === 'ref' && id.to === 'sprite' && id.options.includes('hero') && id.options.includes('coin'), 'a sprite field offers the project\'s sprites as choices', id.options);
    ok(S.describeComponent('ai', cx).fields.find((f) => f.key === 'mode').options.includes('patrol'), 'enums offer their values');
    const sp2 = S.describeAction('spawn', cx);
    ok(sp2.fields.find((f) => f.key === 'prefab').options.includes('coin') && sp2.fields.find((f) => f.key === 'ahead').kind === 'expr', 'actions are described too');
    ok(S.describeAction('if', cx).fields.find((f) => f.key === 'then').kind === 'actions', 'including nested action lists');
    ok(S.describeTrigger('button', cx).fields.find((f) => f.key === 'button').options.includes('a'), 'and triggers');
    ok(S.describeTrigger('when', cx).requiresIf === true, 'saying which triggers need a condition');
    const a = S.blankAction('spawn', cx); ok(a.act === 'spawn' && typeof a.prefab === 'string' && a.prefab, 'a blank action starts with valid required values', a);
    const r = S.blankRule('touch', cx); ok(r.on === 'touch' && Array.isArray(r.then), 'a blank rule starts empty');
    ok(S.blankRule('when', cx).if === 'true', 'a "when" rule starts with a condition');
    const sug = S.suggest(cart, cx.reg, 'player-side');
    ok(sug.vars.includes('coins') && sug.self.includes('self.health.hp') && sug.self.includes('self.platformer.jump'), 'variable pickers know the game\'s variables and this thing\'s own values', sug.self.slice(0, 5));
    ok(S.tileSpec.fields.solid.type === 'bool', 'tile properties have a form spec');
    ok(S.humanize('maxFall') === 'Max fall' && S.humanize('player-side') === 'Player side', 'labels are human');
  }

  /* ------------------------------------------------------------------ 7b. parts */
  section('7b. Parts: add and remove pieces of a thing');
  {
    const d = new S.Doc(fresh('topdown'));
    ok(!d.cart.meta.extensions.includes('platformer'), 'the top-down project does not use the platformer extension yet');
    d.set(['prefabs', 'crate'], { c: { pos: {} } });
    S.addPart(d, 'crate', 'platformer');
    const c = d.cart.prefabs.crate.c;
    ok(c.platformer && c.vel && c.body && c.gravity, 'adding "platformer" also adds the parts it needs', Object.keys(c));
    ok(d.cart.meta.extensions.includes('platformer'), 'and switches on its extension', d.cart.meta.extensions);
    S.addPart(d, 'crate', 'sprite'); ok(typeof c.sprite.id === 'string' && c.sprite.id, 'a part with a required picture gets one to start with', c.sprite);
    ok(S.check(d.cart).ok, 'the result is valid', S.check(d.cart).errors);
    let e = ''; try { S.removePart(d, 'crate', 'gravity'); } catch (x) { e = x.message; } ok(/needed by Platformer/.test(e), 'a part that others need cannot be removed', e);
    S.removePart(d, 'crate', 'sprite'); ok(!c.sprite, 'other parts can'); d.undo(); ok(!!d.cart.prefabs.crate.c.sprite, 'and it undoes');
    const n = S.placedCount(d.cart, 'coin'); const before = d.cart.maps.level1.objects.length;
    S.deleteThing(d, 'coin'); ok(!d.cart.prefabs.coin && d.cart.maps.level1.objects.length === before - n, 'deleting a thing removes every copy placed in levels', n);
    d.undo(); ok(d.cart.prefabs.coin && d.cart.maps.level1.objects.length === before, 'and it is one undo step');
    S.deleteThing(d, 'player-top'); ok(!d.cart.meta.player, 'deleting the player clears meta.player');
    ok(S.describeAction('say', { cart: d.cart, reg: S.allReg() }).fields.find((f) => f.key === 'lines').kind === 'lines', 'dialogue lines get their own editor');
  }

  /* ------------------------------------------------------------------ 7c. sprites */
  section('7c. Sprite operations');
  {
    const d = new S.Doc(fresh('platformer')), SP = S.sprite, id = SP.create(d, 'Gem', 8, 8);
    const def = d.cart.sprites[id], frames = () => def.frames.length;
    ok(id === 'gem' && def.frames[0] === SP.blank(8, 8) && S.check(d.cart).ok, 'a new sprite is blank and valid', S.check(d.cart).errors);
    const before = def.frames[0];
    d.begin('stroke'); SP.paint(d, id, 0, S.map.line(0, 0, 7, 0), 5); SP.paint(d, id, 0, [[3, 3]], 12); d.end();
    ok(SP.decode(def, 0)[0] === 5 && SP.decode(def, 0)[7] === 5 && SP.decode(def, 0)[3 * 8 + 3] === 12, 'strokes set palette indexes (base-36)');
    ok(d.undos.length === 2, 'and are one undo step'); d.undo(); ok(def.frames[0] === before, 'undo restores every pixel');
    d.redo(); ok(SP.paint(d, id, 0, [[0, 0]], 5) === 0, 'painting the same colour changes nothing');
    ok(SP.paint(d, id, 0, [[1, 0]], -1) === 1 && SP.decode(def, 0)[1] === -1, 'erase makes pixels transparent');
    ok(SP.paint(d, id, 0, [[-1, 0], [8, 3], [2, 99]], 4) === 0, 'outside the canvas is ignored');
    ok(SP.flood(def, 0, 5, 5).length === 64 - 6 - 1 - 1 || SP.flood(def, 0, 5, 5).length > 40, 'flood fill finds the connected area');
    SP.paint(d, id, 0, SP.flood(def, 0, 5, 5), 7); ok(SP.decode(def, 0)[5 * 8 + 5] === 7 && SP.decode(def, 0)[0] === 5, 'flood fill stops at other colours');
    const px0 = SP.decode(def, 0).join(); SP.flipH(d, id, 0); SP.flipH(d, id, 0); ok(SP.decode(def, 0).join() === px0, 'flip twice = unchanged');
    SP.rotate(d, id, 0); SP.rotate(d, id, 0); SP.rotate(d, id, 0); SP.rotate(d, id, 0); ok(SP.decode(def, 0).join() === px0, 'four rotations = unchanged');
    SP.shift(d, id, 0, 3, 2); SP.shift(d, id, 0, -3, -2); ok(SP.decode(def, 0).join() === px0, 'shifting wraps around and comes back');
    SP.addFrame(d, id); SP.addFrame(d, id, 0); ok(frames() === 3 && def.frames[1] === def.frames[0], 'add blank frame / copy frame (copy goes right after)');
    SP.setAnim(d, id, 'spin', { f: [0, 1, 2], fps: 6 });
    SP.moveFrame(d, id, 0, 2); ok(JSON.stringify(def.anims.spin.f) === '[2,0,1]', 'moving a frame renumbers animations', def.anims.spin.f);
    SP.removeFrame(d, id, 0); ok(frames() === 2 && JSON.stringify(def.anims.spin.f) === '[1,0]' && S.check(d.cart).ok, 'deleting a frame removes it from animations', def.anims.spin.f);
    d.undo(); ok(frames() === 3 && JSON.stringify(def.anims.spin.f) === '[2,0,1]', 'and is one undo step');
    let e = ''; const one = SP.create(d, 'One', 4, 4); try { SP.removeFrame(d, one, 0); } catch (x) { e = x.message; } ok(/at least one frame/.test(e), 'the last frame cannot be deleted', e);
    SP.resize(d, id, 12, 6); ok(def.w === 12 && def.h === 6 && def.frames.every((f) => f.split('/').length === 6 && f.split('/')[0].length === 12) && S.check(d.cart).ok, 'resize pads/crops every frame');
    d.undo(); ok(def.w === 8 && def.h === 8, 'resize is one undo step');
    SP.renameAnim(d, id, 'spin', 'twirl'); ok(def.anims.twirl && !def.anims.spin, 'rename animation');
    SP.setColor(d, 'main', 5, '#123456'); ok(d.cart.palettes.main[5] === '#123456', 'palette colour edit');
    const rgba = [255, 0, 0, 255, 0, 0, 0, 0]; const pal = ['#000000', '#ff0000', '#00ff00'];
    ok(SP.fromRGBA(rgba, 2, 1, pal) === '1.', 'importing an image picks the nearest palette colour and keeps transparency', SP.fromRGBA(rgba, 2, 1, pal));
    SP.setAnim(d, id, 'bad', { f: [9], fps: 4 }); ok(!S.check(d.cart).ok, 'an animation pointing at a missing frame is a problem');
  }

  /* ------------------------------------------------------------------ 8. live checking */
  section('8. Live checking points at the field');
  {
    const c = fresh(); c.prefabs.walker.c.ai.speed = 'fast'; c.prefabs.coin.rules[0].then[0].path = 'coinz';
    const rep = S.check(c);
    ok(!rep.ok, 'problems are found');
    ok(S.issuesAt(rep, 'prefabs.walker.c.ai.speed').length === 1, 'and can be looked up by the path of the field', rep.errors.map((e) => e.path));
    ok(S.issuesAt(rep, 'prefabs.coin').length >= 1 && S.issuesAt(rep, 'prefabs.walker').length >= 1, 'or by the thing they are inside of (a badge on the whole card)');
    ok(S.issuesAt(rep, 'prefabs.qblock').length === 0, 'without false alarms on other things');
  }

  /* ------------------------------------------------------------------ 9. the exit test, headless */
  section('9. Build a new level from scratch, then play it');
  {
    const d = new S.Doc(fresh('platformer'));
    const { scene, map } = S.addLevel(d, 'Level 2', 24, 12, 'level1');
    ok(d.cart.scenes[scene].map === map && d.cart.maps[map].objects.some((o) => o.prefab === d.cart.meta.player), 'a new level comes with a player start');
    const li = d.cart.maps[map].layers.findIndex((l) => l.collide);
    d.begin('floor'); S.map.paint(d, map, li, S.map.rect(0, 10, 23, 11), 3); S.map.paint(d, map, li, S.map.rect(0, 0, 0, 11), 3); S.map.paint(d, map, li, S.map.rect(23, 0, 23, 11), 3); d.end();
    S.map.paint(d, map, 0, S.map.line(8, 7, 12, 7), 6);
    const coin = d.cart.maps.level1.objects.find((o) => o.prefab === 'coin');
    S.map.addObject(d, map, { prefab: 'coin', x: 6 * 16 + 8, y: 9 * 16 + 8 });
    S.map.addObject(d, map, { prefab: 'walker', x: 14 * 16 + 8, y: 9 * 16 + 8 });
    S.map.addObject(d, map, { prefab: 'goal', x: 21 * 16 + 8, y: 9 * 16 + 8 });
    const door = S.addRecipe(d, 'door', 'to-level-2');
    ok(d.cart.prefabs[door].rules[0].then.slice(-1)[0].scene === scene, 'a door recipe already points at the other level', d.cart.prefabs[door].rules[0].then);
    S.map.addObject(d, 'level1', { prefab: door, x: 27 * 16 + 8, y: 11 * 16 + 8 });
    const rep = S.check(d.cart); ok(rep.ok && rep.warnings.length === 0, 'the result is a valid game', rep.errors.concat(rep.warnings));
    const { world: w } = DC2.boot(S.clone(d.cart)); ok(!!w, 'and it boots');
    const step = (keys, n) => { const k = {}; keys.forEach((x) => (k[x] = true)); for (let i = 0; i < n; i++) w.step([k]); };
    w.queue({ type: 'goto', scene }); w.step([{}]); step([], 40);
    const p = w.player(); ok(w.active().name === scene && p && p.r.ground, 'the player stands in the new level');
    const x0 = p.c.pos.x; step(['right'], 40); ok(p.c.pos.x - x0 > 30, 'and can run');
    const px = p.c.pos.x; step(['right', 'a'], 14); ok(p.c.pos.y < 150, 'and jump', p.c.pos.y);
    step([], 40);
    p.c.pos.x = 6 * 16 + 8; p.c.pos.y = 9 * 16 + 8; step([], 6);
    ok(w.vars.coins === 1, 'and collect the coin they placed', w.vars.coins);
    ok(w.errors.length === 0, 'without a single runtime error', w.errors);
    d.undo(); d.undo(); d.undo();
    ok(S.check(d.cart).ok, 'and every step of building it was undoable without breaking the project');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
