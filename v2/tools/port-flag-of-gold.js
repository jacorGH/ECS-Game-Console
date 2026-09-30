/* Ports Flag of Gold from the v1 demo cart to a v2 cart: the top-down overworld AND the side-view cave.
   Art and map data are converted mechanically (this is the migration path);
   behaviour is rewritten by hand as v2 prefabs and rules (this is the design under test).
   Run:  node v2/tools/port-flag-of-gold.js  */
const fs = require('fs'), path = require('path');
global.window = global; global.DC = {};
require('../../js/core.js'); require('../../js/demo.js'); require('../kernel.js');
const v1 = DC.DEMO_CART, TS = 16;
const enc = (ids, w, h) => DC2.encodeRows(ids, w, h);
const centre = (t) => (t + 0.5) * TS;

/* v1 art is 8x8 drawn at 2x; v2 art is native, so pixel-double it. One string per frame, rows joined with "/" */
const dbl = (rows) => { const out = []; for (const r of rows) { const d = r.split('').map((c) => c + c).join(''); out.push(d, d); } return out.join('/'); };
const spr = (id, anims, extraFrames) => {
  const s = v1.sprites[id];
  if (!s || !s.frames) throw new Error('unexpected sprite ' + id);
  return { w: s.w * 2, h: s.h * 2, palette: 'main', frames: [...s.frames, ...(extraFrames || [])].map(dbl), anims };
};
const one = { idle: { f: [0], fps: 1 } };

/* ---- sprites (converted) */
const sprites = {
  hero: spr('hero', { idle: { f: [0], fps: 1 }, walk: { f: [0, 1], fps: 8 }, idle_up: { f: [3], fps: 1 }, walk_up: { f: [3, 4], fps: 8 }, attack: { f: [2], fps: 1 }, jump: { f: [2], fps: 1 } }),
  slime: spr('slime', { idle: { f: [0, 1], fps: 3 } }),
  bat: spr('bat', { idle: { f: [0, 1], fps: 6 } }),
  coin: spr('coin', { idle: { f: [0, 1], fps: 5 } }),
  elder: spr('elder', one), slash: spr('slash', one), door: spr('door', one),
  flag: spr('flag', { idle: { f: [0, 1], fps: 4 } }),
  brick: spr('brick', one), spikes: spr('spikes', one), lift: spr('lift', one),
  qblock: spr('qblock', { idle: { f: [0, 1], fps: 3 }, used: { f: [2], fps: 1 } }, v1.sprites.used.frames),
};
/* one sheet holds every tile; tile number = frame + 1 */
const grass = ['aaaaaaaa', 'aa9aaaaa', 'aaaaaa9a', 'aaaaaaaa', 'a9aaaaaa', 'aaaa9aaa', 'aaaaaaaa', 'aaaaaa9a'];
const sheet = [grass, v1.sprites.tree.frames[0], v1.sprites.stone.frames[0], v1.sprites.water.frames[0], v1.sprites.flower.frames[0], v1.sprites.plat.frames[0]];
sprites.tiles = { w: 16, h: 16, palette: 'main', frames: sheet.map(dbl) };
const T = { grass: 1, tree: 2, stone: 3, water: 4, flower: 5, plat: 6 };
const tilesets = { world: { tileSize: TS, sprite: 'tiles', tiles: { 2: { name: 'tree', solid: true }, 3: { name: 'stone', solid: true }, 4: { name: 'water', solid: true }, 6: { name: 'platform', oneway: true } } } };

/* ---- generic v1 character-map -> layers + objects converter */
function convert(rows, tileOf, objectOf, layerNames) {
  const W = rows[0].length, H = rows.length, layers = {}, objects = [];
  layerNames.forEach((n) => (layers[n] = new Array(W * H).fill(0)));
  rows.forEach((row, ty) => [...row].forEach((ch, tx) => {
    const t = tileOf(ch); if (t) layers[t.layer][ty * W + tx] = t.id;
    const o = objectOf(ch, tx, ty); if (o) objects.push(o);
  }));
  return { W, H, layers, objects };
}

