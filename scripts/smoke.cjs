const { chromium } = require('/opt/node-tools/node_modules/playwright');
const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'zeta') + '&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 90000 }); await p.waitForTimeout(600);
  for (const t of ['Pack','Gear','Town','Archive','Journal','Collection','Guide']) { await p.click(`.tabs button:has-text("${t}")`); await p.waitForTimeout(120); }
  await p.click('.tabs button:has-text("Archive")'); await p.waitForTimeout(150);
  const doc = await p.$('.pane .list .card'); if (doc) { await doc.click(); await p.waitForTimeout(200); }
  await p.screenshot({ path: out + '/archive.png' });
  await p.keyboard.press('`'); await p.waitForTimeout(200);
  for (const t of ['world','geology','history','objects','economy','chains']) { await p.click(`.pane .tabs button:has-text("${t}")`); await p.waitForTimeout(150); }
  await p.click('.pane .tabs button:has-text("world")'); await p.click('button:has-text("Run validation")'); await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '/dev.png' });
  await p.keyboard.press('m'); await p.waitForTimeout(300);
  for (const l of ['Geology','Known old sites','My discoveries']) { await p.click(`label:has-text("${l}") input`); }
  await p.waitForTimeout(500); await p.screenshot({ path: out + '/map_geo.png' });
  console.log('ERRS', JSON.stringify(errs.slice(0, 6)));
  await b.close();
})();
