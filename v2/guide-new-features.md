# What's new in the Studio

New since the last builds: an **Art tab** for drawing your own sprites, a **farming** kit, **stealth guards** with
vision cones, **Farm and Stealth starter games**, a **Code tab** for editing the JSON directly, and **opening v1
games**. Open `v2/studio.html` on your phone (or desktop) to follow along.

## Starting a farm or stealth game

Tap **＋ New game** and pick **Farm** or **Stealth**. Both are complete, playable little games you can pull apart:

- **Farm** — X plants a seed in front of you, A waters a crop (or harvests it once it's a carrot), and the
  shopkeeper buys carrots and sells seeds. A day passes every real minute; the top-left shows the day, hour, gold,
  seeds and carrots.
- **Stealth** — reach the flag without being caught. Each of the four guards teaches one thing: time the patrol,
  hug the right-hand wall past the watcher, and go round the sentry by the flag. Guards' vision cones are drawn on
  screen — yellow while they haven't noticed you, turning orange as they do, red once they've spotted you. Walls cut
  the cones off, so cover really is cover.

## Editing the code directly (Code tab)

The **Code** tab shows your game as JSON — the same data the other tabs edit. Use the menu at the top to show the
whole game or just one part (Things, Levels, Rules, Sprites…), which is much easier to find your way around.

- **Apply** puts your changes into the game; it's one undo step, so the ↶ button at the top takes it back. Leaving
  the tab applies too.
- It's forgiving: curly quotes, trailing commas, missing commas and the code-block markers an AI reply wraps around JSON are fixed for you,
  and it tells you what it fixed.
- If something really can't be read, it says which line and column, highlights the line, and won't let you leave
  the tab and lose your edit.
- Problems in the part you're looking at are listed underneath — tap one to jump to it.
- On a phone, the key bar gives you { } [ ] " : , and cursor keys; ✨ tidies the formatting, 🔍 finds and replaces,
  A− / A+ change the text size.

## Opening your v1 games

On the project list, tap **Open a game file** and pick a v1 `.json` cart (a `.dcart` or a v2 `.json` works too).
The game is converted into a new project and opens ready to play. Your original file isn't touched, and it still
plays in the v1 console.

What comes across: all the art (at the same size), palette, sounds and music, every level and where everything is
placed, player movement (top-down and platformer), enemies, health, pickups, doors, talking with choices, attacks,
and most rules. A report then lists anything that didn't come across exactly — for example Mode 7, state machines,
on-screen banners, or a door that now drops you at the level's start instead of the matching doorway — grouped by
the thing or scene it affects, so you know where to look.


## Drawing your own art (Art tab)

Tap **Art** at the bottom, then **New sprite** (or **Import PNG** if you already have pixel art — a strip of frames
side by side gets sliced automatically, and colors snap to your palette).

Inside the editor:

- **Tools**: Pencil, Line, Box, Fill, Erase, Pick (grabs a color off the canvas), Pan.
- **Mirror** (the ⇋ button) draws both halves of a symmetrical sprite at once.
- **Onion skin** (🧅) shows the previous frame faintly, so animation frames line up.
- Pinch to zoom, or use the **+ / − / ⤢** buttons.

**Frames**: the strip at the bottom. **＋** adds a blank frame, **⧉** copies the current one (handy for small
tweaks between frames), the arrows reorder, 🗑 deletes. Reordering frames automatically fixes up any animation that
referenced them by number — you don't have to touch the animation afterward.

**Animations**: tap **Animations**, then **New animation**, name it (e.g. `walk`), and tap frames in the order you
want them played. Set a speed (frames per second) and whether it repeats. A thing's Sprite part can then use that
animation by name.

**Colors** are shared across every sprite in the project — editing one from the Art tab changes it everywhere that
color is used, and you're told that before you do it.

When you're done, go to **Things** and pick your new sprite from any Picture field.

## Farming: day/night, crops, and a shop

Three new recipes live under **Things → New thing → Farming**:

- **Day/night clock** — add exactly one per game, anywhere. It's invisible; it just keeps time. Other rules can
  react to a new day or a new hour.
- **Crop** — starts as a seed. Interact with it (press A nearby) to water it; it grows one stage per day it was
  watered. Interact with it again once fully grown to harvest it.
- **Shopkeeper** — interact with them to buy a seed for gold. A `gold` variable is added automatically.

**To plant crops**, you need a way to place a Crop entity in the world at runtime — the usual trick is a button
press on the player that spawns a Crop "ahead" of them (look at the **Sword swing** recipe's rule for the exact
shape: an action that spawns a prefab a few pixels in front of wherever the player is facing). Add a rule like that
to your player, pointing at your Crop prefab, and pressing the button plants one.

**A day passes in real time** — by default, about two minutes per in-game day. Open the clock's **Parts** panel to
make days shorter (or longer) while testing.

One honest limitation right now: crops and the shopkeeper don't have their own art yet, so they'll borrow whatever
picture is already in your project until you draw proper ones with the Art tab above.

## Stealth: guards with a vision cone

One new recipe: **Things → New thing → Stealth → Guard (vision cone)**. A guard patrols back and forth and watches
a cone in front of itself. Key things to know:

- **It doesn't react the instant it sees you.** It has to watch you continuously for a short time (`alertTime`,
  default 0.4 seconds) before it actually notices — a quick dash across its sightline usually won't trigger it. This
  mirrors how MGS-style guards work, and keeps a single stray frame from causing a false alarm.
- **Once alert, it stays alert for a bit after losing sight of you** (`loseTime`, default 1.5 seconds), instead of
  forgetting you the instant you duck behind cover.
- **Walls block its vision.** Standing behind a solid wall — even well within its range — keeps you hidden.
- Out of the box, being spotted switches it from patrolling to chasing you, and losing it switches it back. Open the
  guard's **Rules** panel to change what "spotted" actually does for your game — sound an alarm, start a battle,
  flee, whatever fits.

Tune a guard by opening its **Parts** panel and adjusting `vision`: `range` (how far it can see), `fov` (how wide
the cone is, in degrees), `alertTime`, `loseTime`. A stationary guard (one with no patrol movement) can be given a
fixed `dir` (up/down/left/right) so it always faces the same way.

## Double-tap zoom

Tapping quickly no longer zooms the page — anywhere in the Studio or the player. Pinch-zoom inside the map and
sprite editors still works as before.

## What's still missing

- No alarm or battle system yet — "spotted" makes a guard chase you (and in the Stealth starter, being touched
  sends you back to the start). A turn-based battle is the next big piece.
- Some v1 features have no v2 version yet (Mode 7, sprite stacking, state machines, banners, particles, saving), so
  v1 games that use them come across without those parts — the import report lists exactly which.