/* ---- overworld */
const ow = convert(v1.scenes.overworld.map,
  (c) => ({ T: { layer: 'props', id: T.tree }, W: { layer: 'props', id: T.stone }, '~': { layer: 'props', id: T.water }, ',': { layer: 'decor', id: T.flower } }[c]),
  (c, tx, ty) => { const p = { P: ['hero', 'spawn'], N: ['elder'], S: ['slime'], C: ['coin'], O: ['cave_door'] }[c]; if (!p) return null; const o = { prefab: p[0], x: centre(tx), y: centre(ty) }; if (p[1]) o.name = p[1]; return o; },
  ['decor', 'props']);
ow.objects.push({ name: 'from-cave', x: centre(21), y: centre(4) });
const grassAll = new Array(ow.W * ow.H).fill(T.grass);
const maps = { overworld: { w: ow.W, h: ow.H, tileset: 'world', objects: ow.objects, layers: [
  { name: 'ground', rows: enc(grassAll, ow.W, ow.H) }, { name: 'decor', rows: enc(ow.layers.decor, ow.W, ow.H) }, { name: 'props', rows: enc(ow.layers.props, ow.W, ow.H) }] } };

/* ---- cave (side view). Stone is a collide layer, "=" is a one-way tile; ? # ^ M F V S P C become objects */
const cv = convert(v1.scenes.cave.map,
  (c) => ({ D: { layer: 'walls', id: T.stone }, '=': { layer: 'plats', id: T.plat } }[c]),
  (c, tx, ty) => {
    const p = { P: ['hero_side', 'from-overworld'], C: ['coin'], S: ['walker'], V: ['bat'], M: ['lift'], F: ['flag'], '?': ['qblock'], '#': ['brick'], '^': ['spikes'] }[c];
    if (!p) return null;
    const o = { prefab: p[0], x: centre(tx), y: centre(ty) };
    if (p[1]) o.name = p[1];
    if (c === 'M') o.y = ty * TS + 8;          // the lift is 8 px tall: centre it in its cell
    return o;
  }, ['walls', 'plats']);
maps.cave = { w: cv.W, h: cv.H, tileset: 'world', objects: cv.objects, layers: [{ name: 'plats', rows: enc(cv.layers.plats, cv.W, cv.H) }, { name: 'walls', collide: true, rows: enc(cv.layers.walls, cv.W, cv.H) }] };

