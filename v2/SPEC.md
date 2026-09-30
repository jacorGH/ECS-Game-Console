# Data Console v2 — design spec (with a working spike)

Status: **spike, not a product.** The kernel, five extensions, the full ported Flag of Gold (top-down overworld *and*
side-view cave) and a test runner exist and pass (`node v2/test/run.js` → 145 assertions). Open `v2/index.html` to play it.
v1 is untouched and keeps working.

Decisions made (by you): centre-based `pos` with native 16×16 art · warn-only for anything that doesn't break the game ·
project-folder + `.dcart` + IndexedDB storage · platformer extension next (done, see §10).

## 1. Goal, and how we'll know

A **small, safe, extendable** engine where one person can build a full Harvest Moon–SNES game, a Metroid-like, and the
Metal Gear × Hybrid Heaven dream game, *without ever editing the engine*. Small beats broad: a feature earns a place only if
it stays understandable in a phone-sized editor.

Success test (each must be true before we call v2 "done"):
1. Harvest Moon-like slice (time, crops, inventory, shop, dialogue, save) = kernel + extensions + a cart. No engine edits.
2. Metroid-like slice (platformer physics, ability gating, room camera) = same.
3. Stealth + turn-based battle slice (vision cones, alert, battle scene, skills table) = same.
4. Every mistake a cart can make produces a *pointed* error before it runs (measured by the negative tests).
5. Any extension is readable in one sitting (budget: 400 lines).

## 2. What v1 taught us (why a rebuild)

| Cause of v1 bugs | v2 rule |
|---|---|
| Several ways to say one thing (`=x`, `{x}`, bare `if`; door as tile / prefab / rule; legend vs entities vs tile-entities) | **One way.** One rule shape, one expression syntax, one way to place things (map objects). |
| Silent failures (unknown name → 0, missing hero, tile used as prefab, shadowed `self.speed`) | **Two severities, always with "did you mean".** *Errors* = things that break the game: unknown names, references, variables, actions; wrong types; missing required values; broken maps/sprites. *Warnings* = things the game simply ignores: an extra or misspelt optional field, an unknown top-level key. Warnings never block a cart from running; `strict: true` turns them into errors. |
| Hidden magic (auto-doors, contact tracking, dialogue pausing physics) | **Explicit.** Doors are rules; arrival is a named marker; dialogue is a scene-stack mode. |
| Genres baked into one 2,469-line file | **Kernel + extensions.** Genre = extension. |
| A 25,000-character AI spec | **Generated per cart from the registry:** 5,308 chars for the ported slice. |
| Ad-hoc test scripts with fake canvases | **Deterministic headless kernel** with a real test runner. |

## 3. Architecture

```
kernel.js        worlds, scene stack, entities, rules, expressions, registry, validation, save/restore, docs generation
ext/*.js         extensions: components, triggers, actions, systems, modes (all declare typed schemas)
platform.js      the only file that touches the browser: canvas, input, audio, haptics, fixed-timestep loop
studio (later)   editors + inspectors, generated from the registry
```

Measured: kernel **971 lines** (incl. validator, hot reload, docs generator), extensions 398 lines total
(space2d + topdown + sprite = 174, platformer = 69, combat + ai = 86, dialogue = 69), platform 148 lines.
Registered vocabulary: **11 components, 13 triggers, 22 actions, 11 systems, 1 mode** (v1: 27 component keys, 38 action keys).
Adding a whole second genre (the platformer) added 3 components, 0 triggers, 0 actions and 69 lines. Most v1 components
are just rules now (see §4).

Kernel guarantees:
- **Deterministic:** fixed 1/60 step, seeded RNG, no wall-clock. Same inputs + seed → identical world (tested over 600 frames).
- **Serializable:** *all* world state is plain JSON (`world.save()` / `DC2.restore()`), so save states, rollback, replay,
  netplay snapshots and tests are the same mechanism. Restoring mid-run and continuing matches an uninterrupted run (tested).
- **Headless:** no DOM/canvas/audio in the kernel. Effects (`sound`, `shake`, `haptic`) are data in `world.fx`.
- **Errors are data:** runtime errors are recorded once in `world.errors`, never thrown into the frame loop.

## 4. Cart format (DCART-2)

