/* Data Console — built-in carts */
(function () {
  const DC = window.DC;

  DC.DEMO_CART = {
    format: 'DCART-1',
    meta: { title: 'Flag of Gold', author: 'Data Console', width: 256, height: 224, start: 'title' },
    vars: { coins: 0, hp: 3, hpMax: 3 },
    sprites: {
      hero: { w: 8, h: 8, scale: 2, frames: [
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '..h..h..', '.44..44.'],
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '.h....h.', '44....44'],
        ['..rrrr..', '.rrrrrr.', '..7707..', '7.7777.7', '.hhhhhh.', '..hhhh..', '..h..h..', '..4..4..'],
        ['..rrrr..', '.rrrrrr.', '..rrrr..', '..7777..', '.hhhhhh.', '7.hhhh.7', '..h..h..', '.44..44.'],
        ['..rrrr..', '.rrrrrr.', '..rrrr..', '..7777..', '.hhhhhh.', '7.hhhh.7', '.h....h.', '44....44'],
      ] },
      slime: { w: 8, h: 8, scale: 2, frames: [
        ['........', '........', '..aaaa..', '.a9aaaa.', '.a0aa0a.', '.aaaaaa.', 'aaaaaaaa', '.cccccc.'],
        ['........', '...aa...', '..a9aa..', '.aaaaaa.', '.a0aa0a.', '.aaaaaa.', '.aaaaaa.', '..cccc..'],
      ] },
      bat: { w: 8, h: 8, scale: 2, frames: [
        ['........', 'q......q', 'qq.qq.qq', 'qqqqqqqq', '..qrrq..', '...qq...', '........', '........'],
        ['........', '........', '...qq...', '.qqqqqq.', 'qqqrrqqq', 'q..qq..q', '........', '........'],
      ] },
      coin: { w: 8, h: 8, scale: 2, frames: [
        ['..8888..', '.8l8888.', '8l88v888', '8l88v888', '8l88v888', '8l88v888', '.8888v8.', '..8888..'],
        ['...88...', '..8l88..', '..8l88..', '..8v88..', '..8v88..', '..8888..', '..8888..', '...88...'],
      ] },
      heart: { w: 8, h: 8, frames: [
        ['.rr.rr..', 'rtrrrrr.', 'rrrrrrr.', 'rrrrrrr.', '.rrrrr..', '..rrr...', '...r....', '........'],
        ['.oo.oo..', 'o..o..o.', 'o.....o.', 'o.....o.', '.o...o..', '..o.o...', '...o....', '........'],
      ] },
      elder: { w: 8, h: 8, scale: 2, frames: [
        ['..llll..', '.llllll.', '..7707..', '..llll..', '.qqllqq.', '7qqqqqq7', '.qqqqqq.', '.44..44.'],
      ] },
      slash: { w: 8, h: 8, scale: 2, frames: [
        ['...kkk..', '......k.', '.......l', '.......l', '.......l', '.......l', '......k.', '...kkk..'],
      ] },
      tree: { w: 8, h: 8, scale: 2, frames: [
        ['..cccc..', '.caaaac.', 'caa9aaac', 'caaaa9ac', '.caaaac.', '..c44c..', '...44...', '...44...'],
      ] },
      flower: { w: 8, h: 8, scale: 2, frames: [
        ['........', '........', '...t....', '..tlt...', '...t..8.', '.....8l8', '......8.', '........'],
      ] },
      water: { w: 8, h: 8, scale: 2, frames: [
        ['hhhhhhhh', 'hiihhhhh', 'hhhhhhhh', 'hhhhhiih', 'hhhhhhhh', 'hhiihhhh', 'hhhhhhhh', 'hhhhhhih'],
        ['hhhhhhhh', 'hhhiihhh', 'hhhhhhhh', 'hiihhhhh', 'hhhhhhhh', 'hhhhhiih', 'hhhhhhhh', 'ihhhhhhh'],
      ] },
      stone: { w: 8, h: 8, scale: 2, frames: [
        ['nnnnnnon', 'nmmmmmon', 'nmmmmmon', 'oooooooo', 'nnnonnnn', 'mmmommmm', 'mmmommmm', 'oooooooo'],
      ] },
      door: { w: 8, h: 8, scale: 2, frames: [
        ['nnnnnnnn', 'nn0000nn', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'n000000n'],
      ] },
      brick: { w: 8, h: 8, scale: 2, frames: [
        ['55555535', '55555535', '33333333', '55355555', '55355555', '33333333', '55555535', '55555535'],
      ] },
      qblock: { w: 8, h: 8, scale: 2, frames: [
        ['vvvvvvvv', 'v880088v', 'v888808v', 'v888088v', 'v888888v', 'v888088v', 'v888888v', 'vvvvvvvv'],
        ['vvvvvvvv', 'v888888v', 'v880088v', 'v888808v', 'v888088v', 'v888888v', 'v888088v', 'vvvvvvvv'],
      ] },
      used: { w: 8, h: 8, scale: 2, frames: [
        ['33333333', '34444443', '34444443', '34444443', '34444443', '34444443', '34444443', '33333333'],
      ] },
      plat: { w: 8, h: 8, scale: 2, frames: [
        ['66666666', '44444444', '4......4', '........', '........', '........', '........', '........'],
      ] },
      spikes: { w: 8, h: 8, scale: 2, frames: [
        ['........', '........', '..l...l.', '..n...n.', '.lnn.lnn', '.nnn.nnn', 'nnnnnnnn', 'oooooooo'],
      ] },
      flag: { w: 8, h: 8, scale: 2, frames: [
        ['l888....', 'l8888...', 'l88888..', 'l.......', 'l.......', 'l.......', 'l.......', 'nn......'],
        ['l88.....', 'l8888...', 'l888888.', 'l.......', 'l.......', 'l.......', 'l.......', 'nn......'],
      ] },
      lift: { w: 16, h: 4, scale: 2, frames: [
        ['6666666666666666', '4444444444444444', '3..............3', '................'],
      ] },
    },
    sounds: {
      jump: { wave: 'square', f: [260, 620], d: 0.14, v: 0.16 },
      coin: { wave: 'square', f: [988, 1480], d: 0.12, v: 0.14 },
      sword: { wave: 'noise', f: [3000, 700], d: 0.1, v: 0.3 },
      hurt: { wave: 'sawtooth', f: [320, 90], d: 0.2, v: 0.18 },
      die: { wave: 'noise', f: [1400, 120], d: 0.3, v: 0.3 },
      stomp: { wave: 'square', f: [180, 520], d: 0.09, v: 0.18 },
      talk: { wave: 'triangle', f: [700, 740], d: 0.05, v: 0.14 },
      door: { wave: 'triangle', f: [200, 600, 300], d: 0.3, v: 0.25 },
      break: { wave: 'noise', f: [900, 200], d: 0.2, v: 0.3 },
      heal: { wave: 'sine', f: [600, 1200], d: 0.2, v: 0.2 },
      win: { wave: 'square', f: [523, 659, 784, 1046], d: 0.7, v: 0.16 },
    },
    music: {
      overworld: { bpm: 112, div: 2, tracks: [
        { wave: 'square', v: 0.06, notes: 'C5 - E5 G5 A5 - G5 E5 F5 - A5 F5 E5 - C5 . D5 - F5 A5 G5 - E5 C5 D5 - B4 G4 C5 - - .' },
        { wave: 'triangle', v: 0.12, notes: 'C3 - - - A2 - - - F2 - - - C3 - - - D3 - - - E3 - - - G2 - - - C3 - - -' },
      ] },
      cave: { bpm: 140, div: 2, tracks: [
        { wave: 'square', v: 0.05, notes: 'E4 . G4 . A4 . G4 E4 D4 . E4 . C4 - - . E4 . G4 . B4 . A4 G4 A4 . E4 . D4 - - .' },
        { wave: 'triangle', v: 0.12, notes: 'A2 . A2 . A2 . A2 . F2 . F2 . F2 . F2 . C3 . C3 . C3 . C3 . E2 . E2 . E2 . E2 .' },
      ] },
    },
    tiles: {
      T: { sprite: 'tree', solid: true },
      W: { sprite: 'stone', solid: true },
      '~': { sprite: 'water', solid: true, fps: 2 },
      ',': { sprite: 'flower' },
      D: { sprite: 'stone', solid: true },
      '#': { sprite: 'brick', solid: true, hit: { become: '.', sound: 'break', burst: 8, burstColor: [5, 3] } },
      '?': { sprite: 'qblock', solid: true, fps: 3, hit: { become: 'U', spawn: 'coin_pop', sound: 'coin', do: [{ add: 'coins', value: 1 }] } },
      U: { sprite: 'used', solid: true },
      '=': { sprite: 'plat', oneWay: true },
      '^': { sprite: 'spikes', hurt: 1 },
    },
    prefabs: {
      hero_top: {
        tags: ['player'],
        sprite: { name: 'hero', fps: 8, anim: { idle: [0], walk: [0, 1], idle_up: [3], walk_up: [3, 4], attack: [2] } },
        body: { w: 12, h: 12 },
        control: { type: 'topdown', speed: 72 },
        health: { hp: 3, var: 'hp', invuln: 1 },
        attack: { button: 'b', prefab: 'slash', cooldown: 0.3, offset: 13, follow: true, sound: 'sword' },
      },
      hero_side: {
        tags: ['player'],
        sprite: { name: 'hero', fps: 8, anim: { idle: [0], walk: [0, 1], jump: [2], attack: [2] } },
        body: { w: 10, h: 15 },
        control: { type: 'platformer', speed: 92, jump: 300 },
        health: { hp: 3, var: 'hp', invuln: 1 },
        attack: { button: 'b', prefab: 'slash', cooldown: 0.3, offset: 12, follow: true, sound: 'sword' },
      },
      slash: { sprite: { name: 'slash', layer: 1 }, hurt: { damage: 1, targets: ['enemy'], knockback: 170 }, lifetime: { t: 0.16 } },
      slime: {
        tags: ['enemy'], sprite: { name: 'slime', fps: 3 }, body: { w: 12, h: 9 },
        ai: { type: 'chase', speed: 26, range: 70, idle: 'wander' },
        health: { hp: 2, invuln: 0.3, drop: 'heart_item', dropChance: 0.25 },
        hurt: { damage: 1, targets: ['player'], knockback: 150 },
      },
      walker: {
        tags: ['enemy'], sprite: { name: 'slime', fps: 3 }, body: { w: 12, h: 9 },
        ai: { type: 'patrol', speed: 24 }, health: { hp: 1 },
        hurt: { damage: 1, targets: ['player'], knockback: 150 }, stompable: { bounce: 230 },
      },
      bat: {
        tags: ['enemy'], sprite: { name: 'bat', fps: 6 }, body: { w: 12, h: 8, gravity: 0 },
        ai: { type: 'fly', speed: 28, amp: 10, freq: 3 }, health: { hp: 1 },
        hurt: { damage: 1, targets: ['player'] }, stompable: { bounce: 230 },
      },
      coin: { tags: ['item'], sprite: { name: 'coin', fps: 5 }, pickup: { var: 'coins', add: 1, sound: 'coin' } },
      coin_pop: { sprite: { name: 'coin', fps: 14 }, body: { solid: false }, vel: [0, -240], lifetime: { t: 0.45 }, noCollide: true },
      heart_item: { sprite: { name: 'heart', anim: { idle: [0] } }, pickup: { heal: 1, sound: 'heal' }, lifetime: { t: 8 } },
      elder: {
        tags: ['npc'], sprite: { name: 'elder' }, solid: true,
        talk: {
          name: 'Elder',
          lines: [
            'The cave in the north-east wall hides a flag of gold.',
            'Press B to swing your sword. Down there, jump on what you cannot cut.',
            'You carry {coins} coins. Bring me ten and I will be impressed!',
          ],
          then: [{ if: { var: 'coins', op: '>=', value: 10 }, then: [{ say: ['Ten coins! You are a true hero.'], name: 'Elder' }] }],
        },
      },
      cave_door: { sprite: { name: 'door' }, warp: { scene: 'cave', tx: 3, ty: 10, sound: 'door' } },
      lift: { sprite: { name: 'lift' }, solid: { oneWay: true }, move: { path: [[0, 0], [4, 0]], speed: 28 } },
      flag: { tags: ['goal'], sprite: { name: 'flag', fps: 4 } },
    },
    hud: [
      { icons: 'heart', count: 'hp', max: 'hpMax', x: 6, y: 6 },
      { text: 'COINS {coins}', x: 250, y: 6, align: 'right', color: 8 },
    ],
    rules: [
      { on: 'var', var: 'hp', op: '<=', value: 0, do: [{ music: null }, { wait: 1, then: [{ scene: 'gameover' }] }] },
    ],
    scenes: {
      title: {
        bg: 1, music: null,
        hud: [
          { text: 'FLAG OF GOLD', x: 'center', y: 64, size: 2, color: 8 },
          { text: 'a data console demo', x: 'center', y: 96, color: 20 },
          { text: 'PRESS START', x: 'center', y: 140, color: 21, blink: true },
          { text: 'A jump/talk  B sword', x: 'center', y: 190, color: 23 },
        ],
        rules: [{ on: 'button', button: 'start', do: [{ reset: true }, { sound: 'coin' }, { scene: 'overworld' }] }],
      },
      overworld: {
        tileSize: 16, gravity: 0, bg: 10, music: 'overworld', ysort: true,
        map: [
          'TTTTTTTTTTTTTTTTTTTTTTTT',
          'T......................T',
          'T..C.......T.......WWWWT',
          'T.....N............WWOWT',
          'T..................WW.WT',
          'T....TT......S.........T',
          'T....TT................T',
          'T..P.......~~~~.....C..T',
          'T..........~~~~........T',
          'T....C.....~~~~....S...T',
          'T..,.......,...........T',
          'T...S.........TT.......T',
          'T.............TT...C...T',
          'T..C...................T',
          'T.......,.........,....T',
          'TTTTTTTTTTTTTTTTTTTTTTTT',
        ],
        legend: { P: 'hero_top', N: 'elder', S: 'slime', C: 'coin', O: 'cave_door' },
      },
      cave: {
        tileSize: 16, gravity: 700, bg: 1, music: 'cave',
        layers: [{ color: 15, y: 120, h: 104, factor: 0 }],
        map: [
          'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
          'D......................................D',
          'D......................................D',
          'D.......................V..............D',
          'D......................................D',
          'D..........................CCC.........D',
          'D......................................D',
          'D........?#?#.........=====....M.....F.D',
          'D...C.C.............................DDDD',
          'D...............S......................D',
          'D..P..........................V........D',
          'DDDDDDDDDDDDDDDD...DDDDDDD^^^DDDDDDDDDDD',
          'DDDDDDDDDDDDDDDD...DDDDDDDDDDDDDDDDDDDDD',
          'DDDDDDDDDDDDDDDD...DDDDDDDDDDDDDDDDDDDDD',
        ],
        legend: { P: 'hero_side', C: 'coin', S: 'walker', V: 'bat', M: 'lift', F: 'flag' },
        rules: [
          { on: 'collide', a: 'player', b: 'goal', do: [
            { destroy: 'b' }, { music: null }, { sound: 'win' }, { flash: 8 },
            { text: 'YOU FOUND THE FLAG!', t: 3 },
            { wait: 3, then: [{ scene: 'title' }] },
          ] },
        ],
      },
      gameover: {
        bg: 0, music: null,
        hud: [
          { text: 'GAME OVER', x: 'center', y: 90, size: 2, color: 27 },
          { text: 'PRESS START', x: 'center', y: 140, color: 21, blink: true },
        ],
        rules: [{ on: 'button', button: 'start', do: [{ reset: true }, { scene: 'title' }] }],
      },
    },
  };

  DC.BLANK_CART = {
    format: 'DCART-1',
    meta: { title: 'New cart', author: '', width: 256, height: 224, start: 'main' },
    vars: { score: 0 },
    sprites: {
      hero: { w: 8, h: 8, scale: 2, frames: [['..8888..', '.888888.', '88088088', '88888888', '80888808', '88000088', '.888888.', '..8888..']] },
      wall: { w: 8, h: 8, scale: 2, frames: [['ffffffff', 'fggggggf', 'fgffffgf', 'fgfggfgf', 'fgfggfgf', 'fgffffgf', 'fggggggf', 'ffffffff']] },
    },
    sounds: {},
    music: {},
    tiles: { '#': { sprite: 'wall', solid: true } },
    prefabs: {
      hero: { tags: ['player'], sprite: { name: 'hero' }, body: { w: 12, h: 12 }, control: { type: 'topdown', speed: 80 } },
    },
    hud: [{ text: 'SCORE {score}', x: 6, y: 6 }],
    rules: [],
    scenes: {
      main: {
        tileSize: 16, gravity: 0, bg: 1,
        map: [
          '################',
          '#..............#',
          '#..............#',
          '#..............#',
          '#..............#',
          '#..............#',
          '#.......P......#',
          '#..............#',
          '#..............#',
          '#..............#',
          '#..............#',
          '#..............#',
          '#..............#',
          '################',
        ],
        legend: { P: 'hero' },
      },
    },
  };
})();

