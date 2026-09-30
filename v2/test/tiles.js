/* Tiles as their own sprites, tile tags, entertile/leavetile, follow, sprite sink.  node v2/test/tiles.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/starters.js');
const S = DC2.studio;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const idle = (w, n) => { for (let i = 0; i < n; i++) w.step([{}]); };
const TS = 16, at = (t) => (t + 0.5) * TS;
const solidRow = (n) => '1'.repeat(n);

/* a pond in the middle of a room: tile 1 grass, tile 2 water (tagged, walkable), tile 3 wall */
function swimCart() {
  const W = 12, H = 8, ids = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ids.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 3 : x >= 5 && x <= 8 && y >= 2 && y <= 5 ? 2 : 1);
  const px = (c) => Array(16).fill(c.repeat(16)).join('/');
  return {
    format: 'DCART-2', meta: { title: 'Swim', width: 256, height: 224, start: 'pond', player: 'hero', extensions: ['space2d', 'topdown', 'sprite'] },
    vars: {}, palettes: { main: ['#000000', '#ffffff', '#3060ff', '#30a030', '#808080'] },
    sprites: { hero: { w: 16, h: 16, palette: 'main', frames: [px('1')], anims: { idle: { f: [0], fps: 1 } } },
      ripple: { w: 16, h: 8, palette: 'main', frames: [Array(8).fill('1'.repeat(16)).join('/')], anims: { idle: { f: [0], fps: 1 } } },
      grass: { w: 16, h: 16, palette: 'main', frames: [px('3')], anims: { idle: { f: [0], fps: 1 } } },
      water: { w: 16, h: 16, palette: 'main', frames: [px('2'), px('1')], anims: { idle: { f: [0, 1], fps: 2 } } },
      wall: { w: 16, h: 16, palette: 'main', frames: [px('4')], anims: { idle: { f: [0], fps: 1 } } } },
    tilesets: { world: { tileSize: 16, tiles: { 1: { name: 'grass', sprite: 'grass' }, 2: { name: 'water', sprite: 'water', tags: ['water'] }, 3: { name: 'wall', sprite: 'wall', solid: true } } } },
    maps: { pond: { w: W, h: H, tileset: 'world', layers: [{ name: 'ground', rows: DC2.encodeRows(ids, W, H) }], objects: [{ prefab: 'hero', name: 'start', x: at(2), y: at(3) }] } },
    prefabs: {
      hero: { tags: ['player'], v: { swimming: false, dips: 0 }, c: { pos: {}, vel: {}, body: { w: 10, h: 8 }, topdown: { speed: 80 }, sprite: { id: 'hero', auto: false } },
        rules: [
          { on: 'entertile', tag: 'water', then: [{ act: 'set', path: 'self.swimming', to: true }, { act: 'set', path: 'self.sprite.sink', to: 6 }, { act: 'add', path: 'self.dips' }, { act: 'spawn', prefab: 'ripple' }] },
          { on: 'leavetile', tag: 'water', then: [{ act: 'set', path: 'self.swimming', to: false }, { act: 'set', path: 'self.sprite.sink', to: 0 }, { act: 'destroy', target: 'ripple' }] },
        ] },
      ripple: { tags: ['ripple'], c: { pos: {}, follow: { target: 'player', oy: 4 }, sprite: { id: 'ripple', layer: 1, auto: false } } },
    },
    scenes: { pond: { map: 'pond' } },
  };
}

