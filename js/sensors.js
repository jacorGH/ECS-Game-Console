/* Data Console — sensory feedback and motion input */
(function () {
  const DC = window.DC;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- haptics ----------------
     Android / Chrome: navigator.vibrate with real patterns.
     iPhone (iOS 18+): Safari has no vibrate API, but toggling a native <input switch> plays the system
     haptic tick. It is reliable inside touch handlers; gameplay-triggered ticks are best effort.
     Controllers: Gamepad vibrationActuator rumble where the browser supports it. */
  const PATTERNS = {
    tap: 6, light: 10, medium: 20, heavy: 40,
    double: [14, 50, 14], success: [12, 60, 24], warning: [30, 60, 30], error: [40, 40, 40, 40, 60],
  };
  const TICKS = { tap: 1, light: 1, medium: 1, heavy: 2, double: 2, success: 2, warning: 2, error: 3 };
  const RUMBLE = { tap: [0, 0.2, 30], light: [0.1, 0.3, 50], medium: [0.4, 0.5, 90], heavy: [0.9, 0.7, 180], double: [0.5, 0.5, 160], success: [0.3, 0.6, 180], warning: [0.6, 0.6, 220], error: [1, 0.8, 300] };

  const H = (DC.Haptics = {
    on: true,          // player preference
    buttons: true,     // tick on control presses
    strength: 1,       // 0.5 soft … 1.5 strong
    canVibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    isIOS: typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)),
    label: null,
    last: 0,
    init() {
      try {
        const p = JSON.parse(localStorage.getItem('dc.haptics') || 'null');
        if (p) { this.on = p.on !== false; this.buttons = p.buttons !== false; this.strength = +p.strength || 1; }
      } catch (e) { /* defaults */ }
      if (this.isIOS && !this.canVibrate) {
        const l = document.createElement('label');
        l.setAttribute('aria-hidden', 'true');
        l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        const i = document.createElement('input');
        i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
        l.appendChild(i);
        document.body.appendChild(l);
        this.label = l;
      }
    },
    save() { try { localStorage.setItem('dc.haptics', JSON.stringify({ on: this.on, buttons: this.buttons, strength: this.strength })); } catch (e) { /* ignore */ } },
    get supported() { return this.canVibrate || !!this.label; },
    iosTick(n) {
      if (!this.label) return;
      this.label.click();
      for (let k = 1; k < n; k++) setTimeout(() => this.label && this.label.click(), k * 70);
    },
    /* kind: a name above, a number of ms, or an array pattern */
    play(kind, opts = {}) {
      if (!this.on) return;
      const now = performance.now();
      if (!opts.force && now - this.last < 35) return; // don't smear buzzes together
      this.last = now;
      const name = typeof kind === 'string' ? kind : 'medium';
      let pat = typeof kind === 'number' || Array.isArray(kind) ? kind : PATTERNS[kind] ?? PATTERNS.medium;
      if (this.canVibrate) {
        const s = this.strength;
        pat = Array.isArray(pat) ? pat.map((v, i) => (i % 2 ? v : Math.round(v * s))) : Math.round(pat * s);
        try { navigator.vibrate(pat); } catch (e) { /* ignore */ }
      } else if (this.label) {
        this.iosTick(typeof kind === 'number' ? (kind > 25 ? 2 : 1) : Array.isArray(kind) ? Math.ceil(kind.length / 2) : TICKS[name] || 1);
      }
      if (opts.pad !== false) this.rumble(name);
    },
    tap() { if (this.buttons) this.play('tap', { pad: false }); },
    rumble(name) {
      const r = RUMBLE[name] || RUMBLE.medium;
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gps) {
        const act = gp && gp.vibrationActuator;
        if (act && act.playEffect) {
          try { act.playEffect('dual-rumble', { duration: r[2], strongMagnitude: clamp(r[0] * this.strength, 0, 1), weakMagnitude: clamp(r[1] * this.strength, 0, 1) }); } catch (e) { /* unsupported */ }
        }
      }
    },
  });

  /* ---------------- motion ----------------
     Tilt gives x/y from -1 to 1 (relative to how you held the phone when calibrated),
     corrected for portrait/landscape. A hard shake counts as an event. iPhone asks permission once. */
  const M = (DC.Motion = {
    on: false, steer: false, x: 0, y: 0, rawX: 0, rawY: 0, zeroX: 0, zeroY: 0, range: 25,
    shakes: 0, lastShake: 0, error: null,
    get available() { return typeof window.DeviceOrientationEvent !== 'undefined'; },
    get needsPermission() { return this.available && typeof DeviceOrientationEvent.requestPermission === 'function'; },
    init() {
      try {
        const p = JSON.parse(localStorage.getItem('dc.motion') || 'null');
        if (p) { this.steer = !!p.steer; this.range = +p.range || 25; this.zeroX = +p.zeroX || 0; this.zeroY = +p.zeroY || 0; this.wanted = !!p.on; }
      } catch (e) { /* defaults */ }
      // Android and desktop need no permission prompt, so resume straight away
      if (this.wanted && !this.needsPermission) this.enable().catch(() => {});
    },
    save() { try { localStorage.setItem('dc.motion', JSON.stringify({ on: this.on, steer: this.steer, range: this.range, zeroX: this.zeroX, zeroY: this.zeroY })); } catch (e) { /* ignore */ } },
    /* must be called from a tap on iPhone */
    async enable() {
      if (!this.available) throw new Error('This device has no motion sensor access.');
      if (this.needsPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') throw new Error('Motion access was not allowed. You can allow it in Safari’s website settings.');
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          try { await DeviceMotionEvent.requestPermission(); } catch (e) { /* shake just won't work */ }
        }
      }
      if (!this.bound) {
        window.addEventListener('deviceorientation', (e) => this.onOrient(e));
        window.addEventListener('devicemotion', (e) => this.onMotion(e));
        this.bound = true;
      }
      this.on = true; this.error = null; this.save();
      return true;
    },
    disable() { this.on = false; this.x = this.y = 0; this.save(); },
    angle() {
      const a = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : +window.orientation || 0;
      return ((a % 360) + 360) % 360;
    },
    onOrient(e) {
      if (e.beta == null || e.gamma == null) return;
      const b = e.beta, g = e.gamma, a = this.angle();
      let x, y;
      if (a === 90) { x = b; y = -g; } else if (a === 270) { x = -b; y = g; } else if (a === 180) { x = -g; y = -b; } else { x = g; y = b; }
      this.rawX = x; this.rawY = y;
      if (!this.on) return;
      this.x = clamp((x - this.zeroX) / this.range, -1, 1);
      this.y = clamp((y - this.zeroY) / this.range, -1, 1);
    },
    onMotion(e) {
      if (!this.on) return;
      const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
      let mag;
      if (a) mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      else { const g = e.accelerationIncludingGravity; if (!g) return; mag = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81); }
      const now = performance.now();
      if (mag > 14 && now - this.lastShake > 600) { this.lastShake = now; this.shakes++; }
    },
    calibrate() { this.zeroX = this.rawX; this.zeroY = this.rawY; this.x = this.y = 0; this.save(); },
    /* d-pad directions from tilt, with a dead zone */
    dirs() {
      const d = {};
      if (!this.on || !this.steer) return d;
      const dz = 0.3;
      if (this.x < -dz) d.left = true; else if (this.x > dz) d.right = true;
      if (this.y < -dz) d.up = true; else if (this.y > dz) d.down = true;
      return d;
    },
  });

  DC.initSensors = () => { H.init(); M.init(); };
})();
