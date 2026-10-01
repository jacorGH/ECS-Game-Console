"""Browser checks: the sound mixer (balance, songs, tracks, effects, device volume), live changes to a running game,
music stopping when you leave Play, and the standalone player's volume panel."""
import asyncio
from playwright.async_api import async_playwright
URL = 'http://localhost:8123/v2/studio.html'
P = F = 0
def ck(n, c, x=''):
    global P, F
    if c: P += 1
    else: F += 1; print('  ✗', n, x)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'; A = 'DC.Audio'
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in', 'Mix test'); await pg.click('[data-tmpl=flag-of-gold]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        async def slide(key, value): await pg.locator(f'.sheet [data-mx="{key}"]').fill(str(value)); await pg.wait_for_timeout(40)
        async def open_tracks(song):   # the "Tracks" button sits just above that song's per-track sliders
            await ev(f"document.querySelector('[data-mx=\"track-{song}-0\"]').closest('.mx-tracks').previousElementSibling.click()"); await pg.wait_for_timeout(80)
        async def peak_seen(which, ms=1500):
            for _ in range(ms // 25):
                if await ev(f"{A}.peak('{which}')") > 0.005: return True
                await pg.wait_for_timeout(25)
            return False

        # ---- entry points
        await pg.click('#tabs [data-tab=game]'); await pg.wait_for_timeout(250)
        txt = await ev("document.querySelector('#gameBody').textContent")
        ck('the Game tab has a Sound section with the counts', 'Sound' in txt and '2 songs' in txt and '9 sound effects' in txt and 'Music 100%' in txt, txt[-300:])
        await pg.click('#gameBody button:has-text("Open the sound mixer")'); await pg.wait_for_timeout(300)
        ck('it opens the Sound mixer', await pg.locator('.sheet .sheet-title:has-text("Sound mixer")').count() == 1)
        heads = await ev("[...document.querySelectorAll('.sheet h3')].map(h => h.textContent)")
        ck('with a section each for balance, music, effects and this device', heads == ['Balance for this game', 'Music', 'Sound effects', 'On this device'], heads)
        ck('a row for each song and each sound effect', await pg.locator('.sheet [data-mx^="song-"]').count() == 2 and await pg.locator('.sheet [data-mx^="sound-"]').count() == 9)
        ck('and three meters', await pg.locator('.sheet .mx-meter').count() == 3)

        # ---- the game's balance
        await slide('mix-music', 40); await slide('mix-sfx', 150)
        mix = await ev(f"{S}.doc.cart.meta.mix")
        ck('music down to 40% and effects up to 150% are saved in the game', mix == {'music': 0.4, 'sfx': 1.5}, mix)
        eng = await ev(f"[{A}.mix.music, {A}.mix.sfx, {A}.mus.gain.value, {A}.sfx.gain.value].map(x => Math.round(x * 1000) / 1000)")
        ck('and reach the audio engine at once: the two channels really have different gains', eng == [0.4, 1.5, 0.4, 1.5], eng)
        ck('the label shows the value', await pg.locator('.sheet [data-mx="mix-music"]').evaluate("e => e.parentElement.querySelector('output').textContent") == '40%')
                # real pointer input on a slider, not just setting a value
        bx = await pg.locator('.sheet [data-mx="mix-music"]').bounding_box()
        await pg.mouse.click(bx['x'] + bx['width'] * 0.75, bx['y'] + bx['height'] / 2); await pg.wait_for_timeout(60)
        v = await ev(f"{S}.doc.cart.meta.mix.music")
        ck('a real tap partway along the slider sets that value (about 150%)', 1.3 < v < 1.7, v)
        await slide('mix-music', 40)

        # ---- one drag = one undo step
        await pg.wait_for_timeout(1000)   # let the previous change close (changes within 0.8 s merge into one)
        n0 = await ev(f"{S}.doc.undos.length")
        for v in (55, 60, 65, 70): await slide('mix-music', v)
        ck('dragging a slider through many values is a single undo step', await ev(f"{S}.doc.undos.length") == n0 + 1, [n0, await ev(f'{S}.doc.undos.length')])
        await pg.click('.sheet .sh-undo'); await pg.wait_for_timeout(250)
        ck('undo puts back what it was before the drag (40%) and the slider follows', await ev(f"{S}.doc.cart.meta.mix.music") == 0.4 and await pg.locator('.sheet [data-mx="mix-music"]').input_value() == '40')
        ck('and the engine follows the undo', await ev(f"{A}.mix.music") == 0.4, await ev(f"{A}.mix.music"))

        # ---- songs, tracks, live retune while it plays
        await pg.click('.sheet .mx-row:has([data-mx="song-overworld"]) .mx-play'); await pg.wait_for_timeout(300)
        ck('▶ on a song plays it', await ev(f"{A}.songName") == 'overworld')
        ck('and the button becomes ■', await pg.locator('.sheet .mx-row:has([data-mx="song-overworld"]) .mx-play.on').count() == 1)
        ck('the music meter moves while it plays', await peak_seen('music'), 'no signal on the music channel')
        ck('and the effects meter stays quiet (they really are separate)', await ev(f"{A}.peak('sfx')") == 0)
        await open_tracks('overworld')
        t0 = await ev(f"{A}.song.tracks[0].v"); tm = await ev(f"{A}.timer")
        await slide('track-overworld-0', 80)
        v0 = await ev(f"{S}.doc.cart.music.overworld.tracks[0].v")
        ck('a track slider uses the curve: 80% along = 0.64', abs(v0 - 0.64) < 0.001, v0)
        ck('and changes the playing song immediately, without restarting it', abs(await ev(f"{A}.song.tracks[0].v") - 0.64) < 0.001 and await ev(f"{A}.timer") == tm, [t0, await ev(f"{A}.song.tracks[0].v")])
        await slide('song-overworld', 50)
        ck('the song volume is saved (0.5) and scales every track live', await ev(f"{S}.doc.cart.music.overworld.vol") == 0.5 and abs(await ev(f"{A}.song.tracks[0].v") - 0.32) < 0.001 and abs(await ev(f"{A}.song.tracks[1].v") - 0.5 * await ev(f"{S}.doc.cart.music.overworld.tracks[1].v")) < 0.001)
        await pg.click('.sheet .mx-row:has([data-mx="song-overworld"]) .mx-play'); await pg.wait_for_timeout(120)
        ck('■ stops it', await ev(f"{A}.songName") is None)

        # ---- sound effects
        await pg.click('.sheet .mx-row:has([data-mx="sound-coin"]) .mx-play')
        ck('▶ on an effect makes sound on the effects channel', await peak_seen('sfx', 600))
        await slide('sound-coin', 60); vc = await ev(f"{S}.doc.cart.sounds.coin.v")
        ck('an effect slider saves its volume (60% along = 0.36)', abs(vc - 0.36) < 0.001, vc)
        await pg.click('.sheet .mx-row:has([data-mx="sound-coin"]) .mx-play'); await pg.wait_for_timeout(150)
        ck('the game still validates after all that', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))

        # ---- this device
        await slide('dev-master', 50); await slide('dev-music', 50); await slide('dev-sfx', 80)
        st = await ev("JSON.parse(localStorage.getItem('dc2.audio'))")
        ck('device volumes are kept in the browser', st == {'master': 0.5, 'music': 0.5, 'sfx': 0.8, 'muted': False}, st)
        ck('and combine with the game balance: music 0.4 x 0.5 = 0.2, effects 1.5 x 0.8 = 1.2, master 0.5', await ev(f"[{A}.mix.music, {A}.mix.sfx, {A}.master].map(x => Math.round(x * 1000) / 1000)") == [0.2, 1.2, 0.5])
        ck('the game file itself is untouched by them', 'master' not in await ev(f"JSON.stringify({S}.doc.cart.meta)"))
        await pg.click('.sheet button:has-text("Sound on")'); await pg.wait_for_timeout(100)
        ck('Mute silences the master', await ev(f"{A}.muted") is True and await ev(f"{A}.out.gain.value") == 0 and await pg.locator('.sheet button:has-text("Muted")').count() == 1)
        await pg.click('.sheet button:has-text("Muted")'); await pg.wait_for_timeout(100)
        ck('Unmute brings it back', await ev(f"{A}.muted") is False and await ev(f"{A}.out.gain.value") > 0)
        await pg.click('.sheet button:has-text("Reset device volume")'); await pg.wait_for_timeout(100)
        ck('Reset puts the device back to full', await ev("JSON.parse(localStorage.getItem('dc2.audio'))") == {'master': 1, 'music': 1, 'sfx': 1, 'muted': False})
        await pg.click('.sheet button:has-text("Back to 100% each")'); await pg.wait_for_timeout(150)
        ck('"Back to 100% each" clears the game balance', await ev(f"{S}.doc.cart.meta.mix") is None and await ev(f"{A}.mix.music") == 1)
        # the meters stay pinned at the top while you scroll down the effects list
        await ev("(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = b.scrollHeight; })()"); await pg.wait_for_timeout(120)
        top = await ev("(() => { const m = document.querySelector('.mx-meters').getBoundingClientRect(), b = document.querySelector('.sheet-body').getBoundingClientRect(); return [Math.round(m.top - b.top), document.querySelector('.sheet-body').scrollTop > 200]; })()")
        ck('scrolled to the bottom, the meters are still visible at the top of the sheet', top[1] and top[0] <= 1, top)
        await pg.screenshot(path='/tmp/ui_mixer.png')
        await pg.locator('.sheet-title [aria-label=close]').last.click(); await pg.wait_for_timeout(150)

        # ---- a running game
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(500)
        if await pg.locator('#tapStart:not([hidden])').count(): await pg.click('#tapStart')
        await pg.wait_for_timeout(700)
        ck('Play starts the level\'s music', await ev(f"{A}.songName") == 'overworld', await ev(f"{A}.songName"))
        ck('there is a Sound button on the Play bar', await pg.locator('#btnMixer').count() == 1)
        await pg.click('#btnMixer'); await pg.wait_for_timeout(300)
        tm = await ev(f"{A}.timer")
        await slide('mix-music', 30); await slide('mix-sfx', 120)
        got = await ev(f"[[{A}.mus.gain.value, {A}.sfx.gain.value].map(x => Math.round(x * 1000) / 1000), {S}.runner.cart.meta.mix]")
        ck('changing the balance while playing reaches the running game and its speakers', got == [[0.3, 1.2], {'music': 0.3, 'sfx': 1.2}], got)
        await open_tracks('overworld'); await slide('track-overworld-1', 100)
        ck('a track change is heard in the running song without restarting the game or the tune', abs(await ev(f"{A}.song.tracks[1].v") - 1.0 * (await ev(f"{S}.doc.cart.music.overworld.vol") or 1)) < 0.001 and await ev(f"{A}.timer") == tm and await ev(f"{S}.runner.world.errors.length") == 0)
        await slide('sound-coin', 90); ck('and effect volume edits apply to the running game', await ev(f"{S}.runner.cart.sounds.coin.v") == 0.81)
        await pg.click('.sheet .mx-row:has([data-mx="song-cave"]) .mx-play'); await pg.wait_for_timeout(200)
        ck('previewing the other song takes over the music', await ev(f"{A}.songName") == 'cave')
        await pg.locator('.sheet-title [aria-label=close]').last.click(); await pg.wait_for_timeout(600)
        ck('closing the mixer hands the music back to the game (its own song returns)', await ev(f"{A}.songName") == 'overworld', await ev(f"{A}.songName"))

        # ---- leaving Play silences the music
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(300)
        ck('leaving the Play tab stops the music (it used to keep playing in the background)', await ev(f"{A}.songName") is None)
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(700)
        ck('and coming back starts it again', await ev(f"{A}.songName") == 'overworld')

        # ---- opening a project applies its balance straight away
        await ev(f"{S}.doc.set(['meta','mix'], {{ music: 0.25, sfx: 1.75 }})")
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew'); await pg.wait_for_timeout(300)
        await pg.click('#projList .proj, #projList > * >> nth=0'); await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(500)
        ck('reopening the project applies its balance before anything plays', await ev(f"[{A}.mix.music, {A}.mix.sfx]") == [0.25, 1.75], await ev(f"[{A}.mix.music, {A}.mix.sfx]"))

        # ---- the standalone player
        pl = await ctx.new_page(); perr = []
        pl.on('pageerror', lambda e: perr.append(str(e)))
        await pl.goto('http://localhost:8123/v2/index.html'); await pl.wait_for_timeout(800)
        await pl.click('#tapStart'); await pl.wait_for_timeout(200)
        ck('the player has a hidden volume panel', await pl.locator('#volPanel').is_hidden())
        await pl.click('#btnVolume'); await pl.wait_for_timeout(100)
        ck('the Volume button shows three sliders', await pl.locator('#volPanel').is_visible() and await pl.locator('#volPanel input[type=range]').count() == 3)
        await pl.locator('#volMusic').fill('20'); await pl.locator('#volSfx').fill('70'); await pl.locator('#volMaster').fill('60')
        st = await pl.evaluate("JSON.parse(localStorage.getItem('dc2.audio'))")
        ck('moving them saves the device volume', st['music'] == 0.2 and st['sfx'] == 0.7 and st['master'] == 0.6, st)
        ck('and sets the engine (music 0.2, effects 0.7, master 0.6)', await pl.evaluate("[DC.Audio.mix.music, DC.Audio.mix.sfx, DC.Audio.master]") == [0.2, 0.7, 0.6])
        ck('the readouts show them', await pl.locator('#volMusicOut').text_content() == '20%')
        await pl.click('#btnMute'); await pl.wait_for_timeout(80)
        ck('Sound on / off still works and silences the master', await pl.locator('#btnMute').text_content() == 'Sound off' and await pl.evaluate("DC.Audio.out.gain.value") == 0)
        await pl.reload(); await pl.wait_for_timeout(800)
        ck('after reloading the page the volumes and mute are remembered', await pl.evaluate("[DC.Audio.mix.music, DC.Audio.master, DC.Audio.muted]") == [0.2, 0.6, True] and await pl.locator('#btnMute').text_content() == 'Sound off' and await pl.locator('#volMusic').input_value() == '20')
        ck('no errors in the player', not perr, perr)

        print('page errors:', errs or 'none'); ck('no page errors in the Studio', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
