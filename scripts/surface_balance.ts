// Where can a player find things on the surface? Known grounds should be reliable; the wider country should be quiet.
import { generateWorld } from '../src/sim/world';
import { newGame, Searcher } from '../src/sim/game';
import { buyersFor, offerFor } from '../src/sim/economy';
import { KNOWN_GROUND } from '../src/sim/sites';
import { cellOf } from '../src/sim/terrain';
import { Rng } from '../src/sim/rng';

for (const seed of process.argv.slice(2).length ? process.argv.slice(2) : ['alpha', 'zeta', 'phone-1', 'beta']) {
  const w = generateWorld(seed); const g = newGame(w); const S = new Searcher(w, g);
  const start = w.H.settlements.find(s => s.id === w.start.settlement)!; const buyers = buyersFor(w, start.id);
  const price = (it: any) => Math.max(...buyers.map(b => (it.art ? offerFor(w, b, { art: it.art, legibility: 0.5, identified: true }, 0) : offerFor(w, b, { spec: it.spec, legibility: 1, identified: false }, 0)).price));
  const tally = (sites: typeof w.sites.sites) => { let n = 0, v = 0, area = 0; for (const st of sites) { const it = S.visibleItems(st.x, st.y, st.r, Infinity); n += it.length; v += it.reduce((a, b) => a + price(b), 0); area += Math.PI * st.r * st.r; } return { n, v, per1000m2: (n / Math.max(1, area) * 1000).toFixed(2) }; };
  const near = w.sites.sites.filter(q => q.access === 'public' && q.densityMult > 0 && Math.hypot(q.x - start.x, q.y - start.y) < 4000);
  const known = near.filter(q => KNOWN_GROUND.has(q.kind)); const other = near.filter(q => !KNOWN_GROUND.has(q.kind) && q.kind !== 'road' && q.kind !== 'railway');
  // random points in the countryside (not on any known ground), 30 m radius each
  const r = new Rng(7); let wildN = 0, pts = 0;
  for (let i = 0; i < 400 && pts < 60; i++) { const x = start.x + r.float(-4000, 4000), y = start.y + r.float(-4000, 4000); const c = cellOf(x, y); if (w.T.sea[c] || w.T.lake[c] >= 0) continue; if (S.sitesNear(x, y, 30).some(q => KNOWN_GROUND.has(q.kind) && Math.hypot(q.x - x, q.y - y) < q.r)) continue; pts++; wildN += S.visibleItems(x, y, 30, Infinity).length; }
  console.log(`${seed}: start ${start.name}; known grounds within 4 km: ${known.map(k => k.kind).join(', ')}`);
  console.log(`   known grounds   `, JSON.stringify(tally(known)));
  console.log(`   other old sites `, JSON.stringify(tally(other)), `(${other.length} sites)`);
  console.log(`   open countryside: ${(wildN / pts).toFixed(2)} visible items per 30 m circle (${pts} spots)`);
}
