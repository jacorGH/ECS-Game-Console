/* Studio clipboard for rules and "Do" statements (actions).
   What is copied is kept in the browser (so it survives switching tabs, things, even projects) and also put on the device
   clipboard as plain JSON, so it can be pasted into a note, sent to someone, or pasted from one back into the Studio.
     kind "rule"    items: [ { on, ...when, if, then: [...], else: [...] } ]
     kind "actions" items: [ { act, ... } ]            (one Do statement, or several)                                  */
(function (root) {
  'use strict';
  const DC2 = root.DC2, S = DC2.studio, KEY = 'dc2.clip';
  let mem = null;   // used when the browser will not store anything
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const OWNERS = { entity: 'things', scene: 'levels' };

  const valid = (c) => isObj(c) && (c.kind === 'rule' || c.kind === 'actions') && Array.isArray(c.items) && c.items.length > 0
    && c.items.every((x) => isObj(x) && typeof x[c.kind === 'rule' ? 'on' : 'act'] === 'string');
  /* every action anywhere inside (actions can hold more actions: if / repeat / choices) */
  const walkActs = (v, fn) => { if (Array.isArray(v)) v.forEach((x) => walkActs(x, fn)); else if (isObj(v)) { if (typeof v.act === 'string') fn(v.act); for (const k of Object.keys(v)) walkActs(v[k], fn); } };

  const C = (S.clip = {
    KEY,
    store() { try { return root.localStorage || null; } catch (e) { return null; } },
    /* the last thing copied, or null */
    get() {
      const st = C.store(); let raw = null; try { raw = st && st.getItem(KEY); } catch (e) { /* unreadable */ }
      if (raw) { try { const c = JSON.parse(raw); if (valid(c)) return c; } catch (e) { /* damaged: fall through */ } }
      return valid(mem) ? mem : null;
    },
    /* copy: remember it here and put it on the device clipboard too */
    set(kind, items) {
      const c = { dcClip: 1, kind, items: S.clone(items) };
      if (!valid(c)) throw new Error('Nothing to copy.');
      mem = c; const st = C.store(); try { if (st) st.setItem(KEY, JSON.stringify(c)); } catch (e) { /* private mode: still works until you leave */ }
      try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(JSON.stringify(c, null, 1)).catch(() => {}); } catch (e) { /* not allowed here: fine */ }
      return c;
    },
    clear() { mem = null; const st = C.store(); try { if (st) st.removeItem(KEY); } catch (e) { /* nothing */ } },
    /* Make sense of pasted text. Accepts what the Studio copies, a bare rule or action, a list of either, a whole thing
       with "rules", and text wrapped in ``` fences (as chat answers often are). -> { kind, items } or { error } */
    parse(text) {
      let t = String(text == null ? '' : text).trim();
      const fence = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(t); if (fence) t = fence[1].trim();
      if (!t) return { error: 'There is nothing to paste.' };
      let v; try { v = JSON.parse(t); } catch (e) { return { error: 'That is not valid JSON, so it can\'t be a rule or action. (' + e.message.slice(0, 60) + ')' }; }
      if (isObj(v) && v.dcClip) return valid(v) ? { kind: v.kind, items: v.items } : { error: 'That copied item is damaged.' };
      if (isObj(v) && Array.isArray(v.rules) && !('on' in v)) v = v.rules;
      const list = Array.isArray(v) ? v : [v];
      if (!list.length || !list.every(isObj)) return { error: 'That doesn\'t look like a rule or an action.' };
      const rules = list.every((x) => typeof x.on === 'string'), acts = list.every((x) => typeof x.act === 'string');
      if (rules) return { kind: 'rule', items: list };
      if (acts) return { kind: 'actions', items: list };
      return { error: list.some((x) => typeof x.on === 'string') && list.some((x) => typeof x.act === 'string') ? 'That mixes rules and actions. Paste them one kind at a time.' : 'Rules have an "on" (when) and actions have an "act" (what to do); this has neither.' };
    },
    /* "rule “touch”", "2 actions"… for buttons and messages */
    describe(c) {
      if (!c) return '';
      if (c.kind === 'rule') return c.items.length === 1 ? `rule “${c.items[0].on}”` : `${c.items.length} rules`;
      return c.items.length === 1 ? `action “${c.items[0].act}”` : `${c.items.length} actions`;
    },
    /* can it go there? null = yes, otherwise the reason in plain words */
    checkActions(items, reg) {
      let bad = null; walkActs(items, (a) => { if (!bad && !reg.actions[a]) bad = a; });
      return bad ? `I don't know the action “${bad}”.` : null;
    },
    checkRules(items, owner, reg) {
      for (const r of items) {
        const t = reg.triggers[r.on];
        if (!t) return `I don't know the trigger “${r.on}”.`;
        if (t.owners && !t.owners.includes(owner)) return `“${S.humanize(r.on)}” rules work on ${t.owners.map((o) => OWNERS[o] || o).join(' or ')}, not on ${OWNERS[owner] || owner}.`;
        const e = C.checkActions([r.then || [], r.else || []], reg); if (e) return e;
      }
      return null;
    },
    /* the extensions (farm, stealth…) that the items need */
    exts(items, kind, reg) {
      const out = new Set();
      if (kind === 'rule') for (const r of items) { const t = reg.triggers[r.on]; if (t && t.ext && t.ext !== 'core') out.add(t.ext); }
      walkActs(items, (a) => { const d = reg.actions[a]; if (d && d.ext && d.ext !== 'core') out.add(d.ext); });
      return [...out];
    },
    /* put copies into a list at an index (null = the end); turns on any extension they need. One undo step. */
    paste(doc, reg, path, index, c) {
      const list = S.getIn(doc.cart, path), at = index == null ? (Array.isArray(list) ? list.length : 0) : index;
      doc.transact('Paste ' + (c.kind === 'rule' ? 'rule' : 'action'), () => {
        if (!Array.isArray(list)) doc.set(path, []);
        c.items.forEach((it, k) => doc.insert(path, at + k, S.clone(it)));
        for (const e of C.exts(c.items, c.kind, reg)) S.ensureExt(doc, e);
      });
      return at;
    },
    /* how many problems the pasted items have in this project (they may name sounds, pictures… that it doesn't have) */
    problems(cart, path, from, count) {
      const rep = S.check(cart), pre = []; for (let k = 0; k < count; k++) pre.push(S.pathStr(path.concat(from + k)));
      return [...rep.errors, ...rep.warnings].filter((x) => pre.some((p) => x.path === p || x.path.startsWith(p + '.') || x.path.startsWith(p + '['))).length;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
