/* The sound + music core: notes, scales, tracks, songs, sound effects, generators.  node v2/test/sound.js */
global.window = global; global.DC = {};
require('../../js/expr.js'); require('../kernel.js');
for (const f of ['space', 'platformer', 'combat', 'dialogue', 'farm', 'stealth']) require('../ext/' + f + '.js');
require('../../js/audio.js'); require('../mixer.js'); require('../studio/core.js'); require('../studio/audio-core.js'); require('../studio/starters.js');
const S = DC2.studio, SND = S.snd, N = SND.note, T = SND.track, M = SND.song, X = SND.sfx, ST = window.DC2_STARTERS;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const game = () => new S.Doc(S.clone(ST['flag-of-gold'].cart));
const errs = (doc) => S.check(doc.cart).errors.map((e) => e.path + ': ' + e.msg);
const tokens = (str) => String(str).split(/\s+/).filter((x) => x && x !== '|');

section('1. notes');
ok(N.midi('C4') === 60 && N.midi('A4') === 69 && N.midi('c4') === 60 && N.midi('C-1') === 0 && N.midi('G9') === 127, 'note names -> numbers (C4=60, A4=69, case-insensitive, C-1=0)');
ok(N.midi('C#4') === 61 && N.midi('Db4') === 61 && N.midi('Bb3') === 58 && N.midi('E#4') === 65, 'sharps and flats');
ok(N.midi('H4') === null && N.midi('440') === null && N.midi('.') === null && N.midi('') === null && N.midi('C') === null, 'not a note name -> null');
ok(N.name(60) === 'C4' && N.name(61) === 'C#4' && N.name(69) === 'A4' && N.name(0) === 'C-1' && N.name(58) === 'A#3', 'numbers -> names (sharps)');
let rt = true; for (let m = 0; m <= 127; m++) if (N.midi(N.name(m)) !== m) rt = false; ok(rt, 'name <-> number round trip for every note 0-127');
ok(near(N.freq(69), 440) && near(N.freq(57), 220) && near(N.freq(60), 261.6255653005986, 1e-6), 'frequencies (A4 440, A3 220, C4 261.63)');
ok(N.ofFreq(440) === 69 && N.ofFreq(261.6) === 60 && N.ofFreq(450) === 69 && N.ofFreq(466) === 70, 'frequency -> nearest note');
ok(N.isBlack(61) && N.isBlack(70) && !N.isBlack(60) && !N.isBlack(64), 'black keys');
ok(near(N.hz('A4'), 440) && N.hz('9000') === 9000 && N.hz('12.5') === 12.5 && N.hz('.') === null && N.hz('-') === null && N.hz('0') === null && N.hz('x') === null, 'what a word means as a frequency');
for (const tok of ['C4', 'f#3', 'Bb5', '440', '9000', '.', '-', 'zz', '12abc']) ok(DC.noteFreq(tok) === null ? N.hz(tok) === null : near(N.hz(tok), DC.noteFreq(tok), 1e-6), 'same reading as the engine: ' + tok, [N.hz(tok), DC.noteFreq(tok)]);

section('2. scales');
ok([60, 62, 64, 65, 67, 69, 71].every((m) => SND.inScale(m, 0, 'major')) && !SND.inScale(61, 0, 'major') && !SND.inScale(66, 0, 'major'), 'C major');
ok(SND.inScale(69, 9, 'minor') && SND.inScale(72, 9, 'minor') && !SND.inScale(73, 9, 'minor') && SND.inScale(79, 9, 'minor'), 'A minor (root given as 9)');
ok(SND.scaleNotes(0, 'pentatonic', 60, 72).join() === '60,62,64,67,69,72', 'C pentatonic from C4 to C5');
ok(SND.scaleNotes(0, 'chromatic', 60, 71).length === 12 && SND.scaleNotes(0, 'major', 60, 71).length === 7, 'chromatic 12, major 7 per octave');
ok(SND.inScale(61, 0, 'nonsense'), 'an unknown scale means all notes');

