/* v2 mixer: what the player hears = the game's own balance (meta.mix, saved with the game) combined with the player's
   volume on this device (saved in the browser, never in the game). Pure numbers, then handed to the audio engine.
     game:    meta.mix = { music: 0..2, sfx: 0..2 }   1 = as designed. Missing = 1.
     device:  { master 0..1, music 0..1, sfx 0..1, muted }
     result:  master = device.master;  music = game.music * device.music;  sfx = game.sfx * device.sfx */
(function (root) {
  'use strict';
  const DC2 = root.DC2 || (root.DC2 = {}), KEY = 'dc2.audio';
  const num = (x, lo, hi, d) => (typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const M = (DC2.mixer = {
    DEFAULT: { master: 1, music: 1, sfx: 1, muted: false },
    cart: null,
    storage() { try { return root.localStorage || null; } catch (e) { return null; } },
    normDevice(o) { o = o && typeof o === 'object' ? o : {}; return { master: num(o.master, 0, 1, 1), music: num(o.music, 0, 1, 1), sfx: num(o.sfx, 0, 1, 1), muted: o.muted === true }; },
    device() { const st = M.storage(); let raw = null; try { raw = st && JSON.parse(st.getItem(KEY)); } catch (e) { /* unreadable: use defaults */ } return M.normDevice(raw); },
    /* change part of the device volume, remember it, and apply it */
    setDevice(patch, cart) { const d = Object.assign(M.device(), patch), n = M.normDevice(d), st = M.storage(); try { if (st) st.setItem(KEY, JSON.stringify(n)); } catch (e) { /* private mode: it still applies for now */ } M.apply(cart); return n; },
    gameMix(cart) { const m = (cart && cart.meta && cart.meta.mix) || {}; return { music: num(m.music, 0, 2, 1), sfx: num(m.sfx, 0, 2, 1) }; },
    levels(cart, dev) { dev = dev ? M.normDevice(dev) : M.device(); const g = M.gameMix(cart); return { master: dev.master, music: g.music * dev.music, sfx: g.sfx * dev.sfx, muted: dev.muted }; },
    /* hand the result to the audio engine (a game being edited passes itself, so the engine follows the edits) */
    apply(cart) { if (cart) M.cart = cart; const A = root.DC && root.DC.Audio; if (!A || !A.setLevels) return null; const l = M.levels(M.cart); A.setLevels(l); return l; },
    /* the perceptual curve for level sliders: quiet values get more of the slider. position 0..100 <-> level 0..1 */
    toLevel(pos) { const p = num(pos, 0, 100, 0) / 100; return p * p; },
    toPos(level) { return Math.round(Math.sqrt(num(level, 0, 1, 0)) * 100); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
