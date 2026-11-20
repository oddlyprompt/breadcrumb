const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:4173/?seed=phone-1&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 5 });
  const fps = async (label) => { const r = await p.evaluate(() => new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++; if (now - t0 < 3000) requestAnimationFrame(f); else res({ fps: Math.round(n / ((now - t0) / 1000)), worst: Math.round(worst) }); }; requestAnimationFrame(f); })); console.log(label, JSON.stringify(r)); };
  await fps('start town');
  await p.evaluate(() => { const a = window.__app, w = window.__world, G = window.__bc.game; const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0]; const plan = G.planTravel(w, a.g.x, a.g.y, t.x, t.y); G.travel(a.g, w, plan, t.x, t.y, false); a.field.x = a.g.x; a.field.y = a.g.y; a.refresh(true); });
  await fps('just arrived (loading)'); await fps('arrived, settled');
  await p.tap('.tabs button:has-text("Archive")');
  await p.evaluate(() => { const a = window.__app, w = window.__world, G = window.__bc.game; const docs = w.docs.filter(d => d.holdings.includes(w.H.settlements.find(s => Math.hypot(s.x - a.g.x, s.y - a.g.y) < 50).id)).slice(0, 40); for (const d of docs) { G.readDoc(a.g, w, d); a.selDoc = d.id; a.refresh(); } });
  await fps('after reading 40 docs (past midnight)');
  console.log('day', await p.evaluate(() => window.__app.g.day), 'ERRS', JSON.stringify(errs)); await b.close();
})();
