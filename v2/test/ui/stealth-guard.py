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
        await pg.click('#btnNew'); await pg.fill('.big-in','Stealth Test'); await pg.click('[data-tmpl=topdown]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(400)
        await pg.click('#tabs [data-tab=things]'); await pg.click('#btnNewThing'); await pg.wait_for_selector('.pick-item')
        ck('Stealth group appears in the New Thing picker', await pg.locator('.pick-group:has-text("Stealth")').count()>0)
        await pg.click('.pick-item:has(b:text-is("Guard (vision cone)"))'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(300)
        ck('guard recipe added, project valid', await ev("window.DC2_STUDIO.report.errors.length")==0, await ev("window.DC2_STUDIO.report.errors"))
        ck('stealth + ai extensions switched on', await ev("['stealth','ai'].every(e=>window.DC2_STUDIO.doc.cart.meta.extensions.includes(e))"))
        await pg.locator('.sheet-title [aria-label=close]').last.click()
        await pg.click('#tabs [data-tab=map]'); await pg.click('#modeSeg [data-mode=things]'); await pg.wait_for_timeout(200)
        await pg.click('#palette [data-prefab=guard]')
        box = await pg.eval_on_selector('#mapCanvas','e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}')
        await pg.mouse.click(box[0]+box[2]/2, box[1]+box[3]/2-40)
        ck('guard placed on the map', await ev("window.DC2_STUDIO.doc.cart.maps.level1.objects.some(o=>o.prefab==='guard')"))
        await pg.click('#tabs [data-tab=play]'); await pg.wait_for_timeout(700); await pg.click('#tapStart'); await pg.wait_for_timeout(500)
        ck('boots with the guard placed, no errors', await ev("window.DC2_STUDIO.runner.world.errors.length")==0, await ev("window.DC2_STUDIO.runner.world.errors"))
        # walk the player toward the guard so it gets spotted
        await ev("(()=>{const w=window.DC2_STUDIO.runner.world,p=w.player(),g=w.active().ents.find(e=>e.prefab==='guard');p.c.pos.x=g.c.pos.x;p.c.pos.y=g.c.pos.y+40;})()")
        await pg.wait_for_timeout(1200)
        state = await ev("window.DC2_STUDIO.runner.world.active().ents.find(e=>e.prefab==='guard').c.vision.state")
        ck('standing in front of the guard gets it to "alert" during real play', state=='alert', state)
        mode = await ev("window.DC2_STUDIO.runner.world.active().ents.find(e=>e.prefab==='guard').c.ai.mode")
        ck('and its own "spotted" rule switches it to chase', mode=='chase', mode)
        await pg.screenshot(path='/tmp/s8_play.png')
        print('errors:',errs or 'none'); print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
