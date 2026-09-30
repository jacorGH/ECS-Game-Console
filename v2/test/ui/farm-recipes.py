import asyncio
from playwright.async_api import async_playwright
URL='http://localhost:8123/v2/studio.html'
P=F=0
def ck(n,c,x=''):
    global P,F
    if c: P+=1
    else: F+=1; print('  ✗',n,x)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
        ev=pg.evaluate
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await pg.click('#btnNew'); await pg.fill('.big-in','Farm Test'); await pg.click('[data-tmpl=topdown]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(400)
        await pg.click('#tabs [data-tab=things]'); await pg.click('#btnNewThing'); await pg.wait_for_selector('.pick-item')
        ck('Farming group appears in the New Thing picker', await pg.locator('.pick-group:has-text("Farming")').count()>0)
        await pg.click('.pick-item:has(b:text-is("Day/night clock"))'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(300)
        ck('clock recipe added, project valid', await ev("window.DC2_STUDIO.report.errors.length")==0, await ev("window.DC2_STUDIO.report.errors"))
        ck('time extension switched on', await ev("window.DC2_STUDIO.doc.cart.meta.extensions.includes('time')"))
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        await pg.click('#btnNewThing'); await pg.wait_for_selector('.pick-item'); await pg.click('.pick-item:has(b:text-is("Crop"))'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(300)
        ck('crop recipe added, project valid', await ev("window.DC2_STUDIO.report.errors.length")==0, await ev("window.DC2_STUDIO.report.errors"))
        ck('farm + economy extensions switched on', await ev("['farm','economy'].every(e=>window.DC2_STUDIO.doc.cart.meta.extensions.includes(e))"))
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        await pg.click('#btnNewThing'); await pg.wait_for_selector('.pick-item'); await pg.click('.pick-item:has(b:text-is("Shopkeeper"))'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(300)
        ck('shopkeeper recipe added, project valid', await ev("window.DC2_STUDIO.report.errors.length")==0, await ev("window.DC2_STUDIO.report.errors"))
        ck('gold variable declared', await ev("window.DC2_STUDIO.doc.cart.vars.gold")==10)
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        # place them all on the map and playtest
        await pg.click('#tabs [data-tab=map]'); await pg.click('#modeSeg [data-mode=things]'); await pg.wait_for_timeout(200)
        async def tap_prefab(pid):
            await pg.click(f'#palette [data-prefab={pid}]')
            box = await pg.eval_on_selector('#mapCanvas','e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}')
            await pg.mouse.click(box[0]+box[2]/2+20, box[1]+box[3]/2)
        await tap_prefab('clock')
        await tap_prefab('shopkeeper')
        await tap_prefab('crop')
        placed = await ev("window.DC2_STUDIO.doc.cart.maps.level1.objects.map(o=>o.prefab)")
        ck('all three placed on the level', all(p in placed for p in ['clock','shopkeeper','crop']), placed)
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(700); await pg.click('#tapStart'); await pg.wait_for_timeout(500)
        ck('the game boots and runs with the farm things placed, no errors', await ev("window.DC2_STUDIO.runner.world.errors.length")==0, await ev("window.DC2_STUDIO.runner.world.errors"))
        await pg.screenshot(path='/tmp/s7_play.png')
        print('errors:',errs or 'none'); print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
