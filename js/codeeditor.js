/* Data Console — code editor: gutter, highlighting, auto-indent, pairs, find/replace, key bar */
(function () {
  const DC = window.DC;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const CLOSE = { '{': '}', '[': ']', '"': '"' };
  const IND = '  ';

  /* Layout rules live with the component so it can never render unstyled */
  const CORE_CSS = `
.code-host{flex:1 1 auto;min-height:0;display:flex}
.ce{--ce-font:16px;--ce-gutter:3.2ch;--ce-pad:10px;flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;
  font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;font-size:var(--ce-font);line-height:1.55;background:#f5f3fa;color:#1d1830}
.ce-body{flex:1 1 auto;min-height:0;display:flex;position:relative;overflow:hidden}
.ce-gutter{flex:none;width:calc(var(--ce-gutter) + 12px);overflow:hidden;position:relative;background:#e6e2ef;border-right:1px solid #c8c0da;color:#9a91b4;text-align:right}
.ce-lines{margin:0;padding:var(--ce-pad) 8px var(--ce-pad) 0;font:inherit;line-height:inherit;white-space:pre;will-change:transform}
.ce-view{position:relative;flex:1 1 auto;min-width:0;overflow:hidden}
.ce-hl,.ce-ta{margin:0;border:0;padding:var(--ce-pad) 14px 40vh var(--ce-pad);font:inherit;line-height:inherit;letter-spacing:0;
  tab-size:2;white-space:pre;word-wrap:normal;overflow-wrap:normal;box-sizing:border-box}
.ce-hl{position:absolute;top:0;left:0;min-width:100%;pointer-events:none;will-change:transform}
.ce-ta{position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;resize:none;outline:none;overflow:auto;
  background:transparent;color:transparent;caret-color:#1d1830;-webkit-text-fill-color:transparent;
  -webkit-user-select:text;user-select:text;-webkit-overflow-scrolling:touch;border-radius:0;-webkit-appearance:none;appearance:none}
.ce-ta::selection{background:rgba(91,74,134,.28);-webkit-text-fill-color:transparent}
.ce-mark{position:absolute;left:0;right:0;pointer-events:none}
.ce-find{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px}
.ce-find[hidden],.ce-mark[hidden]{display:none!important}
.ce-find input{flex:1 1 130px;min-width:0;font-size:16px}
.ce-keys{display:none;gap:4px;padding:6px 8px;overflow-x:auto;flex:none}
.ce-keys button{flex:none;min-width:44px;min-height:40px;font-size:16px;touch-action:manipulation}
@media (pointer:coarse){.ce-keys{display:flex}}`;
  function ensureStyles() {
    if (document.getElementById('ce-core-css')) return;
    const st = document.createElement('style');
    st.id = 'ce-core-css';
    st.textContent = CORE_CSS;
    document.head.insertBefore(st, document.head.firstChild);
  }

  class CodeEditor {
    constructor(root, opts = {}) {
      ensureStyles();
      this.root = root;
      this.opts = opts;
      root.classList.add('ce');
      root.innerHTML = `
        <div class="ce-find" hidden>
          <input class="ce-q" type="search" placeholder="Find" aria-label="Find" autocapitalize="off" autocorrect="off" spellcheck="false">
          <input class="ce-r" type="text" placeholder="Replace with" aria-label="Replace with" autocapitalize="off" autocorrect="off" spellcheck="false">
          <span class="ce-count" aria-live="polite"></span>
          <button type="button" data-f="prev" aria-label="Previous match">↑</button>
          <button type="button" data-f="next" aria-label="Next match">↓</button>
          <button type="button" data-f="one">Replace</button>
          <button type="button" data-f="all">All</button>
          <button type="button" data-f="close" aria-label="Close find">✕</button>
        </div>
        <div class="ce-body">
          <div class="ce-gutter" aria-hidden="true"><pre class="ce-lines"></pre></div>
          <div class="ce-view">
            <pre class="ce-hl" aria-hidden="true"></pre>
            <div class="ce-mark" hidden></div>
            <textarea class="ce-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Cart code"></textarea>
          </div>
        </div>
        <div class="ce-keys" role="toolbar" aria-label="Coding keys">
          <button type="button" data-k="tab" aria-label="Indent">⇥</button>
          <button type="button" data-k="untab" aria-label="Outdent">⇤</button>
          <button type="button" data-k="{">{ }</button>
          <button type="button" data-k="[">[ ]</button>
          <button type="button" data-k='"'>" "</button>
          <button type="button" data-k=":">:</button>
          <button type="button" data-k=",">,</button>
          <button type="button" data-k="left" aria-label="Cursor left">←</button>
          <button type="button" data-k="right" aria-label="Cursor right">→</button>
          <button type="button" data-k="undo" aria-label="Undo">↶</button>
          <button type="button" data-k="redo" aria-label="Redo">↷</button>
        </div>`;
      const q = (s) => root.querySelector(s);
      this.ta = q('.ce-ta'); this.hl = q('.ce-hl'); this.lines = q('.ce-lines'); this.mark = q('.ce-mark');
      this.findBar = q('.ce-find'); this.fq = q('.ce-q'); this.fr = q('.ce-r'); this.fcount = q('.ce-count');
      this.lineCount = 0;
      this.pending = false;

      const ta = this.ta;
      ta.addEventListener('input', (e) => this.onInput(e));
      document.addEventListener('selectionchange', () => { if (document.activeElement === ta) this.keepCaretInView(); });
      ta.addEventListener('focus', () => this.keepCaretInView());
      ta.addEventListener('scroll', () => this.syncScroll());
      ta.addEventListener('keydown', (e) => this.onKey(e));
      ta.addEventListener('beforeinput', (e) => this.onBeforeInput(e));

      // key bar: act without stealing focus from the textarea
      q('.ce-keys').addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        e.preventDefault();
        this.key(b.dataset.k);
      });
      q('.ce-keys').addEventListener('click', (e) => e.preventDefault());

      this.findBar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        const f = b.dataset.f;
        if (f === 'next') this.findNext(1);
        if (f === 'prev') this.findNext(-1);
        if (f === 'one') this.replaceOne();
        if (f === 'all') this.replaceAll();
        if (f === 'close') this.closeFind();
      });
      this.fq.addEventListener('input', () => { this.countMatches(); this.findNext(1, true); });
      this.fq.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.findNext(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') this.closeFind();
      });
      this.fr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); }
        if (e.key === 'Escape') this.closeFind();
      });

      this.setFont(opts.font || 16);
    }

    /* ---------- value & rendering ---------- */
    get value() { return this.ta.value; }
    set value(v) {
      this.ta.value = v;
      this.ta.scrollTop = 0; this.ta.scrollLeft = 0;
      this.ta.setSelectionRange(0, 0);
      this.hist = [{ v, s: 0, e: 0 }]; this.hi = 0; this.lastSnap = 0; this.mergeable = false;
      this.clearMark();
      this.render();
    }
    setFont(px) {
      this.font = Math.max(11, Math.min(26, px));
      this.root.style.setProperty('--ce-font', this.font + 'px');
      this.charW = null;
      this.render();
    }
    /* ---------- history (our own, so undo works the same on every browser) ---------- */
    snapshot(merge) {
      const ta = this.ta, st = { v: ta.value, s: ta.selectionStart, e: ta.selectionEnd };
      if (!this.hist) { this.hist = [st]; this.hi = 0; }
      const top = this.hist[this.hi];
      if (top && top.v === st.v) { top.s = st.s; top.e = st.e; return; }
      const now = performance.now();
      if (merge && this.mergeable && now - this.lastSnap < 800 && this.hi === this.hist.length - 1 && this.hi > 0) this.hist[this.hi] = st;
      else {
        this.hist.splice(this.hi + 1);
        this.hist.push(st);
        if (this.hist.length > 400) this.hist.shift();
        this.hi = this.hist.length - 1;
      }
      this.lastSnap = now; this.mergeable = !!merge;
    }
    restore(st) {
      const ta = this.ta;
      ta.value = st.v;
      ta.setSelectionRange(st.s, st.e);
      this.mergeable = false;
      this.changed(true);
      this.scrollToPos(st.s);
    }
    undo() { if (this.hist && this.hi > 0) { this.hi--; this.restore(this.hist[this.hi]); } }
    redo() { if (this.hist && this.hi < this.hist.length - 1) { this.hi++; this.restore(this.hist[this.hi]); } }
    onInput(e) {
      // Safari sometimes won't let us take over Enter; the phone's own newline goes in, then we indent it
      if (this.pendingIndent && (!e.inputType || /insertLineBreak|insertParagraph|insertText/.test(e.inputType))) {
        this.pendingIndent = false;
        const ta = this.ta, v = ta.value, pos = ta.selectionStart;
        if (v[pos - 1] === '\n') {
          const prevStart = v.lastIndexOf('\n', pos - 2) + 1;
          const prev = v.slice(prevStart, pos - 1);
          const ind = /^ */.exec(prev)[0] + (/[\[{]\s*$/.test(prev) ? '  ' : '');
          if (ind) { ta.setRangeText(ind, pos, pos, 'end'); }
        }
      }
      this.snapshot(true);
      this.changed();
    }
    /* never leave the view stranded to the right of a short line */
    keepCaretInView() {
      const ta = this.ta, pos = ta.selectionStart, v = ta.value;
      const col = pos - (v.lastIndexOf('\n', pos - 1) + 1);
      const x = col * this.charWidth() + 20;
      if (x < ta.clientWidth * 0.85) { if (ta.scrollLeft) { ta.scrollLeft = 0; this.syncScroll(); } }
      else if (x < ta.scrollLeft + 20 || x > ta.scrollLeft + ta.clientWidth - 20) { ta.scrollLeft = Math.max(0, x - ta.clientWidth * 0.6); this.syncScroll(); }
    }
    changed(skipSnap) {
      if (!skipSnap && skipSnap !== undefined) this.snapshot(false);
      this.clearMark();
      if (!this.pending) { this.pending = true; requestAnimationFrame(() => { this.pending = false; this.render(); }); }
      if (this.opts.onChange) this.opts.onChange();
    }
    render() {
      const v = this.ta.value;
      this.hl.innerHTML = this.highlight(v) + '\n\n';
      const n = v.split('\n').length;
      if (n !== this.lineCount) {
        this.lineCount = n;
        let s = '';
        for (let i = 1; i <= n; i++) s += i + '\n';
        this.lines.textContent = s + '\n';
        this.root.style.setProperty('--ce-gutter', Math.max(2, String(n).length) + 1.2 + 'ch');
      }
      this.syncScroll();
      if (!this.findBar.hidden) this.countMatches();
    }
    syncScroll() {
      const t = this.ta;
      this.hl.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
      this.lines.style.transform = `translateY(${-t.scrollTop}px)`;
      this.mark.style.transform = `translateY(${-t.scrollTop}px)`;
    }
    lineHeight() { return parseFloat(getComputedStyle(this.ta).lineHeight) || this.font * 1.5; }
    charWidth() {
      if (this.charW) return this.charW;
      const c = document.createElement('canvas').getContext('2d');
      c.font = getComputedStyle(this.ta).font;
      return (this.charW = c.measureText('0000000000').width / 10 || this.font * 0.6);
    }

    /* JSON highlighting; strings inside "frames"/"pixels" arrays are painted with their palette colours */
    highlight(v) {
      const pal = (this.opts.palette && this.opts.palette()) || DC.PALETTE;
      const n = v.length;
      let out = '', i = 0, depth = 0, pixDepth = -1, lastKey = '';
      while (i < n) {
        const c = v[i];
        if (c === '"') {
          let j = i + 1;
          while (j < n && v[j] !== '"' && v[j] !== '\n') { if (v[j] === '\\') j++; j++; }
          const str = v.slice(i, Math.min(j + 1, n));
          let k = j + 1;
          while (k < n && (v[k] === ' ' || v[k] === '\t')) k++;
          if (v[k] === ':') { out += '<span class="k">' + esc(str) + '</span>'; lastKey = str.slice(1, -1); }
          else {
            if (pixDepth >= 0 && depth > pixDepth && /^"[0-9a-vA-V. ]+"$/.test(str)) out += this.pixels(str, pal);
            else if (str.length > 3 && str[1] === '=' && str[2] !== '=') out += '<span class="f">' + esc(str) + '</span>';
            else if (lastKey === 'if' || lastKey === 'when') out += '<span class="f">' + esc(str) + '</span>';
            else out += '<span class="s">' + esc(str) + '</span>';
            lastKey = '';
          }
          i = j + 1;
          continue;
        }
        if (c === '{' || c === '[') {
          if (c === '[' && (lastKey === 'frames' || lastKey === 'pixels') && pixDepth < 0) pixDepth = depth;
          lastKey = '';
          depth++;
          out += '<span class="p">' + c + '</span>';
          i++;
          continue;
        }
        if (c === '}' || c === ']') {
          depth--;
          if (pixDepth >= 0 && depth <= pixDepth) pixDepth = -1;
          out += '<span class="p">' + c + '</span>';
          i++;
          continue;
        }
        if (c === '-' || (c >= '0' && c <= '9')) {
          let j = i + 1;
          while (j < n && /[0-9.eE+-]/.test(v[j])) j++;
          out += '<span class="n">' + esc(v.slice(i, j)) + '</span>';
          i = j; lastKey = '';
          continue;
        }
        if (/[a-zA-Z]/.test(c)) {
          let j = i + 1;
          while (j < n && /[a-zA-Z]/.test(v[j])) j++;
          const w = v.slice(i, j);
          out += (w === 'true' || w === 'false' || w === 'null') ? '<span class="b">' + w + '</span>' : '<span class="x">' + esc(w) + '</span>';
          i = j; lastKey = '';
          continue;
        }
        out += c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;
        i++;
      }
      return out;
    }
    pixels(str, pal) {
      let o = '<span class="s">"</span>';
      for (const ch of str.slice(1, -1)) {
        const k = DC.PIXCHARS.indexOf(ch.toLowerCase());
        if (k < 0 || !pal[k]) { o += '<span class="px0">' + esc(ch) + '</span>'; continue; }
        const [r, g, b] = DC.hexRGB(pal[k]);
        const fg = r * 0.3 + g * 0.59 + b * 0.11 > 140 ? '#000' : '#fff';
        o += `<span class="px" style="background:${pal[k]};color:${fg}">${ch}</span>`;
      }
      return o + '<span class="s">"</span>';
    }

    /* ---------- editing ---------- */
    insert(text) {
      const ta = this.ta;
      if (document.activeElement !== ta) ta.focus({ preventScroll: true });
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      this.snapshot(false);
      this.changed(true);
      this.keepCaretInView();
    }
    caret(pos) { this.ta.setSelectionRange(pos, pos); }
    lineStart(pos) { return this.ta.value.lastIndexOf('\n', pos - 1) + 1; }

    onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'f') { e.preventDefault(); this.openFind(); return; }
      if (mod && k === 's') { e.preventDefault(); if (this.opts.onSave) this.opts.onSave(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); if (this.opts.onRun) this.opts.onRun(); return; }
      if (mod && k === 'd') { e.preventDefault(); this.duplicateLine(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
      if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) this.shift(-1); else this.shift(1); return; }
      if (e.key === 'Escape' && !this.findBar.hidden) this.closeFind();
    }

    onBeforeInput(e) {
      if (e.isComposing) return;
      const t = e.inputType;
      if (t === 'historyUndo' || t === 'historyRedo') { e.preventDefault(); if (t === 'historyUndo') this.undo(); else this.redo(); return; }
      if (t === 'insertLineBreak' || t === 'insertParagraph') {
        if (!e.cancelable) { this.pendingIndent = true; return; }
        e.preventDefault(); this.newline(); return;
      }
      if (!e.cancelable) return;
      if (t === 'deleteContentBackward') { if (this.smartBackspace()) e.preventDefault(); return; }
      if ((t === 'insertText' || t === 'insertReplacementText') && e.data) {
        if (e.data.length === 1) { if (this.typeChar(e.data)) e.preventDefault(); return; }
        const fixed = e.data.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        if (fixed !== e.data) { e.preventDefault(); this.insert(fixed); }
      }
    }

    typeChar(raw) {
      const ch = raw.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
      const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const next = v[e], prev = v[s - 1];
      // type over an auto-inserted closer
      if ((ch === '}' || ch === ']' || ch === '"') && s === e && next === ch) { this.caret(s + 1); return true; }
      if (ch === '{' || ch === '[' || ch === '"') {
        if (s !== e) { const sel = v.slice(s, e); this.insert(ch + sel + CLOSE[ch]); ta.setSelectionRange(s + 1, s + 1 + sel.length); return true; }
        if (ch === '"' && prev && /[\w\\]/.test(prev)) { this.insert('"'); return true; }
        if (!next || /[\s,}\]:]/.test(next)) { this.insert(ch + CLOSE[ch]); this.caret(s + 1); return true; }
        this.insert(ch); return true;
      }
      if (ch === '}' || ch === ']') {
        const ls = this.lineStart(s), before = v.slice(ls, s);
        if (/^ +$/.test(before) && before.length >= 2 && s === e) { ta.setSelectionRange(s - 2, s); this.insert(ch); return true; }
      }
      if (ch !== raw) { this.insert(ch); return true; }
      return false;
    }

    newline() {
      const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const ls = this.lineStart(s);
      const lineBefore = v.slice(ls, s);
      const ind = /^ */.exec(lineBefore)[0];
      const last = lineBefore.trimEnd().slice(-1);
      const next = v.slice(e).match(/^[ \t]*(.)/);
      const nextCh = next ? next[1] : '';
      const opens = last === '{' || last === '[';
      if (opens && (nextCh === '}' || nextCh === ']')) {
        const trimmed = v.slice(e).match(/^[ \t]*/)[0].length;
        ta.setSelectionRange(s, e + trimmed);
        this.insert('\n' + ind + IND + '\n' + ind);
        this.caret(s + 1 + ind.length + IND.length);
      } else if (opens) this.insert('\n' + ind + IND);
      else this.insert('\n' + ind);
    }

    smartBackspace() {
      const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      if (s !== e || s === 0) return false;
      const a = v[s - 1], b = v[s];
      if (CLOSE[a] && CLOSE[a] === b) { ta.setSelectionRange(s - 1, s + 1); this.insert(''); return true; }
      const ls = this.lineStart(s), before = v.slice(ls, s);
      if (before.length >= 2 && /^ +$/.test(before)) {
        const keep = Math.floor((before.length - 1) / IND.length) * IND.length;
        ta.setSelectionRange(ls + keep, s); this.insert(''); return true;
      }
      return false;
    }

    shift(dir) {
      const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      if (dir > 0 && s === e) { this.insert(IND); return; }
      const ls = this.lineStart(s);
      let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const out = block.split('\n').map((l) => (dir > 0 ? IND + l : l.replace(/^ {1,2}/, ''))).join('\n');
      if (out === block) return;
      ta.setSelectionRange(ls, le);
      this.insert(out);
      if (s === e) this.caret(Math.max(ls, s + (out.length - block.length)));
      else ta.setSelectionRange(ls, ls + out.length);
    }

    duplicateLine() {
      const ta = this.ta, v = ta.value, s = ta.selectionStart;
      const ls = this.lineStart(s);
      let le = v.indexOf('\n', s); if (le < 0) le = v.length;
      const line = v.slice(ls, le);
      this.caret(le);
      this.insert('\n' + line);
      this.caret(le + 1 + (s - ls));
    }

    key(k) {
      const ta = this.ta;
      if (document.activeElement !== ta) ta.focus({ preventScroll: true });
      if (k === 'tab') return this.shift(1);
      if (k === 'untab') return this.shift(-1);
      if (k === 'left') return this.caret(Math.max(0, ta.selectionStart - 1));
      if (k === 'right') return this.caret(Math.min(ta.value.length, ta.selectionEnd + 1));
      if (k === 'undo') return this.undo();
      if (k === 'redo') return this.redo();
      if (!this.typeChar(k)) this.insert(k);
    }

    /* ---------- find & replace ---------- */
    openFind() {
      this.findBar.hidden = false;
      const sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
      if (sel && !sel.includes('\n') && sel.length < 60) this.fq.value = sel;
      this.fq.focus(); this.fq.select();
      this.countMatches();
    }
    closeFind() { this.findBar.hidden = true; this.fcount.textContent = ''; this.ta.focus({ preventScroll: true }); }
    countMatches() {
      const q = this.fq.value;
      if (!q) { this.fcount.textContent = ''; return 0; }
      const v = this.ta.value.toLowerCase(), n = q.toLowerCase();
      let c = 0, i = v.indexOf(n);
      while (i >= 0 && c < 9999) { c++; i = v.indexOf(n, i + n.length); }
      this.fcount.textContent = c ? `${c} found` : 'None';
      return c;
    }
    findNext(dir, fromStart) {
      const q = this.fq.value;
      if (!q) return false;
      const ta = this.ta, v = ta.value.toLowerCase(), n = q.toLowerCase();
      let i;
      if (dir > 0) {
        i = v.indexOf(n, fromStart ? ta.selectionStart : ta.selectionEnd);
        if (i < 0) i = v.indexOf(n);
      } else {
        i = v.lastIndexOf(n, Math.max(0, ta.selectionStart - 1));
        if (i < 0 || i >= ta.selectionStart) i = v.lastIndexOf(n);
      }
      if (i < 0) return false;
      this.select(i, i + q.length, true);
      return true;
    }
    replaceOne() {
      const q = this.fq.value;
      if (!q) return;
      const ta = this.ta;
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel.toLowerCase() !== q.toLowerCase()) { this.findNext(1); return; }
      const keepFind = document.activeElement;
      this.insert(this.fr.value);
      this.findNext(1);
      if (keepFind === this.fr || keepFind === this.fq) keepFind.focus();
    }
    replaceAll() {
      const q = this.fq.value;
      if (!q) return;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const n = this.countMatches();
      if (!n) return;
      const ta = this.ta;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(0, ta.value.length);
      this.insert(ta.value.replace(re, () => this.fr.value));
      this.fcount.textContent = `Replaced ${n}`;
    }

    /* ---------- navigation ---------- */
    select(a, b, keepFindFocus) {
      const ta = this.ta;
      const f = document.activeElement;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(a, b);
      this.scrollToPos(a);
      if (keepFindFocus && (f === this.fq || f === this.fr)) f.focus({ preventScroll: true });
    }
    scrollToPos(pos) {
      const ta = this.ta, v = ta.value.slice(0, pos);
      const line = v.split('\n').length - 1;
      const col = pos - (v.lastIndexOf('\n') + 1);
      const lh = this.lineHeight(), cw = this.charWidth();
      const top = line * lh;
      if (top < ta.scrollTop + lh || top > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
      const x = col * cw;
      if (x < ta.scrollLeft || x > ta.scrollLeft + ta.clientWidth - cw * 6) ta.scrollLeft = Math.max(0, x - ta.clientWidth / 3);
      this.syncScroll();
    }
    gotoLine(line, col) {
      const lines = this.ta.value.split('\n');
      line = Math.max(1, Math.min(lines.length, line | 0));
      let pos = 0;
      for (let i = 0; i < line - 1; i++) pos += lines[i].length + 1;
      pos += Math.max(0, Math.min(lines[line - 1].length, (col || 1) - 1));
      this.select(pos, pos);
      this.markLine(line);
    }
    find(text) {
      const i = this.ta.value.indexOf(text);
      if (i < 0) return false;
      this.select(i, i + text.length);
      this.markLine(this.ta.value.slice(0, i).split('\n').length);
      return true;
    }
    markLine(line) {
      const lh = this.lineHeight();
      const pad = parseFloat(getComputedStyle(this.ta).paddingTop) || 0;
      this.mark.style.top = pad + (line - 1) * lh + 'px';
      this.mark.style.height = lh + 'px';
      this.mark.hidden = false;
      this.syncScroll();
    }
    clearMark() { if (this.mark) this.mark.hidden = true; }
    focus() { this.ta.focus({ preventScroll: true }); }
  }

  DC.CodeEditor = CodeEditor;
})();
