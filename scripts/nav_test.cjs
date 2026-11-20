// Phone: signposts in the field, local map, pinch zoom, map buttons.
const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'phone-1') + '&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 }); await p.waitForTimeout(1200);
  console.log('signposts:', JSON.stringify(await p.$$eval('.hud.guide .sign', els => els.map(e => e.textContent))));
  await p.screenshot({ path: out + '/nav_field.png' });
  const before = await p.evaluate(() => [window.__app.field.x, window.__app.field.y]);
  await p.tap('.hud.guide .sign'); await p.waitForTimeout(9000);
  const after = await p.evaluate(() => [window.__app.field.x, window.__app.field.y]);
  console.log('walked toward signpost', Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(0), 'm; signposts now:', JSON.stringify(await p.$$eval('.hud.guide .panel', els => els.map(e => e.innerText.replace(/\n/g, ' | ')))));
  await p.tap('.top button:has-text("Map")'); await p.waitForTimeout(500);
  const sc0 = await p.evaluate(() => ({ s: window.__app.map.scale, across: Math.round(window.__app.map.vw / window.__app.map.scale) }));
  console.log('map opens showing about', sc0.across, 'm across');
  await p.screenshot({ path: out + '/nav_map.png' });
  // pinch out with two fingers
  const cdp = await ctx.newCDPSession(p); const box = await p.evaluate(() => { const r = window.__app.map.cv.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - i * 8, y: cy, id: 1 }, { x: cx + 30 + i * 8, y: cy, id: 2 }] }); await p.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const sc1 = await p.evaluate(() => window.__app.map.scale); console.log('pinch zoom factor', (sc1 / sc0.s).toFixed(2));
  await p.tap('.mapnav button:has-text("Region")'); await p.waitForTimeout(200); const sc2 = await p.evaluate(() => Math.round(window.__app.map.vw / window.__app.map.scale));
  await p.tap('.mapnav button:has-text("Me")'); await p.waitForTimeout(200); const sc3 = await p.evaluate(() => Math.round(window.__app.map.vw / window.__app.map.scale));
  console.log('Region shows', sc2, 'm; Me shows', sc3, 'm');
  await p.tap('.mapnav button:has-text("Layers")'); await p.waitForTimeout(200); console.log('layers panel open:', !!(await p.$('.hud.tr label')));
  console.log('ERRS', JSON.stringify(errs)); await b.close();
})();
