# Reference

_Generated from the extension registry. Do not edit by hand._

## core

Variables, control flow, timers, events, spawning, scenes and effects.

### Triggers (`"on"`)

**start** — The scene has just started.


**spawn** — The entity has just appeared.


**update** — Every frame.


**every** — Repeatedly, every t seconds.

- `t`: number (required)

**after** — Once, t seconds after the scene or entity starts.

- `t`: number (required)

**when** — Fires when the "if" condition turns from false to true.


**button** — A button was just pressed.

- `button`: up|down|left|right|a|b|x|y|start|select (required)
- `player`: int = 0
- `cooldown`: number = 0 — seconds before it can fire again

**event** — Another rule emitted this event.

- `name`: string (required)

### Actions (`"act"`)

**set** — Set a variable.

- `path`: path (required)
- `to`: expr (required)

**add** — Add to a number variable (negative to subtract).

- `path`: path (required)
- `by`: expr = 1

**if** — Run "then" when the test is true, otherwise "else".

- `test`: expr (required)
- `then`: actions (required)
- `else`: actions (optional)

**wait** — Run "then" after t seconds.

- `t`: number (required)
- `then`: actions (required)

**emit** — Send an event to every "event" rule with this name.

- `name`: string (required)

**spawn** — Create an entity from a prefab.

- `prefab`: prefab name (required)
- `at`: self|other|world = "self"
- `x`: expr (optional)
- `y`: expr (optional)
- `dx`: expr = 0
- `dy`: expr = 0
- `ahead`: expr = 0 — pixels in front of "at", in the direction it faces
- `vx`: expr (optional)
- `vy`: expr (optional)
- `attach`: bool = false — stays stuck to "at" as it moves and turns (a sword swing, a shield, a held torch)

**destroy** — Remove entities.

- `target`: string = "self" — "self", "other", or a tag name

**tag** — Add or remove a tag.

- `target`: string = "self" — "self", "other", or a tag name
- `add`: string (optional)
- `remove`: string (optional)

**goto** — Switch to another scene. The player is carried over and placed at the named map object "at".

- `scene`: scene name (required)
- `at`: string (optional)

**push** — Open another scene on top of this one (a battle, a menu). "pop" returns.

- `scene`: scene name (required)
- `at`: string (optional)

**pop** — Close the top scene and return to the one below.


**settile** — Change one tile of the current map.

- `layer`: string (required)
- `tx`: expr (required)
- `ty`: expr (required)
- `tile`: expr (required) — tile number, 0 = empty

**sound** — Play a sound.

- `id`: sound name (required)

**shake** — Shake the screen.

- `t`: number = 0.3

**haptic** — Vibrate the device.

- `kind`: light|medium|heavy|double|success|warning|error = "light"

**log** — Write to the developer log.

- `text`: text (required)

## space2d

Positions, bodies, movement, collision against tiles and solid bodies, and contact/interact triggers.

### Components

**pos** — Where the entity is: the centre of its body, in pixels.

- `x`: number = 0
- `y`: number = 0

**vel** — Velocity in pixels per second. Something (topdown, ai, a rule) sets it; movement applies it. (needs pos)

- `x`: number = 0
- `y`: number = 0

**body** — A box for collision and contact triggers. (needs pos)

- `w`: number = 12
- `h`: number = 12
- `ox`: number = 0
- `oy`: number = 0
- `blocked`: bool = true — stopped by solid tiles and solid bodies
- `solid`: bool = false — stops other bodies (an NPC, a crate)
- `oneway`: bool = false — with solid: only stops things landing on it from above (a platform)
- `sensor`: bool = false — only detects contacts (a pickup, a hitbox)

**follow** — Sticks to another entity (a ripple under a swimmer, a hat, a shadow). (needs pos)

- `target`: string = "player" — tag of the entity to follow (the nearest one)
- `ox`: number = 0
- `oy`: number = 0

### Triggers (`"on"`)

**touch** — Two bodies start overlapping — or this one starts overlapping a tile that has the tag in "with". self = this entity, other = the one it touched (for a tile, other is at the middle of that tile).

- `with`: string (optional) — only when the other thing, or a tile, has this tag

**untouch** — Two bodies stop overlapping.

- `with`: string (optional) — only when the other thing, or a tile, has this tag

**interact** — A player presses a button while standing near this entity.

- `button`: up|down|left|right|a|b|x|y|start|select = "a"
- `range`: number = 24

**entertile** — This entity steps onto a tile with this tag (checked at its centre).

- `tag`: string (required) — a tag you gave tiles in their settings, like "water"

**leavetile** — This entity steps off the last tile with this tag.

- `tag`: string (required) — a tag you gave tiles in their settings, like "water"

### Actions (`"act"`)

