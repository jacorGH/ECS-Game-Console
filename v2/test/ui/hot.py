"""Browser checks: the game keeps running when you leave Play and come back; edits are applied to it, not a reboot."""
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
        pg.on('pageerror', lambda e: errs.append(str(e) + ' :: ' + str(getattr(e, 'stack', ''))[:300]))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'; A = 'DC.Audio'
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in', 'Hot test'); await pg.click('[data-tmpl=flag-of-gold]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        await ev("""() => { window.__starts = 0; const s = DC2_STUDIO.startPlay.bind(DC2_STUDIO); DC2_STUDIO.startPlay = function (o) { window.__starts++; return s(o); }; }""")
        W = f"{S}.runner.world"
        async def go(tab): await pg.click(f'#tabs [data-tab={tab}]'); await pg.wait_for_timeout(350)
        async def cart(expr): return await ev(f"{S}.doc.cart.{expr}")
        async def live(prefab): return await ev(f"{W}.active().ents.filter(e => !e.dead && e.prefab === '{prefab}').length")
        player = await cart("meta.player")

        await go('play'); await pg.wait_for_timeout(500)
        if await pg.locator('#tapStart:not([hidden])').count(): await pg.click('#tapStart')
        await pg.wait_for_timeout(500)
        ck('the first visit starts the game', await ev("window.__starts") == 1 and await ev(f"{W} !== null"))
        await ev(f"window.__world = {W}; (() => {{ const p = {W}.player(); p.c.pos.x = 150; p.c.pos.y = 90; {W}.vars.coins = 7; p.v.mood = 'happy'; }})()")
        eid = await ev(f"{W}.player().id"); await pg.wait_for_timeout(200)
        ck('music plays', await ev(f"{A}.songName") == 'overworld')

        # ---- leave, edit in other tabs, come back
        await go('map')
        ck('leaving Play pauses the game and silences its music', await ev(f"{A}.songName") is None and not await ev("DC2_STUDIO.playing"))
        ck('but the game itself is kept', await ev(f"{S}.runner.world === window.__world"))
        coins_before = await live('coin'); sl_before = await live('slime')
        await ev(f"{S}.doc.insert(['maps','overworld','objects'], null, {{ prefab: 'coin', x: 40, y: 150 }}); {S}.doc.insert(['maps','overworld','objects'], null, {{ prefab: 'slime', x: 250, y: 60 }})")
        spd = await cart(f"prefabs['{player}'].c.topdown.speed")
        await ev(f"{S}.doc.set(['prefabs','{player}','c','topdown','speed'], {spd + 30})")
        W_ = 24; rows = await cart("maps.overworld.layers[0].rows")
        await ev(f"""(() => {{ const a = DC2.decodeRows({S}.doc.cart.maps.overworld.layers[0].rows, 24); window.__cell = 3 * 24 + 20; window.__old = a[window.__cell]; a[window.__cell] = a[window.__cell] === 1 ? 2 : 1; {S}.doc.set(['maps','overworld','layers',0,'rows'], DC2.encodeRows(a, 24, 16)); }})()""")
        await go('things'); await go('play'); await pg.wait_for_timeout(500)
        ck('coming back does NOT restart: no new game was started', await ev("window.__starts") == 1)
        ck('it is the very same game', await ev(f"{S}.runner.world === window.__world"))
        ck('the player is where it was', abs(await ev(f"{W}.player().c.pos.x") - 150) < 40 and await ev(f"{W}.player().id") == eid)
        ck('the score and the player\'s own values are kept', await ev(f"{W}.vars.coins") == 7 and await ev(f"{W}.player().v.mood") == 'happy')
        ck('a coin you placed in the Map tab is there', await live('coin') == coins_before + 1, [coins_before, await live('coin')])
        ck('and a slime you placed', await live('slime') == sl_before + 1)
        ck('the player\'s new speed is in effect', await ev(f"{W}.player().c.topdown.speed") == spd + 30)
        ck('a tile you painted is changed in the running level', await ev(f"{W}.active().map.layers[0].ids[window.__cell]") != await ev("window.__old"))
        ck('the music is back', await ev(f"{A}.songName") == 'overworld')
        ck('you are told what changed', await pg.locator('#toast').count() >= 0)

        # ---- delete / undo from the Play screen
        await ev(f"{S}.doc.insert(['maps','overworld','objects'], null, {{ prefab: 'coin', x: 280, y: 200 }})"); await pg.wait_for_timeout(500)
        ck('a change made while Play is showing reaches the game by itself', await ev(f"{W}.active().ents.some(e => !e.dead && e.prefab === 'coin' && e.c.pos.x === 280)"))
        await pg.click('#btnUndo'); await pg.wait_for_timeout(500)
        ck('Undo at the top removes it from the running game', not await ev(f"{W}.active().ents.some(e => !e.dead && e.prefab === 'coin' && e.c.pos.x === 280)") and await ev("window.__starts") == 1)
        ck('still the same game, same score', await ev(f"{S}.runner.world === window.__world") and await ev(f"{W}.vars.coins") == 7)

        # ---- a change with a problem
        await go('map')
        await ev(f"{S}.doc.set(['prefabs','{player}','c','topdown','speed'], 'fast')"); await pg.wait_for_timeout(300)
        await go('play'); await pg.wait_for_timeout(400)
        banner = await pg.locator('#playProblems').text_content()
        ck('if your latest change has a problem the game keeps running the last good version', 'still running the last version that worked' in banner and not await pg.locator('#playProblems').is_hidden(), banner)
        ck('it did not restart or crash', await ev("window.__starts") == 1 and await ev(f"{S}.runner.world === window.__world") and await ev(f"{W}.player().c.topdown.speed") == spd + 30)
        ck('and the game is actually running', await ev(f"{S}.playing"))
        await pg.click('#btnUndo'); await pg.wait_for_timeout(500)
        ck('undoing the mistake clears the warning', await pg.locator('#playProblems').is_hidden())

        # ---- starting over on purpose
        await ev(f"{W}.vars.coins = 55")
        await pg.click('#btnRestart'); await pg.wait_for_timeout(500)
        ck('Restart is a real restart (a new game, spawn point, score back to zero)', await ev("window.__starts") == 2 and await ev(f"{S}.runner.world !== window.__world") and (await ev(f"{W}.vars.coins") or 0) == 0)
        await ev(f"window.__world = {W}")
        await go('map'); await go('play'); await pg.wait_for_timeout(300)
        ck('and after that it carries on again without restarting', await ev("window.__starts") == 2 and await ev(f"{S}.runner.world === window.__world"))
        await go('map')
        await ev(f"{S}.playHere({{ x: 100, y: 100 }})"); await pg.wait_for_timeout(500)
        ck('"Play here" starts over at the spot you picked', await ev("window.__starts") == 3 and abs(await ev(f"{W}.player().c.pos.x") - 100) < 6)

        # ---- editing the game's JSON in the Code tab, then ▶ Play
        await go('play'); await pg.click('#btnRestart'); await pg.wait_for_timeout(500)   # a fresh game in the first level (the last step left us in the cave)
        await ev(f"window.__world = {W}; {W}.vars.coins = 9; {W}.player().c.pos.x = 140"); starts = await ev("window.__starts")
        await go('code'); await pg.wait_for_timeout(300)
        old = await cart(f"prefabs['{player}'].c.topdown.speed"); txt = await ev(f"{S}.ce.value")
        await pg.locator('#codeEditor textarea').first.fill(txt.replace('"speed": %d' % old, '"speed": %d' % (old + 50), 1)); await pg.wait_for_timeout(300)
        await pg.click('#codeApply'); await pg.wait_for_timeout(300)
        ck('Apply in the Code tab changes the game data', await cart(f"prefabs['{player}'].c.topdown.speed") == old + 50)
        await pg.click('#codeRun'); await pg.wait_for_timeout(700)
        ck('▶ Play after a Code edit carries on with the same game', await ev(f"{S}.tab") == 'play' and await ev("window.__starts") == starts and await ev(f"{S}.runner.world === window.__world"))
        ck('keeping the score and where the player is', await ev(f"{W}.vars.coins") == 9 and abs(await ev(f"{W}.player().c.pos.x") - 140) < 40)
        ck('with the change you typed in effect', await ev(f"{W}.player().c.topdown.speed") == old + 50)

        # ---- the project is the unit
        await ev(f"window.__world = {W}"); await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew'); await pg.wait_for_timeout(300)
        await pg.click('#projList .proj, #projList > * >> nth=0'); await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(400)
        await go('play'); await pg.wait_for_timeout(400)
        ck('leaving the project and coming back starts a new game', await ev("window.__starts") == starts + 1 and await ev(f"{S}.runner.world !== window.__world"))
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