```
format, meta{title,width,height,start,player,extensions[]}, vars{}, palettes{}, sprites{}, tilesets{},
maps{}, prefabs{}, scenes{}, sounds{}, music{}, rules[], db{} (planned)
```

**One rule shape everywhere** (world, scene, prefab):
```json
{ "on": "touch", "with": "player", "if": "coins >= 8", "then": [ {"act":"add","path":"coins","by":-8} ], "else": [ ... ] }
```
- Fields are **typed** (`number`, `expr`, `text`, `path`, `ref:<kind>`, `list`, `enum`…). The engine knows which strings are
  formulas, so there is no `=` prefix, and the validator checks every expression (unknown variable, unknown
  `self.health.hpp`, unknown function) and every reference (prefab/scene/sprite/map object names).
- Every variable must be declared in `vars` (or a prefab's `v`). `self` exists only in prefab rules.
- `"doc"` is allowed on any object, because JSON has no comments.

**Behaviour lives in rules, not components.** Compare the ported game:
- pickup = a sensor body + `touch` rule (`add coins`, `destroy`) — no `pickup` component
- door = a sensor body + `touch` rule (`goto`) — no `warp` component
- contact damage, loot drops, knock-back, respawn (`keepAlive`), an enemy "state machine" (`set self.ai.mode`) — all rules
So v2 has no `hurt`, `pickup`, `warp`, `stompable`, `talk`, `states` or `use/extends` components. Reuse (behaviours/prefab
inheritance) will be sugar over rules in an extension, *after* we've seen where repetition actually hurts (§10).

**Scene stack.** `goto` replaces the current scene (the player entity is carried over and placed at a named map
marker); `push`/`pop` layer scenes (a battle, a menu); *modes* (dialogue) sit on the same stack and freeze everything
below. `persist: true` scenes are parked and restored intact (a farm keeps its crops). Battles will be exactly this.

**One player, different bodies.** A map object whose prefab is tagged `player` is that scene's spawn point. When the
player moves between scenes the carried entity is *rebuilt* as the destination's player prefab (the top-down hero becomes the
side-view hero in the cave), keeping only the components that prefab lists in `"carry"` (e.g. `["health"]`) and same-named vars.

**Spatial conventions.** `pos` is the centre of the body, in pixels. Art is native 16×16 (the v1 8×8-at-2× art is
pixel-doubled by the converter). Tiles are numbered from 1 (0 = empty). Bodies can be `solid`, `sensor`, and `oneway` (a platform you can jump up through). Contact triggers fire on *begin*; arriving in a
scene while already overlapping something does not count as a new touch (no door bounce — tested).

## 5. Extension API

```js
DC2.defineExtension({ name: 'health-bars', requires: ['space2d'], doc: '...', install(r) {
  r.component('shield', { needs: ['pos'], doc: '...', fields: { hp: {type:'number', default: 3}, regen: {type:'number', default: 1} } });
  r.trigger('shield-break', { doc: '...', owners: ['entity'] });
  r.action('addShield', { params: { amount: {type:'expr', default: 1} }, run(w, ctx, p) { ... } });
  r.system('shield', { order: 55, update(w, scene) { ... } });
  r.mode('menu', { update(w, entry, input) {...}, view(w, entry) {...} });
  r.hook('sceneEnter', (w, scene) => {...});
}});
```
Because every piece declares its schema, **one registry generates**: the validator, the reference (`REFERENCE.generated.md`),
the per-cart AI prompt (`AI-SPEC.generated.txt`), and — in the studio — every form, picker and rule-card editor.
A cart lists the extensions it needs (`meta.extensions`); the validator errors if it uses one it doesn't list, and the
loader can show "this cart uses: combat, dialogue" before running it.

## 6. Safety model

- **Carts are data only.** No code strings, no `eval`. Expressions are parsed to an AST and evaluated against a whitelist.
- **Capability lives in extensions, which are code in your repo.** A shared cart can only *name* extensions; it can't ship any.
  Third-party extensions (later) require explicit trust (signed / from your own origin), never arrive inside a cart.
- **Budgets:** action nesting depth is capped (24); expression evaluation is sandboxed; the validator rejects unknown names.
- Known debt: expressions call `Math.random` for `rand()/chance()`; the kernel swaps in its seeded RNG around each
  evaluation. `expr.js` should grow a proper RNG hook (small change, benefits v1 too).