section('3. reading and writing note strings');
let p = T.parse('C5 - E5 . | G5 - - -');
ok(p.steps === 8 && p.events.length === 3, 'bar lines are ignored and every word is a step', p);
ok(p.events[0].s === 0 && p.events[0].l === 2 && p.events[0].tok === 'C5' && p.events[0].m === 72, 'a held note is one event, 2 steps long');
ok(p.events[2].s === 4 && p.events[2].l === 4 && p.events[1].s === 2 && p.events[1].l === 1, 'the rest after E5 is not part of it; G5 holds 4');
ok(T.parse('').steps === 0 && T.parse(null).events.length === 0 && T.parse(undefined).steps === 0, 'empty / missing');
ok(T.parse('300 . 9000').events[0].m === null && T.parse('300 . 9000').events[0].hz === 300, 'a number is a frequency, not a note');
ok(T.parse('H4 - C4').events[0].hz === null && T.parse('H4 - C4').events[0].l === 2, 'a word that makes no sound is kept (so it is not lost)');
ok(T.parse('. - C4').events.length === 1 && T.parse('- - C4').events[0].s === 2, 'a hold with nothing before it is ignored, like the engine');
ok(T.serialize(p.events, 8, 0) === 'C5 - E5 . G5 - - -', 'writes it back, no bar lines');
ok(T.serialize(p.events, 8, 4) === 'C5 - E5 . | G5 - - -', 'with a bar line every 4 steps');
ok(T.serialize(p.events, 8, 8) === 'C5 - E5 . G5 - - -', 'no bar line at the very end or when the bar is the whole song');
ok(T.serialize(p.events, 12, 0) === 'C5 - E5 . G5 - - - . . . .', 'longer than the notes: rests fill the rest');
ok(T.serialize(p.events, 5, 0) === 'C5 - E5 . G5', 'shorter: notes are cut');
ok(T.serialize([], 4, 0) === '. . . .' && T.serialize([], 0, 0) === '', 'nothing but rests');
/* every song in every starter reads and writes back to the same sound */
let songsChecked = 0, same = true, engineSame = true, detail = null;
for (const [k, v] of Object.entries(ST)) for (const [mid, def] of Object.entries(v.cart.music || {})) {
  const eng = DC.Audio.buildSong(def);
  M.trackList(def).forEach((tr, ti) => {
    const q = T.parse(tr.notes), back = T.serialize(q.events, q.steps, 0);
    if (tokens(back).join(' ') !== tokens(tr.notes).join(' ')) { same = false; detail = [k, mid, ti]; }
    const keys = Object.keys(eng.tracks[ti].at).map(Number), mine = q.events.filter((e) => e.hz);
    if (keys.length !== mine.length || !mine.every((e) => eng.tracks[ti].at[e.s] && eng.tracks[ti].at[e.s].len === e.l && near(eng.tracks[ti].at[e.s].f, e.hz, 1e-6))) { engineSame = false; detail = [k, mid, ti, 'engine']; }
    if (q.steps !== eng.tracks[ti].len) { engineSame = false; detail = [k, mid, ti, 'len']; }
  }); songsChecked++;
}
ok(songsChecked >= 2 && same, 'every real song (' + songsChecked + ') writes back to exactly the same words', detail);
ok(engineSame, 'and my reading of it matches the engine\'s: same notes, same lengths, same pitches, same song length', detail);

section('4. placing, erasing and resizing notes');
const base = T.parse('C4 - - - E4 - . .').events;   // C4 s0 l4, E4 s4 l2, 8 steps
let e = T.place(base, 8, 2, 1, 'G4');
ok(e.length === 3 && e[0].l === 2 && e[1].s === 2 && e[1].tok === 'G4', 'a note in the middle of another cuts the earlier one short', e.map((x) => [x.s, x.l, x.tok]));
e = T.place(base, 8, 4, 1, 'G4'); ok(e.length === 2 && e[1].tok === 'G4' && e[1].l === 1, 'a note on the start of another replaces it');
e = T.place(base, 8, 6, 5, 'A4'); ok(e.length === 3 && e[2].l === 2, 'it cannot run off the end (6 + 5 -> 2 steps)');
e = T.place(T.parse('C4 . . . E4 . . .').events, 8, 1, 6, 'G4'); ok(e[1].s === 1 && e[1].l === 3, 'or into the next note (stops at step 4)', e.map((x) => [x.s, x.l]));
ok(T.place(base, 8, 8, 1, 'G4') === base && T.place(base, 8, -1, 1, 'G4') === base && T.place(base, 8, NaN, 1, 'G4') === base, 'outside the song: nothing happens');
e = T.place([], 8, 3, 0, 'C4'); ok(e[0].l === 1, 'length 0 becomes 1');
e = T.place([], 8, 3, 2.9, 'C4'); ok(e[0].l === 2, 'a fractional length is rounded down');
ok(T.place([], 8, 0, 1, 'C#4')[0].m === 61 && T.place([], 8, 0, 1, '3500')[0].hz === 3500, 'a placed note knows its pitch');
ok(T.erase(base, 2).length === 1 && T.erase(base, 2)[0].tok === 'E4', 'erasing any step of a held note removes the whole note');
ok(T.erase(base, 6).length === 2 && T.erase(base, 7).length === 2, 'erasing a rest does nothing');
e = T.resize(base, 8, 0, 2); ok(e[0].l === 2 && e[1].l === 2, 'shorten a note');
e = T.resize(base, 8, 0, 9); ok(e[0].l === 4, 'a longer note stops at the next one', e[0].l);
e = T.resize(base, 8, 4, 9); ok(e[1].l === 4, 'or at the end of the song');
ok(T.resize(base, 8, 3, 2) .every((x, i) => x.l === base[i].l), 'resizing where no note starts changes nothing');
e = T.setSteps(base, 5); ok(e.length === 2 && e[1].l === 1, 'a shorter song cuts the note that crosses the end');
e = T.setSteps(base, 3); ok(e.length === 1 && e[0].l === 3, 'and drops notes that start past it');
e = T.transpose(T.parse('C4 - E4 3500').events, 12); ok(e[0].tok === 'C5' && e[0].l === 2 && e[1].tok === 'E5' && e[2].tok === '3500', 'transpose moves notes, keeps lengths, leaves drum words alone');
ok(T.transpose(T.parse('C4').events, -100)[0].m === 0 && T.transpose(T.parse('C4').events, 200)[0].m === 127, 'and stays inside the note range');
ok(JSON.stringify(T.span(T.parse('C4 E5 G3 3500').events)) === '{"lo":55,"hi":76}' && T.span(T.parse('3500 .').events) === null, 'range of notes in use');
const keep = JSON.stringify(base); T.place(base, 8, 2, 1, 'G4'); T.erase(base, 0); T.resize(base, 8, 0, 1); T.transpose(base, 3); ok(JSON.stringify(base) === keep, 'none of these change the list they are given');