section('1. tiles with their own sprites and tags validate');
{
  const c = swimCart(), r = S.check(c);
  ok(r.errors.length === 0 && r.warnings.length === 0, 'a tileset with no sheet, one sprite per tile, is valid', r);
  ok(JSON.stringify(DC2.tileIds(c, 'world')) === '[1,2,3]', 'tile numbers come from the tiles', DC2.tileIds(c, 'world'));
  ok(DC2.tileArt(c, 'world', 2, 0).frame === 0 && DC2.tileArt(c, 'world', 2, 0.6).frame === 1, 'a tile animates with its sprite\'s idle animation');
  const bad = swimCart(); bad.tilesets.world.tiles[2].tags = 'water';
  ok(S.check(bad).errors.some((e) => /tags/.test(e.path)), 'tags must be a list');
  const bad2 = swimCart(); bad2.tilesets.world.tiles[4] = { name: 'nothing' };
  ok(S.check(bad2).errors.some((e) => /tiles\.4/.test(e.path)), 'a tile with no picture is an error');
  const bad3 = swimCart(); bad3.sprites.big = { w: 32, h: 32, palette: 'main', frames: [Array(32).fill('.'.repeat(32)).join('/')] }; bad3.tilesets.world.tiles[2].sprite = 'big';
  ok(S.check(bad3).errors.some((e) => /32x32/.test(e.msg)), 'a tile sprite must be the tile size');
  const bad4 = swimCart(); bad4.maps.pond.layers[0].rows[3] = bad4.maps.pond.layers[0].rows[3].slice(0, 4) + '09' + bad4.maps.pond.layers[0].rows[3].slice(6);
  ok(S.check(bad4).errors.some((e) => /tile 9 does not exist/.test(e.msg)), 'painting a tile number that does not exist is caught');
}

section('2. swimming: enter/leave a tagged tile, follow, sink');
{
  const { world: w } = DC2.boot(swimCart(), { seed: 1 }), p = w.player(), ripples = () => w.active().ents.filter((e) => !e.dead && e.prefab === 'ripple');
  idle(w, 5);
  ok(p.v.swimming === false && !ripples().length, 'on grass: not swimming, no ripple');
  ok(w.evalExpr('self.ontile.water', { self: p }) !== true, 'self.ontile.water is false on grass');
  for (let i = 0; i < 60 && !p.v.swimming; i++) w.step([{ right: true }]);
  ok(p.v.swimming === true && p.c.sprite.sink === 6, 'walking into the water: swimming, and the sprite sinks', { v: p.v, sink: p.c.sprite.sink });
  ok(w.evalExpr('self.ontile.water', { self: p }) === true, 'self.ontile.water is true in the water');
  ok(ripples().length === 1, 'the displacement ripple appears');
  for (let i = 0; i < 20; i++) w.step([{ right: true }]); idle(w, 2);
  const r = ripples()[0];
  ok(r && Math.abs(r.c.pos.x - p.c.pos.x) < 0.01 && Math.abs(r.c.pos.y - (p.c.pos.y + 4)) < 0.01, 'the ripple follows the swimmer (with its offset)', r && [r.c.pos, p.c.pos]);
  ok(p.v.dips === 1, 'moving from one water tile to the next does not re-trigger', p.v.dips);
  for (let i = 0; i < 80 && p.v.swimming; i++) w.step([{ right: true }]);
  idle(w, 2);
  ok(p.v.swimming === false && p.c.sprite.sink === 0 && !ripples().length, 'climbing out: not swimming, sprite back, ripple gone', { v: p.v, n: ripples().length });
  for (let i = 0; i < 80 && !p.v.swimming; i++) w.step([{ left: true }]);
  ok(p.v.dips === 2 && ripples().length === 1, 'jumping back in triggers again', p.v.dips);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
}

section('3. older carts: one sheet of tiles becomes one sprite per tile');
{
  const fog = S.clone(require('../carts/flag-of-gold.json'));
  ok(S.needsTileSplit(fog), 'the original Flag of Gold still uses a sheet');
  ok(S.check(fog).errors.length === 0, 'and older sheet-style carts still load');
  const rows = JSON.stringify(fog.maps);
  S.splitTileSheet(fog);
  ok(!S.needsTileSplit(fog) && !fog.sprites.tiles, 'after splitting there is no sheet', Object.keys(fog.sprites));
  ok(['tree', 'stone', 'water', 'platform'].every((n) => S.tileSpriteIds(fog).has(n)), 'tiles are named after their tile names', [...S.tileSpriteIds(fog)]);
  ok(JSON.stringify(fog.maps) === rows, 'levels are untouched (same tile numbers)');
  ok(S.check(fog).errors.length === 0, 'and the result is valid', S.check(fog).errors.slice(0, 3));
  const { world: w } = DC2.boot(fog, { seed: 1 }); idle(w, 60); ok(w.errors.length === 0 && w.player(), 'and plays');
  ok(fog.tilesets.world.tiles[2].solid === true, 'tile settings (solid) are kept');
  ok(!S.splitTileSheet(fog), 'splitting again changes nothing');
}

