/* Studio map view: draws a map and turns touches into edits. All edits go through the Doc, so undo just works. */
(function () {
  'use strict';
  const DC2 = window.DC2, S = DC2.studio, M = S.map;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), GUTTER = 56;   // room on the right for the zoom buttons

  class MapView {
    constructor(canvas, host) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.host = host; this.doc = host.doc;
      this.st = { mapId: null, layer: 0, mode: 'tiles', tool: 'draw', tile: 1, prefab: null, sel: null, showSolid: true, showGrid: true, snap: true, hidden: new Set(),
        cells: null, cellsW: 0, selMode: 'new', wandScope: 'all', allLayers: false, lock: true, float: null, keep: false };
      this.view = { x: 0, y: 0, s: 2 }; this.ptrs = new Map(); this.act = null; this.pinch = null; this.hover = null; this.dpr = window.devicePixelRatio || 1;
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => this._down(e)); canvas.addEventListener('pointermove', (e) => this._move(e));
      canvas.addEventListener('pointerup', (e) => this._up(e)); canvas.addEventListener('pointercancel', (e) => this._up(e));
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.redraw(); });
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = this._pt(e); this._zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      /* animated tiles (water, torches) move in the editor too, but only while this view is showing and idle */
      this.t = 0; this._animTimer = setInterval(() => { if (!this.map || !this.cssW || !this.cv.offsetParent || this.act || this.ptrs.size || !this._hasAnimatedTiles()) return; this.t = performance.now() / 1000; this.redraw(); }, 125);
    }
    _hasAnimatedTiles() {
      const cart = this.doc.cart, tsId = this.map.tileset, tiles = (cart.tilesets[tsId] || {}).tiles || {};
      for (const n in tiles) { const d = tiles[n], name = d && d.sprite && DC2.tileAnimName(cart, tsId, n), an = name && cart.sprites[d.sprite].anims[name]; if (an && an.f.length > 1) return true; }
      return false;
    }
    get map() { return this.doc.cart.maps[this.st.mapId]; }
    get ts() { return this.map ? M.tileSize(this.doc.cart, this.st.mapId) : 16; }
    setMap(id, keepView) { this.st.mapId = id; this.st.layer = clamp(this.st.layer, 0, Math.max(0, (this.map ? this.map.layers.length : 1) - 1)); this.st.sel = null; this.st.cells = null; this.st.float = null; if (!keepView) this.fit(); else this.redraw(); }
    resize() {
      const r = this.cv.parentElement.getBoundingClientRect(); if (!r.width) return;
      this.dpr = window.devicePixelRatio || 1; this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
      this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px'; this.cssW = r.width; this.cssH = r.height;
      if (!this._fitted) this.fit(); else this.redraw();
    }
    /* whole map in view (the ⤢ button) */
    overview() {
      if (!this.map || !this.cssW) { this.redraw(); return; }
      const W = this.cssW - GUTTER, s = clamp(Math.min(W / (this.map.w * this.ts), this.cssH / (this.map.h * this.ts)) * 0.96, 0.5, 8);
      this.view = { s, x: (W - this.map.w * this.ts * s) / 2, y: (this.cssH - this.map.h * this.ts * s) / 2 }; this._fitted = true; this.redraw();
    }
    /* the starting view: tiles big enough to hit with a finger (about 20 px), so a wide level starts at its left edge and you pan */
    fit() {
      if (!this.map || !this.cssW) { this.redraw(); return; }
      const whole = Math.min((this.cssW - GUTTER) / (this.map.w * this.ts), this.cssH / (this.map.h * this.ts)) * 0.96, s = clamp(Math.max(whole, 20 / this.ts), 0.5, 8);
      const pw = this.map.w * this.ts * s, ph = this.map.h * this.ts * s;
      this.view = { s, x: pw <= this.cssW - GUTTER ? (this.cssW - GUTTER - pw) / 2 : 12, y: ph <= this.cssH ? (this.cssH - ph) / 2 : 12 }; this._fitted = true; this.redraw();
    }
    zoom(f) { this._zoomAt(this.cssW / 2, this.cssH / 2, f); }
    _zoomAt(px, py, f) { const v = this.view, s = clamp(v.s * f, 0.5, 10), wx = (px - v.x) / v.s, wy = (py - v.y) / v.s; v.s = s; v.x = px - wx * s; v.y = py - wy * s; this.redraw(); }
    _pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    world(p) { return { x: (p.x - this.view.x) / this.view.s, y: (p.y - this.view.y) / this.view.s }; }
    cell(p) { const w = this.world(p); return [Math.floor(w.x / this.ts), Math.floor(w.y / this.ts)]; }

    /* ---------------------------------------------------------------- selection (tiles) */
    /* the current selection as a Set of cell numbers, or null (dropped if the level's width changed under it) */
    sel() { const st = this.st; if (st.cells && this.map && st.cellsW !== this.map.w) st.cells = null; return st.cells && st.cells.size ? st.cells : null; }
    _setSel(set) { const st = this.st; st.cells = set && set.size ? set : null; st.cellsW = this.map.w; this.redraw(); this.host.onSelChange && this.host.onSelChange(); }
    _lis() { return M.layersFor(this.map, this.st.layer, this.st.allLayers, this.st.hidden); }
    /* drawing tools stay inside the selection while one exists (and "only inside" is on) */
    _mask(cells) { const sel = this.sel(); if (!sel || !this.st.lock) return cells; const w = this.map.w; return cells.filter(([x, y]) => sel.has(y * w + x)); }
    wandAt(c) {
      const st = this.st, cart = this.doc.cart, m = this.map; if (c[0] < 0 || c[1] < 0 || c[0] >= m.w || c[1] >= m.h) return;
      const hit = M.findTile(cart, st.mapId, st.layer, c[0], c[1]), moved = hit.li !== st.layer; st.layer = hit.li;
      const cells = st.wandScope === 'connected' ? M.selConnected(cart, st.mapId, hit.li, c[0], c[1]) : M.selSame(cart, st.mapId, hit.li, c[0], c[1]);
      const nm = hit.id ? ((cart.tilesets[m.tileset].tiles || {})[hit.id] || {}).name || 'tile ' + hit.id : 'empty cells';
      this._setSel(M.selCombine(this.sel(), cells, st.selMode));
      this.host.toast && this.host.toast(`${st.selMode === 'sub' ? 'Removed' : 'Selected'} ${cells.size} × ${nm}` + (moved ? ` (on ${m.layers[hit.li].name})` : ''));
      if (moved) this.host.onToolChange && this.host.onToolChange();
    }
    selAll() { this._setSel(M.selAll(this.map)); }
    selInvert() { this._setSel(M.selInvert(this.map, this.sel())); }
    selClear() { this.st.cells = null; this.st.float = null; this.redraw(); this.host.onSelChange && this.host.onSelChange(); }
    selEdge() { const sel = this.sel(); if (sel) this._setSel(M.selEdge(this.map, sel)); }
    selPaint() { const sel = this.sel(), st = this.st; if (!sel) return; const n = M.fillSel(this.doc, st.mapId, this._lis(), sel, st.tile, st.tile ? 'Fill selection' : 'Delete'); this.host.toast && this.host.toast(n ? `Painted ${n} cell${n > 1 ? 's' : ''}` : 'Nothing to change'); this.redraw(); }
    selDelete() { const sel = this.sel(), st = this.st; if (!sel) return; const n = M.fillSel(this.doc, st.mapId, this._lis(), sel, 0, 'Delete'); this.host.toast && this.host.toast(n ? `Cleared ${n} cell${n > 1 ? 's' : ''}` : 'Nothing there to clear'); this.redraw(); }
    selCopy(cut) {
      const sel = this.sel(), st = this.st; if (!sel) return;
      this.host.setClip(M.copy(this.doc.cart, st.mapId, sel, this._lis(), false));
      if (cut) M.fillSel(this.doc, st.mapId, this._lis(), sel, 0, 'Cut');
      this.host.toast && this.host.toast(cut ? 'Cut. Tap Paste to put it somewhere.' : 'Copied. Tap Paste, in this level or another.'); this.redraw();
    }
    /* Paste: a floating copy at the selection (or the middle of the screen) that you drag, flip, then place */
    selPaste() {
      const clip = this.host.getClip && this.host.getClip(), st = this.st, m = this.map; if (!clip) { this.host.toast && this.host.toast('Copy something first.'); return; }
      if (clip.tileset !== m.tileset) { this.host.toast && this.host.toast('That was copied from a level with a different set of tiles.'); return; }
      const b = M.selBounds(m, this.sel()), mid = this.cell({ x: (this.cssW - GUTTER) / 2, y: this.cssH / 2 });
      const x = b ? b.x : clamp(mid[0] - Math.floor(clip.w / 2), 0, Math.max(0, m.w - clip.w)), y = b ? b.y : clamp(mid[1] - Math.floor(clip.h / 2), 0, Math.max(0, m.h - clip.h));
      st.float = { clip, x, y, lift: null }; st.cells = null; this.redraw(); this.host.onSelChange && this.host.onSelChange();
    }
    /* Move: lift the selection; it only leaves its old place when you tap Place, so cancelling changes nothing */
    selMove() {
      const sel = this.sel(), st = this.st; if (!sel) return; const lis = this._lis(), b = M.selBounds(this.map, sel);
      st.float = { clip: M.copy(this.doc.cart, st.mapId, sel, lis, true), x: b.x, y: b.y, lift: { sel: new Set(sel), lis } }; st.cells = null; this.redraw(); this.host.onSelChange && this.host.onSelChange();
    }
    selSprinkle(density) {
      const sel = this.sel(), st = this.st; if (!sel) return;
      const n = M.sprinkle(this.doc, st.mapId, this._lis(), sel, st.tile, density, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this.host.toast && this.host.toast(n ? `Placed ${n}` : 'Nothing placed'); this.redraw();
    }
    floatFlip(horizontal) { const f = this.st.float; if (!f) return; f.clip = horizontal ? M.clipFlipH(f.clip) : M.clipFlipV(f.clip); this.redraw(); }
    floatPlace() {
      const st = this.st, f = st.float; if (!f) return;
      try { M.placeFloat(this.doc, st.mapId, f, st.layer); } catch (e) { this.host.toast && this.host.toast(e.message); return; }
      if (st.keep) { st.float = { clip: f.clip, x: f.x, y: f.y, lift: null }; st.cells = null; }
      else { st.float = null; st.cells = M.clipCells(this.map, f.clip, f.x, f.y); st.cellsW = this.map.w; if (!st.cells.size) st.cells = null; }
      this.redraw(); this.host.onSelChange && this.host.onSelChange();
    }
    floatCancel() { this.st.float = null; this.redraw(); this.host.onSelChange && this.host.onSelChange(); }

    /* ---------------------------------------------------------------- drawing */
    redraw() {
      const g = this.g, m = this.map, cart = this.doc.cart; if (!this.cssW) return;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.imageSmoothingEnabled = false;
      g.fillStyle = '#1b1830'; g.fillRect(0, 0, this.cssW, this.cssH);
      if (!m) return;
      const v = this.view, ts = this.ts, st = this.st, sprites = this.host.sprites, tsDef = cart.tilesets[m.tileset], defs = tsDef.tiles || {}, art = {}, tileImg = (id) => { if (!(id in art)) { const a = DC2.tileArt(cart, m.tileset, id, this.t || 0); art[id] = a ? sprites.frames(a.sprite)[a.frame] : null; } return art[id]; };
      g.save(); g.translate(v.x, v.y); g.scale(v.s, v.s);
      g.fillStyle = DC2.color(cart, 1); g.fillRect(0, 0, m.w * ts, m.h * ts);
      const x0 = clamp(Math.floor(-v.x / v.s / ts), 0, m.w - 1), x1 = clamp(Math.floor((this.cssW - v.x) / v.s / ts), 0, m.w - 1), y0 = clamp(Math.floor(-v.y / v.s / ts), 0, m.h - 1), y1 = clamp(Math.floor((this.cssH - v.y) / v.s / ts), 0, m.h - 1);
      m.layers.forEach((L, li) => {
        if (st.hidden.has(li)) return;
        g.globalAlpha = st.mode === 'things' || li === st.layer ? 1 : 0.55;
        const lifted = st.float && st.float.lift && st.float.lift.lis.includes(li) ? st.float.lift.sel : null;   // picked up: shown as gone until placed
        for (let y = y0; y <= y1; y++) { const row = L.rows[y]; for (let x = x0; x <= x1; x++) { const id = parseInt(row.substr(x * 2, 2), 36); if (id > 0 && !(lifted && lifted.has(y * m.w + x))) { const im = tileImg(id); if (im) g.drawImage(im, x * ts, y * ts, ts, ts); } } }
      });
      g.globalAlpha = 1;
      if (st.showSolid) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let solid = false, oneway = false;
        m.layers.forEach((L, li) => { if (st.hidden.has(li)) return; const id = parseInt(L.rows[y].substr(x * 2, 2), 36); if (!id) return; if (L.collide || (defs[id] && defs[id].solid)) solid = true; else if (defs[id] && defs[id].oneway) oneway = true; });
        if (solid) { g.fillStyle = 'rgba(255,70,70,0.22)'; g.fillRect(x * ts, y * ts, ts, ts); } else if (oneway) { g.fillStyle = 'rgba(80,230,130,0.45)'; g.fillRect(x * ts, y * ts, ts, Math.max(2, ts / 6)); }
      }
      if (st.showGrid && v.s * ts >= 10) { g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1 / v.s; g.beginPath(); for (let x = x0; x <= x1 + 1; x++) { g.moveTo(x * ts, y0 * ts); g.lineTo(x * ts, (y1 + 1) * ts); } for (let y = y0; y <= y1 + 1; y++) { g.moveTo(x0 * ts, y * ts); g.lineTo((x1 + 1) * ts, y * ts); } g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2 / v.s; g.strokeRect(0, 0, m.w * ts, m.h * ts);
      if (st.mode === 'tiles') this._drawSel(g, m, v, ts, x0, x1, y0, y1, tileImg);
      (m.objects || []).forEach((o, i) => this._drawObject(o, i));
      /* previews */
      const a = this.act;
      if (a && a.type === 'tsel') { const r = M.rect(a.a[0], a.a[1], a.b[0], a.b[1]), xs = r.map((c) => c[0]), ys = r.map((c) => c[1]), rx = Math.min(...xs) * ts, ry = Math.min(...ys) * ts, rw = (Math.max(...xs) - Math.min(...xs) + 1) * ts, rh = (Math.max(...ys) - Math.min(...ys) + 1) * ts; g.fillStyle = st.selMode === 'sub' ? 'rgba(255,90,90,0.25)' : 'rgba(90,170,255,0.25)'; g.fillRect(rx, ry, rw, rh); g.lineWidth = 2 / v.s; g.setLineDash([4 / v.s, 3 / v.s]); g.strokeStyle = '#fff'; g.strokeRect(rx, ry, rw, rh); g.setLineDash([]); }
      if (a && (a.type === 'line' || a.type === 'frame')) { g.fillStyle = 'rgba(255,255,255,0.35)'; for (const [x, y] of a.type === 'line' ? M.line(a.a[0], a.a[1], a.b[0], a.b[1]) : M.frame(a.a[0], a.a[1], a.b[0], a.b[1])) if (x >= 0 && y >= 0 && x < m.w && y < m.h) g.fillRect(x * ts, y * ts, ts, ts); }
      if (a && a.type === 'rect') { const r = M.rect(a.a[0], a.a[1], a.b[0], a.b[1]); g.fillStyle = 'rgba(255,255,255,0.25)'; const xs = r.map((c) => c[0]), ys = r.map((c) => c[1]); g.fillRect(Math.min(...xs) * ts, Math.min(...ys) * ts, (Math.max(...xs) - Math.min(...xs) + 1) * ts, (Math.max(...ys) - Math.min(...ys) + 1) * ts); }
      if (this.hover && st.mode === 'tiles' && st.tool !== 'hand') { g.strokeStyle = '#ffe14a'; g.lineWidth = 2 / v.s; g.strokeRect(this.hover[0] * ts, this.hover[1] * ts, ts, ts); }
      if (st.startAt) { g.fillStyle = '#5cf'; g.beginPath(); g.arc(st.startAt.x, st.startAt.y, 4 / Math.min(v.s, 2), 0, 7); g.fill(); }
      g.restore();
    }
    _drawSel(g, m, v, ts, x0, x1, y0, y1, tileImg) {
      const st = this.st, sel = this.sel();
      if (sel) {
        const path = new Path2D(); g.fillStyle = 'rgba(90,170,255,0.30)';
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * m.w + x; if (!sel.has(i)) continue; g.fillRect(x * ts, y * ts, ts, ts);
          if (x === 0 || !sel.has(i - 1)) { path.moveTo(x * ts, y * ts); path.lineTo(x * ts, (y + 1) * ts); }
          if (x === m.w - 1 || !sel.has(i + 1)) { path.moveTo((x + 1) * ts, y * ts); path.lineTo((x + 1) * ts, (y + 1) * ts); }
          if (y === 0 || !sel.has(i - m.w)) { path.moveTo(x * ts, y * ts); path.lineTo((x + 1) * ts, y * ts); }
          if (y === m.h - 1 || !sel.has(i + m.w)) { path.moveTo(x * ts, (y + 1) * ts); path.lineTo((x + 1) * ts, (y + 1) * ts); }
        }
        g.lineWidth = 3 / v.s; g.strokeStyle = '#000'; g.stroke(path); g.lineWidth = 1.5 / v.s; g.setLineDash([3 / v.s, 3 / v.s]); g.strokeStyle = '#fff'; g.stroke(path); g.setLineDash([]);
      }
      const f = st.float;
      if (f) {
        g.globalAlpha = 0.85;
        for (const L of f.clip.layers) for (let j = 0; j < f.clip.h; j++) for (let i = 0; i < f.clip.w; i++) { const id = L.ids[j * f.clip.w + i]; if (id > 0) { const im = tileImg(id); if (im) g.drawImage(im, (f.x + i) * ts, (f.y + j) * ts, ts, ts); } }
        g.globalAlpha = 1; g.lineWidth = 2 / v.s; g.setLineDash([4 / v.s, 3 / v.s]); g.strokeStyle = '#7cf2ff'; g.strokeRect(f.x * ts, f.y * ts, f.clip.w * ts, f.clip.h * ts); g.setLineDash([]);
      }
    }
    _box(o) {
      const cart = this.doc.cart, pf = o.prefab && cart.prefabs[o.prefab], sp = pf && pf.c && pf.c.sprite, def = sp && cart.sprites[sp.id];
      if (def) return { x: o.x + (sp.ox || 0) - def.w / 2, y: o.y + (sp.oy || 0) - def.h / 2, w: def.w, h: def.h, def, sp };
      const b = pf && pf.c && pf.c.body; if (b) return { x: o.x - (b.w || 12) / 2, y: o.y - (b.h || 12) / 2, w: b.w || 12, h: b.h || 12 };
      return { x: o.x - 6, y: o.y - 6, w: 12, h: 12 };
    }
    _drawObject(o, i) {
      const g = this.g, b = this._box(o), cart = this.doc.cart, sel = this.st.sel === i;
      if (b.def) { const img = this.host.sprites.frames(b.sp.id)[DC2.spriteFrame(b.def, { anim: b.sp.anim || 'idle', t: 0 })]; if (img) g.drawImage(img, b.x, b.y, b.w, b.h); }
      else if (o.prefab) { g.fillStyle = 'rgba(255,120,200,0.5)'; g.fillRect(b.x, b.y, b.w, b.h); }
      else { g.fillStyle = '#5cf'; g.beginPath(); g.moveTo(o.x, o.y - 7); g.lineTo(o.x + 7, o.y); g.lineTo(o.x, o.y + 7); g.lineTo(o.x - 7, o.y); g.closePath(); g.fill(); }
      const pf = o.prefab && cart.prefabs[o.prefab];
      if (this.st.mode === 'things' && pf && (pf.tags || []).includes('player')) { g.fillStyle = '#ffe14a'; g.fillRect(b.x, b.y - 3, 5, 3); }
      if (this.st.mode === 'things' && o.name) { g.fillStyle = '#fff'; g.font = `${Math.max(6, 9 / Math.max(this.view.s, 1))}px sans-serif`; g.textAlign = 'center'; g.fillText(o.name, o.x, b.y + b.h + 8 / Math.max(this.view.s, 1)); }
      if (sel) { g.strokeStyle = '#ffe14a'; g.lineWidth = 2 / this.view.s; g.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2); }
    }
    _hit(p) {
      const w = this.world(p), pad = 6 / this.view.s, objs = this.map.objects || [];
      for (let i = objs.length - 1; i >= 0; i--) { const b = this._box(objs[i]); if (w.x >= b.x - pad && w.x <= b.x + b.w + pad && w.y >= b.y - pad && w.y <= b.y + b.h + pad) return i; }
      return -1;
    }

    /* ------------------------------------------------------------ interaction */
    _down(e) {
      if (!this.map) return; this.cv.setPointerCapture(e.pointerId);
      const p = this._pt(e); this.ptrs.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y });
      if (this.ptrs.size === 2) { this._cancelAct(); const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...this.view } }; return; }
      if (this.ptrs.size > 2) return;
      this._begin(p, e);
    }
    _move(e) {
      const p = this._pt(e), q = this.ptrs.get(e.pointerId);
      if (!q) { if (this.st.mode === 'tiles' && e.pointerType === 'mouse') { this.hover = this.cell(p); this.redraw(); } return; }
      q.x = p.x; q.y = p.y;
      if (this.ptrs.size === 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v0 = this.pinch.v;
        const s = clamp(v0.s * d / this.pinch.d, 0.5, 10), wx = (this.pinch.mx - v0.x) / v0.s, wy = (this.pinch.my - v0.y) / v0.s;
        this.view = { s, x: mx - wx * s, y: my - wy * s }; this.redraw(); return;
      }
      if (this.act) this._drag(p, e);
    }
    _up(e) {
      const q = this.ptrs.get(e.pointerId); if (!q) return; this.ptrs.delete(e.pointerId);
      if (this.pinch) { if (this.ptrs.size < 2) this.pinch = null; return; }
      if (this.act) this._finish(this._pt(e));
    }
    _cancelAct() { if (!this.act) return; if (this.act.grouped) this.doc.end(); this.act = null; this.redraw(); }
    _paintCells(cells, tile) { const n = M.paint(this.doc, this.st.mapId, this.st.layer, this._mask(cells), tile); if (n) this.redraw(); return n; }
    _begin(p) {
      const st = this.st, c = this.cell(p), v = this.view;
      if (st.mode === 'tiles' && st.float && st.tool !== 'hand') {   // a pasted copy is floating: drag it, or tap to jump it there
        const f = st.float, inside = c[0] >= f.x && c[0] < f.x + f.clip.w && c[1] >= f.y && c[1] < f.y + f.clip.h;
        if (!inside) { f.x = c[0] - Math.floor(f.clip.w / 2); f.y = c[1] - Math.floor(f.clip.h / 2); }
        this.act = { type: 'float', a: c, x0: f.x, y0: f.y }; this.redraw(); return;
      }
      if (st.mode === 'tiles') {
        switch (st.tool) {
          case 'draw': case 'erase': this.doc.begin(st.tool === 'draw' ? 'Paint' : 'Erase'); this.act = { type: 'paint', grouped: true, tile: st.tool === 'draw' ? st.tile : 0, last: c }; this._paintCells([c], this.act.tile); break;
          case 'rect': case 'line': case 'frame': case 'tsel': this.act = { type: st.tool, a: c, b: c }; this.redraw(); break;
          case 'wand': this.wandAt(c); break;
          case 'fill': { const tile = st.tile; this.doc.transact('Fill', () => M.paint(this.doc, st.mapId, st.layer, this._mask(M.flood(this.doc.cart, st.mapId, st.layer, c[0], c[1])), tile)); this.redraw(); break; }
          case 'pick': { let id = 0; const L = this.map.layers; for (let li = st.layer, tried = 0; tried < L.length && !id; tried++, li = (li + L.length - 1) % L.length) { const row = L[li].rows[c[1]]; if (row && c[0] >= 0 && c[0] < this.map.w) { id = parseInt(row.substr(c[0] * 2, 2), 36); if (id) st.layer = li; } } if (id) { st.tile = id; st.tool = 'draw'; this.host.onToolChange && this.host.onToolChange(); } break; }
          case 'hand': this.act = { type: 'pan', px: p.x, py: p.y, ox: v.x, oy: v.y }; break;
          default: break;
        }
      } else {
        if (st.tool === 'place') this.act = { type: 'place', p, moved: false };
        else if (st.tool === 'flag') this.act = { type: 'flag' };
        else if (st.tool === 'hand') this.act = { type: 'pan', px: p.x, py: p.y, ox: v.x, oy: v.y };
        else { const i = this._hit(p); st.sel = i >= 0 ? i : null; this.host.onSelect && this.host.onSelect(st.sel); if (i >= 0) { const o = this.map.objects[i], w = this.world(p); this.act = { type: 'drag', i, moved: false, dx: o.x - w.x, dy: o.y - w.y, p }; } this.redraw(); }
      }
    }
    _drag(p) {
      const a = this.act, c = this.cell(p);
      switch (a.type) {
        case 'paint': if (c[0] !== a.last[0] || c[1] !== a.last[1]) { this._paintCells(M.line(a.last[0], a.last[1], c[0], c[1]), a.tile); a.last = c; } break;
        case 'rect': case 'line': case 'frame': case 'tsel': a.b = c; this.redraw(); break;
        case 'float': { const f = this.st.float; if (f) { f.x = a.x0 + c[0] - a.a[0]; f.y = a.y0 + c[1] - a.a[1]; this.redraw(); } break; }
        case 'pan': this.view.x = a.ox + p.x - a.px; this.view.y = a.oy + p.y - a.py; this.redraw(); break;
        case 'place': if (Math.hypot(p.x - a.p.x, p.y - a.p.y) > 8) a.moved = true; break;
        case 'drag': {
          if (!a.moved && Math.hypot(p.x - a.p.x, p.y - a.p.y) < 5) break;
          if (!a.moved) { a.moved = true; this.doc.begin('Move'); a.grouped = true; }
          const w = this.world(p), ts = this.ts; let x = w.x + a.dx, y = w.y + a.dy;
          if (this.st.snap) { x = (Math.round((x - ts / 2) / ts)) * ts + ts / 2; y = (Math.round((y - ts / 2) / ts)) * ts + ts / 2; }
          x = clamp(Math.round(x * 100) / 100, 0, this.map.w * ts); y = clamp(Math.round(y * 100) / 100, 0, this.map.h * ts);
          const o = this.map.objects[a.i]; if (o.x !== x || o.y !== y) { this.doc.set(['maps', this.st.mapId, 'objects', a.i, 'x'], x); this.doc.set(['maps', this.st.mapId, 'objects', a.i, 'y'], y); this.redraw(); }
          break;
        }
        default: break;
      }
    }
    _finish(p) {
      const a = this.act, st = this.st; this.act = null;
      switch (a.type) {
        case 'paint': this.doc.end(); break;
        case 'rect': this.doc.transact('Rectangle', () => M.paint(this.doc, st.mapId, st.layer, this._mask(M.rect(a.a[0], a.a[1], a.b[0], a.b[1])), st.tile)); this.redraw(); break;
        case 'line': this.doc.transact('Line', () => M.paint(this.doc, st.mapId, st.layer, this._mask(M.line(a.a[0], a.a[1], a.b[0], a.b[1])), st.tile)); this.redraw(); break;
        case 'frame': this.doc.transact('Frame', () => M.paint(this.doc, st.mapId, st.layer, this._mask(M.frame(a.a[0], a.a[1], a.b[0], a.b[1])), st.tile)); this.redraw(); break;
        case 'tsel': this._setSel(M.selCombine(this.sel(), M.selRect(this.map, a.a[0], a.a[1], a.b[0], a.b[1]), st.selMode)); break;
        case 'float': this.redraw(); this.host.onSelChange && this.host.onSelChange(); break;
        case 'place': if (!a.moved) this.placeAt(this.world(a.p)); break;
        case 'drag': if (a.moved) this.doc.end(); else this.host.onInspect && this.host.onInspect(a.i); this.redraw(); break;
        case 'flag': { const w = this.world(p); st.startAt = { x: w.x, y: w.y }; this.host.onFlag && this.host.onFlag(st.startAt); this.redraw(); break; }
        default: break;
      }
    }
    placeAt(w) {
      const st = this.st, ts = this.ts; if (!st.prefab) { this.host.toast && this.host.toast('Pick a thing to place first.'); return -1; }
      const cx = clamp(Math.floor(w.x / ts), 0, this.map.w - 1), cy = clamp(Math.floor(w.y / ts), 0, this.map.h - 1);
      const x = st.snap ? (cx + 0.5) * ts : Math.round(w.x), y = st.snap ? (cy + 0.5) * ts : Math.round(w.y);
      const obj = st.prefab === '@marker' ? { name: M.uniqueName(this.map, 'marker'), x, y } : { prefab: st.prefab, x, y };
      const i = M.addObject(this.doc, st.mapId, obj); st.sel = i; this.host.onSelect && this.host.onSelect(i); this.redraw(); return i;
    }
  }
  DC2.MapView = MapView;
})();
