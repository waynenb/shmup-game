import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=(ROOT/"index.html").as_uri()
OUT=str(ROOT/"screenshots")+"/"
results={}; errors=[]
async def snap(pg): return await pg.evaluate("window.__game.snapshot()")
async def newpage(b,url):
    pg=await b.new_page(viewport={'width':480,'height':800})
    pg.on('console', lambda m: errors.append(f"[{url}] console.{m.type}: {m.text}") if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: errors.append(f"[{url}] pageerror: {e}"))
    await pg.route('http://**', lambda route: route.abort())
    await pg.route('https://**', lambda route: route.abort())
    await pg.goto(url); await pg.wait_for_timeout(500); return pg
async def give(pg, idx, t, n=1):
    for _ in range(n):
        await pg.evaluate(f"(()=>{{const p=NV.game.players[{idx}];NV.drop(NV.game,p.x,p.y-5,'{t}')}})()")
        await pg.wait_for_timeout(250)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        # 仅测试脚本注入状态，不添加游戏调试键；file:// 离线验证。
        pg=await newpage(b,BASE)
        assert await pg.evaluate("NV.audio.loaded === true && NV.audio.ready === false")
        muted = await pg.evaluate("NV.audio.muted")
        await pg.keyboard.press('KeyX')
        await pg.wait_for_function("NV.audio.ready === true")
        await pg.keyboard.press('KeyM')
        assert await pg.evaluate("NV.audio.muted") != muted
        await pg.keyboard.press('KeyM')
        assert await pg.evaluate("NV.audio.muted") == muted
        results['audio'] = await pg.evaluate("({...NV.audio})")
        await pg.keyboard.press('Digit2')
        await pg.wait_for_function("NV.game.players.length===2 && NV.game.mode===2")
        assert all(p['lives']==10 for p in (await snap(pg))['players'])
        hud=await pg.evaluate("""(()=>{const c=NV.game.ctx;c.font='12px monospace';return [10,15].map(n=>c.measureText('♥×'+n+'   BOMB 3').width)})()""")
        assert max(hud)<211, hud
        injected=await pg.evaluate("""(()=>{const g=NV.game;g.god=true;g.state='playing';
          NV.beginStage(g,2);g.state='playing';NV.spawnBoss(g);
          Object.assign(g.boss,{y:170,hp:g.boss.maxHp*.5,cursor:2,fire:0});
          NV.updateBoss(g,0);NV.render(g);
          return {skill:window.__game.snapshot().bossSkill,left:g.boss.warning.left,bullets:g.bullets.length};})()""")
        assert injected['skill']=='laser', injected
        assert injected['left']>=1 and injected['bullets']==0, injected
        await pg.wait_for_timeout(150)
        assert (await snap(pg))['bossSkill']=='laser'
        assert await pg.evaluate("NV.game.state==='playing' && NV.game.boss.phase===2 && NV.game.boss.warning.left>0")
        await pg.screenshot(path=OUT+'boss_skills.png')
        results['boss_skills']=await snap(pg)
        injected=await pg.evaluate("""(()=>{const g=NV.game;g.god=true;
          NV.beginStage(g,3);g.state='playing';NV.spawnBoss(g);
          Object.assign(g.boss,{y:170,hp:g.boss.maxHp*.2,cursor:4,fire:0});
          NV.updateBoss(g,0);NV.render(g);
          return {skill:window.__game.snapshot().bossSkill,left:g.boss.warning.left,bullets:g.bullets.length};})()""")
        assert injected['skill']=='wall', injected
        assert injected['left']>=1 and injected['bullets']==0, injected
        # 等待真实帧结束预警，再让弹幕墙下移约 0.6 秒。
        await pg.wait_for_function('NV.game.boss.warning===null')
        await pg.wait_for_timeout(600)
        assert (await snap(pg))['bossSkill']=='wall'
        assert await pg.evaluate("NV.game.state==='playing' && NV.game.boss.phase===3 && NV.game.boss.warning===null && NV.game.bullets.length>0")
        await pg.screenshot(path=OUT+'boss_skills_wall.png')
        results['boss_skills_wall']=await snap(pg)
        results['hud_widths']=hud
        await pg.close()
        if '--skills-only' in sys.argv:
            await b.close()
            print(json.dumps(results,ensure_ascii=False)); assert not errors, errors
            return
        # 1 menu + single (normal URL, no debug)
        pg=await newpage(b,BASE)
        await pg.screenshot(path=OUT+"01_menu.png")
        await pg.keyboard.press('Digit1')
        await pg.wait_for_function("NV.game.players.length===1 && NV.game.mode===1")
        await pg.wait_for_timeout(300)
        await pg.keyboard.down('Space')
        s0=await snap(pg)
        assert s0["players"][0]["lives"]==10
        # move around while firing, wait for natural drop
        found=False
        for i in range(120):
            k='KeyA' if (i//8)%2==0 else 'KeyD'
            await pg.keyboard.down(k); await pg.wait_for_timeout(250); await pg.keyboard.up(k)
            s=await snap(pg)
            if i==24: await pg.screenshot(path=OUT+"02_single_play.png"); results['single']=s
            if s['pickups']>0 and i>24 and not found:
                found=True; await pg.screenshot(path=OUT+"03_natural_drop.png"); results['natural_drop']=s
            if found and i>30: break
        results['single_start']=s0; results['single_end']=await snap(pg)
        await pg.keyboard.up('Space')
        await pg.keyboard.press('KeyP')
        await pg.wait_for_function("NV.game.state==='paused'")
        await pg.wait_for_timeout(300)
        results['paused']=await snap(pg); await pg.screenshot(path=OUT+"04_paused.png")
        await pg.keyboard.press('KeyP')
        await pg.wait_for_function("NV.game.state!=='paused'")
        await pg.wait_for_timeout(300)
        # idle until game over (natural)
        for i in range(240):
            await pg.wait_for_timeout(500)
            if (await snap(pg))['state']=='gameover': break
        results['gameover']=await snap(pg); await pg.screenshot(path=OUT+"05_gameover.png")
        await pg.keyboard.press('KeyR')
        await pg.wait_for_function("NV.game.state==='menu' && NV.game.players.length===0")
        await pg.wait_for_timeout(400)
        results['after_restart']=await snap(pg)
        await pg.close()
        # 2 co-op normal
        pg=await newpage(b,BASE)
        await pg.keyboard.press('Digit2')
        await pg.wait_for_function("NV.game.players.length===2 && NV.game.mode===2")
        await pg.wait_for_timeout(300)
        await pg.keyboard.down('Space'); await pg.keyboard.down('Enter')
        for i in range(20):
            await pg.keyboard.down('KeyA'); await pg.keyboard.down('ArrowRight'); await pg.wait_for_timeout(150)
            await pg.keyboard.up('KeyA'); await pg.keyboard.up('ArrowRight')
            await pg.keyboard.down('KeyW'); await pg.keyboard.down('ArrowUp'); await pg.wait_for_timeout(100)
            await pg.keyboard.up('KeyW'); await pg.keyboard.up('ArrowUp')
        await pg.screenshot(path=OUT+"06_coop.png"); results['coop']=await snap(pg)
        await pg.keyboard.press('KeyQ'); await pg.wait_for_timeout(120)
        await pg.screenshot(path=OUT+"07_bomb.png"); results['after_bomb']=await snap(pg)
        await pg.close()
        # 3 debug: pickups + weapons
        pg=await newpage(b,BASE+"?debug=1&mode=2&god=1")
        await pg.wait_for_timeout(2500)
        await pg.keyboard.press('KeyU'); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT+"08_debug_pickups_spawned.png"); results['debug_pickups']=await snap(pg)
        await pg.wait_for_timeout(2500); results['after_all_pickups']=await snap(pg)
        await pg.screenshot(path=OUT+"09_pickup_toasts.png")
        # P1 spread LV3, P2 laser LV3
        await give(pg,0,'S',3); await give(pg,1,'L',3)
        await pg.keyboard.down('Space'); await pg.keyboard.down('Enter'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT+"10_spread3_laser3.png"); results['spread3_laser3']=await snap(pg)
        await pg.keyboard.up('Space'); await pg.keyboard.up('Enter')
        await give(pg,0,'M',3); await give(pg,1,'N',1)
        await pg.keyboard.down('Space'); await pg.keyboard.down('Enter'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT+"11_homing3_normal.png"); results['homing_normal']=await snap(pg)
        # level-1 vs level-2 comparison: P1 spread lv1
        await pg.keyboard.up('Space'); await pg.keyboard.up('Enter')
        await give(pg,0,'S',1); await give(pg,1,'S',1)
        await pg.keyboard.down('Space'); await pg.keyboard.down('Enter'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT+"12_switch_spread.png"); results['switch_spread']=await snap(pg)
        # boss + stage transition
        await pg.keyboard.press('KeyB'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT+"13_boss_stage1.png"); results['boss1']=await snap(pg)
        for _ in range(30):
            await pg.keyboard.press('KeyK'); await pg.wait_for_timeout(100)
            if (await snap(pg))['state']=='clear': break
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+"14_stage_clear.png"); results['clear1']=await snap(pg)
        for i in range(60):
            await pg.wait_for_timeout(100)
            s=await snap(pg)
            if s['state']=='intro': break
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT+"15_stage2_intro.png"); results['intro2']=await snap(pg)
        await pg.wait_for_timeout(3000)
        await pg.screenshot(path=OUT+"16_stage2_play.png"); results['play2']=await snap(pg)
        # stage 2 boss -> stage 3 (via kill), then stage3 boss -> victory
        for st in (2,3):
            await pg.keyboard.press('KeyB'); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=OUT+f"17_boss_stage{st}.png"); results[f'boss{st}']=await snap(pg)
            for _ in range(40):
                await pg.keyboard.press('KeyK'); await pg.wait_for_timeout(100)
                if (await snap(pg))['state']!='playing': break
            for i in range(80):
                await pg.wait_for_timeout(100)
                s=await snap(pg)
                if s['state'] in ('intro','victory'): break
            await pg.wait_for_timeout(500)
            results[f'after_boss{st}']=await snap(pg)
            await pg.screenshot(path=OUT+f"18_after_boss{st}.png")
        await pg.close()
        await b.close()
    print(json.dumps(results,ensure_ascii=False,indent=0))
    print("ERRORS:",errors)
    assert not errors, errors
asyncio.run(main())
