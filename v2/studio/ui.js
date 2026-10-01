/* Studio app shell. Three ideas: a project list, an editor with four tabs (Map, Things, Game, Play), and bottom sheets
   for everything that needs more room. All state lives in one Doc; the screen is redrawn from it. */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, S = DC2.studio, F = DC2.forms, { el, btn } = F;
  const $ = (s, r) => (r || document).querySelector(s);
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  const hudSpec = { type: 'list', of: { type: 'object', fields: { text: 'text', x: { type: 'number', default: 0 }, y: { type: 'number', default: 0 }, color: { type: 'int', default: 21, min: 0, max: 31 }, align: { type: 'enum', values: ['left', 'center', 'right'], default: 'left' }, if: { type: 'expr', optional: true, label: 'Only if' } } } };

  const app = (window.DC2_STUDIO = {
    lib: null, meta: null, doc: null, saver: null, runner: null, mv: null, sprites: null, report: { errors: [], warnings: [], ok: true },
    tab: 'map', sheets: [], suppress: 0, _check: 0, playing: false,

    /* ------------------------------------------------------------ toasts, sheets */
    toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2800); },
    openSheet(o) {
      const sheet = { o, body: el('div', { class: 'sheet-body' }), scrim: el('div', { class: 'scrim' }) };
      const title = el('div', { class: 'sheet-title' }, el('span', { class: 'grow' }, o.title || ''),
        o.live ? el('button', { class: 'btn sq sh-undo', 'aria-label': 'Undo', onclick: () => this.doc.undo() }, '↶') : null,
        o.live ? el('button', { class: 'btn sq sh-redo', 'aria-label': 'Redo', onclick: () => this.doc.redo() }, '↷') : null,
        el('button', { class: 'btn sq', 'aria-label': 'close', onclick: () => this.closeSheet(sheet) }, '✕'));
      sheet.el = el('div', { class: 'sheet' + (o.tall ? ' tall' : ''), role: 'dialog', 'aria-label': o.title || 'sheet' }, title, sheet.body);
      sheet.scrim.onclick = () => this.closeSheet(sheet); sheet.title = title.firstChild;
      $('#sheets').append(sheet.scrim, sheet.el); this.sheets.push(sheet); this.renderSheet(sheet); return sheet;
    },
    renderSheet(s) { const y = s.body.scrollTop; try { s.body.replaceChildren(); s.o.render(s.body, s); } catch (e) { console.error(e); s.body.append(el('div', { class: 'issue error' }, 'Something went wrong drawing this: ' + e.message)); } s.body.scrollTop = y; if (this.report) F.paintIssues(s.body, this.report); if (this.doc) this.updateBar(); },
    refreshSheets() { for (const s of [...this.sheets]) if (s.o.live) { if (s.o.gone && s.o.gone()) this.closeSheet(s); else this.renderSheet(s); } },
    closeSheet(s) { s = s || this.sheets[this.sheets.length - 1]; if (!s) return; s.el.remove(); s.scrim.remove(); this.sheets = this.sheets.filter((x) => x !== s); if (s.o.onClose) s.o.onClose(); },
    closeAllSheets() { [...this.sheets].forEach((s) => this.closeSheet(s)); },
    pick(o) {
      const s = this.openSheet({ title: o.title, tall: (o.items || []).length > 8, render: (body) => {
        const q = (o.items || []).length > 10 ? el('input', { type: 'search', placeholder: 'Search…', class: 'search', oninput: () => draw() }) : null, list = el('div', { class: 'pick' });
        const draw = () => { list.replaceChildren(); let last = null; const t = q ? q.value.toLowerCase() : ''; for (const it of o.items) { if (t && !(it.title + ' ' + (it.doc || '')).toLowerCase().includes(t)) continue; if (it.group && it.group !== last) { list.append(el('div', { class: 'pick-group' }, it.group)); last = it.group; } list.append(el('button', { type: 'button', class: 'pick-item' + (it.thumb ? ' has-thumb' : ''), onclick: () => { this.closeSheet(s); o.onPick(it.id); } }, it.thumb ? this.sprites.thumb(it.thumb, 32) : null, el('b', null, it.title), it.doc ? el('span', null, it.doc) : null)); } if (!list.children.length) list.append(el('div', { class: 'empty' }, 'Nothing matches.')); };
        if (o.head) body.append(o.head); if (q) body.append(q); body.append(list); draw();
      } });
      return s;
    },
    askText(title, initial, ok) {
      return new Promise((res) => { let done = false; const finish = (v) => { if (!done) { done = true; res(v); } }; const s = this.openSheet({ title, onClose: () => finish(null), render: (body) => { const inp = el('input', { type: 'text', value: initial || '', class: 'big-in' }); const go = () => { finish(inp.value.trim() || null); this.closeSheet(s); }; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); }; body.append(inp, el('div', { class: 'row-end' }, btn(ok || 'OK', go, 'primary'))); setTimeout(() => { inp.focus(); inp.select(); }, 50); } }); });
    },
    confirm(msg, ok, danger) {
      return new Promise((res) => { let done = false; const finish = (v) => { if (!done) { done = true; res(v); } }; const s = this.openSheet({ title: 'Are you sure?', onClose: () => finish(false), render: (body) => body.append(el('p', null, msg), el('div', { class: 'row-end' }, btn('Cancel', () => this.closeSheet(s)), btn(ok || 'OK', () => { finish(true); this.closeSheet(s); }, danger ? 'danger-fill' : 'primary'))) }); });
    },
    ctx(prefabId, owner) {
      const self = this;
      return { doc: this.doc, get reg() { return S.allReg(); }, sprites: this.sprites, owner: owner || 'entity', toast: (m) => this.toast(m), pick: (o) => this.pick(o),
        edit(fn) { self.suppress++; try { fn(); } finally { self.suppress--; } }, get sug() { return S.suggest(self.doc.cart, S.allReg(), prefabId); }, prefabId };
    },

    /* ----------------------------------------------------------- doc events, checking */
    onDoc() { if (this.suppress) { this.light(); } else { this.full(); } },
    light() { this.updateBar(); if (this.art && this.art.st.id) this.art.redraw(); if (this.tab === 'map' && this.mv) this.mv.redraw(); this.scheduleCheck(); },
    full() { this.updateBar(); if (this.artRefresh) this.artRefresh(); this.refreshSheets(); this.renderTab(); this.scheduleCheck(); },
    scheduleCheck() { clearTimeout(this._check); this._check = setTimeout(() => { if (!this.doc) return; /* left the project in the meantime */ this.report = S.check(this.doc.cart); this.updateBar(); F.paintIssues(document.body, this.report); this.sheets.forEach((s) => F.paintIssues(s.body, this.report)); if (this.tab === 'things') this.renderThings(true); }, 220); },
    updateBar() {
      const d = this.doc; if (!d) return;
      $('#btnUndo').disabled = !d.canUndo; $('#btnRedo').disabled = !d.canRedo;
      document.querySelectorAll('.sh-undo').forEach((b) => (b.disabled = !d.canUndo)); document.querySelectorAll('.sh-redo').forEach((b) => (b.disabled = !d.canRedo));
      const n = this.report.errors.length, b = $('#btnProblems'); b.hidden = n === 0; b.textContent = '⚠ ' + n; b.title = n + ' problem' + (n === 1 ? '' : 's');
    },
    saveStatus(s, err) { const e = $('#saveState'); e.textContent = { saved: 'Saved', saving: 'Saving…', dirty: 'Editing…', error: '⚠ Not saved' }[s] || s; e.className = 'save ' + s; e.title = err ? err.message : ''; },

    /* ---------------------------------------------------------------- projects */
    async showProjects() {
      await this.closeProject(); $('#screenEditor').hidden = true; $('#screenProjects').hidden = false; history.replaceState(null, '', location.pathname);
      const list = $('#projList'); list.replaceChildren(el('div', { class: 'empty' }, 'Loading…'));
      const ps = await this.lib.list(); list.replaceChildren();
      if (!ps.length) list.append(el('div', { class: 'empty big' }, 'No projects yet. Make your first game with the button below.'));
      for (const p of ps) list.append(el('div', { class: 'proj', 'data-id': p.id }, el('button', { class: 'proj-main', onclick: () => this.openProject(p.id) }, el('b', null, p.name), el('span', null, 'edited ' + ago(p.updated))), btn('⋯', () => this.projectMenu(p), 'sq', 'more')));
    },
    projectMenu(p) {
      const s = this.openSheet({ title: p.name, render: (body) => body.append(
        el('div', { class: 'menu' },
          btn('Rename', async () => { this.closeSheet(s); const n = await this.askText('Rename project', p.name, 'Rename'); if (n) { await this.lib.rename(p.id, n); this.showProjects(); } }, 'menu-item'),
          btn('Make a copy', async () => { this.closeSheet(s); const { cart } = await this.lib.open(p.id); await this.lib.create(p.name + ' copy', cart); this.showProjects(); }, 'menu-item'),
          btn('Export as .dcart file', async () => { this.closeSheet(s); this.download(p.name, await this.lib.exportDcart(p.id)); }, 'menu-item'),
          btn('Delete…', async () => { this.closeSheet(s); if (await this.confirm(`Delete "${p.name}" and all its restore points? This cannot be undone.`, 'Delete', true)) { await this.lib.remove(p.id); this.showProjects(); } }, 'menu-item danger'))) });
    },
    download(name, text) { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: S.slug(name) + '.dcart' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); },
    newProject() {
      const st = window.DC2_STARTERS, s = this.openSheet({ title: 'Start a new game', tall: true, render: (body) => {
        const name = el('input', { type: 'text', class: 'big-in', placeholder: 'Name your game', value: '' });
        body.append(name, el('div', { class: 'section-l' }, 'Start from'));
        for (const k of Object.keys(st)) body.append(el('button', { class: 'tmpl', type: 'button', 'data-tmpl': k, onclick: async () => { this.closeSheet(s); const cart = S.clone(st[k].cart); const nm = name.value.trim() || st[k].title; if (k !== 'flag-of-gold') cart.meta.title = nm; const meta = await this.lib.create(nm, cart); this.openProject(meta.id); } }, el('b', null, st[k].title), el('span', null, st[k].doc)));
      } });
    },
    /* .dcart (checksummed), a v1 .json cart (converted, with a report), or a plain v2 .json cart */
    async importFile(file) {
      try {
        const text = await file.text(), base = file.name.replace(/\.[^.]+$/, '');
        let data = null; try { data = JSON.parse(text); } catch (e) { const r = DC.scrubJSON ? DC.scrubJSON(text) : { ok: false }; if (r.ok) data = r.data; }
        if (data && data.dcart === 1) { const meta = await this.lib.importDcart(text); this.toast('Imported "' + meta.name + '"'); return this.openProject(meta.id); }
        if (data && S.v1 && S.v1.isV1(data)) {
          const { cart, notes } = S.v1.convert(data), meta = await this.lib.create((data.meta && data.meta.title) || base, cart);
          await this.openProject(meta.id, { tab: 'play' }); this.importReport(meta.name, notes); return;
        }
        if (data && data.format === 'DCART-2' && data.meta) { const meta = await this.lib.create(data.meta.title || base, data); this.toast('Imported "' + meta.name + '"'); return this.openProject(meta.id); }
        throw new Error('That file isn\'t a Data Console game (.dcart, or a v1 or v2 .json cart).');
      } catch (e) { this.toast(e.message); }
    },
    importReport(name, notes) {
      this.openSheet({ title: 'Imported from v1', tall: notes.length > 6, render: (body) => {
        const probs = this.report ? this.report.errors.length : 0;
        body.append(el('p', null, notes.length ? `"${name}" is open and playable. These parts of the v1 game didn't come across exactly, so check them:` : `"${name}" came across completely.`));
        let last = null; const list = el('div', { class: 'importnotes' });
        for (const n of notes) { if (n.where !== last) { list.append(el('div', { class: 'pick-group' }, n.where)); last = n.where; } list.append(el('div', { class: 'importnote' }, n.what)); }
        if (notes.length) body.append(list);
        body.append(el('p', { class: 'hint' }, 'Your original file is unchanged and still plays in the v1 console.' + (probs ? ` There ${probs === 1 ? 'is 1 problem' : 'are ' + probs + ' problems'} to fix — tap the red button at the top.` : '')));
        body.append(el('div', { class: 'row-end' }, btn('Got it', () => this.closeSheet(), 'primary')));
      } });
    },
    async closeProject() {
      if (this.saver) { try { await this.saver.flush(); } catch (e) { /* reported by status */ } this.saver.stop(); this.saver = null; }
      if (this.runner) this.runner.stop(); this.playing = false; this.closeAllSheets(); $('#artEditor').hidden = true; if (this.art) this.art.st.id = null; this.doc = null; this.mv = null;
    },
    async openProject(id, opts) {
      await this.closeProject();
      let res; try { res = await this.lib.open(id); } catch (e) { this.toast(e.message); return this.showProjects(); }
      if (S.needsUpgrade(res.cart)) {   // older projects: one sprite per tile, sword swings that follow the player (a restore point is kept first)
        try { await this.lib.snapshot(id, res.cart, 'Before the Studio updated this project'); const c = S.clone(res.cart); S.upgrade(c); await this.lib.saveAll(id, c); res.cart = c; } catch (e) { console.error(e); }
      }
      this.meta = res.meta; this.doc = new S.Doc(res.cart); this.sprites = new DC2.SpriteCache(res.cart);
      this.doc.on((ev) => {
        if (ev.touched.some((p) => ['sprites', 'palettes', 'tilesets'].includes(p[0]))) this.sprites.invalidate();
        /* any change to sounds, music or the balance (a slider, undo, the code editor, an import) reaches the speakers and a running game */
        if (this.pushAudio && ev.touched.some((p) => p[0] === 'sounds' || p[0] === 'music' || (p[0] === 'meta' && (p.length === 1 || p[1] === 'mix')))) this.pushAudio();
        this.onDoc(ev);
      });
      this.saver = new S.Autosaver(this.lib, id, this.doc); this.saver.onStatus((s, e) => this.saveStatus(s, e)); this.saveStatus('saved');
      history.replaceState(null, '', '#p=' + id);
      $('#screenProjects').hidden = true; $('#screenEditor').hidden = false; $('#projName').textContent = res.meta.name;
      this.report = S.check(this.doc.cart); this.mv = null; this.st = null; if (this.code) { this.code.dirty = false; this.code.shown = null; }
      if (DC2.mixer) DC2.mixer.apply(this.doc.cart);   // previews and Play use this game's balance
      this.setTab((opts && opts.tab) || 'map', true); this.updateBar();
    },

    /* -------------------------------------------------------------------- tabs */
    setTab(t, force) {
      if (!force && t === this.tab && !$('#viewPlay').hidden === (t === 'play')) { /* re-select: still redraw */ }
      if (this.tab === 'code' && t !== 'code' && !force && this.leaveCode && !this.leaveCode()) return;   // unapplied code: apply it, or stay if it's broken
      if (this.tab === 'play' && t !== 'play') { if (this.runner) this.runner.stop(); this.playing = false; }   // Play always starts fresh from the current project
      this.tab = t;
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
      for (const v of ['map', 'things', 'art', 'code', 'game', 'play']) $('#view' + v[0].toUpperCase() + v.slice(1)).hidden = v !== t;
      this.renderTab();
    },
    renderTab() { ({ art: () => this.renderArt(), code: () => this.renderCode(), map: () => this.renderMap(), things: () => this.renderThings(), game: () => this.renderGame(), play: () => { if (!this.playing) this.startPlay(); } })[this.tab](); },

    /* --------------------------------------------------------------------- map */
    currentMapId() { const st = this.mv && this.mv.st; return (st && st.mapId && this.doc.cart.maps[st.mapId]) ? st.mapId : Object.keys(this.doc.cart.maps)[0]; },
    sceneOfMap(mapId) { return Object.keys(this.doc.cart.scenes).find((k) => this.doc.cart.scenes[k].map === mapId); },
    renderMap() {
      const cart = this.doc.cart;
      if (!this.mv) { this.mv = new DC2.MapView($('#mapCanvas'), { doc: this.doc, sprites: this.sprites, toast: (m) => this.toast(m), onSelect: (i) => this.mapSelect(i), onInspect: (i) => this.openObject(i), onToolChange: () => this.renderMapUI(), onFlag: (p) => this.playHere(p), onSelChange: () => this.renderSelBar(), getClip: () => this.mapClip || null, setClip: (c) => { this.mapClip = c; this.renderSelBar(); } }); this.mv.resize(); }
      else { this.mv.doc = this.doc; this.mv.host.sprites = this.sprites; }
      const mid = this.currentMapId(); if (this.mv.st.mapId !== mid) this.mv.setMap(mid); else if (!this.mv._fitted) this.mv.resize();
      if (!this.mv.st.prefab) this.mv.st.prefab = Object.keys(cart.prefabs)[0] || '@marker';
      { const ids = this.tileIds(); if (this.mv.st.tile && !ids.includes(this.mv.st.tile)) this.mv.st.tile = ids[0] || 0; }
      this.renderMapUI(); this.mv.redraw();
    },
    tileIds() { const m = this.mv && this.mv.map; return m ? DC2.tileIds(this.doc.cart, m.tileset) : []; },
    tileThumb(tsId, n, size) { const c = el('canvas', { width: size, height: size }), g = c.getContext('2d'), a = DC2.tileArt(this.doc.cart, tsId, n, 0); g.imageSmoothingEnabled = false; const f = a && this.sprites.frames(a.sprite)[a.frame]; if (f) g.drawImage(f, 0, 0, size, size); return c; },
    async newTile(tsId) {
      const name = await this.askText('New tile — name it', '', 'Create'); if (name === null) return;
      const { n, sprite } = S.addTile(this.doc, tsId, name || null);
      if (this.mv) this.mv.st.tile = n; this.toast('Draw your tile, then come back to the Map to paint with it.'); this.openSprite(sprite);
    },
    mapSelect() { /* selection is drawn by the view; inspector opens on tap */ },
    renderMapUI() {
      const cart = this.doc.cart, mv = this.mv, st = mv.st, m = mv.map; if (!m) { $('#tools').replaceChildren(el('div', { class: 'empty' }, 'This game has no levels yet. Open the Game tab and add one.')); return; }
      const sid = this.sceneOfMap(st.mapId);
      $('#lvlBtn').replaceChildren('Level: ', el('b', null, sid || st.mapId), ' ▾');
      document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
      const tools = st.mode === 'tiles' ? [['draw', '✏️', 'Draw'], ['line', '╱', 'Line'], ['rect', '▭', 'Box'], ['frame', '▢', 'Frame'], ['fill', '🪣', 'Fill'], ['erase', '⌫', 'Erase'], ['tsel', '⬚', 'Select'], ['wand', '🪄', 'Wand'], ['pick', '💧', 'Pick'], ['hand', '✋', 'Pan']] : [['select', '👆', 'Select'], ['place', '＋', 'Place'], ['hand', '✋', 'Pan'], ['flag', '🚩', 'Play here']];
      if (!tools.some((t) => t[0] === st.tool)) st.tool = tools[0][0];
      $('#tools').replaceChildren(...tools.map(([id, ic, lab]) => el('button', { class: 'tool' + (st.tool === id ? ' on' : ''), 'data-tool': id, type: 'button', onclick: () => { st.tool = id; this.renderMapUI(); mv.redraw(); } }, el('span', null, ic), el('small', null, lab))),
        el('span', { class: 'grow' }));
      $('#zSolid').classList.toggle('on', st.showSolid); $('#zSnap').classList.toggle('on', st.snap);
      const lb = $('#layerBar'); lb.hidden = st.mode !== 'tiles';
      lb.replaceChildren(...m.layers.map((L, li) => el('button', { class: 'chip-btn' + (li === st.layer ? ' on' : '') + (st.hidden.has(li) ? ' dim' : ''), 'data-layer': li, type: 'button', onclick: () => { if (st.layer === li) this.openLayer(li); else { st.layer = li; this.renderMapUI(); mv.redraw(); } } }, (L.collide ? '▦ ' : '') + L.name)), btn('＋ Layer', () => { st.layer = M().addLayer(this.doc, st.mapId, null, false); }, 'chip-btn'));
      const pal = $('#palette'); pal.replaceChildren();
      if (st.mode === 'tiles') {
        const ts = cart.tilesets[m.tileset];
        pal.append(el('button', { class: 'pal erase' + (st.tile === 0 ? ' on' : ''), type: 'button', title: 'empty', onclick: () => { st.tile = 0; st.tool = 'draw'; this.renderMapUI(); } }, '∅'));
        for (const t of this.tileIds()) { const th = this.tileThumb(m.tileset, t, 32); const d = (ts.tiles || {})[t] || {}; pal.append(el('button', { class: 'pal' + (st.tile === t ? ' on' : ''), type: 'button', 'data-tile': t, title: d.name || 'tile ' + t, onclick: () => { st.tile = t; if (st.tool === 'erase' || st.tool === 'pick') st.tool = 'draw'; this.renderMapUI(); } }, th, d.solid ? el('i', { class: 'flag solid' }) : d.oneway ? el('i', { class: 'flag oneway' }) : null)); }
        pal.append(el('button', { class: 'pal', type: 'button', title: 'New tile', 'data-newtile': '1', onclick: () => this.newTile(m.tileset) }, '＋'), btn('Tile settings', () => this.openTile(st.tile), 'chip-btn'));
      } else {
        for (const id of Object.keys(cart.prefabs)) { const sp = (cart.prefabs[id].c || {}).sprite, th = sp ? this.sprites.thumb(sp.id, 32) : el('span', { class: 'ph' }, '?'); pal.append(el('button', { class: 'pal thing' + (st.prefab === id ? ' on' : ''), type: 'button', 'data-prefab': id, title: id, onclick: () => { st.prefab = id; st.tool = 'place'; this.renderMapUI(); } }, th, el('small', null, id))); }
        pal.append(el('button', { class: 'pal thing' + (st.prefab === '@marker' ? ' on' : ''), type: 'button', 'data-prefab': '@marker', onclick: () => { st.prefab = '@marker'; st.tool = 'place'; this.renderMapUI(); } }, el('span', { class: 'ph' }, '◆'), el('small', null, 'marker')));
      }
      this.renderSelBar();
    },
    /* the bar under the tools: selection modes and actions, or the floating paste's controls */
    renderSelBar() {
      const bar = $('#selBar'), mv = this.mv; if (!bar) return; if (!mv || !mv.map || mv.st.mode !== 'tiles') { bar.hidden = true; return; }
      const st = mv.st, sel = mv.sel(), f = st.float, clip = this.mapClip, items = [], chip = (label, fn, cls, title) => btn(label, fn, 'chip-btn' + (cls ? ' ' + cls : ''), title);
      const seg = (cur, opts, set) => el('span', { class: 'segchips' }, ...opts.map(([v, l]) => el('button', { type: 'button', class: 'chip-btn' + (cur === v ? ' on' : ''), 'data-v': v, onclick: () => { set(v); this.renderSelBar(); } }, l)));
      if (f) {
        items.push(el('span', { class: 'clip-l' }, st.keep ? 'Stamping: drag or tap, then Place' : 'Drag it, or tap where it should go'),
          chip('↔', () => mv.floatFlip(true), '', 'flip left-right'), chip('↕', () => mv.floatFlip(false), '', 'flip upside down'),
          chip('🔁 Keep stamping', () => { st.keep = !st.keep; this.renderSelBar(); }, st.keep ? 'on' : '', 'stay in paste mode after placing, to stamp it again'),
          chip('✓ Place', () => mv.floatPlace(), 'primary'), chip('✕', () => mv.floatCancel(), '', 'cancel'));
      } else if (sel || st.tool === 'tsel' || st.tool === 'wand') {
        if (st.tool === 'tsel' || st.tool === 'wand') items.push(seg(st.selMode, [['new', 'New'], ['add', '＋ Add'], ['sub', '－ Remove']], (v) => { st.selMode = v; }));
        if (st.tool === 'wand') items.push(seg(st.wandScope, [['all', 'Whole level'], ['connected', 'Touching']], (v) => { st.wandScope = v; }));
        if (sel) {
          const ts = this.doc.cart.tilesets[mv.map.tileset], nm = st.tile ? ((ts.tiles || {})[st.tile] || {}).name || 'tile ' + st.tile : 'nothing';
          items.push(el('span', { class: 'clip-l', 'data-selcount': sel.size }, `${sel.size} selected`),
            el('button', { type: 'button', class: 'chip-btn', 'data-act': 'paint', title: 'Paint the selected tile (' + nm + ') over the selection', onclick: () => mv.selPaint() }, 'Paint ', st.tile ? this.tileThumb(mv.map.tileset, st.tile, 18) : '∅'),
            chip('Delete', () => mv.selDelete()), chip('Copy', () => mv.selCopy(false)), chip('Cut', () => mv.selCopy(true)), chip('Move', () => mv.selMove()),
            chip('Border', () => mv.selEdge(), '', 'keep only the outline of the selection'),
            chip('Sprinkle', () => this.pick({ title: 'Sprinkle the selected tile over the selection', items: [{ id: '0.1', title: 'A few', doc: 'about 1 in 10', group: '' }, { id: '0.25', title: 'Some', doc: 'about 1 in 4', group: '' }, { id: '0.5', title: 'Lots', doc: 'about half', group: '' }], onPick: (id) => mv.selSprinkle(+id) })),
            mv.map.layers.length > 1 ? chip(st.allLayers ? 'Layers: all' : 'Layers: this', () => { st.allLayers = !st.allLayers; this.renderSelBar(); }, st.allLayers ? 'on' : '', 'Delete, Copy, Cut, Move and Paint act on every layer, or only the current one') : null,
            chip(st.lock ? '🔒 Draw inside only' : '🔓 Draw anywhere', () => { st.lock = !st.lock; this.renderSelBar(); }, st.lock ? 'on' : '', 'while something is selected, drawing tools only change the selected cells'),
            chip('Invert', () => mv.selInvert()));
        }
        items.push(chip('All', () => mv.selAll()));
        if (clip) items.push(chip('Paste', () => mv.selPaste()));
        if (sel) items.push(chip('✕', () => mv.selClear(), '', 'deselect'));
        if (!sel && !clip) items.push(el('span', { class: 'clip-l' }, st.tool === 'wand' ? 'Tap a tile to select every one like it' : 'Drag over the map to select'));
      } else if (clip && st.tool === 'draw') { bar.hidden = true; return; }
      bar.replaceChildren(...items.filter(Boolean)); bar.hidden = !items.length;
    },
    openLayer(li) {
      const st = this.mv.st, id = st.mapId;
      this.openSheet({ title: 'Layer', live: true, gone: () => !this.doc.cart.maps[id] || !this.doc.cart.maps[id].layers[li], render: (body) => {
        const L = this.doc.cart.maps[id].layers[li], ctx = this.ctx(null, 'scene');
        body.append(F.field(ctx, { key: 'name', label: 'Name', kind: 'text' }, L.name, ['maps', id, 'layers', li, 'name']),
          F.field(ctx, { key: 'collide', label: 'Solid layer', kind: 'bool', default: false, doc: 'Everything painted on a solid layer blocks movement.' }, !!L.collide, ['maps', id, 'layers', li, 'collide']),
          el('div', { class: 'f' }, el('label', { class: 'f-inline' }, el('span', { class: 'f-label' }, 'Show in editor'), el('input', { type: 'checkbox', checked: st.hidden.has(li) ? null : true, onchange: (e) => { if (e.target.checked) st.hidden.delete(li); else st.hidden.add(li); this.mv.redraw(); this.renderMapUI(); } }))),
          el('div', { class: 'row-end' }, li > 0 ? btn('Move down (behind)', () => this.doc.move(['maps', id, 'layers'], li, li - 1), 'sm') : null, li < this.doc.cart.maps[id].layers.length - 1 ? btn('Move up (in front)', () => this.doc.move(['maps', id, 'layers'], li, li + 1), 'sm') : null,
            btn('Delete layer', async () => { if (this.doc.cart.maps[id].layers.length < 2) return this.toast('A level needs at least one layer.'); if (await this.confirm(`Delete layer "${L.name}" and everything painted on it?`, 'Delete', true)) { S.map.removeLayer(this.doc, id, li); st.layer = 0; } }, 'danger')));
      } });
    },
    openTile(t, tsIdIn) {
      const tsId = tsIdIn || this.doc.cart.maps[this.mv.st.mapId].tileset;
      if (!t) return this.toast('Pick a tile first.');
      this.openSheet({ title: 'Tile', live: true, gone: () => !this.doc.cart.tilesets[tsId] || !(this.doc.cart.tilesets[tsId].tiles || {})[t], render: (body) => {
        const d = (this.doc.cart.tilesets[tsId].tiles || {})[t] || {}, ctx = this.ctx(null, 'scene'), sd = S.describe(S.tileSpec, 'tile', { cart: this.doc.cart, reg: S.allReg() });
        body.append(el('div', { class: 'tilebig' }, this.tileThumb(tsId, t, 64), d.sprite ? btn('✏️ Edit picture', () => { this.closeAllSheets(); this.openSprite(d.sprite); }, 'sm') : null),
          ...sd.fields.map((f) => F.field(ctx, f, d[f.key], ['tilesets', tsId, 'tiles', String(t), f.key])));
      } });
    },
    openObject(i) {
      const id = this.mv.st.mapId, self = this;
      this.openSheet({ title: 'Placed thing', live: true, gone: () => !(this.doc.cart.maps[id] && this.doc.cart.maps[id].objects && this.doc.cart.maps[id].objects[i]), onClose: () => { this.mv.st.sel = null; this.mv.redraw(); }, render: (body, sheet) => {
        const o = this.doc.cart.maps[id].objects[i], ctx = this.ctx(o.prefab || null, 'entity'), P = ['maps', id, 'objects', i];
        if (o.prefab) { const pd = S.describe({ type: 'ref', to: 'prefab', required: true }, 'prefab', { cart: this.doc.cart, reg: S.allReg() }); pd.label = 'What it is'; body.append(F.field(ctx, pd, o.prefab, P.concat('prefab'))); } else body.append(el('div', { class: 'f-doc' }, 'A marker: an invisible spot other things can point to, like where a door leads.'));
        body.append(F.field(ctx, { key: 'name', label: o.prefab ? 'Name (optional)' : 'Marker name', kind: 'text', optional: true, doc: o.prefab ? 'Give it a name if a door or rule needs to send the player here.' : '' }, o.name, P.concat('name')),
          el('div', { class: 'two' }, F.field(ctx, { key: 'x', label: 'X', kind: 'number', doc: '' }, o.x, P.concat('x')), F.field(ctx, { key: 'y', label: 'Y', kind: 'number', doc: '' }, o.y, P.concat('y'))));
        body.append(el('div', { class: 'row-end' }, o.prefab ? btn('Edit this thing…', () => { this.closeSheet(sheet); this.openThing(o.prefab); }, 'sm') : null,
          btn('Copy', () => { S.map.addObject(this.doc, id, Object.assign({}, S.clone(o), { x: o.x + this.mv.ts, name: o.name ? S.map.uniqueName(this.doc.cart.maps[id], o.name) : undefined })); this.closeSheet(sheet); }, 'sm'),
          btn('Delete', () => { this.closeSheet(sheet); S.map.removeObject(this.doc, id, i); this.mv.st.sel = null; }, 'danger')));
      } });
    },
    levelMenu() {
      const s = this.openSheet({ title: 'Levels', live: true, render: (body) => {
        const cart = this.doc.cart, cur = this.currentMapId();
        for (const [sid, sc] of Object.entries(cart.scenes)) body.append(el('button', { class: 'lvl' + (sc.map === cur ? ' on' : ''), type: 'button', 'data-scene': sid, onclick: () => { if (sc.map) { this.mv.st.mapId = null; this.mv.setMap(sc.map); this.renderMapUI(); } this.closeSheet(s); } }, el('b', null, sid), el('span', null, sc.map ? `${cart.maps[sc.map].w}×${cart.maps[sc.map].h}` : 'no map')));
        body.append(el('div', { class: 'row-end' }, btn('＋ New level', () => this.newLevel(), 'primary'), btn('This level’s settings…', () => { this.closeSheet(s); this.openLevel(this.sceneOfMap(cur)); }, 'sm')));
      } });
    },
    async newLevel() {
      const name = await this.askText('Name the new level', 'Level ' + (Object.keys(this.doc.cart.scenes).length + 1), 'Create'); if (!name) return;
      const r = S.addLevel(this.doc, name, 32, 14, this.currentMapId()); this.closeAllSheets(); this.mv.st.mapId = null; this.mv.setMap(r.map); this.renderMapUI();
    },
    openLevel(sid) {
      if (!sid) return this.toast('This map has no level attached.');
      this.openSheet({ title: 'Level: ' + sid, tall: true, live: true, gone: () => !this.doc.cart.scenes[sid], render: (body) => {
        const sc = this.doc.cart.scenes[sid], m = sc.map && this.doc.cart.maps[sc.map], ctx = this.ctx(null, 'scene'), cx = { cart: this.doc.cart, reg: S.allReg() };
        body.append(el('div', { class: 'row-end' }, btn('Rename', async () => { const n = await this.askText('Rename level', sid, 'Rename'); if (n) { try { S.renameAsset(this.doc, 'scene', sid, S.slug(n)); this.closeAllSheets(); } catch (e) { this.toast(e.message); } } }, 'sm')));
        if (m) body.append(el('div', { class: 'section-l' }, 'Size (in tiles)'), el('div', { class: 'two' }, this.sizeField('Width', m.w, (v) => S.map.resize(this.doc, sc.map, v, m.h)), this.sizeField('Height', m.h, (v) => S.map.resize(this.doc, sc.map, m.w, v))));
        body.append(el('div', { class: 'section-l' }, 'On-screen text'), F.field(ctx, S.describe(hudSpec, 'hud', cx), sc.hud || [], ['scenes', sid, 'hud'], { label: 'Text on the screen', bare: false }));
        body.append(el('div', { class: 'section-l' }, 'Rules for this level'), F.rulesEditor(ctx, sc.rules, ['scenes', sid, 'rules'], 'scene'));
      } });
    },
    sizeField(label, val, apply) { const inp = el('input', { type: 'number', value: val, min: 4, max: 200 }), b = btn('Set', () => { const v = Math.round(Number(inp.value)); if (v >= 4 && v <= 200) apply(v); else this.toast('Between 4 and 200 tiles.'); }, 'sm'); return el('div', { class: 'f' }, el('div', { class: 'f-label' }, label), el('div', { class: 'exprrow' }, inp, b)); },

    /* ------------------------------------------------------------------ things */
    renderThings(soft) {
      const cart = this.doc.cart, box = $('#thingGrid'); box.replaceChildren();
      const ids = Object.keys(cart.prefabs).filter((k) => !((cart.prefabs[k].doc || '').startsWith('@hidden')));
      if (!ids.length) box.append(el('div', { class: 'empty big' }, 'No things yet. Tap “New thing” to add a player, a coin, an enemy…'));
      for (const id of ids) {
        const p = cart.prefabs[id], sp = (p.c || {}).sprite, bad = S.issuesAt(this.report, 'prefabs.' + id).some((x) => x.level === 'error'), n = S.placedCount(cart, id);
        box.append(el('button', { class: 'thing' + (bad ? ' bad' : ''), type: 'button', 'data-thing': id, onclick: () => this.openThing(id) }, sp ? this.sprites.thumb(sp.id, 48) : el('span', { class: 'ph big' }, '?'), el('b', null, id), el('small', null, (cart.meta.player === id ? 'PLAYER · ' : '') + (n ? `placed ${n}×` : 'not placed')), bad ? el('i', { class: 'badge' }, '⚠') : null));
      }
    },
    newThing() {
      const items = S.recipes.filter((r) => !r.hidden).map((r) => ({ id: r.id, title: r.title, doc: r.doc, group: r.group }));
      this.pick({ title: 'Add a new thing', items, onPick: (rid) => { const name = S.addRecipe(this.doc, rid); this.toast('Added “' + name + '”. Place it in a level from the Map tab.'); this.openThing(name); } });
    },
    openThing(id) {
      if (!this.doc.cart.prefabs[id]) return;
      const s = this.openSheet({ title: id, tall: true, live: true, gone: () => !this.doc.cart.prefabs[id], render: (body, sheet) => {
        const cart = this.doc.cart, p = cart.prefabs[id], ctx = this.ctx(id, 'entity');
        sheet.title.textContent = id;
        body.append(el('div', { class: 'row-end top' },
          btn('Add to a level', () => { this.closeAllSheets(); this.setTab('map'); const st = this.mv.st; st.mode = 'things'; st.prefab = id; st.tool = 'place'; this.renderMapUI(); }, 'primary sm'),
          btn('Rename', async () => { const n = await this.askText('Rename', id, 'Rename'); if (n) { try { S.renameAsset(this.doc, 'prefab', id, S.slug(n)); this.closeSheet(sheet); this.openThing(S.slug(n)); } catch (e) { this.toast(e.message); } } }, 'sm'),
          btn('Copy', () => { const nn = S.slug(id + ' copy', cart.prefabs); this.doc.set(['prefabs', nn], S.clone(p), 'Copy thing'); this.closeSheet(sheet); this.openThing(nn); }, 'sm'),
          btn('Delete…', async () => { const n = S.placedCount(cart, id); if (await this.confirm(`Delete “${id}”?` + (n ? ` It is placed ${n} time${n > 1 ? 's' : ''}; those will be removed too.` : '') + ' You can undo this.', 'Delete', true)) { this.closeSheet(sheet); S.deleteThing(this.doc, id); } }, 'sm danger')));
        if (cart.meta.player !== id) body.append(el('label', { class: 'f-inline plain' }, el('span', null, 'Use as the player'), el('button', { type: 'button', class: 'switch', 'aria-label': 'use as player', onclick: () => this.doc.set(['meta', 'player'], id) })));
        body.append(el('div', { class: 'section-l' }, 'Parts', el('small', null, ' what it is made of')), F.partsEditor(ctx, id));
        body.append(el('div', { class: 'section-l' }, 'Rules', el('small', null, ' how it behaves')), F.rulesEditor(ctx, p.rules, ['prefabs', id, 'rules'], 'entity'));
        body.append(el('div', { class: 'section-l' }, 'Own values', el('small', null, ' numbers or flags only this thing has')), F.valuesEditor(ctx, ['prefabs', id, 'v'], p.v, { reserved: (n) => !!S.allReg().components[n] }));
        body.append(el('div', { class: 'section-l' }, 'Tags', el('small', null, ' groups other rules can match, like “enemy”')), F.tagsEditor(ctx, id));
      } });
    },

    /* -------------------------------------------------------------------- game */
    renderGame() {
      const cart = this.doc.cart, box = $('#gameBody'), ctx = this.ctx(null, 'world'), cx = { cart, reg: S.allReg() }; box.replaceChildren();
      const fld = (key, label, kind, val, extra) => F.field(ctx, Object.assign({ key, label, kind }, extra || {}), val, ['meta', key]);
      box.append(el('h3', null, 'Your game'), fld('title', 'Title', 'text', cart.meta.title),
        el('div', { class: 'two' }, fld('width', 'Screen width', 'int', cart.meta.width, { default: 256, min: 64, max: 640 }), fld('height', 'Screen height', 'int', cart.meta.height, { default: 224, min: 64, max: 480 })),
        fld('start', 'Starts in level', 'ref', cart.meta.start, { to: 'scene', options: Object.keys(cart.scenes) }), fld('player', 'The player is', 'ref', cart.meta.player, { to: 'prefab', options: Object.keys(cart.prefabs), optional: true }));
      box.append(el('h3', null, 'Levels'), el('div', { class: 'lvls' }, ...Object.entries(cart.scenes).map(([sid, sc]) => el('div', { class: 'lvl-row' }, el('b', null, sid), el('span', { class: 'grow' }), btn('Edit map', () => { this.setTab('map'); this.mv.st.mapId = null; if (sc.map) this.mv.setMap(sc.map); this.renderMapUI(); }, 'sm'), btn('Settings', () => this.openLevel(sid), 'sm'), btn('Delete', async () => { if (Object.keys(cart.scenes).length < 2) return this.toast('A game needs at least one level.'); if (await this.confirm(`Delete level “${sid}”? Its map is deleted too. You can undo this.`, 'Delete', true)) { this.doc.transact('Delete level', () => { const mid = sc.map; this.doc.del(['scenes', sid]); if (mid && !Object.values(cart.scenes).some((s) => s.map === mid)) this.doc.del(['maps', mid]); if (cart.meta.start === sid) this.doc.set(['meta', 'start'], Object.keys(cart.scenes)[0]); }); this.mv && (this.mv.st.mapId = null); } }, 'sm danger')))), btn('＋ New level', () => this.newLevel(), 'add'));
      const mixNow = cart.meta.mix || {}, sounds = Object.keys(cart.sounds || {}).length, songs = Object.keys(cart.music || {}).length;
      box.append(el('h3', null, 'Sound'), el('div', { class: 'f-doc' }, `${songs} song${songs === 1 ? '' : 's'} and ${sounds} sound effect${sounds === 1 ? '' : 's'}. Music ${Math.round((mixNow.music == null ? 1 : mixNow.music) * 100)}%, effects ${Math.round((mixNow.sfx == null ? 1 : mixNow.sfx) * 100)}%.`),
        el('div', { class: 'row-end left' }, btn('🎚 Open the sound mixer', () => this.openMixer(), 'add primary')));
      box.append(el('h3', null, 'Game values'), el('div', { class: 'f-doc' }, 'Numbers and flags the whole game shares, like coins collected. Rules can read and change them.'), F.valuesEditor(ctx, ['vars'], cart.vars, { reserved: (n) => ['self', 'other', 'player', 'time', 'frame', 'scene', 'args'].includes(n) || !!S.allReg().components[n] }));
      box.append(el('h3', null, 'Safety net'), el('div', { class: 'row-end left' }, btn('Save a restore point', async () => { await this.saver.flush(); await this.lib.snapshot(this.meta.id, this.doc.cart, 'Restore point'); this.toast('Restore point saved.'); }, 'sm'), btn('Restore points…', () => this.openSnapshots(), 'sm'), btn('Export .dcart', async () => { await this.saver.flush(); this.download(this.meta.name, S.toDcart(this.doc.cart)); }, 'sm')),
        el('div', { class: 'f-doc' }, 'Your work is saved automatically. Extensions this game uses: ' + ((cart.meta.extensions || []).join(', ') || 'none') + '.'));
      F.paintIssues(box, this.report);
    },
    async openSnapshots() {
      const snaps = await this.lib.snapshots(this.meta.id);
      this.openSheet({ title: 'Restore points', render: (body, sheet) => { if (!snaps.length) body.append(el('div', { class: 'empty' }, 'None yet. The app makes one every so often, or use “Save a restore point”.')); for (const sn of snaps) body.append(el('div', { class: 'lvl-row' }, el('div', null, el('b', null, sn.label), el('small', null, ' ' + new Date(sn.ts).toLocaleString())), el('span', { class: 'grow' }), btn('Restore', async () => { if (!await this.confirm('Go back to this point? Your current version is saved as a restore point first.', 'Restore')) return; await this.saver.flush(); await this.lib.snapshot(this.meta.id, this.doc.cart, 'Before restore'); const cart = await this.lib.snapshotCart(this.meta.id, sn.ts); await this.lib.saveAll(this.meta.id, cart); this.closeSheet(sheet); await this.openProject(this.meta.id, { tab: 'game' }); this.toast('Restored.'); }, 'sm'))); } });
    },

    /* -------------------------------------------------------------------- play */
    startPlay(o) {
      const cart = S.clone(this.doc.cart);
      if (!this.runner) { this.runner = new DC2.Runner($('#playCanvas'), { onLoad: () => this.fitPlay(), onStats: (r) => { $('#playStats').textContent = r.world.errors.length ? '⚠ ' + r.world.errors[0].slice(0, 60) : ''; } }); }
      this.runner.load(cart, o); this.runner.start(); this.playing = true; this.fitPlay();
      const rep = this.runner.report; $('#playProblems').hidden = !rep || rep.ok; $('#playProblems').textContent = rep && !rep.ok ? 'This game has problems and cannot run yet. Tap ⚠ at the top to see them.' : '';
    },
    playHere(p) { this.setTab('play', true); const sid = this.sceneOfMap(this.mv.st.mapId); this.playing = false; this.startPlay({ scene: sid, at: p }); },
    fitPlay() { const cv = $('#playCanvas'), w = $('#playWrap'); if (!w.clientWidth) return; let s = Math.min(w.clientWidth / cv.width, w.clientHeight / cv.height); const si = Math.floor(s); if (si >= 1 && si / s > 0.82) s = si; cv.style.width = Math.floor(cv.width * s) + 'px'; cv.style.height = Math.floor(cv.height * s) + 'px'; },
    problems() {
      const r = this.report; if (!r.errors.length && !r.warnings.length) return this.toast('No problems found.');
      const go = (path) => { const [a, b] = path.split(/[.\[]/); this.closeAllSheets(); if (a === 'prefabs' && b) this.openThing(b); else if (a === 'maps' && b) { this.setTab('map'); this.mv.st.mapId = null; this.mv.setMap(b); this.renderMapUI(); } else if (a === 'scenes' && b) this.openLevel(b); else this.setTab('game'); };
      this.openSheet({ title: 'Problems', tall: true, live: true, render: (body) => { const items = [...this.report.errors.map((e) => ({ ...e, level: 'error' })), ...this.report.warnings.map((e) => ({ ...e, level: 'warn' }))]; if (!items.length) body.append(el('div', { class: 'empty' }, 'All clear!')); for (const it of items) body.append(el('button', { class: 'problem ' + it.level, type: 'button', onclick: () => go(it.path) }, el('b', null, (it.level === 'error' ? '⚠ ' : 'ⓘ ') + it.msg), el('small', null, it.path))); } });
    },
    menu() {
      const s = this.openSheet({ title: this.meta.name, render: (body) => body.append(el('div', { class: 'menu' },
        btn('Rename project', async () => { this.closeSheet(s); const n = await this.askText('Rename project', this.meta.name, 'Rename'); if (n) { await this.lib.rename(this.meta.id, n); this.meta.name = n; $('#projName').textContent = n; } }, 'menu-item'),
        btn('Save a restore point', async () => { this.closeSheet(s); await this.saver.flush(); await this.lib.snapshot(this.meta.id, this.doc.cart, 'Restore point'); this.toast('Restore point saved.'); }, 'menu-item'),
        btn('Restore points…', () => { this.closeSheet(s); this.openSnapshots(); }, 'menu-item'),
        btn('Export as .dcart file', async () => { this.closeSheet(s); await this.saver.flush(); this.download(this.meta.name, S.toDcart(this.doc.cart)); }, 'menu-item'),
        btn('All projects', () => { this.closeSheet(s); this.showProjects(); }, 'menu-item'))) });
    },

    /* -------------------------------------------------------------------- boot */
    async init() {
      let backend; try { backend = new S.IDBBackend(); await backend.open(); } catch (e) { backend = new S.MemoryBackend(); setTimeout(() => this.toast('Storage is unavailable here (private mode?). Your work will NOT be kept after closing.'), 600); }
      this.lib = new S.Library(backend);
      DC.Input.init();
      DC.Input.bindTouch({ dpad: $('#dpad'), dpadZone: $('#dpadZone'), faceZone: $('#faceZone'), faces: [...document.querySelectorAll('[data-face]')], buttons: [...document.querySelectorAll('[data-btn]')] });
      window.addEventListener('resize', () => { if (this.tab === 'play') this.fitPlay(); });
      if (window.ResizeObserver) new ResizeObserver(() => { if (this.tab === 'play') this.fitPlay(); }).observe($('#playWrap'));
      $('#btnNew').onclick = () => this.newProject(); $('#fileIn').onchange = (e) => { if (e.target.files[0]) this.importFile(e.target.files[0]); e.target.value = ''; };
      $('#btnBack').onclick = () => { if (this.tab === 'code' && this.leaveCode && !this.leaveCode()) return; this.showProjects(); }; $('#btnUndo').onclick = () => this.doc.undo(); $('#btnRedo').onclick = () => this.doc.redo(); $('#btnMenu').onclick = () => this.menu(); $('#btnProblems').onclick = () => this.problems();
      $('#projName').onclick = async () => { const n = await this.askText('Rename project', this.meta.name, 'Rename'); if (n) { await this.lib.rename(this.meta.id, n); this.meta.name = n; $('#projName').textContent = n; } };
      document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => this.setTab(b.dataset.tab)));
      document.querySelectorAll('#modeSeg button').forEach((b) => (b.onclick = () => { if (this.mv) { this.mv.st.mode = b.dataset.mode; this.mv.st.sel = null; this.renderMapUI(); this.mv.redraw(); } }));
      $('#zSolid').onclick = () => { if (this.mv) { this.mv.st.showSolid = !this.mv.st.showSolid; this.renderMapUI(); this.mv.redraw(); } }; $('#zSnap').onclick = () => { if (this.mv) { this.mv.st.snap = !this.mv.st.snap; this.renderMapUI(); this.toast(this.mv.st.snap ? 'Snap to grid: on' : 'Snap to grid: off'); } };
      $('#lvlBtn').onclick = () => this.levelMenu(); $('#zIn').onclick = () => this.mv.zoom(1.3); $('#zOut').onclick = () => this.mv.zoom(1 / 1.3); $('#zFit').onclick = () => this.mv.overview();
      $('#btnNewThing').onclick = () => this.newThing();
      $('#btnRestart').onclick = () => { this.playing = false; this.startPlay(); };
      $('#tapStart').onclick = () => { $('#tapStart').hidden = true; if (DC.Audio) DC.Audio.unlock(); };
      window.addEventListener('keydown', (e) => { if (!this.doc || e.target.matches('input,textarea,select')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.doc.redo() : this.doc.undo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.doc.redo(); } });
      window.addEventListener('keydown', (e) => {   // map selection shortcuts (desktop)
        if (!this.doc || this.tab !== 'map' || !this.mv || this.mv.st.mode !== 'tiles' || e.target.matches('input,textarea,select') || this.sheets.length) return;
        const mv = this.mv, st = mv.st, k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
        if (mod && k === 'c') { e.preventDefault(); mv.selCopy(false); } else if (mod && k === 'x') { e.preventDefault(); mv.selCopy(true); } else if (mod && k === 'v') { e.preventDefault(); mv.selPaste(); }
        else if (mod && k === 'a') { e.preventDefault(); mv.selAll(); } else if (mod && k === 'd') { e.preventDefault(); mv.selClear(); }
        else if ((k === 'delete' || k === 'backspace') && mv.sel() && !st.float) { e.preventDefault(); mv.selDelete(); }
        else if (k === 'enter' && st.float) { e.preventDefault(); mv.floatPlace(); }
        else if (k === 'escape') { if (st.float) mv.floatCancel(); else if (mv.sel()) mv.selClear(); }
      });
      window.addEventListener('beforeunload', () => { if (this.saver && this.saver.status !== 'saved') this.saver.flush(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.saver) this.saver.flush(); });
      const m = /#p=(.+)$/.exec(location.hash);
      if (m) { try { await this.lib.open(m[1]); return this.openProject(m[1]); } catch (e) { /* fall through */ } }
      this.showProjects();
    },
  });
  const M = () => S.map;
  window.addEventListener('DOMContentLoaded', () => app.init());
})();
