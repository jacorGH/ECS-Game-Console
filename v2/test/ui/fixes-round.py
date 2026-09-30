"""Browser checks for: no double-tap zoom, Farm + Stealth starters, the Code tab, and opening v1 .json files."""
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://localhost:8123/v2/studio.html'
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, '..', 'fixtures')
P = F = 0
def ck(n, c, x=''):
    global P, F
    if c: P += 1
    else: F += 1; print('  ✗', n, x)

async def power(pg):
    if await pg.locator('#tapStart:not([hidden])').count(): await pg.click('#tapStart')

async def new_game(pg, tmpl, name):
    await pg.click('#btnNew'); await pg.fill('.big-in', name); await pg.click(f'[data-tmpl={tmpl}]')
    await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text and 'fonts.g' not in m.text else None)
        ev = pg.evaluate
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')

        # ---- 1. double-tap zoom
        ta = await ev("['#projList','.bar h1','#studio','body'].map(s=>getComputedStyle(document.querySelector(s)).touchAction)")
        ck('text, panels and the page all block double-tap zoom (touch-action: manipulation)', all(t == 'manipulation' for t in ta), ta)
        await pg.touchscreen.tap(195, 40); await pg.touchscreen.tap(195, 40); await pg.wait_for_timeout(400)
        ck('double-tapping the title does not zoom the page', await ev('visualViewport.scale') == 1, await ev('visualViewport.scale'))
        blocked = await ev("""(() => { const t = document.querySelector('.bar h1'); const mk = () => new TouchEvent('touchend', { cancelable: true, bubbles: true, changedTouches: [new Touch({ identifier: 1, target: t, clientX: 10, clientY: 10 })] });
          t.dispatchEvent(mk()); const e2 = mk(); t.dispatchEvent(e2); return e2.defaultPrevented; })()""")
        ck('a quick second tap on non-button text is stopped (iOS Safari guard)', blocked)
        btnok = await ev("""(() => { const t = document.querySelector('#btnNew'); const mk = () => new TouchEvent('touchend', { cancelable: true, bubbles: true, changedTouches: [new Touch({ identifier: 2, target: t, clientX: 10, clientY: 10 })] });
          t.dispatchEvent(mk()); const e2 = mk(); t.dispatchEvent(e2); return !e2.defaultPrevented; })()""")
        ck('but quick repeated taps on buttons still work', btnok)

        # ---- 2. starters
        await pg.click('#btnNew'); await pg.wait_for_selector('[data-tmpl]')
        tm = await ev("[...document.querySelectorAll('[data-tmpl]')].map(b=>b.dataset.tmpl)")
        ck('New game offers Farm and Stealth', 'farm' in tm and 'stealth' in tm, tm)
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        await new_game(pg, 'farm', 'My Farm')
        ck('farm project opens with no problems', await ev('window.DC2_STUDIO.report.errors.length') == 0)
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(600); await power(pg); await pg.wait_for_timeout(500)
        hud = await ev('window.DC2_STUDIO.runner.world.hudItems().map(h=>h.text)')
        ck('farm HUD shows day, gold, seeds', hud and hud[0].startswith('DAY 1') and 'SEEDS 3' in hud[2], hud)
        await ev("""(async () => { const b = document.querySelector('[data-face=x]').getBoundingClientRect(), z = document.querySelector('#faceZone');
          const o = { pointerId: 7, pointerType: 'touch', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true };
          z.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise(r => setTimeout(r, 150)); z.dispatchEvent(new PointerEvent('pointerup', o)); })()""")
        await pg.wait_for_timeout(300)
        hud2 = await ev('window.DC2_STUDIO.runner.world.hudItems().map(h=>h.text)')
        ck('pressing the on-screen X button plants a seed', 'SEEDS 2' in hud2[2], hud2)
        await pg.screenshot(path='/tmp/ui_farm.png')
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew')
        await new_game(pg, 'stealth', 'My Infiltration')
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(600); await power(pg); await pg.wait_for_timeout(900)
        ck('stealth level runs with 4 guards and no errors', await ev("(()=>{const w=window.DC2_STUDIO.runner.world;return w.errors.length===0&&w.active().ents.filter(e=>e.c.vision).length===4})()"))
        px = await ev("""(() => { const R = window.DC2_STUDIO.runner, w = R.world, c = document.querySelector('#playCanvas'), g = c.getContext('2d'), gs = w.active().ents.filter(e => e.c.vision);
          R.draw(); const on = g.getImageData(0, 0, c.width, c.height).data; gs.forEach(e => e.c.vision.show = false); R.draw(); const off = g.getImageData(0, 0, c.width, c.height).data; gs.forEach(e => e.c.vision.show = true);
          let n = 0; for (let i = 0; i < on.length; i += 4) if (on[i] !== off[i] || on[i + 1] !== off[i + 1]) n++; return n; })()""")
        ck('vision cones are drawn on screen', px > 400, px)
        await pg.screenshot(path='/tmp/ui_stealth.png')

        # ---- 3. code tab (v1 layout; deeper checks in qol.py)
        await pg.click('#tabs [data-tab=code]'); await pg.wait_for_timeout(300)
        ck('Code tab shows the whole game as JSON', (await ev("document.querySelector('#codeEditor textarea').value")).lstrip().startswith('{'))
        await pg.click('#codeModBtn'); await pg.click('#codeModPanel [data-mod=\'["vars"]\']'); await pg.wait_for_timeout(150)
        await ev("(()=>{const ta=document.querySelector('#codeEditor textarea'); ta.value='{\\n  \"caught\": 7,\\n}'; ta.dispatchEvent(new Event('input'));})()")
        await pg.click('#codeApply'); await pg.wait_for_timeout(200)
        ck('editing Variables and tapping Apply changes the game (trailing comma repaired)', await ev('window.DC2_STUDIO.doc.cart.vars.caught') == 7, await ev('window.DC2_STUDIO.doc.cart.vars'))
        rep = await ev("document.querySelector('#codeReport').textContent")
        ck('the report says what it cleaned up', 'cleaned up' in rep.lower(), rep)
        await pg.click('#btnUndo'); await pg.wait_for_timeout(250)
        ck('the header undo button reverts a code edit', await ev('window.DC2_STUDIO.doc.cart.vars.caught') == 0)
        ck('and the code view follows the undo', '"caught": 0' in await ev("document.querySelector('#codeEditor textarea').value"))
        await ev("(()=>{const ta=document.querySelector('#codeEditor textarea'); ta.value='{\\n  \"caught\": nope nope\\n}'; ta.dispatchEvent(new Event('input'));})()")
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(250)
        ck('broken code keeps you on the Code tab instead of losing it', await ev('window.DC2_STUDIO.tab') == 'code')
        rep = await ev("document.querySelector('#codeReport').textContent")
        ck('and the report points at the line', 'line 2' in rep.lower(), rep)
        await ev("(()=>{const ta=document.querySelector('#codeEditor textarea'); ta.value='{\\n  \"caught\": 3\\n}'; ta.dispatchEvent(new Event('input'));})()")
        await pg.click('#tabs [data-tab=things]'); await pg.wait_for_timeout(250)
        ck('leaving the tab applies good code automatically', await ev('window.DC2_STUDIO.tab') == 'things' and await ev('window.DC2_STUDIO.doc.cart.vars.caught') == 3)
        await pg.click('#tabs [data-tab=code]'); await pg.wait_for_timeout(200)
        ck('the key bar for typing brackets on a phone is there', await pg.locator('.ce-keys button').count() >= 8)
        await pg.screenshot(path='/tmp/ui_code.png')
        ck('code tab: no problems after all that', await ev('window.DC2_STUDIO.report.errors.length') == 0, await ev('window.DC2_STUDIO.report.errors'))

        # ---- 4. opening v1 files
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew')
        await pg.set_input_files('#fileIn', '/tmp/flag-of-gold-v1.json'); await pg.wait_for_timeout(1200)
        ck('a v1 .json opens as a new project', await ev("!document.querySelector('#screenEditor').hidden"))
        ck('the import report appears', await pg.locator('.sheet:has-text("Imported from v1")').count() == 1)
        notes = await pg.locator('.importnote').count()
        ck('it lists what did not come across', notes > 5, notes)
        await pg.screenshot(path='/tmp/ui_import_report.png')
        await pg.click('.sheet button:has-text("Got it")'); await pg.wait_for_timeout(200)
        ck('the imported game has no problems', await ev('window.DC2_STUDIO.report.errors.length') == 0, await ev('window.DC2_STUDIO.report.errors'))
        await power(pg); await pg.wait_for_timeout(300)
        await pg.locator('[data-btn=start]').dispatch_event('pointerdown'); await pg.wait_for_timeout(120); await pg.locator('[data-btn=start]').dispatch_event('pointerup'); await pg.wait_for_timeout(600)
        sc = await ev('window.DC2_STUDIO.runner.world.active().name')
        ck('it plays: Start leaves the title screen for the overworld', sc == 'overworld', sc)
        await pg.screenshot(path='/tmp/ui_import_play.png')
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew')
        await pg.set_input_files('#fileIn', os.path.join(FIX, 'shadow-protocol-v1.json')); await pg.wait_for_timeout(1200)
        ck('a ChatGPT-made v1 game (Shadow Protocol) opens too', await pg.locator('.sheet:has-text("Imported from v1")').count() == 1 and await ev('window.DC2_STUDIO.report.errors.length') == 0)
        await pg.click('.sheet button:has-text("Got it")')
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew')
        await pg.set_input_files('#fileIn', {'name': 'notagame.json', 'mimeType': 'application/json', 'buffer': b'{"hello": 1}'}); await pg.wait_for_timeout(500)
        ck('a JSON file that is not a game gets a clear message', "isn't a Data Console game" in await ev("document.querySelector('#toast').textContent"))
        ck('project list shows all the projects', await pg.locator('#projList .proj, #projList > *').count() >= 4)
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
