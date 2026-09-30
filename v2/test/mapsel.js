/* Map selections: box, wand, edge, fill, copy/paste/flip, move, sprinkle, frame.  node v2/test/mapsel.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../studio/core.js'); require('../studio/starters.js');
const S = DC2.studio, M = S.map, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const GRASS = 1, TREE = 2, STONE = 3, WATER = 4;

/* a 10x8 level. ground: grass with a 3x3 pond at (2..4, 2..4) and a second lone water tile at (8,6).
   props: trees at (1,1), (6,1), (6,2) [touching pair], (9,7). */
function level() {
  const cart = S.clone(ST.topdown.cart), W = 10, H = 8, g = new Array(W * H).fill(GRASS), p = new Array(W * H).fill(0);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) g[y * W + x] = WATER;
  g[6 * W + 8] = WATER;
  for (const [x, y] of [[1, 1], [6, 1], [6, 2], [9, 7]]) p[y * W + x] = TREE;
  cart.maps.t = { w: W, h: H, tileset: 'world', layers: [{ name: 'ground', rows: DC2.encodeRows(g, W, H) }, { name: 'props', rows: DC2.encodeRows(p, W, H) }], objects: [] };
  return new S.Doc(cart);
}
const ids = (doc, li) => M.layerIds(doc.cart, 't', li);
const at = (doc, li, x, y) => ids(doc, li)[y * 10 + x];
const rowsOf = (doc) => JSON.stringify(doc.cart.maps.t.layers);
const m = (doc) => doc.cart.maps.t;

section('1. box selections and combining');
{
  const d = level(), mp = m(d);
  ok(M.selRect(mp, 1, 1, 3, 2).size === 6, 'a 3x2 box selects 6 cells');
  ok(M.selRect(mp, 3, 2, 1, 1).size === 6, 'dragging up-and-left gives the same box');
  ok(M.selRect(mp, -5, -5, 2, 2).size === 9, 'a box hanging off the level is clipped to it');
  const a = M.selRect(mp, 0, 0, 2, 2), b = M.selRect(mp, 2, 2, 4, 4);
  ok(M.selCombine(a, b, 'new').size === 9 && !M.selCombine(a, b, 'new').has(0), 'New replaces');
  ok(M.selCombine(a, b, 'add').size === 17, 'Add joins (9 + 9 - 1 overlap)');
  ok(M.selCombine(a, b, 'sub').size === 8 && !M.selCombine(a, b, 'sub').has(2 * 10 + 2), 'Remove takes the overlap out');
  ok(M.selCombine(null, b, 'add').size === 9 && M.selCombine(null, b, 'sub').size === 0, 'Add / Remove work with nothing selected yet');
  ok(M.selAll(mp).size === 80, 'Select all = every cell');
  ok(M.selInvert(mp, a).size === 71 && !M.selInvert(mp, a).has(0), 'Invert flips it');
  ok(JSON.stringify(M.selBounds(mp, b)) === '{"x":2,"y":2,"w":3,"h":3}' && M.selBounds(mp, new Set()) === null, 'bounds');
}

section('2. the wand: every cell of the same tile, or just the touching patch');
{
  const d = level(), cart = d.cart;
  ok(M.selSame(cart, 't', 0, 0, 0).size === 80 - 9 - 1, 'wand on grass: every grass cell in the level (70)');
  const w = M.selSame(cart, 't', 0, 3, 3);
  ok(w.size === 10 && w.has(6 * 10 + 8) && w.has(2 * 10 + 2), 'wand on water: the pond AND the far-away water tile (10)');
  const c = M.selConnected(cart, 't', 0, 3, 3);
  ok(c.size === 9 && !c.has(6 * 10 + 8), 'connected: only the pond (9), not the lone tile');
  ok(M.selSame(cart, 't', 1, 0, 0).size === 76, 'wand on empty: every empty cell of the layer (76)');
  ok(M.selSame(cart, 't', 1, 1, 1).size === 4, 'wand on a tree (props layer): all 4 trees');
  ok(M.selConnected(cart, 't', 1, 6, 1).size === 2, 'connected trees: the touching pair');
  ok(M.findTile(cart, 't', 1, 0, 0).li === 0 && M.findTile(cart, 't', 1, 0, 0).id === GRASS, 'on the props layer, an empty cell finds the grass beneath (and its layer)');
  ok(M.findTile(cart, 't', 1, 1, 1).li === 1 && M.findTile(cart, 't', 1, 1, 1).id === TREE, 'a tree is found on its own layer');
  ok(M.findTile(cart, 't', 0, 1, 1).id === GRASS, 'from the ground layer the ground wins');
  ok(M.findTile(cart, 't', 0, -3, 2).id === 0, 'outside the level: nothing');
  const empty = level(); M.fillSel(empty, 't', [0, 1], M.selAll(m(empty)), 0);
  ok(M.findTile(empty.cart, 't', 1, 4, 4).id === 0, 'a cell empty on every layer: id 0');
}

