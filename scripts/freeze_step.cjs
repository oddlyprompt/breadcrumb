// Step-by-step timing of the archive flow on a throttled phone, to find what blocks the main thread.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const port = process.argv[2] || '4173'; const rate = +(process.argv[3] || 6);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/?seed=phone-1&auto=1`); await p.waitForFunction(() => window.__app, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const T = (ms) => new Promise(r => setTimeout(() => r('TIMEOUT'), ms));
  const step = async (label, fn) => { const t0 = Date.now(); const r = await Promise.race([p.evaluate(fn), T(30000)]); console.log(label.padEnd(30), (Date.now() - t0) + ' ms', typeof r === 'string' ? r : JSON.stringify(r)); return r; };
  const frame = () => step('  one animation frame', () => new Promise(res => { const t = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t)))); }));
  await step('travel', () => { const a = window.__app, w = window.__world, G = window.__bc.game; const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0]; const plan = G.planTravel(w, a.g.x, a.g.y, t.x, t.y); G.travel(a.g, w, plan, t.x, t.y, true); a.field.x = a.g.x; a.field.y = a.g.y; a.setView('field'); return t.name; });
  for (let i = 0; i < 4; i++) await frame();
  await step('open archive tab', () => { const a = window.__app; a.tab = 'research'; a.refresh(true); return document.querySelectorAll('.pane .list .card').length; });
  for (let i = 0; i < 12; i++) {
    const r = await step(`read doc ${i}`, () => { const a = window.__app; const cards = document.querySelectorAll('.pane .list .card'); const c = cards[0]; const t0 = performance.now(); c.click(); return { ms: Math.round(performance.now() - t0), day: a.g.day, min: Math.round(a.g.minute), kb: a.g.kb.length }; });
    if (r === 'TIMEOUT') { console.log('BLOCKED'); break; }
    await frame();
  }
  await b.close();
})();