## 7. Assets and storage (how we store and manage things)

v1 problem: one localStorage blob holds the cart, the library and the save data; whole-cart rewrites; ~5 MB cap; no history.

Three different things, kept apart:
1. **Project** — a folder of small files (git-friendly, per-asset edits):
   ```
   project.json                 meta, vars, extensions, start scene
   palettes/main.json           sprites/hero.json        tilesets/world.json
   maps/overworld.json          prefabs/slime.json       scenes/overworld.json
   sounds/*.json  music/*.json  db/items.json (planned)
   ```
2. **Cartridge** (`.dcart`) — one file: the whole project bundled with a content hash and its required extensions.
   Used to play, share, and P2P. Link sharing keeps v1's deflate+base64url.
3. **Save data** — the player's progress, keyed by cartridge hash + `saveVersion`, in its own store, never mixed into the project.

On device: **IndexedDB** (`projects`, `files` (path → content, rev), `snapshots` (autosave ring), `saves`), with
localStorage only for tiny prefs. Editing one sprite writes one record; every committed edit autosaves (debounced); snapshots
give restore points; export/import as `.dcart`, or as a folder (File System Access API where available, else a zip).
Stable asset ids + `ref:` schemas mean **rename-with-references-updated is generic** (the registry knows every reference field).
The map format is numeric tile layers + an object layer (Tiled-like), replacing v1's character maps, legend and tile-entities.
Tile rows are two base-36 characters per tile (git-diffable, length-checkable); an ASCII "sketch" import lets an AI or a
human bake a legend-based map into layers.

## 8. Editors (what must be upgraded)

**Foundation (do first):** a `Document` (asset + command history) with one undo/redo system; every editor is a view over a
Document; edits hot-reload into the running game (kernel keeps world state separate from the cart, so this is feasible:
replace `world.cart`, clear the rule cache — not built yet). **Inspectors and pickers are generated from schemas**, so a new
extension automatically gets forms, asset pickers with thumbnails, expression boxes with live validation/autocomplete, and
action "cards". The rule editor becomes a Castle/GDevelop-style card builder over the same JSON (JSON view stays).

**Sprite editor:** frame strip + timeline with named animation tags and fps; onion skin; pencil/line/rect/fill/erase/eyedrop
(long-press), select-move-flip-rotate, mirror symmetry; palette panel that recolours globally and supports several palettes;
two-finger pan/zoom, one-finger draw; PNG/strip import with slice grid and quantise-to-palette, sheet export; hitbox and pivot
overlay; live in-game preview. (v1 can't edit stacked sprites at all; v2 stacks become a sprite kind with a layer view.)

**Map editor:** layer panel (add/rename/reorder/hide/collide/opacity); tileset picker with a tile-flags editor (solid, name,
later damage/tags); brush with multi-tile stamps, rect, fill, line, eyedrop, select/copy/paste; **object layer** — place
prefabs, drag, snap, name markers, per-object component overrides from schema forms; overlays for bodies/collision; minimap;
a **scene-link graph** (from `goto` refs) that flags missing markers and unreachable scenes; "playtest from here"; later
autotiles and animated tiles.

**Data-table editor** (spreadsheet-like) for `db` tables — items, skills, enemies. Needed for Harvest Moon and Hybrid Heaven.

## 9. How the dream games map onto this

- **Harvest Moon:** `time` extension (clock, calendar, day rollover event), `growth` (timers on map objects / tile edits),
  `inventory` + `db.items`, shop = dialogue with choices, `persist` scenes, save slots.
- **Metroid:** `platformer` (gravity, jump, one-way, slopes), ability flags as vars checked in rules, room camera, doors as rules.
- **Metal Gear:** `vision` (facing + cone + range + raycast against `DC2.tileSolid`), an alert meter as vars, `noise` events;
  guards are `ai` + rules reacting to `seen`/`alert`.
- **Hybrid Heaven:** `battle` mode pushed on the stack (party/enemy state in `db`, menu = a mode, skills = actions),
  popping returns to the exploration scene untouched.

## 10. What the spike proves — and what it doesn't

Proven (tests): validation with useful errors and the two-severity policy (21 negative cases, 3 of them warn-only and
checked to still boot and to escalate under `strict`), tile+body collision, pickups/doors/damage/loot as rules, dialogue as a
stack mode, scene goto/push/pop/persist, timers/events/tile edits, determinism and save/restore equivalence (overworld **and**
cave), runtime error capture, generated docs, hot reload, and the **platformer genre**: gravity and landing, jump height
(≈ jump²/2g) with variable height and coyote time, one-way tiles (land from above, pass through from below), stomping,
`?` blocks that pay once, bricks, spikes, a moving platform that carries its rider, patrolling walkers, and a bat built from
`ai` + `mover`. Everything past gravity/jump/carry is ordinary rules — the same kernel runs both genres.

What building it taught (kept honest):
- The stomp rule is *positional* (`other.pos.y < self.pos.y - 2 and other.vel.y > 0`); it works, but it is a pattern authors
  will need in a library of recipes rather than rediscover.
- Velocity has to be zeroed on impact for gravity to work (added to `space2d`); an AI system that owned vertical speed
  broke walkers until it learned to leave it to gravity. Systems share `vel`, so **system order is part of the contract.**
- The v1 walker starts directly above the pit. v1 hid that; v2's stricter physics exposed it. (An idle one falls in; a
  patrolling one steps onto the ledge.)
