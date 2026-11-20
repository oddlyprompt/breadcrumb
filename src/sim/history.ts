import { Rng, stream } from './rng';
import { Namer, Culture, CULTURES } from './names';
import { N, CELL, DX, DY, idx, inb, Terrain, RIVER_Q, CREEK_Q, cellCenter, cellOf } from './terrain';
import { Landscape, Veg, Sed } from './landscape';
import { Geology } from './geology';
import { Deposit, DepositsOut, isLode } from './deposits';
import { Geography } from './geography';
import { aStar, pathToPolyline } from './path';
import { START_YEAR, PRESENT_YEAR } from './tech';
import * as HT from './history_types';
import type { Settlement, Person, Business, HEvent, Route, Crossing, Vessel, Mine, Cache, SKind, BizKind, HistoryData, EventKind } from './history_types';

type Ctx = { T: Terrain; L: Landscape; G: Geology; D: DepositsOut; geo: Geography };

interface IndustryDef { kind: BizKind; trade: string; from: number; to?: number; minPop: number; perPop: number; chance: number; needs?: (s: Settlement, c: Ctx, year: number) => boolean; tokens?: boolean; scale: number; }
const nearCells = (cell: number, r: number, fn: (c: number) => boolean) => { const cx = cell % N, cy = (cell / N) | 0; let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y) && fn(idx(x, y))) n++; } return n; };
const INDUSTRIES: IndustryDef[] = [
  { kind: 'general_store', trade: 'General Store', from: 1624, minPop: 25, perPop: 400, chance: 0.2, tokens: true, scale: 1 },
  { kind: 'blacksmith', trade: 'Forge', from: 1624, minPop: 40, perPop: 500, chance: 0.15, scale: 1 },
  { kind: 'mill', trade: 'Grist Mill', from: 1624, minPop: 60, perPop: 1200, chance: 0.1, needs: (s, c) => nearCells(s.cell, 2, k => c.T.Q[k] > CREEK_Q * 1.5) > 0, scale: 2 },
  { kind: 'sawmill', trade: 'Lumber Company', from: 1630, minPop: 50, perPop: 1500, chance: 0.1, needs: (s, c) => nearCells(s.cell, 3, k => c.L.veg[k] === Veg.Conifer || c.L.veg[k] === Veg.Mixed || c.L.veg[k] === Veg.Broadleaf) > 8 && nearCells(s.cell, 2, k => c.T.Q[k] > CREEK_Q) > 0, tokens: true, scale: 3 },
  { kind: 'hotel', trade: 'Hotel', from: 1700, minPop: 120, perPop: 900, chance: 0.1, scale: 1 },
  { kind: 'livery', trade: 'Livery Stable', from: 1760, to: 1945, minPop: 150, perPop: 1500, chance: 0.08, scale: 1 },
  { kind: 'brewery', trade: 'Brewing Company', from: 1650, minPop: 250, perPop: 2500, chance: 0.07, scale: 2 },
  { kind: 'bottler', trade: 'Bottling Works', from: 1855, minPop: 500, perPop: 3000, chance: 0.1, scale: 2 },
  { kind: 'tannery', trade: 'Tannery', from: 1650, minPop: 200, perPop: 3000, chance: 0.05, needs: (s, c) => nearCells(s.cell, 2, k => c.T.Q[k] > CREEK_Q) > 0, scale: 2 },
  { kind: 'brickworks', trade: 'Brick & Tile Works', from: 1700, minPop: 300, perPop: 4000, chance: 0.06, needs: (s, c) => nearCells(s.cell, 2, k => c.L.sediment[k] === Sed.Alluvium || c.G.formations[c.G.formationOf[k]].rock === 'shale' || c.G.formations[c.G.formationOf[k]].rock === 'marl and clay') > 3, scale: 3 },
  { kind: 'pottery', trade: 'Pottery', from: 1650, minPop: 200, perPop: 4000, chance: 0.05, needs: (s, c) => nearCells(s.cell, 3, k => c.G.formations[c.G.formationOf[k]].rock.includes('clay') || c.G.formations[c.G.formationOf[k]].rock === 'shale' || c.L.sediment[k] === Sed.Alluvium) > 3, scale: 2 },
  { kind: 'lime_kiln', trade: 'Lime Works', from: 1650, minPop: 150, perPop: 5000, chance: 0.06, needs: (s, c) => nearCells(s.cell, 3, k => !!c.G.formations[c.G.formationOf[k]].carbonate) > 3, scale: 2 },
  { kind: 'quarry', trade: 'Stone Quarry', from: 1700, minPop: 200, perPop: 4500, chance: 0.05, needs: (s, c) => nearCells(s.cell, 2, k => c.G.formations[c.G.formationOf[k]].hardness > 0.7 && c.L.sediment[k] === Sed.Bedrock) > 1, scale: 2 },
  { kind: 'glassworks', trade: 'Glass Works', from: 1740, minPop: 1000, perPop: 6000, chance: 0.05, needs: (s, c) => nearCells(s.cell, 5, k => ['quartzite', 'sandstone', 'sand and gravel'].includes(c.G.formations[c.G.formationOf[k]].rock)) > 4, scale: 4 },
  { kind: 'foundry', trade: 'Iron Works', from: 1750, minPop: 800, perPop: 5000, chance: 0.06, tokens: true, scale: 4 },
  { kind: 'cannery', trade: 'Cannery', from: 1850, minPop: 200, perPop: 3000, chance: 0.08, needs: s => s.port || s.kind === 'fishing_village', tokens: true, scale: 3 },
  { kind: 'fishery', trade: 'Fish Packers', from: 1624, minPop: 40, perPop: 800, chance: 0.12, needs: s => s.port || s.kind === 'fishing_village', scale: 2 },
  { kind: 'chandlery', trade: 'Ship Chandlers', from: 1680, minPop: 300, perPop: 2500, chance: 0.08, needs: s => s.port, scale: 2 },
  { kind: 'jeweler', trade: 'Jewellers', from: 1700, minPop: 1200, perPop: 4000, chance: 0.06, scale: 1 },
  { kind: 'button_works', trade: 'Button Works', from: 1851, minPop: 2500, perPop: 9000, chance: 0.04, scale: 3 },
  { kind: 'tin_shop', trade: 'Tinware Works', from: 1810, minPop: 600, perPop: 3500, chance: 0.05, scale: 2 },
  { kind: 'saddlery', trade: 'Saddlery', from: 1700, to: 1950, minPop: 300, perPop: 2500, chance: 0.05, scale: 1 },
  { kind: 'bank', trade: 'Bank', from: 1790, minPop: 900, perPop: 4000, chance: 0.06, scale: 3 },
  { kind: 'newspaper', trade: 'Gazette', from: 1760, minPop: 700, perPop: 5000, chance: 0.06, scale: 1 },
  { kind: 'photographer', trade: 'Photographic Studio', from: 1850, to: 1990, minPop: 900, perPop: 5000, chance: 0.05, scale: 1 },
  { kind: 'garage', trade: 'Motor Garage', from: 1912, minPop: 400, perPop: 2000, chance: 0.12, scale: 1 },
];

