# assets/

Put image and sound files here and reference them by file name in your cart.

```json
"sprites": { "hero": { "src": "hero.png", "w": 16, "h": 16 } },
"sounds":  { "jump": { "src": "jump.wav" } }
```

- Sprite sheets are sliced into `w`×`h` frames, left to right, top to bottom.
- Use PNG with transparency. Keep pixel art at 1× and set `"scale": 2` in the sprite to enlarge it.
- Sounds can be `.wav`, `.mp3` or `.ogg`.
- To load from a different folder, set `"meta": { "assets": "carts/mygame/" }`.
