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
