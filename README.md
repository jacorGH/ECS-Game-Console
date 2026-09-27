# Data Console

A mobile-first fantasy console where games are JSON, not code. Draw sprites and paint maps on your phone, ask any AI to write a whole game, and play together peer-to-peer.

## Deploy to GitHub Pages

1. Create a repo and upload everything in this folder (keep `.nojekyll`).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<you>.github.io/<repo>/`. On a phone, use **Add to Home Screen** for full screen.

It also runs by opening `index.html` locally, except image files in `assets/` (browsers block those on `file://`) — use a local server such as `npx serve` for that.

## What's in the box

| Tab | What it does |
|---|---|
| Play | The handheld: 8-way d-pad, A B X Y, Start/Select. Keyboard (arrows/WASD, Z X C V, Enter) and gamepads work too. |
| Code | The cart JSON. **Clean up** repairs AI damage, **Check** lists problems, Import/Export files. |
| Sprites | Pixel editor: frames, pencil/eraser/fill/pick, undo, animation preview, PNG import matched to the palette. |
| Maps | Paint tiles and entity spawns, resize, add scenes and brushes. |
| AI | Builds a full prompt (format spec + working example + your idea), then cleans and loads the reply. Writes a fix-it prompt if the AI made mistakes. |
| Link | Host a room or join one with a 5-letter code. Up to 4 players. |
| Carts | Save carts on the device, share a cart as a link, load the demo. |

## Engine features

Entities are built from components: `sprite` (animation states, directional anims), `body` (gravity, bounce, tile collision), `control` (platformer / top-down / shmup, coyote time, jump buffering, variable jumps, double jump), `ai` (patrol, chase, flee, wander, fly, hop, turret), `health`, `hurt` with knockback, `stompable`, `pickup`, `attack` (melee swings or projectiles, auto-aiming for enemies), `talk` (dialogue with typewriter text), `warp`, `move` (path movers), `solid` (moving/one-way platforms you can ride), `spawner`, `emitter` (particles), `text`, `lifetime`.

Tiles can be solid, one-way, hurt, kill, animated, or bump-able from below (`?` blocks, breakable bricks). Scenes have gravity or top-down physics, scrolling cameras, auto-scroll, parallax layers and y-sorting. The HUD does text, heart icons, bars and sprites. Game logic is event rules (`start`, `every`, `button`, `collide`, `var`, `count`, `destroyed`, `tile`, `when`) that run actions (vars, spawn, destroy, damage, scene changes, dialogue, banners, sound, music, shake, flash, particles, tile edits, `if`, `wait`). Audio is a built-in synth plus a multi-track step sequencer, or your own files.

The full format reference is in `js/ai.js` (`DC.SPEC`) — it's the same text the AI receives.

## Multiplayer

The host's phone runs the game and streams snapshots (~30/s) to guests; guests send button presses back. Extra players are clones of the player-1 prefab (or `meta.coop`), tagged `player` and `p2`–`p4`, with their own health var (`hp2`…). PeerJS's free public broker is used only to introduce the phones; gameplay traffic goes directly between devices. Some strict networks (certain school, office or mobile carriers) block direct connections — if a join hangs, try Wi-Fi.

## Files

```
index.html
css/console.css
js/core.js     palette, JSON scrubber, validator, share links, sprite builder
js/audio.js    synth SFX and music sequencer
js/input.js    keyboard, touch, gamepad
js/engine.js   ECS world, systems, rules, renderer, net snapshots
js/net.js      PeerJS rooms
js/demo.js     demo cart and blank cart
js/ai.js       format spec and prompt builder
js/editor.js   all the editor tabs
assets/        your image and sound files
```