section('4. new tiles, renaming a tile sprite');
{
  const doc = new S.Doc(swimCart());
  const r = S.addTile(doc, 'world', 'lava');
  ok(r.n === 4 && doc.cart.sprites[r.sprite] && doc.cart.tilesets.world.tiles[4].sprite === r.sprite, 'a new tile gets the next number and its own blank sprite', r);
  ok(S.check(doc.cart).errors.length === 0, 'still valid');
  doc.undo(); ok(!doc.cart.tilesets.world.tiles[4] && !doc.cart.sprites.lava, 'adding a tile is one undo step');
  S.renameAsset(doc, 'sprite', 'water', 'pond_water');
  ok(doc.cart.tilesets.world.tiles[2].sprite === 'pond_water', 'renaming a tile\'s sprite updates the tile');
  const c2 = S.addTile(doc, 'world', null, 'grass');
  ok(doc.cart.sprites[c2.sprite].frames[0] === doc.cart.sprites.grass.frames[0], 'a tile can start as a copy of another');
}

section('5. starters ship with one sprite per tile, water tagged');
for (const [k, v] of Object.entries(window.DC2_STARTERS)) {
  ok(!S.needsTileSplit(v.cart), k + ': no tile sheet');
  const water = Object.values(v.cart.tilesets.world.tiles).find((d) => d.name === 'water');
  ok(water && (water.tags || []).includes('water'), k + ': water is tagged "water"');
  ok(S.tileSpriteIds(v.cart).has('grass'), k + ': grass has a proper name');
}

section('6. copy and paste pixels');
{
  const SP = S.sprite, doc = new S.Doc(swimCart()), H = doc.cart.sprites.hero;
  doc.set(['sprites', 'hero', 'frames', 0], SP.encode(Array.from({ length: 256 }, (_, i) => ((i % 16) < 4 && Math.floor(i / 16) < 4 ? 2 : -1)), 16, 16));
  const clip = SP.copy(doc.cart.sprites.hero, 0, { x: 0, y: 0, w: 4, h: 4 });
  ok(clip.w === 4 && clip.h === 4 && clip.px.every((v) => v === 2), 'copy takes a rectangle of pixels');
  ok(SP.copy(doc.cart.sprites.hero, 0, { x: 14, y: 14, w: 5, h: 5 }).w === 2, 'a selection hanging off the edge is clipped to the sprite');
  const u0 = doc.undos.length; SP.paste(doc, 'hero', 0, clip, 10, 10);
  let px = SP.decode(doc.cart.sprites.hero, 0);
  ok(px[10 * 16 + 10] === 2 && px[13 * 16 + 13] === 2 && px[9 * 16 + 9] === -1, 'paste puts it at the chosen spot');
  ok(doc.undos.length === u0 + 1, 'paste is one undo step');
  SP.paste(doc, 'hero', 0, clip, 14, 14); px = SP.decode(doc.cart.sprites.hero, 0);
  ok(px[15 * 16 + 15] === 2, 'pasting past the edge keeps what fits');
  const holey = { w: 2, h: 1, px: [-1, 3] }; SP.paste(doc, 'hero', 0, holey, 0, 0); px = SP.decode(doc.cart.sprites.hero, 0);
  ok(px[0] === 2 && px[1] === 3, 'transparent pixels in the clipboard leave what is underneath');
  SP.addFrame(doc, 'hero', null); SP.paste(doc, 'grass', 0, clip, 0, 0);
  ok(SP.decode(doc.cart.sprites.grass, 0)[0] === 2, 'paste works into a different sprite (even a tile)');
  SP.clearRect(doc, 'hero', 0, { x: 0, y: 0, w: 4, h: 4 });
  ok(SP.decode(doc.cart.sprites.hero, 0).slice(0, 4).every((v) => v === -1), 'delete clears the selection');
  const asym = { w: 2, h: 2, px: [1, 2, 3, 4] };
  ok(SP.clipFlipH(asym).px.join() === '2,1,4,3' && SP.clipFlipV(asym).px.join() === '3,4,1,2', 'the floating paste flips left-right and upside down');
  const id = SP.fromClip(doc, 'chunk', clip);
  ok(doc.cart.sprites[id].w === 4 && S.check(doc.cart).errors.length === 0, 'a selection can become its own sprite', S.check(doc.cart).errors);
}

