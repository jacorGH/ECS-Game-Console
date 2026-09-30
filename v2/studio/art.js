/* Studio art: the Art tab (sprite list) and the full-screen pixel editor. Edits go through the same Doc as everything else. */
(function () {
  'use strict';
  const DC2 = window.DC2, S = DC2.studio, SP = S.sprite, F = DC2.forms, { el, btn } = F, app = window.DC2_STUDIO;
  const $ = (s) => document.querySelector(s), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), GUTTER = 56;
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  /* draw one frame of a sprite into a small canvas (used for the frame strip and previews) */
  function frameCanvas(cart, id, f, size) {
    const d = cart.sprites[id], pal = cart.palettes[d.palette] || [], px = SP.decode(d, f), c = document.createElement('canvas');
    c.width = d.w; c.height = d.h; const g = c.getContext('2d'), img = g.createImageData(d.w, d.h);
    px.forEach((v, i) => { if (v < 0 || !pal[v]) return; const rgb = hexRGB(pal[v]); img.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4); });
    g.putImageData(img, 0, 0);
    if (!size) return c;
    const o = document.createElement('canvas'); o.width = o.height = size; const og = o.getContext('2d'); og.imageSmoothingEnabled = false;
    const k = Math.min(size / d.w, size / d.h), w = d.w * k, h = d.h * k; og.drawImage(c, (size - w) / 2, (size - h) / 2, w, h); return o;
  }

  class SpriteView {
    constructor(canvas, host) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.host = host; this.doc = host.doc; this.ptrs = new Map(); this.act = null; this.pinch = null; this.hover = null;
      this.st = { id: null, frame: 0, tool: 'pencil', color: 1, mirror: false, onion: true, grid: true, sel: null, float: null, ref: null };
      this.view = { x: 0, y: 0, s: 8 }; this.dpr = window.devicePixelRatio || 1; canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => this._down(e)); canvas.addEventListener('pointermove', (e) => this._move(e));
      canvas.addEventListener('pointerup', (e) => this._up(e)); canvas.addEventListener('pointercancel', (e) => this._up(e));
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = this._pt(e); this._zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }
    get def() { return this.doc.cart.sprites[this.st.id]; }
    resize() { const r = this.cv.parentElement.getBoundingClientRect(); if (!r.width) return; this.dpr = window.devicePixelRatio || 1; this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr); this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px'; this.cssW = r.width; this.cssH = r.height; if (!this._fit) this.fit(); else this.redraw(); }
    fit() { const d = this.def; if (!d || !this.cssW) return; const W = this.cssW - GUTTER, s = clamp(Math.floor(Math.min(W / d.w, this.cssH / d.h) * 0.94), 2, 40); this.view = { s, x: (W - d.w * s) / 2, y: (this.cssH - d.h * s) / 2 }; this._fit = true; this.redraw(); }
    zoom(f) { this._zoomAt((this.cssW - GUTTER) / 2, this.cssH / 2, f); }
    _zoomAt(px, py, f) { const v = this.view, s = clamp(v.s * f, 1.5, 60), wx = (px - v.x) / v.s, wy = (py - v.y) / v.s; v.s = s; v.x = px - wx * s; v.y = py - wy * s; this.redraw(); }
    _pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    px(p) { return [Math.floor((p.x - this.view.x) / this.view.s), Math.floor((p.y - this.view.y) / this.view.s)]; }
    redraw() {
      const g = this.g, d = this.def, cart = this.doc.cart; if (!this.cssW || !d) return;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.imageSmoothingEnabled = false; g.fillStyle = '#1b1830'; g.fillRect(0, 0, this.cssW, this.cssH);
      const v = this.view, pal = cart.palettes[d.palette] || [], st = this.st; g.save(); g.translate(v.x, v.y); g.scale(v.s, v.s);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { g.fillStyle = (x + y) % 2 ? '#3a3552' : '#4a4468'; g.fillRect(x, y, 1, 1); }
      const ref = st.ref && cart.sprites[st.ref.id] ? st.ref : null, drawRef = () => { const rd = cart.sprites[ref.id]; g.globalAlpha = ref.ghost ? 0.5 : 1; g.drawImage(frameCanvas(cart, ref.id, clamp(ref.frame, 0, rd.frames.length - 1)), ref.dx, ref.dy); g.globalAlpha = 1; };
      if (ref && !ref.front) drawRef();
      if (st.onion && st.frame > 0) { g.globalAlpha = 0.3; g.drawImage(frameCanvas(cart, st.id, st.frame - 1), 0, 0); g.globalAlpha = 1; }
      g.drawImage(frameCanvas(cart, st.id, st.frame), 0, 0);
      if (ref && ref.front) drawRef();
      if (ref) { const rd = cart.sprites[ref.id]; g.strokeStyle = 'rgba(120,200,255,0.7)'; g.lineWidth = 1 / v.s; g.setLineDash([2 / v.s, 2 / v.s]); g.strokeRect(ref.dx, ref.dy, rd.w, rd.h); g.setLineDash([]); }
      if (st.float) { const f = st.float, c = f.clip; for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const k = c.px[j * c.w + i]; if (k >= 0) { g.fillStyle = pal[k] || '#fff'; g.fillRect(f.x + i, f.y + j, 1, 1); } } }
      const a = this.act;
      if (a && (a.type === 'line' || a.type === 'box')) { g.fillStyle = st.color < 0 ? 'rgba(255,255,255,0.4)' : pal[st.color] || '#fff'; for (const [x, y] of this._shape(a)) g.fillRect(x, y, 1, 1); }
      if (st.grid && v.s >= 6) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1 / v.s; g.beginPath(); for (let x = 0; x <= d.w; x++) { g.moveTo(x, 0); g.lineTo(x, d.h); } for (let y = 0; y <= d.h; y++) { g.moveTo(0, y); g.lineTo(d.w, y); } g.stroke(); }
      if (st.mirror) { g.strokeStyle = '#ffe14a'; g.lineWidth = 2 / v.s; g.setLineDash([3 / v.s, 3 / v.s]); g.beginPath(); g.moveTo(d.w / 2, 0); g.lineTo(d.w / 2, d.h); g.stroke(); g.setLineDash([]); }
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2 / v.s; g.strokeRect(0, 0, d.w, d.h);
      const box = st.float ? { x: st.float.x, y: st.float.y, w: st.float.clip.w, h: st.float.clip.h } : st.sel;
      if (box || (a && a.type === 'sel')) { const r = box || SP.normRect({ w: d.w, h: d.h }, this._selRect(a)); g.lineWidth = 2 / v.s; g.setLineDash([3 / v.s, 3 / v.s]); g.strokeStyle = '#000'; g.strokeRect(r.x, r.y, r.w, r.h); g.lineDashOffset = 3 / v.s; g.strokeStyle = st.float ? '#7cf2ff' : '#fff'; g.strokeRect(r.x, r.y, r.w, r.h); g.setLineDash([]); g.lineDashOffset = 0; }
      if (this.hover && st.tool !== 'pan') { g.strokeStyle = '#ffe14a'; g.lineWidth = 1.5 / v.s; g.strokeRect(this.hover[0], this.hover[1], 1, 1); }
      g.restore();
    }
    _selRect(a) { return { x: Math.min(a.a[0], a.b[0]), y: Math.min(a.a[1], a.b[1]), w: Math.abs(a.b[0] - a.a[0]) + 1, h: Math.abs(a.b[1] - a.a[1]) + 1 }; }
    _inFloat(c) { const f = this.st.float; return f && c[0] >= f.x && c[1] >= f.y && c[0] < f.x + f.clip.w && c[1] < f.y + f.clip.h; }
    _shape(a) { return a.type === 'line' ? S.map.line(a.a[0], a.a[1], a.b[0], a.b[1]) : S.map.rect(a.a[0], a.a[1], a.b[0], a.b[1]); }
    _cells(cells) { if (!this.st.mirror) return cells; const w = this.def.w, out = cells.slice(); for (const [x, y] of cells) out.push([w - 1 - x, y]); return out; }
    _paint(cells, col) { const n = SP.paint(this.doc, this.st.id, this.st.frame, this._cells(cells), col); if (n) this.redraw(); return n; }
    _down(e) {
      if (!this.def) return; this.cv.setPointerCapture(e.pointerId); const p = this._pt(e); this.ptrs.set(e.pointerId, { x: p.x, y: p.y });
      if (this.ptrs.size === 2) { this._cancel(); const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...this.view } }; return; }
      if (this.ptrs.size > 2) return;
      const st = this.st, c = this.px(p);
      switch (st.tool) {
        case 'pencil': case 'erase': { const col = st.tool === 'erase' ? -1 : st.color; this.doc.begin('Draw'); this.act = { type: 'pen', grouped: true, col, last: c }; this._paint([c], col); break; }
        case 'line': case 'box': this.act = { type: st.tool, a: c, b: c }; break;
        case 'fill': this.doc.transact('Fill', () => SP.paint(this.doc, st.id, st.frame, this._cells(SP.flood(this.def, st.frame, c[0], c[1])), st.color)); this.redraw(); break;
        case 'pick': { const d = this.def; if (c[0] >= 0 && c[1] >= 0 && c[0] < d.w && c[1] < d.h) { const v = SP.decode(d, st.frame)[c[1] * d.w + c[0]]; if (v < 0) st.tool = 'erase'; else { st.color = v; st.tool = 'pencil'; } this.host.onTool(); } break; }
        case 'pan': this.act = { type: 'pan', px: p.x, py: p.y, ox: this.view.x, oy: this.view.y }; break;
        case 'select': if (st.float) { this.act = { type: 'float', a: c, x0: st.float.x, y0: st.float.y }; } else { st.sel = null; this.act = { type: 'sel', a: c, b: c }; } break;
        case 'refmove': if (st.ref) this.act = { type: 'ref', a: c, x0: st.ref.dx, y0: st.ref.dy }; break;
        default: break;
      }
    }
    _move(e) {
      const p = this._pt(e), q = this.ptrs.get(e.pointerId);
      if (!q) { if (e.pointerType === 'mouse') { this.hover = this.px(p); this.redraw(); } return; }
      q.x = p.x; q.y = p.y;
      if (this.ptrs.size === 2 && this.pinch) { const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v0 = this.pinch.v, s = clamp(v0.s * d / this.pinch.d, 1.5, 60), wx = (this.pinch.mx - v0.x) / v0.s, wy = (this.pinch.my - v0.y) / v0.s; this.view = { s, x: mx - wx * s, y: my - wy * s }; this.redraw(); return; }
      const a = this.act; if (!a) return; const c = this.px(p);
      if (a.type === 'pen') { if (c[0] !== a.last[0] || c[1] !== a.last[1]) { this._paint(S.map.line(a.last[0], a.last[1], c[0], c[1]), a.col); a.last = c; } }
      else if (a.type === 'line' || a.type === 'box') { a.b = c; this.redraw(); }
      else if (a.type === 'pan') { this.view.x = a.ox + p.x - a.px; this.view.y = a.oy + p.y - a.py; this.redraw(); }
      else if (a.type === 'sel') { a.b = c; this.redraw(); }
      else if (a.type === 'float') { this.st.float.x = a.x0 + c[0] - a.a[0]; this.st.float.y = a.y0 + c[1] - a.a[1]; this.redraw(); }
      else if (a.type === 'ref') { this.st.ref.dx = a.x0 + c[0] - a.a[0]; this.st.ref.dy = a.y0 + c[1] - a.a[1]; this.redraw(); }
    }
    _up(e) {
      if (!this.ptrs.delete(e.pointerId)) return;
      if (this.pinch) { if (this.ptrs.size < 2) this.pinch = null; return; }
      const a = this.act; this.act = null; if (!a) return;
      if (a.type === 'pen') this.doc.end();
      else if (a.type === 'sel') { const r = SP.normRect(this.def, this._selRect(a)); this.st.sel = r.w && r.h ? r : null; this.redraw(); this.host.onTool(); }
      else if (a.type === 'ref') this.host.onTool();
      else if (a.type === 'line' || a.type === 'box') { const cells = this._cells(this._shape(a)); this.doc.transact('Shape', () => SP.paint(this.doc, this.st.id, this.st.frame, cells, this.st.color)); this.redraw(); }
    }
    _cancel() { if (this.act && this.act.grouped) this.doc.end(); this.act = null; this.redraw(); }
  }

  /* ------------------------------------------------------------- app additions */
  Object.assign(app, {
    art: null,
    renderArt() {
      const cart = this.doc.cart, box = $('#spriteGrid'); box.replaceChildren();
      const tiles = S.tileSpriteIds(cart), ids = Object.keys(cart.sprites), card = (id, extra) => { const d = cart.sprites[id]; return el('button', { class: 'thing', type: 'button', 'data-sprite': id, onclick: () => this.openSprite(id) }, this.sprites.thumb(id, 48), el('b', null, id), el('small', null, `${d.w}×${d.h}` + (d.frames.length > 1 ? ` · ${d.frames.length} frames` : '') + (extra || ''))); };
      const tsId = Object.keys(cart.tilesets)[0];
      box.append(el('div', { class: 'art-sec' }, el('h3', null, 'Sprites'), el('small', null, 'characters, items, effects')));
      const sp = ids.filter((id) => !tiles.has(id)); if (!sp.length) box.append(el('div', { class: 'empty' }, 'No sprites yet. Tap “New sprite” or import a PNG.'));
      for (const id of sp) box.append(card(id));
      box.append(el('div', { class: 'art-sec' }, el('h3', null, 'Tiles'), el('small', null, 'what you paint levels with'), tsId ? btn('＋ New tile', () => this.newTile(tsId), 'sm') : null));
      for (const id of ids.filter((i) => tiles.has(i))) { const tl = S.tileOfSprite(cart, id), d = tl && cart.tilesets[tl.tsId].tiles[tl.n]; box.append(card(id, (d && d.solid ? ' · solid' : d && d.oneway ? ' · one-way' : '') + (d && d.tags && d.tags.length ? ' · ' + d.tags.join(', ') : ''))); }
    },
    async newSprite() {
      const s = this.openSheet({ title: 'New sprite', render: (body) => {
        const name = el('input', { type: 'text', class: 'big-in', placeholder: 'Name (e.g. crate)' }), w = el('input', { type: 'number', value: 16, min: 4, max: 64 }), h = el('input', { type: 'number', value: 16, min: 4, max: 64 });
        const go = () => { const W = Math.round(+w.value), H = Math.round(+h.value); if (!(W >= 4 && W <= 64 && H >= 4 && H <= 64)) return this.toast('Size must be between 4 and 64.'); const id = SP.create(this.doc, name.value.trim() || 'sprite', W, H); this.closeSheet(s); this.openSprite(id); };
        body.append(name, el('div', { class: 'two' }, el('div', { class: 'f' }, el('div', { class: 'f-label' }, 'Width'), w), el('div', { class: 'f' }, el('div', { class: 'f-label' }, 'Height'), h)), el('div', { class: 'f-doc' }, 'Things in your games are usually 16×16. Pick 8×8 for small items.'), el('div', { class: 'row-end' }, btn('Create', go, 'primary')));
      } });
    },
    importPng(file) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); this.toast('That file is not a picture I can read.'); };
      img.onload = () => {
        URL.revokeObjectURL(url); const W = img.naturalWidth, H = img.naturalHeight;
        if (H > 64 || W > 64 * 16) return this.toast('Sprites can be at most 64 pixels tall.');
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const data = g.getImageData(0, 0, W, H).data;
        const s = this.openSheet({ title: 'Import picture', render: (body) => {
          const name = el('input', { type: 'text', class: 'big-in', value: file.name.replace(/\.[^.]+$/, '') }), fw = el('input', { type: 'number', value: W % H === 0 ? H : W, min: 4, max: 64 });
          const go = () => {
            const w = Math.round(+fw.value); if (!(w >= 4 && w <= 64) || W % w) return this.toast(`Frame width must be between 4 and 64 and divide ${W} evenly.`);
            const pal = this.doc.cart.palettes[Object.keys(this.doc.cart.palettes)[0]], n = W / w, frames = [];
            for (let i = 0; i < n; i++) { const rgba = new Uint8ClampedArray(w * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) rgba[(y * w + x) * 4 + k] = data[(y * W + i * w + x) * 4 + k]; frames.push(SP.fromRGBA(rgba, w, H, pal)); }
            const id = S.slug(name.value.trim() || 'picture', this.doc.cart.sprites);
            this.doc.set(['sprites', id], { w, h: H, palette: Object.keys(this.doc.cart.palettes)[0], frames, anims: Object.assign({ idle: { f: [0], fps: 1 } }, n > 1 ? { play: { f: frames.map((_, i) => i), fps: 8 } } : {}) }, 'Import picture');
            this.closeSheet(s); this.toast('Colours were matched to your palette.'); this.openSprite(id);
          };
          body.append(name, el('div', { class: 'f' }, el('div', { class: 'f-label' }, 'Width of one frame (pixels)'), fw, el('div', { class: 'f-doc' }, `The picture is ${W}×${H}. A strip of frames side by side is cut into pieces this wide.`)), el('div', { class: 'row-end' }, btn('Import', go, 'primary')));
        } });
      };
      img.src = url;
    },
    openSprite(id) {
      if (!this.doc.cart.sprites[id]) return;
      const ed = $('#artEditor'); ed.hidden = false;
      if (!this.art) {
        this.art = new SpriteView($('#artCanvas'), { doc: this.doc, onTool: () => this.renderArtUI() });
        $('#artBack').onclick = () => this.closeSprite(); $('#artUndo').onclick = () => this.doc.undo(); $('#artRedo').onclick = () => this.doc.redo(); $('#artMore').onclick = () => this.spriteMenu();
        $('#artSave').onclick = async () => { try { await this.saver.flush(); this.toast('Saved.'); } catch (e) { this.toast('Could not save: ' + e.message); } };
        $('#artUse').onclick = () => this.useSprite();
        $('#aZoomIn').onclick = () => this.art.zoom(1.3); $('#aZoomOut').onclick = () => this.art.zoom(1 / 1.3); $('#aFit').onclick = () => this.art.fit();
        $('#aGrid').onclick = () => { this.art.st.grid = !this.art.st.grid; this.renderArtUI(); this.art.redraw(); }; $('#aOnion').onclick = () => { this.art.st.onion = !this.art.st.onion; this.renderArtUI(); this.art.redraw(); }; $('#aMirror').onclick = () => { this.art.st.mirror = !this.art.st.mirror; this.renderArtUI(); this.art.redraw(); };
      }
      this.art.doc = this.doc; this.art.st.id = id; this.art.st.frame = 0; this.art._fit = false; this.art.st.color = Math.min(this.art.st.color, (this.doc.cart.palettes[this.art.def.palette] || []).length - 1);
      this.art.st.sel = null; $('#artName').textContent = id; this.art.resize(); this.art.fit(); this.renderArtUI(); this.updateBar();
    },
    /* ---- quick "use this picture": a new thing, an existing thing's picture, or a tile */
    useSprite() {
      const id = this.art.st.id, cart = this.doc.cart, d = cart.sprites[id], tile = S.tileOfSprite(cart, id), tsId = Object.keys(cart.tilesets)[0], ts = tsId && cart.tilesets[tsId].tileSize;
      const s = this.openSheet({ title: 'Use “' + id + '”', render: (body) => body.append(el('div', { class: 'menu' },
        btn('✨ Make a new thing with this picture', async () => {
          this.closeSheet(s); const name = await this.askText('Name the new thing', id, 'Create'); if (name === null) return;
          await this.saver.flush(); const pid = S.thingFromSprite(this.doc, id, name || id);
          this.closeSprite(); this.setTab('things'); this.openThing(pid); this.toast('Now place it from the Map tab (Things mode).');
        }, 'menu-item'),
        btn('🔁 Give this picture to a thing…', () => {
          this.closeSheet(s);
          this.pick({ title: 'Which thing gets this picture?', items: Object.keys(cart.prefabs).map((pid) => { const sp = (cart.prefabs[pid].c || {}).sprite; return { id: pid, title: pid, thumb: sp && cart.sprites[sp.id] ? sp.id : null, doc: sp ? 'now: ' + sp.id : 'no picture yet' }; }),
            onPick: (pid) => { S.setThingSprite(this.doc, pid, id); this.toast(`“${pid}” now uses ${id}.`); } });
        }, 'menu-item'),
        tile ? el('div', { class: 'f-doc' }, 'This picture is already a tile.') : btn('🧱 Make it a tile' + (ts && (d.w !== ts || d.h !== ts) ? ` (needs to be ${ts}×${ts})` : ''), () => { this.closeSheet(s); try { S.tileFromSprite(this.doc, id, tsId); this.toast('It\'s in the Map palette now.'); this.renderArtUI(); } catch (e) { this.toast(e.message); } }, 'menu-item'),
        el('div', { class: 'f-doc' }, 'To show it as a one-off effect (a splash, a puff of smoke), add the “Effect” action to a rule and pick this picture.'))) });
    },
    /* ---- copy / paste. The clipboard (this.clip) survives switching frames and sprites, so art can move between them. */
    renderClipBar() {
      const a = this.art, st = a.st, bar = $('#artClip'), items = [];
      if (st.float) items.push(el('span', { class: 'clip-l' }, 'Drag to move'), btn('↔', () => { st.float.clip = SP.clipFlipH(st.float.clip); a.redraw(); }, 'chip-btn', 'flip left-right'), btn('↕', () => { st.float.clip = SP.clipFlipV(st.float.clip); a.redraw(); }, 'chip-btn', 'flip upside down'), btn('✓ Place', () => this.artPlace(), 'chip-btn primary'), btn('✕', () => { st.float = null; this.renderArtUI(); a.redraw(); }, 'chip-btn', 'cancel paste'));
      else {
        if (st.sel) items.push(btn('Copy', () => this.artCopy(false), 'chip-btn'), btn('Cut', () => this.artCopy(true), 'chip-btn'), btn('Delete', () => this.artDelete(), 'chip-btn'));
        if (this.clip) items.push(btn('Paste', () => this.artPaste(), 'chip-btn'), btn('Paste as new sprite', () => { const id = SP.fromClip(this.doc, this.art.st.id + ' part', this.clip); this.openSprite(id); this.toast('New sprite “' + id + '”.'); }, 'chip-btn'));
        if (st.sel) items.push(btn('✕', () => { st.sel = null; this.renderArtUI(); a.redraw(); }, 'chip-btn', 'clear selection'));
        if (!items.length && st.tool === 'select') items.push(el('span', { class: 'clip-l' }, 'Drag over the picture to select part of it'));
      }
      bar.replaceChildren(...items); bar.hidden = !items.length;
    },
    artCopy(cut) {
      const a = this.art, st = a.st; if (!st.sel) return;
      this.clip = SP.copy(a.def, st.frame, st.sel);
      if (cut) SP.clearRect(this.doc, st.id, st.frame, st.sel);
      this.toast(cut ? 'Cut. Tap Paste to put it somewhere.' : 'Copied — paste into any frame or sprite.'); this.renderArtUI(); a.redraw();
    },
    artDelete() { const st = this.art.st; if (st.sel) SP.clearRect(this.doc, st.id, st.frame, st.sel); },
    artPaste() {
      const a = this.art, st = a.st; if (!this.clip) return;
      const d = a.def, x = st.sel ? st.sel.x : Math.max(0, Math.floor((d.w - this.clip.w) / 2)), y = st.sel ? st.sel.y : Math.max(0, Math.floor((d.h - this.clip.h) / 2));
      st.float = { clip: { w: this.clip.w, h: this.clip.h, px: this.clip.px.slice() }, x, y }; st.sel = null; st.tool = 'select'; this.renderArtUI(); a.redraw();
    },
    artPlace() {
      const a = this.art, st = a.st, f = st.float; if (!f) return;
      SP.paste(this.doc, st.id, st.frame, f.clip, f.x, f.y);
      st.sel = SP.normRect(a.def, { x: f.x, y: f.y, w: f.clip.w, h: f.clip.h }); if (!st.sel.w || !st.sel.h) st.sel = null; st.float = null; this.renderArtUI(); a.redraw();
    },
    /* ---- show another sprite over or under this one, to see how they look together */
    openRef() {
      const a = this.art, st = a.st, cart = this.doc.cart;
      const s = this.openSheet({ title: 'Show with another sprite', tall: true, render: (body) => {
        const r = st.ref, d = a.def;
        body.append(el('p', { class: 'hint' }, 'See how two sprites look together — a ripple under a swimmer, a hat on a head, a sword in a hand. It\'s only shown here; nothing changes in your game.'));
        if (r && cart.sprites[r.id]) {
          const rd = cart.sprites[r.id];
          body.append(el('div', { class: 'f' }, el('div', { class: 'f-label' }, 'Showing “' + r.id + '”'),
            el('div', { class: 'seg' }, el('button', { type: 'button', class: r.front ? '' : 'on', onclick: () => { r.front = false; this.renderSheet(s); a.redraw(); } }, 'Behind'), el('button', { type: 'button', class: r.front ? 'on' : '', onclick: () => { r.front = true; this.renderSheet(s); a.redraw(); } }, 'In front'), el('button', { type: 'button', class: r.ghost ? 'on' : '', onclick: () => { r.ghost = !r.ghost; this.renderSheet(s); a.redraw(); } }, 'See-through'))),
            rd.frames.length > 1 ? el('div', { class: 'frames' }, ...rd.frames.map((_, fi) => el('button', { class: 'fr' + (r.frame === fi ? ' on' : ''), type: 'button', onclick: () => { r.frame = fi; this.renderSheet(s); a.redraw(); } }, frameCanvas(cart, r.id, fi, 36), el('small', null, String(fi))))) : null,
            el('div', { class: 'f' }, el('div', { class: 'f-label' }, `Position: ${r.dx}, ${r.dy}`), el('div', { class: 'row-end left' },
              ...[['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]].map(([t, x, y]) => btn(t, () => { r.dx += x; r.dy += y; this.renderSheet(s); a.redraw(); }, 'sq')),
              btn('Reset', () => { r.dx = Math.floor((d.w - rd.w) / 2); r.dy = d.h - rd.h; this.renderSheet(s); a.redraw(); }, 'sm'))),
            el('div', { class: 'f-doc' }, 'Or use the 👥 Move tool to drag it on the canvas.'),
            el('div', { class: 'row-end left' }, btn('Stop showing it', () => { st.ref = null; this.closeSheet(s); this.renderArtUI(); a.redraw(); }, 'sm danger')));
        }
        body.append(el('div', { class: 'section-l' }, r ? 'Pick a different one' : 'Pick a sprite'));
        body.append(el('div', { class: 'thinggrid small' }, ...Object.keys(cart.sprites).filter((k) => k !== st.id).map((k) => el('button', { class: 'thing' + (r && r.id === k ? ' on' : ''), type: 'button', 'data-ref': k, onclick: () => {
          const rd = cart.sprites[k]; st.ref = { id: k, frame: 0, dx: Math.floor((d.w - rd.w) / 2), dy: d.h - rd.h, front: r ? r.front : true, ghost: false }; this.renderSheet(s); this.renderArtUI(); a.redraw(); } }, this.sprites.thumb(k, 36), el('small', null, k)))));
      } });
    },
    closeSprite() { $('#artEditor').hidden = true; if (this.art) this.art.st.id = null; this.closeAllSheets(); this.renderArt(); },
    artRefresh() {
      const a = this.art; if (!a || !a.st.id) return;
      if (!this.doc.cart.sprites[a.st.id]) return this.closeSprite();
      a.st.frame = clamp(a.st.frame, 0, a.def.frames.length - 1); this.renderArtUI(); a.redraw();
    },
    renderArtUI() {
      const a = this.art, cart = this.doc.cart, d = a.def, st = a.st, pal = cart.palettes[d.palette] || [];
      $('#artName').textContent = st.id + `  ${d.w}×${d.h}`;
      const tools = [['pencil', '✏️', 'Pencil'], ['line', '╱', 'Line'], ['box', '▭', 'Box'], ['fill', '🪣', 'Fill'], ['erase', '⌫', 'Erase'], ['select', '⬚', 'Select'], ['pick', '💧', 'Pick'], ['pan', '✋', 'Pan'], ...(st.ref ? [['refmove', '👥', 'Move other']] : [])];
      if (st.tool === 'refmove' && !st.ref) st.tool = 'pencil';
      this.renderClipBar();
      $('#aRef').classList.toggle('on', !!st.ref);
      $('#artTools').replaceChildren(...tools.map(([id, ic, lab]) => el('button', { class: 'tool' + (st.tool === id ? ' on' : ''), 'data-tool': id, type: 'button', onclick: () => { st.tool = id; this.renderArtUI(); } }, el('span', null, ic), el('small', null, lab))));
      $('#aGrid').classList.toggle('on', st.grid); $('#aOnion').classList.toggle('on', st.onion); $('#aMirror').classList.toggle('on', st.mirror);
      $('#artPalette').replaceChildren(...pal.map((hx, i) => el('button', { class: 'sw' + (st.color === i && st.tool !== 'erase' ? ' on' : ''), 'data-color': i, type: 'button', style: `background:${hx}`, 'aria-label': 'colour ' + i, onclick: () => { st.color = i; if (st.tool === 'erase' || st.tool === 'pick' || st.tool === 'pan') st.tool = 'pencil'; this.renderArtUI(); } })), btn('Edit colour', () => this.editColor(), 'chip-btn'));
      $('#artFrames').replaceChildren(...d.frames.map((_, f) => { const c = frameCanvas(cart, st.id, f, 40); return el('button', { class: 'fr' + (st.frame === f ? ' on' : ''), 'data-frame': f, type: 'button', onclick: () => { st.frame = f; this.renderArtUI(); a.redraw(); } }, c, el('small', null, String(f))); }),
        btn('＋', () => { st.frame = SP.addFrame(this.doc, st.id, null); }, 'chip-btn', 'blank frame'), btn('⧉', () => { st.frame = SP.addFrame(this.doc, st.id, st.frame); }, 'chip-btn', 'copy this frame'),
        btn('◀', () => { if (st.frame > 0) { SP.moveFrame(this.doc, st.id, st.frame, st.frame - 1); st.frame--; } }, 'chip-btn', 'move frame left'), btn('▶', () => { if (st.frame < d.frames.length - 1) { SP.moveFrame(this.doc, st.id, st.frame, st.frame + 1); st.frame++; } }, 'chip-btn', 'move frame right'),
        btn('🗑', () => { try { SP.removeFrame(this.doc, st.id, st.frame); } catch (e) { this.toast(e.message); } }, 'chip-btn danger', 'delete frame'),
        btn('Animations', () => this.openAnims(), 'chip-btn'), btn('Transform', () => this.openTransform(), 'chip-btn'));
    },
    editColor() {
      const a = this.art, pn = a.def.palette; if (a.st.color < 0) return;
      this.openSheet({ title: `Colour ${a.st.color}`, live: true, render: (body) => {
        const cur = this.doc.cart.palettes[pn][a.st.color], inp = el('input', { type: 'color', value: cur, class: 'colorin', 'aria-label': 'pick a colour' });
        inp.oninput = () => this.edit(() => SP.setColor(this.doc, pn, a.st.color, inp.value));
        body.append(inp, el('div', { class: 'f-doc' }, `Palette “${pn}” is shared: changing this colour changes it in every sprite that uses it.`));
      } });
    },
    edit(fn) { this.suppress++; try { fn(); } finally { this.suppress--; } },
    openTransform() {
      const a = this.art, id = a.st.id, doc = this.doc, run = (fn) => { try { fn(); } catch (e) { this.toast(e.message); } };
      this.openSheet({ title: 'Transform frame ' + a.st.frame, live: true, render: (body) => {
        const d = doc.cart.sprites[id], f = a.st.frame, w = el('input', { type: 'number', value: d.w, min: 4, max: 64 }), h = el('input', { type: 'number', value: d.h, min: 4, max: 64 });
        body.append(el('div', { class: 'row-end left' }, btn('⇋ Flip left/right', () => run(() => SP.flipH(doc, id, f)), 'sm'), btn('⇅ Flip up/down', () => run(() => SP.flipV(doc, id, f)), 'sm'), btn('⟳ Rotate', () => run(() => SP.rotate(doc, id, f)), 'sm'), btn('Clear frame', () => SP.clear(doc, id, f), 'sm danger')),
          el('div', { class: 'section-l' }, 'Slide the picture'), el('div', { class: 'row-end left' }, btn('←', () => SP.shift(doc, id, f, -1, 0), 'sm'), btn('↑', () => SP.shift(doc, id, f, 0, -1), 'sm'), btn('↓', () => SP.shift(doc, id, f, 0, 1), 'sm'), btn('→', () => SP.shift(doc, id, f, 1, 0), 'sm')),
          el('div', { class: 'f-doc' }, 'What slides off one side comes back on the other.'),
          el('div', { class: 'section-l' }, 'Canvas size (all frames)'), el('div', { class: 'two' }, w, h),
          el('div', { class: 'row-end left' }, btn('Resize', async () => { const W = Math.round(+w.value), H = Math.round(+h.value); if (!(W >= 4 && W <= 64 && H >= 4 && H <= 64)) return this.toast('Between 4 and 64.'); if (S.tileSpriteIds(doc.cart).has(id)) return this.toast('Tiles have to stay the tile size of your levels.'); SP.resize(doc, id, W, H); a._fit = false; a.fit(); }, 'sm')),
          el('div', { class: 'f-doc' }, 'Making it smaller crops from the right and bottom. Making it bigger adds empty space there.'));
      } });
    },
    openAnims() {
      const a = this.art, id = a.st.id;
      this.openSheet({ title: 'Animations', tall: true, live: true, gone: () => !this.doc.cart.sprites[id], render: (body) => {
        const cart = this.doc.cart, d = cart.sprites[id], names = Object.keys(d.anims || {}), tl = S.tileOfSprite(cart, id), plays = tl && DC2.tileAnimName(cart, tl.tsId, tl.n);
        body.append(el('div', { class: 'f-doc' }, tl ? 'This is a tile. It plays the animation marked ▶ below (change it with “Play on tile”). Add frames to it in the row under the picture, then put them in order here.'
          : 'Things pick an animation by name: “idle” when still, “walk” when moving, “jump”, “attack”… Add “_up”, “_down” or “_side” for directions.'));
        if (d.frames.length < 2) body.append(el('div', { class: 'issue warn' }, 'This picture has only one frame, so there is nothing to animate yet. Use “＋ New frame” inside an animation, or ＋ / ⧉ under the picture.'));
        for (const n of names) body.append(el('div', { class: 'lvl-row', 'data-anim': n }, tl && plays === n ? el('b', { title: 'plays on the tile' }, '▶ ') : null, el('b', null, n), el('small', null, ` frames ${d.anims[n].f.join(', ')} · ${d.anims[n].fps || 8} fps`), el('span', { class: 'grow' }),
          tl && plays !== n ? btn('Play on tile', () => this.doc.set(['tilesets', tl.tsId, 'tiles', String(tl.n), 'anim'], n), 'sm', 'make the tile play this animation') : null, btn('Edit', () => this.editAnim(n), 'sm')));
        body.append(btn('＋ New animation', async () => {
          const n = await this.askText('Name the animation', !names.includes('idle') ? 'idle' : names.includes('walk') ? 'attack' : 'walk', 'Create'); if (!n) return;
          if (!/^[A-Za-z0-9_]+$/.test(n)) return this.toast('Use letters, numbers and _ only.'); if (d.anims && d.anims[n]) return this.toast('That name is taken.');
          this.doc.transact('New animation', () => { SP.setAnim(this.doc, id, n, { f: [a.st.frame], fps: tl ? 4 : 8 }); if (tl && !names.length) this.doc.del(['tilesets', tl.tsId, 'tiles', String(tl.n), 'anim']); });
          this.editAnim(n);
        }, 'add primary'));
      } });
    },
    editAnim(name) {
      const a = this.art, id = a.st.id, base = ['sprites', id, 'anims', name]; let timer = null;
      const stop = () => { clearTimeout(timer); timer = null; };
      this.openSheet({ title: 'Animation: ' + name, tall: true, live: true, gone: () => !(this.doc.cart.sprites[id] && this.doc.cart.sprites[id].anims && this.doc.cart.sprites[id].anims[name]), onClose: () => { stop(); this.refreshSheets(); },
        render: (body) => {
          const cart = this.doc.cart, d = cart.sprites[id], an = d.anims[name], ctx = this.ctx(null, 'world'), prev = el('canvas', { width: 64, height: 64, class: 'animprev' }), tl = S.tileOfSprite(cart, id);
          stop(); let i = 0; const pg = prev.getContext('2d'); pg.imageSmoothingEnabled = false;
          /* the preview reads the speed, frames and repeat setting fresh on every tick, so editing them takes effect at once
             (typing in a field deliberately does not redraw this sheet, so nothing here may capture old values) */
          const tick = () => {
            const sp = this.doc.cart.sprites[id], cur = sp && sp.anims && sp.anims[name]; if (!cur) { timer = null; return; }
            const k = cur.loop === false ? Math.min(i, cur.f.length - 1) : i % cur.f.length; pg.clearRect(0, 0, 64, 64);
            if (sp.frames[cur.f[k]] !== undefined) pg.drawImage(frameCanvas(this.doc.cart, id, cur.f[k], 64), 0, 0); i++;
            timer = setTimeout(tick, 1000 / clamp(+cur.fps || 8, 1, 30));
          };
          tick();
          body.append(prev, F.field(ctx, { key: 'fps', label: 'Speed (frames per second)', kind: 'number', default: 8, min: 1, max: 30 }, an.fps, base.concat('fps')), F.field(ctx, { key: 'loop', label: 'Repeat', kind: 'bool', default: true }, an.loop, base.concat('loop')));
          if (tl) body.append(DC2.tileAnimName(cart, tl.tsId, tl.n) === name ? el('div', { class: 'f-doc' }, '▶ This animation plays on the tile.') : btn('▶ Play this one on the tile', () => this.doc.set(['tilesets', tl.tsId, 'tiles', String(tl.n), 'anim'], name), 'sm'));
          body.append(el('div', { class: 'section-l' }, 'Order of frames', el('small', null, ' the animation plays these left to right')));
          const seq = el('div', { class: 'seq' });
          an.f.forEach((fi, k) => seq.append(el('div', { class: 'seqi' }, d.frames[fi] !== undefined ? frameCanvas(cart, id, fi, 40) : el('span', null, '?'), el('small', null, String(fi)),
            el('div', { class: 'seqc' }, k > 0 ? btn('◀', () => { const n = an.f.slice(); n.splice(k - 1, 0, n.splice(k, 1)[0]); this.doc.set(base.concat('f'), n); }, 'sq sm') : null, btn('✕', () => { if (an.f.length > 1) this.doc.remove(base.concat('f'), k); else this.toast('Needs at least one frame.'); }, 'sq sm danger')))));
          /* a one-frame animation's speed never mattered, so give it a real one the moment it grows */
          const grow = (idx) => this.doc.transact('Add frame to animation', () => { this.doc.insert(base.concat('f'), null, idx); if (an.f.length === 1 && (+an.fps || 8) <= 1) this.doc.set(base.concat('fps'), 6); });
          const newFrame = (copy) => {
            let idx = 0; this.doc.transact('New frame', () => { idx = SP.appendFrame(this.doc, id, copy ? an.f[an.f.length - 1] : null); grow(idx); });
            a.st.frame = idx; a.redraw && a.redraw();
            this.toast(`Frame ${idx} added. Close this and draw it.`);
          };
          body.append(seq, el('div', { class: 'f-doc' }, 'Add a frame to the animation:'), el('div', { class: 'frames' }, ...d.frames.map((_, fi) => el('button', { class: 'fr', type: 'button', 'data-addframe': fi, onclick: () => grow(fi) }, frameCanvas(cart, id, fi, 40), el('small', null, String(fi))))),
            el('div', { class: 'row-end left' }, btn('＋ New frame (blank)', () => newFrame(false), 'sm', 'add a new empty frame to this picture and to the animation'), btn('⧉ New frame (copy of last)', () => newFrame(true), 'sm', 'add a copy of the animation\'s last frame, ready to change slightly')));
          body.append(el('div', { class: 'row-end' }, btn('Rename', async () => { const n = await this.askText('Rename animation', name, 'Rename'); if (n) { try { SP.renameAnim(this.doc, id, name, n); this.closeAllSheets(); this.openAnims(); } catch (e) { this.toast(e.message); } } }, 'sm'), btn('Delete', () => { SP.delAnim(this.doc, id, name); }, 'sm danger')),
            el('div', { class: 'f-doc' }, 'If a rule plays this animation by name, renaming it means updating that rule.'));
        } });
    },
    spriteMenu() {
      const id = this.art.st.id, cart = this.doc.cart, s = this.openSheet({ title: id, render: (body) => body.append(el('div', { class: 'menu' },
        btn('Rename', async () => { this.closeSheet(s); const n = await this.askText('Rename sprite', id, 'Rename'); if (n) try { S.renameAsset(this.doc, 'sprite', id, S.slug(n)); this.art.st.id = S.slug(n); this.renderArtUI(); } catch (e) { this.toast(e.message); } }, 'menu-item'),
        S.tileOfSprite(cart, id) ? btn('Tile settings (solid, tags…)', () => { this.closeSheet(s); const tl = S.tileOfSprite(cart, id); this.openTile(tl.n, tl.tsId); }, 'menu-item') : null,
        S.tileOfSprite(cart, id) ? btn('Make a copy as a new tile', () => { this.closeSheet(s); const tl = S.tileOfSprite(cart, id); const r = S.addTile(this.doc, tl.tsId, id + ' copy', id); this.openSprite(r.sprite); }, 'menu-item') : null,
        btn('Make a copy', () => { this.closeSheet(s); const nn = S.slug(id + ' copy', cart.sprites); this.doc.set(['sprites', nn], S.clone(cart.sprites[id]), 'Copy sprite'); this.openSprite(nn); }, 'menu-item'),
        btn('Save as PNG strip', () => { this.closeSheet(s); this.exportPng(id); }, 'menu-item'),
        btn('Delete…', async () => { this.closeSheet(s); const { reg } = DC2.registryFor(cart), n = S.usage(cart, reg, 'sprite', id).length; if (await this.confirm(`Delete “${id}”?` + (n ? ` It is used in ${n} place${n > 1 ? 's' : ''}; those will show problems until you pick another picture.` : '') + ' You can undo this.', 'Delete', true)) { S.deleteAsset(this.doc, 'sprite', id); } }, 'menu-item danger'))) });
    },
    exportPng(id) {
      const d = this.doc.cart.sprites[id], c = document.createElement('canvas'); c.width = d.w * d.frames.length; c.height = d.h; const g = c.getContext('2d');
      d.frames.forEach((_, f) => g.drawImage(frameCanvas(this.doc.cart, id, f), f * d.w, 0));
      c.toBlob((b) => { const u = URL.createObjectURL(b), a = el('a', { href: u, download: id + '.png' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 500); });
    },
  });
  app.frameCanvas = frameCanvas;
  window.addEventListener('DOMContentLoaded', () => {
    $('#aRef').onclick = () => app.openRef();
    window.addEventListener('keydown', (e) => {
      if ($('#artEditor').hidden || !app.art || !app.art.st.id || e.target.matches('input,textarea,select')) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, st = app.art.st;
      if (mod && k === 'c') { e.preventDefault(); app.artCopy(false); } else if (mod && k === 'x') { e.preventDefault(); app.artCopy(true); } else if (mod && k === 'v') { e.preventDefault(); app.artPaste(); }
      else if ((k === 'delete' || k === 'backspace') && st.sel && !st.float) { e.preventDefault(); app.artDelete(); }
      else if (k === 'enter' && st.float) { e.preventDefault(); app.artPlace(); } else if (k === 'escape' && (st.float || st.sel)) { st.float = null; st.sel = null; app.renderArtUI(); app.art.redraw(); }
    });
    $('#btnNewSprite').onclick = () => app.newSprite();
    $('#pngIn').onchange = (e) => { if (e.target.files[0]) app.importPng(e.target.files[0]); e.target.value = ''; };
  });
})();
