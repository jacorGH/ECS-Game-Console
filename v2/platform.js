/* Page glue for the standalone v2 player (v2/index.html): binds the touch controls and the buttons around a Runner. */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, $ = (s) => document.querySelector(s), P = (DC2.platform = {});
  function fit(cv) {
    const wrapEl = $('#screenWrap'); if (!wrapEl || !wrapEl.clientWidth) return;
    let s = Math.min(wrapEl.clientWidth / cv.width, wrapEl.clientHeight / cv.height); const si = Math.floor(s);
    if (si >= 1 && si / s > 0.82) s = si;
    cv.style.width = Math.floor(cv.width * s) + 'px'; cv.style.height = Math.floor(cv.height * s) + 'px';
  }
  P.init = function () {
    const cv = $('#screen');
    const runner = (P.runner = new DC2.Runner(cv, { onLoad: () => { fit(cv); $('#cartTitle').textContent = runner.cart.meta.title; }, onStats: (r) => { const e = $('#v2Stats'), sc = r.world.active(); if (e) e.textContent = `frame ${r.world.frame} · ents ${sc ? sc.ents.length : 0} · stack ${r.world.stack.length}${r.world.errors.length ? ' · ERR ' + r.world.errors.length : ''}`; } }));
    DC.Input.init();
    DC.Input.bindTouch({ dpad: $('#dpad'), dpadZone: $('#dpadZone'), faceZone: $('#faceZone'), faces: [...document.querySelectorAll('[data-face]')], buttons: [...document.querySelectorAll('[data-btn]')] });
    if (window.ResizeObserver) new ResizeObserver(() => fit(cv)).observe($('#screenWrap'));
    window.addEventListener('resize', () => fit(cv));
    $('#tapStart').onclick = () => { $('#tapStart').hidden = true; if (DC.Audio) DC.Audio.unlock(); };
    $('#btnRestart').onclick = () => runner.load(runner.cart);
    $('#btnSave').onclick = () => { if (runner.world) { P.snap = runner.world.save(); $('#btnSave').textContent = 'Saved ✓'; setTimeout(() => ($('#btnSave').textContent = 'Save state'), 900); } };
    $('#btnLoad').onclick = () => { if (runner.world && P.snap) runner.world = DC2.restore(runner.cart, runner.reg, P.snap, { seed: 1 }); };
    /* volume: the player's own levels for this device, on top of the game's balance. Remembered by the browser. */
    const syncVol = () => {
      const d = DC2.mixer.device();
      for (const [id, k] of [['volMaster', 'master'], ['volMusic', 'music'], ['volSfx', 'sfx']]) { $('#' + id).value = Math.round(d[k] * 100); $('#' + id + 'Out').textContent = Math.round(d[k] * 100) + '%'; }
      $('#btnMute').textContent = d.muted ? 'Sound off' : 'Sound on'; $('#btnMute').setAttribute('aria-pressed', String(!d.muted));
    };
    for (const [id, k] of [['volMaster', 'master'], ['volMusic', 'music'], ['volSfx', 'sfx']]) $('#' + id).oninput = () => { DC2.mixer.setDevice({ [k]: +$('#' + id).value / 100 }); syncVol(); };
    $('#btnMute').onclick = () => { DC2.mixer.setDevice({ muted: !DC2.mixer.device().muted }); syncVol(); };
    $('#btnVolume').onclick = () => { const p = $('#volPanel'); p.hidden = !p.hidden; $('#btnVolume').setAttribute('aria-expanded', String(!p.hidden)); };
    syncVol();
    runner.load(window.DC2_CARTS['flag-of-gold']); runner.start();
  };
  Object.defineProperty(P, 'world', { get: () => P.runner && P.runner.world });
  window.addEventListener('DOMContentLoaded', P.init);
})();
