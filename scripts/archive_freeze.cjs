const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'phone-1') + '&auto=1');
  await p.waitForFunction(() => window.__app, null, { timeout: 90000 });
  const town = await p.evaluate(() => {
    const a = window.__app, w = window.__world;
    const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0] || w.H.settlements.find(s => s.id === w.start.settlement);
    const plan = window.__bc.game.planTravel(w, a.g.x, a.g.y, t.x, t.y); window.__bc.game.travel(a.g, w, plan, t.x, t.y, false);
    a.field.x = a.g.x; a.field.y = a.g.y; a.refresh(true); return t.name;
  });
  console.log('travelled to', town);
  await p.tap('.tabs button:has-text("Archive")'); await p.waitForTimeout(300);
  const timeout = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  let maxDt = 0; for (let i = 0; i < 40; i++) {
    const cards = await p.$$('.pane .list .card'); if (!cards.length) { console.log('no docs'); break; }
    const t0 = Date.now(); const ok = await Promise.race([cards[Math.min(i, cards.length - 1)].tap().then(() => true), timeout(8000, false)]);
    const dt = Date.now() - t0;
    if (dt > maxDt) maxDt = dt; if (!ok || dt > 1500) { console.log('SLOW/FROZEN at click', i, dt, 'ms'); console.log(JSON.stringify(await Promise.race([p.evaluate(() => [window.__app.g.day, window.__app.g.minute, window.__app.g.docsRead.length]), timeout(5000, 'evaluate timed out: page frozen')]))); break; }
  }
  console.log("slowest tap ms", maxDt); console.log("done; docs read", await Promise.race([p.evaluate(() => window.__app.g.docsRead.length), timeout(5000, 'frozen')]));
  console.log('ERRS', JSON.stringify(errs.slice(0, 5))); await b.close();
})();
