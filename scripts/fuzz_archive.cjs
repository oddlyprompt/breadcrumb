// Phone-emulated fuzz of the travel -> archive flow with a main-thread watchdog.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const port = process.argv[2] || '4173'; const seed = process.argv[3] || 'phone-1';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/?seed=${seed}&auto=1`); await p.waitForFunction(() => window.__app, null, { timeout: 120000 });
  const timeout = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  const alive = async (label) => { const t0 = Date.now(); const r = await Promise.race([p.evaluate(() => 1), timeout(6000, 0)]); const dt = Date.now() - t0; if (!r || dt > 2000) { console.log('BLOCKED main thread', dt, 'ms after:', label); return false; } return true; };
  // travel through the UI: open the map, pick the biggest archive town, press Travel, ride the bus
  await p.tap('.top button:has-text("Map")'); await p.waitForTimeout(400);
  const tgt = await p.evaluate(() => { const a = window.__app, w = window.__world; const t = w.H.settlements.filter(s => s.current && s.hasArchive && s.id !== w.start.settlement).sort((x, y) => y.pop - x.pop)[0]; const r = a.map.cv.getBoundingClientRect(); a.map.centerOn(t.x, t.y, a.map.scale); return { name: t.name, sx: r.left + a.map.vw / 2, sy: r.top + a.map.vh / 2 }; });
  await p.touchscreen.tap(tgt.sx, tgt.sy); await p.waitForTimeout(400);
  const tb = await p.$('button:has-text("Travel")'); if (!tb) { console.log('no travel button'); } else { await tb.tap(); await p.waitForTimeout(300); const ride = await p.$('.modal button:has-text("Ride")'); const walk = await p.$('.modal button:has-text("Walk")'); await (ride && !(await ride.isDisabled()) ? ride : walk).tap(); }
  console.log('travelled to', tgt.name, await p.evaluate(() => [Math.round(window.__app.g.x), Math.round(window.__app.g.y), window.__app.g.day, window.__app.g.minute]));
  if (!await alive('arrival')) { await b.close(); return; }
  await p.tap('.tabs button:has-text("Archive")'); await p.waitForTimeout(300);
  let n = 0;
  for (let round = 0; round < 60; round++) {
    const els = await p.$$('.pane [data-act], .pane button, .pane select');
    if (!els.length) break; const el = els[(round * 7) % els.length]; const label = (await el.evaluate(e => (e.tagName + ':' + (e.textContent || '').slice(0, 40)).replace(/\s+/g, ' ')));
    if (/Open on the map/.test(label)) { /* exercise the map too */ }
    try { await Promise.race([el.tap({ timeout: 3000 }), timeout(8000)]); } catch { }
    n++; if (!await alive(label)) { console.log('state', await Promise.race([p.evaluate(() => [window.__app.g.day, window.__app.g.minute]), timeout(4000, 'n/a')])); break; }
    if (await p.$('.top button:has-text("Field")')) { await p.tap('.top button:has-text("Field")'); await p.tap('.tabs button:has-text("Archive")'); }
  }
  console.log('taps', n, 'ERRS', JSON.stringify(errs.slice(0, 5))); await b.close();
})();