section('7. touching a tile that has a tag (a splash when walking on "h2o")');
{
  const build = (rules, tag) => { const c = swimCart(); c.tilesets.world.tiles[2].tags = tag === null ? [] : [tag || 'h2o']; c.prefabs.hero.v = { swimming: false, dips: 0, outs: 0, anyTouches: 0 }; c.prefabs.hero.rules = rules; return c; };
  const splash = [{ on: 'touch', with: 'h2o', then: [{ act: 'effect', sprite: 'ripple', at: 'other' }, { act: 'add', path: 'self.dips' }] },
    { on: 'untouch', with: 'h2o', then: [{ act: 'add', path: 'self.outs' }] },
    { on: 'touch', then: [{ act: 'add', path: 'self.anyTouches' }] }];
  const fx = (w) => w.active().ents.filter((e) => !e.dead && e.tags.has('effect'));
  const c = build(splash), r = S.check(c);
  ok(r.errors.length === 0, 'a touch rule "with" a tile tag is valid', r.errors);
  const { world: w } = DC2.boot(c, { seed: 1 }), p = w.player();
  idle(w, 5);
  ok(p.v.dips === 0 && fx(w).length === 0, 'on grass: no splash');
  for (let i = 0; i < 200 && p.v.dips === 0; i++) w.step([{ right: true }]);
  ok(p.v.dips === 1, 'stepping onto the tagged tile fires the touch rule', p.v);
  const e0 = fx(w)[0];
  ok(e0 && Math.abs(e0.c.pos.x - 88) < 0.01 && Math.abs(e0.c.pos.y - 56) < 0.01, 'and "other" is that tile: the effect lands at the middle of the tile (88, 56)', e0 && e0.c.pos);
  for (let i = 0; i < 400 && p.c.pos.x < 152; i++) w.step([{ right: true }]);
  ok(p.v.dips === 4, 'walking across four water tiles: one touch for each tile stepped on', p.v.dips);
  for (let i = 0; i < 100; i++) w.step([{ right: true }]); idle(w, 2);
  ok(p.v.outs === 4, 'and one untouch as each is left behind', p.v.outs);
  ok(p.v.anyTouches === 0, 'a plain touch rule (no "with") never fires for tiles, only for things', p.v.anyTouches);
  ok(w.errors.length === 0, 'no runtime errors', w.errors);
  const none = DC2.boot(build(splash, null), { seed: 1 }).world, pn = none.player();
  for (let i = 0; i < 300; i++) none.step([{ right: true }]);
  ok(pn.v.dips === 0, 'a tile with no tags is not touchable', pn.v.dips);
  const other = DC2.boot(build(splash, 'lava'), { seed: 1 }).world, po = other.player();
  for (let i = 0; i < 300; i++) other.step([{ right: true }]);
  ok(po.v.dips === 0, 'a different tag does not match', po.v.dips);
  const start = build(splash); start.maps.pond.objects[0].x = 88; start.maps.pond.objects[0].y = 56;
  const s2 = DC2.boot(start, { seed: 1 }).world; idle(s2, 5);
  ok(s2.player().v.dips === 0, 'starting inside the water is not a new touch', s2.player().v.dips);
  const del = build([{ on: 'touch', with: 'h2o', then: [{ act: 'destroy', target: 'other' }, { act: 'set', path: 'self.swimming', to: true }] }]);
  const d2 = DC2.boot(del, { seed: 1 }).world; for (let i = 0; i < 200; i++) d2.step([{ right: true }]);
  ok(d2.player().v.swimming === true && d2.errors.length === 0, 'acting on "other" when it is a tile is harmless', d2.errors);
  const wall = build([{ on: 'touch', with: 'brick', then: [{ act: 'add', path: 'self.dips' }] }]); wall.tilesets.world.tiles[3].tags = ['brick'];
  const w3 = DC2.boot(wall, { seed: 1 }).world; for (let i = 0; i < 200; i++) w3.step([{ left: true }]);
  ok(w3.player().v.dips >= 1, 'a solid tagged tile (a wall you walk into) can be touched too', w3.player().v.dips);
  const ent = build([{ on: 'touch', with: 'crate', then: [{ act: 'add', path: 'self.dips' }] }]);
  ent.prefabs.crate = { tags: ['crate'], c: { pos: {}, body: { w: 10, h: 10, solid: false, sensor: true } } }; ent.maps.pond.objects.push({ prefab: 'crate', x: 40, y: 56 + 40 });
  const w4 = DC2.boot(ent, { seed: 1 }).world; w4.player().c.pos.y = 96; for (let i = 0; i < 5; i++) w4.step([{}]);
  ok(w4.player().v.dips === 1, 'touching an ordinary thing with the tag still works exactly as before', w4.player().v.dips);
}

