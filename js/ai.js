/* Data Console — prompt builder for Gemini / ChatGPT / Claude */
(function () {
  const DC = window.DC;

  DC.SPEC = `DATA CONSOLE CARTRIDGE FORMAT (DCART-1)
A game is ONE JSON object. The console reads it directly. There is no code, only data: entities are built from components, and game logic is written as event rules.

TOP LEVEL
{"format":"DCART-1","meta":{},"vars":{},"sprites":{},"sounds":{},"music":{},"tiles":{},"prefabs":{},"scenes":{},"hud":[],"rules":[]}

META: "title", "author", "width" (64-640, default 256), "height" (64-480, default 224), "start" (name of the first scene), optional "coop" ({"1":"prefabForPlayer2"}), "pause" (false stops Start from pausing), "singletons" (prefab names that exist once for the whole game — managers, a following companion), "persist" (true, or a list of variable names the save action stores), "haptics" (false turns off automatic buzzes), "motion" (true if the game reads tilt/shake, "steer" to also steer with tilt).

COLORS: numbers 0-31 pick from the palette: 0 black, 1 midnight, 2 plum, 3 dark brown, 4 brown, 5 orange, 6 tan, 7 skin, 8 yellow, 9 lime, 10 green, 11 teal, 12 dark green, 13 dark olive, 14 slate, 15 indigo, 16 deep blue, 17 blue, 18 sky blue, 19 cyan, 20 pale blue, 21 white, 22 blue grey, 23 grey, 24 dark grey, 25 charcoal, 26 purple, 27 red, 28 rose, 29 pink, 30 olive, 31 gold. A "#rrggbb" string also works anywhere a color is expected.

SPRITES: "name": {"w":8,"h":8,"scale":2,"frames":[[rows],[rows]]}
- A frame is an array of exactly h strings, each exactly w characters long.
- Pixel characters: "0"-"9" are colors 0-9, "a"-"v" are colors 10-31 ("a"=10 green, "h"=17 blue, "l"=21 white, "n"=23 grey, "r"=27 red, "4"=brown, "7"=skin, "8"=yellow, "0"=black). "." is transparent.
- "scale" enlarges the art: 8x8 art with scale 2 fills a 16px tile. Draw side views facing RIGHT; the console mirrors them automatically.
- Image file alternative: {"src":"hero.png","w":16,"h":16} loads assets/hero.png and slices it into w x h frames, left to right, top to bottom.
- Sprite stacking: {"stack":true,"w":8,"h":8,"frames":[[[layer0 rows],[layer1 rows],[layer2 rows]]]} draws each "frame" as several pixel-art layers stacked with a small vertical offset — a chunky 3D-voxel look built entirely from flat pixel art (think Zaxxon, or the cars in old top-down racers), no 3D modelling needed. Each layer is a normal h-row frame; list them bottom to top. For a rotating object (a kart, a boulder), combine with "angles" (below) so each angle is its own pre-drawn stack — the console never has to shear or fake-rotate a stack at runtime. Stack sprites cannot currently be hand-edited in the Sprites tab; write them in the Code tab (the AI can generate them directly).

SOUNDS: "name": {"wave":"square|triangle|sawtooth|sine|noise","f":[startHz,endHz],"d":seconds,"v":volume0to1}. Three or more "f" values play as an arpeggio. Audio file alternative: {"src":"jump.wav"}.
If sounds named "jump", "hurt", "die", "stomp" or "talk" exist, the console plays them automatically at those moments.

MUSIC: "name": {"bpm":120,"div":2,"tracks":[{"wave":"square","v":0.07,"notes":"C5 - E5 G5 A5 . G5 E5"},{"wave":"triangle","v":0.12,"notes":"C3 - - - G2 - - -"}]}
- Tokens: note names (C4, F#5, Bb3), "." rest, "-" holds the previous note. With "div":2 each token is an eighth note. All tracks loop together; give tracks the same token count.

TILES: one-character keys used in scene maps, e.g. "#": {"sprite":"brick","solid":true}
- "solid": blocks movement. "oneWay": stand on it and jump up through it.
- "hurt": damage on touch (spikes). "kill": true kills instantly (lava).
- "hit": {"become":"U","spawn":"prefab","drop":LOOT,"effect":"poof","sound":"name","burst":6,"do":[actions]} runs when a player bumps it from below (question blocks; "become":"." breaks a brick).
- "break": {"hp":1,"by":["player"],"become":".","drop":LOOT,"effect":"leaf_burst","hitEffect":"spark","sound":"cut","hitSound":"tink","burst":8,"burstColor":[10,12],"haptic":"light","do":[actions]} lets attacks destroy the tile: bushes, pots, crates, cracked walls. Anything with a "hurt" component that overlaps it deals its damage once per swing. "by" lists tags allowed to break it — the attack's own tags or its owner's ("player" by default, ["bomb"] for bomb-only walls, "any"). "break": true uses all defaults.
- "color": a flat colour instead of a sprite. "fps": animation speed for multi-frame tile sprites.
- "layer": 1 draws the tile in front of characters (tree tops, archways, foreground grass).
- Driving surfaces: "slow": 0.45 (grass/sand top-speed multiplier), "boost": 1 (seconds of 1.5x speed), "jump": 170 (ramp launch power), "sound" played when triggered.
- A tile can also carry ANY entity component (warp, talk, pickup, ai, health, emitter, move, text, tags, spawner…). It then becomes an entity placed on that square — the cleanest way to make doors: "D": {"sprite":"door","warp":{"scene":"cave"}}. Tile "solid", "oneWay" and "hurt" still work on it.
- "." is always empty space and cannot be redefined.

PREFABS: entity templates built from these components (use only these keys):
- "extends":"baseName" starts this prefab as a copy of another prefab, then applies this prefab's own fields on top (its own fields win; "rules" and "tags" from the base are kept, not replaced). Good for shared setups: "enemy_base":{"body":{...},"health":{...}}, then "goblin":{"extends":"enemy_base","sprite":{...}}.
- "use": lists reusable BEHAVIORS (see BEHAVIORS below) this prefab gets, e.g. "use":["patrols"] or "use":[{"patrols":{"speed":50}}] to override that behavior's params. A behavior's own fields act like a base layer too — the prefab's own fields still win, and rules/tags concatenate rather than replace.
- "tags": ["player"]. Every prefab is also tagged with its own name. The hero MUST have the tag "player"; enemies should have "enemy".
- "sprite": {"name":"kart","angles":4} shows the frame for the angle you see it from in MODE 7 (frame 0 from behind, then turning clockwise: nose pointing right, front, nose pointing left; 8 angles also work). "rotate":true turns a top-down sprite (drawn facing up) with its heading. "shadow":false hides the ground shadow when it is in the air.
- "sprite": {"name":"hero","fps":8,"layer":0,"anim":{"idle":[0],"walk":[0,1],"jump":[2],"attack":[2],"hurt":[3]}}. Top-down games may add "walk_up","walk_down","idle_up","idle_down". Frame numbers index the sprite's frames. Without "name": {"color":8,"w":16,"h":16,"shape":"rect|circle"}.
- "body": {"w":12,"h":14,"gravity":1,"solid":true,"bounce":0,"static":false} hitbox (centred, bottom aligned), physics and tile collision. "gravity":0 floats in gravity scenes; "solid":false ignores walls.
- "control": {"type":"platformer|topdown|shmup|kart","speed":90,"jump":300,"jumps":1,"player":0} player input. In platformer mode button A jumps ("jumps":2 = double jump). "kart": A gas, B brake/reverse, left/right steer, X hop; options "speed" (top speed), "accel", "brake", "turn" (degrees per second), "grip" (higher = less sliding), "hop", "heading" (starting direction in degrees: 0 east, 90 south, 180 west, -90 north). Tilt steering works automatically.
- "ai": {"type":"patrol|chase|flee|wander|fly|hop|turret|race","speed":30,"range":90,"target":"player"}. race (or path) drives through "path":[[tx,ty],…] tile waypoints in order, looping, with "turn" and "heading"; it slows on grass, uses boost pads and ramps, counts self.laps and fires a "lap" entity event. patrol turns at walls and ledges; chase follows the target inside range (add "idle":"wander" or "patrol" for when it is out of range); fly = wavy flight ("amp","freq"); hop jumps toward the target every "every" seconds with "jump" power; turret stands still (pair it with "attack").
- "health": {"hp":3,"invuln":1,"var":"hp","drop":LOOT,"effect":"poof","hitEffect":"spark","burst":12,"dieTime":0.5,"onDeath":[actions]}. If the sprite has an "anim":{"die":[…]} sequence, the entity stops, plays it, then drops its loot and disappears.. "var" copies hp into a global variable for the HUD and carries it between scenes; it also creates "<var>Max".
- "hurt": {"damage":1,"targets":["player"],"knockback":120,"destroy":false} damages touching entities that have one of the target tags. "destroy":true removes it after a hit (bullets).
- "stompable": {"bounce":220} a falling player landing on top damages it instead of getting hurt.
- "pickup": {"var":"coins","add":1,"heal":0,"sound":"coin","do":[actions]} collected on touch by players.
- "attack": {"button":"b","prefab":"slash","cooldown":0.35,"offset":12,"speed":0,"follow":true,"sound":"sword"} spawns the prefab in the facing direction. "speed">0 fires it as a projectile; "follow":true keeps it attached (sword swings). On an entity without "control" it fires automatically at a "target" within "range".
- "lifetime": {"t":0.2} removes the entity after t seconds.
- "talk": {"name":"Elder","lines":[…],"branches":[…],"then":[actions],"button":"a","range":22,"once":false} shows "!" when a player is near; the button opens a dialogue box.
  - A line is "text" or {"text":"…","if":"formula","name":"Other speaker","do":[actions run when it appears],"choices":[…]}. Lines whose "if" is false are skipped. Text can show {formulas}.
  - "choices":[{"text":"Yes","if":"gold >= 20","do":[actions],"lines":[lines that follow]},{"text":"No","cancel":true,"lines":["Maybe later."]}] shows a menu (up/down + A; B picks the "cancel" option). Choices whose "if" is false are hidden.
  - "branches":[{"if":"flags.questDone","lines":[…],"do":[…]},{"if":"self.talks > 0","lines":[…]}] — the first branch whose "if" is true replaces "lines", and its "do" runs when that conversation ends (instead of "then"). self.talks counts finished conversations with this NPC.
  - The "say" action takes the same kind of lines, so any rule can start a conversation with choices. A "say" while a conversation is open adds its lines to that conversation (in order, same speaker) instead of replacing it, so several if/else + say actions in a row all get shown.
- "warp": {"scene":"cave"} touching it moves players to that scene. Add "at":"D" to arrive at a tile/legend character or tag there, or "tx"/"ty" for an exact tile. With none of these, players arrive at the doorway that leads back (see DOORS).
- "move": {"path":[[0,0],[4,0]],"speed":30,"loop":false} follows tile offsets from its start (moving platforms, patrolling guards).
- "solid": true or {"oneWay":true} other bodies collide with and ride on it (platforms, crates, NPCs).
- "spawner": {"prefab":"slime","every":3,"max":4}
- "emitter": {"color":[8,5],"rate":20,"speed":30,"life":0.6,"gravity":0,"angle":270,"spread":40} particles (torches, jets).
- "text": {"value":"Score {score}","color":21} draws text in the world.
- "rules": [ ... ] rules that belong to this entity (see ENTITY RULES). "persistent": true keeps the entity when the scene changes.
- "vel": [vx,vy] starting velocity. "vars": {} per-entity values. "noCollide": true skips entity collisions. "layer": draw order (higher is in front; 1 or more also draws over "layer":1 tiles).

BEHAVIORS: "behaviors" is a cart-level dict of reusable, parametrized bundles of components and rules that any prefab can "use". Define once, reuse on many prefabs with different numbers.
{"behaviors":{"patrols":{"params":{"moveSpeed":30},"tags":["enemy"],"ai":{"type":"patrol","speed":"=self.moveSpeed"}}}}
(name the param "moveSpeed", not "speed" — self.speed is reserved, see the warning under FORMULAS)
A behavior's "params" are its defaults; a prefab using it can override some of them: "use":[{"patrols":{"moveSpeed":80}}]. Params become vars on the entity, so both the behavior's own fields AND the prefab's own rules can read them as self.speed — this is how a behavior parametrizes itself, using ordinary formulas (see FORMULAS). Params also work for picking a prefab dynamically, e.g. a "shooter" behavior with params:{"bullet":"arrow"} and attack:{"prefab":"=self.bullet",...}. A behavior can itself "use" other behaviors. Keep behaviors small and named after what they DO ("patrols", "shootsAtPlayer", "breaksIntoLoot"), not what they ARE.

SCENES: "name": {
  "tileSize":16, "gravity":700 (0 = top-down), "bg":1, "music":"theme" (null = silence),
  "map":["row string", "..."], "legend":{"P":"hero","C":"coin"},
  "entities":[{"prefab":"boss","tx":10,"ty":4}],
  "camera":{"lerp":0.2} or {"scroll":[30,0]} for auto-scrolling shooters,
  "layers":[{"color":15,"y":120,"h":104,"factor":0},{"sprite":"hills","y":140,"factor":0.3}] parallax layers (see LAYERS),
  "mode7":{...} turns the map into a 3D ground plane (see MODE 7), "zGravity":600 (fall speed for hops and ramp jumps),
  "ysort":true (top-down depth sorting), "hud":[...] (replaces the global HUD; [] hides it),
  "vars":{} (set on entering), "rules":[...] }
- Map characters are tiles; legend characters spawn a prefab standing on that tile; "." is empty. All rows in a map must be the same length.
- Gravity scenes: map sides are walls and falling below the map kills. Top-down scenes: every edge is a wall.
- A 256x224 screen shows 16x14 tiles of 16px. Make levels wider or taller than that so the camera scrolls.

LAYERS: {"sprite":"hills","factor":0.5,"y":120,"z":-1,"speed":[8,0],"alpha":0.8,"repeatY":false} or {"color":16,"y":0,"h":60,"z":-1}.
- "factor" is how fast it scrolls with the camera (0 fixed, 1 same as the map). "speed" auto-scrolls in pixels per second (clouds, waterfalls, rain).
- "z" sets depth: below 0 behind the map, 0 to 1 between the map and characters, 1 or more in front of everything (fog, foreground foliage, a cockpit). "repeatY":true tiles a sprite over the whole screen.

MODE 7 (SNES-style 3D ground, for racing, flying, F-Zero, Pilotwings, overworld maps): add "mode7":{"horizon":72,"height":22,"fov":70,"back":56,"spriteScale":0.65,"fog":20,"fogDepth":0.25,"outside":10,"ground":10,"angle":-90} to a scene.
- The tile map becomes a flat floor seen in perspective from a camera "height" above it, "back" pixels behind whatever the camera follows, rotating with its heading. "horizon" is the screen row where the ground meets the sky; layers with "z":-1 draw the sky and scroll sideways as you turn (a sprite layer with no "y" sits on the horizon).
- Sprites stand up as billboards that shrink with distance and are drawn far to near. Give vehicles "sprite":{"angles":4}.
- "outside" is the colour beyond the map ("wrap" repeats it forever), "ground" fills transparent tile pixels, "fog" fades distant ground into that colour.
- Use gravity 0, "control":{"type":"kart"} for the player and "ai":{"type":"race","path":[…]} for rivals. Walls are solid tiles; karts bounce off with "body":{"bounce":0.4}. Laps: a checkpoint tile rule sets a flag, the finish-line tile rule counts a lap only when the flag is set.
- Formulas can read self.heading (degrees), self.speed, self.z, self.laps, and set them (e.g. {"set":"self.z","value":0}).

LOOT (drops from tiles, enemies and the drop action): "coin" · ["coin","coin","heart"] (all of them) · [{"prefab":"heart","chance":0.3},{"prefab":"coin","count":[1,3]},{"prefab":"key","if":"not flags.gotKey"}] (each rolled on its own) · {"one":[{"prefab":"heart","weight":1},{"prefab":"rupee","weight":3},{"prefab":null,"weight":2}]} (exactly one, by weight; null = nothing). Loot scatters when there are several; items with a body pop upward.

EFFECTS: "effect":"leaf_burst" plays a one-shot animation — the name of a sprite (its frames play once at 12 fps, in front of everything) or of a prefab (spawned there, so it can have its own lifetime, sound rules, particles…). Use them for breaking, deaths, hits, sparkles and dust.

HUD items (drawn on screen, not the world):
{"text":"COINS {coins}","x":4,"y":4,"color":21,"align":"left|center|right","size":1,"blink":false}
{"icons":"heart","count":"hp","max":"hpMax","x":4,"y":4} repeats a sprite; the sprite's frame 1 marks empty slots
{"bar":"hp","max":"hpMax","x":4,"y":14,"w":40,"h":4,"color":27}
{"sprite":"coin","x":200,"y":4}
{"minimap":true,"x":196,"y":168,"w":54,"h":40,"colors":{"player":8,"rival":19}} the map in miniature with coloured dots for tagged entities
"x":"center" centres text. Any item may include "if":{condition}.

VARS: "vars" holds global values that persist across scenes: numbers, text, lists and nested objects, e.g. {"gold":0,"day":1,"inv":{"seeds":3,"turnips":0},"flags":{"metElder":false}}. Use dots to reach inside: "inv.seeds". {"reset":true} restores the starting values. Each entity also has its own "vars" (per-entity state like a crop's growth stage), read as self.stage.

FORMULAS: any value written as a string starting with "=" is calculated: {"add":"gold","value":"=price * qty"}, {"velocity":"self","vy":"=-200 - self.power * 20"}. Conditions ("if" in actions, "when" rules, HUD "if") can simply be a formula string: "if":"gold >= 50 and not flags.boughtSword".
- Operators: + - * / % ^, == != < <= > >=, and / or / not, ternary a ? b : c, parentheses, "text" + number joins text.
- Names: global vars by name; self, other (the other entity in a touch/hit/collide), player, and their fields x y vx vy cx cy w h tx ty hp maxhp onGround dir age prefab plus any entity var; time, scene, tilt.x, tilt.y, screen.w, screen.h, cam.x, cam.y; list[i] and len(list).
- Functions: min max abs floor ceil round sqrt sin cos atan2 sign clamp(v,lo,hi) lerp(a,b,t) rand() rand(a,b) randint(a,b) chance(p) pick(a,b,…) len has(x,item) str num int pad(n,width) count("tag") nearest("tag",range) first("tag") dist(a,b) angle(a,b) btn("a") btnp("a") tile(tx,ty) hasSave().
- Reserved: x y vx vy cx cy w h tx ty hp maxhp onGround dir diry age id alive prefab player sprite mode z heading speed wp are always self's BUILT-IN fields, never a var — a var or param with one of these exact names is shadowed and silently reads the built-in instead. If a behavior needs a "speed" number, call the param moveSpeed, spd, or similar.
- Text anywhere (HUD, dialogue, banners, entity text) can embed formulas in braces: "Day {day} — {inv.seeds} seeds", "{self.hp}/{self.maxhp}". A whole text field can ALSO be one bare formula, same as any other value: "text": "=\"Day \" + str(day)" works too — pick whichever reads cleaner; {braces} is usually simplest for a few values inside a sentence, a bare "=" formula suits a fully computed line.
- Formulas can only read game values. There is no other code.

RULES: {"on":EVENT, ...fields, "do":[actions]}. Any rule (except "when") can also have "if" and "else": {"on":"tile","tile":"F","if":"cp == 1","do":[…],"else":[{"say":["Finish the lap first!"]}]}
{"on":"start"} when the scene begins
{"on":"every","t":2} repeating timer · {"on":"after","t":3} once
{"on":"button","button":"start"} buttons: up down left right a b x y start select
{"on":"collide","a":"player","b":"goal"} two tags start touching; "a" and "b" name them in actions
{"on":"var","var":"hp","op":"<=","value":0} fires when the comparison becomes true
{"on":"count","tag":"enemy","op":"==","value":0} fires when the number of tagged entities matches
{"on":"destroyed","tag":"boss"}
{"on":"tile","tile":"F","tag":"player"} an entity enters a tile character
{"on":"break","tile":"b"} a breakable tile was destroyed; formulas can read tx, ty and tile, and self is whoever broke it
{"on":"when","if":{condition}}
Conditions: {"var":"keys","op":">=","value":1}, {"count":"enemy","op":"==","value":0}, {"all":[...]}, {"any":[...]}, {"not":{...}}, {"chance":0.5}. "op" is one of == != < <= > >=.

ACTIONS (one per object, run in order):
{"set":"score","value":0} {"add":"score","value":10} value may be a number, another var name, or [min,max] for random
{"scene":"level2"} or {"scene":"level2","at":"D"} or {"scene":"level2","tx":2,"ty":10} {"restart":true} {"reset":true}
{"spawn":"prefab","at":"self","dx":0,"dy":-16} or with "tx"/"ty" tiles or "x"/"y" pixels; optional "vx","vy"
{"destroy":"b"} {"kill":"enemy"} {"damage":"a","amount":1} {"heal":"player","amount":1}
{"velocity":"a","vx":0,"vy":-250} {"move":"player","tx":3,"ty":4}
{"say":["Line one","Line two"],"name":"Sign"} dialogue box · {"text":"STAGE CLEAR","t":2} banner
{"sound":"coin"} {"music":"boss"} {"music":null}
{"shake":0.3} {"flash":21} {"burst":"self","color":8,"count":12}
{"setTile":"B","tx":5,"ty":3} {"breakTile":true,"tx":5,"ty":3} (runs that tile's break) {"effect":"poof","at":"self","dx":0,"dy":-8} {"drop":LOOT,"at":"self"}
{"if":{condition},"then":[...],"else":[...]} — "if", "then" and "else" go in ONE object, and nothing else belongs in it. Chain with "else":{"if":…,"then":…,"else":…}. Use as many if objects in a list as you like; they all run in order.
{"switch":[{"if":"mood == 'angry'","then":[…]},{"if":"gold > 100","then":[…]},{"then":[…default…]}]} runs the first case whose "if" is true.
{"wait":1.5,"then":[...]}
{"set":"self.stage","value":"=self.stage + 1"} set/add also reach entity fields and vars: self.x, self.hp, other.gold, player.x, inv.seeds
{"push":"inv.items","value":"sword"} {"remove":"inv.items","value":"sword"} lists
{"setSprite":"crop_ripe","target":"self"} {"comp":"ai.speed","value":60,"target":"self"} change any component field live ({"comp":"hurt","value":null} removes it)
{"tag":"ripe","target":"self"} {"untag":"ripe"}
{"emit":"newDay"} sends a custom event that {"on":"event","name":"newDay"} rules (global, scene or entity) receive
{"haptic":"light|medium|heavy|double|success|warning|error"} vibration for the player concerned
{"save":true} {"load":true} {"erase":true} the cartridge's save memory (needs meta.persist)
{"goto":"stateName"} switches a stateful entity (see STATES) to that state; also works as shorthand directly on a rule, alongside its "if"
{"cancelDeath":true} inside an "on":"die" rule keeps the entity alive (with hp at 0) instead of letting it be removed — pair with {"goto":…} to move it to a "dead"/"defeated" state
Targets: "a", "b", "self", "other", or a tag name (acts on every entity with that tag).

ENTITY RULES: a prefab's "rules" run for each copy, with self = that entity. Events: {"on":"spawn"}, {"on":"update"}, {"on":"land"} (touched down after a hop or jump), {"on":"lap"} (race AI finished a lap), {"on":"every","t":2}, {"on":"after","t":1}, {"on":"when","if":"self.hp < 3"}, {"on":"touch","tag":"player"} (other = what touched it), {"on":"hit"} (other = attacker), {"on":"die"}, {"on":"tile","tile":"W"}, {"on":"button","button":"a"} (its own player if it has control), {"on":"event","name":"..."}, {"on":"shake"}. Example crop: "vars":{"stage":0},"rules":[{"on":"event","name":"newDay","do":[{"add":"self.stage"}]},{"on":"when","if":"self.stage >= 3","do":[{"setSprite":"turnip_ripe"},{"tag":"ripe"}]}]
STATES: a prefab can have a "states" component — a state machine for boss phases, enemy modes, doors, day/night, menus — instead of piling up "when" rules with manual flags.
"states": {
  "start": "asleep",
  "asleep": { "ai": {"type":"turret"}, "rules": [ {"on":"when","if":"dist(self,player) < 80", "goto":"awake"} ] },
  "awake": { "enter": [ {"sound":"roar"}, {"text":"It wakes up!","t":1} ], "ai": {"type":"chase","speed":40},
             "rules": [ {"on":"hit", "if":"self.hp <= self.maxhp / 2", "goto":"enraged"} ] },
  "enraged": { "enter": [ {"shake":0.4}, {"comp":"ai.speed","value":90} ], "ai": {"type":"chase","speed":90},
               "rules": [ {"on":"die", "do": [ {"cancelDeath":true}, {"goto":"dead"} ] } ] },
  "dead": { "enter": [ {"text":"Defeated!","t":2}, {"add":"gold","value":50} ], "ai": {"type":"turret"} }
}
- Each state can override any component (sprite, ai, control, body, attack, etc — not "health") while it is active; anything it does not mention keeps the prefab's normal value. "start" names the first state (or the first key is used).
- "enter" / "exit" are actions that run once, right when the state is entered / left.
- "rules" belong ONLY to that state, using the exact same events as ENTITY RULES ("when", "every", "hit", "touch", "tile", "button", "die"...) — self is the entity.
- {"goto":"name"} is an action that switches state (run its exit actions, apply the new state, run its enter actions); "goto" can also sit directly on a rule as shorthand for {"do":[{"goto":"name"}]}, alongside its own "if".
- Health reaching 0 destroys the entity immediately UNLESS a "die"-event rule calls {"cancelDeath":true} first — that is how a boss survives to a "dead"/"defeated" state instead of disappearing. Do this with an "on":"die" rule, not a per-frame "when" check on self.hp, since a per-frame check runs too late (the entity is already gone).
- self.mode reads the current state name in formulas/text, e.g. "HP: {self.hp} ({self.mode})".

SINGLETONS: list a prefab in meta.singletons (e.g. a "clock" with {"on":"every","t":60,"do":[{"add":"day"},{"emit":"newDay"}]}) to run game-wide logic that keeps going across every scene.
FEEL: the console buzzes automatically when the player is hurt, dies, stomps, picks up or bumps a block; add {"haptic":…} for your own moments. With meta.motion, tilt.x / tilt.y (-1 to 1) and {"on":"shake"} are available — great for marble, balance or fishing mechanics.

CONTROLS: D-pad moves. A = jump / talk / confirm. B = attack. X and Y are free for your own rules. Start pauses unless a rule listens for it.

DOORS: when players change scene without "at"/"tx", the console looks in the new scene for the way back to the scene they left — a tile rule, a warp tile/entity, or a collide rule that goes back — and places them on it. Otherwise they appear at their legend spawn. A doorway you arrive on does not fire again until you step off it, so doors never bounce you back and forth. Give each doorway its own character (for example "L" and "R") so every exit has a matching way back.

MULTIPLAYER: up to 4 players over peer-to-peer. Extra players are copies of player 0's prefab (or meta.coop) tagged "player" and "p2".."p4"; their health var gets the player number appended ("hp2").`;

  DC.AI = {
    example() {
      const d = DC.DEMO_CART;
      const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
      return {
        format: 'DCART-1',
        meta: { title: 'Tiny Hop', width: 256, height: 224, start: 'title' },
        vars: { coins: 0, hp: 3, hpMax: 3 },
        sprites: pick(d.sprites, ['hero', 'slime', 'coin', 'heart', 'brick', 'flag']),
        sounds: pick(d.sounds, ['jump', 'coin', 'stomp', 'hurt']),
        music: {},
        tiles: { '#': { sprite: 'brick', solid: true } },
        prefabs: {
          hero: { tags: ['player'], sprite: { name: 'hero', fps: 8, anim: { idle: [0], walk: [0, 1], jump: [2] } }, body: { w: 10, h: 15 }, control: { type: 'platformer', speed: 90, jump: 300 }, health: { hp: 3, var: 'hp', invuln: 1 } },
          walker: { tags: ['enemy'], sprite: { name: 'slime', fps: 3 }, body: { w: 12, h: 9 }, ai: { type: 'patrol', speed: 24 }, health: { hp: 1 }, hurt: { damage: 1, targets: ['player'] }, stompable: { bounce: 230 } },
          coin: { sprite: { name: 'coin', fps: 5 }, pickup: { var: 'coins', sound: 'coin' } },
          flag: { tags: ['goal'], sprite: { name: 'flag' } },
        },
        hud: [{ icons: 'heart', count: 'hp', max: 'hpMax', x: 6, y: 6 }, { text: 'COINS {coins}', x: 250, y: 6, align: 'right', color: 8 }],
        rules: [{ on: 'var', var: 'hp', op: '<=', value: 0, do: [{ wait: 1, then: [{ scene: 'title' }] }] }],
        scenes: {
          title: { bg: 1, hud: [{ text: 'TINY HOP', x: 'center', y: 80, size: 2, color: 8 }, { text: 'PRESS START', x: 'center', y: 130, blink: true }], rules: [{ on: 'button', button: 'start', do: [{ reset: true }, { scene: 'level' }] }] },
          level: {
            tileSize: 16, gravity: 700, bg: 18,
            map: [
              '########################',
              '#......................#',
              '#......................#',
              '#......................#',
              '#......................#',
              '#..............CC......#',
              '#.............####.....#',
              '#......................#',
              '#.......C.C...........F#',
              '#......#####.......#####',
              '#......................#',
              '#..P........W..........#',
              '########################',
              '########################',
            ],
            legend: { P: 'hero', C: 'coin', W: 'walker', F: 'flag' },
            rules: [{ on: 'collide', a: 'player', b: 'goal', do: [{ text: 'CLEAR!', t: 2 }, { wait: 2, then: [{ scene: 'title' }] }] }],
          },
        },
      };
    },

    prompt(o) {
      const genres = o.genres && o.genres.length ? o.genres.join(' + ') : 'your choice';
      const sizes = {
        small: 'Small: a title scene, 1-2 play scenes, a game over scene.',
        medium: 'Medium: a title scene, 3-4 play scenes that differ from each other, a game over scene, and a win ending.',
        large: 'Large: a title scene, 5 or more play scenes with a boss, a game over scene and a win ending.',
      };
      const art = o.art === 'files'
        ? 'ART: use image files. Every sprite uses {"src":"name.png","w":16,"h":16} (no "frames"). Add "meta":{"assetsNeeded":[{"file":"name.png","size":"16x16","frames":2,"describe":"what to draw"}]} listing every image and sound file you reference so the user can make them.'
        : 'ART: draw every sprite yourself as pixel text in "frames" (8x8 with "scale":2 is a good default). Make the art readable: outlines, eyes, highlights. Every visible prefab and tile needs real art.';
      const lines = [];
      lines.push('You are an expert game designer building a cartridge for Data Console, a fantasy game console that runs games written as JSON data.');
      lines.push('');
      lines.push('OUTPUT RULES (these matter more than anything else)');
      lines.push('1. Reply with ONE JSON object and nothing else: no markdown fences, no explanation before or after.');
      lines.push('2. Use plain straight double quotes (") for every key and string. Never use curly quotes, single quotes, comments, trailing commas, or "..." placeholders.');
      lines.push('3. Write the complete cartridge. Do not shorten, summarise, or leave parts for the user to fill in.');
      lines.push('4. Every sprite, prefab, scene, sound, music and tile you reference must be defined. Every map row in a scene must be the same length.');
      lines.push('');
      lines.push(DC.SPEC);
      lines.push('');
      lines.push('WORKING EXAMPLE (a complete tiny cart — copy its structure, not its content)');
      lines.push(JSON.stringify(this.example()));
      lines.push('');
      lines.push('DESIGN CHECKLIST');
      lines.push('- Start with a title scene (PRESS START, a rule on the start button that uses {"reset":true} then changes scene). Include a game over scene reached by a rule on the player health var, and a way to win.');
      lines.push('- Jump height is about jump*jump/(2*gravity) pixels. gravity 700 with jump 300 clears about 4 tiles of 16px. Make sure every platform and gap in your maps is reachable.');
      lines.push('- Leave at least one empty row above the floor for the player to stand in. The legend character should sit in the empty cell directly above solid ground.');
      lines.push('- Give enemies the tag "enemy" and give the player an attack or a stomp so enemies can be defeated.');
      lines.push('- Use the HUD for health and score, sounds for every action, and one music track per area.');
      lines.push('- Use formulas, entity vars and entity rules for real mechanics (growth timers, shops, stamina, combos, boss phases) instead of faking them with many global rules. Keep state that belongs to one thing in that thing\'s vars; keep game-wide state in vars or a singleton.');
      lines.push('- Make the world react: breakable bushes, pots and crates with loot tables, bomb-only walls hiding secrets, and effect sprites for every break and death.');
      lines.push('- Metroidvania routes: every door needs a way back. Never make a route one-way unless the player can always get back out (a door, a warp, or a ledge they can jump).');
      lines.push('- Combine genres through scenes: e.g. a top-down overworld scene (gravity 0) whose doors warp into side-view platformer scenes (gravity 700), with separate hero prefabs for each view that share the same health "var".');
      lines.push('');
      if (o.mode === 'edit' && o.cart) {
        lines.push('CHANGE THIS EXISTING CARTRIDGE. Keep everything that already works and return the COMPLETE updated cartridge, not just the changes.');
        lines.push(JSON.stringify(o.cart));
        lines.push('');
        lines.push('REQUESTED CHANGES: ' + (o.idea || 'Improve the game.'));
      } else {
        lines.push('THE GAME TO BUILD');
        lines.push('Idea: ' + (o.idea || 'Surprise me with a fun, polished game.'));
        lines.push('Genre mix: ' + genres);
        lines.push('Scope: ' + (sizes[o.size] || sizes.medium));
      }
      lines.push(o.coop ? 'Players: design for 1-4 players cooperating (extra players join as copies of the hero). Keep the camera-following level wide enough for a group.' : 'Players: single player.');
      lines.push(art);
      lines.push('');
      lines.push('Now reply with the JSON cartridge only.');
      return lines.join('\n');
    },

    fixPrompt(problems, cartText) {
      const lines = [
        'The Data Console cartridge you wrote has problems. Fix all of them and reply with the COMPLETE corrected JSON cartridge only — no markdown, no explanation, straight double quotes, no comments, no trailing commas.',
        '',
        'PROBLEMS',
        ...problems.map((p) => '- ' + p),
      ];
      if (cartText && cartText.length < 30000) {
        lines.push('', 'THE CARTRIDGE AS RECEIVED', cartText);
      }
      return lines.join('\n');
    },
  };
})();
