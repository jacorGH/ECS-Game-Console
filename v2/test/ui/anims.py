"""Browser checks: animations on tiles and sprites (adding frames, live preview speed, choosing what a tile plays),
animated tiles in the map editor, the tag picker, and touching a tagged tile in Play."""
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
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'
        await pg.add_init_script("window.__delays = []; const st = window.setTimeout; window.setTimeout = function (f, d, ...r) { if (d > 20) window.__delays.push(d); return st.call(window, f, d, ...r); };")
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in', 'Anim test'); await pg.click('[data-tmpl=topdown]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        async def closeSheets():
            while await pg.locator('.sheet-title [aria-label=close]').count(): await pg.locator('.sheet-title [aria-label=close]').last.click(); await pg.wait_for_timeout(60)

        # ---- a TILE: it has one frame, so first it needs more
        await pg.click('#tabs [data-tab=art]'); await pg.click('[data-sprite=water]'); await pg.wait_for_timeout(300)
        await pg.click('button:has-text("Animations")'); await pg.wait_for_timeout(200)
        ck('for a tile the sheet explains it is a tile and that one frame cannot animate', await pg.locator('.sheet:has-text("This is a tile")').count() == 1 and await pg.locator('.sheet .issue:has-text("only one frame")').count() == 1)
        ck('and marks which animation plays on the tile', await pg.locator('.lvl-row[data-anim=idle] b:text-is("▶ ")').count() == 1)
        await pg.click('.lvl-row[data-anim=idle] button:has-text("Edit")'); await pg.wait_for_timeout(200)
        ck('the animation editor offers to make new frames', await pg.locator('.sheet button:has-text("New frame (blank)")').count() == 1 and await pg.locator('.sheet button:has-text("copy of last")').count() == 1)
        u0 = await ev(f"{S}.doc.undos.length")
        await pg.click('.sheet button:has-text("copy of last")'); await pg.wait_for_timeout(250)
        st = await ev(f"[{S}.doc.cart.sprites.water.frames.length, {S}.doc.cart.sprites.water.anims.idle.f.join(), {S}.art.st.frame]")
        ck('a new frame is added to the picture AND to the animation, and selected for drawing', st == [2, '0,1', 1], st)
        ck('as one undo step', await ev(f"{S}.doc.undos.length") == u0 + 1)
        ck('the animation now shows both frames in order', await pg.locator('.seqi').count() == 2)

        # ---- speed changes take effect at once
        await ev("window.__delays.length = 0"); await pg.wait_for_timeout(600)
        d1 = await ev("window.__delays.slice()")
        ck('the preview runs at the current speed (4 fps = every 250 ms)', d1 and all(abs(x - 250) < 2 for x in d1[-3:]), d1[-4:])
        await pg.fill('[data-path="sprites.water.anims.idle.fps"] input', '24'); await pg.wait_for_timeout(50)
        await ev("window.__delays.length = 0"); await pg.wait_for_timeout(500)
        d2 = await ev("window.__delays.slice()")
        ck('changing the speed to 24 speeds the preview up straight away (every ~42 ms), without closing and reopening', d2 and all(abs(x - 1000 / 24) < 2 for x in d2[-3:]), d2[-4:])
        await pg.fill('[data-path="sprites.water.anims.idle.fps"] input', '2'); await pg.wait_for_timeout(50)
        await ev("window.__delays.length = 0"); await pg.wait_for_timeout(1200)
        d3 = await ev("window.__delays.slice()")
        ck('and slowing it down works too (every 500 ms)', d3 and all(abs(x - 500) < 2 for x in d3[-2:]), d3[-3:])
        await pg.fill('[data-path="sprites.water.anims.idle.fps"] input', '4'); await pg.wait_for_timeout(50)
        await pg.locator('.sheet-title [aria-label=close]').last.click(); await pg.wait_for_timeout(150)
        ck('the list behind updates when you go back (no stale speed)', '4 fps' in await pg.locator('.lvl-row[data-anim=idle] small').text_content())

        # ---- a new animation on a tile, and choosing it
        await pg.click('.sheet button:has-text("New animation")'); await pg.fill('.big-in', 'flow'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        ck('a second animation can be created for a tile', await ev(f"!!{S}.doc.cart.sprites.water.anims.flow"))
        await pg.click('.sheet button:has-text("＋ New frame (blank)")'); await pg.wait_for_timeout(200)
        await ev(f"{S}.doc.set(['sprites','water','frames',2], {S}.doc.cart.sprites.water.frames[1])")
        n = await ev(f"DC2.studio.tileOfSprite({S}.doc.cart, 'water').n")
        ck('until chosen, the tile keeps playing idle', await ev(f"DC2.tileAnimName({S}.doc.cart, 'world', {n})") == 'idle')
        await pg.click('.sheet button:has-text("Play this one on the tile")'); await pg.wait_for_timeout(200)
        ck('"Play this one on the tile" makes the tile play it', await ev(f"DC2.tileAnimName({S}.doc.cart, 'world', {n})") == 'flow' and await pg.locator('.sheet:has-text("plays on the tile")').count() == 1)
        await closeSheets(); await pg.click('#artBack'); await pg.wait_for_timeout(150)

        # ---- Tile settings lists the tile's animations
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(250)
        await pg.click(f'#palette [data-tile="{n}"]'); await pg.click('#palette button:has-text("Tile settings")'); await pg.wait_for_timeout(250)
        opts = await ev("(() => { const s = document.querySelector('select[data-anim$=\".anim\"]'); return s ? [...s.options].map(o => o.value) : null; })()")
        ck('Tile settings has an Animation dropdown listing the picture\'s animations', opts is not None and 'idle' in opts and 'flow' in opts, opts)
        sel = await ev("document.querySelector('select[data-anim$=\".anim\"]').value")
        ck('showing the one that plays', sel == 'flow', sel)
        await pg.select_option('select[data-anim$=".anim"]', 'idle'); await pg.wait_for_timeout(120)
        ck('and choosing another works', await ev(f"DC2.tileAnimName({S}.doc.cart, 'world', {n})") == 'idle')
        await pg.select_option('select[data-anim$=".anim"]', 'flow'); await closeSheets()

        # ---- the map editor shows it moving
        await ev(f"{S}.doc.set(['sprites','water','frames',1], {S}.doc.cart.sprites.water.frames[0].replace(/[^.\\/]/g, '9'))"); await pg.wait_for_timeout(200)
        cell = await ev(f"""(() => {{ const mv = {S}.mv, W = mv.map.w; for (let li = 0; li < mv.map.layers.length; li++) {{ const ids = DC2.studio.map.layerIds({S}.doc.cart, mv.st.mapId, li), k = ids.indexOf({n}); if (k >= 0) return [k % W, Math.floor(k / W)]; }} return null; }})()""")
        ck('the level has a water tile to look at', cell is not None, cell)
        if cell:
            await ev(f"{S}.mv.zoom(1)"); await ev(f"{S}.mv.view.x = 20 - {cell[0]} * {S}.mv.ts * {S}.mv.view.s + 100; {S}.mv.view.y = 60 - {cell[1]} * {S}.mv.ts * {S}.mv.view.s + 100; {S}.mv.redraw()")
            seen = set()
            for _ in range(10):
                px = await ev(f"""(() => {{ const mv = {S}.mv, v = mv.view, ts = mv.ts, dpr = mv.dpr, x = Math.round((v.x + ({cell[0]} + 0.5) * ts * v.s) * dpr), y = Math.round((v.y + ({cell[1]} + 0.5) * ts * v.s) * dpr); const d = mv.g.getImageData(x, y, 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; }})()""")
                seen.add(px); await pg.wait_for_timeout(130)
            ck('animated water changes colour over time in the map editor', len(seen) >= 2, list(seen))

        # ---- the tag picker in a rule
        pl = await ev(f"{S}.doc.cart.meta.player")
        await ev(f"{S}.doc.set(['prefabs','{pl}','rules'], ({S}.doc.cart.prefabs['{pl}'].rules||[]).concat([{{ on: 'touch', then: [{{ act: 'add', path: 'coins' }}] }}]))")
        k = await ev(f"{S}.doc.cart.prefabs['{pl}'].rules.length") - 1
        await pg.click('#tabs [data-tab=things]'); await ev(f"{S}.openThing('{pl}')"); await pg.wait_for_timeout(350)
        btn = pg.locator(f'[data-path="prefabs.{pl}.rules[{k}].with"] .exprrow button')
        ck('the "With" field of a touch rule has a ＋ tag picker', await btn.count() == 1)
        await btn.click(); await pg.wait_for_timeout(250)
        groups = await ev("[...document.querySelectorAll('.sheet:last-of-type .pick-group')].map(g => g.textContent)")
        ck('it lists tags on things and tags on tiles', 'Tags on things' in groups and 'Tags on tiles' in groups, groups)
        ck('including the water tile\'s tag, with its picture', await pg.locator('.pick-item.has-thumb:has(b:text-is("water"))').count() >= 1)
        await pg.locator('.pick-item:has(b:text-is("water"))').first.click(); await pg.wait_for_timeout(250)
        ck('picking it fills in the rule', await ev(f"{S}.doc.cart.prefabs['{pl}'].rules[{k}].with") == 'water' and await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))
        await closeSheets()

        # ---- Play: walk onto the water and the rule fires
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(500)
        if await pg.locator('#tapStart:not([hidden])').count(): await pg.click('#tapStart')
        await pg.wait_for_timeout(400)
        info = await ev(f"""(() => {{ const w = {S}.runner.world, m = w.active().map, defs = w.cart.tilesets[m.tileset].tiles, p = w.player();
          let wc = null; for (const L of m.layers) for (let y = 0; y < m.h && !wc; y++) for (let x = 0; x < m.w; x++) {{ const id = L.ids[y * m.w + x]; if (defs[id] && (defs[id].tags || []).includes('water')) {{ wc = [x, y]; break; }} }}
          if (!wc) return null; const c0 = w.vars.coins; p.c.pos.x = (wc[0] + 0.5) * m.ts; p.c.pos.y = (wc[1] + 0.5) * m.ts; return {{ c0, wc }}; }})()""")
        await pg.wait_for_timeout(500)
        c1 = await ev(f"{S}.runner.world.vars.coins")
        ck('in Play, walking onto a tile tagged water fires the rule', info is not None and c1 > info['c0'], [info, c1])
        ck('no runtime errors', await ev(f"{S}.runner.world.errors.length") == 0, await ev(f"{S}.runner.world.errors"))
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