- Not ported from v1: brick burst particles (no effects extension yet), the parallax backdrop, walkers turning at ledges.

**Not proven yet:** Mode 7 and sprite stacking (renderer extensions); reuse sugar (behaviours) — `hero`/`hero_side` share
their rules, so repetition is visible, but not yet painful enough to design the sugar; netplay; audio/UI/inventory/time
extensions; **all editors and the storage layer**; performance (contacts are O(n²), lookups linear — fine for a few hundred
entities, needs a grid before large maps); tile animation; multi-slot saves; a converter for whole v1 carts (art, maps and
the two scenes here are converted by a tool; behaviour is rewritten by hand).

## 10b. Studio (built) — what exists and what it taught

`v2/studio.html` is a phone-first editor: **projects** (IndexedDB, autosave, restore points, `.dcart` import/export with
checksum), and an editor with four tabs — **Map** (draw/box/fill/erase/pick, layers, solid overlay, place/select/drag things,
markers, pinch-zoom, "play here"), **Things** (recipes, parts, rule cards, values, tags, rename-with-references), **Game**
(title, size, start, player, levels, game values, restore points), **Play** (always a fresh run of the current project).
Everything edits one `Doc` with one undo history (also reachable inside open sheets); forms are generated from the extension
schemas, so a new extension gets its editor for free. Fields marked `runtime: true` are hidden from forms.

Layout: `studio/core.js` (headless: Doc, storage, autosave, map ops, recipes, refs/rename, descriptors), `forms.js`,
`mapview.js`, `ui.js`, `studio.css`; shared `render.js` (SpriteCache) and `runner.js` (Runner) also drive `index.html`.

Tests: `test/run.js` 145, `test/studio.js` 150 (headless, incl. build-a-level-and-play), plus Playwright UI suites
(41 interaction checks; the exit test). **Exit test passed:** a new cave level (terrain, 3 coins, walker, ? block, spikes, goal),
a door from level 1, and a playtest — 50 gestures, zero problems/warnings, player and health carried through the door.

**Sprite editor (built):** Art tab lists pictures; the full-screen editor has pencil/line/box/fill/erase/pick/pan, mirror,
onion skin, grid, pinch-zoom, finger drawing, shared-palette colour editing, frame strip (add/copy/move/delete with animations
renumbered automatically), an animation panel with live preview, transforms (flip/rotate/slide/resize), PNG import (nearest
palette colour, strips sliced into frames) and PNG-strip export. Headless ops live in `S.sprite` (23 tests) and a 28-check
Playwright suite covers the UI. Not yet: stacked sprites, per-sprite palettes, selection/copy-paste.

What building it taught: overlays must not sit over editable area (gutter for zoom buttons); tiles must stay finger-sized
(~20 px) so wide maps start zoomed and pan; modal sheets must carry their own undo; Play must never resume stale sessions;
engine-internal fields must be hidden from forms. Known gaps: dialogue choices edit through generic
forms; no hot-reload into a running Play tab; no data-table editor; no per-object component overrides UI.

## 10c. Harvest Moon slice (built) — time, farm, economy