**move** — Set an entity's position.

- `target`: string = "self"
- `x`: expr (required)
- `y`: expr (required)

## topdown

Four/eight-direction player movement from the d-pad.

### Components

**topdown** — Moves this entity from a player's d-pad and remembers which way it faces (self.facing). (needs pos, vel)

- `speed`: number = 70
- `player`: int = 0

## platformer

Gravity, side-view player control, and moving platforms.

### Components

**gravity** — Pulls this entity down. Rules can read self.grounded. (needs pos, vel)

- `g`: number = 700 — pixels/second squared
- `maxFall`: number = 420

**platformer** — Left/right + jump control from a player's d-pad and A button. (needs pos, vel, body, gravity)

- `speed`: number = 90
- `accel`: number = 900 — how quickly it reaches speed (and stops)
- `jump`: number = 300 — take-off speed; height ≈ jump² / (2·g)
- `coyote`: number = 0.08 — seconds after leaving a ledge you can still jump
- `buffer`: number = 0.1 — seconds a too-early jump press is remembered
- `player`: int = 0

**mover** — Moves back and forth between where it started and start + (dx, dy). If it has a solid body, riders standing on it are carried. (needs pos)

- `dx`: number = 0
- `dy`: number = 0
- `speed`: number = 30 — pixels/second along the path

## sprite

Drawing state: which sprite, which animation. The platform draws it; the kernel only keeps time.

### Components

**sprite** — A sprite (see "sprites" in the cart). Centre is pos + (ox, oy).

- `id`: sprite name (required)
- `anim`: string = "idle"
- `t`: number = 0
- `flip`: bool = false
- `layer`: int = 0 — higher draws in front
- `ox`: number = 0
- `oy`: number = 0
- `turn`: bool = false — turn with facing: drawn rotated toward where it faces (draw the art pointing right)
- `sink`: int = 0 — hide this many pixels at the bottom (wading, swimming, sinking in sand)
- `auto`: bool = true — chooses idle or walk from how it moves

### Actions (`"act"`)

**anim** — Play an animation from the start.

- `target`: string = "self"
- `name`: string (required)
- `lock`: number = 0 — seconds automatic animation is paused

**effect** — Play a picture's animation once at a spot (splash, smoke, sparkle). Nothing to set up first.

- `sprite`: sprite name (required)
- `anim`: string (optional) — which animation (default: its first)
- `at`: self|other|world = "self"
- `x`: expr (optional)
- `y`: expr (optional)
- `dx`: expr = 0
- `dy`: expr = 0
- `layer`: int = 2 — higher draws in front

**setsprite** — Change a thing's picture (and optionally its animation).

- `target`: string = "self"
- `sprite`: sprite name (required)
- `anim`: string (optional)

## combat

Hit points, damage with invulnerability and knockback, and short-lived entities. Contact damage, pickups, drops and doors are ordinary rules.

### Components

**health** — Hit points. When hp reaches 0 the "die" rules run, then the entity is removed (unless a rule calls keepAlive).

- `hp`: number = 1
- `max`: number = 1
- `invuln`: number = 0.6 — seconds of immunity after a hit
- `t`: number = 0 — immunity left

**lifetime** — Removes the entity after t seconds.

- `t`: number = 1

### Triggers (`"on"`)

**hit** — This entity took damage. args.amount is how much; other is the source.


**die** — hp reached 0. Call keepAlive to survive (boss phases, respawns).


### Actions (`"act"`)

**damage** — Hurt entities that have health.

- `target`: string = "other" — "self", "other" or a tag
- `amount`: expr = 1
- `knockback`: expr = 0 — pixels/second away from the source

**heal** — Restore hit points (never above max).

- `target`: string = "self"
- `amount`: expr = 1

**keepAlive** — Inside a "die" rule: do not remove this entity.


## ai

Simple movement brains. There is no state machine feature: change ai.mode from rules ("set self.ai.mode").

### Components

**ai** — Sets this entity's velocity each frame according to its mode. (needs pos, vel)

- `mode`: idle|patrol|chase|flee|wander = "idle"
- `speed`: number = 30
- `range`: number = 80 — how far chase/flee can see
- `target`: string = "player" — tag to chase or flee from
- `dir`: number = -1 — patrol direction, -1 or 1
- `axis`: x|y = "x"
- `t`: number = 0 — timer

## dialogue

Conversations with typewriter text, conditional lines and choices. Pushes a "dialogue" mode; the world below is frozen.

### Actions (`"act"`)

**say** — Start a conversation. Lines may have an "if" and "choices" [{text, if, then}]. A choice ends the conversation and runs its "then". "then" of the say runs when it ends.

- `name`: text (optional) — speaker
- `lines`: custom (required)
- `then`: actions (optional)
