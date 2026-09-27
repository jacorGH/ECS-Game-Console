/* Data Console — core: palette, JSON scrubber, cart validator, packing */
(function () {
  const DC = (window.DC = window.DC || {});

  // DawnBringer 32 — indexed by pixel chars 0-9 then a-v
  DC.PALETTE = ['#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
    '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
    '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
    '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'];
  DC.PIXCHARS = '0123456789abcdefghijklmnopqrstuv';
  DC.BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'start', 'select'];

  DC.color = function (c, pal) {
    pal = pal || DC.PALETTE;
    if (c == null || c === false) return null;
    if (typeof c === 'number') return pal[((Math.floor(c) % pal.length) + pal.length) % pal.length];
    if (typeof c === 'string') {
      if (c[0] === '#' || c.startsWith('rgb') || c.startsWith('hsl')) return c;
      const n = parseInt(c, 10);
      if (!isNaN(n)) return pal[((n % pal.length) + pal.length) % pal.length];
      return c;
    }
    return null;
  };
  DC.hexRGB = function (hex) {
    let h = String(hex || '#f0f').replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  DC.clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  DC.merge = function (a, b) {
    if (!b || typeof b !== 'object') return a;
    for (const k in b) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) DC.merge(a[k], v);
      else a[k] = DC.clone(v);
    }
    return a;
  };
  DC.fmt = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
  /* Merge `add` onto a clone of `base` for prefab/behavior resolution. Most keys deep-merge or
     override like DC.merge; "rules", "tags" and "use" concatenate instead, so inheriting from a
     parent or using a behavior never silently drops its rules. */
  DC.mergePrefab = function (base, add) {
    const out = DC.clone(base) || {};
    if (!add || typeof add !== 'object') return out;
    for (const k in add) {
      const v = add[k];
      if (k === 'rules') { out.rules = [...(Array.isArray(out.rules) ? out.rules : []), ...(Array.isArray(v) ? v : [v])]; continue; }
      if (k === 'tags') { out.tags = [...new Set([...(Array.isArray(out.tags) ? out.tags : []), ...(Array.isArray(v) ? v : [v])])]; continue; }
      if (k === 'use') { out.use = [...(Array.isArray(out.use) ? out.use : []), ...(Array.isArray(v) ? v : [v])]; continue; }
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = DC.merge(DC.clone(out[k]), DC.clone(v));
      else out[k] = DC.clone(v);
    }
    return out;
  };
  /* Fold one "use" entry (a behavior name, or {name: paramOverrides}) onto a components layer.
     Behavior params become entity vars (so rules/formulas read them as self.<name>), with the
     use-site overrides winning over the behavior's own defaults. */
  DC.applyBehavior = function (cart, layer, entry, cache, seen) {
    const bname = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? Object.keys(entry)[0] : null;
    if (!bname) return layer;
    const overrides = typeof entry === 'object' ? entry[bname] : null;
    const beh = (cart.behaviors || {})[bname];
    if (!beh) return layer;
    const key = '@behavior:' + bname;
    let contrib = cache[key];
    if (!contrib) {
      if (seen.has(key)) contrib = {};
      else {
        const seen2 = new Set(seen); seen2.add(key);
        let inner = {};
        for (const sub of Array.isArray(beh.use) ? beh.use : beh.use ? [beh.use] : []) inner = DC.applyBehavior(cart, inner, sub, cache, seen2);
        const own = DC.clone(beh); delete own.use; delete own.params;
        contrib = DC.mergePrefab(inner, own);
      }
      cache[key] = contrib;
    }
    const params = Object.assign({}, beh.params || {}, overrides && typeof overrides === 'object' ? overrides : {});
    const withParams = DC.mergePrefab(contrib, { vars: params });
    return DC.mergePrefab(layer, withParams);
  };
  /* Resolve a prefab's full component set: its "extends" chain, then each "use" behavior in
     order, then the prefab's own fields (which win on conflicts; rules/tags/use concatenate).
     Cached per name for the life of `cache` — callers own the cache (fresh per validate, or kept
     for a whole engine session and cleared on load/hot-reload). */
  DC.resolvePrefab = function (cart, name, cache, seen) {
    cache = cache || {};
    if (cache[name]) return cache[name];
    seen = seen || new Set();
    const raw = (cart.prefabs || {})[name];
    if (!raw) return null;
    if (seen.has(name)) { const r = DC.clone(raw); delete r.extends; delete r.use; return r; }
    const seen2 = new Set(seen); seen2.add(name);
    let layer = raw.extends ? DC.resolvePrefab(cart, raw.extends, cache, seen2) || {} : {};
    for (const u of Array.isArray(raw.use) ? raw.use : raw.use ? [raw.use] : []) layer = DC.applyBehavior(cart, layer, u, cache, seen2);
    const own = DC.clone(raw); delete own.extends; delete own.use;
    const out = DC.mergePrefab(layer, own);
    cache[name] = out;
    return out;
  };

  DC.cmp = function (a, op, b) {
    switch (op || '==') {
      case '==': case '=': case '===': return a == b;
      case '!=': case '!==': return a != b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
    }
    return false;
  };
  DC.slug = (s) => String(s || 'cart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cart';

  /* ------------------------------------------------------------------
     JSON scrubber — fixes what chat AIs do to JSON
     ------------------------------------------------------------------ */
  DC.scrubJSON = function (input) {
    const fixes = [];
    const note = (m) => { if (!fixes.includes(m)) fixes.push(m); };
    let s = String(input == null ? '' : input);
    const sub = (re, to, msg) => { const t = s.replace(re, to); if (t !== s) { note(msg); s = t; } };

    sub(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '', 'Removed invisible characters');
    sub(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ', 'Replaced unusual spaces');
    sub(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB\uFF02\u275D\u275E]/g, '"', 'Straightened curly double quotes');
    sub(/[\u2018\u2019\u201A\u201B\u2032\u2035\uFF07\u275B\u275C]/g, "'", 'Straightened curly single quotes');
    sub(/[\u2212\u2012\u2013](?=\d)/g, '-', 'Fixed minus signs');
    sub(/\uFF1A/g, ':', 'Fixed full-width colons');
    sub(/\uFF0C/g, ',', 'Fixed full-width commas');
    sub(/\r\n?/g, '\n', 'Normalised line endings');

    // Markdown fences: keep the biggest fenced block that looks like JSON
    if (s.includes('```')) {
      const blocks = [];
      const re = /```[a-zA-Z0-9_-]*[^\n]*\n([\s\S]*?)(```|$)/g;
      let m;
      while ((m = re.exec(s))) if (m[1].includes('{')) blocks.push(m[1]);
      if (blocks.length) { s = blocks.sort((a, b) => b.length - a.length)[0]; note('Removed markdown code fences'); }
      else { s = s.replace(/```[a-zA-Z0-9_-]*/g, ''); note('Removed markdown code fences'); }
    }

    const first = s.indexOf('{');
    if (first < 0) return { ok: false, error: 'No JSON object found. The reply needs to contain a { ... } cartridge.', fixes, text: s };
    let last = s.lastIndexOf('}');
    if (last < first) last = s.length - 1;
    if (s.slice(0, first).trim() || s.slice(last + 1).trim()) note('Removed text before or after the JSON');
    s = s.slice(first, last + 1);

    try { return { ok: true, data: JSON.parse(s), text: s, fixes }; } catch (e) { /* repair below */ }

    const r = repairJSON(s);
    r.notes.forEach(note);
    s = r.text;
    try { return { ok: true, data: JSON.parse(s), text: s, fixes }; }
    catch (e) { return { ok: false, error: describeJSONError(e, s), text: s, fixes }; }
  };

  function repairJSON(src) {
    const notes = [];
    const add = (m) => { if (!notes.includes(m)) notes.push(m); };
    const n = src.length;
    const stack = [];
    let out = '';
    let i = 0;
    let lastSig = '';
    let newline = false;
    const ws = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

    const maybeComma = () => {
      if (newline && (lastSig === 'v') && stack.length) { out += ','; add('Added missing commas'); }
      newline = false;
    };
    const peekSig = (j) => { while (j < n && ws(src[j])) j++; return j; };

    while (i < n) {
      const c = src[i];
      if (c === '"' || c === "'") {
        const q = c;
        let j = i + 1, buf = '';
        while (j < n) {
          const ch = src[j];
          if (ch === '\\') {
            const nx = src[j + 1];
            if (q === "'" && nx === "'") { buf += "'"; j += 2; continue; }
            if (nx === undefined) { j++; continue; }
            if ('"\\/bfnrtu'.includes(nx)) buf += ch + nx; else buf += nx; // drop invalid escapes
            j += 2; continue;
          }
          if (ch === q) {
            if (q === '"') {
              // Only treat as the closing quote if what follows looks like JSON structure
              let k = j + 1, sawNl = false;
              while (k < n && ws(src[k])) { if (src[k] === '\n') sawNl = true; k++; }
              const nx = src[k];
              if (k >= n || sawNl || nx === ',' || nx === '}' || nx === ']' || nx === ':') break;
              buf += '\\"'; add('Escaped quotes inside text'); j++; continue;
            }
            break;
          }
          if (ch === '\n') { buf += '\\n'; add('Escaped line breaks inside text'); j++; continue; }
          if (ch === '\t') { buf += '\\t'; j++; continue; }
          if (q === "'" && ch === '"') { buf += '\\"'; j++; continue; }
          buf += ch; j++;
        }
        if (q === "'") add('Converted single-quoted text to double quotes');
        if (j >= n) add('Closed an unfinished string');
        maybeComma();
        out += '"' + buf + '"';
        lastSig = 'v';
        i = j + 1;
        continue;
      }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; add('Removed comments'); continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; add('Removed comments'); continue; }
      if (c === '#' && (lastSig === '' || lastSig === ',' || lastSig === '{' || lastSig === 'v' || lastSig === '[')) {
        // python/yaml style comment outside strings
        while (i < n && src[i] !== '\n') i++; add('Removed comments'); continue;
      }
      if (c === '\n') { newline = true; out += c; i++; continue; }
      if (ws(c)) { out += c; i++; continue; }
      if (c === ',') {
        const j = peekSig(i + 1);
        if (src[j] === '}' || src[j] === ']') { add('Removed trailing commas'); i++; continue; }
        if (src[j] === ',') { add('Removed doubled commas'); i++; continue; }
        if (lastSig === ',' || lastSig === '[' || lastSig === '{') { add('Removed stray commas'); i++; continue; }
        out += ','; lastSig = ','; newline = false; i++; continue;
      }
      if (c === ':') { out += ':'; lastSig = ':'; newline = false; i++; continue; }
      if (c === '{' || c === '[') { maybeComma(); stack.push(c); out += c; lastSig = c; i++; continue; }
      if (c === '}' || c === ']') {
        const want = stack.pop();
        const close = want === '{' ? '}' : want === '[' ? ']' : null;
        if (!close) { add('Removed extra closing brackets'); i++; continue; }
        if (close !== c) add('Fixed mismatched brackets');
        out += close; lastSig = 'v'; newline = false; i++; continue;
      }
      if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) {
        let j = i; let num = '';
        while (j < n && /[-+0-9.eE]/.test(src[j])) { num += src[j]; j++; }
        if (num[0] === '+') { num = num.slice(1); add('Fixed number formats'); }
        if (num[0] === '.') { num = '0' + num; add('Fixed number formats'); }
        if (num.startsWith('-.')) { num = '-0' + num.slice(1); add('Fixed number formats'); }
        if (num.endsWith('.')) { num = num.slice(0, -1); add('Fixed number formats'); }
        if (/^\.{2,}$/.test(num) || num === '...') { add('Removed "..." placeholders (content may be missing)'); i = j; continue; }
        if (isNaN(Number(num))) { add('Removed broken numbers'); num = '0'; }
        maybeComma(); out += num; lastSig = 'v'; i = j; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i; let w = '';
        while (j < n && /[A-Za-z0-9_$\-]/.test(src[j])) { w += src[j]; j++; }
        const k = peekSig(j);
        const isKey = src[k] === ':';
        let tok;
        if (!isKey && (w === 'true' || w === 'false' || w === 'null')) tok = w;
        else if (!isKey && (w === 'True' || w === 'False')) { tok = w.toLowerCase(); add('Converted True/False to true/false'); }
        else if (!isKey && (w === 'None' || w === 'undefined' || w === 'NaN' || w === 'Infinity' || w === 'nil')) { tok = 'null'; add('Converted None/undefined/NaN to null'); }
        else { tok = '"' + w + '"'; add(isKey ? 'Quoted bare keys' : 'Quoted bare words'); }
        maybeComma(); out += tok; lastSig = 'v'; i = j; continue;
      }
      add('Removed stray characters');
      i++;
    }
    if (stack.length) {
      out = out.replace(/[,:\s]*$/, '');
      while (stack.length) out += stack.pop() === '{' ? '}' : ']';
      add('Closed brackets the reply left open — it may have been cut off');
    }
    return { text: out, notes };
  }

  function describeJSONError(e, s) {
    const msg = String(e && e.message || e);
    let pos = null;
    let m = /position (\d+)/i.exec(msg);
    if (m) pos = +m[1];
    let line, col;
    m = /line (\d+) column (\d+)/i.exec(msg);
    if (m) { line = +m[1]; col = +m[2]; }
    if (pos != null && line == null) {
      const before = s.slice(0, pos);
      line = before.split('\n').length;
      col = pos - before.lastIndexOf('\n');
    }
    if (line != null) {
      const src = s.split('\n')[line - 1] || '';
      const a = Math.max(0, col - 30);
      return `JSON error on line ${line}, column ${col}: ${msg.replace(/^JSON\.parse: |^Unexpected /, (x) => x)}\n  ${src.slice(a, a + 70)}\n  ${' '.repeat(Math.min(col - 1 - a, 70))}^`;
    }
    return 'JSON error: ' + msg;
  }
  DC.describeJSONError = describeJSONError;

  /* ------------------------------------------------------------------
     Validator — normalises a cart in place, reports problems
     ------------------------------------------------------------------ */
  DC.COMPONENTS = ['tags', 'sprite', 'body', 'control', 'ai', 'health', 'hurt', 'stompable', 'pickup', 'attack', 'lifetime',
    'extends', 'use', 'states',
    'talk', 'warp', 'spawner', 'emitter', 'text', 'solid', 'move', 'vars', 'vel', 'noCollide', 'layer', 'rules', 'persistent'];
  DC.ACTIONS = ['if', 'then', 'else', 'wait', 'set', 'add', 'value', 'sound', 'music', 'spawn', 'at', 'dx', 'dy', 'x', 'y', 'tx', 'ty', 'vx', 'vy', 'with',
    'destroy', 'kill', 'damage', 'amount', 'heal', 'velocity', 'move', 'scene', 'restart', 'reset', 'say', 'name', 'text', 't', 'color',
    'shake', 'flash', 'burst', 'count', 'setTile', 'log'];

  DC.validateCart = function (cart) {
    const errors = [], warns = [];
    const E = (m) => errors.push(m), Wn = (m) => { if (!warns.includes(m)) warns.push(m); };
    const isFormula = (v) => typeof v === 'string' && v.length > 1 && v[0] === '=' && v[1] !== '=';
    if (!cart || typeof cart !== 'object' || Array.isArray(cart)) { E('The cart must be one JSON object { ... }.'); return { errors, warns }; }
    const obj = (k) => {
      if (cart[k] == null) cart[k] = {};
      else if (typeof cart[k] !== 'object' || Array.isArray(cart[k])) { E(`"${k}" must be an object of named entries.`); cart[k] = {}; }
    };
    if (!cart.meta || typeof cart.meta !== 'object') cart.meta = {};
    ['sprites', 'sounds', 'music', 'tiles', 'prefabs', 'scenes', 'vars', 'behaviors'].forEach(obj);
    if (cart.rules == null) cart.rules = [];
    if (!Array.isArray(cart.rules)) cart.rules = [cart.rules];
    if (cart.hud != null && !Array.isArray(cart.hud)) { Wn('"hud" should be a list — ignored.'); cart.hud = []; }

    const m = cart.meta;
    m.title = String(m.title || 'Untitled cart');
    const clampI = (v, lo, hi, d) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
    m.width = clampI(m.width, 64, 640, 256);
    m.height = clampI(m.height, 64, 480, 224);
    if (cart.palette != null && !Array.isArray(cart.palette)) { Wn('"palette" should be a list of hex colours — using the default.'); delete cart.palette; }

    const S = cart.sprites, T = cart.tiles, P = cart.prefabs, SC = cart.scenes, SN = cart.sounds, MU = cart.music, B = cart.behaviors;

    // Sprites
    for (const [name, d] of Object.entries(S)) {
      if (!d || typeof d !== 'object') { E(`Sprite "${name}" must be an object.`); delete S[name]; continue; }
      if (d.pixels && !d.frames) { d.frames = [d.pixels]; delete d.pixels; }
      if (d.frames && d.stack) {
        // sprite stacking: each frame is a list of pixel-art layers (bottom to top), not one flat frame
        if (!Array.isArray(d.frames)) { E(`Sprite "${name}": "frames" must be a list of stacks.`); delete d.frames; }
        else {
          let w = parseInt(d.w, 10) || 0, h = parseInt(d.h, 10) || 0;
          for (const stackFrame of d.frames) for (const layer of Array.isArray(stackFrame) ? stackFrame : []) {
            if (Array.isArray(layer)) { w = Math.max(w, ...layer.map((r) => String(r).length)); h = Math.max(h, layer.length); }
          }
          d.w = w || 1; d.h = h || 1;
          let bad = false, empty = false;
          d.frames = d.frames.map((stackFrame) => {
            const layers = Array.isArray(stackFrame) ? stackFrame : [stackFrame];
            if (!layers.length) empty = true;
            return (layers.length ? layers : [[]]).map((layer) => {
              const rows = [], src = Array.isArray(layer) ? layer : [];
              for (let y = 0; y < d.h; y++) {
                let r = String(src[y] == null ? '' : src[y]);
                if (r.length < d.w) r += '.'.repeat(d.w - r.length);
                if (r.length > d.w) r = r.slice(0, d.w);
                if (/[^0-9a-vA-V. ]/.test(r)) bad = true;
                rows.push(r);
              }
              return rows;
            });
          });
          if (!d.frames.length) { E(`Sprite "${name}" has no usable stacks.`); d.frames = [[Array(d.h).fill('.'.repeat(d.w))]]; }
          if (empty) Wn(`Sprite "${name}" has a stack with no layers — it will draw as nothing.`);
          if (bad) Wn(`Sprite "${name}" uses characters outside 0-9, a-v and "." — they draw as transparent.`);
        }
      } else if (d.frames) {
        if (!Array.isArray(d.frames)) { E(`Sprite "${name}": "frames" must be a list of frames.`); delete d.frames; }
        else {
          if (d.frames.length && typeof d.frames[0] === 'string') d.frames = [d.frames];
          d.frames = d.frames.filter((f) => Array.isArray(f));
          if (!d.frames.length) { E(`Sprite "${name}" has no usable frames.`); d.frames = [['.']]; }
          let w = parseInt(d.w, 10) || 0, h = parseInt(d.h, 10) || 0;
          for (const f of d.frames) { w = Math.max(w, ...f.map((r) => String(r).length)); h = Math.max(h, f.length); }
          d.w = w || 1; d.h = h || 1;
          let bad = false;
          d.frames = d.frames.map((f) => {
            const rows = [];
            for (let y = 0; y < d.h; y++) {
              let r = String(f[y] == null ? '' : f[y]);
              if (r.length < d.w) r = r + '.'.repeat(d.w - r.length);
              if (r.length > d.w) r = r.slice(0, d.w);
              if (/[^0-9a-vA-V. ]/.test(r)) bad = true;
              rows.push(r);
            }
            return rows;
          });
          if (bad) Wn(`Sprite "${name}" uses characters outside 0-9, a-v and "." — they draw as transparent.`);
        }
      } else if (!d.src) E(`Sprite "${name}" needs "frames" (pixel rows) or "src" (an image file).`);
    }

    // Tiles
    for (const [ch, d] of Object.entries(T)) {
      if (ch.length !== 1) { E(`Tile key "${ch}" must be exactly one character.`); delete T[ch]; continue; }
      if (ch === '.') { Wn('Tile "." is reserved for empty space — ignored.'); delete T[ch]; continue; }
      if (!d || typeof d !== 'object') { E(`Tile "${ch}" must be an object.`); delete T[ch]; continue; }
      if (d.sprite && !S[d.sprite]) Wn(`Tile "${ch}" uses missing sprite "${d.sprite}".`);
      if (d.hit) {
        if (d.hit.become != null && d.hit.become !== '.' && !isFormula(d.hit.become) && !T[d.hit.become]) Wn(`Tile "${ch}" becomes unknown tile "${d.hit.become}".`);
        if (d.hit.spawn && !P[d.hit.spawn]) E(`Tile "${ch}" spawns missing prefab "${d.hit.spawn}".`);
      }
    }

    // Behaviors — reusable component/rule bundles a prefab can "use"
    for (const [n, b] of Object.entries(B)) {
      if (!b || typeof b !== 'object' || Array.isArray(b)) { E(`Behavior "${n}" must be an object.`); delete B[n]; continue; }
      if (typeof b.sprite === 'string') b.sprite = { name: b.sprite };
      if (b.tags && !Array.isArray(b.tags)) b.tags = [String(b.tags)];
      if (b.params != null && (typeof b.params !== 'object' || Array.isArray(b.params))) E(`Behavior "${n}" "params" must be an object of default values.`);
      for (const k of Object.keys(b)) if (k !== 'params' && !DC.COMPONENTS.includes(k)) Wn(`Behavior "${n}" has unknown component "${k}" — ignored.`);
    }

    // Prefabs
    const pfRef = (ref, where) => { if (ref && !isFormula(ref) && !P[ref]) E(`${where} refers to missing prefab "${ref}".`); };
    const fxRef = (ref, where) => { const n = ref && typeof ref === 'object' ? ref.name || ref.sprite || ref.prefab : ref; if (n && !isFormula(n) && !P[n] && !S[n]) Wn(`${where}: "${n}" is not a sprite or prefab.`); };
    const lootRefs = (t, where) => {
      if (t == null) return;
      if (typeof t === 'string') return pfRef(t, where);
      if (Array.isArray(t)) return t.forEach((x) => lootRefs(x, where));
      if (typeof t !== 'object') return E(`${where}: a loot entry must be a prefab name, a list, or {"prefab":…}.`);
      if (Array.isArray(t.one)) return t.one.forEach((x) => { if (x && (typeof x === 'string' || x.prefab)) lootRefs(typeof x === 'string' ? x : x.prefab, where); });
      if (t.prefab) pfRef(t.prefab, where);
    };
    for (const [name, p] of Object.entries(P)) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) { E(`Prefab "${name}" must be an object.`); delete P[name]; continue; }
      if (typeof p.sprite === 'string') p.sprite = { name: p.sprite };
      if (p.sprite && p.sprite.name && !S[p.sprite.name]) Wn(`Prefab "${name}" uses missing sprite "${p.sprite.name}".`);
      if (p.tags && !Array.isArray(p.tags)) p.tags = [String(p.tags)];
      for (const k of Object.keys(p)) if (!DC.COMPONENTS.includes(k)) Wn(`Prefab "${name}" has unknown component "${k}" — ignored.`);
      if (p.extends != null) {
        if (typeof p.extends !== 'string' || !P[p.extends]) E(`Prefab "${name}" extends missing prefab "${p.extends}".`);
        else if (p.extends === name) E(`Prefab "${name}" cannot extend itself.`);
      }
      if (p.use != null) {
        const list = Array.isArray(p.use) ? p.use : [p.use];
        for (const u of list) {
          const bname = typeof u === 'string' ? u : u && typeof u === 'object' ? Object.keys(u)[0] : null;
          if (!bname || !B[bname]) { E(`Prefab "${name}" uses missing behavior "${bname}".`); continue; }
          const overrides = typeof u === 'object' ? u[bname] : null;
          if (overrides && typeof overrides === 'object') {
            const known = Object.keys(B[bname].params || {});
            for (const k of Object.keys(overrides)) if (!known.includes(k)) Wn(`Prefab "${name}" uses "${bname}" with unknown parameter "${k}" (it takes: ${known.join(', ') || 'none'}).`);
          }
        }
      }
      if (p.attack) pfRef(p.attack.prefab, `Prefab "${name}" attack`);
      if (p.spawner) pfRef(p.spawner.prefab, `Prefab "${name}" spawner`);
      if (p.health && p.health.drop) lootRefs(p.health.drop, `Prefab "${name}" health.drop`);
      if (p.health) { fxRef(p.health.effect, `Prefab "${name}" health.effect`); fxRef(p.health.hitEffect, `Prefab "${name}" health.hitEffect`); }
      if (p.warp && p.warp.scene && !isFormula(p.warp.scene) && !SC[p.warp.scene]) E(`Prefab "${name}" warps to missing scene "${p.warp.scene}".`);
      if (p.talk && p.talk.lines == null && !Array.isArray(p.talk.branches)) Wn(`Prefab "${name}" talk has no "lines" or "branches".`);
    }
    // A prefab with "extends" or "use" gets a second pass: check the fully merged component
    // set for reference problems (a missing sprite pulled in from a behavior, etc). This runs
    // after every prefab above has had its own sprite/tags normalised, so resolution sees the
    // normalised form no matter which order prefabs happen to be declared in.
    const resolveCache = {};
    for (const [name, p] of Object.entries(P)) {
      if (!p.extends && !p.use) continue;
      const eff = DC.resolvePrefab(cart, name, resolveCache);
      if (!eff) continue;
      if (eff.sprite && eff.sprite.name && !S[eff.sprite.name]) Wn(`Prefab "${name}" (from extends/use) uses missing sprite "${eff.sprite.name}".`);
      if (eff.attack && eff.attack.prefab) pfRef(eff.attack.prefab, `Prefab "${name}" attack`);
      if (eff.spawner && eff.spawner.prefab) pfRef(eff.spawner.prefab, `Prefab "${name}" spawner`);
      if (eff.health && eff.health.drop) lootRefs(eff.health.drop, `Prefab "${name}" health.drop`);
      if (eff.warp && eff.warp.scene && !isFormula(eff.warp.scene) && !SC[eff.warp.scene]) E(`Prefab "${name}" warps to missing scene "${eff.warp.scene}".`);
    }

    // Scenes
    const scenes = Object.keys(SC);
    if (!scenes.length) E('Add at least one scene under "scenes".');
    if (!m.start || !SC[m.start]) {
      if (m.start && scenes.length) Wn(`meta.start "${m.start}" is not a scene — starting at "${scenes[0]}".`);
      m.start = scenes[0];
    }
    for (const [name, s] of Object.entries(SC)) {
      if (!s || typeof s !== 'object') { E(`Scene "${name}" must be an object.`); SC[name] = {}; continue; }
      if (typeof s.map === 'string') s.map = s.map.split('\n');
      if (s.map == null) s.map = [];
      if (!Array.isArray(s.map)) { E(`Scene "${name}": "map" must be a list of row strings.`); s.map = []; }
      s.map = s.map.map((r) => String(r));
      const w = Math.max(0, ...s.map.map((r) => r.length));
      if (s.map.some((r) => r.length !== w)) { Wn(`Scene "${name}": map rows had different lengths — padded with ".".`); s.map = s.map.map((r) => r + '.'.repeat(w - r.length)); }
      const legend = s.legend || (s.legend = {});
      for (const [ch, ref] of Object.entries(legend)) {
        const pf = typeof ref === 'string' ? ref : ref && ref.prefab;
        if (!P[pf]) E(`Scene "${name}" legend "${ch}" refers to missing prefab "${pf}".`);
      }
      const unknown = new Set();
      for (const r of s.map) for (const ch of r) if (ch !== '.' && ch !== ' ' && !T[ch] && !legend[ch]) unknown.add(ch);
      if (unknown.size) Wn(`Scene "${name}" map uses characters with no tile or legend: ${[...unknown].join(' ')}`);
      for (const en of (s.entities || [])) pfRef(en && en.prefab, `Scene "${name}" entities`);
      if (s.music && !MU[s.music]) Wn(`Scene "${name}" plays missing music "${s.music}".`);
      if (s.rules != null && !Array.isArray(s.rules)) s.rules = [s.rules];
    }

    // Rules (walk actions)
    const walk = (acts, where) => {
      if (!acts) return;
      if (!Array.isArray(acts)) acts = [acts];
      for (const a of acts) {
        if (!a || typeof a !== 'object') continue;
        if ('else' in a && !('if' in a)) Wn(`${where}: "else" only works in the same object as an "if" — {"if":…,"then":[…],"else":[…]}.`);
        if ('if' in a) {
          const extra = Object.keys(a).filter((k) => !['if', 'then', 'else'].includes(k));
          if (extra.length) Wn(`${where}: an "if" action only runs "then" or "else" — move ${extra.map((k) => '"' + k + '"').join(', ')} inside "then".`);
          if (a.then == null && a.else == null) Wn(`${where}: this "if" has no "then" or "else".`);
        }
        if (Array.isArray(a.switch)) a.switch.forEach((c) => { if (c && typeof c === 'object') { walk(c.then, where); walk(c.do, where); walk(c.else, where); } });
        if (a.scene && !isFormula(a.scene) && !SC[a.scene]) E(`${where}: goes to missing scene "${a.scene}".`);
        if (a.spawn) pfRef(a.spawn, where);
        if (a.sound && !SN[a.sound]) Wn(`${where}: plays missing sound "${a.sound}".`);
        if (a.music && !MU[a.music]) Wn(`${where}: plays missing music "${a.music}".`);
        walk(a.then, where); walk(a.else, where); walk(a.do, where);
        if (a.say != null) walkLines(a.say, where);
      }
    };
    /* dialogue lines can carry actions and choices, which carry more actions and lines */
    function walkLines(lines, where, depth = 0) {
      if (depth > 8 || lines == null) return;
      for (const L of Array.isArray(lines) ? lines : [lines]) {
        if (!L || typeof L !== 'object') continue;
        walk(L.do, where);
        if (L.choices != null && !Array.isArray(L.choices)) E(`${where}: "choices" must be a list.`);
        for (const c of Array.isArray(L.choices) ? L.choices : []) { if (c && typeof c === 'object') { walk(c.do, where); walkLines(c.lines, where, depth + 1); } }
      }
    }
    const rules = (list, where) => (list || []).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      if (!r.on) Wn(`${where} rule ${i + 1} has no "on" event.`);
      if (r.do == null && r.actions) r.do = r.actions;
      walk(r.do, `${where} rule ${i + 1} (${r.on})`);
      walk(r.else, `${where} rule ${i + 1} (${r.on}) else`);
      if (r.else != null && r.if == null) Wn(`${where} rule ${i + 1}: "else" needs an "if" on the rule.`);
      if (r.else != null && r.on === 'when') Wn(`${where} rule ${i + 1}: a "when" rule has no "else" — its "if" is what triggers it.`);
    });
    rules(cart.rules, 'Global');
    for (const [n, s] of Object.entries(SC)) rules(s.rules, `Scene "${n}"`);
    for (const [n, p] of Object.entries(P)) {
      if (p.talk) {
        walk(p.talk.then, `Prefab "${n}" talk`);
        walkLines(p.talk.lines, `Prefab "${n}" talk`);
        if (p.talk.branches != null && !Array.isArray(p.talk.branches)) E(`Prefab "${n}" talk.branches must be a list.`);
        for (const b of Array.isArray(p.talk.branches) ? p.talk.branches : []) if (b && typeof b === 'object') { walk(b.do, `Prefab "${n}" talk branch`); walkLines(b.lines, `Prefab "${n}" talk branch`); }
      }
      if (p.health) walk(p.health.onDeath, `Prefab "${n}" onDeath`);
      if (p.pickup) walk(p.pickup.do, `Prefab "${n}" pickup`);
      if (p.rules != null) {
        if (!Array.isArray(p.rules)) { E(`Prefab "${n}" "rules" must be a list.`); p.rules = []; }
        rules(p.rules, `Prefab "${n}"`);
      }
      if (p.states != null) {
        if (typeof p.states !== 'object' || Array.isArray(p.states)) { E(`Prefab "${n}" "states" must be an object of named states.`); }
        else {
          const names = Object.keys(p.states).filter((k) => k !== 'start');
          if (!names.length) Wn(`Prefab "${n}" "states" has no states.`);
          if (p.states.start != null && !names.includes(p.states.start)) E(`Prefab "${n}" states.start "${p.states.start}" is not one of its states.`);
          const checkGoto = (acts, where) => {
            if (!acts) return;
            for (const a of Array.isArray(acts) ? acts : [acts]) {
              if (!a || typeof a !== 'object') continue;
              if (a.goto != null && !names.includes(String(a.goto))) E(`${where}: goes to missing state "${a.goto}".`);
              checkGoto(a.then, where); checkGoto(a.else, where); checkGoto(a.do, where);
              if (Array.isArray(a.switch)) a.switch.forEach((c) => c && typeof c === 'object' && checkGoto(c.then ?? c.do ?? c.else, where));
            }
          };
          for (const sn of names) {
            const sd = p.states[sn], where = `Prefab "${n}" state "${sn}"`;
            if (!sd || typeof sd !== 'object' || Array.isArray(sd)) { E(`${where} must be an object.`); continue; }
            if (sd.health) Wn(`${where}: "health" can't be changed per state — use the comp action, or hurt/heal, instead.`);
            walk(sd.enter, `${where} enter`); checkGoto(sd.enter, `${where} enter`);
            walk(sd.exit, `${where} exit`); checkGoto(sd.exit, `${where} exit`);
            if (sd.rules != null) {
              if (!Array.isArray(sd.rules)) E(`${where} "rules" must be a list.`);
              else {
                rules(sd.rules, where);
                sd.rules.forEach((r, i) => {
                  if (!r || typeof r !== 'object') return;
                  checkGoto(r.do, `${where} rule ${i + 1}`); checkGoto(r.else, `${where} rule ${i + 1}`);
                  if (r.goto != null && !names.includes(String(r.goto))) E(`${where} rule ${i + 1}: goes to missing state "${r.goto}".`);
                });
              }
            }
          }
        }
      }
    }
    for (const [n, b] of Object.entries(B)) if (b.rules != null) { if (!Array.isArray(b.rules)) E(`Behavior "${n}" "rules" must be a list.`); else rules(b.rules, `Behavior "${n}"`); }
    for (const n of Array.isArray(m.singletons) ? m.singletons : []) if (!P[n]) E(`meta.singletons lists missing prefab "${n}".`);
    for (const [ch, t] of Object.entries(T)) {
      for (const key of ['break', 'hit']) {
        const b = t && t[key];
        if (!b || b === true || typeof b !== 'object') continue;
        lootRefs(b.drop, `Tile "${ch}" ${key}.drop`);
        fxRef(b.effect, `Tile "${ch}" ${key}.effect`); fxRef(b.hitEffect, `Tile "${ch}" ${key}.hitEffect`);
        if (b.become != null && b.become !== '.' && !isFormula(b.become) && !T[b.become]) Wn(`Tile "${ch}" ${key} becomes unknown tile "${b.become}".`);
      }
    }
    if (m.singletons != null && !Array.isArray(m.singletons)) { E('meta.singletons must be a list of prefab names.'); m.singletons = []; }

    // every "=formula" and every text condition must parse
    if (DC.Expr) {
      const seen = new Set();
      const checkF = (src, where) => {
        const msg = DC.Expr.check(src);
        if (msg && !seen.has(where + src)) { seen.add(where + src); E(`${where}: formula "${String(src).slice(0, 50)}" — ${msg}.`); }
      };
      const scan = (o, where, key) => {
        if (typeof o === 'string') {
          if (key === 'op') return;
          if (o.length > 1 && o[0] === '=' && o[1] !== '=') checkF(o, where);
          else if ((key === 'if' || key === 'when') && o.trim()) checkF(o, where);
          return;
        }
        if (Array.isArray(o)) { o.forEach((x) => scan(x, where, key)); return; }
        if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) scan(v, where, k);
      };
      scan(cart.rules, 'Global rules');
      scan(cart.hud, 'HUD');
      for (const [n, s] of Object.entries(SC)) { scan(s.rules, `Scene "${n}" rules`); scan(s.hud, `Scene "${n}" HUD`); }
      for (const [n, p] of Object.entries(P)) { const q = Object.assign({}, p); delete q.sprite; scan(q, `Prefab "${n}"`); }
      for (const [n, b] of Object.entries(B)) { const q = Object.assign({}, b); delete q.sprite; scan(q, `Behavior "${n}"`); }
      for (const [n, t] of Object.entries(T)) scan(t, `Tile "${n}"`);
    }
    return { errors, warns };
  };

  /* ------------------------------------------------------------------
     Pretty printer — keeps pixel rows vertical, small things inline
     ------------------------------------------------------------------ */
  DC.pretty = function (v) {
    const prim = (x) => x === null || typeof x !== 'object';
    const fmt = (x, ind) => {
      if (prim(x)) return JSON.stringify(x);
      const pad = '  '.repeat(ind + 1), end = '  '.repeat(ind);
      if (Array.isArray(x)) {
        if (!x.length) return '[]';
        const allNum = x.every((e) => e === null || typeof e === 'number' || typeof e === 'boolean');
        const shortStr = x.every((e) => typeof e === 'string' && e.length <= 14) && JSON.stringify(x).length < 64 && !(x.length >= 4 && x.every((e) => /^[0-9a-v.]+$/i.test(e) && e.length >= 4));
        const tinyArrs = x.every((e) => Array.isArray(e) && e.every((q) => typeof q === 'number')) && JSON.stringify(x).length < 64;
        if (allNum || shortStr || tinyArrs) return JSON.stringify(x).replace(/,/g, ', ');
        return '[\n' + x.map((e) => pad + fmt(e, ind + 1)).join(',\n') + '\n' + end + ']';
      }
      const keys = Object.keys(x);
      if (!keys.length) return '{}';
      const inline = JSON.stringify(x);
      if (inline.length < 72 && keys.every((k) => prim(x[k]) || (Array.isArray(x[k]) && x[k].every(prim) && JSON.stringify(x[k]).length < 40))) {
        return '{' + keys.map((k) => JSON.stringify(k) + ': ' + (prim(x[k]) ? JSON.stringify(x[k]) : JSON.stringify(x[k]).replace(/,/g, ', '))).join(', ') + '}';
      }
      return '{\n' + keys.map((k) => pad + JSON.stringify(k) + ': ' + fmt(x[k], ind + 1)).join(',\n') + '\n' + end + '}';
    };
    return fmt(v, 0);
  };

  /* ------------------------------------------------------------------
     Share links — deflate + base64url in the URL hash
     ------------------------------------------------------------------ */
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  DC.packCart = async function (cart) {
    const bytes = new TextEncoder().encode(JSON.stringify(cart));
    if (typeof CompressionStream !== 'undefined') {
      const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z' + b64u(new Uint8Array(await new Response(st).arrayBuffer()));
    }
    return 'r' + b64u(bytes);
  };
  DC.unpackCart = async function (str) {
    const bytes = unb64u(str.slice(1));
    if (str[0] === 'z') {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(st).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  /* ------------------------------------------------------------------
     Sprite frame builder (shared by engine and editors)
     ------------------------------------------------------------------ */
  DC.buildFrames = async function (cart, pal, base) {
    const frames = {};
    const rgb = pal.map(DC.hexRGB);
    const url = (src) => (/^(data:|blob:|https?:|\/)/.test(src) ? src : (base || 'assets/') + src);
    const jobs = [];
    const missing = () => {
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const g = c.getContext('2d');
      g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 4); g.fillRect(4, 4, 4, 4);
      return { src: c, sx: 0, sy: 0, w: 8, h: 8, dw: 16, dh: 16 };
    };
    /* one w x h slice of pixel-character rows -> a small canvas, ready to draw */
    const buildLayer = (rows, w, h, sc) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const row = (rows && rows[y]) || '';
        for (let x = 0; x < w; x++) {
          const ch = row[x];
          if (!ch) continue;
          const k = DC.PIXCHARS.indexOf(ch.toLowerCase());
          if (k < 0 || !rgb[k]) continue;
          const o = (y * w + x) * 4;
          img.data[o] = rgb[k][0]; img.data[o + 1] = rgb[k][1]; img.data[o + 2] = rgb[k][2]; img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return { src: c, sx: 0, sy: 0, w, h, dw: w * sc, dh: h * sc };
    };
    for (const [name, d] of Object.entries(cart.sprites || {})) {
      const sc = Math.max(0.25, +d.scale || 1);
      if (d.frames && d.stack) {
        /* sprite stacking: each frame is a stack of horizontal slices, bottom to top —
           draw them as a small totem to fake a rotatable voxel look from flat pixel art */
        const gap = (typeof d.stack === 'object' && d.stack.gap != null ? +d.stack.gap : 1) * sc;
        const w = d.w, h = d.h;
        frames[name] = d.frames.map((layerRows) => {
          const list = Array.isArray(layerRows) && Array.isArray(layerRows[0]) ? layerRows : [layerRows];
          const layers = list.map((rows) => buildLayer(rows, w, h, sc));
          const dw = w * sc, dh = h * sc + Math.max(0, layers.length - 1) * gap;
          return { stack: true, layers, gap, w, h, dw, dh };
        });
      } else if (d.frames) {
        frames[name] = d.frames.map((rows) => buildLayer(rows, d.w, d.h, sc));
      } else if (d.src) {
        jobs.push(new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            const fw = +d.w || im.height, fh = +d.h || im.height;
            const out = [];
            for (let y = 0; y + fh <= im.height; y += fh) for (let x = 0; x + fw <= im.width; x += fw) out.push({ src: im, sx: x, sy: y, w: fw, h: fh, dw: fw * sc, dh: fh * sc });
            frames[name] = out.length ? out : [{ src: im, sx: 0, sy: 0, w: im.width, h: im.height, dw: im.width * sc, dh: im.height * sc }];
            res();
          };
          im.onerror = () => { frames[name] = [missing()]; frames[name].missingSrc = url(d.src); res(); };
          im.src = url(d.src);
        }));
      }
    }
    await Promise.all(jobs);    await Promise.all(jobs);
    return frames;
  };

  /* Quantise an image to palette pixel rows (for sprite import) */
  DC.imageToRows = function (img, pal, fw, fh) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, img.width, img.height).data;
    const rgb = pal.slice(0, 32).map(DC.hexRGB);
    const frames = [];
    for (let oy = 0; oy + fh <= img.height; oy += fh) for (let ox = 0; ox + fw <= img.width; ox += fw) {
      const rows = [];
      for (let y = 0; y < fh; y++) {
        let r = '';
        for (let x = 0; x < fw; x++) {
          const o = ((oy + y) * img.width + ox + x) * 4;
          if (data[o + 3] < 128) { r += '.'; continue; }
          let best = 0, bd = 1e9;
          for (let k = 0; k < rgb.length; k++) {
            const dr = data[o] - rgb[k][0], dg = data[o + 1] - rgb[k][1], db = data[o + 2] - rgb[k][2];
            const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
            if (dd < bd) { bd = dd; best = k; }
          }
          r += DC.PIXCHARS[best];
        }
        rows.push(r);
      }
      frames.push(rows);
    }
    return frames;
  };
})();
