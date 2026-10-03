/* Studio forms: draws descriptors from studio/core.js as touch-friendly widgets.
   One renderer serves every component, trigger and action — including ones from extensions written later. */
(function () {
  'use strict';
  const DC2 = window.DC2, S = DC2.studio, F = (DC2.forms = {});
  const el = (tag, a, ...kids) => {
    const e = document.createElement(tag);
    for (const k in a || {}) {
      const v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e[k] = v; else if (k === 'value') e.value = v; else if (k === 'selected') e.selected = true;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  };
  const btn = (label, fn, cls, title) => el('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: fn, title, 'aria-label': title }, label);
  F.el = el; F.btn = btn;
  const cx = (ctx) => ({ cart: ctx.doc.cart, reg: ctx.reg });
  const coerce = (t) => (/^-?\d+(\.\d+)?$/.test(t.trim()) ? Number(t) : t.trim() === 'true' ? true : t.trim() === 'false' ? false : t);

  /* ---- one field, any kind */
  F.field = (ctx, d, value, path, opt) => {
    opt = opt || {};
    const w = el('div', { class: `f f-${d.kind}`, 'data-path': S.pathStr(path) });
    const set = (v) => ctx.edit(() => ctx.doc.set(path, v, { coalesce: true }));
    const unset = () => ctx.edit(() => ctx.doc.del(path));
    let body, inline = false;
    switch (d.kind) {
      case 'number': case 'int': {
        const isInt = d.kind === 'int';
        const inp = el('input', { type: 'number', inputmode: isInt ? 'numeric' : 'decimal', step: isInt ? '1' : 'any', placeholder: d.default !== undefined ? String(d.default) : '' });
        if (value !== undefined && value !== null) inp.value = value;
        const clampN = (n) => { if (d.min != null) n = Math.max(d.min, n); if (d.max != null) n = Math.min(d.max, n); return n; };
        const commit = () => { if (inp.value === '') { if (d.optional || d.default !== undefined) unset(); return; } let n = Number(inp.value); if (!isFinite(n)) return; if (isInt) n = Math.round(n); set(clampN(n)); };
        inp.oninput = commit;
        const step = (dir) => { const c = inp.value === '' ? (d.default !== undefined ? d.default : 0) : Number(inp.value), a = Math.abs(c), st = isInt ? 1 : a >= 10 ? 5 : a >= 1 ? 1 : 0.1; inp.value = clampN(Math.round((c + dir * st) * 1000) / 1000); commit(); };
        body = el('div', { class: 'num' }, btn('−', () => step(-1), 'sq', 'less'), inp, btn('+', () => step(1), 'sq', 'more')); break;
      }
      case 'bool': {
        const on = value === undefined ? !!d.default : !!value;
        const b = el('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': d.label });
        b.onclick = () => { const n = !b.classList.contains('on'); b.classList.toggle('on', n); b.setAttribute('aria-checked', String(n)); set(n); };
        body = b; inline = true; break;
      }
      case 'text': {
        const inp = el('input', { type: 'text', value: value == null ? '' : value, placeholder: d.default !== undefined ? String(d.default) : '', autocomplete: 'off' });
        inp.oninput = () => { if (inp.value === '' && (d.optional || d.default !== undefined)) unset(); else set(inp.value); };
        body = inp;
        const par = ctx.doc ? S.getIn(ctx.doc.cart, path.slice(0, -1)) || {} : {};
        if (ctx.doc && (d.key === 'anim' || (par.act === 'anim' && d.key === 'name'))) {   // animation names: pick from a list, never type them
          const groups = S.animChoices(ctx.doc.cart, ctx.prefabId, par), all = groups.flatMap((g) => g.names);
          if (all.length) {
            const opt = (k) => el('option', { value: k, selected: k === value }, k);
            const sel = el('select', { 'data-anim': path.join('.') }, el('option', { value: '' }, d.required ? '(pick an animation)' : `(default: ${all[0]})`),
              ...(groups.length === 1 ? groups[0].names.map(opt) : groups.map((g) => el('optgroup', { label: g.sprite }, ...g.names.map(opt)))));
            if (value && !all.includes(value)) sel.append(el('option', { value, selected: true }, value + ' (missing!)'));
            sel.onchange = () => (sel.value === '' ? unset() : set(sel.value)); body = sel;
          }
        }
        if (ctx.doc && (d.key === 'with' || (d.key === 'tag' && par.on))) {   // a tag: pick from the ones that exist (on things and on tiles), or type a new one
          const pickTag = btn('＋', () => {
            const T = S.allTags(ctx.doc.cart), items = [];
            for (const t of T.things) items.push({ id: t.tag, title: t.tag, group: 'Tags on things', doc: t.by.slice(0, 3).join(', ') + (t.by.length > 3 ? ` +${t.by.length - 3}` : '') });
            for (const t of T.tiles) items.push({ id: t.tag, title: t.tag, group: 'Tags on tiles', doc: t.by.slice(0, 3).map((x) => x.name).join(', ') + (t.by.length > 3 ? ` +${t.by.length - 3}` : ''), thumb: t.by[0].sprite });
            ctx.pick({ title: 'Pick a tag', items, head: items.length ? null : el('div', { class: 'f-doc' }, 'No tags yet. Give a thing tags in its settings, or a tile tags in Tile settings, then they show up here.'), onPick: (id) => { inp.value = id; inp.oninput(); inp.focus(); } });
          }, 'sq', 'pick a tag');
          body = el('div', { class: 'exprrow' }, inp, pickTag);
        }
        break;
      }
      case 'enum': {
        const sel = el('select', null, d.optional ? el('option', { value: '' }, '(none)') : null, d.options.map((o) => el('option', { value: o, selected: o === (value === undefined ? d.default : value) }, S.humanize(o))));
        if (value === undefined && d.optional) sel.value = '';
        sel.onchange = () => (sel.value === '' ? unset() : set(sel.value)); body = sel; break;
      }
      case 'ref': if (d.to === 'sprite' && ctx.sprites) {
        /* pictures: tap to choose from thumbnails, instead of reading names in a dropdown */
        const cart = ctx.doc.cart, has = value && cart.sprites[value], b = el('button', { type: 'button', class: 'spritepick' + (value && !has ? ' missing' : ''), 'data-spritepick': path.join('.') },
          has ? ctx.sprites.thumb(value, 36) : el('span', { class: 'ph' }, '?'), el('b', null, value ? value + (has ? '' : ' (missing!)') : '(none)'), el('span', { class: 'chev' }, 'Change ▾'));
        b.onclick = () => {
          const tiles = S.tileSpriteIds(cart), items = [];
          if (d.optional) items.push({ id: '', title: '(none)', group: '' });
          for (const id of Object.keys(cart.sprites)) if (!tiles.has(id)) items.push({ id, title: id, group: 'Sprites', thumb: id, doc: `${cart.sprites[id].w}×${cart.sprites[id].h}` + (cart.sprites[id].frames.length > 1 ? ` · ${cart.sprites[id].frames.length} frames` : '') });
          for (const id of tiles) if (cart.sprites[id]) items.push({ id, title: id, group: 'Tiles', thumb: id });
          /* a real (not quiet) change, so the panel redraws: new thumbnail and name, and animation lists for the new picture */
          ctx.pick({ title: 'Pick a picture', items, onPick: (id) => {
            const par = S.getIn(ctx.doc.cart, path.slice(0, -1)) || {}, an = id && ctx.doc.cart.sprites[id] && ctx.doc.cart.sprites[id].anims;
            ctx.doc.transact('Change picture', () => {
              if (id === '') ctx.doc.del(path); else ctx.doc.set(path, id);
              if (typeof par.anim === 'string' && par.anim && !(an && an[par.anim])) ctx.doc.del(path.slice(0, -1).concat('anim'));   // that animation isn't in the new picture
            });
          } });
        };
        body = b; break;
      } else {
        const opts = d.options, sel = el('select', null, (d.optional || !opts.length) ? el('option', { value: '' }, opts.length ? '(none)' : '(nothing to pick yet)') : null, opts.map((o) => el('option', { value: o, selected: o === value }, o)));
        if (value && !opts.includes(value)) sel.append(el('option', { value, selected: true }, value + ' (missing!)'));
        const thumb = el('span', { class: 'thumb' });
        const paint = () => { thumb.replaceChildren(); if (d.to === 'sprite' && sel.value && ctx.sprites) thumb.append(ctx.sprites.thumb(sel.value, 28)); };
        sel.onchange = () => { if (sel.value === '') unset(); else set(sel.value); paint(); }; paint();
        body = el('div', { class: 'refrow' }, thumb, sel); break;
      }
      case 'expr': case 'path': {
        const inp = el('input', { type: 'text', class: 'mono', value: value === undefined || value === null ? '' : String(value), autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: d.kind === 'path' ? 'variable' : (d.default !== undefined ? String(d.default) : 'value or formula') });
        inp.oninput = () => { if (inp.value === '' && d.optional) unset(); else set(d.kind === 'expr' ? coerce(inp.value) : inp.value); };
        const pickBtn = btn('＋', () => {
          /* what is this value for? a "to"/"by" next to a "path" is the value that path gets, so offer its choices first */
          const cart = ctx.doc.cart, parent = S.getIn(cart, path.slice(0, -1)), key = path[path.length - 1];
          const target = parent && typeof parent.path === 'string' && (key === 'to' || key === 'by') ? S.pathSpec(cart, ctx.reg, ctx.prefabId, parent.path) : null;
          const items = S.pickItems(cart, ctx.reg, { prefabId: ctx.prefabId, kind: d.kind, target });
          let append = false; const cur = inp.value.trim();
          const head = d.kind === 'expr' && cur ? el('div', { class: 'seg pickmode' },
            el('button', { type: 'button', class: 'on', onclick: (e) => { append = false; e.target.classList.add('on'); e.target.nextSibling.classList.remove('on'); } }, 'Replace “' + (cur.length > 18 ? cur.slice(0, 17) + '…' : cur) + '”'),
            el('button', { type: 'button', onclick: (e) => { append = true; e.target.classList.add('on'); e.target.previousSibling.classList.remove('on'); } }, 'Add to the end')) : null;
          ctx.pick({ title: d.kind === 'path' ? 'Pick what to change' : 'Pick a value', items, head, onPick: (id) => { inp.value = append ? inp.value.replace(/\s*$/, ' ') + id : id; inp.oninput(); inp.focus(); } });
        }, 'sq', 'pick a value');
        body = el('div', { class: 'exprrow' }, inp, pickBtn); break;
      }
      case 'list': {
        const arr = Array.isArray(value) ? value : [], box = el('div', { class: 'list' });
        arr.forEach((v, i) => box.append(el('div', { class: 'list-row' }, F.field(ctx, d.of, v, path.concat(i), { label: '#' + (i + 1) }),
          el('div', { class: 'row-ctl' }, i > 0 ? btn('▲', () => ctx.doc.move(path, i, i - 1), 'sq', 'move up') : null, i < arr.length - 1 ? btn('▼', () => ctx.doc.move(path, i, i + 1), 'sq', 'move down') : null, btn('✕', () => ctx.doc.remove(path, i), 'sq danger', 'remove')))));
        box.append(btn('＋ Add', () => ctx.doc.insert(path, null, S.blankValue(d.of, cx(ctx))), 'add'));
        body = box; break;
      }
      case 'object': {
        const box = el('div', { class: 'obj' });
        for (const f of d.fields) box.append(F.field(ctx, f, value ? value[f.key] : undefined, path.concat(f.key)));
        body = box; break;
      }
      case 'actions': body = F.actionsEditor(ctx, value, path); break;
      case 'lines': body = F.linesEditor(ctx, value, path); break;
      default: {
        const ta = el('textarea', { class: 'mono', rows: '4', spellcheck: 'false' }, value === undefined ? '' : JSON.stringify(value, null, 1)), err = el('div', { class: 'f-err' });
        ta.oninput = () => { try { const v = JSON.parse(ta.value); err.textContent = ''; set(v); } catch (e) { err.textContent = 'Not valid JSON yet: ' + e.message; } };
        body = el('div', null, ta, err);
      }
    }
    const label = opt.label || d.label;
    if (opt.bare) w.append(body); else if (inline) w.append(el('label', { class: 'f-inline' }, el('span', { class: 'f-label' }, label), body)); else w.append(el('div', { class: 'f-label' }, label), body);
    if (d.doc && !opt.bare) w.append(el('div', { class: 'f-doc' }, d.doc));
    w.append(el('div', { class: 'f-issues' }));
    return w;
  };
  /* show validator messages next to the fields they are about */
  F.paintIssues = (root, report) => {
    const by = new Map();
    for (const e of report.errors) (by.get(e.path) || by.set(e.path, []).get(e.path)).push({ level: 'error', msg: e.msg });
    for (const e of report.warnings) (by.get(e.path) || by.set(e.path, []).get(e.path)).push({ level: 'warn', msg: e.msg });
    root.querySelectorAll('[data-path]').forEach((n) => {
      const box = n.querySelector(':scope > .f-issues, :scope > .card-issues'); if (!box) return;
      const list = by.get(n.getAttribute('data-path')) || [];
      box.replaceChildren(...list.map((x) => el('div', { class: 'issue ' + x.level }, (x.level === 'error' ? '⚠ ' : 'ⓘ ') + x.msg)));
      n.classList.toggle('has-issue', list.length > 0);
    });
  };

  /* ---- copy / cut / paste of rules and Do statements (the clipboard itself is in clip.js) */
  const clipOf = (kind) => { const c = S.clip.get(); return c && c.kind === kind ? c : null; };
  const doPaste = (ctx, c, path, index, owner) => {
    const err = c.kind === 'rule' ? S.clip.checkRules(c.items, owner, ctx.reg) : S.clip.checkActions(c.items, ctx.reg);
    if (err) { ctx.toast(err); return false; }
    const at = S.clip.paste(ctx.doc, ctx.reg, path, index, c), bad = S.clip.problems(ctx.doc.cart, path, at, c.items.length);
    ctx.toast(`Pasted ${S.clip.describe(c)}.` + (bad ? ` ${bad === 1 ? 'One thing in it points' : bad + ' things in it point'} to something this project doesn't have yet (marked in red).` : ''));
    return true;
  };
  /* paste JSON from anywhere: another project, a note, a chat answer */
  const pasteText = (ctx, kind, path, index, owner) => {
    const s = ctx.sheet({ title: kind === 'rule' ? 'Paste a rule' : 'Paste a Do statement', render: (body) => {
      const ta = el('textarea', { class: 'clip-text', rows: 8, spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'pasted text', placeholder: kind === 'rule' ? '{ "on": "button", "button": "a", "then": [ { "act": "sound", "id": "coin" } ] }' : '{ "act": "sound", "id": "coin" }' });
      body.append(el('div', { class: 'f-doc' }, kind === 'rule' ? 'Paste a rule here as text: one you copied, one from another project, or one from a chat.' : 'Paste a Do statement here as text.'), ta,
        el('div', { class: 'row-end' }, btn('Paste', () => {
          const r = S.clip.parse(ta.value);
          if (r.error) return ctx.toast(r.error);
          if (r.kind !== (kind === 'rule' ? 'rule' : 'actions')) return ctx.toast(r.kind === 'rule' ? 'That is a whole rule. Paste it into a list of rules instead.' : 'That is a Do statement. Paste it into a “Then” list instead.');
          if (doPaste(ctx, r, path, index, owner)) ctx.closeSheet(s);
        }, 'primary')));
    } });
  };
  const pasteBtn = (ctx, kind, path, owner) => {
    const c = clipOf(kind);
    return btn(c ? `📋 Paste ${S.clip.describe(c)}` : '📋 Paste from text…', () => (c ? doPaste(ctx, c, path, null, owner) : pasteText(ctx, kind, path, null, owner)), 'add');
  };
  const copyOut = (ctx, kind, items, what) => { try { S.clip.set(kind, items); ctx.toast(`Copied ${what}. Paste it anywhere.`); return true; } catch (e) { ctx.toast(e.message); return false; } };
  const actionMenu = (ctx, a, listPath, i, n) => {
    const ac = clipOf('actions'), list = S.getIn(ctx.doc.cart, listPath) || [], items = [
      { id: 'copy', title: 'Copy this', doc: 'Then paste it into any rule, here or elsewhere' }, { id: 'cut', title: 'Cut this', doc: 'Copy it and take it out of here' },
    ];
    if (ac) items.push({ id: 'paste', title: `Paste ${S.clip.describe(ac)} below`, doc: 'Puts it right after this one' });
    items.push({ id: 'dup', title: 'Duplicate', doc: 'A second copy right below' });
    if (n > 1) items.push({ id: 'all', title: `Copy all ${n} in this list`, doc: 'Every Do statement in this “Then”' });
    items.push({ id: 'text', title: 'Paste from text…', doc: 'JSON from another project or a chat' }, { id: 'del', title: 'Delete', doc: 'Remove this one' });
    ctx.pick({ title: 'Do: ' + S.humanize(a.act || '?'), items, onPick: (id) => {
      if (id === 'copy') copyOut(ctx, 'actions', [a], 'the action');
      else if (id === 'cut') { if (copyOut(ctx, 'actions', [a], 'the action')) ctx.doc.remove(listPath, i, 'Cut action'); }
      else if (id === 'paste') doPaste(ctx, ac, listPath, i + 1);
      else if (id === 'dup') ctx.doc.insert(listPath, i + 1, S.clone(a), 'Duplicate action');
      else if (id === 'all') copyOut(ctx, 'actions', list, `all ${n} actions`);
      else if (id === 'text') pasteText(ctx, 'actions', listPath, i + 1);
      else if (id === 'del') ctx.doc.remove(listPath, i);
    } });
  };
  const ruleMenu = (ctx, r, path, listPath, i, owner) => {
    const rc = clipOf('rule'), ac = clipOf('actions'), then = Array.isArray(r.then) ? r.then : [], items = [
      { id: 'copy', title: 'Copy this rule', doc: 'Then paste it onto any thing or level, or into another project' }, { id: 'cut', title: 'Cut this rule', doc: 'Copy it and take it out of here' },
    ];
    if (rc) items.push({ id: 'paste', title: `Paste ${S.clip.describe(rc)} below`, doc: 'Puts it right after this rule' });
    items.push({ id: 'dup', title: 'Duplicate', doc: 'A second copy right below' });
    if (then.length) items.push({ id: 'copyThen', title: `Copy its ${then.length === 1 ? 'Do statement' : then.length + ' Do statements'}`, doc: 'Just the “Then” part, to paste into another rule' });
    if (ac) items.push({ id: 'pasteThen', title: `Paste ${S.clip.describe(ac)} at the end of “Then”`, doc: 'Adds to this rule' });
    items.push({ id: 'text', title: 'Paste a rule from text…', doc: 'JSON from another project or a chat' }, { id: 'del', title: 'Delete this rule', doc: 'Remove it' });
    ctx.pick({ title: 'Rule: ' + S.humanize(r.on || '?'), items, onPick: (id) => {
      if (id === 'copy') copyOut(ctx, 'rule', [r], 'the rule');
      else if (id === 'cut') { if (copyOut(ctx, 'rule', [r], 'the rule')) ctx.doc.remove(listPath, i, 'Cut rule'); }
      else if (id === 'paste') doPaste(ctx, rc, listPath, i + 1, owner);
      else if (id === 'dup') ctx.doc.insert(listPath, i + 1, S.clone(r), 'Duplicate rule');
      else if (id === 'copyThen') copyOut(ctx, 'actions', then, then.length === 1 ? 'the action' : `${then.length} actions`);
      else if (id === 'pasteThen') doPaste(ctx, ac, path.concat('then'), null);
      else if (id === 'text') pasteText(ctx, 'rule', listPath, i + 1, owner);
      else if (id === 'del') ctx.doc.remove(listPath, i);
    } });
  };

  /* ---- actions: a list of cards */
  const groupOf = (def) => S.humanize(def.ext || 'core');
  F.actionsEditor = (ctx, actions, path, opt) => {
    opt = opt || {};
    const list = Array.isArray(actions) ? actions : [], box = el('div', { class: 'actions' });
    list.forEach((a, i) => box.append(F.actionCard(ctx, a, path.concat(i), path, i, list.length)));
    if (!list.length && !opt.quiet) box.append(el('div', { class: 'empty' }, 'Nothing happens yet.'));
    box.append(btn('＋ Add an action', () => ctx.pick({
      title: 'What should happen?', items: Object.values(ctx.reg.actions).map((d) => ({ id: d.name, title: S.humanize(d.name), doc: d.doc, group: groupOf(d) })),
      onPick: (name) => ctx.doc.transact('Add action', () => { ctx.doc.insert(path, null, S.blankAction(name, cx(ctx))); S.ensureExt(ctx.doc, ctx.reg.actions[name].ext); }),
    }), 'add'));
    box.append(pasteBtn(ctx, 'actions', path));
    return box;
  };
  F.actionCard = (ctx, a, path, listPath, i, n) => {
    const def = ctx.reg.actions[a && a.act], card = el('div', { class: 'card action', 'data-path': S.pathStr(path) });
    const sel = el('select', { class: 'act-sel', 'aria-label': 'action' }, Object.values(ctx.reg.actions).map((d) => el('option', { value: d.name, selected: d.name === (a && a.act) }, S.humanize(d.name))));
    if (!def) sel.prepend(el('option', { value: '', selected: true }, 'Unknown action'));
    sel.onchange = () => ctx.doc.transact('Change action', () => {
      const nu = S.blankAction(sel.value, cx(ctx)); for (const k of Object.keys(nu)) if (k !== 'act' && a && k in a) nu[k] = a[k];
      ctx.doc.set(path, nu); S.ensureExt(ctx.doc, ctx.reg.actions[sel.value].ext);
    });
    card.append(el('div', { class: 'card-h' }, el('span', { class: 'tag' }, 'Do'), sel, el('span', { class: 'grow' }),
      i > 0 ? btn('▲', () => ctx.doc.move(listPath, i, i - 1), 'sq', 'move up') : null, i < n - 1 ? btn('▼', () => ctx.doc.move(listPath, i, i + 1), 'sq', 'move down') : null,
      btn('⋯', () => actionMenu(ctx, a, listPath, i, n), 'sq', 'copy, cut, paste'), btn('✕', () => ctx.doc.remove(listPath, i), 'sq danger', 'remove')));
    if (def) { if (def.doc) card.append(el('div', { class: 'f-doc' }, def.doc)); for (const f of S.describeAction(a.act, cx(ctx)).fields) card.append(F.field(ctx, f, a[f.key], path.concat(f.key))); }
    card.append(el('div', { class: 'card-issues' }));
    return card;
  };

  /* ---- rules: "When … only if … then …" */
  F.rulesEditor = (ctx, rules, path, owner) => {
    const list = Array.isArray(rules) ? rules : [], box = el('div', { class: 'rules' });
    list.forEach((r, i) => box.append(F.ruleCard(ctx, r, path.concat(i), path, i, list.length, owner)));
    if (!list.length) box.append(el('div', { class: 'empty' }, 'No rules yet. Rules make things react: "when touched, add a coin".'));
    box.append(btn('＋ Add a rule', () => ctx.pick({
      title: 'When should something happen?', items: Object.values(ctx.reg.triggers).filter((t) => !t.owners || t.owners.includes(owner)).map((t) => ({ id: t.name, title: S.humanize(t.name), doc: t.doc, group: groupOf(t) })),
      onPick: (name) => ctx.doc.transact('Add rule', () => { ctx.doc.insert(path, null, S.blankRule(name, cx(ctx))); S.ensureExt(ctx.doc, ctx.reg.triggers[name].ext); }),
    }), 'add primary'));
    box.append(pasteBtn(ctx, 'rule', path, owner));
    return box;
  };
  F.ruleCard = (ctx, r, path, listPath, i, n, owner) => {
    const card = el('div', { class: 'card rule', 'data-path': S.pathStr(path) }), t = ctx.reg.triggers[r.on];
    const opts = Object.values(ctx.reg.triggers).filter((x) => !x.owners || x.owners.includes(owner) || x.name === r.on);
    const sel = el('select', { class: 'act-sel', 'aria-label': 'trigger' }, opts.map((x) => el('option', { value: x.name, selected: x.name === r.on }, S.humanize(x.name))));
    sel.onchange = () => ctx.doc.transact('Change trigger', () => {
      const nu = S.blankRule(sel.value, cx(ctx)); for (const k of ['if', 'then', 'else']) if (k in r && !(k === 'if' && nu.if && !r.if)) nu[k] = r[k];
      ctx.doc.set(path, nu); S.ensureExt(ctx.doc, ctx.reg.triggers[sel.value].ext);
    });
    card.append(el('div', { class: 'card-h' }, el('span', { class: 'tag when' }, 'When'), sel, el('span', { class: 'grow' }),
      i > 0 ? btn('▲', () => ctx.doc.move(listPath, i, i - 1), 'sq', 'move up') : null, i < n - 1 ? btn('▼', () => ctx.doc.move(listPath, i, i + 1), 'sq', 'move down') : null,
      btn('⋯', () => ruleMenu(ctx, r, path, listPath, i, owner), 'sq', 'copy, cut, paste, duplicate'), btn('✕', () => ctx.doc.remove(listPath, i), 'sq danger', 'remove')));
    if (r.doc) card.append(el('div', { class: 'f-doc note' }, r.doc));
    if (t) {
      if (t.doc) card.append(el('div', { class: 'f-doc' }, t.doc));
      for (const f of S.describeTrigger(r.on, cx(ctx)).fields) card.append(F.field(ctx, f, r[f.key], path.concat(f.key)));
      card.append(F.field(ctx, { key: 'if', label: t.requiresIf ? 'When this is true' : 'Only if (optional)', kind: 'expr', optional: !t.requiresIf, doc: '' }, r.if, path.concat('if')));
    }
    card.append(el('div', { class: 'section-l' }, 'Then'), F.actionsEditor(ctx, r.then, path.concat('then')));
    if (Array.isArray(r.else)) card.append(el('div', { class: 'section-l' }, 'Otherwise'), F.actionsEditor(ctx, r.else, path.concat('else'), { quiet: true }), btn('Remove "otherwise"', () => ctx.doc.del(path.concat('else')), 'link'));
    else card.append(btn('＋ Otherwise…', () => ctx.doc.set(path.concat('else'), []), 'link'));
    card.append(el('div', { class: 'card-issues' }));
    return card;
  };

  /* ---- dialogue lines */
  const lineDesc = (ctx) => S.describe({ type: 'object', fields: { text: 'text', if: { type: 'expr', optional: true, label: 'Only say this if' }, choices: { type: 'list', optional: true, label: 'Choices', of: { type: 'object', fields: { text: 'text', if: { type: 'expr', optional: true }, then: { type: 'actions', optional: true, label: 'Then' } } } } } }, 'line', cx(ctx));
  F.linesEditor = (ctx, value, path) => {
    const arr = Array.isArray(value) ? value : [], box = el('div', { class: 'list lines' });
    arr.forEach((l, i) => {
      const row = el('div', { class: 'list-row' });
      if (typeof l === 'string') {
        const inp = el('input', { type: 'text', value: l, placeholder: 'What they say…' }); inp.oninput = () => ctx.edit(() => ctx.doc.set(path.concat(i), inp.value, { coalesce: true }));
        row.append(el('div', { class: 'f' }, inp, el('button', { type: 'button', class: 'link', onclick: () => ctx.doc.set(path.concat(i), { text: l, choices: [{ text: 'Yes' }, { text: 'No' }] }) }, 'Turn into a question')));
      } else row.append(F.field(ctx, lineDesc(ctx), l, path.concat(i), { label: 'Line ' + (i + 1) }));
      row.append(el('div', { class: 'row-ctl' }, i > 0 ? btn('▲', () => ctx.doc.move(path, i, i - 1), 'sq', 'move up') : null, i < arr.length - 1 ? btn('▼', () => ctx.doc.move(path, i, i + 1), 'sq', 'move down') : null, btn('✕', () => ctx.doc.remove(path, i), 'sq danger', 'remove')));
      box.append(row);
    });
    box.append(btn('＋ Add a line', () => ctx.doc.insert(path, null, ''), 'add'));
    return box;
  };

  /* ---- a thing's parts (components) */
  F.partsEditor = (ctx, id) => {
    const p = ctx.doc.cart.prefabs[id], box = el('div', { class: 'parts' }), comps = Object.keys(p.c || {});
    for (const name of comps) {
      const d = S.describeComponent(name, cx(ctx)); if (!d) { box.append(el('div', { class: 'card' }, el('div', { class: 'card-h' }, `Unknown part "${name}"`, el('span', { class: 'grow' }), btn('✕', () => ctx.doc.del(['prefabs', id, 'c', name]), 'sq danger')))); continue; }
      if (!d.fields.length) {   // plumbing like Position: nothing to set, so no card to open
        box.append(el('div', { class: 'card part flat', 'data-path': `prefabs.${id}.c.${name}` }, el('div', { class: 'card-h' }, el('b', null, d.label), el('span', { class: 'f-doc grow' }, 'no settings'), btn('✕', () => { try { S.removePart(ctx.doc, id, name); } catch (err) { ctx.toast(err.message); } }, 'sq danger', 'remove part')), el('div', { class: 'card-issues' })));
        continue;
      }
      if (name === 'sprite') {   // offer the animations this picture actually has
        const sd = ctx.doc.cart.sprites[(p.c.sprite || {}).id], an = sd && sd.anims ? Object.keys(sd.anims) : [];
        const f = d.fields.find((x) => x.key === 'anim'); if (f && an.length) { f.kind = 'enum'; f.options = an; f.default = an.includes('idle') ? 'idle' : an[0]; }
      }
      const card = el('details', { class: 'card part', 'data-path': `prefabs.${id}.c.${name}`, open: ['sprite', 'health'].includes(name) ? true : null });
      card.append(el('summary', { class: 'card-h' }, el('b', null, d.label), el('span', { class: 'grow' }), btn('✕', (e) => { e.preventDefault(); try { S.removePart(ctx.doc, id, name); } catch (err) { ctx.toast(err.message); } }, 'sq danger', 'remove part')));
      if (d.doc) card.append(el('div', { class: 'f-doc' }, d.doc));
      for (const f of d.fields) card.append(F.field(ctx, f, p.c[name][f.key], ['prefabs', id, 'c', name, f.key]));
      card.append(el('div', { class: 'card-issues' })); box.append(card);
    }
    const have = new Set(comps);
    box.append(btn('＋ Add a part', () => ctx.pick({
      title: 'Add a part', items: Object.values(ctx.reg.components).filter((c) => !have.has(c.name)).map((c) => ({ id: c.name, title: S.humanize(c.name), doc: c.doc + (c.needs.length ? ` (also adds: ${c.needs.filter((n) => !have.has(n)).map(S.humanize).join(', ') || 'nothing more'})` : ''), group: groupOf(c) })),
      onPick: (name) => S.addPart(ctx.doc, id, name),
    }), 'add'));
    return box;
  };
  /* small editors: tags and values */
  F.tagsEditor = (ctx, id) => {
    const tags = ctx.doc.cart.prefabs[id].tags || [], box = el('div', { class: 'chips' });
    tags.forEach((t, i) => box.append(el('span', { class: 'chip' }, t, el('button', { type: 'button', 'aria-label': 'remove ' + t, onclick: () => ctx.doc.remove(['prefabs', id, 'tags'], i) }, '✕'))));
    const inp = el('input', { type: 'text', placeholder: 'add a tag (e.g. enemy)', class: 'chip-in' });
    inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { ctx.doc.insert(['prefabs', id, 'tags'], null, inp.value.trim().toLowerCase().replace(/\s+/g, '-')); } };
    box.append(inp, btn('Add', () => inp.value.trim() && ctx.doc.insert(['prefabs', id, 'tags'], null, inp.value.trim().toLowerCase().replace(/\s+/g, '-')), 'sm'));
    return box;
  };
  F.valuesEditor = (ctx, path, obj, opts) => {
    obj = obj || {}; const box = el('div', { class: 'values' });
    for (const k of Object.keys(obj)) {
      const v = obj[k], row = el('div', { class: 'valrow' }, el('span', { class: 'vname' }, k));
      if (typeof v === 'boolean') row.append(F.field(ctx, { key: k, kind: 'bool', label: '', default: false }, v, path.concat(k), { bare: true }));
      else if (typeof v === 'number') row.append(F.field(ctx, { key: k, kind: 'number', label: '' }, v, path.concat(k), { bare: true }));
      else if (typeof v === 'string') row.append(F.field(ctx, { key: k, kind: 'text', label: '' }, v, path.concat(k), { bare: true }));
      else row.append(el('span', { class: 'f-doc' }, 'group of values (edit in the code view)'));
      row.append(btn('✕', () => ctx.doc.del(path.concat(k)), 'sq danger', 'remove'));
      box.append(row);
    }
    const name = el('input', { type: 'text', placeholder: 'new name', class: 'chip-in' }), kind = el('select', null, el('option', { value: 'number' }, 'number'), el('option', { value: 'text' }, 'text'), el('option', { value: 'bool' }, 'yes/no'));
    const add = () => { const n = name.value.trim().replace(/[^A-Za-z0-9_]/g, ''); if (!n) return; if (n in obj) return ctx.toast('That name is taken.'); if (opts && opts.reserved && opts.reserved(n)) return ctx.toast('That name is reserved.'); ctx.doc.set(path.concat(n), kind.value === 'number' ? 0 : kind.value === 'text' ? '' : false); };
    box.append(el('div', { class: 'valadd' }, name, kind, btn('Add', add, 'sm')));
    return box;
  };
})();
