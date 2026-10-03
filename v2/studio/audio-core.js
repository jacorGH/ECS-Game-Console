/* Studio sound + music core (no screen code; the editors in sound-ui.js / music-ui.js sit on top).
   Data it edits, exactly as the engine plays it (js/audio.js):
     sound effect  sounds.<id> = { wave, f, d, v }       f: one pitch, or [start, end] to slide, or 3+ pitches to step through
     song          music.<id>  = { bpm, div, loop, vol, tracks: [{ wave, v, notes }] }
                   notes is text, one word per step:  C5  C#4  Bb3 (a note) · a number (Hz, or the cutoff for a noise track)
                   "." rest · "-" keep holding the note before it · "|" bar line (ignored) */
(function (root) {
  'use strict';
  const DC2 = root.DC2, S = DC2.studio;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SND = (S.snd = {});
  const slug = (s, taken) => S.slug(s, taken);

  /* seeded randomness, so a generated sound or song can be remade exactly */
  SND.rng = (seed) => { let t = (seed >>> 0) || 1; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  const between = (r, a, b) => a + (b - a) * r();

  /* ------------------------------------------------------------------ notes */
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const N = (SND.note = {
    /* "C#4" -> 61; anything that is not a note name -> null */
    midi(tok) { const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(tok)); return m ? (+m[3] + 1) * 12 + SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null; },
    name(m) { m = Math.round(m); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); },
    freq(m) { return 440 * Math.pow(2, (m - 69) / 12); },
    ofFreq(f) { return Math.round(69 + 12 * Math.log2(f / 440)); },
    isBlack(m) { return [1, 3, 6, 8, 10].includes(((Math.round(m) % 12) + 12) % 12); },
    /* the frequency a word in a notes string makes, the way the engine reads it; null = silent */
    hz(tok) { const m = N.midi(tok); if (m != null) return N.freq(m); const f = parseFloat(tok); return isNaN(f) || !(f > 0) ? null : f; },
  });
  const SCALES = (SND.scales = {
    chromatic: { label: 'All notes', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    major: { label: 'Major (happy)', steps: [0, 2, 4, 5, 7, 9, 11] },
    minor: { label: 'Minor (sad)', steps: [0, 2, 3, 5, 7, 8, 10] },
    pentatonic: { label: 'Pentatonic (easy)', steps: [0, 2, 4, 7, 9] },
    minorPent: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
    blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
    dorian: { label: 'Dorian (adventure)', steps: [0, 2, 3, 5, 7, 9, 10] },
  });
  SND.inScale = (m, rootPc, scale) => { const sc = SCALES[scale] || SCALES.chromatic; return sc.steps.includes((((Math.round(m) - rootPc) % 12) + 12) % 12); };
  /* every note of a scale between two note numbers */
  SND.scaleNotes = (rootPc, scale, lo, hi) => { const out = []; for (let m = Math.ceil(lo); m <= hi; m++) if (SND.inScale(m, rootPc, scale)) out.push(m); return out; };

  /* ------------------------------------------------------------------ one track of notes */
  const mk = (s, l, tok) => { const m = N.midi(tok); return { s, l, tok, m, hz: m != null ? N.freq(m) : (N.hz(tok) || null) }; };
  const T = (SND.track = {
    make: mk,
    /* "C5 - E5 . | G5" -> { events: [{ s: step, l: length in steps, tok, m: note number | null, hz }], steps } */
    parse(str) {
      const toks = String(str == null ? '' : str).split(/\s+/).filter((x) => x && x !== '|'), events = [];
      for (let i = 0; i < toks.length; i++) {
        const tk = toks[i]; if (tk === '.' || tk === '-') continue;
        let l = 1; while (toks[i + l] === '-') l++;
        events.push(mk(i, l, tk)); i += l - 1;
      }
      return { events, steps: toks.length };
    },
    /* the other way. per > 0 puts a bar line "|" every that many steps (the engine ignores them; they help the eye) */
    serialize(events, steps, per) {
      const out = new Array(steps).fill('.');
      for (const e of events.slice().sort((a, b) => a.s - b.s)) { if (e.s < 0 || e.s >= steps) continue; out[e.s] = e.tok; for (let k = 1; k < e.l && e.s + k < steps; k++) out[e.s + k] = '-'; }
      if (!(per > 0)) return out.join(' ');
      const w = []; for (let i = 0; i < steps; i++) { if (i > 0 && i % per === 0) w.push('|'); w.push(out[i]); } return w.join(' ');
    },
    at(events, step) { return events.find((e) => e.s <= step && step < e.s + e.l) || null; },
    /* put a note at a step. It cuts short a note it lands in the middle of, replaces one that starts there, and never runs
       into the next note or off the end. */
    place(events, steps, s, l, tok) {
      s = Math.floor(s); if (!(s >= 0 && s < steps)) return events;
      const out = [];
      for (const e of events) { if (e.s === s) continue; out.push(e.s < s && e.s + e.l > s ? Object.assign({}, e, { l: s - e.s }) : e); }
      const next = out.reduce((m, e) => (e.s > s ? Math.min(m, e.s) : m), steps);
      out.push(mk(s, Math.max(1, Math.min(Math.floor(l) || 1, next - s)), tok));
      return out.sort((a, b) => a.s - b.s);
    },
    /* remove whichever note covers this step */
    erase(events, step) { return events.filter((e) => !(e.s <= step && step < e.s + e.l)); },
    /* change how long the note that starts at s is (it stops at the next note or the end) */
    resize(events, steps, s, l) {
      return events.map((e) => { if (e.s !== s) return e; const next = events.reduce((m, o) => (o.s > s ? Math.min(m, o.s) : m), steps); return Object.assign({}, e, { l: Math.max(1, Math.min(Math.floor(l) || 1, next - s)) }); });
    },
    /* a different length: notes past the end go, a note that crosses it is cut */
    setSteps(events, steps) { return events.filter((e) => e.s < steps).map((e) => (e.s + e.l > steps ? Object.assign({}, e, { l: steps - e.s }) : e)); },
    /* move every note up or down by semitones; words that are not note names (drum cutoffs) are left alone */
    transpose(events, semis) { return events.map((e) => (e.m == null ? e : mk(e.s, e.l, N.name(clamp(e.m + semis, 0, 127))))); },
    /* the notes (numbers) in use, or null when there are none */
    span(events) { const ms = events.map((e) => e.m).filter((m) => m != null); return ms.length ? { lo: Math.min(...ms), hi: Math.max(...ms) } : null; },
  });

  /* ------------------------------------------------------------------ songs */
  const KINDS = (SND.trackKinds = {
    lead: { label: 'Lead', wave: 'square', v: 0.07 },
    bass: { label: 'Bass', wave: 'triangle', v: 0.12 },
    arp: { label: 'Arpeggio', wave: 'square', v: 0.035 },
    pad: { label: 'Pad', wave: 'sine', v: 0.08 },
    drums: { label: 'Drums', wave: 'noise', v: 0.05 },
  });
  SND.WAVES = ['square', 'sawtooth', 'triangle', 'sine', 'noise'];
  /* the lanes of a noise (drum) track: the number is how high the noise starts; higher sounds like a hi-hat, lower like a kick */
  SND.drumLanes = [{ hz: 9000, label: 'Hat' }, { hz: 3500, label: 'Snare' }, { hz: 1500, label: 'Tom' }, { hz: 300, label: 'Kick' }];
  const rests = (steps, per) => T.serialize([], steps, per);

  const M = (SND.song = {
    perBar(def) { return Math.max(1, (+def.div || 2) * 4); },
    trackList(def) { return Array.isArray(def.tracks) ? def.tracks : [def]; },
    /* how many steps the song lasts (the longest track) */
    steps(def) { return Math.max(1, ...M.trackList(def).map((t) => T.parse(t.notes).steps)); },
    newTrack(kind, steps, per) { const k = KINDS[kind] || KINDS.lead; return { wave: k.wave, v: k.v, notes: rests(steps, per) }; },
    blank(bars) { const per = 8; return { bpm: 120, div: 2, loop: true, tracks: [M.newTrack('lead', (bars || 4) * per, per)] }; },
    needsPrepare(def) { return !Array.isArray(def.tracks); },
    /* songs can be written as one track straight in the song; the editor needs a list of tracks. One undo step. */
    prepare(doc, id) {
      const d = doc.cart.music[id]; if (!M.needsPrepare(d)) return false;
      doc.transact('Prepare song for editing', () => {
        const t = { wave: d.wave || 'square', v: d.v == null ? 0.1 : d.v, notes: d.notes || '' };
        for (const k of ['wave', 'v', 'notes']) if (k in d) doc.del(['music', id, k]);
        doc.set(['music', id, 'tracks'], [t]);
      });
      return true;
    },
    add(doc, name, def) { const id = slug(name || 'song', doc.cart.music || {}); doc.set(['music', id], def, { label: 'New song' }); return id; },
    duplicate(doc, id, name) { const nid = slug(name || id + ' copy', doc.cart.music); doc.set(['music', nid], S.clone(doc.cart.music[id]), { label: 'Copy song' }); return nid; },
    /* scenes that play this song */
    usage(cart, id) { return Object.keys(cart.scenes || {}).filter((s) => cart.scenes[s].music === id); },
    rename(doc, oldId, newId) {
      const cart = doc.cart;
      if (!cart.music || !Object.prototype.hasOwnProperty.call(cart.music, oldId)) throw new Error(`There is no song "${oldId}".`);
      if (!/^[A-Za-z0-9_-]+$/.test(newId)) throw new Error('Use letters, numbers, - and _ only.');
      if (Object.prototype.hasOwnProperty.call(cart.music, newId)) throw new Error(`A song called "${newId}" already exists.`);
      doc.transact('Rename song', () => { doc.set(['music', newId], cart.music[oldId]); doc.del(['music', oldId]); for (const sc of M.usage(cart, oldId)) doc.set(['scenes', sc, 'music'], newId); });
    },
    /* delete a song; the levels that played it are left without music */
    remove(doc, id) { doc.transact('Delete song', () => { for (const sc of M.usage(doc.cart, id)) doc.del(['scenes', sc, 'music']); doc.del(['music', id]); }); },
    setNotes(doc, id, ti, events, steps, opt) { doc.set(['music', id, 'tracks', ti, 'notes'], T.serialize(events, steps, M.perBar(doc.cart.music[id])), Object.assign({ label: 'Edit notes' }, opt || {})); },
    addTrack(doc, id, kind) {
      const d = doc.cart.music[id], tr = M.newTrack(kind, M.steps(d), M.perBar(d));
      doc.insert(['music', id, 'tracks'], null, tr, 'Add track'); return M.trackList(doc.cart.music[id]).length - 1;
    },
    removeTrack(doc, id, ti) { if (M.trackList(doc.cart.music[id]).length < 2) throw new Error('A song needs at least one track.'); doc.remove(['music', id, 'tracks'], ti, 'Delete track'); },
    moveTrack(doc, id, ti, dir) {
      const list = M.trackList(doc.cart.music[id]), to = ti + dir; if (to < 0 || to >= list.length) return ti;
      const n = list.slice(); n.splice(to, 0, n.splice(ti, 1)[0]); doc.set(['music', id, 'tracks'], n, { label: 'Move track' }); return to;
    },
    /* make every track exactly this many steps long (shorter cuts, longer adds rests) */
    setLength(doc, id, steps) {
      steps = clamp(Math.round(steps), 4, 256); const d = doc.cart.music[id], per = M.perBar(d);
      doc.transact('Song length', () => { M.trackList(d).forEach((t, i) => doc.set(['music', id, 'tracks', i, 'notes'], T.serialize(T.setSteps(T.parse(t.notes).events, steps), steps, per))); });
    },
    /* the song as the engine should play it right now, optionally only some tracks (solo / mute while composing) */
    preview(def, o) {
      o = o || {}; const list = M.trackList(def).map((t, i) => [t, i]).filter(([, i]) => (o.solo != null ? i === o.solo : !(o.mute && o.mute.includes(i))));
      return Object.assign({}, def, { tracks: list.map(([t]) => t) });
    },
  });

  /* rows of the piano roll for one track: pitched rows (high to low) for notes, or lanes for a noise track */
  SND.rows = (track, events, opts) => {
    opts = opts || {};
    if (track.wave === 'noise') {
      const lanes = SND.drumLanes.map((l) => Object.assign({ drum: true }, l));
      for (const e of events) if (e.hz && !lanes.some((l) => Math.abs(l.hz - e.hz) / l.hz < 0.01)) lanes.push({ drum: true, hz: Math.round(e.hz), label: Math.round(e.hz) + ' Hz' });
      return lanes.sort((a, b) => b.hz - a.hz);
    }
    const sp = T.span(events), centre = { triangle: 48, sine: 60, sawtooth: 60 }[track.wave] || 72;
    let lo = Math.min(sp ? sp.lo - 3 : centre - 12, centre - 12), hi = Math.max(sp ? sp.hi + 3 : centre + 12, centre + 12);
    if (opts.lo != null) lo = Math.min(lo, opts.lo); if (opts.hi != null) hi = Math.max(hi, opts.hi);
    lo = clamp(lo, 12, 108); hi = clamp(hi, lo + 12, 120);
    const rows = [];
    for (let m = hi; m >= lo; m--) rows.push({ m, label: N.name(m), black: N.isBlack(m), c: m % 12 === 0 });
    return rows;
  };

  /* ------------------------------------------------------------------ sound effects */
  const FMIN = 30, FMAX = 9000;
  const X = (SND.sfx = {
    FMIN, FMAX,
    kinds: [
      { id: 'coin', label: 'Coin', icon: '🪙' }, { id: 'jump', label: 'Jump', icon: '🦘' }, { id: 'hit', label: 'Hit', icon: '👊' }, { id: 'hurt', label: 'Hurt', icon: '💔' },
      { id: 'laser', label: 'Laser', icon: '🔫' }, { id: 'boom', label: 'Boom', icon: '💥' }, { id: 'powerup', label: 'Power-up', icon: '⭐' }, { id: 'pickup', label: 'Pick up', icon: '🎁' },
      { id: 'blip', label: 'Blip', icon: '🔘' }, { id: 'deny', label: 'No!', icon: '🚫' }, { id: 'door', label: 'Door', icon: '🚪' }, { id: 'win', label: 'Win', icon: '🏆' },
    ],
    /* a clean copy with every field valid: wave is one of five, f a list of pitches, d seconds, v volume */
    norm(def) {
      def = def || {}; const wave = def.wave === 'noise' || def.noise ? 'noise' : SND.WAVES.includes(def.wave) ? def.wave : 'square';
      let f = (Array.isArray(def.f) ? def.f : [def.f == null ? 440 : def.f]).map(Number).filter((x) => x > 0); if (!f.length) f = [440];
      return { wave, f: f.map((x) => clamp(x, FMIN, FMAX)), d: clamp(+def.d > 0 ? +def.d : 0.15, 0.02, 3), v: clamp(def.v == null || isNaN(+def.v) ? 0.25 : +def.v, 0, 1) };
    },
    mode(def) { const n = X.norm(def).f.length; return n === 1 ? 'steady' : n === 2 ? 'slide' : 'steps'; },
    /* switch between one pitch, a slide, and stepping through notes, keeping what is there where it can */
    withMode(def, mode) {
      const d = X.norm(def), f = d.f, a = f[0], b = f[f.length - 1];
      if (mode === 'steady') d.f = [a];
      else if (mode === 'slide') d.f = [a, f.length === 1 ? clamp(a * 1.5, FMIN, FMAX) : b];
      else d.f = f.length >= 3 ? f : f.length === 2 ? [a, Math.sqrt(a * b), b] : [a, clamp(a * 1.25, FMIN, FMAX), clamp(a * 1.5, FMIN, FMAX)];
      return d;
    },
    /* the pitch at n evenly spaced moments across the sound (what the graph draws) */
    curve(def, n) {
      const d = X.norm(def), f = d.f, out = [];
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : i / (n - 1);
        out.push(f.length === 1 ? f[0] : f.length === 2 ? f[0] * Math.pow(f[1] / f[0], u) : f[Math.min(f.length - 1, Math.floor(u * f.length))]);
      }
      return out;
    },
    /* loudness over time as the engine fades it (a steep fade down to near silence), 0..1; softened a little so it reads on a graph */
    envelope(def, n) { const v = Math.max(X.norm(def).v, 0.0002), r = 0.0001 / v, out = []; for (let i = 0; i < n; i++) out.push(Math.pow(Math.pow(r, n === 1 ? 0 : i / (n - 1)), 0.3)); return out; },
    hzToY(hz, h) { return (1 - Math.log(clamp(hz, FMIN, FMAX) / FMIN) / Math.log(FMAX / FMIN)) * h; },
    yToHz(y, h) { return FMIN * Math.pow(FMAX / FMIN, 1 - clamp(y / h, 0, 1)); },
    snap(hz) { return N.freq(N.ofFreq(hz)); },
    make(kind, seed) {
      const r = SND.rng(seed == null ? Date.now() : seed), R = (a, b) => between(r, a, b), q = (x) => Math.round(x);
      let d;
      switch (kind) {
        case 'coin': { const b = R(880, 1250); d = { wave: r() < 0.8 ? 'square' : 'triangle', f: [q(b), q(b * R(1.35, 1.55))], d: R(0.1, 0.16), v: R(0.12, 0.18) }; break; }
        case 'jump': d = { wave: 'square', f: [q(R(220, 320)), q(R(480, 700))], d: R(0.12, 0.2), v: R(0.16, 0.2) }; break;
        case 'hit': d = { wave: 'noise', f: [q(R(1800, 3200)), q(R(120, 320))], d: R(0.08, 0.16), v: R(0.26, 0.32) }; break;
        case 'hurt': d = { wave: 'sawtooth', f: [q(R(280, 420)), q(R(70, 120))], d: R(0.18, 0.3), v: R(0.16, 0.2) }; break;
        case 'laser': d = { wave: r() < 0.5 ? 'square' : 'sawtooth', f: [q(R(1700, 2600)), q(R(180, 420))], d: R(0.12, 0.22), v: R(0.14, 0.18) }; break;
        case 'boom': d = { wave: 'noise', f: [q(R(1200, 2200)), q(R(50, 110))], d: R(0.45, 0.9), v: R(0.3, 0.34) }; break;
        case 'powerup': { const b = R(330, 520), t = pick(r, [1.25, 1.2]); d = { wave: 'square', f: [q(b), q(b * t), q(b * 1.5), q(b * 2)], d: R(0.3, 0.5), v: R(0.14, 0.18) }; break; }
        case 'pickup': d = { wave: 'triangle', f: [q(R(500, 700)), q(R(900, 1300))], d: R(0.12, 0.18), v: R(0.2, 0.26) }; break;
        case 'blip': d = { wave: pick(r, ['square', 'triangle']), f: [q(R(600, 1100))], d: R(0.04, 0.07), v: R(0.12, 0.16) }; break;
        case 'deny': { const b = R(280, 340); d = { wave: 'square', f: [q(b), q(b * R(0.6, 0.72)), q(b)], d: R(0.2, 0.3), v: R(0.14, 0.18) }; break; }
        case 'door': d = { wave: 'triangle', f: [q(R(180, 240)), q(R(500, 700)), q(R(260, 340))], d: R(0.25, 0.35), v: R(0.22, 0.28) }; break;
        case 'win': { const k = R(0.9, 1.1); d = { wave: 'square', f: [523, 659, 784, 1046].map((x) => q(x * k)), d: R(0.6, 0.8), v: R(0.12, 0.16) }; break; }
        default: d = { wave: 'square', f: [q(R(300, 900))], d: 0.1, v: 0.15 };
      }
      d.d = Math.round(d.d * 100) / 100; d.v = Math.round(d.v * 1000) / 1000; return X.norm(d);
    },
    /* nudge pitch and length a little, keeping the character; 0..1 */
    mutate(def, seed, amount) {
      const r = SND.rng(seed == null ? Date.now() : seed), a = amount == null ? 0.25 : amount, d = X.norm(def);
      d.f = d.f.map((x) => Math.round(clamp(x * (1 + (r() * 2 - 1) * a), FMIN, FMAX)));
      d.d = Math.round(clamp(d.d * (1 + (r() * 2 - 1) * a * 0.6), 0.03, 3) * 100) / 100; return d;
    },
    add(doc, name, def) { const id = slug(name || 'sound', doc.cart.sounds || {}); doc.set(['sounds', id], def, { label: 'New sound' }); return id; },
    duplicate(doc, id, name) { const nid = slug(name || id + ' copy', doc.cart.sounds); doc.set(['sounds', nid], S.clone(doc.cart.sounds[id]), { label: 'Copy sound' }); return nid; },
    usage(cart, id) { return S.usage(cart, DC2.registryFor(cart).reg, 'sound', id).length; },
  });

  /* The key a song seems to be in: the major or minor scale that holds the most of its notes (long notes count more), with a
     nudge for the one the melody and the bass end/start on. -> { root: 0-11, scale: 'major' | 'minor' } or 'chromatic' when
     there are no notes to go on. */
  SND.detectKey = (def) => {
    const tracks = M.trackList(def).filter((t) => t.wave !== 'noise').map((t) => T.parse(t.notes).events.filter((e) => e.m != null));
    const all = tracks.flat(); if (!all.length) return { root: 0, scale: 'chromatic' };
    const last = tracks[0] && tracks[0].length ? tracks[0][tracks[0].length - 1].m % 12 : -1, firstBass = tracks.length > 1 && tracks[1].length ? tracks[1][0].m % 12 : -1;
    let best = null;
    for (const scale of ['major', 'minor']) for (let root = 0; root < 12; root++) {
      let inKey = 0, total = 0; for (const e of all) { total += e.l; if (SND.inScale(e.m, root, scale)) inKey += e.l; }
      const score = (inKey / total) * 100 + (last === root ? 5 : 0) + (firstBass === root ? 3 : 0) - (scale === 'minor' ? 0.01 : 0);
      if (!best || score > best.score) best = { root, scale, score };
    }
    return { root: best.root, scale: best.scale };
  };

  /* ------------------------------------------------------------------ making a song for you */
  SND.styles = {
    happy: { label: 'Happy', scale: 'major', bpm: 132, prog: [0, 7, 9, 5] },
    sad: { label: 'Sad', scale: 'minor', bpm: 84, prog: [0, 8, 3, 10] },
    adventure: { label: 'Adventure', scale: 'dorian', bpm: 116, prog: [0, 10, 5, 7] },
    tense: { label: 'Tense', scale: 'minor', bpm: 144, prog: [0, 1, 0, 7] },
    calm: { label: 'Calm', scale: 'pentatonic', bpm: 92, prog: [0, 5, 7, 0] },
  };
  const RHYTHMS = [
    [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 3], [3, 1], [4, 2], [6, 1], [7, 1]],
    [[0, 2], [2, 2], [4, 2], [6, 1], [7, 1]], [[0, 1], [2, 1], [3, 1], [4, 3], [7, 1]],
  ];
  SND.gen = {
    /* a four-track song (lead, bass, arpeggio, drums) in a key and mood. Same seed + options = same song. */
    song(o) {
      o = o || {}; const st = SND.styles[o.style] || SND.styles.happy, r = SND.rng(o.seed == null ? Date.now() : o.seed);
      const rootPc = clamp(Math.floor(o.root == null ? 0 : o.root), 0, 11), scale = o.scale || st.scale, bars = clamp(Math.round(o.bars) || 4, 1, 16), per = 8, steps = bars * per;
      const leadPool = SND.scaleNotes(rootPc, scale, 60, 84), bassBase = 36 + rootPc, arpBase = 60 + rootPc - (rootPc > 6 ? 12 : 0);
      const near = (list, m) => list.reduce((b, x) => (Math.abs(x - m) < Math.abs(b - m) ? x : b), list[0]);
      const chordTones = (cr) => { const base = (rootPc + cr) % 12, third = SND.inScale(base + 3, rootPc, scale) && !SND.inScale(base + 4, rootPc, scale) ? 3 : 4; return [0, third, 7].map((x) => (base + x) % 12); };
      const lead = [], bass = [], arp = [], drums = [], barNotes = [];
      let idx = Math.floor(leadPool.length / 2);
      for (let b = 0; b < bars; b++) {
        const cr = st.prog[b % st.prog.length], ct = chordTones(cr), s0 = b * per;
        if (b >= 2 && r() < 0.7) { barNotes[b] = barNotes[b - 2].map((n) => Object.assign({}, n)); }
        else {
          const rhythm = pick(r, RHYTHMS); barNotes[b] = [];
          for (const [os, ol] of rhythm) {
            if (os === 0 || os === 4) { const cands = leadPool.map((m, i) => [m, i]).filter(([m]) => ct.includes(m % 12)); const near2 = cands.sort((a, c) => Math.abs(a[1] - idx) - Math.abs(c[1] - idx)).slice(0, 2); idx = pick(r, near2)[1]; }
            else { const mv = pick(r, [-1, -1, 1, 1, 2, -2, 0, 3, -3]); idx = clamp(idx + mv, 0, leadPool.length - 1); }
            barNotes[b].push({ os, ol, m: leadPool[idx] });
          }
        }
        if (b === bars - 1) { barNotes[b] = [{ os: 0, ol: 4, m: near(leadPool, 72 + rootPc - (rootPc > 6 ? 12 : 0)) }]; }
        for (const n of barNotes[b]) lead.push(T.make(s0 + n.os, n.ol, N.name(n.m)));
        const rootM = bassBase + cr, fifth = rootM + 7;
        if (b === bars - 1) bass.push(T.make(s0, 8, N.name(bassBase)));
        else { bass.push(T.make(s0, 4, N.name(rootM)), T.make(s0 + 4, 2, N.name(rootM)), T.make(s0 + 6, 2, N.name(r() < 0.5 ? fifth : rootM))); }
        const tones = [0, 1, 2, 1, 0, 1, 2, 1].map((i) => { const pc = ct[i % 3]; return arpBase + ((pc - arpBase) % 12 + 12) % 12; });
        tones.forEach((m, i) => arp.push(T.make(s0 + i, 1, N.name(m))));
        const pat = ['300', '9000', '3500', '9000', '300', '9000', '3500', '9000'];
        if (b % 4 === 3) { pat[6] = '3500'; pat[7] = '3500'; }
        pat.forEach((tok, i) => drums.push(T.make(s0 + i, 1, tok)));
      }
      const tr = (kind, ev) => { const k = KINDS[kind]; return { wave: k.wave, v: k.v, notes: T.serialize(ev, steps, per) }; };
      return { bpm: o.bpm || st.bpm, div: 2, loop: true, tracks: [tr('lead', lead), tr('bass', bass), tr('arp', arp), tr('drums', drums)] };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
