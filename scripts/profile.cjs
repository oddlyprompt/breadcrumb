const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4173/?seed=phone-1&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 });
  await p.evaluate(() => { const a = window.__app, w = window.__world, G = window.__bc.game; const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0]; const plan = G.planTravel(w, a.g.x, a.g.y, t.x, t.y); G.travel(a.g, w, plan, t.x, t.y, false); a.field.x = a.g.x; a.field.y = a.g.y; a.refresh(true); });
  await p.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); await p.waitForTimeout(3000); const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n])); const dt = profile.timeDeltas; const samples = profile.samples;
  for (let i = 0; i < samples.length; i++) { const n = byId.get(samples[i]); const k = `${n.callFrame.functionName || '(anon)'} @${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log((v / tot * 100).toFixed(1) + '%', k);
  await b.close();
})();
