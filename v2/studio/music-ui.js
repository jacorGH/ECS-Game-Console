/* Studio music editor: a piano roll for the songs the engine plays.
   Tap a square to add a note, tap a note to remove it, drag along to make it longer. Tracks are the instruments; the noise
   track has drum lanes instead of pitches. While the song plays you can keep editing: the change is heard on the next beat
   and the song does not restart. Everything is saved as the plain text the engine reads (see audio-core.js). */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, S = DC2.studio, SND = S.snd, T = SND.track, M = SND.song, N = SND.note, F = DC2.forms, { el, btn } = F, app = window.DC2_STUDIO;
  const $ = (s) => document.querySelector(s), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLORS = SND.COLORS, WAVE = SND.WAVE_LABEL, GW = 46, RH = 22;
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const trackName = (t) => (t.wave === 'noise' ? 'Drums' : WAVE[t.wave] || 'Square');
  const pitchOf = (e) => (e.m != null ? e.m : e.hz > 0 ? N.ofFreq(e.hz) : null);
  const round3 = (x) => Math.round(x * 1000) / 1000;

  Object.assign(app, {
    songEdOpen() { return !!(this.songEd && this.songEd.id); },
    openSong(id, o) {
      if (!this.doc.cart.music[id]) return;
      if (this.sfx && this.sfx.id) this.closeSfx();
      if (!this.songEd) this.songEd = new SongEditor(this);
      this.songEd.open(id, o);
    },
    closeSong() { if (this.songEd) this.songEd.close(); $('#musicEditor').hidden = true; this.closeAllSheets(); if (this.tab === 'sound') this.renderSound(); },
    songRefresh() { if (this.songEd && this.songEd.id) { if (!this.doc.cart.music[this.songEd.id]) this.closeSong(); else this.songEd.refresh(); } },
    songLight() { if (this.songEd && this.songEd.id) this.songEd.redraw(); },
  });

  class SongEditor {
    constructor(a) {
      this.a = a; this.id = null; this.ti = 0; this.tool = 'draw'; this.len = 1; this.mute = new Set(); this.solo = null;
      this.key = { root: 0, scale: 'chromatic', lock: false };
      this.playing = false; this.start = 0; this.pos = -1; this.cw = 30; this.rh = 26; this.ox = 0; this.oy = 0;
      this.ptrs = new Map(); this.act = null; this.pinch = null; this.dpr = window.devicePixelRatio || 1; this._pc = new Map();
      const cv = (this.cv = $('#rollCanvas')); this.g = cv.getContext('2d');
      cv.addEventListener('pointerdown', (e) => this.down(e)); cv.addEventListener('pointermove', (e) => this.move(e));
      cv.addEventListener('pointerup', (e) => this.up(e)); cv.addEventListener('pointercancel', (e) => this.up(e));
      cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(cv.parentElement);
      $('#musBack').onclick = () => a.closeSong(); $('#musPlay').onclick = () => this.togglePlay();
      $('#musUndo').onclick = () => a.doc.undo(); $('#musRedo').onclick = () => a.doc.redo(); $('#musMore').onclick = () => this.songMenu();
      $('#rollZoomIn').onclick = () => this.zoom(1.25); $('#rollZoomOut').onclick = () => this.zoom(1 / 1.25); $('#rollFit').onclick = () => this.fit();
      document.addEventListener('keydown', (e) => { if (this.id && e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '') && !document.querySelector('.sheet')) { e.preventDefault(); this.togglePlay(); } });
    }
    /* ---------------------------------------------------------------- what we are editing */
    get def() { return this.a.doc.cart.music[this.id]; }
    get tracks() { return M.trackList(this.def); }
    get track() { return this.tracks[this.ti] || this.tracks[0]; }
    get steps() { return M.steps(this.def); }
    get per() { return M.perBar(this.def); }
    parsed(tr) {
      tr = tr || this.track; let p = this._pc.get(tr.notes);
      if (!p) { if (this._pc.size > 80) this._pc.clear(); p = T.parse(tr.notes); this._pc.set(tr.notes, p); }
      return p;
    }
    /* the rows of the piano roll for this track, high to low */
    rows() {
      const tr = this.track, ev = this.parsed().events, k = `${tr.wave}|${tr.notes}|${this.key.root}|${this.key.scale}|${this.key.lock}`;
      if (this._rk === k) return this._rows;
      let rows = SND.rows(tr, ev);
      if (tr.wave !== 'noise' && this.key.lock && this.key.scale !== 'chromatic') { const used = new Set(ev.map(pitchOf)); rows = rows.filter((r) => SND.inScale(r.m, this.key.root, this.key.scale) || used.has(r.m)); }
      this._rk = k; this._rows = rows; return rows;
    }
    rowOf(e, rows) {
      if (this.track.wave === 'noise') return rows.findIndex((r) => e.hz && Math.abs(r.hz - e.hz) / r.hz < 0.01);
      const m = pitchOf(e); return rows.findIndex((r) => r.m === m);
    }
    tokenOf(row) { return row.drum ? String(row.hz) : N.name(row.m); }
    /* ---------------------------------------------------------------- opening and closing */
    open(id, o) {
      const a = this.a; a.stopPreview(); a.stopSoundPreview(); M.prepare(a.doc, id);
      this.id = id; this.ti = 0; this.mute.clear(); this.solo = null; this.start = 0; this.pos = -1; this.playing = false; this._rk = null; this._pc.clear();
      const k = SND.detectKey(this.def); this.key = { root: k.root, scale: k.scale, lock: false };
      $('#musicEditor').hidden = false; $('#musName').textContent = id; this.cw = 30; this.ox = 0;
      this.resize(); this.buildAll(); this.centerOnNotes(); this.redraw();
      if (o && o.play) this.startPlay();
    }
    close() { this.stop(); this.id = null; this.act = null; this.ptrs.clear(); }
    /* the document changed (an edit, undo/redo, a rename): bring the screen up to date */
    refresh() {
      if (!this.id) return; this._rk = null; this.ti = clamp(this.ti, 0, this.tracks.length - 1); $('#musName').textContent = this.id;
      this.buildAll(); this.clampScroll(); this.redraw(); this.syncAudio();
    }
    buildAll() { this.buildSettings(); this.buildTracks(); this.buildStrip(); this.buildTools(); this.syncPlayButton(); }
    /* ---------------------------------------------------------------- the strips above and below the roll */
    stepper(minus, value, plus, valAttrs) {
      return el('span', { class: 'stepper' }, el('button', { type: 'button', 'aria-label': 'less', onclick: minus }, '−'), el('button', Object.assign({ type: 'button', class: 'val' }, valAttrs), value), el('button', { type: 'button', 'aria-label': 'more', onclick: plus }, '+'));
    }
    buildSettings() {
      const d = this.def, box = $('#musSettings'), bpm = Math.round(+d.bpm || 120), steps = this.steps, bars = steps / this.per; box.replaceChildren();
      box.append(this.stepper(() => this.setBpm(bpm - 4), `${bpm} bpm`, () => this.setBpm(bpm + 4), { 'data-act': 'bpm', 'aria-label': 'Tempo: tap to type', onclick: () => this.askBpm() }),
        this.stepper(() => this.setBars(-1), Number.isInteger(bars) ? `${bars} bar${bars === 1 ? '' : 's'}` : `${steps} steps`, () => this.setBars(1), { 'data-act': 'length', 'aria-label': 'Song length' }),
        el('button', { type: 'button', class: 'chip-btn', 'data-act': 'key', onclick: () => this.keySheet() }, `🎼 ${KEYS[this.key.root]} ${this.key.scale === 'chromatic' ? '(any key)' : this.key.scale === 'major' ? 'major' : this.key.scale === 'minor' ? 'minor' : SND.scales[this.key.scale].label.split(' ')[0].toLowerCase()}${this.key.lock ? ' 🔒' : ''}`));
    }
    buildTracks() {
      const box = $('#musTracks'); box.replaceChildren();
      this.tracks.forEach((t, i) => box.append(el('button', { type: 'button', class: 'chip-btn trackchip' + (i === this.ti ? ' on' : ''), 'data-track': i, style: this.mute.has(i) || (this.solo != null && this.solo !== i) ? 'opacity:.5' : null, onclick: () => this.selectTrack(i) }, el('i', { style: 'background:' + COLORS[i % COLORS.length] }), `${i + 1} ${trackName(t)}`)));
      box.append(el('button', { type: 'button', class: 'chip-btn', 'data-act': 'add-track', onclick: () => this.addTrackSheet() }, '＋ Track'));
    }
    buildStrip() {
      const box = $('#musStrip'), t = this.track, i = this.ti; box.replaceChildren();
      const out = el('output', null, Math.round((t.v == null ? 0.1 : t.v) * 100) + '%');
      const inp = el('input', { type: 'range', class: 'mx-range', min: 0, max: 100, step: 1, value: DC2.mixer.toPos(t.v == null ? 0.1 : t.v), 'aria-label': 'Track volume', 'data-mus': 'vol' });
      inp.oninput = () => { const v = round3(DC2.mixer.toLevel(+inp.value)); out.textContent = Math.round(v * 100) + '%'; this.a.suppress++; try { this.a.doc.set(['music', this.id, 'tracks', i, 'v'], v, { coalesce: true, label: 'Track volume' }); } finally { this.a.suppress--; } };
      box.append(el('button', { type: 'button', class: 'chip-btn warn' + (this.mute.has(i) ? ' on' : ''), 'data-act': 'mute', title: 'Silence this track while you work (not saved)', onclick: () => { this.mute.has(i) ? this.mute.delete(i) : this.mute.add(i); this.buildAll(); this.syncAudio(); } }, 'M'),
        el('button', { type: 'button', class: 'chip-btn' + (this.solo === i ? ' on' : ''), 'data-act': 'solo', title: 'Hear only this track (not saved)', onclick: () => { this.solo = this.solo === i ? null : i; this.buildAll(); this.syncAudio(); } }, 'S'),
        inp, out, el('button', { type: 'button', class: 'chip-btn', 'data-act': 'wave', onclick: () => this.waveSheet() }, trackName(t) + ' ▾'),
        el('button', { type: 'button', class: 'chip-btn', 'data-act': 'track-menu', 'aria-label': 'Track menu', onclick: () => this.trackMenu() }, '⋯'));
    }
    buildTools() {
      const box = $('#musTools'); box.replaceChildren();
      for (const [t, ico, lab] of [['draw', '✏️', 'Draw'], ['erase', '⌫', 'Erase'], ['pan', '✋', 'Move']]) box.append(el('button', { type: 'button', class: 'tool' + (this.tool === t ? ' on' : ''), 'data-tool': t, onclick: () => { this.tool = t; this.buildTools(); } }, el('span', null, ico), lab));
      box.append(el('span', { class: 'mini' }, 'Length'), ...[1, 2, 4, 8].map((n) => el('button', { type: 'button', class: 'chip-btn' + (this.len === n ? ' on' : ''), 'data-len': n, onclick: () => { this.len = n; this.buildTools(); } }, String(n))));
    }
    selectTrack(i) { this.ti = i; this._rk = null; this.buildAll(); this.centerOnNotes(); this.redraw(); }
    /* ---------------------------------------------------------------- song settings */
    setBpm(v) { this.a.doc.set(['music', this.id, 'bpm'], clamp(Math.round(v), 20, 400), { coalesce: true, label: 'Tempo' }); }
    async askBpm() { const n = await this.a.askText('Tempo (beats per minute)', String(Math.round(+this.def.bpm || 120)), 'Set'); const v = Math.round(parseFloat(n)); if (n !== null && v >= 20 && v <= 400) this.setBpm(v); else if (n !== null) this.a.toast('Pick a tempo from 20 to 400.'); }
    setBars(dir) { const bars = Math.round(this.steps / this.per) + dir; if (bars < 1 || bars > 32) return; M.setLength(this.a.doc, this.id, bars * this.per); }
    /* ---------------------------------------------------------------- the roll: size, scroll, zoom */
    resize() { const r = this.cv.parentElement.getBoundingClientRect(); if (!r.width) return; this.dpr = window.devicePixelRatio || 1; this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr); this.cssW = r.width; this.cssH = r.height; this.clampScroll(); this.redraw(); }
    clampScroll() {
      if (!this.cssW) return; const maxX = Math.max(0, this.steps * this.cw - (this.cssW - GW)), maxY = Math.max(0, this.rows().length * this.rh - (this.cssH - RH));
      this.ox = clamp(this.ox, 0, maxX); this.oy = clamp(this.oy, 0, maxY);
    }
    centerOnNotes() {
      if (!this.cssW) return; const rows = this.rows(), idx = this.parsed().events.map((e) => this.rowOf(e, rows)).filter((i) => i >= 0);
      const mid = idx.length ? (Math.min(...idx) + Math.max(...idx) + 1) / 2 : rows.length / 2; this.oy = mid * this.rh - (this.cssH - RH) / 2; this.clampScroll();
    }
    /* the roll follows the playhead while playing, but not for a few seconds after you scroll or zoom yourself */
    holdFollow() { this.hold = performance.now() + 4000; }
    zoom(f) { this.holdFollow(); const mid = (this.cssW - GW) / 2, before = (this.ox + mid) / this.cw; this.cw = clamp(this.cw * f, 10, 80); this.ox = before * this.cw - mid; this.clampScroll(); this.redraw(); }
    fit() { this.holdFollow(); this.cw = clamp((this.cssW - GW) / this.steps, 8, 80); this.ox = 0; this.clampScroll(); this.redraw(); }
    wheel(e) {
      e.preventDefault(); this.holdFollow();
      if (e.ctrlKey || e.metaKey) { this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); return; }
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.ox += e.deltaX || e.deltaY; else this.oy += e.deltaY;
      this.clampScroll(); this.redraw();
    }
    /* ---------------------------------------------------------------- drawing */
    redraw() {
      const g = this.g, W = this.cssW, H = this.cssH; if (!W || !this.id || !this.def) return;
      const def = this.def, rows = this.rows(), ev = this.parsed().events, steps = this.steps, per = this.per, div = +def.div || 2, cw = this.cw, rh = this.rh, ox = this.ox, oy = this.oy, key = this.key, noise = this.track.wave === 'noise';
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.fillStyle = '#17142a'; g.fillRect(0, 0, W, H);
      g.save(); g.beginPath(); g.rect(GW, RH, W - GW, H - RH); g.clip();
      rows.forEach((r, i) => {
        const y = RH + i * rh - oy; if (y > H || y + rh < RH) return;
        g.fillStyle = r.drum ? (i % 2 ? '#201c3a' : '#1c1932') : key.scale !== 'chromatic' ? (SND.inScale(r.m, key.root, key.scale) ? '#2a2552' : '#171428') : r.black ? '#1b1830' : '#221e3b';
        g.fillRect(GW, y, W - GW, rh);
        g.fillStyle = r.c ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.05)'; g.fillRect(GW, y + rh - 1, W - GW, 1);
      });
      const s0 = Math.max(0, Math.floor(ox / cw)), s1 = Math.min(steps, Math.ceil((ox + W - GW) / cw));
      for (let s = s0; s <= s1; s++) { const x = GW + s * cw - ox; g.fillStyle = s % per === 0 ? 'rgba(255,255,255,.32)' : s % div === 0 ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)'; g.fillRect(x, RH, 1, H - RH); }
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(GW + steps * cw - ox, RH, W, H - RH);   // past the end of the song
      if (!noise) this.tracks.forEach((t, ti) => {   // the other tracks, faint, to write against
        if (ti === this.ti || t.wave === 'noise') return; g.fillStyle = COLORS[ti % COLORS.length]; g.globalAlpha = 0.22;
        for (const e of this.parsed(t).events) { const m = pitchOf(e), ri = rows.findIndex((r) => r.m === m); if (ri < 0 || e.s > s1 || e.s + e.l < s0) continue; g.fillRect(GW + e.s * cw - ox, RH + ri * rh - oy + 5, e.l * cw - 1, rh - 10); }
        g.globalAlpha = 1;
      });
      g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      for (const e of ev) {
        const ri = this.rowOf(e, rows); if (ri < 0 || e.s > s1 || e.s + e.l < s0) continue;
        const x = GW + e.s * cw - ox, y = RH + ri * rh - oy, w = e.l * cw - 2;
        g.fillStyle = COLORS[this.ti % COLORS.length]; g.beginPath(); (g.roundRect || g.rect).call(g, x + 1, y + 2, w, rh - 4, 5); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke();
        if (w > 26 && !noise) { g.fillStyle = '#10101c'; g.fillText(e.tok, x + 6, y + rh / 2); }
      }
      if (this.pos >= 0) { const x = GW + this.pos * cw - ox; g.fillStyle = '#ffe14a'; g.fillRect(x - 1, RH, 2, H - RH); }
      g.restore();
      // pitch names down the left, like a keyboard
      g.fillStyle = '#1d1a33'; g.fillRect(0, RH, GW, H - RH); g.save(); g.beginPath(); g.rect(0, RH, GW, H - RH); g.clip(); g.textAlign = 'right';
      rows.forEach((r, i) => {
        const y = RH + i * rh - oy; if (y > H || y + rh < RH) return;
        if (r.drum) { g.fillStyle = '#2b2748'; g.fillRect(0, y, GW - 1, rh - 1); g.fillStyle = '#d9d2ff'; g.font = '10px system-ui, sans-serif'; g.fillText(r.label, GW - 5, y + rh / 2); return; }
        g.fillStyle = r.black ? '#3a3560' : '#e9e5f7'; g.fillRect(0, y, GW - 1, rh - 1);
        g.fillStyle = r.black ? '#bdb6e6' : '#2a2548'; g.font = (r.c ? 'bold ' : '') + '10px system-ui, sans-serif'; g.fillText(r.label, GW - 5, y + rh / 2);
      });
      g.restore();
      // ruler: bar numbers, beat ticks, the play-from marker
      g.fillStyle = '#25203f'; g.fillRect(0, 0, W, RH); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, RH - 1, W, 1);
      g.save(); g.beginPath(); g.rect(GW, 0, W - GW, RH); g.clip(); g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      for (let s = s0; s < Math.min(steps, s1 + 1); s++) { const x = GW + s * cw - ox; if (s % per === 0) { g.fillStyle = '#cfc8ff'; g.fillText(String(s / per + 1), x + 4, RH / 2); g.fillRect(x, 4, 1, RH - 8); } else if (s % div === 0) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, RH - 7, 1, 5); } }
      const sx = GW + this.start * cw - ox; g.fillStyle = '#4cc38a'; g.beginPath(); g.moveTo(sx, RH - 1); g.lineTo(sx + 7, RH - 1); g.lineTo(sx, RH - 10); g.fill();
      if (this.pos >= 0) { const x = GW + this.pos * cw - ox; g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(x - 5, 0); g.lineTo(x + 5, 0); g.lineTo(x, 8); g.fill(); }
      g.restore();
      g.fillStyle = '#25203f'; g.fillRect(0, 0, GW, RH);
    }
    /* ---------------------------------------------------------------- touch and mouse */
    pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    stepAtX(x, loose) { const s = Math.floor((x - GW + this.ox) / this.cw); return loose ? clamp(s, 0, this.steps - 1) : s; }
    cellAt(p) { const s = this.stepAtX(p.x), r = Math.floor((p.y - RH + this.oy) / this.rh); return s >= 0 && s < this.steps && r >= 0 && r < this.rows().length ? { s, r } : null; }
    down(e) {
      if (!this.id) return; this.cv.setPointerCapture(e.pointerId); const p = this.pt(e); this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size === 2) { this.cancelAct(); const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cw: this.cw, ox: this.ox, oy: this.oy, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
      if (this.ptrs.size > 2) return;
      if (p.y < RH && p.x >= GW) { this.setStart(clamp(this.stepAtX(p.x), 0, this.steps - 1)); return; }
      if (p.x < GW) { const r = this.rows()[Math.floor((p.y - RH + this.oy) / this.rh)]; if (r && p.y >= RH) this.audition(r); return; }
      const c = this.cellAt(p); if (!c && this.tool !== 'pan') return;
      if (this.tool === 'pan') { this.act = { type: 'pan', px: p.x, py: p.y, ox: this.ox, oy: this.oy }; return; }
      if (this.a.doc.group) return;
      this.a.doc.begin(this.tool === 'erase' ? 'Erase notes' : 'Edit notes');
      if (this.tool === 'erase') { this.act = { type: 'erase' }; this.eraseAt(c); return; }
      const ev = this.parsed().events, rows = this.rows(), cover = T.at(ev, c.s);
      if (cover && this.rowOf(cover, rows) === c.r) this.act = { type: 'note', start: cover.s, s0: c.s, moved: false };   // an existing note: tap removes, drag lengthens
      else { this.audition(rows[c.r]); this.setEvents(T.place(ev, this.steps, c.s, this.len, this.tokenOf(rows[c.r]))); this.act = { type: 'new', s0: c.s, len: this.len }; }
    }
    move(e) {
      if (!this.ptrs.has(e.pointerId)) return; const p = this.pt(e); this.ptrs.set(e.pointerId, p);
      if (this.pinch && this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, pn = this.pinch, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const anchor = (pn.ox + pn.mx - GW) / pn.cw; this.holdFollow(); this.cw = clamp(pn.cw * (d / pn.d), 10, 80); this.ox = anchor * this.cw - (mx - GW); this.oy = pn.oy + (pn.my - my); this.clampScroll(); this.redraw(); return;
      }
      const a = this.act; if (!a) return;
      if (a.type === 'pan') { this.holdFollow(); this.ox = a.ox - (p.x - a.px); this.oy = a.oy - (p.y - a.py); this.clampScroll(); this.redraw(); return; }
      if (a.type === 'erase') { const c = this.cellAt(p); if (c) this.eraseAt(c); return; }
      const cs = this.stepAtX(p.x, true);
      if (a.type === 'new') { const len = Math.max(1, cs - a.s0 + 1); if (len !== a.len) { a.len = len; this.setEvents(T.resize(this.parsed().events, this.steps, a.s0, len)); } }
      else if (a.type === 'note') {
        if (cs !== a.s0) a.moved = true;
        if (a.moved) { const len = Math.max(1, cs - a.start + 1), cur = this.parsed().events.find((x) => x.s === a.start); if (cur && cur.l !== len) this.setEvents(T.resize(this.parsed().events, this.steps, a.start, len)); }
      }
    }
    up(e) {
      this.ptrs.delete(e.pointerId); if (this.pinch && this.ptrs.size < 2) this.pinch = null;
      const a = this.act; if (!a || this.ptrs.size) return; this.act = null;
      if (a.type === 'note' && !a.moved) this.setEvents(T.erase(this.parsed().events, a.start));   // a tap on a note removes it
      if (a.type !== 'pan') this.a.doc.end();
    }
    cancelAct() { const a = this.act; this.act = null; if (a && a.type !== 'pan' && this.a.doc.group) this.a.doc.end(); }
    eraseAt(c) {
      const rows = this.rows(), ev = this.parsed().events, hit = T.at(ev, c.s);
      if (hit && Math.abs(this.rowOf(hit, rows) - c.r) <= 1) this.setEvents(T.erase(ev, c.s));
    }
    /* write the notes of this track (inside a gesture this is part of one undo step), and keep the sound and picture current */
    setEvents(events) { M.setNotes(this.a.doc, this.id, this.ti, events, this.steps); this._rk = null; this.redraw(); this.syncAudio(); }
    audition(row) {
      if (!row) return; DC.Audio.unlock(); DC2.mixer.apply(this.a.doc.cart);
      const t = this.track, v = clamp((t.v == null ? 0.1 : t.v) * 1.5, 0.05, 0.3);
      if (row.drum) DC.Audio.blip('noise', row.hz, 0.09, v); else DC.Audio.blip(t.wave, N.freq(row.m), 0.22, v);
    }
    setStart(s) { this.start = s; if (this.playing) this.startPlay(); this.redraw(); }
    /* ---------------------------------------------------------------- playing */
    previewDef() { return M.preview(this.def, { solo: this.solo, mute: [...this.mute] }); }
    togglePlay() { if (this.playing) this.stop(); else this.startPlay(); }
    startPlay() {
      const a = this.a; DC.Audio.unlock(); DC2.mixer.apply(a.doc.cart); a.stopPreview(); a.stopSoundPreview(); DC.Audio.stopMusic();
      DC.Audio.playMusic('@editor', this.previewDef(), this.start); this.playing = true; this.syncPlayButton(); this.follow();
    }
    stop() {
      cancelAnimationFrame(this.raf); this.playing = false; this.pos = -1; if (DC.Audio && DC.Audio.songName === '@editor') DC.Audio.stopMusic();
      this.syncPlayButton(); this.redraw();
    }
    /* the song changed while playing (an edit, mute, solo, tempo): swap it in without restarting */
    syncAudio() { if (this.playing && DC.Audio.songName === '@editor') DC.Audio.updateSong(this.previewDef()); }
    syncPlayButton() { const b = $('#musPlay'); b.textContent = this.playing ? '■ Stop' : '▶ Play'; b.setAttribute('aria-label', this.playing ? 'Stop' : 'Play the song'); }
    follow() {
      cancelAnimationFrame(this.raf); if (!this.playing) return;
      const p = DC.Audio.songPos();
      if (p < 0) { this.playing = false; this.pos = -1; this.syncPlayButton(); this.redraw(); return; }   // a song that plays once reached its end
      this.pos = p; const x = GW + p * this.cw - this.ox;
      if ((x > this.cssW - 30 || x < GW) && !(this.hold > performance.now())) { this.ox = p * this.cw - (this.cssW - GW) / 4; this.clampScroll(); }
      this.redraw(); this.raf = requestAnimationFrame(() => this.follow());
    }
    /* ---------------------------------------------------------------- sheets and menus */
    waveSheet() {
      const a = this.a, i = this.ti, s = a.openSheet({ title: 'Instrument sound', render: (body) => {
        body.append(el('div', { class: 'f-doc' }, 'Square is the classic chip sound, triangle is soft (good for bass), saw is buzzy, sine is pure, noise is for drums.'));
        const row = el('div', { class: 'segrow' });
        for (const w of SND.WAVES) row.append(el('button', { type: 'button', class: 'chip-btn' + (this.track.wave === w ? ' on' : ''), 'data-wave': w, onclick: () => { a.closeSheet(s); a.doc.set(['music', this.id, 'tracks', i, 'wave'], w, { label: 'Instrument' }); this.selectTrack(i); } }, w === 'noise' ? 'Drums (noise)' : WAVE[w]));
        body.append(row);
      } });
    }
    addTrackSheet() {
      const a = this.a, s = a.openSheet({ title: 'Add a track', render: (body) => {
        body.append(el('div', { class: 'f-doc' }, 'Each track plays one note at a time. Add more tracks to play chords and bass and drums together.'));
        for (const [k, v] of Object.entries(SND.trackKinds)) body.append(btn(`${v.label} (${v.wave === 'noise' ? 'drums' : v.wave})`, () => { a.closeSheet(s); const i = M.addTrack(a.doc, this.id, k); this.selectTrack(i); this.syncAudio(); }, 'menu-item'));
      } });
    }
    keySheet() {
      const a = this.a, s = a.openSheet({ title: 'Key', render: (body) => {
        body.append(el('div', { class: 'f-doc' }, 'Notes in the key are highlighted on the roll, so anything you place there sounds right together. Turn on “Only show notes in the key” to hide the rest.'),
          el('div', { class: 'f-label' }, 'Starting note'), el('div', { class: 'keygrid' }, ...KEYS.map((k, i) => el('button', { type: 'button', class: 'chip-btn' + (this.key.root === i ? ' on' : ''), 'data-key': k, onclick: () => { this.key.root = i; this._rk = null; this.afterKey(s); } }, k))),
          el('div', { class: 'f-label' }, 'Scale'));
        const row = el('div', { class: 'segrow' });
        for (const [k, v] of Object.entries(SND.scales)) row.append(el('button', { type: 'button', class: 'chip-btn' + (this.key.scale === k ? ' on' : ''), 'data-scale': k, onclick: () => { this.key.scale = k; this._rk = null; this.afterKey(s); } }, v.label));
        body.append(row, el('div', { class: 'segrow', style: 'margin-top:10px' },
          el('button', { type: 'button', class: 'chip-btn' + (this.key.lock ? ' on' : ''), 'data-act': 'lock', onclick: () => { this.key.lock = !this.key.lock; this._rk = null; this.afterKey(s); } }, this.key.lock ? '🔒 Only notes in the key' : 'Only show notes in the key'),
          el('button', { type: 'button', class: 'chip-btn', 'data-act': 'detect', onclick: () => { const k = SND.detectKey(this.def); this.key = { root: k.root, scale: k.scale, lock: this.key.lock }; this._rk = null; this.afterKey(s); } }, 'Work it out from my notes')));
      } });
    }
    afterKey(sheet) { this.a.renderSheet(sheet); this.buildSettings(); this.clampScroll(); this.redraw(); }
    trackMenu() {
      const a = this.a, i = this.ti, t = this.track, noise = t.wave === 'noise', n = this.tracks.length;
      const s = a.openSheet({ title: `Track ${i + 1}: ${trackName(t)}`, render: (body) => {
        const item = (label, fn, cls) => body.append(btn(label, () => { a.closeSheet(s); fn(); }, 'menu-item' + (cls ? ' ' + cls : '')));
        item('Make up notes for this track', () => this.fillTrack());
        if (!noise) { item('Move all notes up a step (semitone)', () => this.transpose(1)); item('Move all notes down a step', () => this.transpose(-1)); item('Up an octave', () => this.transpose(12)); item('Down an octave', () => this.transpose(-12)); }
        item('Clear every note', () => { M.setNotes(a.doc, this.id, i, [], this.steps, { label: 'Clear track' }); });
        item('Make a copy of this track', () => { a.doc.insert(['music', this.id, 'tracks'], i + 1, S.clone(t), 'Copy track'); this.selectTrack(i + 1); });
        if (i > 0) item('Move track earlier', () => { this.ti = M.moveTrack(a.doc, this.id, i, -1); });
        if (i < n - 1) item('Move track later', () => { this.ti = M.moveTrack(a.doc, this.id, i, 1); });
        if (n > 1) item('Delete this track', async () => { if (await a.confirm(`Delete track ${i + 1}? You can undo this.`, 'Delete', true)) { M.removeTrack(a.doc, this.id, i); this.ti = Math.max(0, i - 1); this.mute.clear(); this.solo = null; this._rk = null; this.refresh(); } }, 'danger');
      } });
    }
    transpose(semis) { M.setNotes(this.a.doc, this.id, this.ti, T.transpose(this.parsed().events, semis), this.steps, { label: 'Transpose' }); this.a.doc.cart.music[this.id] && this.centerOnNotes(); }
    /* new notes for the selected track, in the key shown above, in the style of its instrument */
    fillTrack() {
      const t = this.track, bars = Math.max(1, Math.round(this.steps / 8)), scale = this.key.scale === 'chromatic' ? 'major' : this.key.scale;
      const g = SND.gen.song({ root: this.key.root, scale, bars: Math.min(bars, 16), seed: (Math.random() * 1e9) | 0 }), from = g.tracks[t.wave === 'noise' ? 3 : t.wave === 'triangle' || t.wave === 'sine' ? 1 : 0];
      M.setNotes(this.a.doc, this.id, this.ti, T.setSteps(T.parse(from.notes).events, this.steps), this.steps, { label: 'Make up notes' }); this.centerOnNotes(); this.redraw(); this.startIfIdle();
    }
    startIfIdle() { if (!this.playing) this.startPlay(); }
    songMenu() {
      const a = this.a, id = this.id;
      const s = a.openSheet({ title: id, render: (body) => {
        const item = (label, fn, cls) => body.append(btn(label, () => { a.closeSheet(s); fn(); }, 'menu-item' + (cls ? ' ' + cls : '')));
        item('Play this song in a level…', () => this.levelSheet());
        item('Rename', async () => { const n = await a.askText('Rename song', id, 'Rename'); if (!n || n === id) return; this.id = n; /* before the change is announced, so the editor follows the song instead of closing */ try { M.rename(a.doc, id, n); this.refresh(); a.toast('Renamed. Levels that play it were updated.'); } catch (e) { this.id = id; a.toast(e.message); } });
        item('Song settings…', () => this.settingsSheet());
        item('Make a copy', () => { const c = M.duplicate(a.doc, id); this.stop(); this.open(c); a.toast('Copied as “' + c + '”.'); });
        item('Delete', async () => { const lv = M.usage(a.doc.cart, id); if (!await a.confirm(`Delete the song “${id}”?` + (lv.length ? ` ${lv.join(', ')} will have no music.` : '') + ' You can undo this.', 'Delete', true)) return; this.stop(); M.remove(a.doc, id); a.closeSong(); }, 'danger');
      } });
    }
    settingsSheet() {
      const a = this.a, s = a.openSheet({ title: 'Song settings', render: (body) => {
        const div = +this.def.div || 2;
        body.append(el('div', { class: 'f-label' }, 'Steps in each beat'), el('div', { class: 'f-doc' }, 'How finely you can place notes. Changing it keeps the song sounding the same (the tempo is adjusted to match) and only changes where the bar lines fall.'));
        const row = el('div', { class: 'segrow' });
        for (const d of [1, 2, 3, 4]) row.append(el('button', { type: 'button', class: 'chip-btn' + (div === d ? ' on' : ''), 'data-div': d, onclick: () => { this.setDiv(d); a.renderSheet(s); } }, String(d)));
        body.append(row, el('div', { class: 'f-label', style: 'margin-top:14px' }, 'When it reaches the end'), el('div', { class: 'segrow' },
          el('button', { type: 'button', class: 'chip-btn' + (this.def.loop === false ? '' : ' on'), 'data-loop': 'on', onclick: () => { a.doc.set(['music', this.id, 'loop'], true, { label: 'Loop' }); a.renderSheet(s); } }, '🔁 Start again'),
          el('button', { type: 'button', class: 'chip-btn' + (this.def.loop === false ? ' on' : ''), 'data-loop': 'off', onclick: () => { a.doc.set(['music', this.id, 'loop'], false, { label: 'Play once' }); a.renderSheet(s); } }, 'Stop')));
      } });
    }
    setDiv(d) {
      const doc = this.a.doc, old = +this.def.div || 2, bpm = (+this.def.bpm || 120) * old / d;
      if (d === old) return; if (!(bpm >= 20 && bpm <= 400)) { this.a.toast('That would make the tempo too fast or slow.'); return; }
      doc.transact('Steps per beat', () => { doc.set(['music', this.id, 'div'], d); doc.set(['music', this.id, 'bpm'], Math.round(bpm * 100) / 100); });
    }
    levelSheet() {
      const a = this.a, id = this.id, s = a.openSheet({ title: 'Play “' + id + '” in…', live: true, gone: () => !a.doc.cart.music[id], render: (body) => {
        const cart = a.doc.cart; body.append(el('div', { class: 'f-doc' }, 'Pick the levels that should play this song. A level plays one song.'));
        for (const sc of Object.keys(cart.scenes)) {
          const cur = cart.scenes[sc].music, on = cur === id;
          body.append(el('div', { class: 'lvl-row', 'data-level': sc }, el('b', null, sc), el('small', null, on ? 'plays this song' : cur ? 'plays “' + cur + '”' : 'no music'), el('span', { class: 'grow' }),
            btn(on ? 'Remove' : cur ? 'Use this instead' : 'Use here', () => { if (on) a.doc.del(['scenes', sc, 'music'], 'Remove music'); else a.doc.set(['scenes', sc, 'music'], id, { label: 'Level music' }); }, 'sm' + (on ? '' : ' primary'))));
        }
      } });
    }
  }
})();