section('5. song operations');
let d = game();
ok(M.steps(d.cart.music.overworld) === 32 && M.perBar(d.cart.music.overworld) === 8 && M.perBar({ div: 4 }) === 16 && M.perBar({}) === 8, 'song length and bar length');
ok(M.usage(d.cart, 'overworld').join() === 'overworld' && M.usage(d.cart, 'nope').length === 0, 'which levels play a song');
const u0 = d.undos.length; M.setNotes(d, 'overworld', 0, T.parse('C4 D4').events, 32);
ok(d.undos.length === u0 + 1 && T.parse(d.cart.music.overworld.tracks[0].notes).steps === 32 && d.cart.music.overworld.tracks[0].notes.includes('|'), 'writing notes is one undo step, with bar lines');
d.undo(); ok(d.cart.music.overworld.tracks[0].notes.startsWith('C5 - E5'), 'and undoes');
let ti = M.addTrack(d, 'overworld', 'drums');
ok(ti === 2 && d.cart.music.overworld.tracks[2].wave === 'noise' && T.parse(d.cart.music.overworld.tracks[2].notes).steps === 32 && errs(d).length === 0, 'a new track matches the song length and is valid', errs(d));
M.moveTrack(d, 'overworld', 2, -1); ok(d.cart.music.overworld.tracks[1].wave === 'noise' && d.cart.music.overworld.tracks[2].wave === 'triangle', 'tracks can be moved');
ok(M.moveTrack(d, 'overworld', 0, -1) === 0, 'moving past the end stays put');
M.removeTrack(d, 'overworld', 1); ok(d.cart.music.overworld.tracks.length === 2, 'tracks can be removed');
let msg = ''; const one = game(); one.set(['music', 'x'], M.blank(2)); try { M.removeTrack(one, 'x', 0); } catch (er) { msg = er.message; }
ok(/at least one/.test(msg), 'but not the last one', msg);
d = game(); M.setLength(d, 'overworld', 48);
ok(M.trackList(d.cart.music.overworld).every((t) => T.parse(t.notes).steps === 48) && T.parse(d.cart.music.overworld.tracks[0].notes).events.length === T.parse(game().cart.music.overworld.tracks[0].notes).events.length, 'a longer song: every track gets longer, no notes lost');
M.setLength(d, 'overworld', 16); ok(M.trackList(d.cart.music.overworld).every((t) => T.parse(t.notes).steps === 16) && errs(d).length === 0, 'a shorter one cuts them all and stays valid');
d = game(); M.setLength(d, 'overworld', 2); ok(M.steps(d.cart.music.overworld) === 4, 'but never below 4 steps'); d.undo(); ok(M.steps(d.cart.music.overworld) === 32, 'length changes undo in one step');
d = game(); M.rename(d, 'overworld', 'forest');
ok(d.cart.music.forest && !d.cart.music.overworld && d.cart.scenes.overworld.music === 'forest' && errs(d).length === 0, 'renaming a song updates the levels that play it');
d.undo(); ok(d.cart.music.overworld && d.cart.scenes.overworld.music === 'overworld', 'in one undo step');
msg = ''; try { M.rename(d, 'overworld', 'cave'); } catch (er) { msg = er.message; } ok(/already exists/.test(msg), 'a name already taken is refused', msg);
msg = ''; try { M.rename(d, 'overworld', 'bad name!'); } catch (er) { msg = er.message; } ok(/letters, numbers/.test(msg), 'so is one with odd characters');
msg = ''; try { M.rename(d, 'nope', 'x'); } catch (er) { msg = er.message; } ok(/no song/.test(msg), 'and one that does not exist');
d = game(); M.remove(d, 'cave');
ok(!d.cart.music.cave && d.cart.scenes.cave.music === undefined && errs(d).length === 0, 'deleting a song leaves its levels without music, valid');
d.undo(); ok(d.cart.music.cave && d.cart.scenes.cave.music === 'cave', 'and undoes together');
d = game(); const cp = M.duplicate(d, 'cave'); ok(cp !== 'cave' && JSON.stringify(d.cart.music[cp]) === JSON.stringify(d.cart.music.cave), 'copying a song');
d.cart.music[cp].tracks[0].v = 0.3; ok(d.cart.music.cave.tracks[0].v !== 0.3, 'the copy is separate');
const solo = M.preview(game().cart.music.overworld, { solo: 1 }); ok(solo.tracks.length === 1 && solo.tracks[0].wave === 'triangle', 'solo plays one track');
const mute = M.preview(game().cart.music.overworld, { mute: [0] }); ok(mute.tracks.length === 1 && mute.tracks[0].wave === 'triangle', 'mute leaves the others');
ok(M.preview(game().cart.music.overworld).tracks.length === 2 && M.preview(game().cart.music.overworld, { mute: [0, 1] }).tracks.length === 0, 'no options = everything; muting all = silence');
d = game(); d.set(['music', 'old'], { bpm: 100, wave: 'square', v: 0.08, notes: 'C4 D4 E4 F4' });
ok(M.needsPrepare(d.cart.music.old) && !M.needsPrepare(d.cart.music.overworld), 'a song written as one track is spotted');
const engBefore = JSON.stringify(DC.Audio.buildSong(d.cart.music.old).tracks[0].at), u1 = d.undos.length;
ok(M.prepare(d, 'old') === true && d.undos.length === u1 + 1, 'preparing it is one undo step');
ok(Array.isArray(d.cart.music.old.tracks) && d.cart.music.old.tracks[0].notes === 'C4 D4 E4 F4' && d.cart.music.old.tracks[0].v === 0.08 && !('notes' in d.cart.music.old) && d.cart.music.old.bpm === 100, 'the track moves into a list, the song keeps its tempo');
ok(JSON.stringify(DC.Audio.buildSong(d.cart.music.old).tracks[0].at) === engBefore && errs(d).length === 0, 'and it sounds exactly the same, and is valid');
ok(M.prepare(d, 'old') === false, 'preparing twice does nothing');