/* Kart demo — Mode 7 racing */
(function () {
  const DC = window.DC;
  const recolor = (rows, from, to) => rows.map((r) => r.split(from).join(to));
  const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));
  const back = ['....rrrr....', '...rrrrrr...', '...rllllr...', '....7777....', '..rrrrrrrr..', '.rrnnnnnnrr.', '00rrrrrrrr00', '00rr8rr8rr00', '00.nnnnnn.00', '............'];
  const side = ['.....rrrr...', '....rrrrr...', '....r7707...', '..rrrrrrrrr.', '.nrrrrrrrrrl', 'nnrrrrrrrrrr', '.00.....00..', '0000...0000.', '.00.....00..', '............'];
  const front = ['....rrrr....', '...rrrrrr...', '...r7007r...', '...r7777r...', '..rrrrrrrr..', '.rrllllllrr.', '00rrrrrrrr00', '00r8rrrr8r00', '00.nnnnnn.00', '............'];
  // rotation frames: seen from behind, then turning right (nose points right), front, nose left
  const kart = (c) => ({ w: 12, h: 10, frames: [back, side, front, mirror(side)].map((f) => recolor(f, 'r', c)) });

  // 40 x 30 track: a road ring with grass, trees, boost pads, a ramp, finish line and checkpoint
  const W = 40, H = 30, rows = [];
  const trees = ['12,12', '16,15', '23,12', '27,17', '19,18', '14,19', '25,10'];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const road = x >= 4 && x <= 35 && y >= 4 && y <= 25 && !(x >= 9 && x <= 30 && y >= 9 && y <= 20);
      const corner = (x < 6 || x > 33) && (y < 6 || y > 23) && Math.hypot(x < 6 ? 6 - x : x - 33, y < 6 ? 6 - y : y - 23) > 2.2;
      let ch = edge ? 'W' : road && !corner ? '#' : 'g';
      if (road && x === 20 && y <= 8) ch = 'F';
      if (road && x === 20 && y >= 21) ch = 'C';
      if (road && x === 33 && (y === 13 || y === 14)) ch = 'B';
      if (road && x === 12 && y >= 22 && y <= 24) ch = 'J';
      if (trees.includes(x + ',' + y)) ch = 'T';
      r += ch;
    }
    rows.push(r);
  }
  const put = (x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  put(17, 6, 'P'); put(16, 5, 'R'); put(15, 7, 'S');
  const path = [[31, 6], [33, 8], [33, 21], [31, 23], [8, 23], [6, 21], [6, 8], [8, 6]];

  DC.KART_CART = {
    format: 'DCART-1',
    meta: { title: 'Kart Circuit', author: 'Data Console', width: 256, height: 224, start: 'title', motion: 'steer' },
    vars: { lap: 1, cp: 0, racetime: 0, go: 0, done: 0, best: 0 },
    sprites: {
      kart_red: kart('r'), kart_blue: kart('h'), kart_green: kart('a'),
      road: { w: 8, h: 8, scale: 2, frames: [['nnnnnnnn', 'nnnmnnnn', 'nnnnnnnn', 'nnnnnnmn', 'nnnnnnnn', 'nmnnnnnn', 'nnnnnnnn', 'nnnnmnnn']] },
      grass: { w: 8, h: 8, scale: 2, frames: [['aaaaaaaa', 'aa9aaaaa', 'aaaaaa9a', 'aaaaaaaa', 'a9aaaaaa', 'aaaa9aaa', 'aaaaaaaa', 'aaaaaa9a']] },
      wall: { w: 8, h: 8, scale: 2, frames: [['rrllrrll', 'rrllrrll', 'llrrllrr', 'llrrllrr', 'rrllrrll', 'rrllrrll', 'llrrllrr', 'llrrllrr']] },
      finish: { w: 8, h: 8, scale: 2, frames: [['00ll00ll', '00ll00ll', 'll00ll00', 'll00ll00', '00ll00ll', '00ll00ll', 'll00ll00', 'll00ll00']] },
      boost: { w: 8, h: 8, scale: 2, frames: [['nnnnnnnn', 'nnn88nnn', 'nnn88nnn', 'nnn88nnn', 'n888888n', 'nn8888nn', 'nnn88nnn', 'nnnnnnnn']] },
      ramp: { w: 8, h: 8, scale: 2, frames: [['55555555', '44444444', '55555555', '44444444', '55555555', '44444444', '55555555', '44444444']] },
      tree: { w: 8, h: 8, scale: 2, frames: [['..cccc..', '.caaaac.', 'caa9aaac', 'caaaa9ac', '.caaaac.', '..c44c..', '...44...', '...44...']] },
      hills: { w: 16, h: 8, scale: 3, frames: [['................', '.......cc.......', '......cccc......', '....cccaacc.....', '...ccaaaaaccc..c', '..ccaaaaaaaccccc', 'cccaaaaaaaaaaacc', 'aaaaaaaaaaaaaaaa']] },
      clouds: { w: 16, h: 6, scale: 2, frames: [['................', '....llll........', '..llllllll..ll..', '.lllllllllllllll', '..llllllllllll..', '................']] },
    },
    sounds: {
      beep: { wave: 'square', f: [440, 440], d: 0.15, v: 0.15 },
      go: { wave: 'square', f: [880, 880], d: 0.35, v: 0.18 },
      lap: { wave: 'square', f: [660, 880, 1100], d: 0.3, v: 0.16 },
      boost: { wave: 'sawtooth', f: [200, 900], d: 0.35, v: 0.12 },
      jump: { wave: 'triangle', f: [300, 700], d: 0.2, v: 0.18 },
      win: { wave: 'square', f: [523, 659, 784, 1046], d: 0.8, v: 0.16 },
    },
    music: {
      race: { bpm: 150, div: 2, tracks: [
        { wave: 'square', v: 0.05, notes: 'E5 . E5 G5 . E5 D5 . C5 . D5 E5 . . G4 . A4 . C5 . D5 C5 A4 . G4 . . . . . . .' },
        { wave: 'triangle', v: 0.12, notes: 'C3 . C3 . G2 . G2 . A2 . A2 . E2 . E2 . F2 . F2 . C3 . C3 . G2 . G2 . G2 . . .' },
      ] },
    },
    tiles: {
      '#': { sprite: 'road' },
      g: { sprite: 'grass', slow: 0.45 },
      W: { sprite: 'wall', solid: true },
      T: { sprite: 'tree', solid: true },
      F: { sprite: 'finish' },
      C: { sprite: 'road' },
      B: { sprite: 'boost', boost: 1, sound: 'boost' },
      J: { sprite: 'ramp', jump: 170, sound: 'jump' },
    },
    prefabs: {
      kart: {
        tags: ['player', 'racer'], sprite: { name: 'kart_red', angles: 4 }, body: { w: 10, h: 8, bounce: 0.4 },
        control: { type: 'kart', speed: 0, accel: 150, turn: 150, heading: 0 },
      },
      rival_blue: {
        tags: ['rival', 'racer'], sprite: { name: 'kart_blue', angles: 4 }, body: { w: 10, h: 8, bounce: 0.4 },
        vars: { topSpeed: 132 }, ai: { type: 'race', speed: 0, turn: 170, heading: 0, path },
      },
      rival_green: {
        tags: ['rival', 'racer'], sprite: { name: 'kart_green', angles: 4 }, body: { w: 10, h: 8, bounce: 0.4 },
        vars: { topSpeed: 124 }, ai: { type: 'race', speed: 0, turn: 190, heading: 0, path },
      },
    },
    hud: [],
    rules: [],
    scenes: {
      title: {
        bg: 1,
        hud: [
          { text: 'KART CIRCUIT', x: 'center', y: 56, size: 2, color: 8 },
          { text: 'a mode 7 demo', x: 'center', y: 86, color: 20 },
          { text: 'PRESS START', x: 'center', y: 128, blink: true },
          { text: 'A gas  B brake  X hop', x: 'center', y: 170, color: 23 },
          { text: 'or tilt the phone to steer', x: 'center', y: 184, color: 23 },
          { text: 'Best race: {best}s', x: 'center', y: 204, color: 22, if: 'best > 0' },
        ],
        rules: [{ on: 'button', button: 'start', do: [{ set: 'lap', value: 1 }, { set: 'cp', value: 0 }, { set: 'racetime', value: 0 }, { set: 'go', value: 0 }, { set: 'done', value: 0 }, { scene: 'race' }] }],
      },
      race: {
        tileSize: 16, gravity: 0, bg: 18, music: null,
        mode7: { horizon: 72, height: 22, fov: 70, back: 56, spriteScale: 0.65, fog: 20, fogDepth: 0.22, outside: 10, ground: 10 },
        layers: [
          { sprite: 'clouds', y: 14, factor: 0.5, speed: [8, 0], z: -1 },
          { sprite: 'hills', factor: 1, z: -1 },
        ],
        map: rows,
        legend: { P: 'kart', R: 'rival_blue', S: 'rival_green' },
        hud: [
          { text: 'LAP {min(lap, 3)}/3', x: 6, y: 6, color: 21 },
          { text: '{floor(racetime * 10) / 10}s', x: 250, y: 6, align: 'right', color: 8 },
          { text: '{round(abs(player.speed))} km/h', x: 6, y: 208, color: 22 },
          { minimap: true, x: 196, y: 168, w: 54, h: 40, colors: { rival: 19, player: 8 } },
        ],
        rules: [
          { on: 'start', do: [
            { text: '3', t: 0.9 }, { sound: 'beep' },
            { wait: 1, then: [{ text: '2', t: 0.9 }, { sound: 'beep' }] },
            { wait: 2, then: [{ text: '1', t: 0.9 }, { sound: 'beep' }] },
            { wait: 3, then: [
              { text: 'GO!', t: 0.8 }, { sound: 'go' }, { set: 'go', value: 1 }, { music: 'race' }, { haptic: 'success' },
              { comp: 'control.speed', value: 150, target: 'player' },
              { comp: 'ai.speed', value: '=self.topSpeed', target: 'rival' },
            ] },
          ] },
          { on: 'every', t: 0.1, do: [{ if: 'go == 1 and done == 0', then: [{ add: 'racetime', value: 0.1 }] }] },
          { on: 'tile', tile: 'C', tag: 'player', do: [{ set: 'cp', value: 1 }] },
          { on: 'tile', tile: 'F', tag: 'player', do: [{ if: 'cp == 1 and done == 0', then: [
            { set: 'cp', value: 0 }, { add: 'lap' }, { sound: 'lap' }, { haptic: 'double' },
            { if: 'lap > 3', then: [
              { set: 'done', value: 1 }, { music: null }, { sound: 'win' }, { haptic: 'success' },
              { set: 'best', value: '=best == 0 or racetime < best ? round(racetime * 10) / 10 : best' },
              { text: '="FINISH! " + str(round(racetime * 10) / 10) + "s"', t: 4 },
              { comp: 'control.speed', value: 40, target: 'player' },
              { wait: 4, then: [{ scene: 'title' }] },
            ], else: [{ text: '="LAP " + str(lap)', t: 1.2 }] },
          ] }] },
        ],
      },
    },
  };
})();

