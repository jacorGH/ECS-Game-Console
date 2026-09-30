/* Studio code: the Code tab, laid out and behaving like v1's. The same JSON the visual editors work on, as text.
   Toolbar: Apply · ▶ Play · Find · A− A+ · More (Restart game, Clean up, Check, Export, Import).
   Module picker: the whole game, a settings section, or one scene / thing / level / sprite / tileset / track at a time,
   with + New, Rename (updates every reference) and Delete. Uses v1's editor component and forgiving JSON reader.
   Every Apply is one undo step; leaving the tab or switching module applies first (or stops you if it can't). */
(function () {
  'use strict';
  const DC = window.DC, DC2 = window.DC2, S = DC2.studio, F = DC2.forms, { el } = F, app = window.DC2_STUDIO;
  const $ = (s) => document.querySelector(s);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const pretty = (v) => JSON.stringify(v, null, 2);
  const SECTIONS = [['meta', 'Settings', 'title, size, start'], ['vars', 'Variables'], ['rules', 'Game rules'], ['palettes', 'Colours'], ['sounds', 'Sounds']];
  const GROUPS = [['scenes', 'Scenes', 'scene'], ['prefabs', 'Things', 'prefab'], ['maps', 'Levels', 'map'], ['sprites', 'Sprites', 'sprite'], ['tilesets', 'Tilesets', 'tileset'], ['music', 'Music', null]];
  const NAMES = Object.fromEntries([...SECTIONS.map(([k, l]) => [k, l]), ...GROUPS.map(([k, l]) => [k, l.replace(/s$/, '')])]);
  const label = (p) => (!p.length ? 'Whole game' : p.length === 1 ? NAMES[p[0]] || p[0] : `${NAMES[p[0]] || p[0]} › ${p[1]}`);
  const kindOf = (p) => (p.length === 1 && p[0] === 'rules' ? 'arr' : 'obj');

  /* forgiving parse (v1's scrubJSON); a module is wrapped so lists and objects both work. */
  function parse(text, p) {
    if (!DC || !DC.scrubJSON) { try { return { ok: true, data: JSON.parse(text), fixes: [] }; } catch (e) { return { ok: false, error: e.message }; } }
    const r = p.length ? DC.scrubJSON('{"_":' + text + '\n}') : DC.scrubJSON(text);
    if (!r.ok) {
      const m = /line (\d+), column (\d+)/.exec(r.error || '');
      const msg = String(r.error).split('\n')[0].replace(/^JSON error( on line \d+, column \d+)?:\s*/, '').replace(/\s*in JSON at position.*$/, '').replace(/\s*\(line \d+ column \d+\)$/, '');
      return { ok: false, error: m ? `column ${m[2]}: ${msg}` : msg, line: m ? +m[1] : 0, col: m ? +m[2] : 0, fixes: r.fixes || [] };
    }
    const v = p.length ? r.data._ : r.data, k = kindOf(p);
    if (k === 'arr' && !Array.isArray(v)) return { ok: false, error: `${label(p)} must be a list: [ ... ]`, fixes: r.fixes };
    if (k === 'obj' && !isObj(v)) return { ok: false, error: `${label(p)} must be an object: { ... }`, fixes: r.fixes };
    return { ok: true, data: v, fixes: r.fixes || [] };
  }
  /* the module holding a validation path, and the key to search for inside it */
  function moduleOf(cart, path) {
    const segs = String(path).replace(/\[\d+\]/g, '').split('.').filter(Boolean);
    if (GROUPS.some(([g]) => g === segs[0]) && segs[1] && isObj(cart[segs[0]]) && segs[1] in cart[segs[0]]) return { mod: [segs[0], segs[1]], find: segs[2] };
    if (SECTIONS.some(([k]) => k === segs[0])) return { mod: [segs[0]], find: segs[1] };
    return { mod: [], find: segs[segs.length - 1] };
  }

  Object.assign(app, {
    code: { mod: [], dirty: false, shown: null },
    modGet(p) { const c = this.doc.cart; if (!p.length) return c; const g = c[p[0]]; return p.length === 1 ? (g === undefined ? (kindOf(p) === 'arr' ? [] : {}) : g) : g && g[p[1]]; },
    renderCode() {
      const c = this.code;
      if (!this.ce) {
        const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
        let font = coarse ? 15 : 14; try { font = +localStorage.getItem('dc2.codeFont') || font; } catch (e) { /* private mode */ }
        this.ce = new DC.CodeEditor($('#codeEditor'), { font, palette: () => { const p = this.doc && this.doc.cart.palettes; return (p && p[Object.keys(p)[0]]) || DC.PALETTE; },
          onChange: () => { c.dirty = true; }, onSave: () => this.applyCode(), onRun: () => this.runCode() });
        $('#codeApply').onclick = () => this.applyCode();
        $('#codeRun').onclick = () => this.runCode();
        $('#codeFind').onclick = () => this.ce.openFind();
        const zoom = (d) => { this.ce.setFont(this.ce.font + d); try { localStorage.setItem('dc2.codeFont', this.ce.font); } catch (e) { /* ignore */ } };
        $('#codeFontUp').onclick = () => zoom(1); $('#codeFontDown').onclick = () => zoom(-1);
        const more = $('#codeMore'), closeMore = () => { more.hidden = true; $('#codeMoreBtn').setAttribute('aria-expanded', 'false'); };
        $('#codeMoreBtn').onclick = (e) => { e.stopPropagation(); more.hidden = !more.hidden; $('#codeMoreBtn').setAttribute('aria-expanded', String(!more.hidden)); };
        document.addEventListener('click', (e) => { if (!more.hidden && !e.target.closest('.more')) closeMore(); });
        $('#codeRestart').onclick = () => { closeMore(); if (this.applyCode(true)) { this.playing = false; this.setTab('play'); this.startPlay && this.startPlay(); } };
        $('#codeTidy').onclick = () => { closeMore(); this.tidyCode(); };
        $('#codeCheck').onclick = () => { closeMore(); if (!this.applyCode(true)) return; const r = S.check(this.doc.cart); this.codeReport(r.errors, r.warnings, r.errors.length + r.warnings.length ? [] : ['No problems found']); };
        $('#codeExport').onclick = async () => { closeMore(); if (!this.applyCode(true)) return; await this.saver.flush(); const a = el('a', { href: URL.createObjectURL(new Blob([pretty(this.doc.cart)], { type: 'application/json' })), download: S.slug(this.meta.name) + '.json' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
        $('#codeImport').onchange = async (e) => { closeMore(); const f = e.target.files[0]; e.target.value = ''; if (f) this.importIntoCode(f); };
        $('#codeModBtn').onclick = () => ($('#codeModPanel').hidden ? this.openModPanel() : this.closeModPanel());
        $('#codeModRename').onclick = () => this.renameModule();
        $('#codeModDelete').onclick = () => this.deleteModule();
        $('#codeReport').onclick = (e) => {
          const li = e.target.closest('li.jump'); if (!li) return;
          if (li.dataset.line) return this.ce.gotoLine(+li.dataset.line, +li.dataset.col || 1);
          const m = JSON.parse(li.dataset.mod); if (!this.openModule(m)) return; if (li.dataset.find) this.ce.find(li.dataset.find);
        };
      }
      if (c.shown !== this.meta.id) { c.mod = []; c.dirty = false; $('#codeReport').replaceChildren(); }
      if (!c.dirty) this.writeCode(); else this.modBar();
    },
    modBar() { const p = this.code.mod; $('#codeModLabel').textContent = label(p); $('#codeModRename').hidden = $('#codeModDelete').hidden = p.length !== 2; },
    /* show the module's JSON, unless the editor already says the same thing (keeps the caret where it is) */
    writeCode(force) {
      const c = this.code;
      if (c.mod.length === 2 && !(isObj(this.doc.cart[c.mod[0]]) && c.mod[1] in this.doc.cart[c.mod[0]])) c.mod = [];
      const v = this.modGet(c.mod);
      if (!force && c.shown === this.meta.id && c.showMod === JSON.stringify(c.mod)) { const p = parse(this.ce.value, c.mod); if (p.ok && S.canonical(p.data) === S.canonical(v)) { this.modBar(); return; } }
      this.ce.value = pretty(v); c.dirty = false; c.shown = this.meta.id; c.showMod = JSON.stringify(c.mod); this.modBar();
    },
    codeReport(errors, warns, fixes) {
      const box = $('#codeReport'), ul = el('ul');
      const item = (cls, x) => {
        if (typeof x === 'string') return el('li', { class: cls }, x);
        if (x.line) return el('li', { class: cls + ' jump', 'data-line': x.line, 'data-col': x.col || 1 }, `Line ${x.line}: ${x.msg || x.error}`);
        const m = moduleOf(this.doc.cart, x.path);
        return el('li', { class: cls + ' jump', 'data-mod': JSON.stringify(m.mod), 'data-find': m.find ? JSON.stringify(m.find) : '' }, `${x.path}: ${x.msg}`);
      };
      for (const e of errors || []) ul.append(item('err', e));
      for (const w of warns || []) ul.append(item('warn', w));
      for (const f of fixes || []) ul.append(item('fix', f));
      box.replaceChildren(...(ul.children.length ? [ul] : []));
    },
    /* parse → put it into the project (one undo step). quiet: no success message. false if it can't be read. */
    applyCode(quiet) {
      const c = this.code;
      if (!c.dirty) { if (!quiet) this.codeReport([], [], ['Nothing changed']); return true; }
      const p = parse(this.ce.value, c.mod);
      if (!p.ok) { this.codeReport([p.line ? { line: p.line, col: p.col, msg: p.error } : p.error], [], p.fixes); if (p.line) this.ce.gotoLine(p.line, p.col); return false; }
      const cart = this.doc.cart, v = p.data, m = c.mod;
      this.doc.transact('Edit code', () => {
        if (!m.length) {
          for (const key of new Set([...Object.keys(cart), ...Object.keys(v)])) {
            if (!(key in v)) this.doc.del([key]);
            else if (S.canonical(cart[key]) !== S.canonical(v[key])) this.doc.set([key], v[key]);
          }
        } else if (m.length === 1) { if (S.canonical(cart[m[0]]) !== S.canonical(v)) this.doc.set([m[0]], v); }
        else { if (!isObj(cart[m[0]])) this.doc.set([m[0]], {}); if (S.canonical(cart[m[0]][m[1]]) !== S.canonical(v)) this.doc.set([m[0], m[1]], v); }
      });
      c.dirty = false; if (quiet) $('#codeReport').replaceChildren();   // an old error no longer applies
      if (this.sprites) this.sprites.invalidate();
      this.report = S.check(this.doc.cart); this.updateBar();
      this.writeCode(true);
      if (!quiet) {
        const inMod = (i) => !m.length || moduleOf(this.doc.cart, i.path).mod.join('.') === m.join('.');
        const er = this.report.errors.filter(inMod), wr = this.report.warnings.filter(inMod);
        this.codeReport(er, wr, [...(p.fixes.length ? ['Cleaned up: ' + p.fixes.join(', ').toLowerCase()] : []), er.length ? 'Applied (undo with ↶)' : 'Applied']);
      }
      return true;
    },
    runCode() { if (!this.applyCode(true)) { this.toast('Fix the JSON error before playing.'); return; } this.playing = false; this.setTab('play'); },
    tidyCode() { const p = parse(this.ce.value, this.code.mod); if (!p.ok) { this.codeReport([p.line ? { line: p.line, col: p.col, msg: p.error } : p.error], [], p.fixes); return; } this.ce.value = pretty(p.data); this.code.dirty = true; this.codeReport([], [], p.fixes.length ? ['Cleaned up: ' + p.fixes.join(', ').toLowerCase()] : ['Formatted']); },
    openModule(m) {
      if (!this.applyCode(true)) { this.toast('Fix the JSON error in this module first.'); return false; }
      this.code.mod = m; this.writeCode(true); this.closeModPanel(); $('#codeReport').replaceChildren(); return true;
    },
    openModPanel() {
      const cart = this.doc.cart, cur = JSON.stringify(this.code.mod), count = (o) => (Array.isArray(o) ? o.length : isObj(o) ? Object.keys(o).length : 0);
      const row = (p, lab, sub) => el('button', { type: 'button', class: 'modrow' + (JSON.stringify(p) === cur ? ' on' : ''), 'data-mod': JSON.stringify(p), onclick: () => this.openModule(p) }, el('span', null, lab), sub ? el('small', null, sub) : null);
      const panel = $('#codeModPanel'); panel.replaceChildren(el('div', { class: 'modgroup' }, row([], 'Whole game', 'everything in one file')));
      panel.append(el('div', { class: 'modgroup' }, el('h4', null, 'Settings'), el('div', { class: 'modgrid' }, ...SECTIONS.map(([k, l, sub]) => row([k], l, sub || `${count(cart[k])} ${k === 'rules' ? 'rules' : k === 'palettes' ? 'palettes' : 'items'}`)))));
      for (const [g, lab] of GROUPS) {
        const names = Object.keys(cart[g] || {});
        panel.append(el('div', { class: 'modgroup' }, el('h4', null, lab, el('span', { class: 'n' }, String(names.length)), g === 'maps' || g === 'tilesets' ? null : el('button', { type: 'button', class: 'addmod', 'data-new': g, onclick: () => this.newModule(g) }, '+ New')),
          el('div', { class: 'modgrid' }, ...names.map((n) => row([g, n], n)))));
      }
      panel.hidden = false; $('#codeModBtn').setAttribute('aria-expanded', 'true');
    },
    closeModPanel() { $('#codeModPanel').hidden = true; $('#codeModBtn').setAttribute('aria-expanded', 'false'); },
    async newModule(g) {
      if (!this.applyCode(true)) return this.toast('Fix the JSON error in this module first.');
      const single = { scenes: 'scene', prefabs: 'thing', sprites: 'sprite', music: 'track' }[g], cart = this.doc.cart;
      const name = await this.askText(`Name for the new ${single}`, single + (Object.keys(cart[g] || {}).length + 1), 'Create'); if (!name) return;
      const id = S.slug(name, cart[g] || {}), pal = Object.keys(cart.palettes || {})[0] || 'main';
      const blank = { scenes: { hud: [] }, prefabs: { tags: [], c: { pos: {} } }, sprites: { w: 16, h: 16, palette: pal, frames: [Array(16).fill('.'.repeat(16)).join('/')], anims: { idle: { f: [0], fps: 1 } } }, music: { bpm: 120, div: 2, tracks: [{ wave: 'square', v: 0.07, notes: 'C5 - E5 G5 E5 - C5 .' }] } }[g];
      this.doc.transact('New ' + single, () => { if (!isObj(cart[g])) this.doc.set([g], {}); this.doc.set([g, id], blank); });
      this.code.mod = [g, id]; this.writeCode(true); this.closeModPanel();
    },
    async renameModule() {
      const [g, old] = this.code.mod; if (!this.applyCode(true)) return this.toast('Fix the JSON error first.');
      const nu = await this.askText(`Rename “${old}” to`, old, 'Rename'); if (!nu || nu === old) return;
      const id = S.slug(nu), kind = (GROUPS.find(([k]) => k === g) || [])[2];
      if (this.doc.cart[g][id]) return this.toast(`“${id}” already exists.`);
      try {
        if (kind) S.renameAsset(this.doc, kind, old, id);
        else this.doc.transact('Rename', () => { this.doc.set([g, id], S.clone(this.doc.cart[g][old])); this.doc.del([g, old]); for (const [sn, sc] of Object.entries(this.doc.cart.scenes || {})) if (sc.music === old) this.doc.set(['scenes', sn, 'music'], id); });
      } catch (e) { return this.toast(e.message); }
      this.code.mod = [g, id]; this.writeCode(true); this.toast('Renamed — references were updated too.');
    },
    async deleteModule() {
      const [g, name] = this.code.mod, kind = (GROUPS.find(([k]) => k === g) || [])[2];
      if (!await this.confirm(`Delete “${name}” from ${NAMES[g] ? NAMES[g].toLowerCase() + 's' : g}? Anything that uses it will show a problem until you fix it. You can undo this.`, 'Delete', true)) return;
      if (kind && S.deleteAsset) S.deleteAsset(this.doc, kind, name); else this.doc.del([g, name]);
      this.code.dirty = false; this.code.mod = []; this.writeCode(true); this.toast(`Deleted “${name}”.`);
    },
    /* Import (More menu): replaces this project's game with a file — v1 carts are converted — as one undoable step */
    async importIntoCode(file) {
      const text = await file.text(); let data = null, fixes = [];
      try { data = JSON.parse(text); } catch (e) { const r = DC.scrubJSON(text); if (!r.ok) { this.code.mod = []; this.ce.value = text; this.code.dirty = true; this.modBar(); return this.codeReport([r.error], [], r.fixes); } data = r.data; fixes = r.fixes; }
      if (data && data.dcart === 1) { try { data = S.fromDcart(text).cart || S.fromDcart(text); } catch (e) { return this.codeReport([e.message]); } }
      let notes = [];
      if (S.v1 && S.v1.isV1(data)) { const r = S.v1.convert(data); data = r.cart; notes = r.notes; }
      if (!isObj(data) || data.format !== 'DCART-2') return this.codeReport([`${file.name} isn't a Data Console game.`]);
      if (!await this.confirm(`Replace this project's game with “${file.name}”? You can undo this.`, 'Replace')) return;
      const cart = this.doc.cart;
      this.doc.transact('Import ' + file.name, () => { for (const k of new Set([...Object.keys(cart), ...Object.keys(data)])) { if (!(k in data)) this.doc.del([k]); else this.doc.set([k], data[k]); } });
      this.code.mod = []; this.code.dirty = false; this.writeCode(true);
      this.report = S.check(this.doc.cart); this.updateBar();
      this.codeReport(this.report.errors, this.report.warnings, ['Imported ' + file.name, ...fixes.map((f) => 'Cleaned up: ' + f), ...notes.map((n) => `From v1 — ${n.where}: ${n.what}`)]);
    },
    /* called by setTab before leaving the Code tab: apply, or stay if the JSON is broken */
    leaveCode() { if (!this.code.dirty) return true; if (this.applyCode(true)) { this.toast('Code applied.'); return true; } this.toast('Fix the mistake in the code first (or undo it).'); return false; },
  });
  app.codeParse = parse; app.codeModuleOf = moduleOf;
})();
