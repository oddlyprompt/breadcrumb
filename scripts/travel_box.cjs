// After fast travel from the map, no map panel should remain over the field view.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:4173/?seed=phone-1&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 });
  for (const trip of [0, 1]) {
    await p.tap('.top button:has-text("Map")'); await p.waitForTimeout(400);
    const tgt = await p.evaluate((trip) => { const a = window.__app, w = window.__world; const ts = w.H.settlements.filter(s => s.current && s.kind !== 'farmstead' && Math.hypot(s.x - a.g.x, s.y - a.g.y) > 1500).sort((x, y) => y.pop - x.pop); const t = ts[trip]; const r = a.map.cv.getBoundingClientRect(); a.map.centerOn(t.x, t.y, a.map.scale); return { name: t.name, sx: r.left + a.map.vw / 2, sy: r.top + a.map.vh / 2 }; }, trip);
    await p.touchscreen.tap(tgt.sx, tgt.sy); await p.waitForTimeout(300);
    const boxBefore = await p.$eval('.hud.bl', e => e.innerText.slice(0, 60));
    await p.tap('.hud.bl button:has-text("Travel")'); await p.waitForTimeout(300);
    const btn = (await p.$('.modal button:has-text("Ride")')) || (await p.$('.modal button:has-text("Walk")')); await btn.tap(); await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({ view: window.__app.view, mapInfo: document.querySelector('.hud.bl').innerText, mapBar: document.querySelector('.hud.tr').innerText, modal: !!document.querySelector('.modal') }));
    console.log(`trip ${trip + 1} to ${tgt.name}: box on map = "${boxBefore.replace(/\n/g, ' ')}" -> after arrival`, JSON.stringify(after));
  }
  // the Dig button must be tappable (not covered)
  const dig = await p.$('.toolbar button:has-text("Dig")'); const bb = await dig.boundingBox(); const topEl = await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent?.slice(0, 20), { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  console.log('element at the Dig button:', JSON.stringify(topEl));
  await p.screenshot({ path: out + '/after_travel.png' }); console.log('ERRS', JSON.stringify(errs)); await b.close();
})();
