const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4173/?seed=phone-1&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const a = window.__app, w = window.__world, G = window.__bc.game;
    const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0];
    const plan = G.planTravel(w, a.g.x, a.g.y, t.x, t.y); G.travel(a.g, w, plan, t.x, t.y, false); a.field.x = a.g.x; a.field.y = a.g.y;
    a.tab = 'research'; a.refresh(true);
    const docs = w.docs.filter(d => d.holdings.includes(t.id)).sort((x, y) => x.year - y.year).slice(0, 14); const out = [];
    for (const d of docs) { const t0 = performance.now(); G.readDoc(a.g, w, d); const t1 = performance.now(); a.selDoc = d.id; a.refresh(); const t2 = performance.now(); out.push([d.kind, d.title.slice(0, 30), +(t1 - t0).toFixed(1), +(t2 - t1).toFixed(1), a.g.day, Math.round(a.g.minute)]); }
    return out;
  });
  for (const x of r) console.log(JSON.stringify(x)); await b.close();
})();
