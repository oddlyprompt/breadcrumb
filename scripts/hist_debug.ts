import { generateTerrain } from '../src/sim/terrain';
import { generateGeology } from '../src/sim/geology';
import { generateDeposits } from '../src/sim/deposits';
import { generateLandscape } from '../src/sim/landscape';
import { nameGeography } from '../src/sim/geography';
import { simulateHistory } from '../src/sim/history';
import { CULTURES } from '../src/sim/names';
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['alpha', 'beta', 'gamma'];
for (const seed of seeds) {
  const t0 = performance.now(); const cu = CULTURES[0];
  const T = generateTerrain(seed); const G = generateGeology(seed, T, cu); const D = generateDeposits(seed, T, G, cu); const L = generateLandscape(seed, T, G); const geo = nameGeography(seed, T, L, cu);
  const t1 = performance.now();
  const H = simulateHistory(seed, { T, L, G, D, geo }, cu);
  const kinds: Record<string, number> = {}; for (const e of H.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const sk: Record<string, number> = {}; for (const s of H.settlements) sk[s.kind] = (sk[s.kind] || 0) + 1;
  console.log(`${seed}: gen ${(t1 - t0).toFixed(0)}ms hist ${(performance.now() - t1).toFixed(0)}ms start ${H.startYear} settlements ${H.settlements.length} current ${H.settlements.filter(s => s.current && s.kind !== 'farmstead').length} people ${H.people.length} biz ${H.businesses.length} events ${H.events.length} routes ${H.routes.length} crossings ${H.crossings.length} mines ${H.mines.length} vessels ${H.vessels.length} caches ${H.caches.length}`);
  console.log('  settlements', JSON.stringify(sk)); console.log('  events', JSON.stringify(kinds));
  console.log('  biggest:', H.settlements.filter(s => s.current).sort((a, b) => b.pop - a.pop).slice(0, 5).map(s => `${s.name}(${s.kind},${Math.round(s.pop)})`).join(', '));
  console.log('  routes', JSON.stringify(H.routes.reduce((a: any, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {})), 'rail closed', H.routes.filter(r => r.kind === 'railway' && r.closed).length);
}
