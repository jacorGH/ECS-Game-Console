/* The audio engine's channels and levels, checked against a fake Web Audio.  node v2/test/audio.js */
global.window = global; global.DC = {};
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); } };
const section = (t) => console.log('\n' + t);

/* a tiny stand-in for AudioContext that records how nodes are connected */
let nodes = [];
class Node {
  constructor(kind) { this.kind = kind; this.to = []; this.gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; this.Q = { value: 0 }; this.fftSize = 2048; nodes.push(this); }
  connect(n) { this.to.push(n); return n; }
  start() {} stop() {} getByteTimeDomainData(b) { b.fill(128); if (this.level) b[3] = 128 + Math.round(this.level * 127); }
}
class Ctx {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = new Node('dest'); }
  createGain() { return new Node('gain'); } createOscillator() { return new Node('osc'); } createBiquadFilter() { return new Node('filter'); }
  createAnalyser() { return new Node('analyser'); } createBufferSource() { return new Node('src'); }
  createBuffer(n, len) { return { getChannelData: () => new Float32Array(len) }; } resume() {}
}
window.AudioContext = Ctx;
require('../../js/audio.js');
const A = DC.Audio;
const reaches = (from, target, seen = new Set()) => { if (from === target) return true; if (seen.has(from)) return false; seen.add(from); return from.to.some((n) => reaches(n, target, seen)); };
const lastGain = () => nodes.filter((n) => n.kind === 'gain').pop();

section('1. the graph: effects and music have their own channels');
A.unlock();
ok(A.ctx && A.out && A.sfx && A.mus, 'unlock builds master, effects and music channels');
ok(A.sfx.to.includes(A.out) && A.mus.to.includes(A.out) && A.out.to.includes(A.ctx.destination), 'both channels feed the master, which feeds the speakers');
ok(A.sfx !== A.mus, 'they are separate');
nodes = [];
A.play('coin', { wave: 'square', f: [988, 1480], d: 0.1, v: 0.14 });
const g1 = nodes.find((n) => n.kind === 'gain');
ok(g1 && g1.to.includes(A.sfx) && !g1.to.includes(A.mus), 'a sound effect is routed to the effects channel');
nodes = [];
A.play('boom', { wave: 'noise', f: [3000, 700], d: 0.1, v: 0.3 });
ok(nodes.find((n) => n.kind === 'gain').to.includes(A.sfx), 'so is a noise sound');
nodes = [];
A.playMusic('tune', { bpm: 120, div: 2, tracks: [{ wave: 'square', v: 0.06, notes: 'C5 - E5 G5' }] });
A.tick();
const tone = nodes.filter((n) => n.kind === 'gain').find((n) => n.to.includes(A.mus));
ok(tone && !nodes.filter((n) => n.kind === 'gain').some((n) => n.to.includes(A.sfx)), 'music notes go to the music channel, never the effects one');
A.stopMusic();

section('2. levels');
ok(A.out.gain.value === 0.5 && A.sfx.gain.value === 1 && A.mus.gain.value === 1, 'defaults are exactly the old sound: master 0.5, channels 1');
A.setLevels({ music: 0.4, sfx: 1.5 });
ok(A.mus.gain.value === 0.4 && A.sfx.gain.value === 1.5 && A.out.gain.value === 0.5, 'music quieter and effects louder, independently');
A.setLevels({ master: 0.5 });
ok(A.out.gain.value === 0.25 && A.mus.gain.value === 0.4, 'master scales the classic volume and leaves the balance alone');
A.setLevels({ muted: true }); ok(A.out.gain.value === 0, 'mute silences the master');
A.setLevels({ muted: false }); ok(A.out.gain.value === 0.25, 'and unmuting brings it back');
A.setMuted(true); ok(A.out.gain.value === 0 && A.muted, 'the old setMuted still works (v1 uses it)'); A.setMuted(false);
A.setLevels({ music: 99, sfx: -4, master: 7 });
ok(A.mix.music === 2 && A.mix.sfx === 0 && A.master === 1, 'out-of-range values are limited (music/effects 0-2, master 0-1)');
A.setLevels({ music: 'loud', sfx: NaN });
ok(A.mix.music === 2 && A.mix.sfx === 0, 'nonsense is ignored, not applied');
A.setLevels({ master: 1, music: 1, sfx: 1, muted: false });

