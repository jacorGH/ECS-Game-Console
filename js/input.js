/* Data Console — input: keyboard, touch pad, gamepad, remote players */
(function () {
  const DC = window.DC;
  const B = DC.BUTTONS;
  const mk = () => ({ down: {}, prev: {}, pressed: {}, released: {} });
  const buzz = () => { if (DC.Haptics) DC.Haptics.tap(); };

  const I = (DC.Input = {
    players: [mk(), mk(), mk(), mk()],
    kb: {}, touch: {}, pad: {},
    remote: [null, {}, {}, {}],
    localIndex: 0,
    enabled: true,
    localDown: {},
    keymap: {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      KeyZ: 'a', KeyJ: 'a', Space: 'a', KeyX: 'b', KeyK: 'b', KeyC: 'x', KeyU: 'x', KeyV: 'y', KeyI: 'y',
      Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select', Backspace: 'select',
    },

    init() {
      const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
      window.addEventListener('keydown', (e) => {
        if (!this.enabled || typing(e)) return;
        const b = this.keymap[e.code];
        if (b) { this.kb[b] = true; e.preventDefault(); }
      });
      window.addEventListener('keyup', (e) => {
        const b = this.keymap[e.code];
        if (b) this.kb[b] = false;
      });
      window.addEventListener('blur', () => { this.kb = {}; this.touch = {}; });
    },

    /* Touch: whole-zone d-pad, nearest-button face zone, plain buttons for Start/Select */
    bindTouch(o) {
      const dirs = ['up', 'down', 'left', 'right'];
      const oct = {
        0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['left', 'down'], 4: ['left'], '-4': ['left'],
        '-3': ['left', 'up'], '-2': ['up'], '-1': ['right', 'up'],
      };
      const cap = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } };
      const kill = (el) => ['contextmenu', 'selectstart', 'dblclick'].forEach((t) => el.addEventListener(t, (e) => e.preventDefault()));

      // D-pad: a thumb anywhere in the left zone steers, measured from the pad's centre
      const pad = o.dpad, pz = o.dpadZone;
      let active = null, lastKey = '';
      const setDir = (ev) => {
        const r = pad.getBoundingClientRect();
        const x = ev.clientX - (r.left + r.width / 2), y = ev.clientY - (r.top + r.height / 2);
        dirs.forEach((d) => (this.touch[d] = false));
        if (Math.hypot(x, y) < r.width * 0.13) { pad.dataset.dir = ''; lastKey = ''; return; }
        const set = oct[Math.round(Math.atan2(y, x) / (Math.PI / 4))] || [];
        set.forEach((d) => (this.touch[d] = true));
        const key = set.join(' ');
        if (key !== lastKey) { buzz(); lastKey = key; }
        pad.dataset.dir = key;
      };
      const padEnd = (e) => {
        if (e.pointerId !== active) return;
        active = null; lastKey = '';
        dirs.forEach((d) => (this.touch[d] = false));
        pad.dataset.dir = '';
      };
      pz.addEventListener('pointerdown', (e) => { e.preventDefault(); if (active != null) return; active = e.pointerId; cap(pz, e); setDir(e); });
      pz.addEventListener('pointermove', (e) => { if (e.pointerId === active) setDir(e); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => pz.addEventListener(t, padEnd));
      kill(pz);

      // Face buttons: each finger presses the nearest button; a finger between two presses both
      const fz = o.faceZone, faces = o.faces;
      const fingers = new Map();
      const pick = (e) => {
        const hits = faces.map((el) => {
          const r = el.getBoundingClientRect();
          return { b: el.dataset.face, d: Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)), rad: r.width / 2 };
        }).sort((p, q) => p.d - q.d);
        const out = new Set();
        const [n1, n2] = hits;
        if (!n1 || n1.d > n1.rad * 2.2) return out;
        out.add(n1.b);
        if (n2 && n2.d < n2.rad * 1.35 && n2.d < n1.d * 1.3) out.add(n2.b);
        return out;
      };
      const syncFaces = () => {
        const down = new Set();
        for (const s of fingers.values()) s.forEach((b) => down.add(b));
        faces.forEach((el) => {
          const b = el.dataset.face, on = down.has(b);
          if (on && !this.touch[b]) buzz();
          this.touch[b] = on;
          el.classList.toggle('down', on);
        });
      };
      fz.addEventListener('pointerdown', (e) => { e.preventDefault(); cap(fz, e); fingers.set(e.pointerId, pick(e)); syncFaces(); });
      fz.addEventListener('pointermove', (e) => { if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, pick(e)); syncFaces(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => fz.addEventListener(t, (e) => { if (fingers.delete(e.pointerId)) syncFaces(); }));
      kill(fz);

      // Start / Select
      (o.buttons || []).forEach((el) => {
        const b = el.dataset.btn;
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); cap(el, e); this.touch[b] = true; el.classList.add('down'); buzz(); });
        const up = () => { this.touch[b] = false; el.classList.remove('down'); };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => el.addEventListener(t, up));
        kill(el);
      });
    },

    pollPad() {
      this.pad = {};
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gps) {
        if (!gp) continue;
        const b = gp.buttons, ax = gp.axes, p = this.pad;
        const pr = (i) => b[i] && b[i].pressed;
        if (pr(12) || ax[1] < -0.5) p.up = 1;
        if (pr(13) || ax[1] > 0.5) p.down = 1;
        if (pr(14) || ax[0] < -0.5) p.left = 1;
        if (pr(15) || ax[0] > 0.5) p.right = 1;
        if (pr(0)) p.a = 1; if (pr(1)) p.b = 1; if (pr(2)) p.x = 1; if (pr(3)) p.y = 1;
        if (pr(9)) p.start = 1; if (pr(8)) p.select = 1;
        break;
      }
    },

    update() {
      this.pollPad();
      const local = {};
      const tilt = DC.Motion ? DC.Motion.dirs() : {};
      for (const b of B) local[b] = !!(this.enabled && (this.kb[b] || this.touch[b] || this.pad[b] || tilt[b]));
      this.localDown = local;
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        const src = i === this.localIndex ? local : this.remote[i] || {};
        for (const b of B) {
          p.prev[b] = p.down[b];
          p.down[b] = !!src[b];
          p.pressed[b] = p.down[b] && !p.prev[b];
          p.released[b] = !p.down[b] && p.prev[b];
        }
      }
    },
    consume(b) { for (const p of this.players) p.pressed[b] = false; },
    toMask(s) { let m = 0; B.forEach((b, i) => { if (s[b]) m |= 1 << i; }); return m; },
    fromMask(m) { const s = {}; B.forEach((b, i) => (s[b] = !!(m & (1 << i)))); return s; },
  });
})();