/* ---- behaviour: v2 prefabs and rules */
const body = (w, h, extra) => Object.assign({ w, h }, extra || {});
const sensor = { blocked: false, sensor: true };
const swing = { on: 'button', button: 'b', cooldown: 0.3, doc: 'sword', then: [{ act: 'spawn', prefab: 'slash', ahead: 12, attach: true }, { act: 'sound', id: 'sword' }, { act: 'anim', name: 'attack', lock: 0.2 }] };
const onHit = { on: 'hit', then: [{ act: 'sound', id: 'hurt' }, { act: 'haptic', kind: 'heavy' }, { act: 'shake', t: 0.2 }] };
const onDie = { on: 'die', doc: 'survive, heal up, and start again at the overworld spawn point', then: [{ act: 'keepAlive' }, { act: 'set', path: 'self.health.hp', to: 'self.health.max' }, { act: 'goto', scene: 'overworld', at: 'spawn' }] };
const stomp = {
  on: 'touch', with: 'player', doc: 'land on it from above and it takes damage while you bounce; touch it any other way and you take damage',
  then: [{ act: 'if', test: 'other.pos.y < self.pos.y - 2 and other.vel.y > 0',
    then: [{ act: 'damage', target: 'self', amount: 1 }, { act: 'set', path: 'other.vel.y', to: -230 }, { act: 'sound', id: 'stomp' }],
    else: [{ act: 'damage', target: 'other', amount: 1, knockback: 120 }] }],
};
const fromBelow = 'other.pos.y > self.pos.y + 6';
const prefabs = {
  hero: { tags: ['player'], carry: ['health'],
    c: { pos: {}, vel: {}, body: body(10, 8), topdown: { speed: 72 }, sprite: { id: 'hero', oy: -4 }, health: { hp: 6, max: 6, invuln: 1 } },
    rules: [swing, onHit, onDie] },
  hero_side: { tags: ['player'], carry: ['health'], doc: 'the same player, seen from the side: a different prefab in the cave scene',
    c: { pos: {}, vel: {}, body: body(10, 15), gravity: {}, platformer: { speed: 92, jump: 300 }, sprite: { id: 'hero' }, health: { hp: 6, max: 6, invuln: 1 } },
    rules: [swing, onHit, onDie] },
  slash: { doc: 'a short-lived hitbox in front of the player',
    c: { pos: {}, body: body(14, 14, sensor), sprite: { id: 'slash', layer: 1, auto: false, turn: true }, lifetime: { t: 0.16 } },
    rules: [{ on: 'touch', with: 'enemy', then: [{ act: 'damage', target: 'other', amount: 1, knockback: 120 }] }] },
  slime: { tags: ['enemy'],
    c: { pos: {}, vel: {}, body: body(12, 8), ai: { mode: 'wander', speed: 26, range: 70 }, sprite: { id: 'slime', oy: -3 }, health: { hp: 2, max: 2, invuln: 0.5 } },
    rules: [
      { on: 'touch', with: 'player', then: [{ act: 'damage', target: 'other', amount: 1, knockback: 140 }] },
      { on: 'when', if: 'dist(self, player) < 60', doc: 'a state machine is just rules that set ai.mode', then: [{ act: 'set', path: 'self.ai.mode', to: "'chase'" }] },
      { on: 'when', if: 'dist(self, player) > 90', then: [{ act: 'set', path: 'self.ai.mode', to: "'wander'" }] },
      { on: 'die', doc: 'loot is a rule too', then: [{ act: 'add', path: 'kills' }, { act: 'sound', id: 'die' }, { act: 'if', test: 'chance(0.6)', then: [{ act: 'spawn', prefab: 'coin' }] }] },
    ] },
  coin: { doc: 'a pickup is a body plus one rule: no "pickup" component',
    c: { pos: {}, body: body(8, 8, sensor), sprite: { id: 'coin', auto: false } },
    rules: [{ on: 'touch', with: 'player', then: [{ act: 'add', path: 'coins' }, { act: 'sound', id: 'coin' }, { act: 'destroy' }] }] },
  elder: { tags: ['npc'],
    c: { pos: {}, body: body(12, 10, { solid: true }), sprite: { id: 'elder', oy: -3, auto: false } },
    rules: [{ on: 'interact', range: 26, then: [{ act: 'sound', id: 'talk' }, { act: 'if', test: 'flags.metElder',
      then: [{ act: 'say', name: 'Elder', lines: ['Back again? You carry {coins} coins.', 'The cave in the north-east wall hides a flag of gold.'] }],
      else: [{ act: 'say', name: 'Elder', lines: ['Welcome, traveller.', 'A cave lies in the north-east wall.', { text: 'Do you want a hint?', choices: [{ text: 'Yes', then: [{ act: 'say', name: 'Elder', lines: ['Slay slimes for coins.'] }] }, { text: 'No' }] }],
        then: [{ act: 'set', path: 'flags.metElder', to: true }] }] }] }] },
  cave_door: { doc: 'a door is a sensor plus one rule: no "warp" component',
    c: { pos: {}, body: body(12, 12, sensor), sprite: { id: 'door', auto: false } },
    rules: [{ on: 'touch', with: 'player', then: [{ act: 'sound', id: 'door' }, { act: 'goto', scene: 'cave', at: 'from-overworld' }] }] },

  /* ---- the cave: everything a platformer needs beyond gravity and jumping is a rule */
  walker: { tags: ['enemy'],
    c: { pos: {}, vel: {}, body: body(12, 9), gravity: {}, ai: { mode: 'patrol', speed: 24 }, sprite: { id: 'slime', oy: -3 }, health: { hp: 1, max: 1 } },
    rules: [stomp, { on: 'die', then: [{ act: 'add', path: 'kills' }] }] },
  bat: { tags: ['enemy'], doc: 'flies: ai walks it sideways, a mover bobs it up and down',
    c: { pos: {}, vel: {}, body: body(12, 8), ai: { mode: 'patrol', speed: 28 }, mover: { dy: 28, speed: 30 }, sprite: { id: 'bat' }, health: { hp: 1, max: 1 } },
    rules: [stomp, { on: 'die', then: [{ act: 'add', path: 'kills' }] }] },
  brick: { doc: 'a solid block that breaks when you hit it from below',
    c: { pos: {}, body: body(16, 16, { solid: true }), sprite: { id: 'brick', auto: false } },
    rules: [{ on: 'touch', with: 'player', if: fromBelow, then: [{ act: 'sound', id: 'break' }, { act: 'destroy' }] }] },
  qblock: { v: { used: false }, doc: 'pays out once when hit from below',
    c: { pos: {}, body: body(16, 16, { solid: true }), sprite: { id: 'qblock', anim: 'idle', auto: false } },
    rules: [{ on: 'touch', with: 'player', if: 'not self.used and ' + fromBelow, then: [{ act: 'set', path: 'self.used', to: true }, { act: 'add', path: 'coins' }, { act: 'sound', id: 'coin' }, { act: 'anim', name: 'used' }] }] },
  spikes: { c: { pos: {}, body: body(14, 10, Object.assign({ oy: 3 }, sensor)), sprite: { id: 'spikes', auto: false } },
    rules: [{ on: 'touch', with: 'player', then: [{ act: 'damage', target: 'other', amount: 1, knockback: 0 }] }] },
  lift: { doc: 'a moving one-way platform; riders are carried by the mover system',
    c: { pos: {}, body: body(32, 8, { solid: true, oneway: true, blocked: false }), mover: { dx: 64, speed: 28 }, sprite: { id: 'lift', auto: false } } },
  flag: { tags: ['goal'],
    c: { pos: {}, body: body(12, 16, sensor), sprite: { id: 'flag', auto: false } },
    rules: [{ on: 'touch', with: 'player', then: [{ act: 'sound', id: 'win' }, { act: 'say', name: '', lines: ['YOU FOUND THE FLAG!'], then: [{ act: 'goto', scene: 'overworld', at: 'from-cave' }] }] }] },
};
const hud = [{ text: 'COINS {coins}', x: 6, y: 6, color: 8 }, { text: 'HP {player.health.hp}', x: 6, y: 16, color: 27 }];
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const cart = {
  format: 'DCART-2',
  meta: { title: 'Flag of Gold (v2)', author: 'Data Console', width: 256, height: 224, start: 'overworld', player: 'hero', extensions: ['space2d', 'topdown', 'platformer', 'sprite', 'combat', 'ai', 'dialogue'] },
  vars: { coins: 0, kills: 0, flags: { metElder: false } },
  palettes: { main: DC.PALETTE },
  sprites, tilesets, maps, prefabs,
  sounds: pick(v1.sounds, ['sword', 'coin', 'die', 'hurt', 'door', 'talk', 'break', 'stomp', 'win']),
  music: pick(v1.music, ['overworld', 'cave']),
  scenes: { overworld: { map: 'overworld', music: 'overworld', hud }, cave: { map: 'cave', music: 'cave', hud } },
  rules: [],
};
const out = path.join(__dirname, '..', 'carts');
fs.writeFileSync(path.join(out, 'flag-of-gold.json'), JSON.stringify(cart, null, 1));
fs.writeFileSync(path.join(out, 'flag-of-gold.js'), 'window.DC2_CARTS = window.DC2_CARTS || {};\nwindow.DC2_CARTS["flag-of-gold"] = ' + JSON.stringify(cart) + ';\n');
console.log('wrote carts/flag-of-gold.json (' + fs.statSync(path.join(out, 'flag-of-gold.json')).size + ' bytes)');
