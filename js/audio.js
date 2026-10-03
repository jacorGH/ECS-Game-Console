/* Data Console — audio: synth SFX, sample playback, step-sequenced music */
(function () {
  const DC = window.DC;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];

  function noteFreq(tok) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(tok);
    if (!m) { const f = parseFloat(tok); return isNaN(f) ? null : f; }
    const n = NOTE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = (+m[3] + 1) * 12 + n;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  const A = (DC.Audio = {
    ctx: null, out: null, sfx: null, mus: null, tap: null, muted: false, buffers: {}, noise: null,
    song: null, songName: null, timer: null, pending: null, volume: 0.5,
    /* Mixing. Everything goes: sound effects -> sfx channel, music -> mus channel -> master (out) -> speakers.
       master: overall level 0..1 (1 = the classic volume). mix.sfx / mix.music: each channel 0..2 (1 = as designed).
       The defaults change nothing, so games that never touch these sound exactly as before. */
    master: 1, mix: { sfx: 1, music: 1 },

    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.out = this.ctx.createGain();
          this.out.connect(this.ctx.destination);
          this.sfx = this.ctx.createGain(); this.mus = this.ctx.createGain();
          this.sfx.connect(this.out); this.mus.connect(this.out);
          /* level meters: a tap on each channel that measures without changing the sound */
          this.tap = {};
          for (const [k, node] of [['sfx', this.sfx], ['music', this.mus], ['master', this.out]]) { const an = this.ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0; node.connect(an); this.tap[k] = an; }
          this.applyLevels();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.pending) { const p = this.pending; this.pending = null; this.playMusic(p[0], p[1]); }
      } catch (e) { /* audio unavailable */ }
    },
    applyLevels() {
      if (!this.out) return;
      this.out.gain.value = this.muted ? 0 : this.volume * this.master;
      this.sfx.gain.value = this.mix.sfx; this.mus.gain.value = this.mix.music;
    },
    setMuted(m) { this.muted = m; this.applyLevels(); },
    /* set everything at once: { master 0..1, music 0..2, sfx 0..2, muted } (anything left out stays as it is) */
    setLevels(l) {
      const num = (x, lo, hi, d) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
      this.master = num(l.master, 0, 1, this.master);
      this.mix = { sfx: num(l.sfx, 0, 2, this.mix.sfx), music: num(l.music, 0, 2, this.mix.music) };
      if (typeof l.muted === 'boolean') this.muted = l.muted;
      this.applyLevels();
    },
    /* loudest recent sample on a channel, 0..1: 'sfx', 'music' or 'master' (for meters) */
    peak(which) {
      const an = this.tap && this.tap[which]; if (!an) return 0;
      const buf = this._pk || (this._pk = new Uint8Array(an.fftSize)); an.getByteTimeDomainData(buf);
      let m = 0; for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128); if (d > m) m = d; }
      return m / 128;
    },
    noiseBuffer() {
      if (this.noise) return this.noise;
      const c = this.ctx, len = c.sampleRate;
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return (this.noise = b);
    },
    async loadSound(name, url) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        const ab = await r.arrayBuffer();
        if (!this.ctx) this.unlock();
        if (!this.ctx) return;
        this.buffers[name] = await this.ctx.decodeAudioData(ab);
      } catch (e) { console.warn('Sound file failed:', url, e); }
    },
    play(name, def) {
      if (!def || !this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime;
      if (this.buffers[name]) {
        const s = c.createBufferSource(); s.buffer = this.buffers[name];
        const g = c.createGain(); g.gain.value = def.v ?? 0.6;
        s.connect(g).connect(this.sfx || this.out); s.start(t);
        return;
      }
      const d = Math.max(0.01, +def.d || 0.15), v = def.v ?? 0.25;
      const g = c.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      g.connect(this.sfx || this.out);
      const f = (Array.isArray(def.f) ? def.f : [def.f ?? 440]).map(Number).filter((x) => x > 0);
      if (!f.length) f.push(440);
      if (def.noise || def.wave === 'noise') {
        const s = c.createBufferSource(); s.buffer = this.noiseBuffer();
        const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 0.8;
        filt.frequency.setValueAtTime(f[0], t);
        if (f.length > 1) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f[f.length - 1]), t + d);
        s.connect(filt).connect(g); s.start(t); s.stop(t + d + 0.02);
        return;
      }
      const o = c.createOscillator();
      o.type = WAVES.includes(def.wave) ? def.wave : 'square';
      o.frequency.setValueAtTime(f[0], t);
      if (f.length === 2) o.frequency.exponentialRampToValueAtTime(f[1], t + d);
      else for (let i = 1; i < f.length; i++) o.frequency.setValueAtTime(f[i], t + (d * i) / f.length); // arpeggio
      o.connect(g); o.start(t); o.stop(t + d + 0.02);
    },

    /* volume of track i of a song: the track's own level times the song's "vol" (default 1) */
    trackLevel(def, i) {
      const t = Array.isArray(def.tracks) ? def.tracks[i] : def, own = t && t.v != null ? +t.v : 0.1, vol = def.vol == null ? 1 : +def.vol;
      return (isFinite(own) ? own : 0.1) * (isFinite(vol) && vol >= 0 ? vol : 1);
    },
    /* the same song is already playing: don't restart it, just pick up any volume changes (live mixing) */
    retune(def) { if (this.song) this.song.tracks.forEach((t, i) => { t.v = this.trackLevel(def, i); }); },
    /* Turn a song definition into what the scheduler plays: per-track note tables (step -> {freq, length in steps}),
       the length of a step in seconds, the loop length in steps. Used to start a song and to swap in an edited one. */
    buildSong(def) {
      const bpm = +def.bpm || 120, div = +def.div || 2, step = 60 / bpm / div;
      const trackDefs = Array.isArray(def.tracks) ? def.tracks : [def];
      const tracks = trackDefs.map((tr, ti) => {
        const toks = String(tr.notes || '').split(/\s+/).filter((x) => x && x !== '|');
        const at = {};
        for (let i = 0; i < toks.length; i++) {
          const tk = toks[i];
          if (tk === '.' || tk === '-') continue;
          let len = 1; while (toks[i + len] === '-') len++;
          const f = noteFreq(tk);
          if (f) at[i] = { f, len };
        }
        return { wave: tr.wave || 'square', v: this.trackLevel(def, ti), len: toks.length, at };
      });
      return { tracks, step, total: Math.max(1, ...tracks.map((t) => t.len)), loop: def.loop !== false };
    },
    /* startAt: begin at this step instead of the start (used when an editor restarts a song where you were) */
    playMusic(name, def, startAt) {
      if (this.songName === name && this.song) { if (def) this.updateSong(def); return; }
      this.stopMusic();
      if (!def) return;
      if (!this.ctx) { this.pending = [name, def]; return; }
      this.songName = name;
      const s = this.buildSong(def), at = Math.floor(+startAt) || 0;
      const p0 = ((at % s.total) + s.total) % s.total, t0 = this.ctx.currentTime + 0.06;
      this.song = Object.assign(s, { pos: p0, next: t0, p0, t0 });
      this.timer = setInterval(() => this.tick(), 25);
    },
    /* the song that is playing was edited (notes, tempo, volumes, loop): swap it in without restarting or losing the place */
    updateSong(def) {
      if (!this.song || !def) return false;
      const s = this.buildSong(def);
      Object.assign(this.song, { tracks: s.tracks, step: s.step, total: s.total, loop: s.loop });
      if (this.song.pos >= s.total) this.song.pos %= s.total;
      return true;
    },
    /* which step is being heard right now (a fraction), or -1 when no song is playing. The scheduler runs a little ahead
       of the speakers, so this subtracts that head start. */
    songPos() {
      const s = this.song, c = this.ctx; if (!s || !c) return -1;
      if (c.currentTime < s.t0) return s.p0;   // not audible yet: still at the starting step
      const p = s.pos - Math.max(0, (s.next - c.currentTime) / s.step);
      return ((p % s.total) + s.total) % s.total;
    },
    /* one short note on the music channel, to hear a pitch while composing */
    blip(wave, freq, dur, v) {
      if (!this.ctx || this.muted || !(freq > 0)) return;
      this.tone({ wave: wave === 'noise' || WAVES.includes(wave) ? wave : 'square', v: v == null ? 0.12 : v }, freq, this.ctx.currentTime + 0.003, Math.max(0.04, dur || 0.2));
    },
    tick() {
      const s = this.song, c = this.ctx;
      if (!s || !c) return;
      while (s.next < c.currentTime + 0.12) {
        for (const tr of s.tracks) {
          const e = tr.at[s.pos];
          if (e) this.tone(tr, e.f, s.next, e.len * s.step * 0.92);
        }
        s.pos++; s.next += s.step;
        if (s.pos >= s.total) { if (s.loop) s.pos = 0; else { this.stopMusic(); return; } }
      }
    },
    tone(tr, f, t, d) {
      if (this.muted) return;
      const c = this.ctx, g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(tr.v, t + 0.008);
      g.gain.setValueAtTime(tr.v, t + Math.max(0.01, d - 0.03));
      g.gain.linearRampToValueAtTime(0, t + d);
      g.connect(this.mus || this.out);
      if (tr.wave === 'noise') {
        const s = c.createBufferSource(); s.buffer = this.noiseBuffer();
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f;
        s.connect(hp).connect(g); s.start(t); s.stop(t + d + 0.02);
      } else {
        const o = c.createOscillator();
        o.type = WAVES.includes(tr.wave) ? tr.wave : 'square';
        o.frequency.setValueAtTime(f, t);
        o.connect(g); o.start(t); o.stop(t + d + 0.02);
      }
    },
    stopMusic() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null; this.song = null; this.songName = null; this.pending = null;
    },
  });
  DC.noteFreq = noteFreq;
})();