section('6. piano roll rows');
let rows = SND.rows({ wave: 'square' }, T.parse('C5 E5 G5').events);
ok(rows[0].m > rows[rows.length - 1].m && rows.some((r) => r.m === 72) && rows.length >= 25, 'rows run high to low and include the notes', [rows.length, rows[0].m, rows[rows.length - 1].m]);
rows = SND.rows({ wave: 'square' }, T.parse('C2 C8').events); ok(rows.some((r) => r.m === 36) && rows.some((r) => r.m === 108), 'a wide song gets a wide roll');
ok(SND.rows({ wave: 'triangle' }, []).some((r) => r.m === 48) && SND.rows({ wave: 'square' }, []).some((r) => r.m === 72), 'an empty bass track opens low, an empty lead high');
ok(rows.find((r) => r.m === 61 - 12) .black && rows.find((r) => r.m === 72).c && rows.find((r) => r.m === 72).label === 'C5', 'rows know black keys, Cs and their names');
rows = SND.rows({ wave: 'noise' }, T.parse('9000 3500 300 777').events);
ok(rows.map((r) => r.hz).join() === '9000,3500,1500,777,300' && rows.find((r) => r.hz === 777).label === '777 Hz', 'drum lanes: the usual four, plus any other pitch in use', rows.map((r) => r.hz));
ok(SND.rows({ wave: 'noise' }, T.parse('9005').events).length === 4, 'a pitch within 1% of a lane uses that lane');

