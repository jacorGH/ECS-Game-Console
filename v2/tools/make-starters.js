/* Builds the studio's starter projects from the ported Flag of Gold art, using the studio's own recipes.
   Run: node v2/tools/make-starters.js   (writes v2/studio/starters.js) */
const fs = require('fs'), path = require('path');
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/v1import.js');
const S = DC2.studio, full = require('../carts/flag-of-gold.json');
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k]).map((k) => [k, S.clone(o[k])]));
const enc = (ids, w, h) => DC2.encodeRows(ids, w, h);
const T = { grass: 1, tree: 2, stone: 3, water: 4, flower: 5, plat: 6 };

function base(title, spriteIds) {
  return { format: 'DCART-2', meta: { title, author: '', width: 256, height: 224, start: 'level1', extensions: [] }, vars: { coins: 0, kills: 0 },
    palettes: S.clone(full.palettes), sprites: pick(full.sprites, spriteIds), tilesets: S.clone(full.tilesets), maps: {}, prefabs: {}, scenes: {},
    sounds: pick(full.sounds, ['sword', 'coin', 'die', 'hurt', 'door', 'talk', 'break', 'stomp', 'win']), music: {}, rules: [] };
}
const hud = [{ text: 'COINS {coins}', x: 6, y: 6, color: 8 }, { text: 'HP {player.health.hp}', x: 6, y: 16, color: 27 }];
const at = (tx, ty, ts) => ({ x: (tx + 0.5) * (ts || 16), y: (ty + 0.5) * (ts || 16) });

