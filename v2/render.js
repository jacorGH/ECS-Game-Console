/* v2 rendering helpers shared by the game runner and the studio editors. */
(function () {
  'use strict';
  const DC2 = window.DC2;
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  /* Turns the cart's pixel-string sprites into canvases, once, and hands them out by id. */
  class SpriteCache {
    constructor(cart) { this.cart = cart; this.sheets = {}; }
    setCart(cart) { this.cart = cart; this.sheets = {}; }
    invalidate(id) { if (id) delete this.sheets[id]; else this.sheets = {}; }
    frames(id) {
      if (this.sheets[id]) return this.sheets[id];
      const def = this.cart.sprites[id]; if (!def) return (this.sheets[id] = []);
      const pal = (this.cart.palettes[def.palette || 'main'] || []).map(hexRGB), out = [];
      for (const f of def.frames) {
        const c = document.createElement('canvas'); c.width = def.w; c.height = def.h;
        const cx = c.getContext('2d'), img = cx.createImageData(def.w, def.h);
        f.split('/').forEach((row, y) => { for (let x = 0; x < def.w; x++) {
          const k = DC2.B36.indexOf(row[x]); if (k < 0 || !pal[k]) continue;
          const o = (y * def.w + x) * 4; img.data[o] = pal[k][0]; img.data[o + 1] = pal[k][1]; img.data[o + 2] = pal[k][2]; img.data[o + 3] = 255;
        } });
        cx.putImageData(img, 0, 0); out.push(c);
      }
      return (this.sheets[id] = out);
    }
    /* a small canvas showing frame 0 of a sprite, for lists and pickers */
    thumb(id, size) {
      const c = document.createElement('canvas'), fr = this.frames(id)[0]; c.width = c.height = size || 32;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      if (fr) { const k = Math.min(c.width / fr.width, c.height / fr.height); const w = fr.width * k, h = fr.height * k; g.drawImage(fr, (c.width - w) / 2, (c.height - h) / 2, w, h); }
      return c;
    }
    tile(sheetId, n) { return this.frames(sheetId)[n - 1]; }
  }
  DC2.SpriteCache = SpriteCache;
  DC2.color = (cart, i) => (cart.palettes.main || [])[i] || '#ffffff';
})();
