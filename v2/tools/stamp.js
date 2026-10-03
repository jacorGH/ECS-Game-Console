/* Stamps a build number into the Studio and the player so phones fetch fresh files after an update.
     node v2/tools/stamp.js            next build of today (2026-10-01.1, .2 ...)
     node v2/tools/stamp.js 2026-10-01.7   a build number of your choice
   - every local <script src> and stylesheet gets ?v=BUILD (a new address, so a cached old copy is not used)
   - every local <script> also gets onerror="__miss(this)" so the Studio can tell you which file failed to load
   - studio/version.js and the BUILD file hold the number */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const isLocal = (u) => !/^([a-z]+:)?\/\//i.test(u) && !u.startsWith('data:');
const bare = (u) => u.replace(/\?v=[^"'#]*/, '');

function stampHtml(html, build) {
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/g, (all, attrs) => {
    const m = /\bsrc="([^"]+)"/.exec(attrs); if (!m || !isLocal(m[1])) return all;
    let a = attrs.replace(/\bsrc="[^"]+"/, `src="${bare(m[1])}?v=${build}"`);
    if (!/\bonerror=/.test(a)) a += ' onerror="__miss(this)"';
    return `<script${a}></script>`;
  });
  html = html.replace(/<link\b([^>]*\brel="stylesheet"[^>]*)>/g, (all, attrs) => {
    const m = /\bhref="([^"]+)"/.exec(attrs); if (!m || !isLocal(m[1])) return all;
    return `<link${attrs.replace(/\bhref="[^"]+"/, `href="${bare(m[1])}?v=${build}"`)}>`;
  });
  return html;
}
function nextBuild(prev) {
  const today = new Date().toISOString().slice(0, 10), m = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(prev || '');
  return `${today}.${m && m[1] === today ? +m[2] + 1 : 1}`;
}
module.exports = { stampHtml, nextBuild };

if (require.main === module) {
  const file = path.join(root, 'BUILD'), prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  const build = process.argv[2] || nextBuild(prev);
  fs.writeFileSync(file, build + '\n');
  fs.writeFileSync(path.join(root, 'studio', 'version.js'), `/* written by tools/stamp.js: which build of the Studio this is */\nwindow.DC2_BUILD = '${build}';\n`);
  for (const f of ['studio.html', 'index.html']) { const p = path.join(root, f); fs.writeFileSync(p, stampHtml(fs.readFileSync(p, 'utf8'), build)); }
  console.log('stamped build', build);
}
