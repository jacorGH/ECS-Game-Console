/* Stops the browser zooming the page on double-tap or pinch. CSS touch-action:manipulation does most of it; this
   covers what iOS Safari still lets through (it ignores user-scalable=no). Buttons and form fields are left alone
   so fast repeated taps on them still register. Canvases handle their own pinch (pointer events are unaffected). */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const skip = (t) => t && t.closest && t.closest('button, input, textarea, select, label, a, [contenteditable], [data-k]');
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last < 350 && e.changedTouches.length === 1 && !skip(e.target)) e.preventDefault();
    last = now;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (!skip(e.target)) e.preventDefault(); }, { passive: false });
  /* iOS Safari can still start a text selection (magnifier, Copy / Look Up bubble) from a long press or drag even with
     user-select: none on some elements. Refuse it anywhere that isn't a typing field, the code editor or marked selectable. */
  const okText = (t) => { const el = t && t.nodeType === 3 ? t.parentElement : t; return !!(el && el.closest && el.closest('input, textarea, [contenteditable="true"], .ce-ta, .selectable, .importnote, .report li, .issue')); };
  document.addEventListener('selectstart', (e) => { if (!okText(e.target)) e.preventDefault(); }, true);
  document.addEventListener('contextmenu', (e) => { if (!okText(e.target)) e.preventDefault(); }, true);
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false });
})();
