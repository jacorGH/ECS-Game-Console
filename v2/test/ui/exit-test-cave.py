import asyncio
from playwright.async_api import async_playwright
URL='http://localhost:8123/v2/studio.html'
P=F=0; G=0
def ck(n,c,x=''):
    global P,F
    if c: P+=1
    else: F+=1; print('  ✗',n,x)
async def main():
    global G
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
        ev=pg.evaluate
        async def click(sel,**k):
            global G; G+=1; await pg.click(sel,**k)
        async def cell(x,y): return await ev("""([x,y])=>{const mv=window.DC2_STUDIO.mv,r=mv.cv.getBoundingClientRect(),ts=mv.ts;return {x:r.left+mv.view.x+(x+.5)*ts*mv.view.s,y:r.top+mv.view.y+(y+.5)*ts*mv.view.s}}""",[x,y])
        async def box(a,c):
            global G; G+=1; pa=await cell(*a); pc=await cell(*c)
            await pg.mouse.move(pa['x'],pa['y']); await pg.mouse.down()
            for i in range(1,7): await pg.mouse.move(pa['x']+(pc['x']-pa['x'])*i/6, pa['y']+(pc['y']-pa['y'])*i/6)
            await pg.mouse.up()
        async def tap(x,y):
            global G; G+=1; c=await cell(x,y); await pg.mouse.click(c['x'],c['y'])
        await pg.goto(URL); await pg.wait_for_selector('#btnNew')
        await click('#btnNew'); await pg.fill('.big-in','Cave Test'); await click('[data-tmpl=platformer]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(400)
        G=1  # naming counts as part of the create flow
        print('1. new level')
        await click('#lvlBtn'); await click('text=＋ New level'); await pg.wait_for_selector('.big-in'); await pg.fill('.big-in','Cave'); await pg.keyboard.press('Enter'); G+=1
        await pg.wait_for_timeout(300); await click('#zFit')
        ck('cave level exists with a player start', await ev("!!window.DC2_STUDIO.doc.cart.maps.cave && window.DC2_STUDIO.doc.cart.maps.cave.objects.length===1"))
        print('2. terrain')
        await click('[data-layer="1"]'); await click('[data-tile="3"]'); await click('[data-tool=rect]')
        await box((0,12),(31,13)); await box((0,0),(0,11)); await box((31,0),(31,11)); await box((0,0),(31,1))
        await box((8,9),(11,9)); await box((18,7),(22,7))
        await click('[data-layer="0"]'); await click('[data-tile="6"]'); await box((13,8),(16,8))
        n=await ev("(()=>{const m=window.DC2_STUDIO.doc.cart.maps.cave;let n=0;for(const L of m.layers)for(const r of L.rows)for(let x=0;x<m.w;x++)if(parseInt(r.substr(x*2,2),36)>0)n++;return n})()")
        ck('terrain painted', n==64+64+10+10+4+5+4, n)
        print('3. things')
        await click('#modeSeg [data-mode=things]')
        for prefab,spots in [('coin',[(6,11),(9,8),(20,6)]),('walker',[(14,11)]),('qblock',[(26,8)]),('spikes',[(24,11)]),('goal',[(29,11)])]:
            await click(f'#palette [data-prefab={prefab}]')
            for s in spots: await tap(*s)
        objs=await ev("window.DC2_STUDIO.doc.cart.maps.cave.objects.map(o=>o.prefab)")
        ck('everything placed', sorted(objs)==sorted(['player-side','coin','coin','coin','walker','qblock','spikes','goal']), objs)
        print('4. door in level 1 leading to the cave')
        await click('#tabs [data-tab=things]'); await click('#btnNewThing'); await pg.wait_for_selector('.pick-item'); await click('.pick-item:has-text("Door to another level")'); await pg.wait_for_selector('.sheet'); 
        await click('.sheet-title [aria-label=close]')
        await click('#tabs [data-tab=map]'); await click('#lvlBtn'); await click('[data-scene=level1]'); await pg.wait_for_timeout(200); await click('#zFit')
        await click('#palette [data-prefab=door]'); await tap(27,11)
        door=await ev("window.DC2_STUDIO.doc.cart.maps.level1.objects.find(o=>o.prefab==='door')")
        ck('door placed in level 1', bool(door), door)
        goto=await ev("window.DC2_STUDIO.doc.cart.prefabs.door.rules[0].then.find(a=>a.act==='goto').scene"); ck('goto cave', goto=='cave', goto)
        print('5. play the cave from a chosen spot')
        await click('#lvlBtn'); await click('[data-scene=cave]'); await pg.wait_for_timeout(200); await click('#zFit')
        await click('[data-tool=flag]'); await tap(3,11); await pg.wait_for_timeout(700)
        await click('#tapStart')
        st=await ev("({scene:window.DC2_STUDIO.runner.world.active().name, x:window.DC2_STUDIO.runner.world.player().c.pos.x, g:window.DC2_STUDIO.runner.world.player().r.ground})")
        ck('“play here” starts in the cave at the chosen spot, on the floor', st['scene']=='cave' and abs(st['x']-56)<2 and st['g'], st)
        await pg.keyboard.down('ArrowRight'); await pg.wait_for_timeout(1300); await pg.keyboard.up('ArrowRight')
        coins=await ev("window.DC2_STUDIO.runner.world.vars.coins"); ck('running right collects the first coin', coins>=1, coins)
        await pg.keyboard.down('ArrowRight'); await pg.keyboard.down('z'); await pg.wait_for_timeout(300); await pg.keyboard.up('z'); await pg.wait_for_timeout(300); await pg.keyboard.up('ArrowRight')
        await pg.screenshot(path='/tmp/s4_play.png')
        ck('no runtime errors', await ev("window.DC2_STUDIO.runner.world.errors.length")==0, await ev("window.DC2_STUDIO.runner.world.errors"))
        print('6. the door works (level 1 -> cave, player carried across)')
        await click('#tabs [data-tab=map]'); await click('#lvlBtn'); await click('[data-scene=level1]'); await pg.wait_for_timeout(200)
        await click('#tabs [data-tab=play]'); await pg.wait_for_timeout(300)
        await click('#btnRestart'); await pg.wait_for_timeout(500)   # Play now carries on with the running game; Restart is how to start over
        await ev("(()=>{const w=window.DC2_STUDIO.runner.world,p=w.player(),d=window.DC2_STUDIO.doc.cart.maps.level1.objects.find(o=>o.prefab==='door');p.c.pos.x=d.x;p.c.pos.y=d.y})()")
        await pg.wait_for_timeout(500)
        sc=await ev("window.DC2_STUDIO.runner.world.active().name"); hp=await ev("window.DC2_STUDIO.runner.world.player().c.health.hp")
        ck('touching the door enters the cave', sc=='cave', sc); ck('with the player and their health', hp==6, hp)
        print('7. overall')
        await pg.wait_for_timeout(1000)
        ck('the project has no problems', await ev("window.DC2_STUDIO.report.errors.length")==0, await ev("window.DC2_STUDIO.report.errors"))
        ck('and no warnings', await ev("window.DC2_STUDIO.report.warnings.length")==0, await ev("window.DC2_STUDIO.report.warnings"))
        ck('and it is saved', (await pg.inner_text('#saveState'))=='Saved')
        print(f'   gestures used to build the level, door and test it: {G}')
        # screenshot the finished cave in the editor
        await pg.click('#tabs [data-tab=map]'); await pg.click('#lvlBtn'); await pg.click('[data-scene=cave]'); await pg.wait_for_timeout(200); await pg.click('#zFit'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='/tmp/s4_cave.png')
        print('errors:',errs if errs else 'none'); print(f'{P} passed, {F} failed')
        await b.close()
asyncio.run(main())