section('3. fill, delete, edge');
{
  const d = level(), pond = M.selConnected(d.cart, 't', 0, 3, 3);
  const before = rowsOf(d), u0 = d.undos.length;
  const n = M.fillSel(d, 't', [0], pond, STONE);
  ok(n === 9 && at(d, 0, 3, 3) === STONE && at(d, 0, 8, 6) === WATER, 'fill paints the selection only (9 cells)', n);
  ok(d.undos.length === u0 + 1, 'and is one undo step');
  d.undo(); ok(rowsOf(d) === before, 'undo restores everything exactly');
  M.fillSel(d, 't', [0], M.selSame(d.cart, 't', 0, 3, 3), GRASS);
  ok(M.selSame(d.cart, 't', 0, 0, 0).size === 80, 'wand + fill = replace a tile everywhere (all water became grass)');
  const t = level(); M.fillSel(t, 't', [1], M.selSame(t.cart, 't', 1, 1, 1), 0);
  ok(ids(t, 1).every((v) => v === 0) && ids(t, 0).filter((v) => v === WATER).length === 10, 'delete clears just the chosen layer');
  const both = level(); M.fillSel(both, 't', [0, 1], M.selRect(m(both), 0, 0, 9, 7), 0);
  ok(ids(both, 0).every((v) => v === 0) && ids(both, 1).every((v) => v === 0), 'delete on both layers clears both');
  ok(M.fillSel(level(), 't', [0], M.selRect(m(level()), 0, 0, 0, 0), GRASS) === 0, 'filling with what is already there changes nothing');
  const e = M.selEdge(m(d), M.selRect(m(d), 2, 2, 4, 4));
  ok(e.size === 8 && !e.has(3 * 10 + 3), 'edge of a 3x3 = its 8 border cells, not the middle');
  ok(M.selEdge(m(d), M.selRect(m(d), 0, 0, 1, 1)).size === 4, 'a 2x2 in the corner: all 4 are edge (the level border counts)');
  ok(M.selEdge(m(d), M.selRect(m(d), 4, 4, 4, 4)).size === 1, 'a single cell is its own edge');
}

section('4. copy, paste, flip');
{
  const d = level(), cart = d.cart;
  const trees = M.selSame(cart, 't', 1, 1, 1), clip = M.copy(cart, 't', trees, [1], false);
  ok(clip.w === 9 && clip.h === 7 && clip.layers.length === 1 && !clip.abs, 'copy of scattered trees is their bounding box (9x7), one layer, follows the current layer');
  ok(clip.layers[0].ids.filter((v) => v === TREE).length === 4 && clip.layers[0].ids.filter((v) => v === -1).length === 63 - 4, 'unselected cells are marked -1 (not copied)');
  const pond = M.copy(cart, 't', M.selRect(m(d), 2, 2, 4, 4), [0, 1], true);
  ok(pond.abs && pond.layers.length === 2, 'copying several layers keeps them as separate layers');
  const blk = M.copy(cart, 't', M.selRect(m(d), 5, 0, 7, 2), [1], false);   // has 2 trees and 7 empties
  const t = level(); const n = M.paste(t, 't', blk, 0, 4, 1);
  ok(n === 2 && at(t, 1, 1, 5) === TREE && at(t, 1, 1, 4) === 0 && at(t, 1, 0, 4) === 0, 'paste puts down the trees and leaves empties alone', n);
  const over = level(); M.setCells(over, 't', 1, [{ x: 0, y: 4, id: STONE }], 'x');
  M.paste(over, 't', blk, 0, 4, 1);
  ok(at(over, 1, 0, 4) === STONE, 'an empty cell in the copy does not erase what is already there');
  const clipped = level(); M.setCells(clipped, 't', 1, [{ x: 9, y: 7, id: 0 }], 'x');
  ok(M.paste(clipped, 't', blk, 8, 6, 1) === 1 && at(clipped, 1, 9, 7) === TREE, 'pasting so one of the two trees falls off the level keeps the one that fits');
  const edge = level(); M.paste(edge, 't', pond, 8, 6, 0);
  ok(at(edge, 0, 9, 7) === WATER && S.check(edge.cart).errors.length === 0, 'and keeps the part that fits', S.check(edge.cart).errors);
  const g = level(); M.paste(g, 't', M.copy(g.cart, 't', M.selRect(m(g), 2, 2, 4, 4), [0], false), 0, 0, 1);
  ok(at(g, 1, 0, 0) === WATER && at(g, 0, 0, 0) === GRASS, 'a single-layer copy lands on whichever layer is current (props)');
  const both = level(); M.paste(both, 't', pond, 5, 4, 1);
  ok(at(both, 0, 6, 5) === WATER && at(both, 1, 6, 5) === 0, 'a multi-layer copy lands on the layers it came from, not the current one');
  const L = { tileset: 'world', w: 3, h: 2, abs: false, layers: [{ li: 0, ids: [1, 2, 3, 4, 5, 6] }] };
  ok(M.clipFlipH(L).layers[0].ids.join() === '3,2,1,6,5,4' && M.clipFlipV(L).layers[0].ids.join() === '4,5,6,1,2,3', 'flip left-right and upside-down');
  ok(M.clipFlipH(M.clipFlipH(L)).layers[0].ids.join() === L.layers[0].ids.join(), 'flipping twice is the identity');
  let msg = ''; try { M.paste(level(), 't', Object.assign({}, blk, { tileset: 'other' }), 0, 0, 1); } catch (e) { msg = e.message; }
  ok(/different set of tiles/.test(msg), 'pasting from a level with other tiles says why not', msg);
  const cc = M.clipCells(m(d), blk, 1, 1);
  ok(cc.size === 9 && cc.has(1 * 10 + 1), 'the cells a clipboard covers (for the new selection after placing)');
}