section('3. music volume: per track and per song, and live changes');
const song = { bpm: 120, div: 2, vol: 0.5, tracks: [{ wave: 'square', v: 0.06, notes: 'C5 - E5 G5' }, { wave: 'triangle', v: 0.12, notes: 'C3 - - -' }] };
ok(Math.abs(A.trackLevel(song, 0) - 0.03) < 1e-9 && Math.abs(A.trackLevel(song, 1) - 0.06) < 1e-9, 'a track plays at its own level times the song volume');
ok(A.trackLevel({ tracks: [{ notes: 'C4' }] }, 0) === 0.1, 'a track with no level uses the classic 0.1');
ok(A.trackLevel({ v: 0.2, notes: 'C4' }, 0) === 0.2 && A.trackLevel({ v: 0, notes: 'C4' }, 0) === 0, 'a one-track song works, and a level of 0 really is silent');
ok(A.trackLevel({ vol: 'x', tracks: [{ v: 0.1 }] }, 0) === 0.1, 'a broken song volume falls back to 1');
A.playMusic('s', song);
ok(A.song.tracks[0].v === A.trackLevel(song, 0) && A.song.tracks[1].v === A.trackLevel(song, 1), 'the playing song uses those levels');
const timer1 = A.timer, pos = A.song.pos;
A.playMusic('s', Object.assign({}, song, { vol: 1, tracks: [{ wave: 'square', v: 0.2, notes: 'C5 - E5 G5' }, song.tracks[1]] }));
ok(A.timer === timer1 && A.song.pos === pos, 'asking for the same song again does not restart it');
ok(A.song.tracks[0].v === 0.2 && A.song.tracks[1].v === 0.12, '...but it picks up the new volumes straight away');
A.stopMusic();
A.playMusic('one', { bpm: 100, v: 0.05, vol: 2, notes: 'A4 - - -' });
ok(Math.abs(A.song.tracks[0].v - 0.1) < 1e-9, 'a one-track song honours the song volume too');
A.stopMusic();

section('4. meters');
ok(A.peak('sfx') === 0 && A.peak('music') === 0 && A.peak('nope') === 0, 'silence reads 0, and an unknown channel is 0');
A.tap.sfx.level = 0.5; ok(Math.abs(A.peak('sfx') - 0.5) < 0.02 && A.peak('music') === 0, 'a channel\'s meter reads only that channel');
A.tap.master.level = 1; ok(A.peak('master') > 0.95, 'the master meter reads too');
ok(A.tap.sfx.to.length === 0 && A.sfx.to.includes(A.tap.sfx), 'meters only listen: nothing flows out of them');

section('5. before the audio is unlocked');
const B = (() => { DC.Audio = undefined; delete require.cache[require.resolve('../../js/audio.js')]; require('../../js/audio.js'); return DC.Audio; })();
B.setLevels({ music: 0.3, sfx: 1.7, master: 0.6 });
ok(B.mix.music === 0.3 && B.master === 0.6 && !B.out, 'levels can be set before any sound is allowed to play');
B.unlock();
ok(B.mus.gain.value === 0.3 && B.sfx.gain.value === 1.7 && Math.abs(B.out.gain.value - 0.3) < 1e-9, 'and are applied the moment audio starts');
B.playMusic('early', { bpm: 100, tracks: [{ wave: 'square', v: 0.1, notes: 'C4 D4' }] });
ok(B.songName === 'early', 'music asked for early plays once unlocked');
B.stopMusic();

