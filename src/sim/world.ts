import { stream, hash32, GEN_VERSION } from './rng';
import { generateTerrain, SIZE, CELL, cellOf, N } from './terrain';
import { generateGeology } from './geology';
import { generateDeposits } from './deposits';
import { generateLandscape } from './landscape';
import { nameGeography } from './geography';
import { simulateHistory } from './history';
import { makeCoinage } from './coinage';
import { makeIssues } from './issues';
import { buildSites } from './sites';
import { generateDocuments } from './documents';
import { CULTURES, Namer } from './names';
import type { World } from './worldtypes';

export { GEN_VERSION };
export function generateWorld(seed: string, progress: (msg: string, frac: number) => void = () => {}): World {
  const rng = stream(seed, 'culture');
  const culture = rng.pick(CULTURES);
  progress('Raising mountains and carving valleys…', 0.05);
  const T = generateTerrain(seed);
  progress('Laying down rock formations and faults…', 0.2);
  const G = generateGeology(seed, T, culture);
  progress('Concentrating minerals where the geology allows…', 0.3);
  const D = generateDeposits(seed, T, G, culture);
  const L = generateLandscape(seed, T, G);
  const geo = nameGeography(seed, T, L, culture);
  progress('Living four hundred years of history…', 0.45);
  const H = simulateHistory(seed, { T, L, G, D, geo }, culture);
  const coin = makeCoinage(seed, H, culture);
  const issues = makeIssues(seed, H, culture);
  progress('Leaving traces in the ground…', 0.7);
  const sites = buildSites(seed, T, L, G, D, H, culture);
  const w: World = {
    seed, genVersion: GEN_VERSION, name: '', culture, T, G, D, L, geo, H, coin, issues, sites, start: { settlement: '', x: 0, y: 0, reason: '' }, docs: [],
    artCache: new Map(), ledger: { decayed: 0, sitesGenerated: 0 },
  };
  const nm = new Namer(culture, stream(seed, 'worldname'));
  const range = geo.features.find(f => f.kind === 'range');
  w.name = range ? `The ${range.name.replace(/s$/, '')} Country` : `The ${nm.stem(2)} Coast`;
  progress('Filing the archives…', 0.88);
  w.docs = generateDocuments(w);
  w.start = chooseStart(w);
  progress('Done', 1);
  return w;
}

/** A viable starting town: living, with an archive, and with several free activities close at hand. */
export function chooseStart(w: World): World['start'] {
  const { H, sites, D } = { H: w.H, sites: w.sites.sites, D: w.D };
  let best: { s: typeof H.settlements[0]; score: number; why: string } | null = null;
  for (const s of H.settlements) {
    if (!s.current || s.kind === 'farmstead' || s.kind === 'seasonal_camp' || s.kind === 'military_settlement') continue;
    if (s.pop < 250 || s.pop > 9000 || !s.hasArchive) continue;
    if (w.docs.filter(d => d.holdings.includes(s.id)).length < 4) continue;
    let beach = 0, publicSites = 0, ghosts = 0, specimens = 0, fields = 0;
    for (const st of sites) {
      const d = Math.hypot(st.x - s.x, st.y - s.y); if (d > 7000 || st.access === 'builtup') continue;
      if (st.kind === 'beach' && d < 5000) beach++; else if (['town_dump', 'town_common', 'schoolyard', 'picnic', 'fairground'].includes(st.kind) && d < 3500) publicSites++;
      else if (['town_core', 'farm', 'mine', 'works', 'station', 'diggings', 'fort'].includes(st.kind) && st.to !== null && st.access === 'public') ghosts++;
      else if (st.kind === 'ford' && d < 5000) publicSites += 0.3; else if (st.kind === 'field' && st.access === 'permission' && d < 3500) fields++;
    }
    for (const d of D.deposits) { const dd = Math.hypot(d.x - s.x, d.y - s.y); if (dd < 7000 && (d.kind === 'fossil_bed' || d.kind === 'geode_field' || d.kind === 'quartz_veins' || d.kind === 'pegmatite')) specimens++; }
    const riverNear = w.geo.rivers.some(r => r.path.some(c => Math.hypot(((c % N) + 0.5) * CELL - s.x, (((c / N) | 0) + 0.5) * CELL - s.y) < 3500));
    const score = Math.min(3, beach) * 3 + Math.min(5, publicSites) * 1.5 + Math.min(6, ghosts) * 1.2 + Math.min(4, specimens) * 1.5 + Math.min(2, fields) + (riverNear ? 2 : 0) - Math.abs(Math.log(s.pop / 1200)) * 1.2;
    if (!best || score > best.score) best = { s, score, why: `${beach ? 'shoreline, ' : ''}${ghosts ? 'old sites nearby, ' : ''}${specimens ? 'rock exposures, ' : ''}${riverNear ? 'a river' : ''}`.replace(/, $/, '') };
  }
  if (!best) { const s = H.settlements.filter(q => q.current && q.kind !== 'farmstead').sort((a, b) => b.pop - a.pop)[0] ?? H.settlements[0]; return { settlement: s.id, x: s.x, y: s.y, reason: 'the largest living town' }; }
  return { settlement: best.s.id, x: best.s.x, y: best.s.y, reason: best.why };
}
