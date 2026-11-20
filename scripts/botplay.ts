import { generateWorld } from '../src/sim/world';
import { newGame, Searcher, buyGear } from '../src/sim/game';
import { buyersFor, offerFor, trueValue } from '../src/sim/economy';
import { generateSite } from '../src/sim/artifacts';
import { response, groundInfo } from '../src/sim/detector';

const seed = process.argv[2] || 'alpha';
const w = generateWorld(seed);
const g = newGame(w);
const S = new Searcher(w, g);
const start = w.H.settlements.find(s => s.id === w.start.settlement)!;
console.log(`${w.name}: start ${start.name} (${start.kind}, pop ${Math.round(start.pop)}), ${w.start.reason}`);
const near = w.sites.sites
  .filter(s => s.access !== 'builtup' && s.densityMult > 0 && Math.hypot(s.x - start.x, s.y - start.y) < 8000)
  .sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
console.log('searchable sites within 8 km:', near.length, [...new Set(near.map(s => s.kind))].join(', '));
const buyers = buyersFor(w, start.id);

// Strategy A: free surface collecting
let visVal = 0, visN = 0, visBest = 0;
const kinds: Record<string, number> = {};
for (const s of near.slice(0, 40)) {
  for (const it of S.visibleItems(s.x, s.y, s.r)) {
    visN++;
    let best = 0;
    for (const b of buyers) {
      const o = it.art
        ? offerFor(w, b, { art: it.art, legibility: 0.5, identified: true }, 0)
        : offerFor(w, b, { spec: it.spec, legibility: 1, identified: false }, 0);
      best = Math.max(best, o.price);
    }
    visVal += best; visBest = Math.max(visBest, best);
    kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  }
}
console.log(`Free surface search in 40 nearest sites: ${visN} visible items, sale value $${visVal.toFixed(0)}, best single $${visBest.toFixed(2)}`, JSON.stringify(kinds));

// Strategy B: basic detector over the same sites
buyGear(g, 'det1'); buyGear(g, 'trowel');
const set = S.setup()!;
let tN = 0, tAud = 0, tVal = 0, tMax = 0;
const tiers = [0, 0, 0, 0];
const bysite: Array<[string, string, number, number]> = [];
for (const s of near.slice(0, 40)) {
  let sn = 0, sv = 0;
  for (const a of generateSite(w, s)) {
    const gr = S.groundAt(a.x, a.y);
    const gi = groundInfo({ mineral: gr.mineral, moist: gr.moist, salt: gr.salt }, 0, 0);
    const r = response(set, { id: a.id, x: a.x, y: a.y, depth: a.depth, mat: a.mat, L: a.dims[0], W: a.dims[1], mass: a.mass }, 0, 0, gi);
    tN++;
    if (r.audible && a.depth <= 20) {
      tAud++; sn++;
      const v = trueValue(w, a);
      let best = 0;
      for (const b of buyers) best = Math.max(best, offerFor(w, b, { art: a, legibility: 0.55, identified: true }, 0).price);
      tVal += best; sv += best; tMax = Math.max(tMax, best); tiers[v.tier]++;
    }
  }
  bysite.push([s.kind, s.name, sn, sv]);
}
console.log(`Detector R1 over the same sites: ${tAud} diggable of ${tN} artifacts; sale value $${tVal.toFixed(0)}; best $${tMax.toFixed(2)}; tiers ordinary/interesting/significant/exceptional = ${tiers.join('/')}`);
bysite.sort((a, b) => b[3] - a[3]);
console.log('best sites:', bysite.slice(0, 5).map(b => `${b[1]} [${b[0]}] ${b[2]} targets $${b[3].toFixed(0)}`).join(' | '));
