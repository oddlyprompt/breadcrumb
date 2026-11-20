// Records main-thread long tasks during travel + archive reading on a throttled phone.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const port = process.argv[2] || '4173'; const seed = process.argv[3] || 'phone-1'; const rate = +(process.argv[4] || 6);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  await p.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); });
  await p.goto(`http://127.0.0.1:${port}/?seed=${seed}&auto=1`); await p.waitForFunction(() => window.__app, null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const mark = async (label) => { const lt = await p.evaluate(() => { const l = window.__lt; window.__lt = []; return l; }); const big = lt.filter(x => x[1] > 300); console.log(label.padEnd(26), 'long tasks:', lt.length, 'longest', Math.max(0, ...lt.map(x => x[1])), 'ms', big.length ? 'over 300ms: ' + big.map(x => x[1]).join(',') : ''); };
  await mark('startup');
  await p.evaluate(() => { const a = window.__app, w = window.__world, G = window.__bc.game; const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0]; const plan = G.planTravel(w, a.g.x, a.g.y, t.x, t.y); G.travel(a.g, w, plan, t.x, t.y, true); a.field.x = a.g.x; a.field.y = a.g.y; a.setView('field'); });
  await p.waitForTimeout(6000); await mark('arrival (6 s)');
  await p.tap('.tabs button:has-text("Archive")'); await p.waitForTimeout(500);
  for (let i = 0; i < 25; i++) { const cards = await p.$$('.pane .list .card'); if (!cards.length) break; await cards[i % cards.length].evaluate(e => e.click()); await p.waitForTimeout(250); }
  await p.waitForTimeout(1000); await mark('25 archive reads');
  await p.waitForTimeout(5000); await mark('idle 5 s afterwards');
  await b.close();
})();
