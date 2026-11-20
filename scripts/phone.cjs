const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500); await p.screenshot({ path: out + '/phone_title.png' });
  await p.tap('button:has-text("Begin")'); await p.waitForFunction(() => window.__app, null, { timeout: 90000 }); await p.waitForTimeout(800);
  const before = await p.evaluate(() => [window.__app.field.x, window.__app.field.y]);
  const box = await (await p.$('.viewwrap canvas')).boundingBox();
  await p.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height * 0.3); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => [window.__app.field.x, window.__app.field.y]);
  console.log('tap-to-walk moved', Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1), 'm');
  // buy a detector, detect mode, drag coil, dig
  await p.evaluate(() => { const a = window.__app; window.__bc.game.buyGear(a.g, 'det1'); a.refresh(true); });
  await p.tap('.toolbar button:has-text("Detect")'); await p.waitForTimeout(200);
  const cdp = await ctx.newCDPSession(p); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy + 30 }] });
  for (let i = 0; i < 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 40 + i * 4, y: cy + 30 }] }); await p.waitForTimeout(30); }
  const coil = await p.evaluate(() => { const f = window.__app.field; return Math.hypot(f.coil.x - f.x, f.coil.y - f.y).toFixed(2); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const holes0 = await p.evaluate(() => window.__app.g.stats.dug); await p.tap('.toolbar button:has-text("Dig")'); await p.waitForTimeout(400);
  console.log('coil offset', coil, 'm; dug', holes0, '->', await p.evaluate(() => window.__app.g.stats.dug));
  await p.screenshot({ path: out + '/phone_field.png' });
  await p.tap('.tabs button:has-text("Town")'); await p.waitForTimeout(200); await p.screenshot({ path: out + '/phone_town.png', fullPage: false });
  console.log('ERRS', JSON.stringify(errs.slice(0, 5))); await b.close();
})();
