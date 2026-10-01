/* v2 runner: plays a cart on a canvas at a fixed 60 Hz. Used by the standalone page and the studio's Play tab.
   It is the only thing that turns kernel state into pixels, sound and vibration. */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, FONT = '8px "Press Start 2P", monospace';
  class Runner {
    constructor(canvas, opt) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.opt = opt || {};
      this.cart = null; this.world = null; this.reg = null; this.report = null; this.sprites = null;
      this.acc = 0; this.last = 0; this.shakeT = 0; this.musicFor = null; this.raf = 0;
    }
    load(cart, o) {
      o = o || {};
      this.cart = cart; this.sprites = new DC2.SpriteCache(cart); this.musicFor = null; this.acc = 0;
      this.cv.width = cart.meta.width || 256; this.cv.height = cart.meta.height || 224;
      const b = DC2.boot(cart, { seed: 1 });
      this.report = b.report; this.world = b.world; this.reg = b.reg;
      if (this.world && o.scene && o.scene !== cart.meta.start) { this.world.queue({ type: 'goto', scene: o.scene }); this.world.step([{}]); }
      if (this.world && o.at) { const p = this.world.player(); if (p && p.c.pos) { p.c.pos.x = o.at.x; p.c.pos.y = o.at.y; } }
      if (DC2.mixer) DC2.mixer.apply(cart);   // the game's own balance + this device's volume
      if (this.opt.onLoad) this.opt.onLoad(this);
      this.draw();
    }
    reload(cart) { if (!this.world) return this.load(cart); this.cart = cart; this.sprites.setCart(cart); if (DC2.mixer) DC2.mixer.apply(cart); return this.world.hotReload(cart); }
    /* pick up sound and music edits (volumes, tunes) while the game runs, without restarting it */
    setAudio(cart) {
      if (!this.cart) return;
      const c = (v) => JSON.parse(JSON.stringify(v));
      this.cart.sounds = c(cart.sounds || {}); this.cart.music = c(cart.music || {}); this.cart.meta.mix = cart.meta.mix ? c(cart.meta.mix) : undefined;
      if (DC2.mixer) DC2.mixer.apply(this.cart);
      /* only if the song playing is the game's own (the mixer may be previewing a different one) */
      if (DC.Audio && DC.Audio.retune && this.musicFor && DC.Audio.songName === this.musicFor && this.cart.music[this.musicFor]) DC.Audio.retune(this.cart.music[this.musicFor]);
    }
    /* after something else (the mixer's preview) used the music, let the game's own music come back */
    syncMusic() { this.musicFor = '\u0000'; }
    start() { if (this.raf) return; this.last = performance.now(); const tick = (t) => { this.raf = requestAnimationFrame(tick); this.frame(t); }; this.raf = requestAnimationFrame(tick); }
    /* stopping the game silences its music too (it used to keep playing in the other tabs) */
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.musicFor = null; if (DC.Audio && DC.Audio.stopMusic) DC.Audio.stopMusic(); }
    col(i) { return DC2.color(this.cart, i); }
    text(str, x, y, color, align) {
      const g = this.g; g.font = FONT; g.textBaseline = 'top'; g.textAlign = align || 'left';
      g.fillStyle = '#000000'; g.fillText(str, x + 1, y + 1); g.fillStyle = this.col(color == null ? 21 : color); g.fillText(str, x, y);
    }
    play(fxs) {
      for (const f of fxs) {
        if (f.type === 'sound' && DC.Audio && this.cart.sounds[f.id]) DC.Audio.play(f.id, this.cart.sounds[f.id]);
        else if (f.type === 'shake') this.shakeT = Math.max(this.shakeT, f.t);
        else if (f.type === 'haptic' && DC.Haptics) DC.Haptics.play(f.kind);
        else if (f.type === 'log') console.log('[cart]', f.text);
      }
    }
    frame(now) {
      if (!this.world) { this.drawReport(); return; }
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.acc += dt;
      while (this.acc >= DC2.DT) {
        this.acc -= DC2.DT; DC.Input.update();
        this.world.step([DC.Input.players[0].down]); this.play(this.world.fx);
        if (this.shakeT > 0) this.shakeT -= DC2.DT;
      }
      const sc = this.world.active(), cart = this.cart;
      if (sc && DC.Audio && cart.scenes[sc.name] && cart.scenes[sc.name].music !== this.musicFor) {
        this.musicFor = cart.scenes[sc.name].music;
        if (this.musicFor && cart.music && cart.music[this.musicFor]) DC.Audio.playMusic(this.musicFor, cart.music[this.musicFor]); else if (DC.Audio.stopMusic) DC.Audio.stopMusic();
      }
      this.draw();
      if (this.opt.onStats) this.opt.onStats(this);
    }
    draw() {
      const w = this.world, g = this.g, cv = this.cv, cart = this.cart;
      if (!w) return this.drawReport();
      const W = cv.width, H = cv.height, sc = w.active();
      g.imageSmoothingEnabled = false; g.fillStyle = this.col(1); g.fillRect(0, 0, W, H);
      if (!sc) return;
      const m = sc.map, ts = m ? m.ts : 16, pl = w.player();
      let cx = 0, cy = 0;
      if (m) {
        const mw = m.w * ts, mh = m.h * ts, p = pl && pl.c.pos ? pl.c.pos : { x: mw / 2, y: mh / 2 };
        cx = mw <= W ? -(W - mw) / 2 : Math.max(0, Math.min(mw - W, p.x - W / 2));
        cy = mh <= H ? -(H - mh) / 2 : Math.max(0, Math.min(mh - H, p.y - H / 2));
        cx = Math.round(cx); cy = Math.round(cy);
      }
      if (this.shakeT > 0) { cx += Math.round((Math.random() - 0.5) * 4); cy += Math.round((Math.random() - 0.5) * 4); }
      if (m) {
        const art = {}, img = (id) => { if (!(id in art)) { const a = DC2.tileArt(cart, m.tileset, id, w.time); art[id] = a ? this.sprites.frames(a.sprite)[a.frame] : null; } return art[id]; };
        const x0 = Math.max(0, Math.floor(cx / ts)), x1 = Math.min(m.w - 1, Math.floor((cx + W) / ts)), y0 = Math.max(0, Math.floor(cy / ts)), y1 = Math.min(m.h - 1, Math.floor((cy + H) / ts));
        for (const L of m.layers) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const id = L.ids[y * m.w + x]; if (id > 0) { const im = img(id); if (im) g.drawImage(im, x * ts - cx, y * ts - cy); } }
      }
      for (const hook of DC2.drawHooks || []) { try { hook(g, w, sc, cx, cy, this); } catch (e) { /* a drawing extra must never break the game */ } }
      const list = sc.ents.filter((e) => !e.dead && e.c.sprite && e.c.pos && cart.sprites[e.c.sprite.id]);
      list.sort((a, b) => (a.c.sprite.layer - b.c.sprite.layer) * 10000 + (a.c.pos.y - b.c.pos.y));
      for (const e of list) {
        const s = e.c.sprite, def = cart.sprites[s.id];
        if (e.c.health && e.c.health.t > 0 && Math.floor(w.time * 20) % 2 === 0) continue;
        const img = this.sprites.frames(s.id)[DC2.spriteFrame(def, s)]; if (!img) continue;
        const x = Math.round(e.c.pos.x + s.ox - def.w / 2 - cx), y = Math.round(e.c.pos.y + s.oy - def.h / 2 - cy);
        const vh = Math.max(0, def.h - (s.sink | 0)); if (!vh) continue;   // "sink" hides the bottom rows (swimming, wading)
        if (s.turn && e.r.face && (e.r.face.x || e.r.face.y)) {   // rotated toward its facing (art points right)
          g.save(); g.translate(x + def.w / 2, y + def.h / 2); g.rotate(Math.atan2(e.r.face.y, e.r.face.x)); g.drawImage(img, 0, 0, def.w, vh, -def.w / 2, -def.h / 2, def.w, vh); g.restore();
        } else if (s.flip) { g.save(); g.translate(x + def.w, y); g.scale(-1, 1); g.drawImage(img, 0, 0, def.w, vh, 0, 0, def.w, vh); g.restore(); } else g.drawImage(img, 0, 0, def.w, vh, x, y, def.w, vh);
      }
      for (const h of w.hudItems()) this.text(h.text, h.align === 'center' ? W / 2 + h.x : h.x, h.y, h.color, h.align);
      const v = w.modeView();
      if (v && v.kind === 'dialogue') {
        const bx = 8, by = H - 68, bw = W - 16, bh = 60;
        g.fillStyle = 'rgba(20,16,40,0.92)'; g.fillRect(bx, by, bw, bh); g.strokeStyle = this.col(21); g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        if (v.name) this.text(v.name, bx + 8, by + 6, 8);
        wrap(v.text, Math.floor((bw - 16) / 8)).slice(0, 4).forEach((l, i) => this.text(l, bx + 8, by + 18 + i * 10, 21));
        if (v.choices.length) v.choices.forEach((c, i) => this.text((i === v.sel ? '> ' : '  ') + c, bx + bw - 8 - 8 * 10, by + 6 + i * 10, i === v.sel ? 8 : 23));
        else if (v.full && Math.floor(w.time * 3) % 2) this.text('v', bx + bw - 14, by + bh - 12, 8);
      }
      if (w.errors.length) this.text(w.errors[0].slice(0, 30), 4, H - 10, 27);
    }
    drawReport() {
      const g = this.g, cv = this.cv; if (!this.report) return;
      g.fillStyle = '#222034'; g.fillRect(0, 0, cv.width, cv.height);
      this.text('THIS GAME HAS PROBLEMS', 8, 8, 27);
      this.report.errors.slice(0, 12).forEach((e, i) => this.text((e.path + ': ' + e.msg).slice(0, 30), 8, 24 + i * 10, 21));
    }
  }
  function wrap(str, n) {
    const words = String(str).split(' '), lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur); return lines;
  }
  DC2.Runner = Runner;
})();