section('7. sound effects');
ok(JSON.stringify(X.norm({})) === JSON.stringify({ wave: 'square', f: [440], d: 0.15, v: 0.25 }), 'an empty sound gets sensible defaults');
ok(X.norm({ noise: true, wave: 'sine' }).wave === 'noise' && X.norm({ wave: 'banjo' }).wave === 'square', 'noise flag wins; an unknown wave becomes square');
ok(X.norm({ f: 600 }).f.join() === '600' && X.norm({ f: [100, 'x', -5, 0, 300] }).f.join() === '100,300', 'a single pitch or a list; junk is dropped');
let nn = X.norm({ f: [1, 99999], d: 99, v: 9 }); ok(nn.f.join() === '30,9000' && nn.d === 3 && nn.v === 1, 'pitch, length and volume are limited');
nn = X.norm({ d: 0, v: -1 }); ok(nn.d === 0.15 && nn.v === 0, 'a length of 0 falls back; negative volume is 0');
ok(X.mode({ f: [440] }) === 'steady' && X.mode({ f: [440, 880] }) === 'slide' && X.mode({ f: [1, 2, 3] }) === 'steps' && X.mode({ f: 440 }) === 'steady', 'one pitch, slide, or steps');
ok(X.withMode({ f: [200, 800] }, 'steady').f.join() === '200' && X.withMode({ f: [200] }, 'slide').f.join() === '200,300', 'switch modes keeping what it can');
ok(X.withMode({ f: [200, 800] }, 'steps').f.join() === '200,400,800' && X.withMode({ f: [200] }, 'steps').f.length === 3 && X.withMode({ f: [1, 2, 3, 4] }, 'steps').f.length === 4, 'a slide becomes steps through the middle');
ok(X.mode(X.withMode({ f: [200] }, 'steps')) === 'steps' && X.mode(X.withMode({ f: [200, 800, 400] }, 'slide')) === 'slide', 'and the mode really is what was asked');
let c = X.curve({ f: [200, 800], d: 1 }, 5); ok(near(c[0], 200) && near(c[4], 800) && near(c[2], 400, 1e-6), 'a slide is a smooth curve through the geometric middle', c);
c = X.curve({ f: [100, 200, 400, 800] }, 8); ok(c.join() === '100,100,200,200,400,400,800,800', 'steps hold each pitch for an equal share', c);
ok(X.curve({ f: [440] }, 3).every((x) => x === 440) && X.curve({ f: [440, 880] }, 1).length === 1, 'steady is flat; one sample works');
const env = X.envelope({ v: 0.25 }, 10); let falling = true; for (let i = 1; i < 10; i++) if (!(env[i] < env[i - 1])) falling = false;
ok(env[0] === 1 && falling && env[9] < 0.1, 'loudness falls from full to near silence', env);
ok(X.envelope({ v: 0 }, 4).every((x) => isFinite(x)), 'a silent sound does not break the graph');
ok(near(X.hzToY(X.FMIN, 100), 100) && near(X.hzToY(X.FMAX, 100), 0) && X.hzToY(300, 100) > X.hzToY(600, 100), 'height on the graph: low pitch at the bottom, higher further up');
let inv = true; for (const hz of [40, 100, 440, 2000, 8000]) if (!near(X.yToHz(X.hzToY(hz, 200), 200), hz, 1e-6)) inv = false; ok(inv, 'pitch -> height -> pitch round-trips');
ok(X.yToHz(-50, 100) === X.FMAX && X.yToHz(500, 100) === X.FMIN, 'dragging off the graph is limited');
ok(near(X.snap(450), 440) && near(X.snap(1000), N.freq(N.ofFreq(1000))), 'snap to the nearest note');

