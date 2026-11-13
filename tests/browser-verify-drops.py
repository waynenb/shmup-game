import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=(ROOT/"index.html").as_uri(); OUT=str(ROOT/"screenshots")+"/"
errors=[]; R={}
async def snap(pg): return await pg.evaluate("window.__game.snapshot()")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':480,'height':800})
        pg.on('console', lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in('error','warning') else None)
        pg.on('pageerror', lambda e: errors.append(f"pageerror: {e}"))
        # god only; no debug keys / no spawned items -> natural drops
        await pg.goto(BASE+"?debug=1&mode=1&god=1"); await pg.wait_for_timeout(2500)
        await pg.keyboard.down('Space')
        got=None
        for i in range(500):
            k=['KeyA','KeyD','KeyD','KeyA'][(i//6)%4]
            await pg.keyboard.down(k); await pg.wait_for_timeout(200); await pg.keyboard.up(k)
            s=await snap(pg)
            if s['pickups']>0 and got is None:
                got=s; await pg.screenshot(path=OUT+"03_natural_drop.png"); R['natural_drop']=s; R['natural_drop_iter']=i
            if got and s['players'][0]['weapon']+str(s['players'][0]['level'])!='N1' or (got and s['players'][0]['score']>got['players'][0]['score']+900):
                R['after_natural_pickup']=s; await pg.screenshot(path=OUT+"03b_natural_pickup_effect.png"); break
        await pg.keyboard.up('Space')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        a=await snap(pg); await pg.wait_for_timeout(800); bb=await snap(pg)
        R['paused']=a; R['paused_still']=bb['state']; await pg.screenshot(path=OUT+"04_paused.png")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); R['resumed']=(await snap(pg))['state']
        await b.close()
    print(json.dumps(R,ensure_ascii=False)); print("ERRORS:",errors)
asyncio.run(main())
