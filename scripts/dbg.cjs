const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  await p.goto('http://127.0.0.1:4173/?seed=alpha&auto=1'); await p.waitForFunction(() => window.__app, null, { timeout: 90000 });
  const r = await p.evaluate(() => { const app = window.__app, w = window.__world, S = app.S, g = app.g; window.__bc.game.buyGear(g, 'det1');
    const s = w.sites.byId.get('ST1308'); const a = window.__bc.artifacts.generateSite(w, s).find(x => x.depth < 14 && x.mat === 'copper');
    const sc = S.scan(a.x, a.y); const set = S.setup(); const gr = S.groundAt(a.x, a.y);
    return { a: [a.x, a.y, a.depth, a.dims], scan: sc && { s: sc.r.s, aud: sc.r.audible, vdi: sc.r.vdi }, gr, acc: S.access(a.x, a.y), noise: S.noise(a.x, a.y), set: !!set }; });
  console.log(JSON.stringify(r)); await b.close();
})();