section('8. making sound effects');
const cartWith = (id, def) => { const dd = game(); dd.set(['sounds', id], def); return dd; };
for (const k of X.kinds) {
  const a = X.make(k.id, 7), b = X.make(k.id, 7), cc = X.make(k.id, 8);
  ok(JSON.stringify(a) === JSON.stringify(b), k.id + ': same seed, same sound');
  ok(JSON.stringify(a) !== JSON.stringify(cc), k.id + ': a different seed, a different one');
  ok(errs(cartWith('t', a)).length === 0 && JSON.stringify(a) === JSON.stringify(X.norm(a)), k.id + ': valid and already clean', errs(cartWith('t', a)));
}
const mk = (k, s) => X.make(k, s);
ok(mk('coin', 1).f[1] > mk('coin', 1).f[0] && X.mode(mk('coin', 1)) === 'slide', 'a coin slides up');
ok(mk('jump', 1).f[1] > mk('jump', 1).f[0] && mk('laser', 1).f[1] < mk('laser', 1).f[0], 'a jump slides up, a laser slides down');
ok(mk('boom', 1).wave === 'noise' && mk('boom', 1).d >= 0.45 && mk('hit', 1).wave === 'noise' && mk('hit', 1).d < 0.2, 'a boom is long noise, a hit is short noise');
ok(X.mode(mk('powerup', 1)) === 'steps' && mk('powerup', 1).f.length === 4 && mk('powerup', 1).f.every((x, i, a) => !i || x > a[i - 1]), 'a power-up steps upward');
ok(X.mode(mk('blip', 1)) === 'steady' && mk('blip', 1).d < 0.08, 'a blip is one short pitch');
ok(X.mode(mk('deny', 1)) === 'steps' && mk('deny', 1).f[1] < mk('deny', 1).f[0], 'a "no" dips down');
ok(mk('nonsense', 1).wave === 'square', 'an unknown kind still makes a sound');
let spread = new Set(); for (let sd = 0; sd < 30; sd++) spread.add(mk('coin', sd).f[0]); ok(spread.size > 15, 'seeds give real variety (' + spread.size + ' different coins out of 30)');
const base0 = { wave: 'square', f: [440, 880], d: 0.2, v: 0.2 }, m1 = X.mutate(base0, 5, 0.25), m2 = X.mutate(base0, 5, 0.25);
ok(JSON.stringify(m1) === JSON.stringify(m2) && JSON.stringify(m1) !== JSON.stringify(X.norm(base0)), 'mutate: repeatable, and it does change things');
ok(m1.wave === 'square' && m1.v === 0.2 && m1.f.length === 2 && Math.abs(m1.f[0] - 440) <= 440 * 0.25 + 1, 'keeping the wave and volume, and moving pitch only a little');
ok(JSON.stringify(X.mutate(base0, 5, 0).f) === '[440,880]', 'a mutation of 0 changes nothing');
d = game(); const sid = X.add(d, 'zap', mk('laser', 2)); ok(sid === 'zap' && d.cart.sounds.zap && errs(d).length === 0, 'adding a sound');
ok(X.add(d, 'zap', mk('coin', 1)) === 'zap-2' || X.add(d, 'zap', mk('coin', 1)) !== 'zap', 'a name already used gets a different id');
const dup = X.duplicate(d, 'zap'); ok(dup !== 'zap' && JSON.stringify(d.cart.sounds[dup]) === JSON.stringify(d.cart.sounds.zap), 'copying a sound');
d = game(); const uses = X.usage(d.cart, 'coin'); ok(uses >= 0 && X.usage(d.cart, 'nope') === 0, 'usage counting works', uses);
d.cart.prefabs[d.cart.meta.player].rules = (d.cart.prefabs[d.cart.meta.player].rules || []).concat([{ on: 'button', button: 'x', then: [{ act: 'sound', id: 'coin' }] }]);
ok(X.usage(d.cart, 'coin') === uses + 1, 'a rule that plays a sound counts as a use');
S.renameAsset(d, 'sound', 'coin', 'chime'); ok(d.cart.sounds.chime && !d.cart.sounds.coin && X.usage(d.cart, 'chime') === uses + 1 && errs(d).length === 0, 'renaming a sound updates the rules that play it');

section('9. making a song');
const gen = (o) => SND.gen.song(o), allErrs = (def) => { const dd = game(); dd.set(['music', 'g'], def); return errs(dd); };
for (const style of Object.keys(SND.styles)) {
  const g = gen({ style, seed: 3 }); ok(allErrs(g).length === 0 && g.tracks.length === 4, style + ': a valid four-track song', allErrs(g));
}
const g1 = gen({ style: 'happy', seed: 11, root: 2 }), g2 = gen({ style: 'happy', seed: 11, root: 2 }), g3 = gen({ style: 'happy', seed: 12, root: 2 });
ok(JSON.stringify(g1) === JSON.stringify(g2) && JSON.stringify(g1) !== JSON.stringify(g3), 'same seed + options = same song; another seed = another song');
ok(M.trackList(g1).every((t) => T.parse(t.notes).steps === 32) && M.trackList(gen({ bars: 8, seed: 1 })).every((t) => T.parse(t.notes).steps === 64), 'four bars = 32 steps, eight = 64, every track the same length');
ok(g1.bpm === SND.styles.happy.bpm && gen({ style: 'sad', seed: 1 }).bpm === 84 && gen({ bpm: 99, seed: 1 }).bpm === 99, 'tempo from the mood, or your own');
for (const [style, root] of [['happy', 0], ['sad', 9], ['adventure', 2], ['tense', 4], ['calm', 7], ['happy', 11]]) {
  const g = gen({ style, root, seed: 5 }), lead = T.parse(g.tracks[0].notes).events, sc = SND.styles[style].scale;
  ok(lead.length >= 8 && lead.every((x) => x.m != null && SND.inScale(x.m, root, sc)), style + ' in key ' + N.name(root).replace(/-?\d/, '') + ': every lead note is in the scale', lead.filter((x) => !SND.inScale(x.m, root, sc)).map((x) => x.tok));
}
const gg = gen({ style: 'happy', seed: 4 });
ok(T.parse(gg.tracks[1].notes).events.every((x) => x.m >= 30 && x.m <= 52) && T.parse(gg.tracks[0].notes).events.every((x) => x.m >= 58 && x.m <= 86), 'bass low, lead high');
ok(T.parse(gg.tracks[3].notes).events.every((x) => ['300', '3500', '9000'].includes(x.tok)) && gg.tracks[3].wave === 'noise', 'drums use the three standard drum sounds');
ok(T.parse(gg.tracks[0].notes).events.slice(-1)[0].m % 12 === 0, 'the melody ends on the key note (C)');
ok(JSON.stringify(gen({ style: 'happy', seed: 1, root: 0 }).tracks[0]) !== JSON.stringify(gen({ style: 'happy', seed: 1, root: 5 }).tracks[0]), 'another key is a different tune');
const eng = DC.Audio.buildSong(gg); ok(eng.tracks.length === 4 && eng.total === 32 && eng.tracks.every((t) => Object.keys(t.at).length > 0), 'the engine plays it: four tracks, 32 steps, all with notes');
ok(gen({ seed: 1 }).tracks.every((t) => t.v > 0 && t.v < 0.2), 'track volumes are sensible');
let uniq = new Set(); for (let sd = 0; sd < 20; sd++) uniq.add(gen({ style: 'happy', seed: sd }).tracks[0].notes); ok(uniq.size >= 15, 'seeds give variety (' + uniq.size + ' different melodies out of 20)');

