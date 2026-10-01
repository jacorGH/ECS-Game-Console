/* Studio sound mixer. One sheet, opened from the Game tab and from the Play tab:
   - the game's balance: music and sound effects each 0-200% (saved with the game, meta.mix)
   - every song: its volume, and each track's volume inside it; ▶ to hear it
   - every sound effect: its volume; ▶ to hear it
   - level meters, so you can see what is loud while you listen
   - this device: master / music / effects volume and mute (kept in the browser, not in the game)
   Everything applies while you drag, including to a game that is running. Volume sliders use a curve that gives the
   quiet end more room, because most sounds sit between 5% and 30%. */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, F = DC2.forms, { el, btn } = F, app = window.DC2_STUDIO;
  const $ = (s) => document.querySelector(s);
  const pc = (x) => Math.round(x * 100) + '%';
  const round3 = (x) => Math.round(x * 1000) / 1000;

  /* one row: a name on the left (with small print), a slider and its value on the right */
  function row(o) {
    const out = el('output', { class: 'mx-val' }, o.fmt(o.value));
    const inp = el('input', { type: 'range', class: 'mx-range', min: o.min, max: o.max, step: 1, value: o.value, 'aria-label': o.label, 'data-mx': o.key || '' });
    inp.value = o.value;
    inp.oninput = () => { out.textContent = o.fmt(+inp.value); o.onInput(+inp.value); };
    return el('div', { class: 'mx-row' + (o.cls ? ' ' + o.cls : '') }, o.head || el('div', { class: 'mx-l' }, o.label, o.sub ? el('small', null, o.sub) : null), el('div', { class: 'mx-c' }, inp, out));
  }

  Object.assign(app, {
    /* send the current mix to the speakers, and to a game that is running */
    pushAudio() {
      if (!this.doc) return;
      DC2.mixer.apply(this.doc.cart);
      if (this.runner && this.playing) this.runner.setAudio(this.doc.cart);
      if (this.mixPreview && DC.Audio && this.doc.cart.music[this.mixPreview]) DC.Audio.playMusic(this.mixPreview, this.doc.cart.music[this.mixPreview]);   // same song: just picks up the new levels
    },
    stopPreview() { if (this.mixPreview && DC.Audio) DC.Audio.stopMusic(); this.mixPreview = null; },
    openMixer() {
      if (DC.Audio) DC.Audio.unlock();
      DC2.mixer.apply(this.doc.cart);
      const ctx = this.ctx(null, 'world'), save = (path, v) => { ctx.edit(() => this.doc.set(path, v, { coalesce: true })); };   // the document listener sends it to the speakers
      let raf = 0, bars = {}, hold = { music: 0, sfx: 0, master: 0 };
      const loop = () => {
        for (const k of Object.keys(bars)) {
          const raw = DC.Audio ? DC.Audio.peak(k) : 0; hold[k] = Math.max(raw, hold[k] * 0.9); if (hold[k] < 0.004) hold[k] = 0;
          bars[k].style.width = Math.min(100, Math.round(Math.sqrt(hold[k]) * 100)) + '%'; bars[k].classList.toggle('hot', hold[k] > 0.9);
        }
        raf = requestAnimationFrame(loop);
      };
      const sheet = this.openSheet({ title: 'Sound mixer', tall: true, live: true, gone: () => !this.doc,
        onClose: () => { cancelAnimationFrame(raf); this.stopPreview(); if (this.runner && this.playing) this.runner.syncMusic(); },
        render: (body) => {
          const cart = this.doc.cart, mix = (cart.meta && cart.meta.mix) || {}, dev = DC2.mixer.device(), songs = Object.entries(cart.music || {}), sounds = Object.entries(cart.sounds || {});
          cancelAnimationFrame(raf); bars = {};
          const meter = (k, label) => { const i = el('i'); bars[k] = i; return el('div', { class: 'mx-mrow' }, el('span', null, label), el('div', { class: 'mx-meter' }, i)); };
          body.append(el('div', { class: 'mx-meters' }, meter('music', 'Music'), meter('sfx', 'Effects'), meter('master', 'Total')));

          /* ---- the game's balance */
          body.append(el('h3', null, 'Balance for this game'), el('div', { class: 'f-doc' }, 'Saved with your game. 100% is how the sounds were made; turn the music down or the effects up until they sit right together.'));
          body.append(row({ label: 'Music', key: 'mix-music', min: 0, max: 200, value: Math.round((mix.music == null ? 1 : mix.music) * 100), fmt: (v) => v + '%', onInput: (v) => save(['meta', 'mix', 'music'], v / 100) }),
            row({ label: 'Sound effects', key: 'mix-sfx', min: 0, max: 200, value: Math.round((mix.sfx == null ? 1 : mix.sfx) * 100), fmt: (v) => v + '%', onInput: (v) => save(['meta', 'mix', 'sfx'], v / 100) }),
            el('div', { class: 'row-end left' }, btn('Back to 100% each', () => { ctx.edit(() => this.doc.del(['meta', 'mix'])); this.renderSheet(sheet); }, 'sm')));

          /* ---- songs */
          body.append(el('h3', null, 'Music'));
          if (!songs.length) body.append(el('div', { class: 'empty' }, 'No music in this game yet. Songs live in the Code tab under “Music”.'));
          for (const [id, m] of songs) {
            const on = this.mixPreview === id, tracks = Array.isArray(m.tracks) ? m.tracks : [], open = el('div', { class: 'mx-tracks', hidden: true });
            const play = btn(on ? '■' : '▶', () => {
              if (this.mixPreview === id) this.stopPreview(); else { this.stopPreview(); if (this.runner && this.playing) DC.Audio.stopMusic(); this.mixPreview = id; DC.Audio.unlock(); DC.Audio.playMusic(id, this.doc.cart.music[id]); }
              this.renderSheet(sheet);
            }, 'sq mx-play' + (on ? ' on' : ''), on ? 'stop' : 'play this song');
            body.append(row({ head: el('div', { class: 'mx-l' }, play, el('div', null, el('b', null, id), el('small', null, `${m.bpm || 120} bpm · ${tracks.length || 1} track${tracks.length === 1 ? '' : 's'}`))), label: id + ' volume', key: 'song-' + id,
              min: 0, max: 200, value: Math.round((m.vol == null ? 1 : m.vol) * 100), fmt: (v) => v + '%', onInput: (v) => save(['music', id, 'vol'], v / 100) }));
            if (tracks.length > 1) {
              tracks.forEach((t, i) => open.append(row({ cls: 'mx-sub', label: `Track ${i + 1}`, sub: t.wave || 'square', key: `track-${id}-${i}`, min: 0, max: 100, value: DC2.mixer.toPos(t.v == null ? 0.1 : t.v), fmt: (p) => pc(DC2.mixer.toLevel(p)),
                onInput: (p) => save(['music', id, 'tracks', i, 'v'], round3(DC2.mixer.toLevel(p))) })));
              body.append(btn('Tracks ▾', (e) => { open.hidden = !open.hidden; e.currentTarget.textContent = open.hidden ? 'Tracks ▾' : 'Tracks ▴'; }, 'chip-btn mx-tracksbtn', 'set each instrument on its own'), open);
            } else if (tracks.length === 1) {
              body.append(row({ cls: 'mx-sub', label: 'Instrument', sub: tracks[0].wave || 'square', key: `track-${id}-0`, min: 0, max: 100, value: DC2.mixer.toPos(tracks[0].v == null ? 0.1 : tracks[0].v), fmt: (p) => pc(DC2.mixer.toLevel(p)),
                onInput: (p) => save(['music', id, 'tracks', 0, 'v'], round3(DC2.mixer.toLevel(p))) }));
            }
          }

          /* ---- sound effects */
          body.append(el('h3', null, 'Sound effects'), el('div', { class: 'f-doc' }, 'Tap ▶ to hear one. Start a song too, and you can set the effects against the music.'));
          if (!sounds.length) body.append(el('div', { class: 'empty' }, 'No sound effects in this game yet.'));
          for (const [id, sd] of sounds) {
            const dflt = 0.25;   // what the engine uses when a sound has no volume of its own
            body.append(row({ head: el('div', { class: 'mx-l' }, btn('▶', () => { DC.Audio.unlock(); DC.Audio.play(id, this.doc.cart.sounds[id]); }, 'sq mx-play', 'play ' + id), el('div', null, el('b', null, id), el('small', null, sd.wave || 'square'))), label: id + ' volume', key: 'sound-' + id,
              min: 0, max: 100, value: DC2.mixer.toPos(sd.v == null ? dflt : sd.v), fmt: (p) => pc(DC2.mixer.toLevel(p)), onInput: (p) => save(['sounds', id, 'v'], round3(DC2.mixer.toLevel(p))) }));
          }

          /* ---- this device */
          body.append(el('h3', null, 'On this device'), el('div', { class: 'f-doc' }, 'For whoever is playing. Kept in this browser, not in your game, and applied on top of the balance above.'));
          const setDev = (patch) => { DC2.mixer.setDevice(patch, this.doc.cart); };
          body.append(row({ label: 'Volume', key: 'dev-master', min: 0, max: 100, value: Math.round(dev.master * 100), fmt: (v) => v + '%', onInput: (v) => setDev({ master: v / 100 }) }),
            row({ label: 'Music', key: 'dev-music', min: 0, max: 100, value: Math.round(dev.music * 100), fmt: (v) => v + '%', onInput: (v) => setDev({ music: v / 100 }) }),
            row({ label: 'Sound effects', key: 'dev-sfx', min: 0, max: 100, value: Math.round(dev.sfx * 100), fmt: (v) => v + '%', onInput: (v) => setDev({ sfx: v / 100 }) }),
            el('div', { class: 'row-end left' }, btn(dev.muted ? '🔇 Muted — tap to unmute' : '🔊 Sound on', () => { setDev({ muted: !DC2.mixer.device().muted }); this.renderSheet(sheet); }, 'sm' + (dev.muted ? ' danger' : '')),
              btn('Reset device volume', () => { DC2.mixer.setDevice({ master: 1, music: 1, sfx: 1, muted: false }, this.doc.cart); this.renderSheet(sheet); }, 'sm')));
          raf = requestAnimationFrame(loop);
        } });
      return sheet;
    },
  });

  window.addEventListener('DOMContentLoaded', () => {
    const b = $('#btnMixer'); if (b) b.onclick = () => app.openMixer();
  });
})();