section('6. editing a song while it plays');
A.stopMusic(); A.ctx.currentTime = 0;
const tune = (notes, extra) => Object.assign({ bpm: 120, div: 2, tracks: [{ wave: 'square', v: 0.1, notes }] }, extra || {});
ok(A.updateSong(tune('C4 D4')) === false, 'nothing playing: nothing to update');
A.playMusic('ed', tune('C4 . E4 . G4 . C5 .'));
const T0 = A.timer; A.ctx.currentTime = 0.6; A.tick();
const posBefore = A.song.pos;
ok(A.updateSong(tune('C4 . E4 . G4 . C5 . A4 - - -', { bpm: 240 })) === true, 'updateSong accepts an edited song');
ok(A.timer === T0 && A.song.pos === posBefore, 'it does not restart: same timer, same place in the song');
ok(A.song.total === 12 && A.song.tracks[0].at[8] && A.song.tracks[0].at[8].len === 4, 'new notes are in (a held note at step 8, 4 steps long)', A.song.tracks[0].at);
ok(Math.abs(A.song.step - 0.125) < 1e-9, 'the new tempo applies (240 bpm = 0.125 s a step)');
A.song.pos = 10; A.updateSong(tune('C4 D4 E4 F4'));
ok(A.song.total === 4 && A.song.pos === 2, 'a shorter song wraps the position instead of running off the end', [A.song.total, A.song.pos]);
A.updateSong(tune('C4 D4', { loop: false })); ok(A.song.loop === false, 'the loop setting changes live');
A.stopMusic();

section('7. starting somewhere, and where we are');
A.ctx.currentTime = 0;
A.playMusic('s', tune('C4 D4 E4 F4 G4 A4 B4 C5'), 5); ok(A.song.pos === 5, 'start at step 5');
A.stopMusic(); A.playMusic('s', tune('C4 D4 E4 F4'), 9); ok(A.song.pos === 1, 'a start past the end wraps (9 of 4 = 1)');
A.stopMusic(); A.playMusic('s', tune('C4 D4 E4 F4'), -1); ok(A.song.pos === 3, 'a negative start counts from the end');
A.stopMusic(); A.playMusic('s', tune('C4 D4 E4 F4'), 'x'); ok(A.song.pos === 0, 'nonsense starts at the beginning');
A.stopMusic(); ok(A.songPos() === -1, 'nothing playing: -1');
A.ctx.currentTime = 0; A.playMusic('p', tune('C4 D4 E4 F4 G4 A4 B4 C5'));
ok(A.songPos() === 0, 'just started, not yet audible: the first step (not the end of the loop)', A.songPos());
A.ctx.currentTime = 1.06; A.tick();
ok(Math.abs(A.songPos() - 4) < 1e-9, 'one second in at 120 bpm / 2 steps per beat: step 4', A.songPos());
A.ctx.currentTime = 1.185; A.tick();
ok(Math.abs(A.songPos() - 4.5) < 1e-9, 'and it moves smoothly between steps (4.5)', A.songPos());
A.ctx.currentTime = 2.3; A.tick();
const wrapped = A.songPos(); ok(wrapped >= 0 && wrapped < 8, 'it wraps with the loop and stays in range', wrapped);
A.stopMusic(); A.playMusic('q', tune('C4 D4 E4 F4 G4 A4 B4 C5'), 6); ok(A.songPos() === 6, 'starting at step 6 reports 6 until audible');
A.stopMusic();

section('8. hearing a single note');
nodes = [];
A.blip('square', 440, 0.2, 0.1);
const bg = nodes.filter((n) => n.kind === 'gain').find((n) => n.to.includes(A.mus));
ok(bg && nodes.some((n) => n.kind === 'osc'), 'a note is an oscillator on the music channel');
nodes = []; A.blip('noise', 3000, 0.1, 0.1);
ok(nodes.some((n) => n.kind === 'filter') && nodes.some((n) => n.kind === 'gain' && n.to.includes(A.mus)), 'a noise note goes through a filter on the music channel');
nodes = []; A.blip('square', 0, 0.2); A.blip('square', -5, 0.2); A.blip('square', NaN, 0.2);
ok(nodes.length === 0, 'a frequency that is not positive makes no sound');
A.setMuted(true); nodes = []; A.blip('square', 440, 0.2); ok(nodes.length === 0, 'muted: no sound');
A.setMuted(false);
nodes = []; A.blip('banjo', 440, 0.2, 0.1); ok(nodes.some((n) => n.kind === 'osc'), 'an unknown wave falls back to square instead of failing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
