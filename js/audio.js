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
    ctx: null, out: null, muted: false, buffers: {}, noise: null,
    song: null, songName: null, timer: null, pending: null, volume: 0.5,

    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.out = this.ctx.createGain();
          this.out.gain.value = this.muted ? 0 : this.volume;
          this.out.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.pending) { const p = this.pending; this.pending = null; this.playMusic(p[0], p[1]); }
      } catch (e) { /* audio unavailable */ }
    },
    setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : this.volume; },
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
        s.connect(g).connect(this.out); s.start(t);
        return;
      }
      const d = Math.max(0.01, +def.d || 0.15), v = def.v ?? 0.25;
      const g = c.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      g.connect(this.out);
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

    playMusic(name, def) {
      if (this.songName === name && this.song) return;
      this.stopMusic();
      if (!def) return;
      if (!this.ctx) { this.pending = [name, def]; return; }
      this.songName = name;
      const bpm = +def.bpm || 120, div = +def.div || 2;
      const step = 60 / bpm / div;
      const trackDefs = Array.isArray(def.tracks) ? def.tracks : [def];
      const tracks = trackDefs.map((tr) => {
        const toks = String(tr.notes || '').split(/\s+/).filter((x) => x && x !== '|');
        const at = {};
        for (let i = 0; i < toks.length; i++) {
          const tk = toks[i];
          if (tk === '.' || tk === '-') continue;
          let len = 1; while (toks[i + len] === '-') len++;
          const f = noteFreq(tk);
          if (f) at[i] = { f, len };
        }
        return { wave: tr.wave || 'square', v: tr.v ?? 0.1, len: toks.length, at };
      });
      const total = Math.max(1, ...tracks.map((t) => t.len));
      this.song = { tracks, step, total, pos: 0, next: this.ctx.currentTime + 0.06, loop: def.loop !== false };
      this.timer = setInterval(() => this.tick(), 25);
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
      g.connect(this.out);
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