export function simulateHistory(seed: string, ctx: Ctx, culture: Culture): HistoryData {
  const { T, L, G, D, geo } = ctx;
  const r = stream(seed, 'history');
  const namer = new Namer(culture, stream(seed, 'histnames'));
  const startYear = START_YEAR + r.int(-6, 22);
  const endYear = PRESENT_YEAR;
  const H: HistoryData = {
    startYear, endYear, polities: [], wars: [], econ: [], depressions: [], settlements: [], people: [], businesses: [], events: [], routes: [], crossings: [], vessels: [], mines: [], caches: [],
    placerWorked: {}, homeland: '', independence: 0, currencyMajor: culture.currencyName, currencyMinor: culture.currencyMinor, floods: [], storms: [],
  };
  const independence = r.int(1770, 1860);
  H.independence = independence;
  const homeName = namer.stem(2);
  H.homeland = `${culture.polityWords[0] === 'Kingdom' || culture.polityWords[0] === 'Crown Colony' ? 'Kingdom' : 'Kingdom'} of ${homeName}`;
  H.polities.push({ id: 'P0', name: H.homeland, from: 1500, to: 2100, kind: 'homeland' });
  const colonyName = namer.stem(2);
  H.polities.push({ id: 'P1', name: `${r.pick(['Colony', 'Province', 'Plantation'])} of ${colonyName}`, from: startYear, to: independence - 1, kind: 'colony' });
  H.polities.push({ id: 'P2', name: `${r.pick(['Republic', 'Dominion', 'Commonwealth', 'Federation'])} of ${colonyName}`, from: independence, to: 2100, kind: 'dominion' });
  const polityAt = (y: number) => y < independence ? H.polities[1] : H.polities[2];

  // economy: slow growth with depressions and wars
  const depYears = [1819, 1837, 1857, 1873, 1893, 1907, 1929, 1973, 2008].map(y => y + r.int(-3, 3)).filter(() => r.chance(0.8));
  H.depressions = depYears;
  for (let y = startYear; y <= endYear; y++) {
    let e = 0.35 + (y - startYear) / (endYear - startYear) * 1.1 + 0.15 * Math.sin(y / 7.3 + 1.2);
    for (const d of depYears) if (y >= d && y <= d + 4) e *= 0.62 + 0.09 * (y - d);
    H.econ[y - startYear] = Math.max(0.15, e);
  }
  const econ = (y: number) => H.econ[Math.max(0, Math.min(H.econ.length - 1, y - startYear))];
  // wars
  const wars = H.wars;
  const w1 = r.int(1650, 1740); wars.push({ id: 'W1', name: `${namer.stem(2)} War`, from: w1, to: w1 + r.int(2, 7), sides: [H.homeland, `the ${r.pick(['Northern', 'Coastal', 'Highland', 'Border'])} Confederacy`], local: true });
  wars.push({ id: 'W2', name: `War of ${r.pick(['Independence', 'Separation', 'Liberty'])}`, from: independence - r.int(3, 7), to: independence - 1, sides: [H.homeland, `the ${colonyName} Assembly`], local: true });
  if (r.chance(0.7)) { const w = r.int(1855, 1875); wars.push({ id: 'W3', name: `${namer.stem(2)} Civil War`, from: w, to: w + r.int(2, 4), sides: ['the Northern League', 'the Southern League'], local: r.chance(0.6) }); }
  wars.push({ id: 'W4', name: 'Great War', from: 1914, to: 1918, sides: ['the Allied Powers', 'the Central Powers'], local: false });
  wars.push({ id: 'W5', name: 'Second World War', from: 1939, to: 1945, sides: ['the Allied Powers', 'the Axis'], local: r.chance(0.5) });
  const atWar = (y: number) => wars.find(w => y >= w.from && y <= w.to);

  // ---------- helpers
  let evN = 0, peN = 0, stN = 0, buN = 0, roN = 0, vsN = 0, miN = 0, caN = 0, crN = 0;
  const bizList = new Map<string, Business[]>(); const bizCount = new Map<string, number>(); const farmCount = new Map<string, number>(); const linkedIds = new Set<string>(); const pairSet = new Set<string>(); const farmOcc = new Uint8Array(N * N);
  const pk = (a: string, b: string) => a < b ? a + '|' + b : b + '|' + a;
  const S = new Map<string, Settlement>(); const P = new Map<string, Person>(); const B = new Map<string, Business>(); const E = new Map<string, HEvent>();
  const date = () => ({ month: r.int(1, 12), day: r.int(1, 28) });
  const addEvent = (e: Partial<HEvent> & { kind: EventKind; year: number; title: string; text: string }): HEvent => {
    const ev: HEvent = { id: `E${++evN}`, month: r.int(1, 12), day: r.int(1, 28), people: [], businesses: [], prereqs: [], consequences: [], fame: 0.1, ...e } as HEvent;
    H.events.push(ev); E.set(ev.id, ev);
    for (const p of ev.prereqs) E.get(p)?.consequences.push(ev.id);
    return ev;
  };
  const newPerson = (year: number, o: Partial<Person> & { occupation: string; age?: number }): Person => {
    const nm = namer.person(); const age = o.age ?? r.int(24, 55);
    const born = year - age; const span = Math.round(Math.max(age + 1, r.normal(66, 14)));
    let died: number | null = born + Math.max(age + 1, Math.min(span, 98)); if (died > endYear) died = null;
    const p: Person = { id: `P${++peN}`, name: nm.full, given: nm.given, surname: nm.surname, born, died, fame: 0.05, notes: [], ...o } as Person;
    delete (p as any).age; H.people.push(p); P.set(p.id, p); return p;
  };
  const dist = (a: number, b: number) => Math.hypot((a % N) - (b % N), ((a / N) | 0) - ((b / N) | 0));
  const active = (s: Settlement, y: number) => s.founded <= y && (s.abandoned === undefined || y < s.abandoned);
  const settlementsAt = (y: number) => H.settlements.filter(s => active(s, y));
  const streetNames = () => Array.from({ length: 4 }, (_, i) => i === 0 ? r.pick(['Main', 'Front', 'High', 'Water', 'Market']) + ' Street' : `${namer.stem(r.int(1, 2))} ${r.pick(['Street', 'Road', 'Lane', 'Avenue'])}`);

  // ---------- precomputed suitability
  const agriSm = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) { let s = 0, n = 0; const cx = c % N, cy = (c / N) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y)) { s += L.agri[idx(x, y)]; n++; } } agriSm[c] = s / n; }
  const waterNear = (c: number) => nearCells(c, 1, k => T.Q[k] > CREEK_Q * 1.4 || T.lake[k] >= 0 || (T.sea[k] === 1)) > 0;
  const coastal = (c: number) => !T.sea[c] && nearCells(c, 1, k => T.sea[k] === 1) > 0;
  const buildable = (c: number) => !T.sea[c] && T.lake[c] < 0 && T.slope[c] < 10 && !L.wetland[c] && isFinite(L.traverse[c]);
  const sitePlace = (c: number): [number, number] => { const [x, y] = cellCenter(c); return [x + r.float(-0.4, 0.4) * CELL, y + r.float(-0.4, 0.4) * CELL]; };

  const found = (year: number, kind: SKind, cell: number, reason: string, o: Partial<Settlement> = {}): Settlement => {
    const [x, y] = sitePlace(cell);
    const s: Settlement = { id: `S${++stN}`, name: kind === 'farmstead' ? '' : namer.settlement(), kind, cell, x, y, founded: year, pop: kind === 'farmstead' ? r.int(4, 9) : kind === 'seasonal_camp' ? r.int(20, 120) : r.int(25, 90), peak: 0, peakYear: year, popHist: [], port: coastal(cell) && kind !== 'farmstead' && T.coastDist[cell] < CELL * 1.8, reason, radius: 90, streetAngle: r.float(0, Math.PI), current: true, institutions: {}, burnt: [], streets: streetNames(), flooded: [], kindHistory: [[year, kind]], ...o };
    if (kind === 'farmstead') { const fam = namer.surname(); s.name = `${fam} farm`; (s as any).family = fam; }
    s.peak = s.pop; H.settlements.push(s); S.set(s.id, s);
    return s;
  };

  // ---------- first landings
  const firstScore = (c: number) => (coastal(c) ? 1 : 0) * 1.2 + agriSm[c] * 2 + (nearCells(c, 2, k => T.Q[k] > RIVER_Q) > 0 ? 1.2 : 0) + (T.slope[c] < 3 ? 0.5 : 0);
  let best = -1, bs = -1;
  for (let c = 0; c < N * N; c++) { if (!buildable(c) || !coastal(c) || T.elev[c] > 40) continue; const sc = firstScore(c) + r.float(0, 0.6); if (sc > bs) { bs = sc; best = c; } }
  if (best < 0) for (let c = 0; c < N * N; c++) if (buildable(c) && T.sea[c] === 0) { best = c; break; }
  const founder = newPerson(startYear, { occupation: 'colonial governor', age: 38, fame: 0.8, role: 'founder' });
  const first = found(startYear, 'port_city', best, 'A sheltered landing beside fresh water and arable ground, chosen by the first colonists', { port: true, founderId: founder.id });
  first.port = true; first.pop = 60; first.peak = 60;
  founder.residence = first.id;
  addEvent({ kind: 'founding', year: startYear, title: `Founding of ${first.name}`, text: `Colonists under ${founder.name} landed at ${first.name} and began to clear land.`, settlement: first.id, x: first.x, y: first.y, people: [founder.id], fame: 0.7 });
  const poolOfFarms: Settlement[] = []; const roadDeg = new Map<string, number>();
  const settlementCap = r.int(16, 30);

  // ---------- state
  const depState = new Map<string, { status: 'undiscovered' | 'active' | 'closed'; mined: number; lastClosed?: number; mineId?: string; discovered?: number }>();
  for (const d of D.deposits) depState.set(d.id, { status: 'undiscovered', mined: 0 });
  const connected = (a: Settlement, b: Settlement, kinds: string[]) => kinds.some(k => pairSet.has(k + '|' + pk(a.id, b.id)));
  const roadCost = (c: number) => L.traverse[c];
  const railCost = (c: number) => { if (T.sea[c] || T.lake[c] >= 0 || T.slope[c] > 7) return Infinity; return 1 + Math.pow(T.slope[c] / 2.4, 2) * 2.5 + (L.wetland[c] ? 3 : 0) + (T.Q[c] > RIVER_Q * 2.2 ? 4 : 0); };

  const addRoute = (kind: Route['kind'], a: Settlement, b: Settlement, year: number, why: string, cost: (c: number) => number, extra: Partial<Route> = {}): Route | null => {
    const cost0 = cost; cost = (c: number) => (c === a.cell || c === b.cell) ? 1 : cost0(c);
    const path = aStar(a.cell, b.cell, cost); if (!path || path.length < 2) { if (process.env.DBG) console.log('no path', kind); return null; }
    const total = path.reduce((s, c) => s + cost(c), 0); if (process.env.DBG && kind === 'railway') console.log('rail path', path.length, total / path.length); if (kind === 'railway' && total > path.length * 5.5) return null;
    const rt: Route = { id: `RT${++roN}`, kind, name: '', from: a.id, to: b.id, path, pts: pathToPolyline(path, CELL), built: year, upgrades: [], purpose: why, width: kind === 'railway' ? 4 : kind === 'highway' ? 9 : kind === 'road' ? 5 : 2.5, ...extra };
    rt.name = kind === 'railway' ? `${a.name}–${b.name} Railway` : `${a.name}–${b.name} ${kind === 'highway' ? 'Highway' : kind === 'road' ? 'Road' : 'Track'}`;
    H.routes.push(rt); linkedIds.add(a.id); linkedIds.add(b.id); pairSet.add(kind + '|' + pk(a.id, b.id)); if (kind === 'track' || kind === 'road') { pairSet.add('track|' + pk(a.id, b.id)); pairSet.add('road|' + pk(a.id, b.id)); }
    // crossings of streams along the path
    let lastStream = -9;
    path.forEach((c, i) => {
      if (T.Q[c] > CREEK_Q && !T.sea[c]) {
        if (i - lastStream > 2) {
          const [x, y] = cellCenter(c); const q = T.Q[c];
          const kindX: Crossing['kind'] = kind === 'railway' ? 'bridge' : q < 0.25 ? 'ford' : q < 1.4 ? (year < 1830 ? 'ferry' : 'ford') : 'ferry';
          H.crossings.push({ id: `X${++crN}`, route: rt.id, cell: c, x: x + r.float(-60, 60), y: y + r.float(-60, 60), kind: kindX, built: year, stream: q });
        }
        lastStream = i;
      }
    });
    return rt;
  };

  // ---------- industries
  const bizAt = (s: Settlement) => bizList.get(s.id) ?? [];
  const foundBusiness = (s: Settlement, def: IndustryDef, year: number, o: Partial<Business> = {}): Business => {
    const owner = newPerson(year, { occupation: def.trade.toLowerCase().replace(/ (company|works)$/, ''), residence: s.id, fame: 0.05 });
    owner.firstYearActive = year;
    const nm = namer.company(def.trade, owner.surname);
    const initial = owner.given[0];
    const [x, y] = [s.x + r.float(-1, 1) * s.radius * 0.5, s.y + r.float(-1, 1) * s.radius * 0.5];
    const b: Business = {
      id: `B${++buN}`, name: nm, short: `${initial}. ${owner.surname}`, kind: def.kind, settlement: s.id, x, y, founded: year, owners: [{ person: owner.id, from: year, to: null, how: 'founder' }], capacity: Math.max(1, Math.round(Math.sqrt(s.pop) * def.scale * r.float(0.6, 1.6))), scale: def.scale,
      mark: `${initial}.${owner.surname[0]}.${r.chance(0.5) ? '&CO' : ''}`.toUpperCase(), productYears: [year, year], address: `${r.pick(s.streets)}${r.chance(0.4) ? `, No. ${r.int(2, 60)}` : ''}`, fame: 0.05,
      tokenFrom: def.tokens && r.chance(0.55) ? year + r.int(0, 6) : undefined, ...o,
    };
    if (b.tokenFrom !== undefined) b.tokenTo = b.tokenFrom + r.int(4, 22);
    H.businesses.push(b); B.set(b.id, b); owner.notes.push(`founded ${nm}`);
    const L0 = bizList.get(s.id) ?? []; L0.push(b); bizList.set(s.id, L0); bizCount.set(s.id + '|' + def.kind, (bizCount.get(s.id + '|' + def.kind) ?? 0) + 1);
    if (def.scale >= 4 || def.kind === 'bank' || def.kind === 'newspaper') addEvent({ kind: 'business_founded', year, title: `${nm} opens`, text: `${owner.name} opened ${nm} at ${s.name}.`, settlement: s.id, people: [owner.id], businesses: [b.id], x: b.x, y: b.y, fame: 0.04 });
    return b;
  };
  const closeBusiness = (b: Business, year: number, why: string, evKind: EventKind = 'industrial_closure', prereqs: string[] = []) => {
    b.closed = year; b.closure = why; const last = b.owners[b.owners.length - 1]; if (last.to === null) last.to = year;
    const s = S.get(b.settlement)!;
    const L0 = bizList.get(s.id); if (L0) { const i = L0.indexOf(b); if (i >= 0) L0.splice(i, 1); } bizCount.set(s.id + '|' + b.kind, Math.max(0, (bizCount.get(s.id + '|' + b.kind) ?? 1) - 1));
    b.productYears[1] = year;
    if (b.scale >= 3 || b.kind === 'mine_company' || b.kind === 'bank' || b.kind === 'newspaper' || b.kind === 'railway_company') {
      const ev = addEvent({ kind: why.includes('bankrupt') ? 'bankruptcy' : evKind, year, title: `${b.name} closes`, text: `${b.name} of ${s.name} ceased trading (${why}).`, settlement: s.id, businesses: [b.id], people: ((P.get(last.person)?.died ?? 9999) >= year ? [last.person] : []), prereqs, fame: 0.05, x: b.x, y: b.y });
      b.closedBy = ev.id; return ev;
    }
    return null;
  };

  // ---------- main yearly loop
  const vesselsActive: Vessel[] = [];
  let seaRoutes: Map<string, { path: number[]; offshore: number } | null> = new Map();
  const offmap: number[] = []; // sea cells on map edges used as destinations
  for (let i = 0; i < N; i++) for (const c of [idx(i, 0), idx(i, N - 1), idx(0, i), idx(N - 1, i)]) if (T.sea[c]) offmap.push(c);
  const seaRouteFor = (s: Settlement) => {
    if (seaRoutes.has(s.id)) return seaRoutes.get(s.id)!;
    // nearest sea cell to the port
    let start = -1, bd = 1e9; const cx = s.cell % N, cy = (s.cell / N) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y) && T.sea[idx(x, y)] && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); start = idx(x, y); } }
    if (start < 0 || !offmap.length) { seaRoutes.set(s.id, null); return null; }
    const target = offmap.reduce((a, c) => (dist(c, start) > 12 && (a < 0 || dist(c, start) < dist(a, start)) ? c : a), -1);
    const path = target >= 0 ? aStar(start, target, c => T.sea[c] ? 1 + (T.coastDist[c] < CELL * 2 ? 0.4 : 0) : Infinity) : null;
    const res = path ? { path, offshore: target } : null; seaRoutes.set(s.id, res); return res;
  };

  for (let year = startYear; year <= endYear; year++) {
    const ec = econ(year); const act = settlementsAt(year);
    const war = atWar(year);
    // weather of the year
    const stormSev = r.exp(1.0) * (T.traits.windAngle > 0 ? 1 : 1);
    const floodScale = r.exp(1.0) * (0.6 + T.traits.aridity * 0.5);
    let stormEv: HEvent | null = null, floodEv: HEvent | null = null;
    if (stormSev > 2.5) { stormEv = addEvent({ kind: 'storm', year, title: `The Great Storm of ${year}`, text: `A violent storm struck the coast, with gales and a heavy sea.`, magnitude: stormSev, fame: Math.min(0.6, stormSev / 6) }); H.storms.push({ year, severity: stormSev, event: stormEv.id, windAngle: T.traits.windAngle + r.float(-0.6, 0.6) }); }
    else if (stormSev > 1.3) H.storms.push({ year, severity: stormSev, event: '', windAngle: T.traits.windAngle + r.float(-0.8, 0.8) });
    if (floodScale > 2.0) { floodEv = addEvent({ kind: 'flood', year, title: `The ${floodScale > 3 ? 'Great ' : ''}Flood of ${year}`, text: `Heavy rain swelled the rivers; low ground and crossings were swept by floodwater.`, magnitude: floodScale, fame: Math.min(0.7, floodScale / 6) }); H.floods.push({ year, scale: floodScale, event: floodEv.id }); }
    else if (floodScale > 1.2) H.floods.push({ year, scale: floodScale, event: '' });

    // --- settlements: growth, shocks
    for (const s of act) {
      const isFarm = s.kind === 'farmstead';
      const cx = s.cell % N, cy = (s.cell / N) | 0;
      let K: number;
      if (isFarm) { K = 9; }
      else {
        let ag = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y)) ag += L.agri[idx(x, y)]; }
        const techBoost = 1 + (year - startYear) / 140;
        K = 25 + ag * 5.5 * techBoost;
        const mine = H.mines.find(m => m.settlement === s.id && m.closed === undefined);
        if (mine) K += mine.produced > 0 ? 400 * Math.min(3, ec + 0.4) * (mine.method === 'open_pit' ? 4 : 1) : 150;
        if (s.port) K += 130 * ec * (1 + (year - startYear) / 120);
        const biz = bizAt(s); K += biz.reduce((a, b) => a + b.capacity * 4, 0);
        if (s.stationYear && s.stationYear <= year) K *= 1.5;
        if (s.kind === 'mining_town' && !mine) K *= 0.3;
        if (s.kind === 'seasonal_camp') K = 90;
        if (s.kind === 'military_settlement') K = 150;
        if (year > 1950) K *= (s.kind === 'agricultural_village' && !s.stationYear ? 0.9 : 1.2);
      }
      const rate = s.pop < K ? 0.035 : -0.04;
      s.pop = Math.max(1, s.pop + s.pop * rate * (1 - s.pop / K) * (s.pop < K ? 1 : -1) + (s.pop < K * 0.8 && !isFarm ? r.float(0, 3) : 0) + (!isFarm && r.chance(0.2) ? r.float(-2, 4) * (ec > 1 ? 1 : 0.5) : 0));
      if (s.pop > s.peak) { s.peak = s.pop; s.peakYear = year; }
      if (year % 5 === 0 || year === endYear) s.popHist[(year - startYear)] = Math.round(s.pop);
    }
    // --- founding of new settlements and farms
    const nonFarmCount = act.filter(q => q.kind !== 'farmstead' && q.kind !== 'seasonal_camp').length;
    for (const s of act) {
      if (s.kind === 'farmstead' || s.kind === 'seasonal_camp') continue;
      // farms around agricultural settlements
      if (['agricultural_village', 'trading_post', 'port_city', 'fishing_village', 'industrial_town', 'mining_town'].includes(s.kind) && s.pop > 30 && year < 1960) {
        const farms = farmCount.get(s.id) ?? 0;
        const target = Math.min(22, Math.floor(s.pop / (year < 1850 ? 9 : 22) * Math.min(1, agriSm[s.cell] * 2.2)));
        if (farms < target && r.chance(0.25)) {
          let bc = -1, sc2 = -1;
          for (let t = 0; t < 40; t++) { const x = (s.cell % N) + r.int(-5, 5), y = ((s.cell / N) | 0) + r.int(-5, 5); if (!inb(x, y)) continue; const c = idx(x, y);
            if (!buildable(c) || L.agri[c] < 0.25 || T.coastDist[c] < CELL) continue; if (farmOcc[c]) continue;
            if (dist(c, s.cell) < 1.2) continue; const sc = L.agri[c] + (waterNear(c) ? 0.3 : 0) + r.float(0, 0.3); if (sc > sc2) { sc2 = sc; bc = c; } }
          if (bc >= 0) { farmCount.set(s.id, (farmCount.get(s.id) ?? 0) + 1); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const fx = (bc % N) + dx, fy = ((bc / N) | 0) + dy; if (inb(fx, fy)) farmOcc[idx(fx, fy)] = 1; } const f = found(year, 'farmstead', bc, `Farm settled by a family from ${s.name} on good ${L.sediment[bc] === Sed.Alluvium ? 'river-bottom' : 'upland'} soil`, { parent: s.id }); poolOfFarms.push(f); const fam = (f as any).family;
            const head = newPerson(year, { occupation: 'farmer', residence: f.id, age: r.int(24, 45) }); head.surname = fam; head.name = `${head.given} ${fam}`; f.founderId = head.id; }
        }
      }
      const pBase = s.pop > 150 && nonFarmCount < settlementCap ? 0.006 + Math.min(0.012, s.pop / 20000) : 0;
      if (r.chance(pBase * (year > 1900 ? 0.3 : 1))) {
        let bc = -1, sc2 = -1;
        for (let t = 0; t < 120; t++) {
          const ang = r.float(0, Math.PI * 2), d = r.float(5, 28); const x = Math.round((s.cell % N) + Math.cos(ang) * d), y = Math.round(((s.cell / N) | 0) + Math.sin(ang) * d); if (!inb(x, y)) continue; const c = idx(x, y);
          if (!buildable(c) || !waterNear(c)) continue;
          if (act.some(o => o.kind !== 'farmstead' && dist(o.cell, c) < 9)) continue;
          const sc = agriSm[c] * 2 + (coastal(c) ? 0.6 : 0) + (nearCells(c, 1, k => T.Q[k] > RIVER_Q) ? 0.5 : 0) - d * 0.02 + r.float(0, 0.4);
          if (sc > sc2) { sc2 = sc; bc = c; }
        }
        if (bc >= 0 && sc2 > 0.9) {
          const k: SKind = coastal(bc) ? (r.chance(0.5) ? 'fishing_village' : 'port_city') : (nearCells(bc, 1, k2 => T.Q[k2] > RIVER_Q) && r.chance(0.35) ? 'trading_post' : 'agricultural_village');
          const reason = k === 'fishing_village' ? `Fishermen from ${s.name} settled a sheltered cove with good landing` : k === 'trading_post' ? `A trading post at a river crossing, supplied from ${s.name}` : `Daughter settlement of ${s.name} on fertile land, founded as ${s.name}'s population outgrew its fields`;
          const ns = found(year, k === 'port_city' && coastal(bc) && T.coastDist[bc] > CELL * 1.8 ? 'fishing_village' : k, bc, reason, { parent: s.id });
          const fp = newPerson(year, { occupation: 'settler', residence: ns.id, fame: 0.2, role: 'founder' }); ns.founderId = fp.id;
          addEvent({ kind: 'founding', year, title: `${ns.name} is founded`, text: `${fp.name} and a party of families from ${s.name} founded ${ns.name}. ${reason}.`, settlement: ns.id, people: [fp.id], x: ns.x, y: ns.y, prereqs: [], fame: 0.3 });
        }
      }
    }
    // --- mineral discovery and mining
    for (const d of D.deposits) {
      const st = depState.get(d.id)!;
      if (st.status === 'active') {
        const mine = H.mines.find(m => m.id === st.mineId)!;
        const cap = (d.bulk ? 20000 : 2500) * (year > 1900 ? (d.bulk ? 6 : 3) : 1) * (mine.method === 'open_pit' ? 3 : 1) * ec;
        const out = Math.min(cap, d.tonnage * 0.9 - st.mined);
        st.mined += Math.max(0, out); mine.produced += d.commodity === 'gold' ? Math.max(0, out) * d.grade / 31.1 : Math.max(0, out);
        const s = S.get(mine.settlement)!;
        const exhaust = st.mined >= d.tonnage * 0.85;
        const crash = ec < 0.55 && r.chance(0.15);
        if (exhaust || crash || (year - mine.opened > 70 && r.chance(0.08))) {
          const why = exhaust ? 'the workable ore was exhausted' : crash ? 'it was no longer profitable in the depression' : 'its owners wound it up';
          mine.closed = year; mine.reason = why; st.status = 'closed'; st.lastClosed = year;
          const co = B.get(mine.company)!; closeBusiness(co, year, exhaust ? 'ore exhausted' : crash ? 'bankrupt in the slump' : 'wound up', 'mine_closed', [mine.discoveryEvent]);
          addEvent({ kind: 'mine_closed', year, title: `${mine.claimName} closes`, text: `${mine.claimName} closed because ${why}. ${s.name} began to lose population.`, settlement: s.id, deposit: d.id, businesses: [co.id], x: mine.x, y: mine.y, prereqs: [mine.discoveryEvent], fame: 0.25, magnitude: mine.produced });
          s.pop *= 0.82;
        }
        continue;
      }
      if (!isLode(d) || d.viableFrom === null) continue;
      if (st.status === 'closed' && (year - (st.lastClosed ?? year) < 25 || d.viableFrom > year || st.mined > d.tonnage * 0.5)) continue;
      if (year < d.viableFrom - 3 && st.status === 'undiscovered') { /* prospectors may still find the outcrop */ }
      // who is near enough to prospect it?
      const near = act.filter(s => s.kind !== 'seasonal_camp' && dist(s.cell, d.cell) < (year < 1800 ? 40 : year < 1900 ? 60 : 80) && s.pop > 40);
      if (!near.length) continue;
      const nearest = near.reduce((a, b) => dist(a.cell, d.cell) < dist(b.cell, d.cell) ? a : b);
      const prox = 1 - dist(nearest.cell, d.cell) / 90;
      const expo = Math.min(1.6, d.surfaceRadius / 300);
      let p = st.status === 'undiscovered' ? 0.014 * expo * prox * (1 + Math.min(1, nearest.pop / 1500)) : 0.04;
      if (year < d.viableFrom) p *= 0.0; // found but not workable: handled below as a prospect without a mine
      if (!r.chance(p * Math.max(0.4, ec))) continue;
      // discovery (and reopening by new owners after technology made it pay)
      const finder = newPerson(year, { occupation: d.commodity === 'coal' ? 'collier' : 'prospector', residence: nearest.id, fame: 0.35, role: 'discoverer' });
      const disc = addEvent({ kind: 'mining_discovery', year, title: `${d.commodity === 'gold' ? 'Gold' : d.commodity === 'copper' ? 'Copper' : d.commodity === 'lead-zinc' ? 'Lead-zinc ore' : d.commodity === 'iron' ? 'Iron ore' : d.commodity === 'coal' ? 'Coal' : 'Minerals'} found near ${nearest.name}`, text: `${finder.name}, a ${finder.occupation}, found ${d.commodity} in ${d.expression.toLowerCase()}, about ${(dist(nearest.cell, d.cell) * CELL / 1000).toFixed(0)} km from ${nearest.name}.`, settlement: nearest.id, deposit: d.id, people: [finder.id], x: d.x, y: d.y, fame: 0.4 });
      st.status = 'active'; st.discovered = st.discovered ?? year;
      const method: Mine['method'] = d.kind === 'coal' ? (d.depthToTop < 5 ? 'open_pit' : 'adit') : d.kind === 'evaporite' ? 'quarry' : d.bulk && year >= 1900 ? 'open_pit' : d.depthToTop < 3 && d.expression.includes('slope') ? 'adit' : r.chance(0.5) ? 'adit' : 'shaft';
      // mining settlement
      let town: Settlement | undefined = H.settlements.find(s => s.kind === 'mining_town' && s.depositId === d.id && active(s, year));
      const claim = `${finder.surname}${r.pick(["'s Lode", ' Mine', ' Diggings', ' Claim'])}`;
      if (!town) {
        let bc = -1, sc2 = -1e9;
        for (let t = 0; t < 40; t++) { const x = (d.cell % N) + r.int(-3, 3), y = ((d.cell / N) | 0) + r.int(-3, 3); if (!inb(x, y)) continue; const c = idx(x, y); if (!buildable(c) || dist(c, d.cell) < 0.6) continue; const sc = (waterNear(c) ? 1 : 0) - dist(c, d.cell) * 0.2 - T.slope[c] * 0.05 + r.float(0, 0.4); if (sc > sc2) { sc2 = sc; bc = c; } }
        if (bc < 0) bc = d.cell;
        town = found(year + 1, 'mining_town', bc, `A camp that grew into a town around ${claim} after ${finder.name}'s discovery`, { parent: nearest.id, depositId: d.id, pop: 60 });
        town.pop = r.int(60, 220); town.peak = town.pop;
        addEvent({ kind: 'founding', year: year + 1, title: `${town.name} is founded`, text: `Miners gathered at ${claim} and built a camp that became ${town.name}.`, settlement: town.id, deposit: d.id, prereqs: [disc.id], x: town.x, y: town.y, fame: 0.35, people: [finder.id] });
      }
      const co = foundBusiness(town, { kind: 'mine_company', trade: d.commodity === 'coal' ? 'Colliery Company' : 'Mining Company', from: year, minPop: 0, perPop: 0, chance: 0, tokens: true, scale: 5 }, year + 1, { depositId: d.id, tokenFrom: year + 1, tokenTo: year + 1 + r.int(8, 30), x: d.x, y: d.y });
      const mine: Mine = { id: `M${++miN}`, deposit: d.id, settlement: town.id, company: co.id, opened: year + 1, method, commodity: d.commodity, produced: 0, unit: d.commodity === 'gold' ? 'oz' : 't', x: d.x, y: d.y, discoveryEvent: disc.id, discoverer: finder.id, tailingsRadius: 70 + r.float(0, 120), claimName: claim };
      H.mines.push(mine); st.mineId = mine.id;
      const op = addEvent({ kind: 'mine_opened', year: year + 1, title: `${claim} opens`, text: `${co.name} opened ${claim} (${method.replace('_', ' ')} working) beside ${town.name}.`, settlement: town.id, deposit: d.id, businesses: [co.id], prereqs: [disc.id], x: mine.x, y: mine.y, fame: 0.3 });
      addEvent({ kind: 'boom', year: year + 2, title: `${town.name} booms`, text: `News of ${claim} drew hundreds of workers and storekeepers to ${town.name}.`, settlement: town.id, deposit: d.id, prereqs: [op.id], fame: 0.3 });
      if (year >= 1900 && d.bulk) town.pop = 700;
    }
    // --- placer gold rushes
    if (year >= 1700 && year <= endYear - 8 && r.chance(0.04 * Math.min(1.3, ec))) {
      const trains = D.placers.filter(p => { const d = D.deposits.find(q => q.id === p.sourceId)!; const peak = p.cells.reduce((a, c) => c.richness > a.richness ? c : a, p.cells[0]); return !H.events.some(e => e.kind === 'gold_rush' && e.deposit === p.sourceId) && act.some(s => dist(s.cell, peak.cell) < 45) && d.grade > 2; });
      if (trains.length) {
        const tr = r.pick(trains); const d = D.deposits.find(q => q.id === tr.sourceId)!;
        const peak = tr.cells.reduce((a, c) => c.richness > a.richness ? c : a, tr.cells[0]);
        const nearest = act.reduce((a, b) => dist(a.cell, peak.cell) < dist(b.cell, peak.cell) ? a : b);
        const finder = newPerson(year, { occupation: 'prospector', residence: nearest.id, fame: 0.5, role: 'discoverer' });
        const creek = peak.cell; const rushLen = r.int(2, 6);
        const ev = addEvent({ kind: 'gold_rush', year, title: `Gold found in the creek near ${nearest.name}`, text: `${finder.name} washed coarse gold from the gravels of a creek about ${(dist(nearest.cell, creek) * CELL / 1000).toFixed(0)} km from ${nearest.name}. Within months hundreds of diggers had staked claims along the bars.`, settlement: nearest.id, deposit: d.id, people: [finder.id], x: cellCenter(creek)[0], y: cellCenter(creek)[1], cell: creek, fame: 0.55, extra: { train: tr.sourceId, rushLen } });
        let bc = creek; let bs2 = -1e9;
        for (let t = 0; t < 30; t++) { const x = (creek % N) + r.int(-2, 2), y = ((creek / N) | 0) + r.int(-2, 2); if (!inb(x, y)) continue; const c = idx(x, y); if (!buildable(c)) continue; const sc = -dist(c, creek) - T.slope[c] * 0.1 + r.float(0, 0.5); if (sc > bs2) { bs2 = sc; bc = c; } }
        const camp = found(year, 'seasonal_camp', bc, `A diggings camp on the creek after ${finder.name}'s gold strike`, { parent: nearest.id, depositId: d.id });
        camp.pop = r.int(300, 2200); camp.peak = camp.pop; camp.abandoned = year + rushLen; camp.abandonReason = 'the creek gravels were worked out'; camp.current = false;
        camp.radius = 160;
        addEvent({ kind: 'founding', year, title: `${camp.name} diggings`, text: `A tent town of ${Math.round(camp.pop)} diggers sprang up at ${camp.name}.`, settlement: camp.id, prereqs: [ev.id], x: camp.x, y: camp.y, fame: 0.3 });
        for (const c of tr.cells) if (dist(c.cell, creek) < 5 && c.richness > peak.richness * 0.25) H.placerWorked[c.cell] = [year, year + rushLen];
        addEvent({ kind: 'abandonment', year: year + rushLen, title: `${camp.name} is abandoned`, text: `The richest gravels were worked out and the diggers moved on, leaving ${camp.name} empty.`, settlement: camp.id, prereqs: [ev.id], fame: 0.2 });
        // the lode may now be sought by others (discovery chain: placer -> source)
        const st = depState.get(d.id)!; if (st.status === 'undiscovered' && d.viableFrom !== null && r.chance(0.5)) st.discovered = year;
      }
    }
    // --- industries and businesses
    for (const s of act) {
      if (s.kind === 'farmstead' || s.kind === 'seasonal_camp') continue;
      for (const def of INDUSTRIES) {
        if (year < def.from || (def.to && year > def.to) || s.pop < def.minPop) continue;
        const have = bizCount.get(s.id + '|' + def.kind) ?? 0;
        const cap = Math.max(1, Math.floor(s.pop / def.perPop) + (def.minPop <= 50 ? 1 : 0));
        if (have >= cap) continue; if (def.needs && !def.needs(s, ctx, year)) continue;
        if (r.chance(def.chance * Math.min(1.4, ec))) foundBusiness(s, def, year);
      }
    }
    // business life cycle: owner death, closure, sale, fire
    for (const b of H.businesses) {
      if (b.closed !== undefined || b.founded > year || b.kind === 'mine_company') continue;
      const s = S.get(b.settlement)!; const last = b.owners[b.owners.length - 1]; const owner = P.get(last.person)!;
      if (owner.died !== null && owner.died <= year && last.to === null) {
        if (r.chance(0.55) && year < 2005) { const heir = newPerson(year, { occupation: owner.occupation, residence: s.id, age: r.int(25, 45) }); if (r.chance(0.7)) { heir.surname = owner.surname; heir.name = `${heir.given} ${owner.surname}`; } last.to = year; b.owners.push({ person: heir.id, from: year, to: null, how: heir.surname === owner.surname ? 'inherited' : 'sold on the owner\'s death' });
          if (b.scale >= 3) addEvent({ kind: 'business_sold', year, title: `${b.name} changes hands`, text: `On the death of ${owner.name}, ${b.name} passed to ${heir.name}.`, settlement: s.id, businesses: [b.id], people: [owner.id, heir.id], fame: 0.02 }); }
        else closeBusiness(b, year, 'the owner died and no one took it on');
        continue;
      }
      const hazard = 0.025 + (ec < 0.7 ? 0.05 : 0) + (s.pop < s.peak * 0.5 ? 0.08 : 0) + (b.kind === 'livery' && year > 1925 ? 0.15 : 0) + (b.kind === 'saddlery' && year > 1925 ? 0.1 : 0) + (b.kind === 'blacksmith' && year > 1930 ? 0.07 : 0);
      if (r.chance(hazard) || (s.abandoned !== undefined && s.abandoned <= year)) {
        const why = s.abandoned !== undefined && s.abandoned <= year ? 'the town was abandoned' : ec < 0.7 ? 'bankrupt in the depression' : r.chance(0.5) ? 'sold up and left' : 'could not compete';
        closeBusiness(b, year, why);
      }
      if (b.kind === 'jeweler' || b.kind === 'general_store') { /* leave */ }
    }
    // --- roads
    const actNF = act.filter(s => s.kind !== 'farmstead' && s.kind !== 'seasonal_camp' || s.kind === 'seasonal_camp');
    for (const s of actNF) {
      if (s.kind === 'seasonal_camp' && year > s.founded + 1) continue;
      const linked = linkedIds.has(s.id);
      if (!linked && year >= s.founded + 1 && actNF.length > 1) {
        const cands = actNF.filter(o => o.id !== s.id && o.kind !== 'seasonal_camp' && dist(o.cell, s.cell) < 60).sort((a, b) => dist(a.cell, s.cell) - dist(b.cell, s.cell));
        const to = cands[0]; if (to) { const rt = addRoute('track', s, to, year + r.int(0, 2), `${s.name} needed a way to ${to.name}`, roadCost); if (rt) addEvent({ kind: 'road_built', year: rt.built, title: `Track opened from ${s.name} to ${to.name}`, text: `A cart track was cut between ${s.name} and ${to.name}.`, settlement: s.id, route: rt.id, prereqs: [], fame: 0.05 }); }
      }
    }
    if (year % 4 === 0) for (const a of actNF) for (const b of actNF) {
      if (a.id >= b.id || a.kind === 'seasonal_camp' || b.kind === 'seasonal_camp' || connected(a, b, ['track', 'road', 'highway'])) continue;
      const d = dist(a.cell, b.cell); if (d > 22 || a.pop + b.pop < 900) continue;
      if (r.chance(0.04) && (roadDeg.get(a.id) ?? 0) < 3 && (roadDeg.get(b.id) ?? 0) < 3) { roadDeg.set(a.id, (roadDeg.get(a.id) ?? 0) + 1); roadDeg.set(b.id, (roadDeg.get(b.id) ?? 0) + 1); const rt = addRoute('road', a, b, year, `traffic between ${a.name} and ${b.name}`, roadCost); if (rt) addEvent({ kind: 'road_built', year, title: `${a.name}–${b.name} road`, text: `A road was surveyed and built between ${a.name} and ${b.name}.`, settlement: a.id, route: rt.id, fame: 0.05 }); }
    }
    for (const rt of H.routes) {
      if (rt.kind === 'track' && !rt.closed && year > rt.built + 12 && year >= 1790 && r.chance(0.05)) { rt.kind = 'road'; rt.upgrades.push([year, 'road']); rt.width = 5; }
    }
    // bridges and ferries
    for (const x of H.crossings) {
      if (x.kind === 'railway' as any) continue; const rt = H.routes.find(q => q.id === x.route)!; if (rt.closed || rt.lifted) continue;
      if (x.built > year) continue;
      if (x.kind !== 'bridge' && year >= 1790 && r.chance(0.03 + (year > 1880 ? 0.03 : 0))) { const old = x.kind; x.kind = 'bridge'; x.replaced = year; x.replacedBy = old;
        const a = S.get(rt.from)!, b = S.get(rt.to)!;
        addEvent({ kind: 'infrastructure', year, title: `Bridge built on the ${a.name}–${b.name} ${rt.kind}`, text: `A ${year > 1880 ? 'steel' : 'timber'} bridge replaced the old ${old}.`, route: rt.id, x: x.x, y: x.y, fame: 0.1 }); }
      if (floodEv && x.stream > floodScale * 0.35 && x.kind === 'bridge' && r.chance(0.35)) { (x.destroyed ??= []).push({ year, event: floodEv.id }); }
    }
    // --- railways
    if (year >= 1830) {
      const hubs = act.filter(s => (s.port || s.pop > 1500) && s.kind !== 'farmstead' && s.kind !== 'seasonal_camp');
      const ends = act.filter(s => s.kind !== 'farmstead' && s.kind !== 'seasonal_camp' && s.pop > 500);
      if (hubs.length && r.chance(0.07 * ec)) {
        const a = r.pick(hubs); const bs = ends.filter(b => b.id !== a.id && dist(a.cell, b.cell) > 7 && dist(a.cell, b.cell) < 80 && !connected(a, b, ['railway']) && !H.routes.some(rt => rt.kind === 'railway' && !rt.lifted && (rt.from === b.id || rt.to === b.id) && false));
        const scored = bs.map(b => ({ b, v: (a.pop + b.pop) / (1 + dist(a.cell, b.cell) * 12) + (b.kind === 'mining_town' ? 4 : 0) })).sort((x, y) => y.v - x.v);
        const pick = scored[0]; if (process.env.DBG) console.log('rail try', year, a.name, pick && pick.b.name, pick && pick.v, scored.length);
        if (pick && pick.v > 0.9) {
          const rt = addRoute('railway', a, pick.b, year, `to carry ${pick.b.kind === 'mining_town' ? 'ore' : 'freight and passengers'} between ${a.name} and ${pick.b.name}`, railCost, {});
          if (rt) {
            const rcoName = `${a.name} & ${pick.b.name} Railway Company`; const prez = newPerson(year, { occupation: 'railway promoter', residence: a.id, fame: 0.5, role: 'promoter' });
            const co = foundBusiness(a, { kind: 'railway_company', trade: 'Railway', from: year, minPop: 0, perPop: 0, chance: 0, scale: 6 }, year, {}); co.name = rcoName; co.owners[0].person = prez.id;
            rt.company = co.id; const build = Math.max(1, Math.round(rt.path.length / 12)); rt.opened = year + build; rt.built = year;
            const c1 = addEvent({ kind: 'railway_construction', year, title: `Construction of the ${rt.name}`, text: `${rcoName} began laying a line from ${a.name} to ${pick.b.name}, about ${(rt.path.length * CELL / 1000).toFixed(0)} km long.`, settlement: a.id, route: rt.id, people: [prez.id], businesses: [co.id], fame: 0.35 });
            const c2 = addEvent({ kind: 'railway_opening', year: rt.opened, title: `Opening of the ${rt.name}`, text: `The first train ran between ${a.name} and ${pick.b.name}.`, settlement: a.id, route: rt.id, prereqs: [c1.id], fame: 0.4, businesses: [co.id] });
            rt.eventId = c2.id;
            a.stationYear = Math.min(a.stationYear ?? 9999, rt.opened); pick.b.stationYear = Math.min(pick.b.stationYear ?? 9999, rt.opened);
            for (const s of act) if (s.id !== a.id && s.id !== pick.b.id && s.kind !== 'farmstead' && rt.path.some(c => dist(c, s.cell) < 1.8)) s.stationYear = Math.min(s.stationYear ?? 9999, rt.opened + 1);
            // water-stop communities on long lines
            if (rt.path.length > 28 && r.chance(0.6)) {
              const mid = rt.path.filter((_, i) => i > 8 && i < rt.path.length - 8).filter(c => buildable(c) && waterNear(c) && act.every(o => o.kind === 'farmstead' || dist(o.cell, c) > 6)); if (mid.length) { const c = r.pick(mid); const rc = found(rt.opened, 'railway_community', c, `A siding, water tank and section houses where the ${rt.name} crossed a stream`, { parent: a.id }); rc.stationYear = rt.opened; rc.pop = r.int(15, 50); rc.peak = rc.pop; addEvent({ kind: 'founding', year: rt.opened, title: `${rc.name} siding`, text: `${rc.name} grew around a water tank and siding on the ${rt.name}.`, settlement: rc.id, prereqs: [c2.id], fame: 0.1 }); }
            }
          }
        }
      }
    }
    // rail decline
    if (year >= 1935) for (const rt of H.routes) {
      if (rt.kind !== 'railway' || rt.closed || (rt.opened ?? 9999) > year) continue;
      const a = S.get(rt.from)!, b = S.get(rt.to)!;
      const mineAlive = H.mines.some(m => m.closed === undefined && (m.settlement === a.id || m.settlement === b.id));
      const p = (mineAlive ? 0.004 : 0.03) * (year > 1960 ? 2 : 1) * (a.pop + b.pop < 3000 ? 1.5 : 0.6);
      if (r.chance(p)) { rt.closed = year; rt.lifted = year + r.int(1, 4);
        const cl = addEvent({ kind: 'railway_closure', year, title: `The ${rt.name} closes`, text: `Road competition and falling freight ended services on the ${rt.name}. The rails were lifted within a few years.`, route: rt.id, prereqs: rt.eventId ? [rt.eventId] : [], fame: 0.25, settlement: active(a, year) ? a.id : active(b, year) ? b.id : undefined });
        for (const s of [a, b]) if (s.stationYear && s.kind !== 'port_city') s.pop *= 0.9; void cl; }
    }
    // highways: modern routes bypass old roads
    if (year >= 1925 && year % 5 === 0 && r.chance(0.5)) {
      const big = act.filter(s => s.pop > 1200 && s.kind !== 'farmstead').sort((x, y) => y.pop - x.pop).slice(0, 5);
      if (big.length >= 2) {
        const a = big[0], b = r.pick(big.slice(1));
        if (!connected(a, b, ['highway'])) {
          const rt = addRoute('highway', a, b, year, `a paved highway between ${a.name} and ${b.name}`, c => L.traverse[c] * (L.traverse[c] > 3 ? 2 : 1));
          if (rt) {
            const hw = addEvent({ kind: 'road_built', year, title: `${rt.name} opens`, text: `The new paved highway opened between ${a.name} and ${b.name}.`, route: rt.id, settlement: a.id, fame: 0.2 });
            const hwSet = new Set(rt.path);
            for (const old of H.routes) {
              if (old.kind === 'highway' || old.kind === 'railway' || old.closed || old.id === rt.id) continue;
              const share = old.path.filter(c => hwSet.has(c)).length / old.path.length;
              if (share < 0.45 && old.path.length > 6 && ((old.from === a.id && old.to === b.id) || (old.from === b.id && old.to === a.id)) && r.chance(0.8)) { old.closed = year + r.int(1, 6); addEvent({ kind: 'road_closed', year: old.closed, title: `Old ${old.name} abandoned`, text: `Traffic moved to the new highway and the old road was left to the weather.`, route: old.id, prereqs: [hw.id], fame: 0.05 }); }
            }
          }
        }
      }
    }
    // --- ships and wrecks
    if (year >= startYear + 2) {
      for (const s of act) {
        if (!s.port || s.pop < 60) continue; if (!seaRouteFor(s)) continue;
        if (vesselsActive.filter(v0 => v0.homePort === s.id).length < Math.min(14, s.pop / 150) && r.chance(Math.min(0.12, s.pop / 14000) * ec)) {
          const types = year < 1800 ? ['sloop', 'ketch', 'brig'] : year < 1860 ? ['schooner', 'brig', 'barque', 'sidewheel steamer'] : year < 1930 ? ['schooner', 'steamer', 'collier', 'barque'] : ['coaster', 'trawler', 'motor freighter'];
          const type = r.pick(types); const steam = /steam|collier|freighter/.test(type) && year >= 1840; const diesel = /coaster|trawler|motor/.test(type);
          const cap = newPerson(year, { occupation: 'ship master', residence: s.id, age: r.int(28, 52) });
          const v: Vessel = { id: `V${++vsN}`, name: namer.vessel(), type, hull: year < 1860 ? 'wood' : r.chance(0.5) ? 'iron' : 'steel', power: diesel ? 'diesel' : steam ? 'steam' : 'sail', built: year - r.int(0, 8), tonnage: Math.round(r.logNormal(120, 0.6)), homePort: s.id, captain: cap.id, crew: [], cargo: r.pick(['timber', 'general cargo', 'salted fish', 'barrelled flour', 'coal', 'ore concentrate', 'manufactured goods', 'bricks', 'barrelled beer']) };
          if (v.hull === 'steel' && year < 1880) v.hull = 'iron'; if (diesel) v.hull = 'steel';
          for (let i = 0; i < r.int(3, 10); i++) v.crew.push(newPerson(year, { occupation: 'seaman', residence: s.id, age: r.int(17, 50) }).id);
          H.vessels.push(v); vesselsActive.push(v); (v as any).retire = year + r.int(14, 38);
        }
      }
      for (const v of vesselsActive.slice()) {
        if (v.lost !== undefined) continue;
        if (year >= (v as any).retire) { vesselsActive.splice(vesselsActive.indexOf(v), 1); continue; }
        const hazard = 0.008 + (stormSev > 1.8 ? 0.05 * stormSev : 0) + (v.power === 'sail' ? 0.006 : 0);
        if (!r.chance(hazard)) continue;
        const home = S.get(v.homePort)!; const route = seaRouteFor(home); if (!route) continue;
        const nearCoast = route.path.filter(c => T.coastDist[c] <= CELL * 3.5 && dist(c, home.cell) > 2);
        const wc = nearCoast.length ? r.pick(nearCoast) : route.path[Math.min(route.path.length - 1, 3)];
        const [wx, wy] = cellCenter(wc);
        v.lost = year; vesselsActive.splice(vesselsActive.indexOf(v), 1);
        const liveCrew = v.crew.filter(id => { const q = P.get(id)!; return q.died === null || q.died >= year; }); const lostCrew = Math.min(liveCrew.length, r.int(0, liveCrew.length)); const dead: string[] = [];
        for (let i = 0; i < lostCrew; i++) { const p = P.get(liveCrew[i])!; p.died = year; p.deathCause = 'drowned in the wreck of the ' + v.name; dead.push(p.id); }
        let cap = P.get(v.captain!)!; if (cap.died !== null && cap.died < year) { cap = newPerson(year, { occupation: 'ship master', residence: home.id, age: r.int(32, 58) }); }
        const capDies = r.chance(0.35); if (capDies) { cap.died = year; cap.deathCause = 'drowned in the wreck of the ' + v.name; dead.push(cap.id); }
        const stormRec = H.storms.find(s2 => s2.year === year); const wind = stormRec?.windAngle ?? T.traits.windAngle;
        const evSet = active(home, year) ? home.id : undefined;
        const ev = addEvent({ kind: 'shipwreck', year, title: `Wreck of the ${v.name}`, text: `The ${v.type} ${v.name} (${v.tonnage} tons, bound from ${home.name} with ${v.cargo}; master ${cap.name}) was driven onto the shore ${(T.coastDist[wc] / 1000).toFixed(1)} km off the coast${lostCrew ? `; ${lostCrew + (capDies ? 1 : 0)} lives were lost` : '; all hands were saved'}.`, settlement: evSet, vessel: v.id, x: wx, y: wy, cell: wc, people: [cap.id, ...dead.filter(d => d !== cap.id).slice(0, 6)], magnitude: lostCrew, prereqs: stormRec?.event ? [stormRec.event] : [], fame: 0.35 + Math.min(0.5, lostCrew * 0.08), extra: { windAngle: wind, cargo: v.cargo } });
        if (lostCrew + (capDies ? 1 : 0) < v.crew.length + 1 && r.chance(0.5)) {
          const hero = newPerson(year, { occupation: r.pick(['fisherman', 'lighthouse keeper', 'harbour pilot', 'farmer']), residence: evSet ?? home.id, fame: 0.5, role: 'rescuer' });
          addEvent({ kind: 'rescue', year, title: `${hero.name} rescues survivors of the ${v.name}`, text: `${hero.name} put out through the surf and brought survivors of the ${v.name} ashore. The ${polityAt(year).name} awarded a medal for gallantry.`, settlement: evSet, vessel: v.id, people: [hero.id], prereqs: [ev.id], x: wx, y: wy, fame: 0.5, extra: { medal: true } });
        }
      }
    }
    // --- fires
    for (const s of act) {
      if (s.kind === 'farmstead' || s.pop < 60) continue; const pf = 0.006 + s.pop / 90000 + (year < 1880 ? 0.006 : 0) + (s.kind === 'mining_town' ? 0.01 : 0);
      if (!r.chance(pf)) continue;
      const frac = r.float(0.2, 0.9); s.burnt.push(year);
      const ev = addEvent({ kind: 'fire', year, title: `Fire at ${s.name}`, text: `Fire swept ${s.name}, destroying about ${Math.round(frac * 100)}% of its buildings.`, settlement: s.id, x: s.x, y: s.y, magnitude: frac, fame: 0.2 + frac * 0.3 });
      s.pop *= 1 - frac * 0.3;
      for (const b of bizAt(s)) if (r.chance(frac * 0.6)) { if (r.chance(0.5)) closeBusiness(b, year, 'destroyed by fire', 'industrial_closure', [ev.id]); }
      if (frac > 0.7 && r.chance(0.2) && s.kind !== 'mining_town') { // relocation: the burnt site is not rebuilt
        let bc = -1, sc2 = -1; for (let t = 0; t < 60; t++) { const x = (s.cell % N) + r.int(-6, 6), y = ((s.cell / N) | 0) + r.int(-6, 6); if (!inb(x, y)) continue; const c = idx(x, y); if (!buildable(c) || dist(c, s.cell) < 3 || !waterNear(c)) continue; const sc = L.agri[c] + r.float(0, 0.5); if (sc > sc2) { sc2 = sc; bc = c; } }
        if (bc >= 0) { const ns = found(year + 1, s.kind === 'port_city' && !coastal(bc) ? 'agricultural_village' : s.kind, bc, `${s.name} was rebuilt on a new site after the fire of ${year}`, { relocatedFrom: s.id, parent: s.id }); ns.name = s.name.replace(/ \(New\)$/, '') + ' (New)'; ns.pop = s.pop; ns.peak = s.pop; s.abandoned = year + 1; s.abandonReason = `the town moved to a new site after the fire of ${year}`; s.relocatedTo = ns.id; s.current = false;
          addEvent({ kind: 'relocation', year: year + 1, title: `${s.name} moves`, text: `After the fire the townspeople chose a new site ${(dist(s.cell, bc) * CELL / 1000).toFixed(1)} km away and the old townsite was left.`, settlement: ns.id, prereqs: [ev.id], x: ns.x, y: ns.y, fame: 0.3 }); }
      }
    }
    // --- floods
    if (floodEv) for (const s of act) {
      if (s.kind === 'farmstead' || !L.floodplain[s.cell] || s.kind === 'seasonal_camp') continue;
      if (r.chance(0.5)) { s.flooded.push(year); s.pop *= 1 - Math.min(0.2, floodScale * 0.04); if (floodScale > 3.3) addEvent({ kind: 'flood', year, title: `${s.name} flooded`, text: `Floodwater covered the low streets of ${s.name}.`, settlement: s.id, prereqs: [floodEv.id], x: s.x, y: s.y, fame: 0.1, magnitude: floodScale }); }
    }
    // --- epidemics
    if (r.chance(0.012) && year < 1950) { const sev = r.float(0.04, 0.2); for (const s of act) s.pop *= 1 - sev; addEvent({ kind: 'epidemic', year, title: `Epidemic of ${year}`, text: `Fever swept the settlements; roughly ${Math.round(sev * 100)}% of the population died.`, magnitude: sev, fame: 0.2 }); }
    // --- conflicts
    if (war && war.local && year === war.from) {
      const fortSite = act.filter(s => s.kind !== 'farmstead' && s.kind !== 'seasonal_camp' && s.pop > 100); if (fortSite.length) {
        const host = r.pick(fortSite);
        let bc = -1; for (let t = 0; t < 40; t++) { const x = (host.cell % N) + r.int(-3, 3), y = ((host.cell / N) | 0) + r.int(-3, 3); if (!inb(x, y)) continue; const c = idx(x, y); if (buildable(c) && T.elev[c] >= T.elev[host.cell] - 3 && dist(c, host.cell) > 0.8) { bc = c; break; } }
        const wev = addEvent({ kind: 'conflict', year, title: `The ${war.name} begins`, text: `War broke out between ${war.sides[0]} and ${war.sides[1]}. A militia was raised at ${host.name}.`, settlement: host.id, fame: 0.45, extra: { war: war.id } });
        if (bc >= 0) {
          const fort = found(year, 'military_settlement', bc, `A stockade and barracks raised for the ${war.name}`, { parent: host.id }); fort.pop = r.int(40, 160); fort.peak = fort.pop; fort.name = `Fort ${fort.name}`; fort.abandoned = war.to + r.int(1, 12); fort.abandonReason = 'the garrison was withdrawn after the war'; fort.current = false; fort.radius = 70;
          const bt = addEvent({ kind: 'battle', year: Math.min(war.to, year + r.int(0, 3)), title: `Skirmish near ${fort.name}`, text: `Militia and regulars exchanged fire in a day-long skirmish near ${fort.name}.`, settlement: fort.id, x: fort.x + r.float(-900, 900), y: fort.y + r.float(-900, 900), prereqs: [wev.id], people: [], fame: 0.4, extra: { war: war.id } });
          addEvent({ kind: 'founding', year, title: `${fort.name} built`, text: `${fort.name} was built to hold the road against raids.`, settlement: fort.id, prereqs: [wev.id], x: fort.x, y: fort.y, fame: 0.2 }); void bt;
        }
      }
    }
    if (war && !war.local && year === war.from + 1 && r.chance(0.8)) {
      const host = act.filter(s => s.pop > 400 && s.kind !== 'farmstead').sort((a, b) => b.pop - a.pop)[0];
      if (host) addEvent({ kind: 'conflict', year, title: `${host.name} sends men to the ${war.name}`, text: `Hundreds of men from ${host.name} enlisted for the ${war.name}; a drill hall and recruiting office opened.`, settlement: host.id, fame: 0.25, extra: { war: war.id, distant: true } });
    }
    if (war && war.id === 'W5' && year === 1941 && war.local) {
      const host = act.filter(s => s.pop > 300 && s.kind !== 'farmstead' && (s.port || T.coastDist[s.cell] < CELL * 8)).sort((a, b) => b.pop - a.pop)[0];
      if (host) { let bc = -1; for (let t = 0; t < 60; t++) { const x = (host.cell % N) + r.int(-5, 5), y = ((host.cell / N) | 0) + r.int(-5, 5); if (inb(x, y) && buildable(idx(x, y)) && T.slope[idx(x, y)] < 3 && dist(idx(x, y), host.cell) > 1.5) { bc = idx(x, y); break; } }
        if (bc >= 0) { const af = found(1941, 'military_settlement', bc, 'A wartime training camp and airfield', { parent: host.id }); af.name = `${af.name} Field`; af.pop = 500; af.peak = 500; af.abandoned = 1946 + r.int(0, 10); af.abandonReason = 'the base was closed after the war'; af.current = false; af.radius = 260;
          addEvent({ kind: 'founding', year: 1941, title: `${af.name} airfield opens`, text: `A training camp and airfield were built near ${host.name}.`, settlement: af.id, fame: 0.25, x: af.x, y: af.y }); } }
    }
    // --- robberies and hidden caches
    if (year >= 1690 && r.chance(0.035 + 0.02 * Math.min(1, ec))) {
      const banks = H.businesses.filter(b => b.kind === 'bank' && b.closed === undefined && b.founded <= year);
      const mines = H.mines.filter(m => m.closed === undefined && m.opened <= year);
      const types: string[] = ['stagecoach']; if (banks.length) types.push('bank'); if (mines.length) types.push('payroll'); if (H.routes.some(rt => rt.kind === 'railway' && (rt.opened ?? 9999) <= year && !rt.closed)) types.push('train');
      const kind = r.pick(types);
      const routesOpen = H.routes.filter(rt => (rt.kind === 'road' || rt.kind === 'track') && rt.built <= year && !rt.closed);
      let at: { x: number; y: number; cell: number; sid: string; where: string } | null = null; let victimBiz: Business | undefined; let route: Route | undefined;
      if (kind === 'bank') { victimBiz = r.pick(banks); const s = S.get(victimBiz.settlement)!; at = { x: victimBiz.x, y: victimBiz.y, cell: s.cell, sid: s.id, where: `the ${victimBiz.name} at ${s.name}` }; }
      else if (kind === 'payroll') { const m = r.pick(mines); const s = S.get(m.settlement)!; const rt = routesOpen.find(q => q.from === s.id || q.to === s.id); route = rt; const c = rt ? r.pick(rt.path) : s.cell; at = { x: cellCenter(c)[0], y: cellCenter(c)[1], cell: c, sid: s.id, where: `the ${m.claimName} payroll on the road from ${s.name}` }; }
      else if (kind === 'train') { const rt = r.pick(H.routes.filter(q => q.kind === 'railway' && (q.opened ?? 9999) <= year && !q.closed)); route = rt; const c = r.pick(rt.path.slice(3, -3).length ? rt.path.slice(3, -3) : rt.path); at = { x: cellCenter(c)[0], y: cellCenter(c)[1], cell: c, sid: rt.from, where: `a train on the ${rt.name}` }; }
      else if (routesOpen.length) { const rt = r.pick(routesOpen); route = rt; const c = r.pick(rt.path.slice(2, -2).length ? rt.path.slice(2, -2) : rt.path); at = { x: cellCenter(c)[0], y: cellCenter(c)[1], cell: c, sid: rt.from, where: `the coach on the ${rt.name}` }; }
      if (at) {
        const sc = S.get(at.sid)!; if (!active(sc, year)) { const alt = [S.get(route?.to ?? '')].filter(Boolean).find(q => active(q!, year)); if (!alt) continue; at.sid = alt!.id; }
        const sc2 = S.get(at.sid)!; const gang = Array.from({ length: r.int(1, 4) }, () => newPerson(year, { occupation: r.pick(['labourer', 'drover', 'discharged soldier', 'gambler']), residence: undefined, age: r.int(20, 45), fame: 0.3 }));
        const take = Math.round(r.logNormal(kind === 'bank' ? 4000 : kind === 'train' ? 9000 : 1800, 0.6));
        const bullion = (kind === 'payroll' || kind === 'train') && mines.length && year > 1750 && r.chance(0.5);
        const ev = addEvent({ kind: 'robbery', year, title: `Robbery of ${at.where}`, text: `${gang.length} armed ${gang.length === 1 ? 'man' : 'men'} robbed ${at.where}, escaping with ${take.toLocaleString()} ${H.currencyMajor}s in cash${bullion ? ' and gold bars' : ''}.`, settlement: sc2.id, x: at.x, y: at.y, cell: at.cell, people: gang.map(g => g.id), businesses: victimBiz ? [victimBiz.id] : [], route: route?.id, fame: 0.5, magnitude: take, extra: { bullion, kind } });
        // outcomes
        const roll = r.next();
        let outcome: 'caught_recovered' | 'caught_cache' | 'killed_cache' | 'escaped_retrieved' | 'escaped_lost';
        outcome = roll < 0.3 ? 'caught_recovered' : roll < 0.5 ? 'caught_cache' : roll < 0.65 ? 'killed_cache' : roll < 0.85 ? 'escaped_retrieved' : 'escaped_lost';
        const trialYear = year + r.int(0, 2);
        if (outcome.startsWith('caught')) { const tr = addEvent({ kind: 'trial', year: trialYear, title: `Trial of the ${at.where.replace(/^the /, '')} robbers`, text: `${gang[0].name} was convicted${outcome === 'caught_cache' ? ' but refused to say where the money was hidden; it was never recovered' : ', and the money was recovered'}.`, settlement: sc2.id, people: gang.map(g => g.id), prereqs: [ev.id], fame: 0.35 }); void tr; gang[0].deathCause = undefined; gang[0].notes.push('convicted of robbery'); }
        if (outcome === 'killed_cache') { gang[0].died = year + r.int(0, 1); gang[0].deathCause = 'shot by a posse'; }
        if (outcome === 'caught_cache' || outcome === 'killed_cache' || outcome === 'escaped_lost') {
          // find a remote hideout: 3-12 km from the crime, away from settlements, in cover
          let hc = -1, hs = -1e9; const ac = at.cell;
          for (let t = 0; t < 150; t++) { const ang = r.float(0, Math.PI * 2), d = r.float(5, 40); const x = Math.round((ac % N) + Math.cos(ang) * d), y = Math.round(((ac / N) | 0) + Math.sin(ang) * d); if (!inb(x, y)) continue; const c = idx(x, y);
            if (T.sea[c] || T.lake[c] >= 0 || !isFinite(L.traverse[c]) || T.slope[c] > 20) continue; const far = Math.min(...settlementsAt(year).filter(o => o.kind !== 'seasonal_camp').map(o => dist(o.cell, c)));
            const cover = [Veg.Conifer, Veg.Mixed, Veg.Broadleaf, Veg.Shrub].includes(L.veg[c]) ? 1 : 0; const sc3 = Math.min(far, 8) + cover * 2 - d * 0.04 + r.float(0, 1.5); if (sc3 > hs) { hs = sc3; hc = c; } }
          if (hc >= 0) {
            const [hx, hy] = cellCenter(hc);
            const contents: Cache['contents'] = [{ what: 'banknotes and coin', n: take, note: `${take} ${H.currencyMajor}s mostly in coin of the day` }];
            if (bullion) contents.push({ what: 'gold bars', n: r.int(2, 8), metal: 'gold', note: 'cast at the mine' });
            const marker = r.pick(['a split boulder', 'a lone old oak', 'a cairn of river stones', 'the corner of a drystone wall', 'a blazed pine']);
            const cache: Cache = { id: `CA${++caN}`, kind: 'loot', year, x: hx + r.float(-120, 120), y: hy + r.float(-120, 120), depth: r.float(30, 90), container: r.pick(['an iron-bound strongbox', 'a tin trunk', 'a stoneware crock', 'a canvas saddlebag wrapped in oilcloth', 'a cast-iron kettle']), owner: gang[0].id, event: ev.id, contents, why: outcome === 'killed_cache' ? 'the thief who hid it was killed before he could return' : outcome === 'caught_cache' ? 'the thief was jailed and never revealed the place' : 'the thief died of fever before he could return', marker, value: take, story: '' };
            if (outcome === 'escaped_lost') { gang[0].died = year + r.int(1, 3); gang[0].deathCause = 'died of fever'; }
            H.caches.push(cache); ev.consequences.push(addEvent({ kind: 'cache_hidden', year, title: `Loot hidden near ${S.get(settlementsAt(year).reduce((a, b) => dist(a.cell, hc) < dist(b.cell, hc) ? a : b).id)!.name}`, text: `The robbers buried their loot beside ${marker}.`, x: cache.x, y: cache.y, people: [gang[0].id], prereqs: [ev.id], fame: 0.5, extra: { secret: true } }).id);
          }
        }
      }
    }
    // savings hoards: farmers distrusting banks in bad years, burying valuables before war or flood
    if (r.chance(ec < 0.7 ? 0.1 : 0.03) && year >= 1700) {
      const farms = H.settlements.filter(f => f.kind === 'farmstead' && active(f, year)); if (farms.length) {
        const f = r.pick(farms); let owner = P.get(f.founderId ?? '') as Person; if (!owner || (owner.died !== null && owner.died < year) || owner.born > year - 18) { owner = newPerson(year, { occupation: 'farmer', residence: f.id }); owner.surname = (f as any).family; owner.name = `${owner.given} ${owner.surname}`; } const sum = Math.round(r.logNormal(120, 0.6));
        const retrieved = r.chance(0.8) && (owner.died === null || owner.died >= year + 9);
        const why = ec < 0.7 ? 'during the bank failures' : war ? `for fear of raiders in the ${war.name}` : 'to keep it from thieves';
        const cx = f.x + r.float(-60, 60), cy = f.y + r.float(-60, 60);
        const ev = addEvent({ kind: 'cache_hidden', year, title: `${owner.name} buries savings`, text: `${owner.name} of ${f.name} buried a crock of coin ${why}.`, settlement: f.id, people: [owner.id], x: cx, y: cy, fame: 0.1, extra: { secret: true } });
        if (retrieved) { addEvent({ kind: 'cache_recovered', year: year + r.int(1, 8), title: `${owner.name} digs up savings`, text: `${owner.name} recovered the buried savings.`, settlement: f.id, people: [owner.id], prereqs: [ev.id], fame: 0.02 }); }
        else H.caches.push({ id: `CA${++caN}`, kind: 'savings', year, x: cx, y: cy, depth: r.float(25, 60), container: r.pick(['a stoneware crock', 'a tin biscuit box', 'a glass jar', 'a leather purse']), owner: owner.id, event: ev.id, contents: [{ what: 'coin', n: sum, note: `${sum} ${H.currencyMajor}s in coin` }], why: owner.died !== null && owner.died <= year + 5 ? `${owner.name} died without telling anyone` : 'the owner forgot where it was hidden', marker: 'the corner of the barn', value: sum, story: '' });
      }
    }
    // accidental deaths with personal possessions at crossings, mines, rivers
    for (const x of H.crossings) {
      if (x.built > year) continue; const rt = H.routes.find(q => q.id === x.route)!; if (rt.closed && rt.closed < year) continue;
      const p = (x.kind === 'ford' || x.kind === 'ferry' ? 0.004 : 0.0008) * (floodEv ? 5 : 1) * Math.min(2, 0.5 + x.stream);
      if (!r.chance(p)) continue;
      const a0 = S.get(rt.from)!, a1 = S.get(rt.to)!; const a = active(a0, year) ? a0 : active(a1, year) ? a1 : null; if (!a) continue; const v = newPerson(year, { occupation: r.pick(['farmer', 'drover', 'teamster', 'travelling salesman', 'miner']), residence: a.id, age: r.int(20, 60) });
      v.died = year; v.deathCause = `drowned crossing the ${x.kind}`; v.fame = 0.1;
      const lostShip = r.chance(0.5);
      const ev = addEvent({ kind: lostShip ? 'lost_shipment' : 'accident_death', year, title: lostShip ? `Wagon lost at the ${a.name} ${x.kind}` : `${v.name} drowned at the ${x.kind}`, text: lostShip ? `${v.name}'s wagon overturned in the ${floodEv ? 'flooded ' : ''}stream at the ${x.kind}; the driver drowned and the load was lost.` : `${v.name} was swept away while crossing the ${x.kind}${floodEv ? ' in flood' : ''}.`, settlement: a.id, people: [v.id], x: x.x, y: x.y, cell: x.cell, prereqs: floodEv ? [floodEv.id] : [], fame: 0.15, extra: { crossing: x.id, cargo: lostShip ? r.pick(['casks of nails', 'barrels of flour', 'crates of tools', 'bolts of cloth', 'kegs of powder', 'crockery', 'bottled goods']) : undefined } });
      void ev;
    }
    // commemorations
    for (const s of act) {
      const age = year - s.founded; if (s.kind === 'farmstead' || s.kind === 'seasonal_camp' || s.pop < 400) continue;
      if (([100, 200, 300].includes(age) && s.pop > 700) || (year === 1976 && s.founded < 1900 && s.pop > 1500)) {
        addEvent({ kind: 'commemoration', year, title: `${s.name} celebrates its ${age ? age + 'th' : ''} jubilee`, text: `${s.name} held a jubilee with a parade, a fair and a commemorative medal struck for the occasion.`, settlement: s.id, fame: 0.15, extra: { medal: true, age } });
      }
    }
    // institutions
    for (const s of act) {
      if (s.kind === 'farmstead' || s.kind === 'seasonal_camp') continue;
      if (!s.institutions.church && s.pop > 120 && r.chance(0.15)) s.institutions.church = year;
      if (!s.institutions.school && s.pop > 150 && year > 1700 && r.chance(0.12)) s.institutions.school = year;
      if (!s.institutions.hall && s.pop > 600 && r.chance(0.07)) s.institutions.hall = year;
      if (!s.institutions.library && s.pop > 1200 && year > 1800 && r.chance(0.06)) s.institutions.library = year;
      if (!s.institutions.cemetery && s.pop > 80) s.institutions.cemetery = s.founded + 1;
    }
    // farm consolidation after 1930, abandonment of farms when parents decline
    for (const f of H.settlements) {
      if (f.kind !== 'farmstead' || !active(f, year)) continue; const parent = S.get(f.parent!);
      if (year > 1930 && r.chance(0.012 + (year > 1960 ? 0.015 : 0))) { f.abandoned = year; f.abandonReason = 'the farm was consolidated into a larger holding'; f.current = false; }
      else if (parent && parent.abandoned !== undefined && parent.abandoned <= year && year > parent.abandoned + 0 ) { f.abandoned = year; f.abandonReason = `the family left when ${parent.name} was abandoned`; f.current = false; }
      else if (r.chance(0.002)) { f.abandoned = year; f.abandonReason = r.pick(['crop failure', 'a family quarrel and a move to town', 'the farmer\'s death with no heir']); f.current = false; }
    }
    for (const s of act) {
      if (s.kind === 'fishing_village' && s.pop > 900 && s.port) { s.kind = 'port_city'; s.kindHistory.push([year, 'port_city']); }
      else if (s.kind === 'trading_post' && s.pop > 450) { s.kind = 'agricultural_village'; s.kindHistory.push([year, s.kind]); }
      else if (s.kind === 'agricultural_village' && s.pop > 3000 && (bizAt(s).filter(b2 => b2.scale >= 3).length >= 3)) { s.kind = 'industrial_town'; s.kindHistory.push([year, s.kind]); }
    }
    // abandonment and merging
    for (const s of act) {
      if (s.kind === 'farmstead') continue;
      const low = s.kind === 'seasonal_camp' ? false : s.pop < 14;
      if (low && year > s.founded + 5) {
        (s as any).lowYears = ((s as any).lowYears || 0) + 1;
        if ((s as any).lowYears >= 4) {
          const nearest = act.filter(o => o.id !== s.id && o.kind !== 'farmstead' && o.kind !== 'seasonal_camp').sort((a, b) => dist(a.cell, s.cell) - dist(b.cell, s.cell))[0];
          s.abandoned = year; s.current = false; s.abandonReason = s.kind === 'mining_town' ? 'the mine closed and the workers left' : 'the population dwindled away';
          addEvent({ kind: 'abandonment', year, title: `${s.name} is abandoned`, text: `${s.name} was abandoned (${s.abandonReason}); ${nearest ? `the last families moved to ${nearest.name}` : 'the last families left the region'}.`, settlement: s.id, x: s.x, y: s.y, fame: 0.3, prereqs: H.events.filter(e => e.settlement === s.id && (e.kind === 'mine_closed' || e.kind === 'founding')).slice(-1).map(e => e.id) });
          if (nearest) nearest.pop += s.pop;
          for (const b of bizAt(s)) closeBusiness(b, year, 'the town was abandoned');
        }
      } else (s as any).lowYears = 0;
    }
  }
  // present-day flags
  for (const s of H.settlements) { s.current = s.abandoned === undefined; if (s.current) s.hasArchive = s.pop > 500 || s.institutions.library !== undefined; }
  for (const s of H.settlements) { for (let i = 0; i < H.econ.length; i++) if (s.popHist[i] === undefined) s.popHist[i] = i + startYear < s.founded ? 0 : (s.abandoned !== undefined && i + startYear >= s.abandoned ? 0 : Math.round(s.pop)); }
  // links: close routes whose endpoints are gone (roads to ghost towns stay open as tracks until both ends vanish)
  for (const rt of H.routes) { const a = S.get(rt.from)!, b = S.get(rt.to)!; if (rt.kind !== 'railway' && !rt.closed && a.abandoned !== undefined && b.abandoned !== undefined) rt.closed = Math.max(a.abandoned, b.abandoned); if (!rt.closed && rt.kind !== 'railway') { if ((a.abandoned !== undefined && b.abandoned === undefined && rt.path.length < 4)) rt.closed = a.abandoned; } }
  H.events.sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
  return H;
}
export { CULTURES };
