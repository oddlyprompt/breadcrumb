import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/sim/world';
import { validateWorld, worldFingerprint } from '../src/sim/validate';
import { generateSite } from '../src/sim/artifacts';
import { newGame, Searcher, dig, buyGear, serialize, deserialize, pickUp } from '../src/sim/game';
import { buyersFor, offerFor, trueValue } from '../src/sim/economy';
import { specimensInChunk } from '../src/sim/specimens';
import { ARCHETYPES } from '../src/sim/archetypes';
import { response, groundInfo } from '../src/sim/detector';

const SEEDS = ['t-alpha', 't-beta', 't-gamma'];
const worlds = SEEDS.map(s => generateWorld(s));

describe('determinism', () => {
  it('identical seeds give identical worlds and objects', () => { expect(worldFingerprint(generateWorld('t-alpha'))).toBe(worldFingerprint(worlds[0])); });
  it('different seeds give different worlds', () => { const f = worlds.map(worldFingerprint); expect(new Set(f).size).toBe(3); expect(new Set(worlds.map(w => w.name)).size).toBe(3); });
  it('lazy site generation does not depend on the order sites are visited', () => {
    const a = generateWorld('t-order'), b = generateWorld('t-order'); const ids = a.sites.sites.filter(s => s.densityMult > 0).map(s => s.id);
    const sig = (w: typeof a, id: string) => generateSite(w, w.sites.byId.get(id)!).map(x => x.id + x.x.toFixed(2)).join('|');
    const fwd = ids.slice(0, 30).map(id => sig(a, id)); const rev = ids.slice(0, 30).reverse().map(id => sig(b, id)).reverse(); expect(fwd).toEqual(rev);
  });
  it('specimens are deterministic per chunk', () => { const w = worlds[0]; const s = w.H.settlements[0]; const cx = Math.floor(s.x / 64), cy = Math.floor(s.y / 64); expect(JSON.stringify(specimensInChunk(w, cx, cy))).toBe(JSON.stringify(specimensInChunk(worlds[0], cx, cy))); });
});
describe('consistency validation', () => { for (const [i, w] of worlds.entries()) it(`world ${SEEDS[i]} has no geological, historical or artifact contradictions`, () => { const r = validateWorld(w, { siteSample: 60 }); expect(r.violations.slice(0, 5)).toEqual([]); }); });
describe('content', () => {
  it('has at least 100 meaningful archetypes', () => { expect(ARCHETYPES.length).toBeGreaterThanOrEqual(100); expect(new Set(ARCHETYPES.map(a => a.id)).size).toBe(ARCHETYPES.length); });
  it('worlds differ in geology and resources', () => { const kinds = worlds.map(w => new Set(w.D.deposits.map(d => d.kind)).size); const sets = worlds.map(w => [...new Set(w.D.deposits.map(d => d.kind))].sort().join()); expect(new Set(sets).size).toBeGreaterThan(1); expect(Math.min(...kinds)).toBeGreaterThan(2); });
  it('every world has a viable start with free activities and an archive', () => { for (const w of worlds) { const s = w.H.settlements.find(q => q.id === w.start.settlement)!; expect(s.current && s.hasArchive).toBe(true); const near = w.sites.sites.filter(q => q.access !== 'builtup' && q.densityMult > 0 && Math.hypot(q.x - s.x, q.y - s.y) < 9000); expect(new Set(near.map(q => q.kind)).size).toBeGreaterThanOrEqual(5); expect(w.docs.filter(d => d.holdings.includes(s.id)).length).toBeGreaterThan(3); } });
});
describe('gameplay', () => {
  const w = worlds[0];
  it('the player cannot enter an unrecoverable financial state', () => { const g = newGame(w); expect(g.cash).toBeGreaterThan(100); buyGear(g, 'det1'); expect(g.cash).toBeGreaterThan(50); /* scrap, surface finds and panning need no money */ });
  it('digging recovers an object once and never regenerates it', () => {
    const g = newGame(w); const S = new Searcher(w, g); g.equipped.digger = 'hands';
    const a = shallow(w); g.x = a.x; g.y = a.y;
    const r1 = dig(S, a.x, a.y); expect(r1.got.some(q => q.art?.id === a.id)).toBe(true); const r2 = dig(S, a.x, a.y); expect(r2.got.some(q => q.art?.id === a.id)).toBe(false);
    expect(S.artifactsNear(a.x, a.y, 1).some(q => q.art.id === a.id)).toBe(false);
  });
  it('save and load preserves state and the world remains the same', () => {
    const g = newGame(w); const S = new Searcher(w, g); const a = shallow(w); dig(S, a.x, a.y);
    const g2 = deserialize(serialize(g)); expect(g2.recovered).toEqual(g.recovered); expect(g2.finds.length).toBe(g.finds.length); const w2 = generateWorld('t-alpha'); const S2 = new Searcher(w2, g2); expect(S2.artifactsNear(a.x, a.y, 0.5).some(q => q.art.id === a.id)).toBe(false);
  });
  it('detector signals come only from real metal objects and depth matters', () => {
    const g = newGame(w); buyGear(g, 'det1'); const S = new Searcher(w, g); const set = S.setup()!; const site = w.sites.sites.find(s => s.densityMult > 0 && s.kind === 'town_dump')!; const arts = generateSite(w, site);
    const glass = arts.find(a => a.mat === 'glass')!; const gr = { mineral: 0.1, moist: 0.3, salt: 0, interference: 0 };
    expect(response(set, { id: glass.id, x: 0, y: 0, depth: 2, mat: glass.mat, L: 80, W: 80, mass: 300 }, 0, 0, gr).audible).toBe(false);
    const shallow = response(set, { id: 'c', x: 0, y: 0, depth: 6, mat: 'copper', L: 25, W: 25, mass: 5 }, 0, 0, gr), deep = response(set, { id: 'c', x: 0, y: 0, depth: 45, mat: 'copper', L: 25, W: 25, mass: 5 }, 0, 0, gr);
    expect(shallow.audible).toBe(true); expect(deep.audible).toBe(false); expect(shallow.s).toBeGreaterThan(deep.s);
    const iron = response(set, { id: 'n', x: 0, y: 0, depth: 6, mat: 'iron', L: 80, W: 8, mass: 20 }, 0, 0, gr); expect(iron.iron).toBe(true);
    const salty = response(set, { id: 'c', x: 0, y: 0, depth: 14, mat: 'copper', L: 25, W: 25, mass: 5 }, 0, 0, { mineral: 0.7, moist: 1, salt: 0.6, interference: 0 }); expect(salty.audible).toBe(false);
  });
  it('selling prefers legible, identified items and respects buyer specialities', () => {
    const buyers = buyersFor(w, w.start.settlement); const site = w.sites.sites.find(s => s.densityMult > 0 && s.kind === 'town_dump')!; const arts = generateSite(w, site);
    const coin = generateSiteCoin(w); const scrap = buyers.find(b => b.kind === 'scrap')!, nums = buyers.find(b => b.kind === 'coin')!;
    const good = offerFor(w, nums, { art: coin, legibility: 0.9, identified: true }, 0).price, bad = offerFor(w, nums, { art: coin, legibility: 0.1, identified: true }, 0).price;
    expect(good).toBeGreaterThanOrEqual(bad); const glass = arts.find(a => a.mat === 'glass')!; expect(offerFor(w, scrap, { art: glass, legibility: 1, identified: true }, 0).refuses).toBe(true); expect(trueValue(w, coin).total).toBeGreaterThan(0);
  });
});
function shallow(w: ReturnType<typeof generateWorld>) { for (const s of w.sites.sites) { if (s.access !== 'public' || s.densityMult <= 0 || s.kind === 'beach' || s.dynamic !== 'none') continue; const a = generateSite(w, s).find(x => x.depth < 3.5 && w.L.sediment[Math.floor(x.y / 250) * 200 + Math.floor(x.x / 250)] !== 0); if (a) return a; } throw new Error('no shallow object'); }
function generateSiteCoin(w: ReturnType<typeof generateWorld>) { for (const s of w.sites.sites) { if (s.densityMult <= 0) continue; const c = generateSite(w, s).find(a => a.series); if (c) return c; } throw new Error('no coin'); }
