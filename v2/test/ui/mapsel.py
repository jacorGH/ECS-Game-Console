"""Browser checks: no text selection from drags, and the map selection tools (box, wand, paint, copy/paste, move, lock, line, frame)."""
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
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'; MV = f'{S}.mv'
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')

        # ---- text selection cannot start from a drag or a long press
        us = await ev("[document.body, document.querySelector('.bar h1'), document.querySelector('#btnNew')].map(e => getComputedStyle(e).userSelect)")
        ck('text in the header, buttons and panels is not selectable', all(u == 'none' for u in us), us)
        prevented = await ev("""(() => { const t = document.querySelector('.bar h1'); const e = new Event('selectstart', { cancelable: true, bubbles: true }); t.dispatchEvent(e); return e.defaultPrevented; })()""")
        ck('a selection start on plain text is refused', prevented)
        await pg.click('#btnNew'); await pg.fill('.big-in', 'hello world')
        inp_ok = await ev("""(() => { const i = document.querySelector('.big-in'), e = new Event('selectstart', { cancelable: true, bubbles: true }); i.dispatchEvent(e); i.select(); return [!e.defaultPrevented, getComputedStyle(i).userSelect, i.selectionEnd - i.selectionStart]; })()""")
        ck('but typing fields still select normally', inp_ok == [True, 'text', 11], inp_ok)
        await pg.click('[data-tmpl=topdown]'); await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(500)
        if await pg.locator('#tapStart:not([hidden])').count(): await pg.click('#tapStart')
        hb = await pg.eval_on_selector('.bar h1', 'e => { const r = e.getBoundingClientRect(); return [r.left + 4, r.top + r.height / 2]; }')
        pb = await pg.eval_on_selector('#padZone, .pad, [data-pad]', 'e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }') if await pg.locator('#padZone, .pad, [data-pad]').count() else [100, 700]
        await pg.mouse.move(*hb); await pg.mouse.down(); await pg.mouse.move(pb[0], pb[1], steps=12); await pg.mouse.up()
        sel = await ev("window.getSelection().toString()")
        ck('dragging from the header down over the controls selects nothing', sel == '', repr(sel))
        await pg.mouse.dblclick(*hb); await pg.mouse.click(hb[0], hb[1], click_count=3)
        ck('double and triple tap on the title select nothing', await ev("window.getSelection().toString()") == '')

        # ---- map tools
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(300)
        tools = await ev("[...document.querySelectorAll('#tools [data-tool]')].map(b => b.dataset.tool)")
        ck('tools: line, frame, select and wand are there', all(t in tools for t in ['line', 'frame', 'tsel', 'wand']), tools)
        mid = await ev(f"{MV}.st.mapId"); W = await ev(f"{MV}.map.w"); H = await ev(f"{MV}.map.h")
        async def xy(cx, cy):
            return await ev(f"""(() => {{ const mv = {MV}, r = mv.cv.getBoundingClientRect(), v = mv.view, ts = mv.ts; return [r.left + v.x + ({cx} + 0.5) * ts * v.s, r.top + v.y + ({cy} + 0.5) * ts * v.s]; }})()""")
        async def drag(a, b, steps=6):
            x0, y0 = await xy(*a); x1, y1 = await xy(*b)
            await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x1, y1, steps=steps); await pg.mouse.up(); await pg.wait_for_timeout(80)
        async def tap(c):
            x, y = await xy(*c); await pg.mouse.click(x, y); await pg.wait_for_timeout(80)
        async def tile_at(li, cx, cy): return await ev(f"DC2.studio.map.layerIds({S}.doc.cart,'{mid}',{li})[{cy}*{W}+{cx}]")
        async def count(li, t): return await ev(f"DC2.studio.map.layerIds({S}.doc.cart,'{mid}',{li}).filter(v=>v==={t}).length")
        async def nsel(): return await ev(f"({MV}.sel()||{{size:0}}).size")
        await ev(f"{MV}.fit && {MV}.overview()"); await pg.wait_for_timeout(100)
        # make a known level: layer 0 all grass(1) with a water(4) pond 3x3 at (2..4,2..4)
        await ev(f"""(() => {{ const d = {S}.doc, M = DC2.studio.map, id = '{mid}'; d.transact('setup', () => {{ M.fillSel(d, id, [0], M.selAll(d.cart.maps[id]), 1); M.fillSel(d, id, [0], M.selRect(d.cart.maps[id], 2, 2, 4, 4), 4); }}); {MV}.redraw(); }})()""")
        grass = await count(0, 1); ck('setup: known ground', grass == W * H - 9 and await count(0, 4) == 9, [grass, W * H])

        # wand: everywhere
        await pg.click('#tools [data-tool=wand]'); await pg.wait_for_timeout(100)
        await tap((10, 8))
        ck('wand on grass selects every grass cell in the level', await nsel() == grass, [await nsel(), grass])
        ck('the bar says how many', f'{grass} selected' in await ev("document.querySelector('#selBar').textContent"))
        # paint the chosen tile over it
        await pg.click('#palette [data-tile="5"]'); await pg.wait_for_timeout(80)
        u0 = await ev(f"{S}.doc.undos.length")
        await pg.click('#selBar [data-act=paint]'); await pg.wait_for_timeout(100)
        ck('Paint replaces all of them at once', await count(0, 5) == grass and await count(0, 1) == 0)
        ck('as one undo step', await ev(f"{S}.doc.undos.length") == u0 + 1)
        await pg.click('#btnUndo'); await pg.wait_for_timeout(100)
        ck('and undo brings the grass back', await count(0, 1) == grass and await count(0, 5) == 0)
        # connected scope
        await pg.click('#selBar [data-v=connected]'); await tap((3, 3))
        ck('wand "Touching" on the pond selects just the pond (9)', await nsel() == 9, await nsel())
        await pg.click('#selBar [data-v=all]'); await tap((3, 3))
        ck('wand "Whole level" on water: same 9 (only one pond)', await nsel() == 9)
        # add / remove
        await pg.click('#selBar [data-v=add]'); await tap((0, 0))
        ck('Add joins another tile type to the selection', await nsel() == 9 + grass)
        await pg.click('#selBar [data-v=sub]'); await tap((3, 3))
        ck('Remove takes the water back out', await nsel() == grass)
        await pg.click('#selBar [data-v=new]')

        # box select with drag, add a second box, remove a corner
        await pg.click('#tools [data-tool=tsel]'); await pg.wait_for_timeout(80)
        await drag((6, 1), (8, 3))
        ck('dragging a box selects it (3x3)', await nsel() == 9, await nsel())
        await pg.click('#selBar [data-v=add]'); await drag((12, 1), (13, 2))
        ck('Add: a second box joins it (+4)', await nsel() == 13, await nsel())
        await pg.click('#selBar [data-v=sub]'); await drag((6, 1), (6, 1))
        ck('Remove: one cell out', await nsel() == 12, await nsel())
        await pg.click('#selBar [data-v=new]')

        # copy / paste / flip / place
        await drag((2, 2), (4, 4))
        await pg.click('#selBar button:text-is("Copy")'); await pg.wait_for_timeout(60)
        await pg.click('#selBar button:text-is("Paste")'); await pg.wait_for_timeout(80)
        ck('Paste makes a floating copy', await ev(f"!!{MV}.st.float"))
        fx = await ev(f"{MV}.st.float.x")
        ck('with Place / flip / keep stamping controls', all([await pg.locator(f'#selBar button:has-text("{t}")').count() for t in ['Place', '↔', 'Keep stamping']]))
        # move it to (7..9, 6..8) by tapping there, then place
        await tap((8, 7)); fl = await ev(f"[{MV}.st.float.x, {MV}.st.float.y]")
        ck('tapping the map jumps the copy there (centred)', fl == [7, 6], fl)
        await pg.click('#selBar button:has-text("Place")'); await pg.wait_for_timeout(100)
        ck('Place puts a second pond there (water count 18) and keeps the first', await count(0, 4) == 18 and await tile_at(0, 8, 7) == 4 and await tile_at(0, 3, 3) == 4)
        ck('the pasted area becomes the selection', await nsel() == 9)
        await pg.click('#btnUndo'); await pg.wait_for_timeout(80)
        ck('undo removes the whole paste in one step', await count(0, 4) == 9)

        # move
        await drag((2, 2), (4, 4)); u0 = await ev(f"{S}.doc.undos.length")
        await pg.click('#selBar button:text-is("Move")'); await pg.wait_for_timeout(80)
        ck('Move lifts it without changing the level yet', await ev(f"!!{MV}.st.float") and await count(0, 4) == 9 and await ev(f"{S}.doc.undos.length") == u0)
        fl0 = await ev(f"[{MV}.st.float.x, {MV}.st.float.y]")
        await drag((3, 3), (8, 6))
        fl1 = await ev(f"[{MV}.st.float.x, {MV}.st.float.y]")
        ck('dragging the lifted piece moves it by the same amount', fl1 == [fl0[0] + 5, fl0[1] + 3], [fl0, fl1])
        await pg.click('#selBar button:has-text("Place")'); await pg.wait_for_timeout(100)
        ck('Place: gone from the old spot, there in the new one', await tile_at(0, 3, 3) == 0 and await tile_at(0, 8, 6) == 4 and await count(0, 4) == 9)
        ck('one undo step', await ev(f"{S}.doc.undos.length") == u0 + 1)
        await pg.click('#btnUndo'); await pg.wait_for_timeout(80)
        ck('undo puts the pond back', await tile_at(0, 3, 3) == 4 and await tile_at(0, 8, 6) == 1)
        # cancel a move: nothing changes
        await drag((2, 2), (4, 4)); await pg.click('#selBar button:text-is("Move")'); await pg.click('#selBar button:text-is("✕")'); await pg.wait_for_timeout(60)
        ck('cancelling a move changes nothing', await count(0, 4) == 9 and not await ev(f"!!{MV}.st.float"))

        # lock: drawing stays inside the selection
        await pg.click('#tools [data-tool=tsel]'); await drag((0, 0), (2, 0)); await pg.click('#palette [data-tile="5"]')
        await pg.click('#tools [data-tool=draw]'); await tap((1, 0)); await tap((6, 6))
        ck('with something selected, drawing outside it does nothing', await tile_at(0, 1, 0) == 5 and await tile_at(0, 6, 6) == 1)
        await pg.click('#selBar button:has-text("Draw inside only")'); await tap((6, 6))
        ck('"Draw anywhere" lets you paint outside', await tile_at(0, 6, 6) == 5)
        await pg.click('#selBar button:text-is("✕")')

        # line and frame
        await pg.click('#tools [data-tool=line]'); await drag((10, 10), (14, 10))
        ck('Line paints a straight line (5 cells)', all([await tile_at(0, x, 10) == 5 for x in range(10, 15)]) and await tile_at(0, 15, 10) == 1)
        await pg.click('#palette [data-tile="2"]'); await pg.click('#tools [data-tool=frame]'); await drag((15, 2), (19, 5))
        n = await ev(f"DC2.studio.map.layerIds({S}.doc.cart,'{mid}',0).filter(v=>v===2).length")
        ck('Frame paints only the outline of a box (5x4 = 14 cells)', n == 14 and await tile_at(0, 17, 3) == 1, n)

        # keyboard
        await pg.click('#tools [data-tool=tsel]'); await pg.mouse.move(200, 400)
        await pg.keyboard.press('Control+a'); ck('Ctrl+A selects everything', await nsel() == W * H, await nsel())
        await pg.keyboard.press('Escape'); ck('Esc deselects', await nsel() == 0)
        await drag((2, 2), (4, 4)); await pg.keyboard.press('Delete')
        ck('Delete clears the selection', await count(0, 4) == 0 and await tile_at(0, 3, 3) == 0)
        await pg.keyboard.press('Control+z'); ck('and Ctrl+Z brings it back', await count(0, 4) == 9)

        # sprinkle
        await pg.click('#tools [data-tool=tsel]'); await drag((0, 12), (19, 14)); await pg.click('#palette [data-tile="2"]')
        before = await count(0, 2); await pg.click('#selBar button:text-is("Sprinkle")'); await pg.click('.pick-item:has-text("Lots")'); await pg.wait_for_timeout(100)
        added = await count(0, 2) - before
        ck('Sprinkle "Lots" places tiles on roughly half of the selection', 10 <= added <= 50 and added < 60, added)
        await pg.screenshot(path='/tmp/ui_mapsel.png')

        # border / invert / keep stamping / flip / all layers
        await pg.click('#tools [data-tool=tsel]'); await drag((5, 5), (7, 7))
        await pg.click('#selBar button:text-is("Border")'); ck('Border keeps only the outline (3x3 -> 8)', await nsel() == 8, await nsel())
        await pg.click('#selBar button:text-is("Invert")'); ck('Invert selects everything else', await nsel() == W * H - 8, await nsel())
        await pg.click('#selBar button:text-is("✕")')
        await drag((2, 2), (3, 2)); await pg.click('#selBar button:text-is("Copy")'); await pg.click('#selBar button:text-is("Paste")')
        c0 = await count(0, 4)
        await pg.click('#selBar button:has-text("Keep stamping")'); await tap((10, 12)); await pg.click('#selBar button:has-text("Place")'); await pg.wait_for_timeout(80)
        ck('Keep stamping: after Place the copy is still floating', await ev(f"!!{MV}.st.float") and await count(0, 4) == c0 + 2)
        await tap((14, 12)); await pg.click('#selBar button:has-text("Place")'); await pg.wait_for_timeout(80)
        ck('and stamps again somewhere else', await count(0, 4) == c0 + 4)
        await pg.click('#selBar button:text-is("✕")'); await pg.wait_for_timeout(50)
        ck('cancel ends stamping without changing anything', not await ev(f"!!{MV}.st.float") and await count(0, 4) == c0 + 4)
        fy = 12
        await ev("(() => { const d = " + S + ".doc, M = DC2.studio.map, id = '" + mid + "'; M.setCells(d, id, 0, [{ x: 0, y: " + str(fy) + ", id: 2 }, { x: 1, y: " + str(fy) + ", id: 5 }], 'x'); " + MV + ".redraw(); })()")
        await pg.click('#tools [data-tool=tsel]'); await drag((0, fy), (1, fy)); await pg.click('#selBar button:text-is("Copy")'); await pg.click('#selBar button:text-is("Paste")')
        before = await ev(MV + ".st.float.clip.layers[0].ids.join()")
        await pg.click('#selBar button:text-is("↔")'); after = await ev(MV + ".st.float.clip.layers[0].ids.join()")
        ck('the flip button mirrors the floating copy', before == '2,5' and after == '5,2', [before, after])
        await pg.click('#selBar button:text-is("✕")')
        await ev("(() => { const d = " + S + ".doc, M = DC2.studio.map, id = '" + mid + "'; M.setCells(d, id, 1, [{ x: 18, y: 1, id: 2 }], 'x'); M.setCells(d, id, 0, [{ x: 18, y: 1, id: 2 }], 'x'); " + MV + ".redraw(); })()")
        await pg.click('#tools [data-tool=tsel]'); await drag((18, 1), (18, 1))
        await pg.click('#selBar button:text-is("Layers: this")'); await pg.click('#selBar button:text-is("Delete")'); await pg.wait_for_timeout(80)
        ck('"Layers: all" then Delete clears both layers at that cell', await tile_at(0, 18, 1) == 0 and await tile_at(1, 18, 1) == 0)
        await pg.click('#selBar button:text-is("Layers: all")'); await pg.click('#selBar button:text-is("✕")')

        # copy in one level, paste in another
        await pg.click('#tools [data-tool=tsel]'); await drag((2, 2), (4, 4)); await pg.click('#selBar button:text-is("Copy")')
        other = await ev(f"(() => {{ const d = {S}.doc, before = Object.keys(d.cart.maps); DC2.studio.addLevel(d, 'second', 12, 10); return Object.keys(d.cart.maps).find(k => !before.includes(k)); }})()")
        await ev(f"{MV}.setMap('{other}')"); await pg.wait_for_timeout(150); await ev("window.DC2_STUDIO.renderMapUI()")
        ck('the copy is still on the clipboard in a different level', await pg.locator('#selBar button:text-is("Paste")').count() == 1)
        await pg.click('#tools [data-tool=tsel]'); await pg.click('#selBar button:text-is("Paste")'); await pg.wait_for_timeout(80)
        await pg.click('#selBar button:has-text("Place")'); await pg.wait_for_timeout(100)
        n2 = await ev(f"DC2.studio.map.layerIds({S}.doc.cart,'{other}',0).filter(v=>v===4).length")
        ck('pasting there works: the pond arrives in the other level', n2 == 9, n2)
        await ev(f"{MV}.setMap('{mid}')"); await ev("window.DC2_STUDIO.renderMapUI()")

        # control: prove the drag check can fail. Same drag on a page where the protection is switched off must select text.
        ctl = await (await b.new_context(viewport={'width': 390, 'height': 844})).new_page()
        await ctl.route('**/nozoom.js*', lambda r: r.abort())
        await ctl.goto(URL); await ctl.wait_for_selector('#btnNew'); await ctl.add_style_tag(content='html, body, body * { -webkit-user-select:text !important; user-select:text !important; }')
        await ctl.click('#btnNew'); await ctl.click('[data-tmpl=topdown]'); await ctl.wait_for_selector('#screenEditor:not([hidden])'); await ctl.click('#tabs [data-tab=play]'); await ctl.wait_for_timeout(400)
        h2 = await ctl.eval_on_selector('.bar h1', 'e => { const r = e.getBoundingClientRect(); return [r.left + 2, r.top + r.height / 2]; }')
        await ctl.mouse.move(*h2); await ctl.mouse.down(); await ctl.mouse.move(150, 720, steps=15); await ctl.mouse.up()
        ck('control: with the protection off, that same drag DOES select text (so the check above can fail)', len(await ctl.evaluate("window.getSelection().toString()")) > 10)

        ck('the level is still valid', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