/* ---- platformer starter */
{
  const cart = base('My Platformer', ['hero', 'slime', 'coin', 'slash', 'door', 'flag', 'brick', 'spikes', 'lift', 'qblock', 'tiles']);
  const W = 32, H = 14, walls = new Array(W * H).fill(0), plats = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) { walls[12 * W + x] = T.stone; walls[13 * W + x] = T.stone; }
  for (let y = 0; y < H; y++) { walls[y * W] = T.stone; walls[y * W + W - 1] = T.stone; }
  for (let x = 15; x < 20; x++) plats[8 * W + x] = T.plat;
  cart.maps.level1 = { w: W, h: H, tileset: 'world', layers: [{ name: 'back', rows: enc(plats, W, H) }, { name: 'walls', collide: true, rows: enc(walls, W, H) }], objects: [] };
  cart.scenes.level1 = { map: 'level1', hud };
  const doc = new S.Doc(cart), names = {};
  for (const id of ['player-side', 'coin', 'walker', 'qblock', 'brick', 'spikes', 'goal', 'lift']) names[id] = S.addRecipe(doc, id);
  const put = (id, tx, ty, name) => cart.maps.level1.objects.push(Object.assign({ prefab: names[id] }, name ? { name } : {}, at(tx, ty)));
  put('player-side', 3, 10, 'start'); put('coin', 7, 9); put('coin', 8, 9); put('walker', 12, 11); put('qblock', 10, 8); put('brick', 11, 8); put('spikes', 22, 11);
  put('coin', 17, 7); put('lift', 24, 9); put('goal', 29, 11);
  fs.writeFileSync(path.join(__dirname, 'starter-platformer.json'), JSON.stringify(cart));
}
/* ---- top-down starter */
{
  const cart = base('My Adventure', ['hero', 'slime', 'coin', 'slash', 'elder', 'door', 'tiles']);
  const W = 24, H = 16, ground = new Array(W * H).fill(T.grass), props = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) { props[x] = T.tree; props[(H - 1) * W + x] = T.tree; }
  for (let y = 0; y < H; y++) { props[y * W] = T.tree; props[y * W + W - 1] = T.tree; }
  for (let y = 6; y < 9; y++) for (let x = 12; x < 15; x++) props[y * W + x] = T.water;
  cart.maps.level1 = { w: W, h: H, tileset: 'world', layers: [{ name: 'ground', rows: enc(ground, W, H) }, { name: 'props', rows: enc(props, W, H) }], objects: [] };
  cart.scenes.level1 = { map: 'level1', hud };
  const doc = new S.Doc(cart), names = {};
  for (const id of ['player-top', 'coin', 'chaser', 'npc']) names[id] = S.addRecipe(doc, id);
  const put = (id, tx, ty, name) => cart.maps.level1.objects.push(Object.assign({ prefab: names[id] }, name ? { name } : {}, at(tx, ty)));
  put('player-top', 3, 3, 'start'); put('npc', 6, 3); put('chaser', 17, 11); put('coin', 9, 10); put('coin', 20, 3); put('coin', 5, 12);
  fs.writeFileSync(path.join(__dirname, 'starter-topdown.json'), JSON.stringify(cart));
}
/* ---- new art for the farm and stealth starters: drawn at 8x8, doubled to the 16px grid like the rest */
const dbl = (rows) => { const out = []; for (const r of rows) { const d = r.split('').map((c) => c + c).join(''); out.push(d, d); } return out.join('/'); };
const art = {
  crop: { frames: [
    ['........', '........', '........', '........', '........', '...66...', '..4444..', '........'],
    ['........', '........', '........', '....a...', '..a.a...', '...aa...', '..4444..', '........'],
    ['........', '...a....', '.a.a.a..', '..aaa...', '...a....', '...a....', '..4444..', '........'],
    ['..a.a...', '...a....', '..555...', '..555...', '...55...', '...5....', '..4444..', '........']],
    anims: { seed: { f: [0], fps: 1 }, sprout: { f: [1], fps: 1 }, grown: { f: [2], fps: 1 }, ripe: { f: [3], fps: 1 }, idle: { f: [0], fps: 1 } } },
  shopkeeper: { frames: [['..rrrr..', '.rrrrrr.', '..7777..', '..0770..', '..7777..', '.llllll.', '.l6ll6l.', '..4..4..']], anims: { idle: { f: [0], fps: 1 } } },
  guard: { frames: [['..mmmm..', '.mmmmmm.', '.m7777m.', '..0770..', '..7777..', '.eeeeee.', 'e.eeee.e', '..p..p..'], ['..mmmm..', '.mmmmmm.', '.m7777m.', '..0770..', '..7777..', '.eeeeee.', 'e.eeee.e', '.p....p.']],
    anims: { idle: { f: [0, 1], fps: 4 } } },
};
const addArt = (cart, ids) => { for (const id of ids) cart.sprites[id] = { w: 16, h: 16, palette: 'main', frames: art[id].frames.map(dbl), anims: S.clone(art[id].anims) }; };
/* two extra tiles on the shared sheet: 7 = tilled soil, 8 = indoor floor */
const extraTiles = (cart) => {
  cart.sprites.tiles = S.clone(full.sprites.tiles);
  cart.sprites.tiles.frames.push(dbl(['44444444', '43444434', '44444444', '44434444', '44444444', '34444443', '44444444', '44443444']));
  cart.sprites.tiles.frames.push(dbl(['pppppppo', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', 'oppppppp']));
  cart.tilesets.world.tiles[7] = { name: 'soil' }; cart.tilesets.world.tiles[8] = { name: 'floor' };
};
const T2 = { soil: 7, floor: 8 };

/* ---- farm starter */
{
  const cart = base('My Farm', ['hero', 'coin', 'slash', 'tiles']);
  extraTiles(cart); addArt(cart, ['crop', 'shopkeeper']);
  const W = 24, H = 16, ground = new Array(W * H).fill(T.grass), props = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) { props[x] = T.tree; props[(H - 1) * W + x] = T.tree; }
  for (let y = 0; y < H; y++) { props[y * W] = T.tree; props[y * W + W - 1] = T.tree; }
  for (let y = 6; y < 11; y++) for (let x = 7; x < 14; x++) ground[y * W + x] = T2.soil;
  for (let y = 10; y < 13; y++) for (let x = 17; x < 21; x++) props[y * W + x] = T.water;
  props[3 * W + 5] = T.flower; props[12 * W + 4] = T.flower;
  cart.maps.level1 = { w: W, h: H, tileset: 'world', layers: [{ name: 'ground', rows: enc(ground, W, H) }, { name: 'props', rows: enc(props, W, H) }], objects: [] };
  const doc = new S.Doc(cart), names = {};
  for (const id of ['player-top', 'clock', 'crop', 'shopkeeper']) names[id] = S.addRecipe(doc, id);
  const pl = cart.prefabs[names['player-top']], crop = names.crop;
  pl.doc = 'the farmer: X plants a seed in front of you, A waters or harvests the crop you face';
  pl.c.inventory = { items: { seed: 3 } };
  pl.rules = pl.rules.filter((r) => r.button !== 'b');   // no sword on a farm
  pl.rules.unshift({ on: 'button', button: 'x', cooldown: 0.3, if: 'self.inventory.items.seed >= 1', doc: 'plant: use up a seed, put a crop in front of you',
    then: [{ act: 'take', item: 'seed', count: 1 }, { act: 'spawn', prefab: crop, ahead: 14 }, { act: 'sound', id: 'coin' }] });
  cart.prefabs[names.clock].tags = ['clock'];
  cart.prefabs[names.clock].c.clock.length = 60;   // one in-game day = one real minute, so crops visibly grow while you play
  const shop = cart.prefabs[names.shopkeeper];
  shop.rules[0].then = [{ act: 'sound', id: 'talk' }, { act: 'say', name: 'Shopkeeper', lines: [{ text: 'Seeds are 3 gold. Carrots sell for 5.', choices: [
    { text: 'Buy seed', if: 'gold >= 3', then: [{ act: 'buy', item: 'seed', count: 1, price: 3 }, { act: 'sound', id: 'coin' }] },
    { text: 'Sell carrot', if: 'other.inventory.items.carrot >= 1', then: [{ act: 'sell', item: 'carrot', count: 1, price: 5 }, { act: 'sound', id: 'coin' }] },
    { text: 'Bye' }] }] }];
  cart.vars.gold = 10;
  cart.scenes.level1 = { map: 'level1', hud: [
    { text: 'DAY {first(\'clock\').clock.day}  {floor(first(\'clock\').clock.hour)}:00', x: 6, y: 6, color: 21 },
    { text: 'GOLD {gold}', x: 6, y: 16, color: 8 },
    { text: 'SEEDS {player.inventory.items.seed or 0}  CARROTS {player.inventory.items.carrot or 0}', x: 6, y: 26, color: 9 }] };
  const put = (id, tx, ty, name, extra) => cart.maps.level1.objects.push(Object.assign({ prefab: names[id] }, name ? { name } : {}, at(tx, ty), extra || {}));
  put('player-top', 4, 8, 'start'); put('clock', 1, 1, 'clock'); put('shopkeeper', 18, 5);
  put('crop', 8, 7, null, { c: { growable: { stage: 3 } } }); put('crop', 10, 7, null, { c: { growable: { stage: 1 } } }); put('crop', 12, 7);
  delete cart.vars.coins; delete cart.vars.kills;
  fs.writeFileSync(path.join(__dirname, 'starter-farm.json'), JSON.stringify(cart));
}
/* ---- stealth starter: slip past the guards to the flag */
{
  const cart = base('My Infiltration', ['hero', 'slash', 'flag', 'tiles']);
  extraTiles(cart); addArt(cart, ['guard']);
  const W = 26, H = 18, floor = new Array(W * H).fill(T2.floor), walls = new Array(W * H).fill(0);
  const wall = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) walls[y * W + x] = T.stone; };
  wall(0, 0, W - 1, 0); wall(0, H - 1, W - 1, H - 1); wall(0, 0, 0, H - 1); wall(W - 1, 0, W - 1, H - 1);
  wall(6, 1, 6, 11); wall(12, 6, 12, 16); wall(18, 1, 18, 11);          // three long walls make a zig-zag
  wall(8, 4, 10, 4); wall(14, 12, 16, 12); wall(20, 8, 22, 8);          // cover to duck behind
  cart.maps.level1 = { w: W, h: H, tileset: 'world', layers: [{ name: 'floor', rows: enc(floor, W, H) }, { name: 'walls', collide: true, rows: enc(walls, W, H) }], objects: [] };
  const doc = new S.Doc(cart), names = {};
  for (const id of ['player-top', 'guard', 'goal']) names[id] = S.addRecipe(doc, id);
  const pl = cart.prefabs[names['player-top']]; pl.rules = pl.rules.filter((r) => r.button !== 'b');   // no sword: you sneak
  pl.doc = 'the infiltrator: no weapon, so stay out of the cones';
  const g = cart.prefabs[names.guard];
  g.rules.push({ on: 'touch', with: 'player', doc: 'caught: start the level again', then: [{ act: 'sound', id: 'hurt' }, { act: 'shake', t: 0.3 }, { act: 'say', name: 'Guard', lines: ['Hey! Stop right there!'], then: [{ act: 'add', path: 'caught' }, { act: 'goto', scene: 'level1' }] }] });
  cart.prefabs[names.goal].rules[0].then = [{ act: 'sound', id: 'win' }, { act: 'say', name: '', lines: ['MISSION COMPLETE', 'Times caught: {caught}'], then: [{ act: 'set', path: 'caught', to: 0 }, { act: 'goto', scene: 'level1' }] }];
  cart.vars = { caught: 0 };
  cart.scenes.level1 = { map: 'level1', hud: [{ text: 'REACH THE FLAG', x: 6, y: 6, color: 21 }, { text: 'CAUGHT {caught}', x: 6, y: 16, color: 27 }] };
  const put = (id, tx, ty, name, extra) => cart.maps.level1.objects.push(Object.assign({ prefab: names[id] }, name ? { name } : {}, at(tx, ty), extra || {}));
  put('player-top', 2, 15, 'start');
  put('guard', 3, 3, null, { c: { ai: { mode: 'patrol', axis: 'y', speed: 22 } } });                 // walks up and down the first corridor
  put('guard', 8, 8, null, { c: { ai: { mode: 'idle' }, vision: { dir: 'down', fov: 60 } } });      // stands still: hug the right-hand wall to slip past
  put('guard', 15, 3, null, { c: { ai: { mode: 'patrol', speed: 22 } } });                            // walks left and right
  put('guard', 23, 14, null, { c: { ai: { mode: 'idle' }, vision: { dir: 'up', fov: 60, range: 100 } } });   // sentry by the flag: go round it
  put('goal', 23, 3);
  fs.writeFileSync(path.join(__dirname, 'starter-stealth.json'), JSON.stringify(cart));
}
const starters = {
  platformer: { title: 'Platformer', doc: 'A small side-view level: run, jump, stomp, collect. Everything is already placed so you can play it right away.', cart: require('./starter-platformer.json') },
  topdown: { title: 'Top-down adventure', doc: 'A small overworld: walk, talk, fight a slime, collect coins.', cart: require('./starter-topdown.json') },
  farm: { title: 'Farm', doc: 'Plant seeds (X), water them (A), harvest when ripe, sell carrots to the shopkeeper. Days pass in real time.', cart: require('./starter-farm.json') },
  stealth: { title: 'Stealth', doc: 'Sneak past guards to reach the flag. Stay out of their vision cones and duck behind walls.', cart: require('./starter-stealth.json') },
  'flag-of-gold': { title: 'Flag of Gold (finished game)', doc: 'The complete two-level demo. Look inside to see how a whole game is put together.', cart: full },
};
/* every starter ships with one sprite per tile (named, and water tagged so rules can react to it) */
for (const v of Object.values(starters)) {
  v.cart = S.clone(v.cart);
  for (const t of Object.values(v.cart.tilesets)) { t.tiles = t.tiles || {}; for (const [n, nm] of [[1, 'grass'], [5, 'flower']]) t.tiles[n] = Object.assign({ name: nm }, t.tiles[n] || {}); if (t.tiles[4]) t.tiles[4].tags = ['water']; }
  S.splitTileSheet(v.cart);
}
let bad = 0;
for (const [k, v] of Object.entries(starters)) { const r = S.check(v.cart); console.log(k, r.errors.length ? 'ERRORS ' + JSON.stringify(r.errors) : 'ok', 'warnings', r.warnings.length); if (r.errors.length) bad++; }
fs.writeFileSync(path.join(__dirname, '..', 'studio', 'starters.js'), 'window.DC2_STARTERS = ' + JSON.stringify(starters) + ';\n');
for (const f of ['platformer', 'topdown', 'farm', 'stealth']) fs.unlinkSync(path.join(__dirname, 'starter-' + f + '.json'));
process.exit(bad ? 1 : 0);
