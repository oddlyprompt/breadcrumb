const { chromium, devices } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'phone-1') + '&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + '/start_field.png' });
  await p.tap('.tabs button:has-text("Journal")'); await p.waitForTimeout(200);
  console.log('journal:', (await p.$eval('.pane', e => e.innerText)).split('Timeline')[1]?.slice(0, 500));
  await p.tap('.tabs button:has-text("Town")'); await p.waitForTimeout(200); console.log('town tab:', (await p.$eval('.pane', e => e.innerText)).slice(0, 120).replace(/\n/g, ' | '));
  await p.tap('.top button:has-text("Map")'); await p.waitForTimeout(500);
  await p.evaluate(() => { const a = window.__app; a.map.centerOn(a.g.x, a.g.y, a.map.scale * 3.5); });
  await p.waitForTimeout(400); await p.screenshot({ path: out + '/start_map.png' });
  console.log('ERRS', JSON.stringify(errs)); await b.close();
})();
