/* v2 extension: dialogue. A conversation is a *mode* pushed onto the scene stack: the world
   underneath is frozen (no special "paused" flag anywhere) and is exactly as it was when it ends.
   Battles and menus will work the same way. */
(function (root) {
  'use strict';
  const DC2 = root.DC2, DT = DC2.DT;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function checkLines(lines, path, cx) {
    if (!Array.isArray(lines) || !lines.length) return cx.E(path, 'needs a list of lines');
    const lineSpec = { type: 'object', fields: { text: 'text', if: { type: 'expr', optional: true }, choices: { type: 'custom', optional: true, check: checkChoices } } };
    lines.forEach((l, i) => {
      if (typeof l === 'string') return DC2._checkValue('text', l, `${path}[${i}]`, cx);
      if (!isObj(l)) return cx.E(`${path}[${i}]`, 'a line is a string or {"text":...}');
      DC2._checkValue(lineSpec, l, `${path}[${i}]`, cx);
    });
  }
  function checkChoices(choices, path, cx) {
    if (!Array.isArray(choices)) return cx.E(path, 'choices must be a list');
    const spec = { type: 'object', fields: { text: 'text', if: { type: 'expr', optional: true }, then: { type: 'actions', optional: true } } };
    choices.forEach((c, i) => DC2._checkValue(spec, c, `${path}[${i}]`, cx));
  }

  DC2.defineExtension({
    name: 'dialogue',
    doc: 'Conversations with typewriter text, conditional lines and choices. Pushes a "dialogue" mode; the world below is frozen.',
    install(r) {
      r.action('say', { doc: 'Start a conversation. Lines may have an "if" and "choices" [{text, if, then}]. A choice ends the conversation and runs its "then". "then" of the say runs when it ends.', params: {
        name: { type: 'text', optional: true, doc: 'speaker' },
        lines: { type: 'custom', editor: 'lines', required: true, check: checkLines },
        then: { type: 'actions', optional: true } },
        run(w, ctx, p, a) { w.pushMode('dialogue', { name: p.name || '', lines: a.lines, then: a.then || null, i: 0, cur: null, self: ctx.self ? ctx.self.id : 0, other: ctx.other ? ctx.other.id : 0 }); } });

      const ctxOf = (w, d) => ({ self: d.self ? w.byId(d.self) : null, other: d.other ? w.byId(d.other) : null, args: {}, scene: w.active() });
      function nextLine(w, d) {
        const ctx = ctxOf(w, d);
        while (d.i < d.lines.length) {
          const l = d.lines[d.i++], o = typeof l === 'string' ? { text: l } : l;
          if (o.if !== undefined && !w.test(o.if, ctx)) continue;
          d.cur = { text: w.fmt(o.text, ctx), n: 0, sel: 0,
            choices: (o.choices || []).filter((c) => c.if === undefined || w.test(c.if, ctx)).map((c) => ({ text: w.fmt(c.text, ctx), then: c.then || null })) };
          return true;
        }
        d.cur = null; return false;
      }
      r.mode('dialogue', {
        update(w, entry, input) {
          const d = entry.data;
          if (!d.cur && !nextLine(w, d)) { w.queue({ type: 'popmode' }); w.run(d.then, ctxOf(w, d)); return; }
          const c = d.cur, p = input.players[0].pressed;
          c.n = Math.min(c.text.length, c.n + 45 * DT);
          const typing = c.n < c.text.length;
          if (!typing && c.choices.length && (p.up || p.down)) c.sel = (c.sel + (p.down ? 1 : -1) + c.choices.length) % c.choices.length;
          if (!p.a) return;
          if (typing) { c.n = c.text.length; return; }
          const ctx = ctxOf(w, d);
          if (c.choices.length) {
            const ch = c.choices[c.sel];
            w.queue({ type: 'popmode' }); w.run(ch.then, ctx); w.run(d.then, ctx);
          } else if (!nextLine(w, d)) { w.queue({ type: 'popmode' }); w.run(d.then, ctx); }
        },
        view(w, entry) {
          const d = entry.data, c = d.cur; if (!c) return { kind: 'dialogue', name: d.name, text: '', choices: [], sel: 0 };
          return { kind: 'dialogue', name: d.name, text: c.text.slice(0, Math.floor(c.n)), full: c.n >= c.text.length, choices: c.n >= c.text.length ? c.choices.map((x) => x.text) : [], sel: c.sel };
        },
      });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
