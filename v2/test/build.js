/* The pieces fit together: every page file exists and is referenced once, all addresses carry the same build number, the stamp tool
   behaves.  node v2/test/build.js */
const fs = require('fs'), path = require('path');
const { stampHtml, nextBuild } = require('../tools/stamp.js');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const build = fs.readFileSync(path.join(root, 'BUILD'), 'utf8').trim();
const refs = (html) => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
const css = (html) => [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));

section('1. the build number');
ok(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(build), 'BUILD holds a build number like 2026-10-01.1', build);
ok(fs.readFileSync(path.join(root, 'studio', 'version.js'), 'utf8').includes(`'${build}'`), 'studio/version.js says the same');

for (const page of ['studio.html', 'index.html']) {
  section(`2. ${page}: every file is there, once, with the build number`);
  const html = fs.readFileSync(path.join(root, page), 'utf8'), list = refs(html), sheets = css(html);
  ok(list.length > 10, 'it loads scripts', list.length);
  const bare = (u) => u.replace(/\?v=.*$/, '');
  ok(list.every((u) => u.endsWith('?v=' + build)), 'every script address carries the build number', list.filter((u) => !u.endsWith('?v=' + build)));
  ok(sheets.every((u) => u.endsWith('?v=' + build)), 'and every stylesheet', sheets);
  const missing = list.concat(sheets).map(bare).filter((u) => !fs.existsSync(path.join(root, u)));
  ok(missing.length === 0, 'every file it names exists', missing);
  const dup = list.map(bare).filter((u, i, a) => a.indexOf(u) !== i); ok(dup.length === 0, 'none is loaded twice', dup);
  ok((html.match(/<script\b[^>]*\bsrc="(?!https?:)[^"]+"[^>]*>/g) || []).every((t) => /onerror="__miss\(this\)"/.test(t)), 'each script reports if it fails to load');
  ok(html.indexOf('window.__miss') > -1 && html.indexOf('window.__miss') < html.indexOf('src="'), 'the failure reporter is defined before the first script');
}
section('3. nothing is forgotten');
const studio = refs(fs.readFileSync(path.join(root, 'studio.html'), 'utf8')).map((u) => u.replace(/\?v=.*$/, ''));
const onDisk = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).map((f) => dir + '/' + f);
const notLoaded = onDisk('studio').concat(onDisk('ext')).filter((f) => !studio.includes(f));
ok(notLoaded.length === 0, 'every .js file in studio/ and ext/ is loaded by studio.html', notLoaded);
const player = refs(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).map((u) => u.replace(/\?v=.*$/, ''));
ok(onDisk('ext').every((f) => player.includes(f)), 'and the player loads every extension');
ok(studio.indexOf('studio/version.js') < studio.indexOf('studio/ui.js'), 'version.js loads before the app');
for (const [a, b] of [['kernel.js', 'ext/space.js'], ['studio/core.js', 'studio/clip.js'], ['studio/core.js', 'studio/audio-core.js'], ['studio/audio-core.js', 'studio/sound-ui.js'], ['studio/ui.js', 'studio/music-ui.js'], ['mixer.js', 'runner.js']]) ok(studio.indexOf(a) > -1 && studio.indexOf(a) < studio.indexOf(b), `${a} loads before ${b}`);

section('4. the stamp tool');
const sample = '<link rel="stylesheet" href="a/b.css"><link rel="stylesheet" href="https://x.test/f.css"><script src="a.js"></script><script src="https://cdn.test/x.js"></script><script src="b/c.js?v=OLD" onerror="x()"></script><script>inline()</script>';
const out = stampHtml(sample, '9.9');
ok(out.includes('href="a/b.css?v=9.9"') && out.includes('src="a.js?v=9.9" onerror="__miss(this)"'), 'local files get the number (and the failure reporter)');
ok(out.includes('href="https://x.test/f.css"') && out.includes('src="https://cdn.test/x.js"'), 'files from other sites are left alone');
ok(out.includes('src="b/c.js?v=9.9"') && !out.includes('OLD') && (out.match(/onerror=/g) || []).length === 2, 'an old number is replaced, and an existing handler is kept');
ok(out.includes('<script>inline()</script>'), 'inline scripts are untouched');
ok(stampHtml(out, '9.9') === out, 'stamping twice with the same number changes nothing');
ok(stampHtml(out, '9.10').includes('a.js?v=9.10') && !stampHtml(out, '9.10').includes('9.9'), 'a new number replaces the old one everywhere');
const day = new Date().toISOString().slice(0, 10);
ok(nextBuild('') === day + '.1' && nextBuild(day + '.4') === day + '.5' && nextBuild('2020-01-01.9') === day + '.1' && nextBuild('junk') === day + '.1', 'the next build number counts up within a day and restarts on a new day');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