/* Ember Keep — a compact adventure showcasing behaviors, inheritance, state machines,
   branching dialogue with choices, breakable-tile loot, and save data. */
(function () {
  const DC = window.DC;
  const rows = (c, n) => Array.from({ length: n }, () => c.repeat(n));
  const put = (grid, x, y, ch) => { grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1); };

  DC.KEEP_CART = {
    format: 'DCART-1',
    meta: { title: 'Ember Keep', author: 'Data Console', width: 256, height: 224, start: 'title', persist: ['coins', 'keys', 'hp', 'hpMax', 'flags'] },
    vars: { coins: 0, keys: 0, hp: 6, hpMax: 6, flags: { metElder: false, boughtKey: false } },
    sprites: {
      hero: { w: 8, h: 8, scale: 2, frames: [
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '..h..h..', '.44..44.'],
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '.h....h.', '44....44'],
      ] },
      elder: { w: 8, h: 8, scale: 2, frames: [['..llll..', '.llllll.', '..7707..', '..llll..', '.qqllqq.', '7qqqqqq7', '.qqqqqq.', '.44..44.']] },
      merchant: { w: 8, h: 8, scale: 2, frames: [['..8888..', '.888888.', '..7007..', '.777777.', '.699996.', '76999967', '.699996.', '.66..66.']] },
      slime: { w: 8, h: 8, scale: 2, frames: [
        ['........', '........', '..aaaa..', '.a9aaaa.', '.a0aa0a.', '.aaaaaa.', 'aaaaaaaa', '.cccccc.'],
        ['........', '...aa...', '..a9aa..', '.aaaaaa.', '.a0aa0a.', '.aaaaaa.', '.aaaaaa.', '..cccc..'],
      ] },
      bat: { w: 8, h: 8, scale: 2, frames: [
        ['........', 'q......q', 'qq.qq.qq', 'qqqqqqqq', '..qrrq..', '...qq...', '........', '........'],
        ['........', '........', '...qq...', '.qqqqqq.', 'qqqrrqqq', 'q..qq..q', '........', '........'],
      ] },
      golem: { w: 8, h: 8, scale: 2, frames: [
        ['.nnnnnn.', 'nnmmmmnn', 'nnm00mnn', 'nnmmmmnn', 'nnnnnnnn', 'nn.nn.nn', 'nn.nn.nn', 'oo.oo.oo'],
        ['.nnnnnn.', 'nnmmmmnn', 'nnm00mnn', 'nnmmmmnn', 'nnnnnnnn', 'n.nnnn.n', 'oo.nn.oo', '.oo..oo.'],
      ] },
      golem_angry: { w: 8, h: 8, scale: 2, frames: [
        ['.nnnnnn.', 'nnrrrrnn', 'nnr00rnn', 'nnrrrrnn', 'nnnnnnnn', 'nn.nn.nn', 'nn.nn.nn', 'oo.oo.oo'],
        ['.nnnnnn.', 'nnrrrrnn', 'nnr00rnn', 'nnrrrrnn', 'nnnnnnnn', 'n.nnnn.n', 'oo.nn.oo', '.oo..oo.'],
      ] },
      arrow: { w: 8, h: 8, scale: 2, frames: [['........', '........', '.......4', '.44444l4', '4llllll4', '.44444l4', '.......4', '........']] },
      boulder: { w: 6, h: 6, frames: [rows('n', 6)] },
      coin: { w: 8, h: 8, scale: 2, frames: [['..8888..', '.8l8888.', '8l88v888', '8l88v888', '8l88v888', '8l88v888', '.8888v8.', '..8888..'], ['...88...', '..8l88..', '..8l88..', '..8v88..', '..8v88..', '..8888..', '..8888..', '...88...']] },
      heart: { w: 8, h: 8, frames: [['.rr.rr..', 'rtrrrrr.', 'rrrrrrr.', 'rrrrrrr.', '.rrrrr..', '..rrr...', '...r....', '........']] },
      key: { w: 8, h: 8, frames: [['..8888..', '.8....8.', '.8.88.8.', '..8888..', '....8...', '....8...', '..888...', '.8.8....']] },
      pot: { w: 8, h: 8, scale: 2, frames: [['.444444.', '44444444', '4l4444l4', '44444444', '44444444', '.444444.', '..4444..', '...44...']] },
      pot_shard: { w: 8, h: 8, scale: 2, frames: [['....4...', '...44...', '4......4', '.4....4.', '..4..4..', '.4....4.', '........', '........']] },
      leaf: { w: 8, h: 8, scale: 2, frames: [['........', '..aa..a.', '.aaaa.a.', '..aa....', '.a..a.a.', '....a...', '........', '........']] },
      poof: { w: 8, h: 8, scale: 2, frames: [
        ['........', '...ll...', '..llll..', '.llllll.', '..llll..', '...ll...', '........', '........'],
        ['..l..l..', '.l....l.', '...ll...', '.l....l.', '..l..l..', '........', '........', '........'],
      ] },
      bush: { w: 8, h: 8, scale: 2, frames: [['........', '..aaaa..', '.aaaaaa.', 'aa9aa9aa', 'aaaaaaaa', '.aaaaaa.', '..4444..', '........']] },
      wall: { w: 8, h: 8, scale: 2, frames: [['nnnnnnnn', 'nmmmmmmn', 'nmmmmmmn', 'nnnnnnnn', 'nnmmmmmn', 'nmmmmmmn', 'nmmmmmmn', 'nnnnnnnn']] },
      floor: { w: 8, h: 8, scale: 2, frames: [['22222222', '22322222', '22222222', '22222232', '22222222', '23222222', '22222222', '22222222']] },
      grass: { w: 8, h: 8, scale: 2, frames: [['aaaaaaaa', 'aa9aaaaa', 'aaaaaa9a', 'aaaaaaaa', 'a9aaaaaa', 'aaaa9aaa', 'aaaaaaaa', 'aaaaaa9a']] },
      door: { w: 8, h: 8, scale: 2, frames: [['nnnnnnnn', 'nn0000nn', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'nnnnnnnn']] },
      chest: { w: 8, h: 8, scale: 2, frames: [['.444444.', '44888844', '48888884', '44444444', '.444444.', '........', '........', '........']] },
      inn: { w: 8, h: 8, scale: 2, frames: [['..5555..', '.555555.', '55555555', '.444444.', '.4l44l4.', '.444444.', '.4l44l4.', '.444444.']] },
    },
    sounds: {
      jump: { wave: 'square', f: [260, 620], d: 0.14, v: 0.16 }, coin: { wave: 'square', f: [988, 1480], d: 0.12, v: 0.14 },
      sword: { wave: 'noise', f: [3000, 700], d: 0.1, v: 0.3 }, hurt: { wave: 'sawtooth', f: [320, 90], d: 0.2, v: 0.18 },
      die: { wave: 'noise', f: [1400, 120], d: 0.3, v: 0.3 }, talk: { wave: 'triangle', f: [700, 740], d: 0.05, v: 0.14 },
      door: { wave: 'triangle', f: [200, 600, 300], d: 0.3, v: 0.25 }, cut: { wave: 'noise', f: [1800, 400], d: 0.12, v: 0.22 },
      break: { wave: 'noise', f: [900, 200], d: 0.2, v: 0.3 }, unlock: { wave: 'square', f: [500, 900, 1300], d: 0.3, v: 0.2 },
      buy: { wave: 'square', f: [700, 1000], d: 0.15, v: 0.16 }, save: { wave: 'sine', f: [600, 900, 1200], d: 0.4, v: 0.18 },
      roar: { wave: 'sawtooth', f: [140, 60], d: 0.5, v: 0.25 }, win: { wave: 'square', f: [523, 659, 784, 1046], d: 0.8, v: 0.16 },
      select: { wave: 'square', f: [500, 700], d: 0.05, v: 0.1 },
    },
    music: {
      town: { bpm: 100, div: 2, tracks: [
        { wave: 'triangle', v: 0.08, notes: 'C4 . E4 . G4 . E4 . F4 . A4 . F4 . G4 . B4 . G4 . A4 . C5 . G4 .' },
        { wave: 'sine', v: 0.1, notes: 'C3 - - - F2 - - - G2 - - - C3 - - -' },
      ] },
      dungeon: { bpm: 132, div: 2, tracks: [
        { wave: 'square', v: 0.05, notes: 'E4 . G4 . A4 . G4 E4 D4 . E4 . C4 - - . E4 . G4 . B4 . A4 G4 A4 . E4 . D4 - - .' },
        { wave: 'triangle', v: 0.11, notes: 'A2 . A2 . A2 . A2 . F2 . F2 . F2 . F2 . C3 . C3 . C3 . C3 . E2 . E2 . E2 . E2 .' },
      ] },
      boss: { bpm: 150, div: 2, tracks: [
        { wave: 'sawtooth', v: 0.07, notes: 'D3 . D3 F3 . D3 . D3 A3 . D3 . D3 F3 . D3 . C3' },
        { wave: 'square', v: 0.06, notes: 'D5 - - - . - - - D5 - - - . - - -' },
      ] },
    },
    tiles: {
      '#': { sprite: 'wall', solid: true },
      '.': undefined, // reserved, never used
      ',': { sprite: 'grass' },
      F: { sprite: 'floor' },
      B: { sprite: 'bush', solid: true, break: { by: ['player'], effect: 'leaf', sound: 'cut', drop: { one: [{ prefab: 'coin', weight: 3 }, { prefab: 'heart', weight: 1 }, { prefab: null, weight: 2 }] } } },
      P: { sprite: 'pot', solid: true, break: { hp: 1, by: ['player'], effect: 'poof', sound: 'break', drop: [{ prefab: 'coin', count: [1, 2] }] } },
      L: { sprite: 'wall', solid: true, break: { by: ['bomb'], effect: 'poof', sound: 'break' } },
    },
    prefabs: {
      hero: {
        tags: ['player'], sprite: { name: 'hero', fps: 8, anim: { idle: [0], walk: [0, 1], attack: [1] } },
        body: { w: 12, h: 12 }, control: { type: 'topdown', speed: 76 }, health: { hp: 6, var: 'hp', invuln: 1 },
        attack: { button: 'b', prefab: 'slash', cooldown: 0.32, offset: 12, follow: true, sound: 'sword' },
      },
      slash: { sprite: { name: 'leaf', layer: 1 }, hurt: { damage: 1, targets: ['enemy'] }, lifetime: { t: 0.16 } },
      bomb: { tags: ['bomb'], sprite: { color: 0, w: 8, h: 8, shape: 'circle' }, hurt: { damage: 1, targets: [] }, lifetime: { t: 0.15 } },
      boulder: { sprite: { name: 'boulder' }, hurt: { damage: 1, targets: ['player'], knockback: 100 }, lifetime: { t: 2.5 } },
      arrow: { sprite: { name: 'arrow' }, hurt: { damage: 1, targets: ['player'], knockback: 60 }, lifetime: { t: 1.5 }, noCollide: true },
      coin: { tags: ['item'], sprite: { name: 'coin', fps: 5 }, pickup: { var: 'coins', add: 1, sound: 'coin' } },
      heart: { tags: ['item'], sprite: { name: 'heart' }, pickup: { heal: 1, sound: 'coin' }, lifetime: { t: 8 } },
      key_item: { tags: ['item'], sprite: { name: 'key' }, pickup: { var: 'keys', add: 1, sound: 'unlock' } },

      /* --- reusable behaviors in action: a common base plus two shared behaviors --- */
      enemy_base: { tags: ['enemy'], body: { w: 12, h: 10 }, hurt: { damage: 1, targets: ['player'], knockback: 140 }, health: { effect: 'poof' } },
      slime: { extends: 'enemy_base', sprite: { name: 'slime', fps: 3 }, health: { hp: 2, drop: [{ prefab: 'coin', count: [1, 2] }] }, use: ['patrols'] },
      bat: { extends: 'enemy_base', sprite: { name: 'bat', fps: 6 }, body: { w: 12, h: 8, gravity: 0 }, health: { hp: 1, drop: 'coin' }, use: [{ flits: { amp: 10 } }] },
      archer_slime: { extends: 'enemy_base', sprite: { name: 'slime', fps: 3 }, health: { hp: 2, drop: 'coin' }, use: [{ shootsAt: { rate: 1.6, bullet: 'arrow' } }] },

      elder: {
        tags: ['npc'], sprite: { name: 'elder' }, solid: true,
        talk: {
          name: 'Elder',
          branches: [
            { if: 'flags.gotKey', lines: ['The keep\'s inner door should open for you now.', 'Ember Keep\'s guardian sleeps below — until you get close.'] },
            { if: 'self.talks > 0', lines: ['Still no key? Buy one from the merchant — 8 coins.', 'You have {coins} coins.'] },
          ],
          lines: [
            'Welcome, traveller. Ember Keep holds an old guardian.',
            'A locked door blocks the way down. The merchant sells keys.',
            { text: 'Rest at the inn to save your progress any time.', do: [{ set: 'flags.metElder', value: true }] },
          ],
        },
      },
      merchant: {
        tags: ['npc'], sprite: { name: 'merchant' }, solid: true,
        talk: { name: 'Merchant', lines: [
          { text: 'Coins: {coins}. What would you like?', choices: [
            { text: 'Key — 8 coins', if: 'keys == 0 and not flags.boughtKey', do: [
              { if: 'coins >= 8', then: [{ add: 'coins', value: -8 }, { add: 'keys' }, { set: 'flags.boughtKey', value: true }, { sound: 'buy' }, { say: ['Guard it well.'] } ],
                else: [{ say: ["You'll need 8 coins first."] }] } ] },
            { text: 'Heal — 3 coins', if: 'hp < hpMax', do: [
              { if: 'coins >= 3', then: [{ add: 'coins', value: -3 }, { heal: 'player', amount: 2 }, { sound: 'buy' }, { say: ['Good as new-ish.'] } ],
                else: [{ say: ['Not enough coins.'] }] } ] },
            { text: 'Just browsing', cancel: true, lines: ['Come back anytime.'] },
          ] },
        ] },
      },
      innkeeper: {
        tags: ['npc'], sprite: { name: 'inn' }, solid: true,
        talk: { name: 'Innkeeper', lines: [
          { text: '="Rest and save? You have " + str(coins) + " coins."', choices: [
            { text: 'Rest (save game)', do: [{ save: true }, { sound: 'save' }, { heal: 'player', amount: 10 }], lines: ['Zzz... progress saved. Sleep tight!'] },
            { text: 'Not now', cancel: true },
          ] },
        ] },
      },
      keep_door: { sprite: { name: 'door' }, solid: true, tags: ['lock'],
        rules: [{ on: 'touch', tag: 'player', do: [
          { if: 'keys > 0', then: [{ add: 'keys', value: -1 }, { sound: 'unlock' }, { effect: 'poof', at: 'self' }, { destroy: 'self' }],
            else: [{ say: ['Locked. The merchant in town sells keys.'] }] } ] }] },
      town_door: { sprite: { name: 'door' }, warp: { scene: 'dungeon', sound: 'door' } },
      chest_item: { sprite: { name: 'chest' }, tags: ['chest'],
        rules: [{ on: 'touch', tag: 'player', if: 'not flags.openedChest', do: [
          { set: 'flags.openedChest', value: true }, { sound: 'unlock' }, { text: 'Found a Heart Container!', t: 2 },
          { add: 'hpMax', value: 2 }, { heal: 'player', amount: 2 }, { setSprite: 'pot_shard' } ] }] },

      golem: {
        tags: ['boss'], sprite: { name: 'golem' }, body: { w: 16, h: 16 }, health: { hp: 12, var: 'bosshp', dieTime: 0 },
        states: {
          start: 'sleep',
          sleep: { ai: { type: 'turret' }, rules: [{ on: 'when', if: 'dist(self, player) < 70', goto: 'awake' }] },
          awake: {
            enter: [{ sound: 'roar' }, { shake: 0.3 }, { text: 'The guardian awakens!', t: 1.4 }, { music: 'boss' }],
            ai: { type: 'chase', speed: 38 },
            rules: [{ on: 'hit', if: 'self.hp <= self.maxhp / 2', goto: 'enraged' }],
          },
          enraged: {
            enter: [{ shake: 0.5 }, { setSprite: 'golem_angry' }, { text: 'It grows furious!', t: 1.2 }],
            ai: { type: 'chase', speed: 68 },
            rules: [
              { on: 'every', t: 1.4, do: [{ spawn: 'boulder', at: 'self', vx: '=(player.x - self.x) * 0.6', vy: '=(player.y - self.y) * 0.6' }] },
              { on: 'die', do: [{ cancelDeath: true }, { goto: 'dead' }] },
            ],
          },
          dead: {
            enter: [{ music: null }, { sound: 'win' }, { text: 'Ember Keep is safe once more!', t: 3 }, { add: 'coins', value: 30 }, { set: 'flags.won', value: true }],
            ai: { type: 'turret' },
          },
        },
      },
    },
    behaviors: {
      patrols: { params: { moveSpeed: 26 }, ai: { type: 'patrol', speed: '=self.moveSpeed' } },
      flits: { params: { moveSpeed: 30, amp: 12 }, ai: { type: 'fly', speed: '=self.moveSpeed', amp: '=self.amp', freq: 3 } },
      shootsAt: { params: { rate: 2, bullet: 'arrow' }, use: ['patrols'],
        attack: { auto: true, prefab: '=self.bullet', target: 'player', range: 90, cooldown: '=self.rate', speed: 140, offset: 8 } },
    },
    hud: [
      { icons: 'heart', count: 'hp', max: 'hpMax', x: 6, y: 6 },
      { text: 'COINS {coins}', x: 250, y: 6, align: 'right', color: 8 },
      { text: 'KEYS {keys}', x: 250, y: 16, align: 'right', color: 21, if: 'keys > 0' },
      { text: 'BOSS {bosshp}/{hpMax}', x: 128, y: 6, align: 'center', color: 27, if: 'count("boss") > 0' },
    ],
    rules: [
      { on: 'var', var: 'hp', op: '<=', value: 0, do: [{ music: null }, { wait: 1, then: [{ scene: 'gameover' }] }] },
    ],
    scenes: {
      title: {
        bg: 1, music: null,
        hud: [
          { text: 'EMBER KEEP', x: 'center', y: 60, size: 2, color: 27 },
          { text: 'behaviors · states · dialogue', x: 'center', y: 92, color: 20 },
          { text: 'PRESS START', x: 'center', y: 140, color: 21, blink: true },
          { text: 'A talk/confirm  B attack', x: 'center', y: 190, color: 23 },
          { text: '="Saved game: " + (hasSave() ? "yes" : "no")', x: 'center', y: 204, color: 22 },
        ],
        rules: [{ on: 'button', button: 'start', do: [
          { if: 'hasSave()', then: [{ load: true }], else: [{ reset: true }] },
          { scene: 'town' } ] }],
      },
      town: {
        tileSize: 16, gravity: 0, bg: 10, music: 'town', ysort: true,
        map: [
          '################',
          '#,,,,,,,,,,,,,,#',
          '#,,BB,,,,,,BB,,#',
          '#,,,,,,,,,,,,,,#',
          '#,,N,,,,,,,M,,,#',
          '#,,,,,,,,,,,,,,#',
          '#,,,,,,I,,,,,,,#',
          '#,,,,,,,,,,,,,,#',
          '#,,,,,,P,,,,,,,#',
          '#,,,,,,,,,,,,,,#',
          '################',
        ],
        legend: { P: 'hero', N: 'elder', M: 'merchant', I: 'innkeeper' },
        entities: [{ prefab: 'town_door', tx: 7, ty: 10 }],
      },
      dungeon: {
        tileSize: 16, gravity: 0, bg: 1, music: 'dungeon',
        map: [
          '####################',
          '#F,,,,,,,P,,,,,,,,F#',
          '#FF,PP,FFFFF,PP,FFF#',
          '#FF,,,,FFFFF,,,,FFF#',
          '#FFFFF,,S,,,,,,FFFF#',
          '#FFFFF,,,,,,S,,FFFF#',
          '#FFFF,,,V,,V,,FFFFF#',
          '#FFF,,,,,,,,,,,FFFF#',
          '#FFF,C,,,,,,,,KFFFF#',
          '#FFF,,,,,,,#####FFF#',
          '#FFF,,,,,,,#,,,#FFF#',
          '#FFF,,,,,,,#,,,#FFF#',
          '#FFF,,,,,,,#,G,#FFF#',
          '#FFF,,,,,,,#####FFF#',
          '####################',
        ],
        legend: { S: 'slime', V: 'bat', C: 'chest_item', K: 'archer_slime', G: 'golem', P: 'hero' },
        entities: [{ prefab: 'keep_door', tx: 11, ty: 10 }],
      },
      gameover: {
        bg: 0, music: null,
        hud: [{ text: 'YOU FELL', x: 'center', y: 90, size: 2, color: 27 }, { text: 'PRESS START', x: 'center', y: 140, color: 21, blink: true }],
        rules: [{ on: 'button', button: 'start', do: [{ load: true }, { scene: 'town' }] }],
      },
    },
  };
  delete DC.KEEP_CART.tiles['.'];
})();