section('8. tiles choose which animation they play');
{
  const c = swimCart();
  ok(DC2.tileAnimName(c, 'world', 2) === 'idle', 'default: idle');
  c.sprites.water.anims.flow = { f: [1, 0], fps: 2 };
  ok(DC2.tileAnimName(c, 'world', 2) === 'idle' && DC2.tileArt(c, 'world', 2, 0).frame === 0, 'other animations do nothing until chosen');
  c.tilesets.world.tiles[2].anim = 'flow';
  ok(DC2.tileAnimName(c, 'world', 2) === 'flow' && DC2.tileArt(c, 'world', 2, 0).frame === 1 && DC2.tileArt(c, 'world', 2, 0.6).frame === 0, 'a chosen animation plays (frames 1 then 0)');
  ok(S.check(c).errors.length === 0, 'and validates');
  c.tilesets.world.tiles[2].anim = 'flwo';
  ok(S.check(c).errors.some((e) => /no animation "flwo".*flow/.test(e.msg)), 'a misspelt animation is an error with a suggestion', S.check(c).errors.map((e) => e.msg));
  delete c.tilesets.world.tiles[2].anim; delete c.sprites.water.anims.idle;
  ok(DC2.tileAnimName(c, 'world', 2) === 'flow', 'with no idle, the first animation plays (so any animation you add works)');
  c.sprites.water.anims = {};
  ok(DC2.tileAnimName(c, 'world', 2) === null && DC2.tileArt(c, 'world', 2, 5).frame === 0, 'no animations: frame 0, no crash');
  const T = S.allTags(swimCart());
  ok(T.tiles.length === 1 && T.tiles[0].tag === 'water' && T.tiles[0].by[0].name === 'water' && T.things.some((x) => x.tag === 'player'), 'the tag list covers things and tiles', T);
  const doc = new S.Doc(swimCart()), SP = S.sprite;
  doc.set(['sprites', 'water', 'anims', 'flow'], { f: [1, 0], fps: 3 });
  const n0 = doc.cart.sprites.water.frames.length, u0 = doc.undos.length, idx = SP.appendFrame(doc, 'water', 0);
  ok(idx === n0 && doc.cart.sprites.water.frames.length === n0 + 1 && doc.cart.sprites.water.frames[idx] === doc.cart.sprites.water.frames[0], 'append adds a copy at the end');
  ok(JSON.stringify(doc.cart.sprites.water.anims.flow.f) === '[1,0]' && JSON.stringify(doc.cart.sprites.water.anims.idle.f) === '[0,1]', 'and does not renumber existing animations');
  ok(doc.undos.length === u0 + 1, 'one undo step');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
