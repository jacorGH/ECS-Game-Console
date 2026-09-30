"""Browser checks: v1-style Code tab, the ＋ picker, picture pickers, Use ▾ in the pixel editor, effect action."""
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
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in', 'QoL'); await pg.click('[data-tmpl=topdown]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        pl = await ev(f"{S}.doc.cart.meta.player")

        # ---- Code tab, v1 style
        await pg.click('#tabs [data-tab=code]'); await pg.wait_for_timeout(300)
        tb = await ev("[...document.querySelectorAll('#viewCode .toolbar > button, #viewCode .toolbar .seg button, #codeMoreBtn')].map(b=>b.textContent.trim())")
        ck('v1 toolbar: Apply, ▶ Play, Find, A−, A+, More ▾', all(x in tb for x in ['Apply', '▶ Play', 'Find', 'A−', 'A+', 'More ▾']), tb)
        await pg.click('#codeMoreBtn')
        mm = await ev("[...document.querySelectorAll('#codeMore button, #codeMore label')].map(b=>b.textContent.trim())")
        ck('More menu: Restart game, Clean up, Check, Export, Import', mm == ['Restart game', 'Clean up', 'Check', 'Export', 'Import'], mm)
        await pg.click('#codeMoreBtn')
        bg = await ev("getComputedStyle(document.querySelector('.ce')).backgroundColor")
        ck("the editor has v1's light paper look", bg.replace(' ', '') in ('rgb(245,243,250)', 'rgb(255,255,255)') or int(bg[4:].split(',')[0]) > 200, bg)
        col = await ev("""(() => { const k = document.querySelector('.ce-hl .k'), st = document.querySelector('.ce-hl .s'), n = document.querySelector('.ce-hl .n'); return [k, st, n].map(e => e && getComputedStyle(e).color); })()""")
        ck('syntax colours are back: keys, strings and numbers each have their v1 colour', col == ['rgb(91, 63, 158)', 'rgb(44, 110, 73)', 'rgb(179, 84, 30)'], col)
        await pg.click('#codeModBtn'); await pg.wait_for_timeout(150)
        groups = await ev("[...document.querySelectorAll('#codeModPanel h4')].map(h=>h.firstChild.textContent.trim())")
        ck('module picker lists Settings, Scenes, Things, Levels, Sprites, Tilesets, Music', groups == ['Settings', 'Scenes', 'Things', 'Levels', 'Sprites', 'Tilesets', 'Music'], groups)
        await pg.click(f'#codeModPanel [data-mod=\'["prefabs","{pl}"]\']'); await pg.wait_for_timeout(150)
        ck('open one thing on its own', await ev("document.querySelector('#codeModLabel').textContent") == f'Thing › {pl}' and (await ev("document.querySelector('#codeEditor textarea').value")).lstrip().startswith('{\n  "tags"'))
        ck('Rename and Delete appear for single items', await ev("!document.querySelector('#codeModRename').hidden && !document.querySelector('#codeModDelete').hidden"))
        await ev("(()=>{const ta=document.querySelector('#codeEditor textarea'); ta.value=ta.value.replace(/\"speed\": \\d+/, '\"speed\": 99'); ta.dispatchEvent(new Event('input'));})()")
        await pg.click('#codeApply'); await pg.wait_for_timeout(150)
        ck('Apply updates just that thing', await ev(f"{S}.doc.cart.prefabs['{pl}'].c.topdown.speed") == 99)
        await pg.click('#codeModRename'); await pg.fill('.big-in', 'agent'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
        ck('Rename renames it and updates references (the map, the start player)', await ev(f"!!{S}.doc.cart.prefabs.agent && {S}.doc.cart.meta.player==='agent' && {S}.doc.cart.maps.level1.objects.some(o=>o.prefab==='agent')"))
        ck('and still no problems', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))
        await pg.click('#codeModBtn'); await pg.click('#codeModPanel [data-new=prefabs]'); await pg.fill('.big-in', 'crate'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        ck('+ New thing creates it and opens it', await ev(f"!!{S}.doc.cart.prefabs.crate") and 'crate' in await ev("document.querySelector('#codeModLabel').textContent"))
        await pg.click('#codeMoreBtn'); await pg.click('#codeCheck'); await pg.wait_for_timeout(150)
        ck('Check fills the report', await pg.locator('#codeReport li').count() > 0)
        await pg.click('#codeRun'); await pg.wait_for_timeout(500)
        ck('▶ Play applies and goes to Play', await ev(f"{S}.tab") == 'play')
        await pg.screenshot(path='/tmp/ui_v1code.png')

        # ---- the ＋ picker replaces, and offers the right things
        await ev(f"""{S}.doc.set(['prefabs','agent','rules'], ({S}.doc.cart.prefabs.agent.rules||[]).concat([{{on:'button',button:'y',then:[{{act:'set',path:'self.sprite.id',to:"'hero'"}}]}}]))""")
        await pg.click('#tabs [data-tab=things]'); await ev(f"{S}.openThing('agent')"); await pg.wait_for_timeout(400)
        found = await ev("""(() => { const i = [...document.querySelectorAll('.exprrow input')].find(x => x.value === "'hero'"); if (!i) return false; i.parentElement.querySelector('button').click(); return true; })()""")
        ck('found the "to" field of the set action', found)
        await pg.wait_for_timeout(250)
        first = await ev("[...document.querySelectorAll('.sheet')].pop().querySelector('.pick-group').textContent")
        ck('＋ on a picture value offers Pictures first', first == 'Pictures', first)
        ck('with thumbnails', await pg.locator('.pick-item.has-thumb canvas').count() > 2)
        ck('and a Replace / Add to the end choice', await pg.locator('.pickmode button').count() == 2)
        await pg.locator('.pick-item:has(b:text-is("slime"))').first.click(); await pg.wait_for_timeout(200)
        v = await ev(f"{S}.doc.cart.prefabs.agent.rules.slice(-1)[0].then[0].to")
        ck('picking REPLACES the old value', v == "'slime'", v)

        # ---- picture fields are a visual picker
        sp = pg.locator('.spritepick').first
        ck('the Sprite part shows a picture button, not a dropdown', await sp.count() == 1)
        await sp.click(); await pg.wait_for_timeout(200)
        ck('it opens a grid of Sprites and Tiles', await pg.locator('.pick-group:text-is("Sprites")').count() == 1 and await pg.locator('.pick-group:text-is("Tiles")').count() == 1)
        await pg.locator('.pick-item:has(b:text-is("slime"))').click(); await pg.wait_for_timeout(200)
        ck("swapping the thing's picture", await ev(f"{S}.doc.cart.prefabs.agent.c.sprite.id") == 'slime')
        ck('the picture button shows the new name straight away', await ev("document.querySelector('.spritepick b').textContent") == 'slime', await ev("document.querySelector('.spritepick b').textContent"))
        # an Effect whose animation doesn't exist in the newly picked picture
        await ev(f"""(() => {{ const d = {S}.doc, c = d.cart;
          d.set(['sprites','burst'], {{ w: 8, h: 8, palette: Object.keys(c.palettes)[0], frames: [Array(8).fill('4'.repeat(8)).join('/'), Array(8).fill('5'.repeat(8)).join('/')], anims: {{ cut: {{ f: [0, 1], fps: 8 }} }} }});
          d.set(['sprites','puff'], {{ w: 8, h: 8, palette: Object.keys(c.palettes)[0], frames: [Array(8).fill('6'.repeat(8)).join('/')], anims: {{ pop: {{ f: [0], fps: 8 }}, fade: {{ f: [0], fps: 4 }} }} }});
          d.set(['prefabs','agent','rules'], c.prefabs.agent.rules.concat([{{ on: 'button', button: 'x', then: [{{ act: 'effect', sprite: 'burst', anim: 'cut' }}] }}])); }})()""")
        await pg.wait_for_timeout(300)
        n = await ev("document.querySelectorAll('.spritepick').length")
        eff = f'[data-spritepick="prefabs.agent.rules.{await ev(f"{S}.doc.cart.prefabs.agent.rules.length") - 1}.then.0.sprite"]'
        ck('the Effect shows its picture', await pg.locator(eff).count() == 1 and 'burst' in await pg.locator(eff).text_content(), n)
        asel = eff.replace('data-spritepick', 'data-anim').replace('.sprite"]', '.anim"]').replace('[data-anim=', 'select[data-anim=')
        ck('Animation is a dropdown of that picture\'s animations', await ev(f"[...document.querySelector('{asel}').options].map(o=>o.value).join()") == ',cut', await ev(f"!!document.querySelector('{asel}')"))
        await pg.click(eff); await pg.wait_for_timeout(200); await pg.locator('.pick-item:has(b:text-is("puff"))').click(); await pg.wait_for_timeout(300)
        ck('picking another picture updates the button immediately', 'puff' in await pg.locator(eff).text_content())
        ck('the Animation list switches to the new picture\'s animations', await ev(f"[...document.querySelector('{asel}').options].map(o=>o.value).join()") == ',pop,fade', await ev(f"[...document.querySelector('{asel}').options].map(o=>o.value).join()"))
        ck('and the old animation (not in the new picture) is cleared, not left broken', await ev(f"{S}.doc.cart.prefabs.agent.rules.slice(-1)[0].then[0].anim") is None)
        await pg.select_option(asel, 'fade'); await pg.wait_for_timeout(150)
        ck('choosing an animation from the dropdown saves it', await ev(f"{S}.doc.cart.prefabs.agent.rules.slice(-1)[0].then[0].anim") == 'fade')
        await pg.screenshot(path='/tmp/ui_effect.png')
        await pg.locator('button:has-text("Add an action")').first.click(); await pg.wait_for_timeout(200)
        acts = await ev("[...document.querySelectorAll('.pick-item b')].map(b=>b.textContent)")
        ck('Effect and Change picture are in the action list', any('Effect' in a for a in acts) and any('Change picture' in a for a in acts), acts)
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        # Play animation: a dropdown of this thing's animations
        await ev(f"""{S}.doc.set(['prefabs','agent','rules'], {S}.doc.cart.prefabs.agent.rules.concat([{{ on: 'button', button: 'a', then: [{{ act: 'anim', name: 'attack' }}] }}]))"""); await pg.wait_for_timeout(300)
        k = await ev(f"{S}.doc.cart.prefabs.agent.rules.length") - 1
        opts = await ev("(k) => { const s = document.querySelector(`select[data-anim=\"prefabs.agent.rules.${k}.then.0.name\"]`); return s ? [...s.options].map(o => o.value) : null; }", k)
        want = await ev(f"Object.keys({S}.doc.cart.sprites[{S}.doc.cart.prefabs.agent.c.sprite.id].anims)")
        ck('Play animation: a dropdown of the thing\'s own animations', opts is not None and opts[1:1 + len(want)] == want, [opts, want])
        ck('an animation the picture lacks is flagged, not hidden', opts is not None and opts[-1] == 'attack' and await ev("[...document.querySelectorAll('select[data-anim] option')].some(o => /missing/.test(o.textContent))"))
        await pg.locator('.sheet-title [aria-label=close]').last.click()

        # ---- Use ▾ in the pixel editor
        await pg.click('#tabs [data-tab=art]'); await pg.click('[data-sprite=coin]'); await pg.wait_for_timeout(300)
        await pg.click('#artSave'); await pg.wait_for_timeout(200)
        ck('💾 saves right away', 'Saved' in await ev("document.querySelector('#toast').textContent"))
        await pg.click('#artUse'); await pg.wait_for_timeout(150)
        await pg.click('.sheet button:has-text("Make a new thing")'); await pg.fill('.big-in', 'gem'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        ck('Make a new thing: creates it and opens it in Things', await ev(f"!!{S}.doc.cart.prefabs.gem && {S}.doc.cart.prefabs.gem.c.sprite.id==='coin' && {S}.tab==='things'") and await pg.locator('.sheet .sheet-title:has-text("gem")').count() == 1)
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        await pg.click('#tabs [data-tab=art]'); await pg.click('[data-sprite=coin]'); await pg.wait_for_timeout(300)
        await pg.click('#artUse'); await pg.click('.sheet button:has-text("Give this picture")'); await pg.wait_for_timeout(150)
        await pg.locator('.pick-item:has(b:text-is("crate"))').click(); await pg.wait_for_timeout(150)
        ck('Give to a thing: the crate now shows it', await ev(f"{S}.doc.cart.prefabs.crate.c.sprite.id") == 'coin')
        await pg.click('#artUse'); await pg.click('.sheet button:has-text("Make it a tile")'); await pg.wait_for_timeout(200)
        ck('Make it a tile: it joins the tiles', await ev(f"DC2.studio.tileSpriteIds({S}.doc.cart).has('coin')"))
        ck('everything still valid', await ev(f"{S}.report.errors.length") == 0, await ev(f"{S}.report.errors"))
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