Three small extensions, kernel-only so far (no Studio recipes/art yet): `ext/farm.js`.
- **`time`**: one `clock` component (hour, day, length = real seconds/day, paused) on any entity — a marker in the
  first scene is enough. Fires first-class `hour` and `newday` triggers (owners: world/scene) via a new public
  `World#broadcast(scene, name, extra)`, which replaces the old kernel-private `_fireScope` (same mechanism, now
  reusable by any extension — `start` uses it too).
- **`farm`** (requires `time`, `sprite`): one `growable` component (stage, stages, watered). A system advances
  `stage` by exactly one on each day boundary if `watered` was set that day, then resets `watered` — no death/wilting.
  Planting and harvesting are **not** special actions: plant with the existing `spawn` action (`ahead` of the player,
  same trick the sword swing uses), harvest with an ordinary `interact` rule that checks
  `self.growable.stage >= self.growable.stages - 1` and calls `give` + `destroy`.
- **`economy`**: one `inventory` component (`items`: id→count, `cap`). Actions `give`/`take` (direct map mutation,
  since the generic `set`/`add` actions can't create a new key), and `buy`/`sell` (spend/pay a `path`-typed currency
  variable, default `"gold"`). `buy`/`sell` target **`"other"` by default**, not `"self"` — they're meant for a
  shopkeeper's own `interact` rule, where the customer is `other`; the acting entity's own `give`/`take` still
  default to `"self"`.

Tests: `test/farm.js`, 27 checks (clock timing, day/hour broadcast reaching scene rules, watering/growth/cap,
full plant→water×3→harvest→sell cycle through real rules and button presses, validation of farm-specific mistakes).
Kernel suites re-run clean after the change (145 + 173 UI-suite + 41 interaction checks).

What building it taught: every real bug was a **default-target mix-up**, not a physics/timing bug — `give`/`buy`/`sell`
fired from an NPC's own `interact` rule have `ctx.self` be the NPC, not the player, so hardcoding `self` silently
no-ops (inventory absent) instead of failing loudly. Fixed by giving `buy`/`sell` their own `target` param defaulting
to `"other"`. Also: the existing `set`/`add` actions refuse to create a new key (by design, to catch typos), which is
exactly why `give`/`take` need to mutate the items map directly rather than going through `setPath`.

**Studio recipes (built):** "Day/night clock", "Crop" and "Shopkeeper" now appear in the New Thing picker under a
"Farming" group, same as any other recipe — `ext/farm.js` is loaded in `studio.html` and `tools/make-starters.js`.
Crop shows its growth stage via an `update` rule setting `sprite.anim` to `seed`/`sprout`/`grown`/`ripe`; without
matching art the sprite just falls back to whatever picture is already in the project (functions correctly, looks
wrong) — confirmed working end to end in a real browser (add all three, place them, Play, zero errors).

Not yet: **farm-specific art** (a crop needs 4 real sprite frames, the shopkeeper needs its own look), a farm starter
project, sleeping to skip to next day, seasons, energy/stamina, NPC relationships — out of scope for this slice.

## 10d. Stealth slice (built) — vision cones, gradual detection

`ext/stealth.js`, one extension, `requires: ['space2d']`.

- **`vision`** component: `range`, `fov` (cone width in degrees), `target` (tag, default `player`), `alertTime`
  (seconds seen before going alert), `loseTime` (seconds unseen before giving up), optional fixed `dir` for a
  stationary guard, plus runtime `state` (`unaware`/`alert`), `sees` (this-frame bool), `t` (internal timer).
- **`spotted`** / **`lost`** triggers (owners: entity) — fire once each, on the state transition, not every frame.
- Detection = in range, inside the facing cone (`atan2` angle diff against `r.face` or a fixed `dir`), **and** a
  clear line of sight: a cheap half-tile-step raycast against `DC2.tileSolid` (already public, used by movement
  collision — reused as-is, no new kernel surface needed beyond that).