/* Stack World — a small showcase of sprite stacking: chunky "totem" scenery built from layered
   pixel art in a normal top-down garden, then a rotating stacked buggy viewed in Mode 7. */
(function () {
  const DC = window.DC;
  const solid8 = (c) => Array(8).fill(c.repeat(8));
  const ring8 = (rim, fill) => [rim.repeat(8), rim + fill.repeat(6) + rim, rim + fill.repeat(6) + rim, rim + fill.repeat(6) + rim, rim + fill.repeat(6) + rim, rim + fill.repeat(6) + rim, rim + fill.repeat(6) + rim, rim.repeat(8)];

  DC.STACK_CART = {
    format: 'DCART-1',
    meta: { title: 'Stack World', author: 'Data Console', width: 256, height: 224, start: 'title' },
    vars: { gems: 0 },
    sprites: {
      hero: { w: 8, h: 8, scale: 2, frames: [
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '..h..h..', '.44..44.'],
        ['..rrrr..', '.rrrrrr.', '..7707..', '..7777..', '.hhhhhh.', '7.hhhh.7', '.h....h.', '44....44'],
      ] },
      /* --- static sprite-stacks: each is ONE stack made of several layers, bottom to top --- */
      pine: { stack: true, w: 8, h: 8, frames: [[
        solid8('4'), solid8('4'),
        ring8('.', 'c'), ring8('.', 'a'),
        ['........', '..cccc..', '.caaaac.', '.caaaac.', '.caaaac.', '..cccc..', '........', '........'],
        ['........', '...cc...', '..caac..', '..caac..', '..cccc..', '........', '........', '........'],
        ['........', '........', '...cc...', '...cc...', '........', '........', '........', '........'],
      ]] },
      boulder: { stack: true, w: 8, h: 8, frames: [[
        ['........', '.nnnnnn.', 'nnnnnnnn', 'nnnnnnnn', 'nnnnnnnn', 'nnnnnnnn', '.nnnnnn.', '........'],
        ['........', '..mmmm..', '.mmmmmm.', '.mmmmmm.', '.mmmmmm.', '..mmmm..', '........', '........'],
        ['........', '........', '..llll..', '..llll..', '..llll..', '........', '........', '........'],
      ]] },
      mushroom: { stack: true, w: 8, h: 8, frames: [[
        ['........', '........', '........', '..7777..', '.777777.', '.777777.', '..7777..', '........'],
        ['........', '..rrrr..', '.rrrrrr.', 'rrl8lrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '........'],
      ]] },
      pillar: { stack: true, w: 8, h: 8, frames: [[
        solid8('n'), solid8('m'), solid8('m'), solid8('m'), solid8('m'), solid8('n'),
      ]] },
      gem_stack: { stack: true, w: 6, h: 6, frames: [
        [['......', '.hhhh.', 'hhhhhh', 'hhhhhh', '.hhhh.', '......'], ['......', '..hh..', '.hhhh.', '.hhhh.', '..hh..', '......'], ['......', '......', '..ll..', '..ll..', '......', '......']],
        [['......', '.aaaa.', 'aaaaaa', 'aaaaaa', '.aaaa.', '......'], ['......', '..aa..', '.aaaa.', '.aaaa.', '..aa..', '......'], ['......', '......', '..ll..', '..ll..', '......', '......']],
        [['......', '.8888.', '888888', '888888', '.8888.', '......'], ['......', '..88..', '.8888.', '.8888.', '..88..', '......'], ['......', '......', '..ll..', '..ll..', '......', '......']],
      ] },
      buggy: { stack: true, w: 10, h: 6, frames: (() => {
        const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));
        const behind = [ ['....7777..', '...777777.', '..77oo77..', '.7777777..', '.7777777..', '..nn..nn..'],
                          ['..........', '...hhhh...', '..hhhhhh..', '..hhhhhh..', '...hhhh...', '..........'] ];
        const right = [ ['77770000..', '777700000.', '7777000000', '77770000..', '.nn....nn.', '..........'],
                         ['..........', 'hhhhh.....', 'hhhhhh....', 'hhhhh.....', '..........', '..........'] ];
        const front = [ ['..7777....', '.777777...', '..oo77oo..', '.7777777..', '.7777777..', '..nn..nn..'],
                         ['..........', '...hhhh...', '..hhhhhh..', '..hhhhhh..', '...hhhh...', '..........'] ];
        return [behind, right, front, right.map(mirror)];
      })() },
      grass: { w: 8, h: 8, scale: 2, frames: [['aaaaaaaa', 'aa9aaaaa', 'aaaaaa9a', 'aaaaaaaa', 'a9aaaaaa', 'aaaa9aaa', 'aaaaaaaa', 'aaaaaa9a']] },
      hedge: { w: 8, h: 8, scale: 2, frames: [['cccccccc', 'ca9a9a9c', 'cccccccc', 'c9a9a9ac', 'cccccccc', 'ca9a9a9c', 'cccccccc', 'cccccccc']] },
      sand: { w: 8, h: 8, scale: 2, frames: [rows2('6')] },
      door: { w: 8, h: 8, scale: 2, frames: [['nnnnnnnn', 'nn0000nn', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'n000000n', 'nnnnnnnn']] },
      sky: { w: 16, h: 6, scale: 3, frames: [['................', '................', '................', '................', '................', '................']] },
      poof: { w: 8, h: 8, scale: 2, frames: [
        ['........', '...ll...', '..llll..', '.llllll.', '..llll..', '...ll...', '........', '........'],
        ['..l..l..', '.l....l.', '...ll...', '.l....l.', '..l..l..', '........', '........', '........'],
      ] },
      cone: { stack: true, w: 8, h: 8, frames: [[ ring8('.', 'l'), ring8('.', 'h'), ['........', '..llll..', '.llllll.', '.llllll.', '..llll..', '........', '........', '........'] ]] },
    },
    sounds: {
      gem: { wave: 'square', f: [988, 1480, 1800], d: 0.15, v: 0.16 }, door: { wave: 'triangle', f: [200, 600, 300], d: 0.3, v: 0.22 },
      go: { wave: 'square', f: [700, 1000], d: 0.2, v: 0.16 }, win: { wave: 'square', f: [523, 659, 784, 1046], d: 0.7, v: 0.16 },
      talk: { wave: 'triangle', f: [700, 740], d: 0.05, v: 0.12 },
    },
    music: { garden: { bpm: 96, div: 2, tracks: [
      { wave: 'triangle', v: 0.08, notes: 'C4 . E4 . G4 . E4 . A3 . C4 . E4 . D4 . F4 . A4 . F4 . G4 .' },
      { wave: 'sine', v: 0.08, notes: 'C3 - - - F2 - - - A2 - - - G2 - - -' },
    ] } },
    tiles: {
      W: { sprite: 'hedge', solid: true },
      g: { sprite: 'grass' },
      s: { sprite: 'sand' },
      D: { sprite: 'door', warp: { scene: 'diorama', at: 'B' } },
      '#': { color: 15, solid: true },
    },
    prefabs: {
      hero: { tags: ['player'], sprite: { name: 'hero', fps: 8, anim: { idle: [0], walk: [0, 1] } }, body: { w: 12, h: 12 }, control: { type: 'topdown', speed: 72 } },
      pine_tree: { sprite: { name: 'pine' }, solid: true },
      round_boulder: { sprite: { name: 'boulder' }, solid: true },
      toadstool: { sprite: { name: 'mushroom' } },
      stone_pillar: { sprite: { name: 'pillar' }, solid: true },
      spike_cone: { sprite: { name: 'cone' }, solid: true },
      gem: { tags: ['gem'], sprite: { name: 'gem_stack', fps: 3 }, pickup: { var: 'gems', add: 1, sound: 'gem', do: [{ if: 'gems >= 2', then: [{ text: 'All totems found — the diorama door has opened!', t: 2.5 }] }] } },
      gate: { sprite: { name: 'door' }, tags: ['gate'], solid: true,
        rules: [{ on: 'touch', tag: 'player', if: 'gems >= 3', do: [{ sound: 'door' }, { effect: 'poof', at: 'self' }, { destroy: 'self' }] },
                { on: 'touch', tag: 'player', if: 'gems < 3', do: [{ say: ['Find the 3 gem totems first.'] }] }] },
      buggy: {
        tags: ['player'], sprite: { name: 'buggy', angles: 4 }, body: { w: 8, h: 6, bounce: 0.3 },
        control: { type: 'kart', speed: 90, accel: 160, turn: 200, grip: 8, heading: 0 },
      },
    },
    hud: [
      { text: 'GEMS {gems}/3', x: 6, y: 6, color: 8, if: 'scene != "diorama"' },
    ],
    rules: [],
    scenes: {
      title: {
        bg: 1, music: null,
        hud: [
          { text: 'STACK WORLD', x: 'center', y: 60, size: 2, color: 19 },
          { text: 'a sprite-stacking demo', x: 'center', y: 92, color: 20 },
          { text: 'PRESS START', x: 'center', y: 140, color: 21, blink: true },
          { text: 'find 3 gem totems, then drive!', x: 'center', y: 190, color: 23 },
        ],
        rules: [{ on: 'button', button: 'start', do: [{ reset: true }, { scene: 'garden' }] }],
      },
      garden: {
        tileSize: 16, gravity: 0, bg: 10, music: 'garden', ysort: true,
        map: [
          'WWWWWWWWWWWWWWWW',
          'WggggggggggggggW',
          'WgTTgggggBBggggW',
          'WggggggggggMgggW',
          'WgggPPPggggggggW',
          'WggggggggggMgggW',
          'WgggTggggPPggggW',
          'WggggggggggggggW',
          'WgggggMgggTggggW',
          'WggggggggggggggW',
          'WWWWWWWWWDWWWWWW',
        ],
        legend: { P: 'pine_tree', B: 'round_boulder', T: 'toadstool', M: 'gem', X: 'spike_cone' },
        entities: [{ prefab: 'hero', tx: 8, ty: 4 }, { prefab: 'gate', tx: 8, ty: 10 }],
      },
      diorama: {
        tileSize: 16, gravity: 0, bg: 18, music: null,
        mode7: { horizon: 70, height: 20, fov: 74, back: 50, spriteScale: 0.8, outside: 12, ground: 12, turn: 2.5 },
        layers: [{ sprite: 'sky', factor: 0.3, z: -1 }],
        map: [
          '################',
          '#..............#',
          '#..X........X..#',
          '#..............#',
          '#......B.......#',
          '#..............#',
          '#..X........X..#',
          '#..............#',
          '################',
        ],
        legend: { B: 'buggy', X: 'stone_pillar' },
        hud: [
          { text: 'sprite stack + angles', x: 'center', y: 200, color: 21 },
          { text: 'makes a rotating totem', x: 'center', y: 210, color: 21 },
        ],
      },
    },
  };
  function rows2(c) { return Array(8).fill(c.repeat(8)); }
})();
