"""Browser checks: the build number is visible, scripts carry it, and missing files are reported instead of leaving a hole."""
import asyncio, re
from playwright.async_api import async_playwright
URL = 'http://localhost:8123/v2/studio.html'
BUILD = open('/home/claude/dc/v2/BUILD').read().strip()
P = F = 0
def ck(n, c, x=''):
    global P, F
    if c: P += 1
    else: F += 1; print('  ✗', n, x)

async def fresh(b, route=None):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []; reqs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: reqs.append(r.url))
    if route: await pg.route(route[0], route[1])
    await pg.goto(URL); await pg.wait_for_selector('#btnNew'); await pg.wait_for_timeout(300)
    return pg, errs, reqs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg, errs, reqs = await fresh(b); ev = pg.evaluate
        scripts = [u for u in reqs if re.search(r'/(studio|ext)/[^/]+\.js|/(kernel|runner|render|mixer|nozoom)\.js', u)]
        ck('the Studio loads its own scripts', len(scripts) >= 20, len(scripts))
        ck('every one of them is requested with the build number (so a new build is never served from an old cache)', all(u.endswith('?v=' + BUILD) for u in scripts), [u for u in scripts if not u.endswith('?v=' + BUILD)][:3])
        ck('and the stylesheet', any(u.endswith('studio.css?v=' + BUILD) for u in reqs))
        ck('the project list shows the build', f'Studio build {BUILD}' in await pg.locator('#buildInfo').text_content(), await pg.locator('#buildInfo').text_content())
        ck('with no warning when everything loaded', await pg.locator('#buildInfo .buildwarn').count() == 0)
        await pg.locator('#buildInfo button:has-text("About")').click(); await pg.wait_for_timeout(250)
        t = await pg.locator('.sheet').inner_text()
        ck('About lists the build and every part as loaded', BUILD in t and '✓ studio/sound-ui.js' in t and '✓ studio/music-ui.js' in t and '✗' not in t, t[:300])
        ck('and offers a fresh reload', await pg.locator('.sheet button:has-text("Reload with the latest files")').count() == 1)
        await pg.locator('.sheet-title [aria-label=close]').last.click()

        # inside a project
        await pg.click('#btnNew'); await pg.fill('.big-in', 'B'); await pg.click('[data-tmpl=flag-of-gold]'); await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        await pg.click('#tabs [data-tab=game]'); await pg.wait_for_timeout(200)
        ck('the Game tab has a button that goes to the sound tools', await pg.locator('#gameBody button:has-text("Make sounds & music")').count() == 1)
        await pg.click('#gameBody button:has-text("Make sounds & music")'); await pg.wait_for_timeout(300)
        ck('which opens the Sound tab', await ev("DC2_STUDIO.tab") == 'sound' and await pg.locator('.sndcard').count() > 5)
        await pg.click('#btnMenu'); await pg.wait_for_timeout(200)
        ck('the project menu has "About this Studio"', await pg.locator('.sheet .menu-item:has-text("About this Studio")').count() == 1)
        await pg.locator('.sheet .menu-item:has-text("About this Studio")').click(); await pg.wait_for_timeout(250)
        ck('which shows the same information', BUILD in await pg.locator('.sheet').inner_text()); await pg.locator('.sheet-title [aria-label=close]').last.click()
        ck('no page errors in the normal case', not errs, errs)
        await pg.context.close()

        # a file that never arrives (not uploaded)
        pg, errs, reqs = await fresh(b, ('**/studio/sound-ui.js*', lambda r: r.abort())); ev = pg.evaluate
        w = await pg.locator('#buildInfo .buildwarn').text_content() if await pg.locator('#buildInfo .buildwarn').count() else ''
        ck('a Studio file that did not load is named on the project list', 'studio/sound-ui.js' in w and 'did not load' in w, w)
        ck('with advice, and a button to reload fresh', 'Upload the whole v2 folder' in w and await pg.locator('#buildInfo .buildwarn button').count() == 1)
        ck('the rest of the app still works', await pg.locator('#btnNew').is_visible())
        await pg.click('#btnNew'); await pg.fill('.big-in', 'M'); await pg.click('[data-tmpl=flag-of-gold]'); await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        await pg.click('#tabs [data-tab=sound]'); await pg.wait_for_timeout(300)
        msg = await pg.locator('#soundGrid').inner_text()
        ck('the Sound tab says its code did not load, instead of failing silently', 'sound tools did not load' in msg and 'studio/sound-ui.js' in msg, msg)
        ck('without throwing errors', not errs, errs)
        await pg.click('#tabs [data-tab=map]'); await pg.wait_for_timeout(200); await pg.click('#tabs [data-tab=things]'); await pg.wait_for_timeout(200)
        ck('other tabs are unaffected', await ev("DC2_STUDIO.tab") == 'things' and not errs, errs)
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew'); await pg.wait_for_timeout(300)
        await pg.locator('#buildInfo .buildwarn button').click(); await pg.wait_for_timeout(600)
        ck('"reload with the latest files" fetches the page from a fresh address (so a cached copy is not used)', any('studio.html?fresh=' in u for u in reqs), [u for u in reqs if 'studio.html' in u])
        await pg.context.close()

        # a file that arrives empty (a stale or damaged copy): caught by checking what it should have provided
        pg, errs, reqs = await fresh(b, ('**/studio/music-ui.js*', lambda r: r.fulfill(status=200, content_type='application/javascript', body='/* empty */')))
        w = await pg.locator('#buildInfo .buildwarn').text_content() if await pg.locator('#buildInfo .buildwarn').count() else ''
        ck('a file that loaded but does not do its job is caught too', 'studio/music-ui.js' in w, w)
        await pg.context.close()
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
