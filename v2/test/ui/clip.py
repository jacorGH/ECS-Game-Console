"""Browser checks: copy, cut and paste of rules and Do statements with real taps."""
import asyncio, json
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
        await ctx.add_init_script("window.__sysclip = null; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__sysclip = t; return Promise.resolve(); } }, configurable: true }); } catch (e) {}")
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e) + ' :: ' + str(getattr(e, 'stack', ''))[:300]))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'status of 403' not in m.text else None)
        ev = pg.evaluate; S = 'window.DC2_STUDIO'
        await pg.goto(URL); await pg.wait_for_selector('#btnNew'); await ev("localStorage.removeItem('dc2.clip')")
        await pg.click('#btnNew'); await pg.fill('.big-in', 'Clip test'); await pg.click('[data-tmpl=flag-of-gold]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(300)
        hero = await ev(f"{S}.doc.cart.meta.player")
        async def rules(pid): return await ev(f"({S}.doc.cart.prefabs['{pid}'].rules || []).map(r => r.on)")
        async def clip(): return await ev("JSON.parse(localStorage.getItem('dc2.clip') || 'null')")
        async def errors(): return await ev(f"DC2.studio.check({S}.doc.cart).errors.map(e => e.path + ': ' + e.msg)")
        async def toast(): return await pg.locator('#toast').text_content()
        async def open_thing(pid): await ev(f"{S}.closeAllSheets(); {S}.openThing('{pid}')"); await pg.wait_for_timeout(350)
        async def menu_of(sel, nth=0): await pg.locator(f'.sheet {sel} > .card-h button[title^="copy, cut, paste"]').nth(nth).click(); await pg.wait_for_timeout(200)
        async def items(): return await ev("[...document.querySelectorAll('.sheet .pick-item')].map(b => b.querySelector('b') ? b.querySelector('b').textContent : b.textContent.split('\\n')[0])")
        async def choose(text): await pg.locator(f'.sheet .pick-item:has-text("{text}")').first.click(); await pg.wait_for_timeout(250)
        async def close_sheets():
            while await pg.locator('.sheet-title [aria-label=close]').count(): await pg.locator('.sheet-title [aria-label=close]').last.click(); await pg.wait_for_timeout(60)

        # ============================================================ rules
        await open_thing(hero)
        r0 = await rules(hero); ck('the player has rules to work with', len(r0) >= 3, r0)
        card = '.rules > .card.rule'
        await menu_of(card, 0)
        names = await items()
        ck('every rule has a ⋯ menu with copy, cut, duplicate, delete and paste-from-text', all(any(t in n for n in names) for t in ['Copy this rule', 'Cut this rule', 'Duplicate', 'Paste a rule from text', 'Delete this rule']), names)
        ck('with nothing copied yet there is no "paste below"', not any('below' in n for n in names), names)
        await choose('Copy this rule')
        c = await clip()
        ck('Copy puts the rule on the clipboard (kept in the browser)', c and c['kind'] == 'rule' and c['items'][0]['on'] == r0[0], c)
        ck('and tells you', 'Copied the rule' in await toast(), await toast())
        sc = json.loads(await ev("window.__sysclip || 'null'") or 'null')
        ck('and also puts it on the device clipboard as text', sc and sc['items'][0]['on'] == r0[0], sc)
        ck('copying changed nothing', await rules(hero) == r0)
        await open_thing('slime'); s0 = await rules('slime')
        pb = pg.locator('.sheet .rules > button.add:has-text("Paste")')
        ck('another thing now offers to paste it, by name', await pb.count() == 1 and f'rule “{r0[0]}”' in await pb.text_content(), await pb.text_content())
        u0 = await ev(f"{S}.doc.undos.length"); await pb.click(); await pg.wait_for_timeout(300)
        s1 = await rules('slime')
        ck('pasting adds it to the end of that thing\'s rules', s1 == s0 + [r0[0]], s1)
        ck('as one undo step', await ev(f"{S}.doc.undos.length") == u0 + 1)
        ck('and says what it did', 'Pasted rule' in await toast(), await toast())
        ck('the rule you copied is still where it was', await rules(hero) == r0)
        ck('the project is still valid', await errors() == [], await errors())
        await pg.locator('.sheet .sh-undo').last.click(); await pg.wait_for_timeout(300)
        ck('Undo takes the pasted rule away', await rules('slime') == s0)
        await pg.locator('.sheet .sh-redo').last.click(); await pg.wait_for_timeout(300)

        # paste below a rule
        await open_thing('slime'); await menu_of(card, 0); names = await items()
        ck('a rule menu offers "paste below" once something is copied', any('Paste rule' in n and 'below' in n for n in names), names)
        await choose('Paste rule'); s2 = await rules('slime')
        ck('which puts it right after that rule', s2[1] == r0[0] and len(s2) == len(s1) + 1, s2)

        # cut
        await open_thing(hero); await menu_of(card, 1); await choose('Cut this rule')
        ck('Cut takes the rule out of here', await rules(hero) == [r0[0]] + r0[2:], await rules(hero))
        c = await clip(); ck('and keeps it on the clipboard', c['kind'] == 'rule' and c['items'][0]['on'] == r0[1], c)
        await open_thing('slime'); n_s = len(await rules('slime')); await pg.locator('.sheet .rules > button.add:has-text("Paste")').click(); await pg.wait_for_timeout(250)
        ck('so it can be pasted somewhere else: a move', (await rules('slime'))[-1] == r0[1] and len(await rules('slime')) == n_s + 1)
        await pg.locator('.sheet .sh-undo').last.click(); await pg.wait_for_timeout(250); await pg.locator('.sheet .sh-undo').last.click(); await pg.wait_for_timeout(250)
        ck('Undo puts the cut rule back where it was', await rules(hero) == r0, await rules(hero))

        # duplicate
        await open_thing('slime'); sd = await rules('slime'); await menu_of(card, 0); await choose('Duplicate'); sd2 = await rules('slime')
        ck('Duplicate makes a copy right below', len(sd2) == len(sd) + 1 and sd2[0] == sd2[1] == sd[0], sd2)

        # restrictions
        await ev(f"{S}.doc.cart.prefabs['{hero}'].rules.push({{ on: 'touch', with: 'coin', then: [] }}); {S}.doc.set(['meta','title'], {S}.doc.cart.meta.title + '')")
        await open_thing(hero); k = len(await rules(hero)) - 1
        await menu_of(card, k); await choose('Copy this rule'); await close_sheets()
        await pg.click('#tabs [data-tab=game]'); await pg.wait_for_timeout(200)
        await pg.locator('#gameBody .lvl-row:has(b:text-is("cave")) button:has-text("Settings")').click(); await pg.wait_for_timeout(300)
        lp = pg.locator('.sheet .rules > button.add:has-text("Paste")'); ck('a level\'s rule list offers to paste it', await lp.count() == 1, await lp.count())
        n_l = await ev(f"({S}.doc.cart.scenes.cave.rules || []).length"); await lp.click(); await pg.wait_for_timeout(250)
        ck('but a "touch" rule does not belong on a level, and you are told why', 'work on things, not on levels' in await toast() and await ev(f"({S}.doc.cart.scenes.cave.rules || []).length") == n_l, await toast())
        await close_sheets()
        await open_thing(hero); await menu_of(card, 0); await choose('Copy this rule'); await close_sheets()
        await pg.locator('#gameBody .lvl-row:has(b:text-is("cave")) button:has-text("Settings")').click(); await pg.wait_for_timeout(300)
        await pg.locator('.sheet .rules > button.add:has-text("Paste")').click(); await pg.wait_for_timeout(250)
        ck('a button rule can go on a level', await ev(f"({S}.doc.cart.scenes.cave.rules || []).length") == n_l + 1 and await errors() == [], await errors())
        await close_sheets()

        # ============================================================ Do statements
        await open_thing(hero)
        acts = lambda pid, i: ev(f"({S}.doc.cart.prefabs['{pid}'].rules[{i}].then || []).map(a => a.act)")
        a0 = await acts(hero, 0); ck('the first rule does something', len(a0) >= 1, a0)
        r0card = pg.locator('.sheet .rules > .card.rule').nth(0)
        await r0card.locator('.actions > .card.action').nth(0).locator('button[title^="copy, cut, paste"]').click(); await pg.wait_for_timeout(200)
        names = await items(); ck('a Do statement has its own ⋯ menu', any('Copy this' in n for n in names) and any('Cut this' in n for n in names) and any(n == 'Duplicate' for n in names) and any('Delete' in n for n in names), names)
        await choose('Copy this')
        c = await clip(); ck('copying one puts an "actions" item on the clipboard', c['kind'] == 'actions' and c['items'][0]['act'] == a0[0], c)
        ck('it says what it copied', 'Copied the action' in await toast(), await toast())
        # paste into another rule's Then
        await ev(f"{S}.doc.cart.prefabs['slime'].rules.push({{ on: 'every', t: 5, then: [] }}); {S}.doc.set(['meta','title'], {S}.doc.cart.meta.title + '')")
        await open_thing('slime'); sk = len(await rules('slime')) - 1
        pa = pg.locator('.sheet .rules > .card.rule').nth(sk).locator('.actions > button.add:has-text("Paste")')
        ck('an empty "Then" offers to paste it', await pa.count() == 1 and f'action “{a0[0]}”' in await pa.text_content(), await pa.text_content() if await pa.count() else '')
        await pa.click(); await pg.wait_for_timeout(250)
        ck('and it lands there', (await acts('slime', sk)) == [a0[0]], await acts('slime', sk))
        ck('the original is unchanged', await acts(hero, 0) == a0)
        # paste below, duplicate
        await pg.locator('.sheet .rules > .card.rule').nth(sk).locator('.actions > .card.action').nth(0).locator('button[title^="copy, cut, paste"]').click(); await pg.wait_for_timeout(200)
        names = await items(); ck('an action menu offers "paste below" with something copied', any('below' in n for n in names), names)
        await choose('Paste action'); ck('which adds a second one after it', await acts('slime', sk) == [a0[0], a0[0]], await acts('slime', sk))
        await pg.locator('.sheet .rules > .card.rule').nth(sk).locator('.actions > .card.action').nth(0).locator('button[title^="copy, cut, paste"]').click(); await pg.wait_for_timeout(200)
        await choose('Duplicate'); ck('Duplicate adds a copy below', len(await acts('slime', sk)) == 3)
        await pg.locator('.sheet .rules > .card.rule').nth(sk).locator('.actions > .card.action').nth(0).locator('button[title^="copy, cut, paste"]').click(); await pg.wait_for_timeout(200)
        names = await items(); ck('with several in a list there is "Copy all"', any('Copy all 3' in n for n in names), names)
        await choose('Copy all 3'); c = await clip(); ck('which copies the whole list', c['kind'] == 'actions' and len(c['items']) == 3, c and len(c['items']))
        await open_thing(hero)
        pa = pg.locator('.sheet .rules > .card.rule').nth(0).locator('.actions > button.add:has-text("Paste")'); ck('the button says how many', '3 actions' in await pa.text_content(), await pa.text_content())
        n_h = len(await acts(hero, 0)); await pa.click(); await pg.wait_for_timeout(250)
        ck('they all go in, in order', len(await acts(hero, 0)) == n_h + 3 and (await acts(hero, 0))[-3:] == [a0[0]] * 3)
        # cut an action
        n_h = len(await acts(hero, 0)); await pg.locator('.sheet .rules > .card.rule').nth(0).locator('.actions > .card.action').nth(n_h - 1).locator('button[title^="copy, cut, paste"]').click(); await pg.wait_for_timeout(200); await choose('Cut this')
        ck('Cut removes the action here and keeps it', len(await acts(hero, 0)) == n_h - 1 and (await clip())['items'][0]['act'] == a0[0])
        await pg.locator('.sheet .sh-undo').last.click(); await pg.wait_for_timeout(250); ck('and Undo restores it', len(await acts(hero, 0)) == n_h)
        # rule menu: copy / paste its Then
        await open_thing(hero); await menu_of('.rules > .card.rule', 0); names = await items()
        ck('a rule menu can copy just its Do statements', any('Copy its' in n for n in names), names)
        await choose('Copy its'); c = await clip(); ck('as actions', c['kind'] == 'actions' and len(c['items']) == n_h, c)
        await menu_of('.rules > .card.rule', 1); names = await items()
        ck('and paste actions into another rule\'s Then from its menu', any('at the end of' in n for n in names), names)
        n1 = len(await acts(hero, 1)); await choose('at the end of'); ck('which adds them', len(await acts(hero, 1)) == n1 + n_h)

        # ============================================================ text
        await open_thing('slime'); await menu_of('.rules > .card.rule', 0); await choose('Paste a rule from text')
        ck('"Paste from text" opens a box', await pg.locator('.sheet textarea.clip-text').count() == 1)
        ta = pg.locator('.sheet textarea.clip-text'); s_before = await rules('slime')
        await ta.fill('this is not json'); await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(200)
        ck('text that is not JSON is refused with a reason', 'not valid JSON' in await toast() and await rules('slime') == s_before, await toast())
        await ta.fill(json.dumps({'act': 'sound', 'id': 'coin'})); await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(200)
        ck('an action pasted where a rule is wanted is refused, kindly', 'Do statement' in await toast() and await rules('slime') == s_before, await toast())
        await ta.fill('```json\n' + json.dumps({'on': 'every', 't': 9, 'then': [{'act': 'sound', 'id': 'coin'}]}, indent=2) + '\n```')
        await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(300)
        s3 = await rules('slime'); ck('a rule from a chat (with code fences) is pasted below the one you were on', s3[1] == 'every' and len(s3) == len(s_before) + 1, s3)
        ck('and the box closes', await pg.locator('.sheet textarea.clip-text').count() == 0)
        await close_sheets(); await ev("DC2.studio.clip.clear()"); await open_thing('slime')
        pt = pg.locator('.sheet .rules > .card.rule').nth(1).locator('.actions > button.add:has-text("Paste from text")'); ck('with nothing copied, a list offers "Paste from text…" instead', await pt.count() == 1)
        await pt.click(); await pg.wait_for_timeout(250); ck('which opens the box for an action', await pg.locator('.sheet textarea.clip-text').count() == 1 and 'Do statement' in await pg.locator('.sheet .sheet-title').last.text_content())
        n_a = len(await ev(f"{S}.doc.cart.prefabs['slime'].rules[1].then")); await pg.locator('.sheet textarea.clip-text').fill('[{"act":"wait","t":0.5},{"act":"sound","id":"coin"}]'); await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(250)
        ck('and several actions typed in are added together', len(await ev(f"{S}.doc.cart.prefabs['slime'].rules[1].then")) == n_a + 2)
        await close_sheets()
        # problems and extensions
        await open_thing('slime'); await menu_of('.rules > .card.rule', 0); await choose('Paste a rule from text')
        await pg.locator('.sheet textarea.clip-text').fill(json.dumps({'on': 'button', 'button': 'a', 'then': [{'act': 'sound', 'id': 'a-sound-this-game-lacks'}]})); await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(300)
        ck('a pasted rule that points at something missing says so', "doesn't have yet" in await toast(), await toast())
        await menu_of('.rules > .card.rule', 0); await choose('Paste a rule from text')
        had = await ev(f"{S}.doc.cart.meta.extensions.includes('stealth')")
        await pg.locator('.sheet textarea.clip-text').fill(json.dumps({'on': 'spotted', 'then': [{'act': 'log', 'text': 'x'}]})); await pg.locator('.sheet button:has-text("Paste")').last.click(); await pg.wait_for_timeout(300)
        ck('pasting a stealth rule turns stealth on for this project', not had and await ev(f"{S}.doc.cart.meta.extensions.includes('stealth')"))
        await close_sheets()

        # ============================================================ it lasts
        await ev("localStorage.setItem('dc2.clip', JSON.stringify({ dcClip: 1, kind: 'rule', items: [{ on: 'button', button: 'b', then: [{ act: 'log', text: 'hello' }] }] }))")
        await pg.reload(); await pg.wait_for_timeout(1200)
        if await pg.locator('#screenEditor:not([hidden])').count() == 0:
            await pg.wait_for_selector('#btnNew'); await pg.click('#projList .proj, #projList > * >> nth=0'); await pg.wait_for_selector('#screenEditor:not([hidden])')
        await pg.wait_for_timeout(400)
        await open_thing('slime')
        ck('after closing and reopening the app the copied rule is still there to paste', await pg.locator('.sheet .rules > button.add:has-text("Paste rule")').count() == 1)
        await close_sheets()
        # another project
        await pg.click('#btnBack'); await pg.wait_for_selector('#btnNew'); await pg.click('#btnNew'); await pg.fill('.big-in', 'Other'); await pg.click('[data-tmpl=platformer]')
        await pg.wait_for_selector('#screenEditor:not([hidden])'); await pg.wait_for_timeout(400)
        pl = await ev(f"{S}.doc.cart.meta.player"); await open_thing(pl)
        pbtn = pg.locator('.sheet .rules > button.add:has-text("Paste rule")'); ck('a different project can paste it too', await pbtn.count() == 1)
        n_o = len(await rules(pl)); await pbtn.click(); await pg.wait_for_timeout(300)
        ck('and it arrives', len(await rules(pl)) == n_o + 1 and (await rules(pl))[-1] == 'button')
        print('page errors:', errs or 'none'); ck('no page errors', not errs, errs)
        print(f'{P} passed, {F} failed'); await b.close()
asyncio.run(main())
