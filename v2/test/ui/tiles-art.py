"""Browser checks: tiles as their own sprites (Art + Map), tile tags, old-project upgrade, copy/paste and overlap preview."""
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://localhost:8123/v2/studio.html'
HERE = os.path.dirname(os.path.abspath(__file__))
P = F = 0
def ck(n, c, x=''):
    global P, F
    if c: P += 1
    else: F += 1; print('  ✗', n, x)

async def drag(pg, sel, a, b, steps=6):
    """a real pointer drag across a canvas between two points given as fractions of its box"""
    bx = await pg.eval_on_selector(sel, 'e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}')
    await pg.mouse.move(bx[0] + bx[2] * a[0], bx[1] + bx[3] * a[1]); await pg.mouse.down()
    await pg.mouse.move(bx[0] + bx[2] * b[0], bx[1] + bx[3] * b[1], steps=steps); await pg.mouse.up()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in', 'Swim test'); await pg.click('[data-tmpl=topdown]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)

        # ---- tiles in the Art tab
        await pg.click('#tabs [data-tab=art]'); await pg.wait_for_timeout(200)
        secs = await ev("[...document.querySelectorAll('.art-sec h3')].map(h=>h.textContent)")
        ck('Art tab has separate Sprites and Tiles sections', secs == ['Sprites', 'Tiles'], secs)
        names = await ev("(()=>{const h=[...document.querySelectorAll('#spriteGrid > *')], i=h.findIndex(e=>e.classList.contains('art-sec')&&e.textContent.startsWith('Tiles'));return h.slice(i+1).map(e=>e.dataset.sprite)})()")
        ck('each tile is its own named picture (no "tiles" sheet)', 'grass' in names and 'water' in names and 'tiles' not in names, names)
        ck('the water tile shows its tag', 'water' in await ev("document.querySelector('[data-sprite=water] small').textContent"))

        # ---- new tile from the Map palette, paint with it
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(200)
        n0 = await pg.locator('#palette [data-tile]').count()
        ck('the map palette shows one button per tile', n0 == await ev(f"DC2.tileIds({S}.doc.cart,'world').length"), n0)
        await pg.click('#palette [data-newtile]'); await pg.fill('.big-in', 'deep water'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        ck('＋ makes a new tile and opens it for drawing', await ev("!document.querySelector('#artEditor').hidden") and await ev(f"{S}.art.st.id") == 'deep-water', await ev(f"{S}.art.st.id"))
        await pg.click('[data-color="19"]'); await pg.click('#artTools [data-tool=fill]'); await drag(pg, '#artCanvas', (0.4, 0.5), (0.4, 0.5), 1); await pg.wait_for_timeout(150)
        ck('draw on it', await ev(f"{S}.doc.cart.sprites['deep-water'].frames[0].includes('j')"))
        await pg.click('#artBack'); await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(200)
        ck('the new tile is in the map palette', await pg.locator('#palette [data-tile]').count() == n0 + 1)
        newn = await ev(f"{S}.mv.st.tile")
        await pg.click('#tools [data-tool=draw]'); await drag(pg, '#mapCanvas', (0.3, 0.4), (0.3, 0.4), 1); await pg.wait_for_timeout(150)
        ck('painting with it puts that tile in the level', await ev(f"{S}.doc.cart.maps.level1.layers.some(L=>L.rows.join('').includes(DC2.B36[Math.floor({newn}/36)]+DC2.B36[{newn}%36]))"), newn)
        await pg.click('#palette button:has-text("Tile settings")'); await pg.wait_for_timeout(250)
        ck('tile settings include tags', await pg.locator('.sheet:has-text("Tags")').count() == 1)
        ck('and link to edit its picture', await pg.locator('.sheet button:has-text("Edit picture")').count() == 1)
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        ck('project still has no problems', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))

        # ---- copy / paste in the pixel editor
        await pg.click('#tabs [data-tab=art]'); await pg.click('[data-sprite=hero]'); await pg.wait_for_timeout(300)
        await pg.click('#artTools [data-tool=select]'); await drag(pg, '#artCanvas', (0.3, 0.3), (0.6, 0.6)); await pg.wait_for_timeout(150)
        sel = await ev(f"{S}.art.st.sel")
        ck('dragging with Select marks out a rectangle', sel and sel['w'] > 2 and sel['h'] > 2, sel)
        ck('the selection bar offers Copy / Cut / Delete', all([await pg.locator(f'#artClip button:has-text("{t}")').count() for t in ['Copy', 'Cut', 'Delete']]))
        await pg.click('#artClip button:has-text("Copy")')
        await pg.click('#artFrames button[title="blank frame"], #artFrames button:has-text("＋")'); await pg.wait_for_timeout(200)
        f = await ev(f"{S}.art.st.frame")
        ck('switch to a new blank frame', f > 0 and await ev(f"DC2.studio.sprite.decode({S}.art.def,{f}).every(v=>v<0)"), f)
        await pg.click('#artClip button:has-text("Paste")'); await pg.wait_for_timeout(150)
        ck('Paste gives a floating copy with flip and place buttons', await ev(f"!!{S}.art.st.float") and await pg.locator('#artClip button:has-text("Place")').count() == 1)
        fx0 = await ev(f"{S}.art.st.float.x")
        await drag(pg, '#artCanvas', (0.45, 0.45), (0.25, 0.45)); await pg.wait_for_timeout(100)
        ck('drag moves the floating paste', await ev(f"{S}.art.st.float.x") < fx0, [fx0, await ev(f"{S}.art.st.float.x")])
        await pg.click('#artClip button:has-text("↔")')
        await pg.click('#artClip button:has-text("Place")'); await pg.wait_for_timeout(150)
        ck('Place puts it into the new frame', await ev(f"DC2.studio.sprite.decode({S}.art.def,{f}).some(v=>v>=0)"))
        await pg.click('#artUndo'); await pg.wait_for_timeout(150)
        ck('and undo takes it out again', await ev(f"DC2.studio.sprite.decode({S}.art.def,{f}).every(v=>v<0)"))
        await pg.click('#artClip button:has-text("Paste as new sprite")'); await pg.wait_for_timeout(300)
        ck('Paste as new sprite makes a sprite from the clipboard', (await ev(f"{S}.art.st.id")).startswith('hero-part'), await ev(f"{S}.art.st.id"))

        # ---- overlap preview
        await pg.click('#aRef'); await pg.wait_for_timeout(250)
        await pg.click('.sheet [data-ref=slime]'); await pg.wait_for_timeout(200)
        ck('👥 shows another sprite with this one', await ev(f"{S}.art.st.ref && {S}.art.st.ref.id") == 'slime')
        d0 = await ev(f"{S}.art.st.ref.dx")
        await pg.click('.sheet button:text-is("→")'); await pg.click('.sheet button:text-is("→")'); await pg.click('.sheet button:has-text("Behind")'); await pg.wait_for_timeout(100)
        r = await ev(f"{S}.art.st.ref")
        ck('it can be nudged and put behind', r['front'] is False and r['dx'] == d0 + 2, [d0, r])
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        ck('a Move tool appears for dragging it', await pg.locator('#artTools [data-tool=refmove]').count() == 1)
        await pg.click('#artTools [data-tool=refmove]'); dx0 = r['dx']; await drag(pg, '#artCanvas', (0.4, 0.5), (0.6, 0.5)); await pg.wait_for_timeout(100)
        ck('dragging moves it', await ev(f"{S}.art.st.ref.dx") > dx0)
        ck('previewing changes nothing in the game', await ev(f"JSON.stringify({S}.doc.cart).includes('\"ref\"')") is False)
        await pg.screenshot(path='/tmp/ui_overlap.png')

        # ---- an older project (one tile sheet) is upgraded on open, with a restore point first
        await pg.click('#artBack'); await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew')
        old = open(os.path.join(HERE, '..', '..', 'carts', 'flag-of-gold.json')).read()
        await pg.set_input_files('#fileIn', {'name': 'old.json', 'mimeType': 'application/json', 'buffer': old.encode()}); await pg.wait_for_timeout(1200)
        ck('an older project opens with one sprite per tile', await ev(f"!DC2.studio.needsTileSplit({S}.doc.cart) && !{S}.doc.cart.sprites.tiles"))
        ck('and no problems', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))
        snaps = await ev(f"{S}.lib.snapshots({S}.meta.id).then(s=>s.map(x=>x.label))")
        ck('a restore point was saved before the upgrade', any('Before the Studio updated' in s for s in snaps), snaps)
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