section('10. validation of songs and sounds');
const chk = (mut) => { const dd = game(); mut(dd.cart); const r = S.check(dd.cart); return { e: r.errors.map((x) => x.path + ': ' + x.msg), w: r.warnings.map((x) => x.path + ': ' + x.msg) }; };
let v = chk((c) => { c.music.t = { bpm: 120, div: 2, loop: true, tracks: [{ wave: 'noise', v: 0.05, notes: 'C#4 Bb3 f2 440 9000 12.5 . - | G9 c-1' }] }; });
ok(v.e.length === 0 && v.w.length === 0, 'every kind of valid word is accepted (notes, sharps, flats, numbers, rest, hold, bar line)', v);
v = chk((c) => { c.music.t = { tracks: [{ wave: 'square', notes: 'C4 H4 D4' }] }; });
ok(v.e.length === 0 && v.w.some((x) => /^music\.t\.tracks\[0\]\.notes: "H4" at step 2 is not a note, so it is silent/.test(x)), 'a word that is not a note is a warning that says which and where', v.w);
v = chk((c) => { c.music.t = { tracks: [{ notes: 'H1 H2 H3 H4 H5 C4' }] }; });
ok(v.w.length === 1 && /"H1" at step 1, "H2" at step 2, "H3" at step 3 and 2 more are not notes/.test(v.w[0]), 'many bad words are summarised in one warning', v.w);
v = chk((c) => { c.music.t = { tracks: [{ notes: 'C4 C' }] }; }); ok(v.w.length === 1 && /"C" at step 2/.test(v.w[0]), 'a note with no octave is caught');
v = chk((c) => { c.music.t = { tracks: [{ notes: 123 }] }; }); ok(v.e.some((x) => /^music\.t\.tracks\[0\]\.notes: must be text/.test(x)), 'notes that are not text are an error');
v = chk((c) => { c.music.t = { wave: 'square', v: 0.1, notes: 'C4 Z9' }; }); ok(v.w.some((x) => /^music\.t\.notes: "Z9"/.test(x)), 'a song written as one track is checked too');
v = chk((c) => { c.music.t = { bpm: 5, tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.bpm/.test(x)), 'a tempo below 20 is an error');
v = chk((c) => { c.music.t = { bpm: 999, tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.bpm/.test(x)), 'and above 400');
v = chk((c) => { c.music.t = { bpm: '120', tracks: [{ notes: 'C4' }] }; }); ok(v.e.length === 0, 'a tempo written as "120" still works (the engine reads it)');
v = chk((c) => { c.music.t = { bpm: 'fast', tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.bpm/.test(x)), 'a tempo that is a word is an error');
v = chk((c) => { c.music.t = { div: 0, tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.div/.test(x)), 'steps per beat of 0 is an error');
v = chk((c) => { c.music.t = { div: 2.5, tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.div/.test(x)), 'and so is 2.5');
v = chk((c) => { c.music.t = { loop: 'yes', tracks: [{ notes: 'C4' }] }; }); ok(v.e.some((x) => /^music\.t\.loop/.test(x)), 'loop must be true or false');
v = chk((c) => { c.music.t = { tracks: [{ wave: 'saw', notes: 'C4' }] }; }); ok(v.e.length === 0 && v.w.some((x) => /^music\.t\.tracks\[0\]\.wave: unknown wave "saw"/.test(x)), 'a misspelt wave is a warning (it would play as square)');
v = chk((c) => { c.sounds.t = { wave: 'saw', f: 440, d: 0.1 }; }); ok(v.e.length === 0 && v.w.some((x) => /^sounds\.t\.wave: unknown wave "saw"/.test(x)), 'same for a sound effect');
v = chk((c) => { c.sounds.t = { wave: 'square', f: [0, 300], d: 0.1 }; }); ok(v.w.some((x) => /^sounds\.t\.f/.test(x)), 'a pitch of 0 is a warning');
v = chk((c) => { c.sounds.t = { wave: 'square', f: [], d: 0.1 }; }); ok(v.w.some((x) => /^sounds\.t\.f/.test(x)), 'an empty pitch list too');
v = chk((c) => { c.sounds.t = { wave: 'square', f: 440, d: -1 }; }); ok(v.w.some((x) => /^sounds\.t\.d/.test(x)), 'a length below 0 too');
v = chk((c) => { c.sounds.t = { wave: 'noise', f: [3000, 300], d: 0.1, v: 0.3 }; c.sounds.u = { noise: true, f: 800, d: 0.05 }; }); ok(v.e.length === 0 && v.w.length === 0, 'noise written either way is fine');
let clean = true; for (const k of X.kinds) { const r = chk((c) => { c.sounds.t = X.make(k.id, 9); }); if (r.e.length || r.w.length) { clean = false; } } ok(clean, 'every sound the generator makes passes with no warnings at all');
clean = true; for (const st of Object.keys(SND.styles)) for (const bars of [4, 8]) { const r = chk((c) => { c.music.t = SND.gen.song({ style: st, bars, seed: 2 }); }); if (r.e.length || r.w.length) clean = false; } ok(clean, 'and so does every song it makes (5 moods x 2 lengths)');
for (const [k, vv] of Object.entries(ST)) ok(S.check(vv.cart).warnings.length === 0, 'starter "' + k + '" still has no warnings');

section('11. working out the key, and songs of any length');
const keyOf = (notes, bass) => SND.detectKey({ tracks: [{ wave: 'square', notes }].concat(bass ? [{ wave: 'triangle', notes: bass }] : []) });
ok(JSON.stringify(keyOf('C4 E4 G4 C5 D4 F4 A4 C5 C4')) === '{"root":0,"scale":"major"}', 'a C major tune is C major');
ok(JSON.stringify(keyOf('A3 C4 E4 A4 B3 D4 E4 A4 A3')) === '{"root":9,"scale":"minor"}', 'an A minor tune is A minor, not its relative C major (the ending note decides)');
ok(JSON.stringify(keyOf('G4 B4 D5 G5 A4 C5 E5 F#4 G4')) === '{"root":7,"scale":"major"}', 'G major, with its F#');
ok(keyOf('E4 G4 B4 E5 F#4 A4 D5 E4').scale === 'minor' && keyOf('E4 G4 B4 E5 F#4 A4 D5 E4').root === 4, 'E minor');
ok(JSON.stringify(SND.detectKey({ tracks: [{ wave: 'noise', notes: '300 9000 3500' }] })) === '{"root":0,"scale":"chromatic"}', 'drums alone, or nothing, give no key');
ok(SND.detectKey({ tracks: [{ wave: 'square', notes: '. . . .' }] }).scale === 'chromatic', 'an empty song gives no key');
ok(SND.detectKey({ wave: 'square', notes: 'C4 D4 E4 C4' }).scale === 'major', 'a song written as one track works');
for (const [style, root] of [['happy', 0], ['sad', 9], ['adventure', 2], ['calm', 7]]) { const k = SND.detectKey(SND.gen.song({ style, root, seed: 5 })); ok(SND.inScale(root, k.root, k.scale) && (k.root === root || k.scale !== (SND.styles[style].scale === 'minor' ? 'minor' : 'x')), 'a generated ' + style + ' song in ' + N.name(root).replace(/-?\d/, '') + ' is detected as a key containing its tonic', k); }
for (const bars of [1, 2, 3, 5, 12, 16]) { const g = SND.gen.song({ bars, seed: 2 }); ok(M.trackList(g).every((t) => T.parse(t.notes).steps === bars * 8) && allErrs(g).length === 0, bars + ' bar' + (bars === 1 ? '' : 's') + ': every track ' + bars * 8 + ' steps and valid'); }
ok(M.steps(SND.gen.song({ bars: 99, seed: 1 })) === 128 && M.steps(SND.gen.song({ bars: 0, seed: 1 })) === 32 && M.steps(SND.gen.song({ bars: 'x', seed: 1 })) === 32, 'silly lengths are limited (16 bars at most; nonsense = 4)');
ok(T.parse(SND.gen.song({ bars: 1, seed: 3 }).tracks[0].notes).events.slice(-1)[0].m % 12 === 0, 'even a one-bar song ends on the key note');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