section('5. move');
{
  const d = level(), before = rowsOf(d), pond = M.selConnected(d.cart, 't', 0, 3, 3), u0 = d.undos.length;
  const n = M.moveSel(d, 't', pond, [0], 3, 3);
  const cellsNow = (t) => { const out = []; ids(d, 0).forEach((v, i) => { if (v === t) out.push([i % 10, Math.floor(i / 10)].join()); }); return out.sort().join(' '); };
  ok(n === 9 && cellsNow(WATER) === ['5,5', '5,6', '5,7', '6,5', '6,6', '6,7', '7,5', '7,6', '7,7', '8,6'].sort().join(' '), 'the pond now covers columns 5-7, rows 5-7 (the far tile is untouched)', cellsNow(WATER));
  ok([[2, 2], [3, 3], [4, 4], [2, 4]].every(([x, y]) => at(d, 0, x, y) === 0), 'and where it was is empty: moving takes it away, it does not copy');
  ok(d.undos.length === u0 + 1, 'one undo step');
  d.undo(); ok(rowsOf(d) === before, 'undo puts everything back exactly');
  const o = level(); M.moveSel(o, 't', M.selRect(m(o), 2, 2, 4, 4), [0], 1, 0);
  ok(at(o, 0, 2, 2) === 0 && at(o, 0, 3, 2) === WATER && at(o, 0, 5, 4) === WATER, 'an overlapping move (1 right) works: no smearing');
  const lift = level(), sel = M.selRect(m(lift), 2, 2, 4, 4), clip = M.copy(lift.cart, 't', sel, [0], true);
  const u1 = lift.undos.length; M.placeFloat(lift, 't', { clip, x: 5, y: 4, lift: { sel, lis: [0] } }, 0);
  const viaMove = level(); M.moveSel(viaMove, 't', sel, [0], 3, 2);
  ok(rowsOf(lift) === rowsOf(viaMove) && lift.undos.length === u1 + 1, 'placing a lifted float = the same result as a move, one undo step');
  const cp = level(); M.placeFloat(cp, 't', { clip, x: 5, y: 4, lift: null }, 0);
  ok(at(cp, 0, 3, 3) === WATER && at(cp, 0, 6, 5) === WATER, 'placing an ordinary paste keeps the original');
  ok(S.check(lift.cart).errors.length === 0, 'the level is still valid');
}

section('6. sprinkle and frame');
{
  const d = level(), sel = M.selAll(m(d));
  ok(M.sprinkle(d, 't', [1], sel, STONE, 0, 5) === 0, 'sprinkle at 0% places nothing');
  const all = level(); ok(M.sprinkle(all, 't', [1], M.selRect(m(all), 0, 3, 9, 3), STONE, 1, 5) === 10, 'at 100% fills the selection (10 cells)');
  const a = level(), b = level(), c = level();
  const na = M.sprinkle(a, 't', [1], sel, STONE, 0.25, 7), nb = M.sprinkle(b, 't', [1], sel, STONE, 0.25, 7), nc = M.sprinkle(c, 't', [1], sel, STONE, 0.25, 8);
  ok(na === nb && rowsOf(a) === rowsOf(b), 'the same seed gives the same scatter');
  ok(rowsOf(a) !== rowsOf(c), 'a different seed gives a different one');
  ok(na >= 8 && na <= 32, '25% of 80 cells is roughly 20', na);
  const u = level(), u0 = u.undos.length; M.sprinkle(u, 't', [1], sel, STONE, 0.5, 3); ok(u.undos.length === u0 + 1, 'sprinkle is one undo step');
  ok(M.frame(1, 1, 4, 3).length === 10 && M.frame(2, 2, 2, 2).length === 1 && M.frame(0, 0, 5, 0).length === 6, 'frame: the border of a box (a 4x3 has 10; a line is a line)');
  ok(new Set(M.frame(0, 0, 3, 3).map((c) => c.join())).size === 12, 'a 4x4 frame has 12 distinct cells');
}

section('7. setCells');
{
  const d = level(), u0 = d.undos.length;
  ok(M.setCells(d, 't', 0, [{ x: 0, y: 0, id: STONE }, { x: 0, y: 0, id: TREE }, { x: 99, y: 0, id: STONE }], 'x') === 1 && at(d, 0, 0, 0) === TREE, 'the last value for a cell wins, cells outside the level are ignored');
  ok(d.undos.length === u0 + 1, 'one command');
  ok(M.setCells(d, 't', 9, [{ x: 0, y: 0, id: 1 }], 'x') === 0, 'a layer that does not exist is ignored');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