- Deliberately **not** instant: `alertTime`/`loseTime` mean a one-frame flicker across the cone's edge doesn't
  trigger anything, and briefly ducking behind cover doesn't immediately reset an alert guard — both matter for an
  MGS-feel and were the main things worth testing (test/stealth.js, 17 checks: cone geometry incl. facing/FOV
  edges, wall-blocking, gradual alert build-up and decay with exact frame counts, a full "hide behind the wall,
  never spotted" playthrough, validation).
- **Studio recipe**: "Guard (vision cone)" under a new "Stealth" group — patrols, chases on `spotted`, resumes
  patrol on `lost`; confirmed in a real browser (placed via the Map tab, actually spots and chases the player during
  Play, zero errors).

What building it taught: everything reusable was already public (`DC2.tileSolid`, `w.nearest`, `r.face`, `w.fireOn`)
— this extension added no kernel surface at all, unlike `time`/`farm` which needed the new `broadcast()` method.
That's a good sign for the kernel's shape going into stealth/battle, the project's actual target genre.

## 10e. Round of user-reported fixes (built)

- **Double-tap zoom**: `* { touch-action: manipulation }` in the Studio and player (canvases and pads opt out with
  `none`), plus `nozoom.js` for what iOS Safari still lets through (quick second tap on non-controls, gesture
  events). Buttons and form fields are exempt so fast repeated taps still register.
- **Farm and Stealth starters** (`tools/make-starters.js`): new 8×8→16px art (crop ×4 stages, shopkeeper, guard,
  soil and floor tiles). `test/starters.js` (31) plays them: plant/water/grow/harvest/sell; safe routes past the
  stationary guards, getting caught, winning.
- **Vision cones on screen**: new generic `DC2.drawHooks` in `runner.js` (drawn after tiles, before sprites; a
  throwing hook is ignored). `stealth` uses it to draw wall-clipped cones coloured by suspicion; `vision.show`.
- **Code tab** (`studio/code.js`): reuses v1's `DC.CodeEditor` and `DC.scrubJSON`. Section picker, Apply = one
  undo step, leaving the tab applies (or blocks if unreadable, with line/column), problems listed per section.
- **Opening v1 carts** (`studio/v1import.js`, `S.v1.isV1/convert`): exact art/palette/sound/music/maps; behaviour
  mapped where v2 has the concept; a report of everything else. Safety net: actions/rules/HUD lines v2 still
  rejects after conversion are removed and reported, so imports always open clean. `test/v1import.js` (75) covers
  all 5 built-in v1 carts plus 3 real ChatGPT-made carts (`test/fixtures/`), including playing the demo.
- **Kernel** (two small changes, all suites re-run): `set`/`add` can write through `player.…` paths (reading already
  worked); the "scene has no player" runtime error only fires when the player walks in from a level that had one
  (title screens and cutscenes with maps are fine).

## 11. Roadmap and exit criteria

1. ~~**Foundation:** hot reload; `platformer` extension; port the cave.~~ **Done.** Cave playable, kernel 971 lines (< 1,200).
2. ~~**Storage + Document/undo layer**~~ **Done** (edit → refresh → nothing lost, tested).
3. ~~Schema-driven inspector + map editor~~ **Done** (exit test passed). Sprite editor **done**. **Next: Harvest Moon slice** (time/growth/inventory/shop).
4. ~~Harvest Moon slice~~ **Done** — extensions (27 tests) + Studio recipes, confirmed in-browser. **Next: farm art + a starter project**, then success test 1.
5. **Stealth + battle** → Shadow Protocol port → the dream game. *Exit: success test 3.*
6. Behaviours/reuse sugar, Mode 7 + stacking as renderer extensions, netplay on snapshots, visual rule builder polish.
7. Retire v1 once v2 has everything the demos use; keep a v1→v2 converter.

## 12. Next decision
Stealth detection works end to end (cone, walls, gradual alert, a chasing guard) — the project now has the first
real pillar of the dream game (MGS-style stealth). The other pillar, Hybrid-Heaven-style turn-based battle, doesn't
exist yet in v2. Options: (a) **turn-based battle extension** — a pushed "battle" scene (the scene stack already
supports this), turn order, an attack/defend action set, win/lose triggers, probably triggered by a guard's
"spotted" instead of the current plain chase; (b) farm/stealth art + starter projects (polish, not blocking); (c)
Mode 7 + sprite stacking as renderer extensions (retires the last v1-only features). Recommendation: (a) — it's the
second and last major kernel pillar the dream game needs; both art passes and Mode 7/stacking are meaningful but
don't block reaching a playable slice of the actual target game.
