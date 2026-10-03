/* Studio sound: the Sound tab (every sound effect and song, with ▶), the "new" sheets, and the sound-effect editor.
   The editor is a pitch graph you drag on (up = higher), with wave, length and volume controls and one-tap kinds
   (coin, jump, laser...). Everything is saved as the small { wave, f, d, v } object the engine plays. */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, S = DC2.studio, SND = S.snd, X = SND.sfx, N = SND.note, F = DC2.forms, { el, btn } = F, app = window.DC2_STUDIO;
  const $ = (s) => document.querySelector(s), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLORS = (SND.COLORS = ['#7b6cf6', '#4cc38a', '#e7b331', '#ff6b6b', '#5ab4ff', '#ff8fd0', '#9be15d', '#ffa94d']);
  const WAVE = (SND.WAVE_LABEL = { square: 'Square', sawtooth: 'Saw', triangle: 'Triangle', sine: 'Sine', noise: 'Noise' });
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const roundHz = (hz) => (hz >= 200 ? Math.round(hz) : Math.round(hz * 10) / 10);
  const fmtHz = (hz) => (hz >= 1000 ? (hz / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + ' kHz' : Math.round(hz) + ' Hz');
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  /* the length slider is a log scale from 0.02 s to 3 s, because most sounds are short */
  const posToLen = (p) => Math.round(0.02 * Math.pow(150, p / 100) * 200) / 200;
  const lenToPos = (d) => Math.round((Math.log(clamp(d, 0.02, 3) / 0.02) / Math.log(150)) * 100);
  const fmtLen = (d) => (d < 1 ? Math.round(d * 1000) + ' ms' : d.toFixed(2).replace(/0$/, '') + ' s');

  /* small pictures for the cards */
  function thumbSfx(def) {
    const c = el('canvas', { width: 260, height: 88 }), g = c.getContext('2d'), d = X.norm(def), n = 60, pts = X.curve(d, n), env = X.envelope(d, n);
    g.fillStyle = 'rgba(123,108,246,.28)'; g.beginPath(); g.moveTo(8, 82); env.forEach((e, i) => g.lineTo(8 + (i / (n - 1)) * 244, 82 - e * 44)); g.lineTo(252, 82); g.fill();
    g.strokeStyle = d.wave === 'noise' ? '#ffa94d' : '#9d90ff'; g.lineWidth = d.wave === 'noise' ? 8 : 4; g.lineJoin = 'round'; g.beginPath();
    pts.forEach((hz, i) => { const x = 8 + (i / (n - 1)) * 244, y = 6 + X.hzToY(hz, 76); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    return c;
  }
  function thumbSong(def) {
    const c = el('canvas', { width: 260, height: 88 }), g = c.getContext('2d'), tracks = SND.song.trackList(def), steps = SND.song.steps(def), parsed = tracks.map((t) => SND.track.parse(t.notes).events);
    const ms = parsed.flat().map((e) => e.m).filter((m) => m != null), lo = ms.length ? Math.min(...ms) : 48, hi = ms.length ? Math.max(...ms) : 72, span = Math.max(12, hi - lo);
    parsed.forEach((ev, ti) => {
      g.fillStyle = COLORS[ti % COLORS.length]; const noise = tracks[ti].wave === 'noise';
      for (const e of ev) { const x = 8 + (e.s / steps) * 244, w = Math.max(2, (e.l / steps) * 244 - 1); if (noise) g.fillRect(x, 80 - clamp(Math.log(e.hz || 1000) / Math.log(9000), 0, 1) * 8, w, 3); else if (e.m != null) g.fillRect(x, 8 + (1 - (e.m - lo) / span) * 64, w, 4); }
    });
    return c;
  }

  Object.assign(app, {
    /* ------------------------------------------------------------------ the Sound tab */
    renderSound() {
      const cart = this.doc.cart, box = $('#soundGrid'); box.replaceChildren();
      const sounds = Object.keys(cart.sounds || {}), songs = Object.keys(cart.music || {});
      box.append(el('div', { class: 'art-sec' }, el('h3', null, 'Sound effects'), el('small', null, 'short sounds your rules play'), btn('＋ New sound', () => this.newSound(), 'sm')));
      if (!sounds.length) box.append(el('div', { class: 'empty' }, 'No sound effects yet. Tap “New sound” and pick a kind: coin, jump, laser…'));
      for (const id of sounds) {
        const n = X.norm(cart.sounds[id]), uses = X.usage(cart, id);
        box.append(el('div', { class: 'thing sndcard', 'data-sound': id, role: 'button', tabindex: 0, onclick: () => this.openSfx(id) },
          thumbSfx(n), el('div', { class: 'sndname' }, el('b', null, id), btn('▶', (e) => { e.stopPropagation(); this.playSfx(id); }, 'sq sndplay', 'play ' + id)), el('small', null, `${WAVE[n.wave]} · ${fmtLen(n.d)}` + (uses ? ` · used ${uses}×` : ''))));
      }
      box.append(el('div', { class: 'art-sec' }, el('h3', null, 'Music'), el('small', null, 'songs that play in your levels'), btn('＋ New song', () => this.newSong(), 'sm')));
      if (!songs.length) box.append(el('div', { class: 'empty' }, 'No songs yet. Tap “New song”: you can have one made for you in a mood and key, then change any note.'));
      for (const id of songs) {
        const def = cart.music[id], tracks = SND.song.trackList(def), steps = SND.song.steps(def), per = SND.song.perBar(def), levels = SND.song.usage(cart, id), on = this.listSong === id;
        box.append(el('div', { class: 'thing sndcard', 'data-song': id, role: 'button', tabindex: 0, onclick: () => this.openSong(id) },
          thumbSong(def), el('div', { class: 'sndname' }, el('b', null, id), btn(on ? '■' : '▶', (e) => { e.stopPropagation(); this.toggleListSong(id); }, 'sq sndplay' + (on ? ' on' : ''), on ? 'stop' : 'play ' + id)),
          el('small', null, `${def.bpm || 120} bpm · ${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${Math.round(steps / per)} bars` + (levels.length ? ` · plays in ${levels.slice(0, 2).join(', ')}${levels.length > 2 ? '…' : ''}` : ' · not used yet'))));
      }
    },
    /* ------------------------------------------------------------------ hearing things */
    playSfxDef(def) { DC.Audio.unlock(); DC2.mixer.apply(this.doc.cart); DC.Audio.play('@sfx', def); },
    playSfx(id) { if (this.doc.cart.sounds[id]) this.playSfxDef(this.doc.cart.sounds[id]); },
    toggleListSong(id) {
      const was = this.listSong === id; this.stopSoundPreview();
      if (!was && this.doc.cart.music[id]) { DC.Audio.unlock(); DC2.mixer.apply(this.doc.cart); this.mixPreview = null; DC.Audio.stopMusic(); DC.Audio.playMusic('@list', this.doc.cart.music[id]); this.listSong = id; }
      this.renderSound();
    },
    stopSoundPreview() { if (this.listSong) { if (DC.Audio.songName === '@list') DC.Audio.stopMusic(); this.listSong = null; } },
    /* ------------------------------------------------------------------ making new ones */
    newSound() {
      const s = this.openSheet({ title: 'New sound effect', render: (body) => {
        body.append(el('div', { class: 'f-doc' }, 'Pick a kind. You get a random one of that kind to start from, then change anything.'));
        const grid = el('div', { class: 'kindgrid' });
        for (const k of X.kinds) grid.append(el('button', { type: 'button', class: 'kind', 'data-kind': k.id, onclick: () => { this.closeSheet(s); this.createSound(k.id); } }, el('span', null, k.icon), k.label));
        grid.append(el('button', { type: 'button', class: 'kind', 'data-kind': 'blank', onclick: () => { this.closeSheet(s); this.createSound('blank'); } }, el('span', null, '＋'), 'Blank'));
        body.append(grid);
      } });
    },
    async createSound(kind) {
      const k = X.kinds.find((x) => x.id === kind), name = await this.askText('Name this sound', S.slug(kind === 'blank' ? 'sound' : kind, this.doc.cart.sounds || {}), 'Create'); if (name === null) return;
      const def = kind === 'blank' ? X.norm({ wave: 'square', f: [440, 880], d: 0.2, v: 0.2 }) : X.make(kind, (Math.random() * 1e9) | 0);
      const id = X.add(this.doc, name || (k ? k.id : 'sound'), def);
      this.openSfx(id); this.playSfx(id);
    },
    newSong() {
      const o = { style: 'happy', root: 0, bars: 4 };
      const s = this.openSheet({ title: 'New song', tall: true, render: (body) => {
        const seg = (cur, list, set) => el('div', { class: 'segrow' }, ...list.map(([v, l]) => el('button', { type: 'button', class: 'chip-btn' + (cur === v ? ' on' : ''), 'data-v': String(v), onclick: () => { set(v); this.renderSheet(s); } }, l)));
        body.append(el('h3', null, 'Make me a song'), el('div', { class: 'f-doc' }, 'You get a four-instrument tune (melody, bass, arpeggio, drums) that you can change note by note.'),
          el('div', { class: 'f-label' }, 'Mood'), seg(o.style, Object.entries(SND.styles).map(([k, v]) => [k, v.label]), (v) => { o.style = v; }),
          el('div', { class: 'f-label', style: 'margin-top:10px' }, 'Key'), el('div', { class: 'keygrid' }, ...KEYS.map((k, i) => el('button', { type: 'button', class: 'chip-btn' + (o.root === i ? ' on' : ''), 'data-key': k, onclick: () => { o.root = i; this.renderSheet(s); } }, k))),
          el('div', { class: 'f-label' }, 'Length'), seg(o.bars, [[4, '4 bars'], [8, '8 bars']], (v) => { o.bars = v; }),
          btn('🎲 Make a song', () => { this.closeSheet(s); this.createSong(SND.gen.song({ style: o.style, root: o.root, bars: o.bars, seed: (Math.random() * 1e9) | 0 }), o.style); }, 'add primary'),
          el('h3', null, 'Or start from nothing'), btn('Empty song', () => { this.closeSheet(s); this.createSong(SND.song.blank(4), 'song'); }, 'add'));
      } });
    },
    async createSong(def, hint) {
      const name = await this.askText('Name this song', S.slug(hint || 'song', this.doc.cart.music || {}), 'Create'); if (name === null) return;
      const id = SND.song.add(this.doc, name || hint || 'song', def);
      this.openSong(id, { play: true });
    },
    closeSoundEditors() { if (this.sfx && this.sfx.id) this.closeSfx(); if (this.closeSong) this.closeSong(); this.stopSoundPreview(); },
    /* ------------------------------------------------------------------ keeping an open editor in step with the document */
    sndRefresh() {
      if (this.sfx && this.sfx.id) { if (!this.doc.cart.sounds[this.sfx.id]) this.closeSfx(); else this.sfx.sync(); }
      if (this.songRefresh) this.songRefresh();
    },
    sndLight() { if (this.sfx && this.sfx.id) { this.sfx.draw(); this.sfx.syncReadout(); } if (this.songLight) this.songLight(); },
    /* ------------------------------------------------------------------ the sound-effect editor */
    openSfx(id) {
      if (!this.doc.cart.sounds[id]) return;
      if (this.songEdOpen && this.songEdOpen()) this.closeSong();
      $('#sfxEditor').hidden = false;
      if (!this.sfx) this.sfx = new SfxEditor(this);
      this.sfx.open(id);
    },
    closeSfx() { if (this.sfx) this.sfx.close(); $('#sfxEditor').hidden = true; this.closeAllSheets(); if (this.tab === 'sound') this.renderSound(); },
  });

  class SfxEditor {
    constructor(a) {
      this.a = a; this.id = null; this.auto = true; this.snap = true; this.sweep = null; this.drag = null; this.timer = 0; this.dpr = window.devicePixelRatio || 1;
      this.cv = $('#sfxCanvas'); this.g = this.cv.getContext('2d');
      this.cv.addEventListener('pointerdown', (e) => this.down(e)); this.cv.addEventListener('pointermove', (e) => this.move(e));
      this.cv.addEventListener('pointerup', (e) => this.up(e)); this.cv.addEventListener('pointercancel', (e) => this.up(e));
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.cv.parentElement);
      $('#sfxBack').onclick = () => a.closeSfx(); $('#sfxPlay').onclick = () => this.play(); $('#sfxUndo').onclick = () => a.doc.undo(); $('#sfxRedo').onclick = () => a.doc.redo(); $('#sfxMore').onclick = () => this.menu();
      this.buildKinds(); this.buildControls();
    }
    get raw() { return this.a.doc.cart.sounds[this.id]; }
    get def() { return X.norm(this.raw); }
    open(id) { this.id = id; $('#sfxName').textContent = id; this.resize(); this.sync(); $('.sfx-body').scrollTop = 0; }
    close() { clearTimeout(this.timer); this.id = null; this.drag = null; }
    resize() { const r = this.cv.parentElement.getBoundingClientRect(); if (!r.width) return; this.dpr = window.devicePixelRatio || 1; this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr); this.cssW = r.width; this.cssH = r.height; this.draw(); }
    pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    plot() { const x0 = 40, x1 = this.cssW - 12, y0 = 10, y1 = this.cssH - 22; return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 }; }
    tx(u, P) { return P.x0 + 14 + u * (P.w - 28); }

    /* ---- controls */
    buildKinds() {
      const row = $('#sfxKinds'); row.replaceChildren();
      for (const k of X.kinds) row.append(el('button', { type: 'button', class: 'chip-btn', 'data-kind': k.id, onclick: () => this.make(k) }, k.icon + ' ' + k.label));
    }
    buildControls() {
      const box = $('#sfxControls'), u = (this.ui = {}); box.replaceChildren();
      const label = (t, small) => el('div', { class: 'f-label' }, t, small ? el('small', null, small) : null);
      u.waves = {}; const wrow = el('div', { class: 'segrow' });
      for (const w of SND.WAVES) { u.waves[w] = el('button', { type: 'button', class: 'chip-btn', 'data-wave': w, onclick: () => this.setWave(w) }, WAVE[w]); wrow.append(u.waves[w]); }
      u.modes = {}; const mrow = el('div', { class: 'segrow' });
      for (const [m, t] of [['steady', 'One pitch'], ['slide', 'Slide'], ['steps', 'Steps']]) { u.modes[m] = el('button', { type: 'button', class: 'chip-btn', 'data-mode': m, onclick: () => this.setMode(m) }, t); mrow.append(u.modes[m]); }
      u.stepper = el('span', { class: 'stepper' }, el('button', { type: 'button', 'aria-label': 'Fewer steps', onclick: () => this.addStep(-1) }, '−'), (u.stepN = el('span', { class: 'val' })), el('button', { type: 'button', 'aria-label': 'More steps', onclick: () => this.addStep(1) }, '+')); mrow.append(u.stepper);
      u.read = el('div', { class: 'sfx-read' });
      const slider = (name, key) => {
        const out = el('output', null), inp = el('input', { type: 'range', class: 'mx-range', min: 0, max: 100, step: 1, value: 0, 'aria-label': name, 'data-sfx': key });
        inp.oninput = () => this.onSlider(key, +inp.value); inp.onchange = () => this.maybePlay(0);
        return { row: el('div', { class: 'sfx-ctl' }, el('span', null, name), inp, out), inp, out };
      };
      u.len = slider('Length', 'd'); u.vol = slider('Volume', 'v');
      u.snapBtn = el('button', { type: 'button', class: 'chip-btn', onclick: () => { this.snap = !this.snap; this.syncToggles(); } }, 'Snap pitch to notes');
      u.autoBtn = el('button', { type: 'button', class: 'chip-btn', onclick: () => { this.auto = !this.auto; this.syncToggles(); } }, 'Play after each change');
      u.vary = el('button', { type: 'button', class: 'chip-btn', 'data-act': 'vary', onclick: () => this.vary() }, '🎲 Vary it a little');
      box.append(label('Wave', 'the sound\'s character'), wrow, label('Pitch', 'drag on the graph: up is higher'), mrow, u.read, u.len.row, u.vol.row, el('div', { class: 'segrow' }, u.snapBtn, u.autoBtn, u.vary));
    }
    /* bring every control in line with the sound (without rebuilding, so a slider you are dragging is not disturbed) */
    sync() {
      if (!this.id) return; const d = this.def, u = this.ui, mode = X.mode(d);
      for (const w of SND.WAVES) u.waves[w].classList.toggle('on', d.wave === w);
      for (const m of Object.keys(u.modes)) u.modes[m].classList.toggle('on', mode === m);
      u.stepper.style.display = mode === 'steps' ? '' : 'none'; u.stepN.textContent = d.f.length + ' steps';
      if (document.activeElement !== u.len.inp) u.len.inp.value = lenToPos(d.d); u.len.out.textContent = fmtLen(d.d);
      if (document.activeElement !== u.vol.inp) u.vol.inp.value = DC2.mixer.toPos(d.v); u.vol.out.textContent = Math.round(d.v * 100) + '%';
      $('#sfxName').textContent = this.id; this.syncToggles(); this.syncReadout(); this.draw();
    }
    syncToggles() { this.ui.snapBtn.classList.toggle('on', this.snap); this.ui.autoBtn.classList.toggle('on', this.auto); }
    syncReadout() {
      if (!this.id) return; const d = this.def, f = d.f, nm = (hz) => (d.wave === 'noise' ? fmtHz(hz) : `${noteName(hz)} · ${fmtHz(hz)}`);
      this.ui.read.textContent = f.length === 1 ? 'Pitch ' + nm(f[0]) : f.length === 2 ? `From ${nm(f[0])} to ${nm(f[1])}` : 'Steps: ' + f.map((x) => (d.wave === 'noise' ? fmtHz(x) : noteName(x))).join(' → ');
    }
    /* ---- changing the sound. Chips write straight away; sliders write quietly (no full redraw while you drag). */
    write(key, value, label, quiet) {
      const a = this.a, path = ['sounds', this.id, key];
      if (quiet) { a.suppress++; try { a.doc.set(path, value, { coalesce: true, label }); } finally { a.suppress--; } } else a.doc.set(path, value, { label });
    }
    setWave(w) {
      const a = this.a; a.doc.transact('Change wave', () => { a.doc.set(['sounds', this.id, 'wave'], w); if ('noise' in this.raw) a.doc.del(['sounds', this.id, 'noise']); });
      this.maybePlay(0);
    }
    setMode(m) { this.write('f', X.withMode(this.def, m).f.map(roundHz), 'Change pitch style'); this.maybePlay(0); }
    addStep(dir) {
      const f = this.def.f.slice(); if (dir > 0 && f.length < 8) f.push(roundHz(clamp(f[f.length - 1] * 1.12, X.FMIN, X.FMAX))); else if (dir < 0 && f.length > 3) f.pop(); else return;
      this.write('f', f, 'Steps'); this.maybePlay(0);
    }
    onSlider(key, pos) {
      if (key === 'd') { const d = posToLen(pos); this.write('d', d, 'Change length', true); this.ui.len.out.textContent = fmtLen(d); }
      else { const v = round3(DC2.mixer.toLevel(pos)); this.write('v', v, 'Change volume', true); this.ui.vol.out.textContent = Math.round(v * 100) + '%'; }
      this.draw();
    }
    make(k) {
      const next = Object.assign({}, this.raw, X.make(k.id, (Math.random() * 1e9) | 0)); delete next.noise;
      this.a.doc.set(['sounds', this.id], next, { label: 'Make ' + k.label }); this.maybePlay(0);
    }
    vary() {
      const next = Object.assign({}, this.raw, X.mutate(this.def, (Math.random() * 1e9) | 0, 0.22)); delete next.noise;
      this.a.doc.set(['sounds', this.id], next, { label: 'Vary sound' }); this.maybePlay(0);
    }
    /* ---- playing */
    play() { this.a.playSfxDef(this.def); this.sweep = { t0: performance.now(), dur: Math.max(150, this.def.d * 1000) }; this.tick(); }
    maybePlay(delay) { if (!this.auto) return; clearTimeout(this.timer); this.timer = setTimeout(() => { if (this.id) this.play(); }, delay == null ? 140 : delay); }
    tick() { if (!this.sweep) return; this.draw(); if (performance.now() - this.sweep.t0 < this.sweep.dur) requestAnimationFrame(() => this.tick()); else { this.sweep = null; this.draw(); } }
    /* ---- the graph. Dragging anywhere moves the pitch of the column under your finger. */
    down(e) {
      if (!this.id) return; this.cv.setPointerCapture(e.pointerId); this.drag = true;
      this.a.doc.begin('Change pitch'); this.apply(this.pt(e));
    }
    move(e) { if (this.drag) this.apply(this.pt(e)); }
    up() { if (!this.drag) return; this.drag = null; this.a.doc.end(); this.maybePlay(0); }
    apply(p) {
      const d = this.def, P = this.plot(), n = d.f.length, u = clamp((p.x - (P.x0 + 14)) / (P.w - 28), 0, 0.9999);
      const idx = n === 1 ? 0 : n === 2 ? (u < 0.5 ? 0 : 1) : Math.min(n - 1, Math.floor(u * n));
      let hz = X.yToHz(p.y - P.y0, P.h); if (this.snap) hz = X.snap(hz); hz = roundHz(clamp(hz, X.FMIN, X.FMAX));
      if (d.f[idx] === hz) return;
      const f = d.f.slice(); f[idx] = hz; this.a.doc.set(['sounds', this.id, 'f'], f, { label: 'Change pitch' });
      this.draw(); this.syncReadout();
    }
    nodes(d) { const n = d.f.length; return d.f.map((hz, i) => ({ u: n === 1 ? 0.5 : n === 2 ? i : (i + 0.5) / n, hz })); }
    draw() {
      const g = this.g, W = this.cssW, H = this.cssH; if (!W || !this.id || !this.raw) return;
      const d = this.def, P = this.plot(), N_ = 120; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#17142a'; g.fillRect(0, 0, W, H);
      g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'right';
      for (let oct = 1; oct <= 8; oct++) { const hz = N.freq(12 * (oct + 1)); if (hz < X.FMIN || hz > X.FMAX) continue; const y = P.y0 + X.hzToY(hz, P.h); g.strokeStyle = 'rgba(255,255,255,.09)'; g.beginPath(); g.moveTo(P.x0, y); g.lineTo(P.x1, y); g.stroke(); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText('C' + oct, P.x0 - 5, y); }
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (const u of [0, 0.5, 1]) { const x = this.tx(u, P); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(fmtLen(d.d * u).replace(/^0 ms$/, '0'), x, P.y1 + 5); }
      const env = X.envelope(d, N_); g.fillStyle = 'rgba(123,108,246,.22)'; g.beginPath(); g.moveTo(this.tx(0, P), P.y1);
      env.forEach((e, i) => g.lineTo(this.tx(i / (N_ - 1), P), P.y1 - e * P.h * 0.55)); g.lineTo(this.tx(1, P), P.y1); g.fill();
      const pts = X.curve(d, N_), noise = d.wave === 'noise';
      g.lineJoin = 'round'; g.lineCap = 'round';
      if (noise) { g.strokeStyle = 'rgba(255,169,77,.28)'; g.lineWidth = 22; this.path(pts, P); g.stroke(); }
      g.strokeStyle = noise ? '#ffa94d' : '#a89bff'; g.lineWidth = 3; this.path(pts, P); g.stroke();
      for (const nd of this.nodes(d)) { const x = this.tx(nd.u, P), y = P.y0 + X.hzToY(nd.hz, P.h); g.fillStyle = '#fff'; g.strokeStyle = noise ? '#ffa94d' : '#7b6cf6'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); g.stroke(); }
      if (this.sweep) { const u = clamp((performance.now() - this.sweep.t0) / this.sweep.dur, 0, 1), x = this.tx(u, P); g.strokeStyle = '#ffe14a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); }
    }
    path(pts, P) { const g = this.g; g.beginPath(); pts.forEach((hz, i) => { const x = this.tx(i / (pts.length - 1), P), y = P.y0 + X.hzToY(hz, P.h); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); }
    /* ---- the ⋯ menu */
    menu() {
      const a = this.a, id = this.id;
      const s = a.openSheet({ title: id, render: (body) => body.append(el('div', { class: 'menu' },
        btn('Rename', async () => { a.closeSheet(s); const n = await a.askText('Rename sound', id, 'Rename'); if (!n || n === id) return; this.id = n; /* the editor must know the new name before the change is announced, or it thinks its sound vanished */ try { S.renameAsset(a.doc, 'sound', id, n); this.sync(); a.toast('Renamed. Rules that play it were updated.'); } catch (e) { this.id = id; a.toast(e.message); } }, 'menu-item'),
        btn('Make a copy', () => { a.closeSheet(s); const c = X.duplicate(a.doc, id); this.open(c); a.toast('Copied as “' + c + '”.'); }, 'menu-item'),
        btn('Delete', async () => { a.closeSheet(s); const uses = X.usage(a.doc.cart, id); if (!await a.confirm(`Delete the sound “${id}”?` + (uses ? ` ${uses} rule${uses === 1 ? ' plays' : 's play'} it and will show a problem until you pick another.` : '') + ' You can undo this.', 'Delete', true)) return; S.deleteAsset(a.doc, 'sound', id); a.closeSfx(); }, 'menu-item danger'))) });
    }
  }
  const noteName = (hz) => N.name(N.ofFreq(hz));
})();
