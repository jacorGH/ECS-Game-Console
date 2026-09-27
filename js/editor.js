/* Data Console — editor shell */
(function () {
  const DC = window.DC;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Browser storage is full. Export carts you want to keep, then delete some.'); return false; } },
  };
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), ms || 2800);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* no */ }
      ta.remove(); return ok;
    }
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
  const readURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  DC.toast = toast;
  const COMPONENT_TEMPLATES = {
    tags: [], sprite: { name: '' }, body: { w: 12, h: 12 }, solid: true,
    control: { type: 'platformer', speed: 90, jump: 300 }, ai: { type: 'patrol', speed: 30 },
    health: { hp: 3, invuln: 0.5 }, hurt: { damage: 1, targets: ['player'] }, stompable: { bounce: 220 },
    pickup: { var: 'coins', add: 1 }, attack: { button: 'b', prefab: '', cooldown: 0.4, offset: 12 },
    lifetime: { t: 1 }, talk: { name: '', lines: ['Hello!', { text: 'Need anything?', choices: [{ text: 'Yes', lines: ['Here you go.'] }, { text: 'No', cancel: true }] }], branches: [{ if: 'self.talks > 0', lines: ['Hello again!'] }] }, warp: { scene: '', at: '' },
    move: { path: [[0, 0], [3, 0]], speed: 30 }, spawner: { prefab: '', every: 3, max: 3 },
    emitter: { color: [8, 5], rate: 10, speed: 30, life: 0.6 }, text: { value: 'Hello', color: 21 },
    vel: [0, 0], vars: {}, noCollide: true, layer: 1, persistent: true,
    rules: [{ on: 'every', t: 1, do: [{ add: 'self.count', value: 1 }] }],
    states: { start: 'idle', idle: { rules: [{ on: 'when', if: 'dist(self, player) < 60', goto: 'alert' }] }, alert: { enter: [{ sound: 'alert' }], ai: { type: 'chase', speed: 60 }, rules: [{ on: 'when', if: 'dist(self, player) > 100', goto: 'idle' }] } },
  };

  const Ed = (DC.Editor = {
    cart: null, engine: null, tab: 'play', codeDirty: false, cartChanged: false, frames: {},

    async init() {
      this.engine = new DC.Engine($('#screen'));
      this.engine.onWarn = (m) => toast(m, 4000);
      DC.initSensors();
      DC.Input.init();
      DC.Input.bindTouch({ dpad: $('#dpad'), dpadZone: $('#dpadZone'), faceZone: $('#faceZone'), faces: $$('[data-face]'), buttons: $$('[data-btn]') });
      this.guardPlayTouches();
      $$('#tabs button').forEach((b) => (b.onclick = () => this.show(b.dataset.tab)));
      const unlock = () => DC.Audio.unlock();
      document.addEventListener('pointerdown', unlock, { capture: true });
      document.addEventListener('keydown', unlock, { capture: true });
      if (window.ResizeObserver) new ResizeObserver(() => this.fitScreen()).observe($('#screenWrap'));
      window.addEventListener('resize', () => this.fitScreen());

      if (window.visualViewport) {
        const vv = window.visualViewport, root = document.documentElement.style;
        const fit = () => { root.setProperty('--app-h', vv.height + 'px'); root.setProperty('--app-top', vv.offsetTop + 'px'); };
        vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
      }
      this.initPlay(); this.initCode(); this.initSprite(); this.initMap(); this.initAI(); this.initNet(); this.initCarts(); this.initDev(); this.initPip(); this.initControls();

      let cart = null;
      if (location.hash.startsWith('#c=')) {
        try { cart = await DC.unpackCart(location.hash.slice(3)); toast('Loaded a shared cart'); }
        catch (e) { toast('That share link is damaged or cut off.'); }
        history.replaceState(null, '', location.pathname + location.search);
      }
      if (!cart) cart = LS.get('dc.current', null);
      if (!cart) cart = DC.clone(DC.DEMO_CART);
      await this.setCart(cart, { save: true });
      const join = new URLSearchParams(location.search).get('join');
      if (join) { $('#netJoinCode').value = join; this.show('net'); this.doJoin(); }
    },

    /* ------------ cart state ------------ */
    async setCart(cart, opts = {}) {
      this.cart = cart;
      this.codeDirty = false;
      DC.validateCart(cart);
      this.writeCode();
      if (opts.save !== false) this.save();
      await this.run();
    },
    save() { LS.set('dc.current', this.cart); },
    /* Modules: the code tab edits one slice of the cart at a time (or the whole thing) */
    modPath: [],
    modGet(path) {
      if (!path.length) return this.cart;
      const g = this.cart[path[0]];
      return path.length === 1 ? g : g && g[path[1]];
    },
    modKind(path) {
      if (!path.length) return 'obj';
      if (path.length === 2) return 'obj';
      return ['hud', 'rules', 'palette'].includes(path[0]) ? 'arr' : 'obj';
    },
    modLabel(path) {
      if (!path.length) return 'Whole cart';
      const names = { meta: 'Settings', vars: 'Variables', hud: 'HUD', rules: 'Global rules', tiles: 'Tiles', sounds: 'Sounds', palette: 'Palette', scenes: 'Scene', prefabs: 'Prefab', sprites: 'Sprite', music: 'Music', behaviors: 'Behavior' };
      return path.length === 1 ? names[path[0]] || path[0] : `${names[path[0]] || path[0]} › ${path[1]}`;
    },
    writeCode() {
      let path = this.modPath;
      if (path.length === 2 && !(this.cart[path[0]] && Object.prototype.hasOwnProperty.call(this.cart[path[0]], path[1]))) path = this.modPath = [];
      let v = this.modGet(path);
      if (v === undefined) v = this.modKind(path) === 'arr' ? [] : {};
      this.ce.value = DC.pretty(v);
      this.codeDirty = false;
      $('#codeModLabel').textContent = this.modLabel(path);
      $('#codeModRename').hidden = $('#codeModDelete').hidden = path.length !== 2;
    },
    parseModule(text) {
      if (!this.modPath.length) return DC.scrubJSON(text);
      const r = DC.scrubJSON('{"_":' + text + '\n}');
      if (!r.ok) return r;
      const v = r.data._;
      const kind = this.modKind(this.modPath);
      if (kind === 'arr' && !Array.isArray(v)) return { ok: false, error: `${this.modLabel(this.modPath)} must be a list: [ ... ]`, fixes: r.fixes };
      if (kind === 'obj' && (!v || typeof v !== 'object' || Array.isArray(v))) return { ok: false, error: `${this.modLabel(this.modPath)} must be an object: { ... }`, fixes: r.fixes };
      return { ok: true, data: v, fixes: r.fixes };
    },
    applyModule(v) {
      const path = this.modPath;
      if (!path.length) this.cart = v;
      else if (path.length === 1) this.cart[path[0]] = v;
      else { this.cart[path[0]] = this.cart[path[0]] || {}; this.cart[path[0]][path[1]] = v; }
    },
    syncCode() {
      if (!this.codeDirty) return true;
      const r = this.parseModule(this.ce.value);
      if (!r.ok) { this.report('#codeReport', [r.error], [], r.fixes); return false; }
      this.applyModule(r.data);
      this.codeDirty = false;
      this.cartChanged = true;
      if (r.fixes.length) { this.writeCode(); toast('Cleaned up: ' + r.fixes.join(', ').toLowerCase()); }
      this.save();
      return true;
    },
    openModule(path) {
      if (!this.syncCode()) { toast('Fix the JSON error in this module first.'); return false; }
      this.modPath = path;
      this.writeCode();
      this.closeModPanel();
      $('#codeReport').innerHTML = '';
      return true;
    },
    async run() {
      if (!this.syncCode()) { this.show('code'); toast('Fix the JSON error before running.'); return false; }
      if (DC.Net.role === 'client') { toast('Leave the room to play your own cart.'); return false; }
      try {
        const rep = await this.engine.load(this.cart);
        this.cartChanged = false;
        $('#cartTitle').textContent = this.cart.meta.title;
        if (this.wantsMotion()) { $('#tapStart').textContent = 'Tap to enable motion controls'; $('#tapStart').hidden = false; }
        document.title = this.cart.meta.title + ' · Data Console';
        if (rep.warns.length) this.report('#codeReport', [], rep.warns, []);
        else $('#codeReport').innerHTML = '';
        if (DC.Net.role === 'host') DC.Net.rehello();
        this.frames = this.engine.frames;
        this.fitScreen();
        return true;
      } catch (e) {
        const list = String(e.message).split('\n');
        this.report('#codeReport', list, [], []);
        this.show('code');
        toast('The cart has errors — see the list above the code.');
        return false;
      }
    },
    report(sel, errors, warns, fixes) {
      const el = $(sel);
      const li = (cls, m) => {
        let attrs = '';
        const ln = /line (\d+), column (\d+)/.exec(m);
        const it = /(Prefab|Scene|Sprite) "([^"]+)"/.exec(m);
        const tile = /Tile (?:key )?"(.)"/.exec(m);
        if (ln) attrs = ` data-line="${ln[1]}" data-col="${ln[2]}"`;
        else if (it) attrs = ` data-mod='${esc(JSON.stringify([it[1].toLowerCase() + 's', it[2]]))}'`;
        else if (tile) attrs = ` data-mod='["tiles"]' data-find="${esc(JSON.stringify(tile[1]) + ':')}"`;
        else if (/^Global rule/.test(m)) attrs = ` data-mod='["rules"]'`;
        else if (/^meta\./.test(m)) attrs = ` data-mod='["meta"]'`;
        return `<li class="${cls}${attrs ? ' jump' : ''}"${attrs}>${esc(m)}</li>`;
      };
      el.innerHTML = errors.length + warns.length + fixes.length
        ? '<ul>' + errors.map((m) => li('err', m)).join('') + warns.map((m) => li('warn', m)).join('') + fixes.map((m) => li('fix', m)).join('') + '</ul>'
        : '';
    },
    touch() { this.cartChanged = true; this.save(); this.scheduleLive(); },
    /* live editing: push changes into the running game without restarting it */
    scheduleLive() {
      clearTimeout(this.liveT);
      if (!this.engine.scene || DC.Net.role === 'client') return;
      this.liveT = setTimeout(() => this.applyLive(true), 400);
    },
    async applyLive(quiet) {
      clearTimeout(this.liveT);
      if (!this.syncCode()) { if (!quiet) toast('Fix the JSON error first.'); return false; }
      if (DC.Net.role === 'client') { if (!quiet) toast('Leave the room to edit your own cart.'); return false; }
      if (!this.engine.scene) return this.run();
      try {
        const rep = await this.engine.hotReload(this.cart);
        this.cartChanged = false;
        this.frames = this.engine.frames;
        $('#cartTitle').textContent = this.cart.meta.title;
        if (DC.Net.role === 'host') DC.Net.rehello();
        if (!quiet) {
          toast('Applied — the game kept running.');
          this.report('#codeReport', [], rep.warns, rep.warns.length ? [] : ['Applied to the running game']);
        }
        this.fitScreen();
        return true;
      } catch (e) {
        this.report('#codeReport', String(e.message).split('\n'), [], []);
        if (!quiet) toast('Not applied — see the problems above the code.');
        else if (this.tab !== 'code') toast('Your last edit has a problem — check the Code tab.');
        return false;
      }
    },

    /* ------------ tabs ------------ */
    show(tab) {
      if (this.tab === 'code' && tab !== 'code' && this.codeDirty && !this.syncCode()) { toast('Fix the JSON error before leaving the code.'); return; }
      this.tab = tab;
      $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      $$('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + tab));
      this.updatePip();
      if (tab === 'play') {
        if (this.cartChanged && DC.Net.role !== 'client') this.applyLive(true);
        requestAnimationFrame(() => this.fitScreen());
      }
      if (tab === 'code' && !this.codeDirty) this.writeCode();
      if (tab === 'sprite') this.spRefresh();
      if (tab === 'map') this.mapRefresh();
      if (tab === 'carts') this.cartsRefresh();
    },

    /* ------------ play ------------ */
    initPlay() {
      $('#tapStart').addEventListener('pointerup', async () => {
        DC.Audio.unlock();
        $('#tapStart').hidden = true;
        if (this.wantsMotion()) {
          try { await DC.Motion.enable(); if (this.cart.meta.motion === 'steer') DC.Motion.steer = true; DC.Motion.calibrate(); toast('Motion on — hold the phone how you like to play.'); }
          catch (e) { toast(e.message, 4500); }
        }
      });
      $('#btnRestart').onclick = () => { if (DC.Net.role === 'client') return toast('Only the host can restart.'); this.run(); };
      $('#btnMute').onclick = () => {
        DC.Audio.setMuted(!DC.Audio.muted);
        $('#btnMute').textContent = DC.Audio.muted ? 'Sound off' : 'Sound on';
        $('#btnMute').setAttribute('aria-pressed', String(!DC.Audio.muted));
      };
      $('#btnFull').onclick = () => {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else if (req) req.call(el).catch(() => toast('Full screen is blocked here. On iPhone, use Share → Add to Home Screen.'));
        else toast('On iPhone, use Share → Add to Home Screen for full screen.');
      };
    },
    /* Stop iOS/Android zoom, text selection, magnifier and callouts from stealing game touches */
    guardPlayTouches() {
      const shell = $('#tab-play .shell');
      shell.addEventListener('touchstart', (e) => { if (e.touches.length || e.cancelable) e.preventDefault(); }, { passive: false });
      shell.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
      const inPlay = () => this.tab === 'play';
      ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => { if (inPlay()) e.preventDefault(); }, { passive: false }));
      document.addEventListener('dblclick', (e) => { if (inPlay() || e.target.closest('.toolbar, .tabs, .playbar')) e.preventDefault(); }, { passive: false });
      $('#tab-play').addEventListener('contextmenu', (e) => e.preventDefault());
      $('#tab-play').addEventListener('selectstart', (e) => e.preventDefault());
      // Pause when the page is hidden so you don't come back to a beating
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.engine.mode === 'local' && this.engine.scene) this.engine.paused = true;
        DC.Input.kb = {}; DC.Input.touch = {};
      });
    },
    fitScreen() {
      const wrap = $('#screenWrap'), cv = $('#screen');
      if (!wrap || !wrap.clientWidth) return;
      const W = cv.width, H = cv.height;
      let s = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
      const si = Math.floor(s);
      if (si >= 1 && si / s > 0.82) s = si;
      cv.style.width = Math.floor(W * s) + 'px';
      cv.style.height = Math.floor(H * s) + 'px';
    },

    /* ------------ code ------------ */
    initCode() {
      const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      this.ce = new DC.CodeEditor($('#codeEditor'), {
        font: LS.get('dc.codeFont', coarse ? 16 : 14),
        palette: () => this.spPal(),
        onChange: () => { this.codeDirty = true; },
        onRun: () => $('#codeRun').click(),
        onSave: () => this.applyLive(false),
      });
      const font = (d) => { this.ce.setFont(this.ce.font + d); LS.set('dc.codeFont', this.ce.font); };
      $('#codeFontUp').onclick = () => font(1);
      $('#codeFontDown').onclick = () => font(-1);
      $('#codeFind').onclick = () => this.ce.openFind();
      $('#codeApply').onclick = () => this.applyLive(false);
      $('#codeRun').onclick = async () => { if (await this.applyLive(true)) this.show('play'); };
      const more = $('#codeMore'), moreBtn = $('#codeMoreBtn');
      const setMore = (open) => { more.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); };
      moreBtn.onclick = (e) => { e.stopPropagation(); setMore(more.hidden); };
      more.addEventListener('click', (e) => { if (e.target.closest('button')) setMore(false); });
      document.addEventListener('pointerdown', (e) => { if (!more.hidden && !e.target.closest('.more')) setMore(false); });
      $('#codeRestart').onclick = async () => { if (await this.run()) this.show('play'); };
      $('#codeTidy').onclick = () => {
        const r = this.parseModule(this.ce.value);
        if (!r.ok) return this.report('#codeReport', [r.error], [], r.fixes);
        this.applyModule(r.data);
        const rep = DC.validateCart(this.cart);
        this.writeCode(); this.save(); this.cartChanged = true;
        this.report('#codeReport', rep.errors, rep.warns, r.fixes.length ? r.fixes : ['Formatted — the JSON is valid']);
      };
      $('#codeCheck').onclick = () => {
        if (!this.syncCode()) return;
        const rep = DC.validateCart(this.cart);
        this.report('#codeReport', rep.errors, rep.warns, rep.errors.length + rep.warns.length ? [] : ['No problems found']);
      };
      $('#codeExport').onclick = () => { if (this.syncCode()) download(DC.slug(this.cart.meta.title) + '.json', DC.pretty(this.cart)); };
      $('#codeImport').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        const r = DC.scrubJSON(await readFile(f));
        if (!r.ok) { this.modPath = []; this.writeCode(); this.ce.value = r.text || ''; this.codeDirty = true; return this.report('#codeReport', [r.error], [], r.fixes); }
        this.modPath = [];
        await this.setCart(r.data);
        this.report('#codeReport', [], [], r.fixes);
        toast('Imported ' + f.name);
      };
      $('#codeReport').onclick = (e) => {
        const li = e.target.closest('li.jump');
        if (!li) return;
        if (li.dataset.line) return this.ce.gotoLine(+li.dataset.line, +li.dataset.col);
        const path = JSON.parse(li.dataset.mod);
        if (path.length === 2 && !(this.cart[path[0]] || {})[path[1]]) return toast(`"${path[1]}" doesn't exist yet.`);
        if (!this.openModule(path)) return;
        if (li.dataset.find) this.ce.find(li.dataset.find);
      };

      // module picker
      $('#codeModBtn').onclick = () => ($('#codeModPanel').hidden ? this.openModPanel() : this.closeModPanel());
      $('#codeModPanel').onclick = (e) => {
        const nb = e.target.closest('[data-new]');
        if (nb) return this.newModule(nb.dataset.new);
        const b = e.target.closest('[data-mod]');
        if (b) this.openModule(JSON.parse(b.dataset.mod));
      };
      $('#codeModRename').onclick = () => this.renameModule();
      $('#codeModDelete').onclick = () => this.deleteModule();
    },
    openModPanel() {
      const c = this.cart;
      const row = (path, label, sub) => `<button class="modrow${JSON.stringify(path) === JSON.stringify(this.modPath) ? ' on' : ''}" data-mod='${esc(JSON.stringify(path))}'><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
      const count = (o) => (Array.isArray(o) ? o.length : o ? Object.keys(o).length : 0);
      let h = '<div class="modgroup">' + row([], 'Whole cart', 'everything in one file') + '</div>';
      h += '<div class="modgroup"><h4>Settings</h4><div class="modgrid">' +
        row(['meta'], 'Settings', 'title, size, start') + row(['vars'], 'Variables', count(c.vars) + ' vars') +
        row(['hud'], 'HUD', count(c.hud) + ' items') + row(['rules'], 'Global rules', count(c.rules) + ' rules') +
        row(['tiles'], 'Tiles', count(c.tiles) + ' tiles') + row(['sounds'], 'Sounds', count(c.sounds) + ' sounds') +
        (c.palette ? row(['palette'], 'Palette', count(c.palette) + ' colours') : '') + '</div></div>';
      for (const [key, label] of [['scenes', 'Scenes'], ['prefabs', 'Prefabs'], ['behaviors', 'Behaviors'], ['sprites', 'Sprites'], ['music', 'Music']]) {
        const names = Object.keys(c[key] || {});
        h += `<div class="modgroup"><h4>${label} <span class="n">${names.length}</span><button class="addmod" data-new="${key}">+ New</button></h4><div class="modgrid">` +
          names.map((n) => row([key, n], n)).join('') + '</div></div>';
      }
      $('#codeModPanel').innerHTML = h;
      $('#codeModPanel').hidden = false;
      $('#codeModBtn').setAttribute('aria-expanded', 'true');
    },
    closeModPanel() { $('#codeModPanel').hidden = true; $('#codeModBtn').setAttribute('aria-expanded', 'false'); },
    newModule(group) {
      if (!this.syncCode()) return toast('Fix the JSON error in this module first.');
      const single = { scenes: 'scene', prefabs: 'prefab', behaviors: 'behavior', sprites: 'sprite', music: 'track' }[group];
      const g = (this.cart[group] = this.cart[group] || {});
      const name = (prompt(`Name for the new ${single}:`, single + (Object.keys(g).length + 1)) || '').trim().replace(/[^\w-]/g, '_');
      if (!name) return;
      if (g[name]) return toast(`A ${single} called "${name}" already exists.`);
      const firstSprite = Object.keys(this.cart.sprites || {})[0];
      g[name] = {
        scenes: { tileSize: 16, gravity: 0, bg: 1, map: Array.from({ length: 14 }, () => '.'.repeat(16)), legend: {}, rules: [] },
        prefabs: { tags: [], sprite: firstSprite ? { name: firstSprite } : { color: 8, w: 16, h: 16 }, body: {} },
        sprites: { w: 8, h: 8, scale: 2, frames: [Array.from({ length: 8 }, () => '........')] },
        music: { bpm: 120, div: 2, tracks: [{ wave: 'square', v: 0.07, notes: 'C5 - E5 G5 E5 - C5 .' }] },
        behaviors: { params: { speed: 30 }, tags: [], ai: { type: 'patrol', speed: '=self.speed' }, rules: [] },
      }[group];
      this.touch();
      this.modPath = [group, name];
      this.writeCode();
      this.closeModPanel();
    },
    renameModule() {
      const [group, old] = this.modPath;
      if (!this.syncCode()) return toast('Fix the JSON error first.');
      const nu = (prompt(`Rename "${old}" to:`, old) || '').trim().replace(/[^\w-]/g, '_');
      if (!nu || nu === old) return;
      if (this.cart[group][nu]) return toast(`"${nu}" already exists.`);
      this.cart[group] = Object.fromEntries(Object.entries(this.cart[group]).map(([k, v]) => [k === old ? nu : k, v]));
      const n = this.renameRefs(group, old, nu);
      this.modPath = [group, nu];
      this.touch(); this.writeCode();
      toast(n ? `Renamed, and updated ${n} reference${n > 1 ? 's' : ''}.` : 'Renamed.');
    },
    renameRefs(group, old, nu) {
      let n = 0;
      const PF = ['prefab', 'spawn', 'drop', 'a', 'b', 'tag', 'count', 'destroy', 'kill', 'damage', 'heal', 'velocity', 'move', 'burst', 'at', 'target', 'follow', 'extends'];
      const hit = (k, v, parent) => {
        if (v !== old) return false;
        if (group === 'sprites') return k === 'sprite' || k === 'icons' || (k === 'name' && parent === 'sprite');
        if (group === 'prefabs') return PF.includes(k) || parent === 'legend' || parent === 'coop' || parent === 'targets';
        if (group === 'scenes') return k === 'scene' || (k === 'start' && parent === 'meta');
        if (group === 'music') return k === 'music';
        if (group === 'behaviors') return parent === 'use';
        return false;
      };
      const walk = (o, parent) => {
        if (Array.isArray(o)) { o.forEach((x, i) => { if (typeof x === 'string') { if (hit(null, x, parent)) { o[i] = nu; n++; } } else walk(x, parent); }); return; }
        if (!o || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === 'string') { if (hit(k, v, parent)) { o[k] = nu; n++; } } else walk(v, k);
        }
      };
      walk(this.cart, '');
      if (group === 'behaviors') {
        // a behavior can also be referenced as {"name": {params...}} inside a "use" list —
        // the generic walk above only renames plain string entries, so fix the object-key form here
        const fixUse = (list) => { if (Array.isArray(list)) list.forEach((u) => { if (u && typeof u === 'object' && !Array.isArray(u) && old in u) { u[nu] = u[old]; delete u[old]; n++; } }); };
        for (const p of Object.values(this.cart.prefabs || {})) fixUse(p.use);
        for (const b of Object.values(this.cart.behaviors || {})) fixUse(b.use);
      }
      return n;
    },
    deleteModule() {
      const [group, name] = this.modPath;
      if (!confirm(`Delete "${name}" from ${group}? Anything that uses it will stop working until you fix it.`)) return;
      delete this.cart[group][name];
      this.codeDirty = false;
      this.modPath = [];
      this.touch(); this.writeCode();
      toast(`Deleted "${name}".`);
    },

    /* ------------ sprite editor ------------ */
    initSprite() {
      this.sp = { name: null, frame: 0, tool: 'pen', color: 21, undo: [] };
      const pal = $('#spPalette');
      pal.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; this.sp.color = b.dataset.c === '.' ? '.' : +b.dataset.c; this.spPalette(); };
      $('#spSelect').onchange = () => { this.sp.name = $('#spSelect').value; this.sp.frame = 0; this.sp.undo = []; this.spDraw(); };
      $$('#tab-sprite [data-tool]').forEach((b) => (b.onclick = () => { this.sp.tool = b.dataset.tool; $$('#tab-sprite [data-tool]').forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#spPrev').onclick = () => { const d = this.spDef(); if (d && d.frames) { this.sp.frame = (this.sp.frame - 1 + d.frames.length) % d.frames.length; this.spDraw(); } };
      $('#spNext').onclick = () => { const d = this.spDef(); if (d && d.frames) { this.sp.frame = (this.sp.frame + 1) % d.frames.length; this.spDraw(); } };
      $('#spAddF').onclick = () => { const d = this.spDef(); if (!d || !d.frames) return; d.frames.splice(this.sp.frame + 1, 0, Array.from({ length: d.h }, () => '.'.repeat(d.w))); this.sp.frame++; this.touch(); this.spDraw(); };
      $('#spDupF').onclick = () => { const d = this.spDef(); if (!d || !d.frames) return; d.frames.splice(this.sp.frame + 1, 0, d.frames[this.sp.frame].slice()); this.sp.frame++; this.touch(); this.spDraw(); };
      $('#spDelF').onclick = () => { const d = this.spDef(); if (!d || !d.frames || d.frames.length < 2) return toast('A sprite needs at least one frame.'); d.frames.splice(this.sp.frame, 1); this.sp.frame = Math.max(0, this.sp.frame - 1); this.touch(); this.spDraw(); };
      $('#spUndo').onclick = () => { const d = this.spDef(); const u = this.sp.undo.pop(); if (d && u) { d.frames[u.f] = u.rows; this.touch(); this.spDraw(); } };
      $('#spScale').onchange = () => { const d = this.spDef(); if (!d) return; const v = +$('#spScale').value; if (v === 1) delete d.scale; else d.scale = v; this.touch(); this.spDraw(); };
      $('#spNew').onclick = () => {
        const name = (prompt('Name for the new sprite (letters, numbers, _):', 'sprite' + (Object.keys(this.cart.sprites).length + 1)) || '').trim().replace(/[^\w-]/g, '_');
        if (!name) return;
        if (this.cart.sprites[name]) return toast(`A sprite called "${name}" already exists.`);
        const sz = (prompt('Size in pixels, e.g. 8, 16 or 16x24:', '8') || '8').toLowerCase().split('x').map((n) => Math.max(1, Math.min(64, parseInt(n, 10) || 8)));
        const w = sz[0], h = sz[1] || sz[0];
        this.cart.sprites[name] = { w, h, scale: w <= 8 ? 2 : undefined, frames: [Array.from({ length: h }, () => '.'.repeat(w))] };
        if (w > 8) delete this.cart.sprites[name].scale;
        this.sp.name = name; this.sp.frame = 0; this.touch(); this.spRefresh();
      };
      $('#spDel').onclick = () => {
        if (!this.sp.name || !confirm(`Delete sprite "${this.sp.name}"? Prefabs and tiles using it will show a shape instead.`)) return;
        delete this.cart.sprites[this.sp.name]; this.sp.name = null; this.touch(); this.spRefresh();
      };
      $('#spImport').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        const url = await readURL(f);
        const img = await loadImg(url).catch(() => null);
        if (!img) return toast('That image could not be read.');
        let name = f.name.replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_') || 'image';
        while (this.cart.sprites[name]) name += '_';
        const pal = this.cart.palette && this.cart.palette.length ? this.cart.palette.map((c) => DC.color(c)) : DC.PALETTE;
        if (img.width <= 256 && img.height <= 128) {
          const fh = img.height, fw = img.width % fh === 0 ? fh : img.width;
          const frames = DC.imageToRows(img, pal, fw, fh);
          this.cart.sprites[name] = { w: fw, h: fh, frames };
          toast(`Imported "${name}" as ${frames.length} frame${frames.length > 1 ? 's' : ''} of ${fw}×${fh}, matched to the palette.`);
        } else {
          this.cart.sprites[name] = { src: url, w: img.height, h: img.height };
          toast(`"${name}" is large, so it is stored as an embedded image and can't be pixel-edited.`, 4200);
        }
        this.sp.name = name; this.sp.frame = 0; this.touch(); this.spRefresh();
      };
      $('#spConvert').onclick = async () => {
        const d = this.spDef();
        if (!d || !d.src) return;
        const base = this.cart.meta.assets || 'assets/';
        const img = await loadImg(/^(data:|https?:|\/)/.test(d.src) ? d.src : base + d.src).catch(() => null);
        if (!img) return toast('Could not load ' + d.src);
        const fw = +d.w || img.height, fh = +d.h || img.height;
        if (fw > 64 || fh > 64) return toast('Frames larger than 64px stay as images.');
        const pal = this.cart.palette && this.cart.palette.length ? this.cart.palette.map((c) => DC.color(c)) : DC.PALETTE;
        d.frames = DC.imageToRows(img, pal, fw, fh); d.w = fw; d.h = fh; delete d.src;
        this.touch(); this.spDraw();
      };

      const cv = $('#spCanvas');
      let painting = false;
      const cell = (e) => {
        const r = cv.getBoundingClientRect(), d = this.spDef();
        return [Math.floor(((e.clientX - r.left) / r.width) * d.w), Math.floor(((e.clientY - r.top) / r.height) * d.h)];
      };
      cv.addEventListener('pointerdown', (e) => {
        const d = this.spDef();
        if (!d || !d.frames) return;
        e.preventDefault(); cv.setPointerCapture(e.pointerId);
        this.sp.undo.push({ f: this.sp.frame, rows: d.frames[this.sp.frame].slice() });
        if (this.sp.undo.length > 50) this.sp.undo.shift();
        painting = true; this.spPaint(...cell(e), true);
      });
      cv.addEventListener('pointermove', (e) => { if (painting) this.spPaint(...cell(e), false); });
      ['pointerup', 'pointercancel'].forEach((t) => cv.addEventListener(t, () => { if (painting) { painting = false; this.touch(); } }));

      setInterval(() => { if (this.tab === 'sprite') this.spPreview(); }, 160);
    },
    spDef() { return this.sp.name && this.cart.sprites[this.sp.name]; },
    spPal() { const p = this.cart && this.cart.palette; return Array.isArray(p) && p.length ? p.map((c) => DC.color(c)) : DC.PALETTE; },
    spRefresh() {
      const names = Object.keys(this.cart.sprites);
      if (!this.sp.name || !this.cart.sprites[this.sp.name]) this.sp.name = names[0] || null;
      $('#spSelect').innerHTML = names.map((n) => `<option ${n === this.sp.name ? 'selected' : ''}>${esc(n)}</option>`).join('') || '<option>No sprites yet</option>';
      this.spPalette(); this.spDraw();
    },
    spPalette() {
      const pal = this.spPal().slice(0, 32);
      $('#spPalette').innerHTML = `<button data-c="." class="sw clear ${this.sp.color === '.' ? 'on' : ''}" aria-label="Transparent"></button>` +
        pal.map((c, i) => `<button data-c="${i}" class="sw ${this.sp.color === i ? 'on' : ''}" style="background:${c}" aria-label="Colour ${i} (${DC.PIXCHARS[i]})"></button>`).join('');
    },
    spPaint(x, y, first) {
      const d = this.spDef(); if (!d || !d.frames) return;
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
      const rows = d.frames[this.sp.frame];
      const ch = this.sp.tool === 'erase' ? '.' : this.sp.color === '.' ? '.' : DC.PIXCHARS[this.sp.color];
      const set = (px, py, c) => { rows[py] = rows[py].slice(0, px) + c + rows[py].slice(px + 1); };
      if (this.sp.tool === 'pick') {
        const k = DC.PIXCHARS.indexOf((rows[y][x] || '.').toLowerCase());
        this.sp.color = k < 0 ? '.' : k; this.spPalette(); return;
      }
      if (this.sp.tool === 'fill') {
        if (!first) return;
        const from = rows[y][x];
        if (from === ch) return;
        const st = [[x, y]];
        while (st.length) {
          const [px, py] = st.pop();
          if (px < 0 || py < 0 || px >= d.w || py >= d.h || rows[py][px] !== from) continue;
          set(px, py, ch); st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
      } else set(x, y, ch);
      this.spDraw();
    },
    spDraw() {
      const d = this.spDef(), cv = $('#spCanvas'), g = cv.getContext('2d');
      const info = $('#spInfo'), conv = $('#spConvert');
      conv.hidden = true;
      if (!d) { cv.width = cv.height = 1; info.textContent = 'Make a sprite with New, or import an image.'; $('#spFrameLabel').textContent = '–'; return; }
      $('#spScale').value = String(d.scale || 1);
      if (!d.frames) {
        cv.width = cv.height = 1;
        info.textContent = `Loaded from an image file (${String(d.src).slice(0, 40)}). Convert it to pixels to edit here.`;
        conv.hidden = false; $('#spFrameLabel').textContent = '–'; return;
      }
      if (d.stack) {
        cv.width = cv.height = 1;
        info.textContent = 'This is a sprite stack (a set of layers drawn as a 3D totem) — edit its layers in the Code tab. Each "frame" here is a list of pixel-art layers, bottom to top.';
        $('#spFrameLabel').textContent = `${this.sp.frame + 1} / ${d.frames.length}`;
        return;
      }
      if (this.sp.frame >= d.frames.length) this.sp.frame = 0;
      const wrap = $('#spCanvasWrap');
      const avail = Math.min(wrap.clientWidth || 300, 420) - 4;
      const c = Math.max(4, Math.floor(avail / Math.max(d.w, d.h)));
      cv.width = d.w * c; cv.height = d.h * c;
      const pal = this.spPal(), rows = d.frames[this.sp.frame];
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const k = DC.PIXCHARS.indexOf((rows[y][x] || '.').toLowerCase());
        if (k < 0) { g.fillStyle = (x + y) % 2 ? '#d3cfdd' : '#e8e5ef'; } else g.fillStyle = pal[k] || '#f0f';
        g.fillRect(x * c, y * c, c, c);
      }
      if (c >= 8) {
        g.strokeStyle = 'rgba(40,30,70,0.18)'; g.lineWidth = 1; g.beginPath();
        for (let i = 0; i <= d.w; i++) { g.moveTo(i * c + 0.5, 0); g.lineTo(i * c + 0.5, cv.height); }
        for (let i = 0; i <= d.h; i++) { g.moveTo(0, i * c + 0.5); g.lineTo(cv.width, i * c + 0.5); }
        g.stroke();
      }
      $('#spFrameLabel').textContent = `${this.sp.frame + 1} / ${d.frames.length}`;
      info.textContent = `${d.w}×${d.h} pixels, drawn at ${d.w * (d.scale || 1)}×${d.h * (d.scale || 1)} in game.`;
    },
    spPreview() {
      const d = this.spDef(), cv = $('#spPreview'), g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      if (!d || !d.frames || d.stack) return;
      this.sp.pf = ((this.sp.pf || 0) + 1) % d.frames.length;
      const rows = d.frames[this.sp.pf], pal = this.spPal();
      const c = Math.max(1, Math.floor(64 / Math.max(d.w, d.h)));
      const ox = (64 - d.w * c) / 2, oy = (64 - d.h * c) / 2;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        const k = DC.PIXCHARS.indexOf((rows[y][x] || '.').toLowerCase());
        if (k < 0) continue;
        g.fillStyle = pal[k]; g.fillRect(ox + x * c, oy + y * c, c, c);
      }
    },

    /* ------------ map editor ------------ */
    initMap() {
      this.mp = { scene: null, brush: '.', zoom: 1, mode: 'paint' };
      $('#mapScene').onchange = () => { this.mp.scene = $('#mapScene').value; this.mapRefresh(); };
      $('#mapPaint').onclick = () => this.mapMode('paint');
      $('#mapPan').onclick = () => this.mapMode('pan');
      $('#mapZoomIn').onclick = () => { this.mp.zoom = Math.min(4, this.mp.zoom * 1.5); this.mapDraw(); };
      $('#mapZoomOut').onclick = () => { this.mp.zoom = Math.max(0.35, this.mp.zoom / 1.5); this.mapDraw(); };
      $('#mapBrushes').onclick = (e) => {
        const b = e.target.closest('[data-ch]'); if (!b) return;
        if (b.dataset.ch === this.mp.brush && b.dataset.ch !== '.') return this.openBrush(b.dataset.ch);
        this.mp.brush = b.dataset.ch; this.mapBrushes();
      };
      $('#mapNewScene').onclick = () => {
        const name = (prompt('Name for the new scene:', 'level' + (Object.keys(this.cart.scenes).length + 1)) || '').trim().replace(/[^\w-]/g, '_');
        if (!name) return;
        if (this.cart.scenes[name]) return toast(`A scene called "${name}" already exists.`);
        const side = confirm('Side view with gravity (platformer)?\nOK = side view, Cancel = top-down.');
        this.cart.scenes[name] = { tileSize: 16, gravity: side ? 700 : 0, bg: side ? 18 : 10, map: Array.from({ length: 14 }, () => '.'.repeat(24)), legend: {} };
        this.mp.scene = name; this.touch(); this.mapRefresh();
      };
      $('#mapResize').onclick = () => {
        const s = this.mapScene(); if (!s) return;
        const w = Math.max(1, Math.min(512, parseInt($('#mapW').value, 10) || 16));
        const h = Math.max(1, Math.min(512, parseInt($('#mapH').value, 10) || 14));
        const rows = s.map.slice(0, h).map((r) => (r + '.'.repeat(w)).slice(0, w));
        while (rows.length < h) rows.push('.'.repeat(w));
        s.map = rows; this.touch(); this.mapDraw();
      };
      $('#mapAddChar').onclick = () => this.openBrush(null);
      $('#mapEditChar').onclick = () => {
        if (this.mp.brush === '.') return toast('Pick a brush first, or tap a selected brush to edit it.');
        this.openBrush(this.mp.brush);
      };
      this.initBrushDialog();
      const cv = $('#mapCanvas');
      let painting = false;
      const paint = (e) => {
        const s = this.mapScene(); if (!s) return;
        const r = cv.getBoundingClientRect(), ts = +s.tileSize || 16, c = ts * this.mp.zoom;
        const x = Math.floor((e.clientX - r.left) / c), y = Math.floor((e.clientY - r.top) / c);
        if (y < 0 || y >= s.map.length || x < 0 || x >= s.map[y].length) return;
        if (s.map[y][x] === this.mp.brush) return;
        s.map[y] = s.map[y].slice(0, x) + this.mp.brush + s.map[y].slice(x + 1);
        this.mapDraw();
      };
      cv.addEventListener('pointerdown', (e) => { if (this.mp.mode !== 'paint') return; e.preventDefault(); cv.setPointerCapture(e.pointerId); painting = true; paint(e); });
      cv.addEventListener('pointermove', (e) => { if (painting) paint(e); });
      ['pointerup', 'pointercancel'].forEach((t) => cv.addEventListener(t, () => { if (painting) { painting = false; this.touch(); } }));
    },
    mapMode(m) {
      this.mp.mode = m;
      $('#mapPaint').classList.toggle('on', m === 'paint');
      $('#mapPan').classList.toggle('on', m === 'pan');
      $('#mapWrap').classList.toggle('panning', m === 'pan');
    },
    mapScene() { return this.mp.scene && this.cart.scenes[this.mp.scene]; },
    async mapRefresh() {
      const names = Object.keys(this.cart.scenes);
      if (!this.mp.scene || !this.cart.scenes[this.mp.scene]) this.mp.scene = names.find((n) => (this.cart.scenes[n].map || []).length) || names[0];
      $('#mapScene').innerHTML = names.map((n) => `<option ${n === this.mp.scene ? 'selected' : ''}>${esc(n)}</option>`).join('');
      this.frames = await DC.buildFrames(this.cart, this.spPal(), this.cart.meta.assets || 'assets/');
      const s = this.mapScene();
      if (s) { $('#mapW').value = s.map[0] ? s.map[0].length : 0; $('#mapH').value = s.map.length; }
      if (this.mp.zoom === 1 && s) { const ts = +s.tileSize || 16; this.mp.zoom = ts <= 8 ? 3 : ts <= 16 ? 1.5 : 1; }
      this.mapBrushes(); this.mapDraw();
    },
    thumbArt(sprite, color, size) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      const fr = sprite && this.frames[sprite] && this.frames[sprite][0];
      if (fr && fr.stack) {
        const k = Math.min(size / fr.dw, size / fr.dh);
        const dw = fr.dw * k, dh = fr.dh * k;
        this.engine.drawStack(g, fr, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh, false);
      } else if (fr) {
        const k = Math.min(size / fr.w, size / fr.h);
        g.drawImage(fr.src, fr.sx, fr.sy, fr.w, fr.h, Math.round((size - fr.w * k) / 2), Math.round((size - fr.h * k) / 2), fr.w * k, fr.h * k);
      } else if (color != null) { g.fillStyle = DC.color(color, this.spPal()); g.fillRect(size * 0.15, size * 0.15, size * 0.7, size * 0.7); }
      else { g.fillStyle = '#d77bba'; g.font = `${size * 0.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', size / 2, size / 2); }
      return c;
    },
    prefabArt(name) {
      const raw = this.cart.prefabs[name];
      const pf = raw && (raw.extends || raw.use) ? DC.resolvePrefab(this.cart, name, {}) || raw : raw;
      const sp = pf && pf.sprite;
      if (!sp) return [null, pf && pf.text ? 21 : 29];
      if (typeof sp === 'string') return [sp, null];
      return [sp.name || null, sp.name ? null : sp.color ?? 8];
    },
    thumb(ch, s, size) {
      const legend = (s && s.legend) || {};
      if (legend[ch]) return this.thumbArt(...this.prefabArt(typeof legend[ch] === 'string' ? legend[ch] : legend[ch].prefab), size);
      const t = this.cart.tiles[ch];
      return this.thumbArt(t && t.sprite, t && t.color, size);
    },
    mapBrushes() {
      const s = this.mapScene();
      const el = $('#mapBrushes');
      el.innerHTML = '';
      if (!s) return;
      const legend = s.legend || {};
      const chars = ['.', ...Object.keys(this.cart.tiles), ...Object.keys(legend).filter((c) => !this.cart.tiles[c])];
      for (const ch of chars) {
        const b = document.createElement('button');
        b.dataset.ch = ch; b.className = 'brush' + (ch === this.mp.brush ? ' on' : '') + (legend[ch] ? ' ent' : '');
        const label = ch === '.' ? 'Empty' : legend[ch] ? (typeof legend[ch] === 'string' ? legend[ch] : legend[ch].prefab) : (this.cart.tiles[ch].sprite || 'tile');
        b.title = label;
        if (ch !== '.') b.appendChild(this.thumb(ch, s, 28));
        const sp = document.createElement('span'); sp.textContent = ch === '.' ? 'erase' : ch; b.appendChild(sp);
        el.appendChild(b);
      }
    },
    /* ------------ brush dialog ------------ */
    initBrushDialog() {
      const d = $('#brushDlg');
      this.bd = { ch: null, type: 'tile', pick: null, edit: null };
      $('#bdType').onclick = (e) => {
        const b = e.target.closest('[data-bt]'); if (!b) return;
        this.bd.type = b.dataset.bt; this.bd.pick = null; this.bdRender();
      };
      $('#bdSearch').oninput = () => this.bdRender();
      $('#bdChar').oninput = () => this.bdHelp();
      $('#bdGrid').onclick = (e) => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        this.bd.pick = b.dataset.pick;
        $$('#bdGrid .bd-item').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
        this.bdHelp();
      };
      $('#bdGrid').ondblclick = (e) => { if (e.target.closest('[data-pick]')) this.bdSave(); };
      $('#bdCancel').onclick = () => d.close();
      $('#bdSave').onclick = () => this.bdSave();
      $('#bdRemove').onclick = () => this.bdRemove();
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      ['bdHurt', 'bdKill', 'bdSolid', 'bdOneWay'].forEach((id) => ($('#' + id).onchange = () => {
        if (id === 'bdSolid' && $('#bdSolid').checked) $('#bdOneWay').checked = false;
        if (id === 'bdOneWay' && $('#bdOneWay').checked) $('#bdSolid').checked = false;
      }));
    },
    freeChar(s) {
      const used = new Set(['.', ' ', ...Object.keys(this.cart.tiles), ...Object.keys((s && s.legend) || {})]);
      for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#@$%&*+=-~^?!<>/|') if (!used.has(c)) return c;
      return '';
    },
    async openBrush(editCh) {
      const s = this.mapScene();
      if (!s) return toast('Pick a scene first.');
      if (!Object.keys(this.frames).length) this.frames = await DC.buildFrames(this.cart, this.spPal(), this.cart.meta.assets || 'assets/');
      const legend = s.legend || {};
      const bd = this.bd;
      bd.edit = editCh;
      if (editCh && legend[editCh]) { bd.type = 'ent'; bd.pick = typeof legend[editCh] === 'string' ? legend[editCh] : legend[editCh].prefab; }
      else if (editCh && this.cart.tiles[editCh]) { bd.type = 'tile'; bd.pick = this.cart.tiles[editCh].sprite || null; }
      else { bd.type = 'tile'; bd.pick = null; }
      const t = (editCh && this.cart.tiles[editCh]) || {};
      $('#bdSolid').checked = editCh ? !!t.solid : true;
      $('#bdOneWay').checked = !!t.oneWay;
      $('#bdHurt').checked = !!t.hurt;
      $('#bdKill').checked = !!t.kill;
      $('#bdFront').checked = (+t.layer || 0) >= 1;
      $('#bdBreak').checked = !!t.break;
      $('#bdChar').value = editCh || this.freeChar(s);
      $('#bdChar').readOnly = !!editCh;
      $('#bdTitle').textContent = editCh ? `Edit brush "${editCh}"` : 'New brush';
      $('#bdSave').textContent = editCh ? 'Save brush' : 'Add brush';
      $('#bdRemove').hidden = !editCh;
      $('#bdSearch').value = '';
      this.bdRender();
      $('#brushDlg').showModal();
      if (bd.pick) { const on = $('#bdGrid .bd-item.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    },
    bdRender() {
      const bd = this.bd, q = $('#bdSearch').value.trim().toLowerCase();
      $$('#bdType [data-bt]').forEach((b) => b.classList.toggle('on', b.dataset.bt === bd.type));
      $('#bdProps').hidden = bd.type !== 'tile';
      const grid = $('#bdGrid');
      grid.innerHTML = '';
      const names = Object.keys(bd.type === 'tile' ? this.cart.sprites : this.cart.prefabs).filter((n) => !q || n.toLowerCase().includes(q));
      if (!names.length) {
        grid.innerHTML = `<p class="hint">${q ? 'Nothing matches.' : bd.type === 'tile' ? 'No sprites yet — draw one in the Sprites tab.' : 'No prefabs yet — add one in the Code tab.'}</p>`;
      }
      for (const n of names) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'bd-item' + (n === bd.pick ? ' on' : '');
        b.dataset.pick = n; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(n === bd.pick));
        b.appendChild(bd.type === 'tile' ? this.thumbArt(n, null, 44) : this.thumbArt(...this.prefabArt(n), 44));
        const l = document.createElement('span'); l.textContent = n; b.appendChild(l);
        if (bd.type === 'ent') {
          const pf = this.cart.prefabs[n];
          const tags = (pf.tags || []).filter((x) => x !== n).slice(0, 2).join(', ');
          if (tags) { const t = document.createElement('small'); t.textContent = tags; b.appendChild(t); }
        }
        grid.appendChild(b);
      }
      this.bdHelp();
    },
    bdHelp() {
      const bd = this.bd, s = this.mapScene(), ch = $('#bdChar').value;
      const legend = (s && s.legend) || {};
      let msg = bd.type === 'tile'
        ? 'Tiles are shared by every scene in the cart.'
        : `Entity brushes belong to this scene ("${this.mp.scene}") and spawn the prefab standing on that square.`;
      if (!bd.edit && ch) {
        if (ch === '.' || ch === ' ') msg = '"." and spaces are always empty. Choose another key.';
        else if (this.cart.tiles[ch] && bd.type === 'tile') msg = `"${ch}" is already a tile — adding will replace it everywhere.`;
        else if (legend[ch]) msg = `"${ch}" already spawns ${typeof legend[ch] === 'string' ? legend[ch] : legend[ch].prefab} here — adding will replace it.`;
        else if (this.cart.tiles[ch]) msg = `"${ch}" is a tile in other scenes; in this scene it will spawn the entity instead.`;
      }
      $('#bdHelp').textContent = msg;
      $('#bdSave').disabled = !bd.pick || !ch || ch === '.' || ch === ' ';
    },
    bdSave() {
      const bd = this.bd, s = this.mapScene(), ch = $('#bdChar').value;
      if (!bd.pick || !ch || ch === '.' || ch === ' ') return;
      s.legend = s.legend || {};
      if (bd.type === 'tile') {
        const t = Object.assign({}, this.cart.tiles[ch] || {}, { sprite: bd.pick });
        delete t.color;
        const flag = (k, on, v) => { if (on) t[k] = t[k] || v; else delete t[k]; };
        flag('solid', $('#bdSolid').checked, true);
        flag('oneWay', $('#bdOneWay').checked, true);
        flag('hurt', $('#bdHurt').checked, 1);
        flag('kill', $('#bdKill').checked, true);
        flag('layer', $('#bdFront').checked, 1);
        flag('break', $('#bdBreak').checked, true);
        this.cart.tiles[ch] = t;
        if (s.legend[ch]) delete s.legend[ch];
      } else {
        s.legend[ch] = bd.pick;
      }
      this.mp.brush = ch;
      $('#brushDlg').close();
      this.touch(); this.codeDirty || this.writeCode();
      this.mapBrushes(); this.mapDraw();
      toast(bd.edit ? `Brush "${ch}" updated.` : `Brush "${ch}" added — paint away.`);
    },
    bdRemove() {
      const ch = this.bd.edit, s = this.mapScene();
      if (!ch) return;
      const isEnt = s.legend && s.legend[ch];
      const scenes = isEnt ? [s] : Object.values(this.cart.scenes).filter((x) => !(x.legend && x.legend[ch]));
      const uses = scenes.reduce((n, x) => n + (x.map || []).reduce((m, r) => m + r.split(ch).length - 1, 0), 0);
      if (!confirm(`Remove brush "${ch}"?${uses ? ` It's painted on ${uses} square${uses > 1 ? 's' : ''}; those will be erased.` : ''}`)) return;
      if (isEnt) delete s.legend[ch]; else delete this.cart.tiles[ch];
      if (uses) for (const x of scenes) x.map = (x.map || []).map((r) => r.split(ch).join('.'));
      this.mp.brush = '.';
      $('#brushDlg').close();
      this.touch(); this.codeDirty || this.writeCode();
      this.mapBrushes(); this.mapDraw();
    },
    mapDraw() {
      const s = this.mapScene(), cv = $('#mapCanvas'), g = cv.getContext('2d');
      if (!s || !s.map.length) { cv.width = cv.height = 1; return; }
      const ts = +s.tileSize || 16, z = this.mp.zoom, c = ts * z;
      const w = Math.max(...s.map.map((r) => r.length)), h = s.map.length;
      cv.width = Math.ceil(w * c); cv.height = Math.ceil(h * c);
      g.imageSmoothingEnabled = false;
      const pal = this.spPal();
      g.fillStyle = DC.color(s.bg ?? 1, pal); g.fillRect(0, 0, cv.width, cv.height);
      const legend = s.legend || {};
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ch = s.map[y][x];
        if (!ch || ch === '.') continue;
        const t = this.cart.tiles[ch];
        let fr = null, col = null, isEnt = false;
        if (legend[ch]) {
          isEnt = true;
          const [sn, col2] = this.prefabArt(typeof legend[ch] === 'string' ? legend[ch] : legend[ch].prefab);
          fr = sn && this.frames[sn] && this.frames[sn][0];
          if (!fr) col = col2 != null ? col2 : 8;
        } else if (t) { fr = t.sprite && this.frames[t.sprite] && this.frames[t.sprite][0]; if (!fr) col = t.color ?? 29; }
        else col = 28;
        if (fr && fr.stack) {
          if (isEnt) { const dw = fr.dw * z, dh = fr.dh * z; this.engine.drawStack(g, fr, x * c + (c - dw) / 2, y * c + c - dh, dw, dh, false); }
          else this.engine.drawStack(g, fr, x * c, y * c, c, c, false);
        } else if (fr) {
          if (isEnt) { const dw = fr.dw * z, dh = fr.dh * z; g.drawImage(fr.src, fr.sx, fr.sy, fr.w, fr.h, x * c + (c - dw) / 2, y * c + c - dh, dw, dh); }
          else g.drawImage(fr.src, fr.sx, fr.sy, fr.w, fr.h, x * c, y * c, c, c);
        } else { g.fillStyle = DC.color(col, pal); g.fillRect(x * c + 1, y * c + 1, c - 2, c - 2); }
        if (isEnt) { g.strokeStyle = '#fbf236'; g.lineWidth = 1; g.strokeRect(x * c + 0.5, y * c + 0.5, c - 1, c - 1); }
      }
      if (c >= 10) {
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.beginPath();
        for (let i = 0; i <= w; i++) { g.moveTo(Math.round(i * c) + 0.5, 0); g.lineTo(Math.round(i * c) + 0.5, cv.height); }
        for (let i = 0; i <= h; i++) { g.moveTo(0, Math.round(i * c) + 0.5); g.lineTo(cv.width, Math.round(i * c) + 0.5); }
        g.stroke();
      }
    },

    /* ------------ controls & feel ------------ */
    wantsMotion() { return !!(this.cart && this.cart.meta.motion) && DC.Motion.available && !DC.Motion.on; },
    initControls() {
      const H = DC.Haptics, M = DC.Motion;
      $('#ctlBtn').onclick = () => this.openControls();
      $('#ctlDlg').addEventListener('click', (e) => { if (e.target === $('#ctlDlg')) $('#ctlDlg').close(); });
      $('#ctlDlg').addEventListener('close', () => clearInterval(this.ctlTimer));
      $('#ctlHaptics').onchange = () => { H.on = $('#ctlHaptics').checked; H.save(); };
      $('#ctlTicks').onchange = () => { H.buttons = $('#ctlTicks').checked; H.save(); };
      $('#ctlStrength').onchange = () => { H.strength = +$('#ctlStrength').value; H.save(); H.play('medium', { force: true }); };
      $('#ctlTest').onclick = () => { const was = H.on; H.on = true; H.play('success', { force: true }); H.on = was; };
      $('#ctlMotion').onchange = async () => {
        if ($('#ctlMotion').checked) {
          try { await M.enable(); M.calibrate(); } catch (e) { $('#ctlMotion').checked = false; toast(e.message, 4500); }
        } else { M.steer = false; M.disable(); $('#ctlSteer').checked = false; }
        this.ctlSync();
      };
      $('#ctlSteer').onchange = async () => {
        if ($('#ctlSteer').checked && !M.on) {
          try { await M.enable(); M.calibrate(); } catch (e) { $('#ctlSteer').checked = false; toast(e.message, 4500); this.ctlSync(); return; }
        }
        M.steer = $('#ctlSteer').checked; M.save(); this.ctlSync();
      };
      $('#ctlCalibrate').onclick = () => { M.calibrate(); toast('Level set.'); };
      $('#ctlRange').onchange = () => { M.range = +$('#ctlRange').value; M.save(); };
    },
    openControls() {
      const H = DC.Haptics;
      $('#ctlHaptics').checked = H.on; $('#ctlTicks').checked = H.buttons;
      $('#ctlStrength').value = String(H.strength);
      $('#ctlStrengthRow').hidden = !H.canVibrate;
      $('#ctlHapticNote').textContent = H.canVibrate ? 'Full vibration on this device. Controllers rumble where the browser allows it.'
        : H.label ? 'iPhone: taps use Safari’s built-in haptic (iOS 18 or newer). Gameplay buzzes are best-effort — iOS only allows them while you’re touching the screen.'
        : 'This browser doesn’t allow vibration. Controllers still rumble where supported.';
      this.ctlSync();
      clearInterval(this.ctlTimer);
      this.ctlTimer = setInterval(() => {
        const M = DC.Motion, dot = $('#ctlDot');
        dot.style.transform = `translate(${M.x * 26}px, ${M.y * 26}px)`;
        dot.classList.toggle('live', M.on);
      }, 50);
      $('#ctlDlg').showModal();
    },
    ctlSync() {
      const M = DC.Motion;
      $('#ctlMotion').checked = M.on; $('#ctlSteer').checked = M.on && M.steer;
      $('#ctlRange').value = String(M.range);
      $('#ctlCalibrate').disabled = !M.on;
      $('#ctlMotion').disabled = !M.available; $('#ctlSteer').disabled = !M.available;
      $('#ctlMotionNote').textContent = !M.available ? 'This device doesn’t report tilt.'
        : M.on ? (this.cart && this.cart.meta.motion ? 'This game reads tilt. ' : '') + 'Hold the phone how you like to play, then tap "Set level here".'
        : 'Turn this on to let games read tilt and shake' + (M.needsPermission ? ' — iPhone will ask once.' : '.');
    },

    /* ------------ dev tools ------------ */
    stateKey() { return 'dc.state.' + (this.cart.meta.id || DC.slug(this.cart.meta.title)); },
    initDev() {
      const E = this.engine;
      $$('dialog [data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
      ['#devDlg', '#inspDlg'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).close(); }));
      $('#inspDlg').addEventListener('close', () => { E.paused = false; E.pauseLabel = null; this.insp = null; });
      $('#devBtn').onclick = () => this.openDev();
      $('#devGo').onclick = () => {
        if (!this.devOK()) return;
        const name = $('#devScene').value, from = $('#devFrom').value;
        E.paused = false; E.pauseLabel = null;
        E.startScene(name, { arrive: from ? { from } : null });
        $('#devDlg').close(); this.show('play');
      };
      $('#devSave').onclick = () => {
        if (!this.devOK()) return;
        LS.set(this.stateKey(), E.saveState()); this.devStateInfo(); toast('State saved.');
      };
      $('#devLoad').onclick = () => {
        if (!this.devOK()) return;
        const st = LS.get(this.stateKey(), null);
        if (!st) return toast('Save a state first.');
        try { E.loadState(st); $('#devDlg').close(); this.show('play'); toast('State loaded.'); }
        catch (e) { toast('Could not load: ' + e.message); }
      };
      $('#devRestartScene').onclick = () => { if (!this.devOK()) return; E.paused = false; E.startScene(E.sceneName); $('#devDlg').close(); this.show('play'); };
      $('#devRestartGame').onclick = async () => { $('#devDlg').close(); await this.run(); this.show('play'); };
      $('#devGod').onchange = () => { E.dev.god = $('#devGod').checked; };
      $('#devBoxes').onchange = () => { E.dev.boxes = $('#devBoxes').checked; };
      $('#devLive').onchange = () => { this.live = $('#devLive').checked; LS.set('dc.live', this.live); this.updatePip(); };
      $('#devInspect').onclick = () => {
        if (!this.devOK()) return;
        $('#devDlg').close();
        this.show('play');
        E.paused = true; E.pauseLabel = 'TAP AN ENTITY TO INSPECT';
      };
      $('#devVars').addEventListener('change', (e) => {
        const inp = e.target.closest('input[data-var]'); if (!inp) return;
        const v = inp.value.trim();
        E.vars[inp.dataset.var] = v !== '' && !isNaN(+v) ? +v : v === 'true' ? true : v === 'false' ? false : v;
      });
      $('#screen').addEventListener('pointerdown', (e) => {
        if (!(E.paused && E.pauseLabel)) return;
        const r = $('#screen').getBoundingClientRect();
        const ent = E.pickScreen((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        if (!ent) return toast('Nothing there — tap a character, enemy or object.');
        E.pauseLabel = null;
        this.openInspector(ent);
      });

      // inspector
      $('#inspAddBtn').onclick = () => {
        const k = $('#inspAdd').value; if (!k) return;
        const r = DC.scrubJSON(this.ice.value);
        if (!r.ok || typeof r.data !== 'object') return toast('Fix the JSON first.');
        if (!(k in r.data)) r.data[k] = DC.clone(COMPONENT_TEMPLATES[k]);
        this.ice.value = DC.pretty(r.data);
        this.inspOptions(r.data);
        this.ice.find(JSON.stringify(k) + ':');
      };
      $('#inspApply').onclick = () => this.inspCommit(false);
      $('#inspSave').onclick = () => this.inspCommit(true);
      $('#inspDelete').onclick = () => { if (this.insp) { this.insp.dead = true; E.ents.delete(this.insp.id); } $('#inspDlg').close(); };
    },
    devOK() {
      if (DC.Net.role === 'client') { toast('Dev tools are for the host.'); return false; }
      if (!this.engine.scene) { toast('Load a cart first.'); return false; }
      return true;
    },
    devStateInfo() {
      const st = LS.get(this.stateKey(), null);
      $('#devStateInfo').textContent = st ? `Saved in "${st.scene}" at ${new Date(st.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'No saved state yet.';
    },
    openDev() {
      const E = this.engine, names = Object.keys(this.cart.scenes);
      $('#devScene').innerHTML = names.map((n) => `<option ${n === E.sceneName ? 'selected' : ''}>${esc(n)}</option>`).join('');
      $('#devFrom').innerHTML = '<option value="">at its start point</option>' + names.map((n) => `<option value="${esc(n)}">coming from ${esc(n)}</option>`).join('');
      $('#devGod').checked = E.dev.god; $('#devBoxes').checked = E.dev.boxes; $('#devLive').checked = !!this.live;
      $('#devVars').innerHTML = Object.entries(E.vars).map(([k, v]) =>
        `<label class="dev-var"><span>${esc(k)}</span><input data-var="${esc(k)}" value="${esc(String(v))}" inputmode="decimal" autocapitalize="off" autocorrect="off"></label>`).join('') || '<p class="hint">No variables.</p>';
      this.devStateInfo();
      $('#devDlg').showModal();
    },
    inspDef(ent) {
      if (ent.tileCh) return DC.clone(this.cart.tiles[ent.tileCh] || {});
      if (ent.prefab) return DC.merge(DC.clone(this.cart.prefabs[ent.prefab] || {}), ent.over || {});
      return DC.clone(ent.c);
    },
    inspOptions(def) {
      const keys = Object.keys(COMPONENT_TEMPLATES).filter((k) => !(k in def));
      $('#inspAdd').innerHTML = '<option value="">Add a component…</option>' + keys.map((k) => `<option>${k}</option>`).join('');
    },
    openInspector(ent) {
      const E = this.engine;
      this.insp = ent;
      E.paused = true;
      if (!this.ice) this.ice = new DC.CodeEditor($('#inspEditor'), { font: 14, palette: () => this.spPal() });
      const def = this.inspDef(ent);
      this.ice.value = DC.pretty(def);
      this.inspOptions(def);
      $('#inspReport').innerHTML = '';
      const name = ent.tileCh ? `Tile "${ent.tileCh}"` : ent.prefab ? ent.prefab : 'Spawned entity';
      $('#inspTitle').textContent = name;
      const tx = Math.floor((ent.x + ent.sw / 2) / E.ts), ty = Math.floor((ent.y + ent.sh - 1) / E.ts);
      const h = ent.c.health;
      $('#inspInfo').textContent = `Tile ${tx}, ${ty}` + (h ? ` · HP ${h.hp}/${h.max}` : '') + ` · tags: ${[...ent.tags].join(', ') || 'none'}` + (ent.over ? ' · has per-spawn overrides' : '');
      $('#inspSave').hidden = !(ent.prefab || ent.tileCh);
      $('#inspSave').textContent = ent.tileCh ? `Save to tile "${ent.tileCh}"` : `Save to prefab "${ent.prefab}"`;
      $('#inspDlg').showModal();
    },
    inspCommit(save) {
      const E = this.engine, ent = this.insp;
      if (!ent) return;
      const r = DC.scrubJSON(this.ice.value);
      if (!r.ok || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return this.report('#inspReport', [r.error || 'Components must be an object { … }'], [], []);
      const def = r.data;
      if (save) {
        if (ent.tileCh) this.cart.tiles[ent.tileCh] = def;
        else this.cart.prefabs[ent.prefab] = def;
        this.touch();
        this.applyLive(true).then((ok) => { if (ok) toast(ent.tileCh ? `Tile "${ent.tileCh}" saved — every copy updated.` : `Prefab "${ent.prefab}" saved — every copy updated.`); });
      } else {
        const c = ent.tileCh ? E.tileComponents(def, ent.tileCh) : DC.clone(def);
        E.applyComponents(ent, c, false);
        toast('Applied to this one only, until the scene reloads.');
      }
      $('#inspDlg').close();
    },

    /* ------------ live window ------------ */
    initPip() {
      this.live = LS.get('dc.live', false);
      const pip = $('#livePip'), pc = $('#pipCanvas'), pg = pc.getContext('2d');
      this.engine.onFrame = () => {
        if (pip.hidden) return;
        const cv = this.engine.cv;
        if (pc.width !== cv.width || pc.height !== cv.height) { pc.width = cv.width; pc.height = cv.height; }
        pg.imageSmoothingEnabled = false;
        pg.drawImage(cv, 0, 0);
      };
      pc.addEventListener('click', () => this.show('play'));
      $('#pipPause').onclick = () => {
        this.engine.paused = !this.engine.paused;
        $('#pipPause').textContent = this.engine.paused ? '▶' : '❚❚';
      };
      $('#pipClose').onclick = () => { this.live = false; LS.set('dc.live', false); this.updatePip(); };
      // drag by the bar
      let drag = null;
      const bar = pip.querySelector('.pip-bar');
      bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const r = pip.getBoundingClientRect();
        drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
        bar.setPointerCapture(e.pointerId); e.preventDefault();
      });
      bar.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const x = Math.max(0, Math.min(innerWidth - pip.offsetWidth, e.clientX - drag.dx));
        const y = Math.max(0, Math.min(innerHeight - pip.offsetHeight, e.clientY - drag.dy));
        Object.assign(pip.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
      });
      ['pointerup', 'pointercancel'].forEach((t) => bar.addEventListener(t, () => { drag = null; }));
    },
    updatePip() {
      const vis = !!this.live && this.tab !== 'play' && !!this.engine.scene;
      $('#livePip').hidden = !vis;
      if (vis) $('#pipPause').textContent = this.engine.paused ? '▶' : '❚❚';
      this.engine.active = this.tab === 'play' || vis;
      DC.Input.enabled = this.tab === 'play' || vis;
    },

    /* ------------ AI ------------ */
    initAI() {
      this.ai = { mode: 'new', genres: new Set(['Platformer', 'Top-down adventure']), last: null };
      const genres = ['Platformer', 'Top-down adventure', 'RPG', 'Shoot-em-up', 'Metroidvania', 'Puzzle', 'Brawler', 'Racing', 'Stealth', 'Arena survival'];
      $('#aiGenres').innerHTML = genres.map((g) => `<button class="chip ${this.ai.genres.has(g) ? 'on' : ''}" data-g="${esc(g)}" aria-pressed="${this.ai.genres.has(g)}">${esc(g)}</button>`).join('');
      $('#aiGenres').onclick = (e) => {
        const b = e.target.closest('[data-g]'); if (!b) return;
        const g = b.dataset.g;
        if (this.ai.genres.has(g)) this.ai.genres.delete(g); else this.ai.genres.add(g);
        b.classList.toggle('on'); b.setAttribute('aria-pressed', String(this.ai.genres.has(g)));
      };
      $$('#aiMode button').forEach((b) => (b.onclick = () => {
        this.ai.mode = b.dataset.mode;
        $$('#aiMode button').forEach((x) => x.classList.toggle('on', x === b));
        $('#aiIdea').placeholder = this.ai.mode === 'edit' ? 'Add a boss fight at the end of the cave and a shop where coins buy hearts.' : 'A platformer like Mario mixed with a Zelda-style overworld. Collect three gems to open the castle.';
        $('#aiGenreRow').hidden = this.ai.mode === 'edit';
      }));
      $('#aiBuild').onclick = () => {
        if (this.ai.mode === 'edit' && !this.syncCode()) return toast('Fix the JSON in the code tab first.');
        const p = DC.AI.prompt({
          mode: this.ai.mode, idea: $('#aiIdea').value.trim(), genres: [...this.ai.genres],
          coop: $('#aiCoop').checked, art: $('#aiArt').value, size: $('#aiSize').value, cart: this.cart,
        });
        $('#aiPrompt').value = p;
        $('#aiPromptBox').hidden = false;
        $('#aiPromptSize').textContent = `${Math.round(p.length / 1000)}k characters`;
      };
      $('#aiCopy').onclick = async () => toast((await copyText($('#aiPrompt').value)) ? 'Prompt copied. Paste it into your AI chat.' : 'Copy failed — select the text and copy it manually.');
      $('#aiLoad').onclick = async () => {
        const raw = $('#aiReply').value;
        if (!raw.trim()) return toast('Paste the AI reply first.');
        const r = DC.scrubJSON(raw);
        $('#aiFix').hidden = true;
        if (!r.ok) {
          this.ai.last = { problems: [r.error.split('\n')[0]], text: r.text };
          this.report('#aiReport', [r.error], [], r.fixes);
          $('#aiFix').hidden = false;
          return;
        }
        const rep = DC.validateCart(r.data);
        if (rep.errors.length) {
          this.ai.last = { problems: rep.errors.concat(rep.warns), text: JSON.stringify(r.data) };
          this.report('#aiReport', rep.errors, rep.warns, r.fixes);
          $('#aiFix').hidden = false;
          return;
        }
        this.report('#aiReport', [], rep.warns, r.fixes.length ? r.fixes : ['The reply was clean JSON']);
        if (rep.warns.length) { this.ai.last = { problems: rep.warns, text: JSON.stringify(r.data) }; $('#aiFix').hidden = false; }
        await this.setCart(r.data);
        toast(`Loaded "${r.data.meta.title}". Switch to Play to try it.`);
      };
      $('#aiFix').onclick = async () => {
        if (!this.ai.last) return;
        toast((await copyText(DC.AI.fixPrompt(this.ai.last.problems, this.ai.last.text))) ? 'Fix-it prompt copied. Paste it into the same AI chat.' : 'Copy failed.');
      };
      $('#aiSpec').onclick = async () => toast((await copyText(DC.SPEC)) ? 'Format reference copied.' : 'Copy failed.');
    },

    /* ------------ link (P2P) ------------ */
    initNet() {
      const N = DC.Net;
      N.on('status', (m) => { $('#netStatus').textContent = m; });
      N.on('change', () => this.netUI());
      N.on('hello', async (d) => {
        this.engine.mode = 'client';
        this.engine.localIdx = d.you;
        this.guestCart = d.cart;
        try {
          await this.engine.load(d.cart);
          $('#cartTitle').textContent = d.cart.meta.title + ' · Player ' + (d.you + 1);
          $('#netStatus').textContent = `Playing as Player ${d.you + 1}`;
          this.show('play');
          toast(`Joined as Player ${d.you + 1}`);
        } catch (e) { $('#netStatus').textContent = 'The host cart failed to load: ' + e.message; }
        this.netUI();
      });
      N.on('cart', (cart) => {
        if (!cart || !cart.meta) return;
        if (confirm(`The host shared "${cart.meta.title}". Save it to your carts?`)) { this.libSave(cart); toast('Saved to your carts.'); }
      });
      N.on('leftClient', () => { this.guestCart = null; this.run(); });
      $('#netHost').onclick = async () => {
        if (!this.engine.cart) return toast('Load a cart first.');
        try { if (!(await this.run())) return; await N.startHost(this.engine); } catch (e) { $('#netStatus').textContent = e.message; }
      };
      $('#netJoin').onclick = () => this.doJoin();
      $('#netLeave').onclick = () => N.leave();
      $('#netSend').onclick = () => { N.shareCart(this.cart); toast('Cart sent to everyone in the room.'); };
      $('#netSave').onclick = () => { if (this.guestCart) { this.libSave(DC.clone(this.guestCart)); toast('Saved to your carts.'); } };
      $('#netCopyLink').onclick = async () => {
        const url = location.origin + location.pathname + '?join=' + N.code;
        if (navigator.share) { try { await navigator.share({ title: 'Join my Data Console game', url }); return; } catch (e) { /* fall back */ } }
        toast((await copyText(url)) ? 'Invite link copied.' : url, 5000);
      };
      this.netUI();
    },
    async doJoin() {
      const code = $('#netJoinCode').value.trim();
      if (code.length < 4) return toast('Enter the room code from the host.');
      try { await DC.Net.join(code, this.engine); } catch (e) { $('#netStatus').textContent = e.message; }
    },
    netUI() {
      const N = DC.Net, role = N.role;
      $('#netRoom').hidden = role !== 'host' || !N.code;
      $('#netCode').textContent = N.code || '';
      $('#netHost').hidden = !!role;
      $('#netJoinRow').hidden = !!role;
      $('#netLeave').hidden = !role;
      $('#netSend').hidden = role !== 'host';
      $('#netSave').hidden = role !== 'client' || !this.guestCart;
      const peers = [];
      if (role === 'host') { peers.push('Player 1 — you (host)'); for (const c of N.conns.values()) peers.push(`Player ${c.idx + 1}`); }
      if (role === 'client' && this.engine.mode === 'client') peers.push(`You are Player ${this.engine.localIdx + 1}`);
      $('#netPeers').innerHTML = peers.map((p) => `<li>${esc(p)}</li>`).join('');
      $('#linkDot').classList.toggle('live', !!role);
    },

    /* ------------ library ------------ */
    initCarts() {
      $('#cartSave').onclick = () => { if (this.syncCode()) { this.libSave(this.cart); toast(`Saved "${this.cart.meta.title}".`); this.cartsRefresh(); } };
      $('#cartNew').onclick = async () => { if (confirm('Start a new blank cart? Save the current one first if you want to keep it.')) { await this.setCart(DC.clone(DC.BLANK_CART)); this.show('code'); } };
      $('#demoGrid').onclick = async (e) => {
        const b = e.target.closest('[data-demo]'); if (!b) return;
        const cart = DC[b.dataset.demo];
        if (!cart) return toast('That demo is not available.');
        await this.setCart(DC.clone(cart));
        this.show('play');
      };
      $('#cartShare').onclick = async () => {
        if (!this.syncCode()) return;
        const url = location.origin + location.pathname + '#c=' + (await DC.packCart(this.cart));
        const ok = await copyText(url);
        toast(ok ? (url.length > 8000 ? `Link copied (${Math.round(url.length / 1000)}k characters — some apps cut long links; the file export is safer).` : 'Share link copied. Anyone who opens it gets this cart.') : 'Copy failed.', 5000);
      };
      $('#cartList').onclick = async (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const lib = LS.get('dc.library', []);
        const item = lib.find((x) => x.id === b.dataset.id); if (!item) return;
        if (b.dataset.act === 'load') { await this.setCart(DC.clone(item.cart)); this.show('play'); }
        if (b.dataset.act === 'export') download(DC.slug(item.title) + '.json', DC.pretty(item.cart));
        if (b.dataset.act === 'delete' && confirm(`Delete "${item.title}" from this device?`)) { LS.set('dc.library', lib.filter((x) => x !== item)); this.cartsRefresh(); }
      };
    },
    libSave(cart) {
      cart.meta = cart.meta || {};
      if (!cart.meta.id) cart.meta.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const lib = LS.get('dc.library', []).filter((x) => x.id !== cart.meta.id);
      lib.unshift({ id: cart.meta.id, title: cart.meta.title || 'Untitled', updated: Date.now(), cart: DC.clone(cart) });
      LS.set('dc.library', lib);
      if (cart === this.cart) this.save();
    },
    cartsRefresh() {
      const lib = LS.get('dc.library', []);
      $('#cartList').innerHTML = lib.length ? lib.map((x) => `
        <li><div class="ct"><strong>${esc(x.title)}</strong><span>${new Date(x.updated).toLocaleDateString()} · ${Object.keys(x.cart.scenes || {}).length} scenes</span></div>
        <div class="ca"><button data-act="load" data-id="${x.id}">Play</button><button data-act="export" data-id="${x.id}">Export</button><button data-act="delete" data-id="${x.id}" class="quiet">Delete</button></div></li>`).join('')
        : '<li class="empty">No saved carts on this device yet. Save the current cart to keep a copy here.</li>';
    },
  });

  window.addEventListener('DOMContentLoaded', () => Ed.init().catch((e) => { console.error(e); toast('Start-up failed: ' + e.message, 6000); }));
})();
