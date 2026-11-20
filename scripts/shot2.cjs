const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const out = '/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4173/?seed=' + (process.argv[2] || 'alpha') + '&auto=1');
  await p.waitForFunction(() => window.__app, null, { timeout: 90000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + '/field2.png' });
  console.log('ERRS', JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
