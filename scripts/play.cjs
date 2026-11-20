const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'alpha') + '&auto=1');
  await p.waitForFunction(() => window.__app, null, { timeout: 90000 }); await p.waitForTimeout(600);
  // 1. buy a detector and trowel through the real UI
  await p.click('.tabs button:has-text("Town")'); await p.waitForTimeout(200);
  await p.evaluate(() => { const g = window.__app.g; g.x = window.__world.start.x; g.y = window.__world.start.y; window.__app.field.x = g.x; window.__app.field.y = g.y; });
  await p.click('.tabs button:has-text("Town")');
  await p.click('.pane .tabs button:has-text("Buy equipment")'); await p.waitForTimeout(150);
  await p.screenshot({ path: out + '/shop.png' });
  const cards = await p.$$eval('.pane .card', cs => cs.map(c => c.textContent.slice(0, 40)));
  await p.click('.pane button[data-id="det1"]'); await p.click('.pane button[data-id="trowel"]'); await p.waitForTimeout(200);
  const cash = await p.evaluate(() => window.__app.g.cash); console.log('cash after buying detector+trowel', cash, 'owned', await p.evaluate(() => JSON.stringify(window.__app.g.owned)));
  // 2. teleport to the richest nearby site for diggable metal targets
  const site = await p.evaluate(() => {
    const app = window.__app, w = window.__world, g = app.g, S = app.S; let best = null;
    for (const s of w.sites.sites) { if (s.access === 'builtup' || s.densityMult <= 0 || Math.hypot(s.x - g.x, s.y - g.y) > 7000 || !['town_common','farm','works','mine','ford','station','beach','town_dump'].includes(s.kind)) continue;
      const arts = window.__bc.artifacts.generateSite(w, s); const m = arts.filter(a => a.depth < 14 && ['copper','bronze','brass','silver','gold','cupronickel'].includes(a.mat)); if (!best || m.length > best.n) best = { id: s.id, n: m.length, x: m[0] ? m[0].x : s.x, y: m[0] ? m[0].y : s.y, name: s.name, kind: s.kind }; }
    g.x = best.x - 1.2; g.y = best.y; app.field.x = g.x; app.field.y = g.y; app.field.ppm = 40; app.setView('field'); return best;
  });
  console.log('site', JSON.stringify(site));
  await p.keyboard.press('q'); await p.waitForTimeout(300);
  // 3. sweep over the target
  const pos = await p.evaluate(() => { const app = window.__app, f = app.field; const t = app.S.targetsNear(f.x, f.y, 3).filter(t => !t.hot && ['copper','bronze','brass','silver','gold','cupronickel'].includes(t.mat)).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0]; const r = f.cv.getBoundingClientRect(); return t ? { sx: r.left + f.vw / 2 + (t.x - f.x) * f.ppm, sy: r.top + f.vh / 2 + (t.y - f.y) * f.ppm, depth: t.depth, mat: t.mat, id: t.art.id } : null; });
  console.log('target', JSON.stringify(pos));
  let reading = null;
  if (pos) { for (let i = 0; i < 30; i++) { await p.mouse.move(pos.sx - 60 + i * 4, pos.sy + (i % 2 ? 6 : -6)); await p.waitForTimeout(25); } reading = await p.evaluate(() => JSON.parse(JSON.stringify(window.__app.field.reading))); await p.screenshot({ path: out + '/detect.png' });
    await p.mouse.move(pos.sx, pos.sy); await p.waitForTimeout(200); await p.mouse.click(pos.sx, pos.sy); await p.waitForTimeout(400); }
  console.log('reading', JSON.stringify(reading), 'finds', await p.evaluate(() => window.__app.g.finds.length));
  await p.screenshot({ path: out + '/after_dig.png' });
  // 4. open pack, select, clean
  await p.click('.tabs button:has-text("Pack")'); await p.waitForTimeout(150);
  const first = await p.$('.pane .find'); if (first) { await first.click(); await p.waitForTimeout(150); const rinse = await p.$('button:has-text("Rinse in water")'); if (rinse) { await rinse.click(); await p.waitForTimeout(100); } await p.screenshot({ path: out + '/pack.png' }); }
  // 5. sell
  await p.click('.tabs button:has-text("Town")'); await p.waitForTimeout(150);
  const sellBtn = await p.$('.pane button:has-text("Sell all offered")'); if (sellBtn) { await sellBtn.click(); await p.waitForTimeout(200); }
  console.log('cash now', await p.evaluate(() => window.__app.g.cash), 'sold', await p.evaluate(() => window.__app.g.stats.sold));
  await p.screenshot({ path: out + '/sell.png' });
  console.log('ERRS', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
