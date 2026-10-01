"""The v1 console shares the audio engine. It must sound exactly as before: master 0.5, both channels at 1, mute working, sound playing."""
import asyncio
from playwright.async_api import async_playwright
P = F = 0
def ck(n, c, x=''):
    global P, F
    if c: P += 1
    else: F += 1; print('  ✗', n, x)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg = await (await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '403' not in m.text and 'fonts.g' not in m.text else None)
        ev = pg.evaluate
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_timeout(1200)
        ck('v1 loads with the shared engine', await ev("typeof DC.Audio.setLevels") == 'function')
        await ev("DC.Audio.unlock()"); await pg.wait_for_timeout(200)
        lv = await ev("[DC.Audio.out.gain.value, DC.Audio.sfx.gain.value, DC.Audio.mus.gain.value]")
        ck('untouched levels are exactly the old ones: master 0.5, channels 1', lv == [0.5, 1, 1], lv)
        await ev("DC.Audio.play('coin', { wave: 'square', f: [988, 1480], d: 0.3, v: 0.4 })")
        seen = 0
        for _ in range(30):
            seen = max(seen, await ev("DC.Audio.peak('master')")); await pg.wait_for_timeout(10)
        ck('a sound effect reaches the speakers', seen > 0.02, seen)
        await ev("DC.Audio.playMusic('t', { bpm: 140, tracks: [{ wave: 'square', v: 0.2, notes: 'C5 E5 G5 C6 C5 E5 G5 C6' }] })"); await pg.wait_for_timeout(500)
        ck('music plays through its own channel', await ev("DC.Audio.songName") == 't' and await ev("DC.Audio.song.tracks[0].v") == 0.2)
        await ev("DC.Audio.stopMusic()")
        await ev("DC.Audio.setMuted(true)"); ck('mute still silences everything', await ev("DC.Audio.out.gain.value") == 0)
        await ev("DC.Audio.setMuted(false)"); ck('and unmuting restores the old volume', await ev("DC.Audio.out.gain.value") == 0.5)
        if await pg.locator('#btnMute').count():
            await pg.click('#btnMute'); await pg.wait_for_timeout(80)
            ck("v1's own Sound on/off button still works", await ev("DC.Audio.muted") is True); await pg.click('#btnMute')
        print('page errors:', errs or 'none'); ck('no errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
