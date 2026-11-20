import { ARC } from './archetypes';
import { MAT } from './materials';
import { MIN } from './minerals';
import { TAXON } from './fossils';
import { clamp } from './noise';
import { hash01, hash32, stream } from './rng';
import type { Artifact } from './artifacts';
import type { Specimen } from './specimens';
import type { World } from './worldtypes';
import { SPOT } from './tech';
import { Namer } from './names';

export interface ValuePart { label: string; amount: number; note?: string }
export interface Valuation { total: number; parts: ValuePart[]; rarityN: number; rarityLabel: string; tier: 0 | 1 | 2 | 3; }
export const RARITY_LABELS = ['Abundant', 'Common', 'Uncommon', 'Scarce', 'Rare', 'Extremely rare'];
export function rarityIndex(N: number) { return N >= 3000 ? 0 : N >= 300 ? 1 : N >= 40 ? 2 : N >= 6 ? 3 : N >= 1 ? 4 : 5; }

/** Expected number of this type that survive in the whole region, derived from production and survival. */
export function supplyOf(w: World, a: Artifact): number {
  if (a.series) return Math.max(0.05, w.coin.byId[a.series].expected);
  if (a.token) return Math.max(0.05, w.issues.tokens.find(t => t.id === a.token)!.expected);
  if (a.medal) return Math.max(0.05, w.issues.medals.find(t => t.id === a.medal)!.expected);
  if (a.special === 'cache' || a.special === 'accident') return 0.5;
  if (a.special === 'wreck') return a.arch === 'ship_bell' ? 0.3 : 12;
  if (a.maker) { const b = w.H.businesses.find(q => q.id === a.maker)!; const years = Math.max(1, (b.closed ?? w.H.endYear) - b.founded); return Math.max(0.2, b.capacity * years * 25 * (ARC[a.arch].rate / 1)); }
  return 20000 * ARC[a.arch].rate;
}
export function demandOf(w: World): Record<string, number> {
  const H = w.H; const r = stream(w.seed, 'demand'); const d: Record<string, number> = {};
  const cats = ['coin', 'token', 'jewelry', 'button', 'buckle', 'insignia', 'tool', 'bottle', 'pottery', 'household', 'key', 'medal', 'industrial', 'transport', 'nautical', 'personal', 'commercial', 'agricultural', 'litter', 'scrap'];
  for (const c of cats) d[c] = r.float(0.8, 1.25);
  d.bottle *= 1 + Math.min(0.5, H.businesses.filter(b => b.kind === 'bottler' || b.kind === 'glassworks').length / 20);
  d.token *= 1 + Math.min(0.7, H.mines.length / 12); d.nautical *= 1 + Math.min(0.6, H.vessels.filter(v => v.lost).length / 25);
  d.insignia *= 1 + (H.wars.filter(x => x.local).length) * 0.12; d.transport *= 1 + (H.routes.some(rt => rt.kind === 'railway') ? 0.35 : 0);
  d.litter = 0.05; d.scrap = 0.1; return d;
}
const demandCache = new WeakMap<World, Record<string, number>>(); const dem = (w: World) => { let d = demandCache.get(w); if (!d) demandCache.set(w, d = demandOf(w)); return d; };

export function trueValue(w: World, a: Artifact, o: { cleanDamage?: number } = {}): Valuation {
  const arch = ARC[a.arch]; const m = MAT[a.mat]; const parts: ValuePart[] = []; const c = a.cond;
  const cond = Math.pow(1 - c.corr, 1.3) * (1 - c.wear * 0.5) * (1 - c.dmg) * c.frag * (1 - (o.cleanDamage ?? 0));
  const spot = SPOT[a.mat] ?? 0; const melt = m.metal ? a.mass * spot * (1 - c.corr * 0.5) * c.frag : 0;
  if (melt > 0.005) parts.push({ label: 'Metal value', amount: melt, note: `${a.mass.toFixed(1)} g of ${m.name}` });
  const N = supplyOf(w, a); const ri = rarityIndex(N);
  const rarityF = 1 + 1.15 * Math.pow(Math.max(0, 3.2 - Math.log10(N + 1)), 1.9);
  const age = w.H.endYear - a.produced; const ageF = 0.6 + Math.min(2.5, age / 120);
  let collector = arch.value * (arch.collect > 0 ? Math.pow(arch.collect, 0.8) : 1) * ageF * dem(w)[arch.cat] * cond;
  if (a.special === 'coin' || a.special === 'token' || a.special === 'medal') collector *= rarityF; else collector *= 1 + (rarityF - 1) * 0.5;
  if (arch.cat === 'coin' && !a.special) collector = 0;
  if (collector > 0.005) parts.push({ label: 'Collector value', amount: collector, note: `${arch.name}, ${age} years old; ${RARITY_LABELS[ri].toLowerCase()} (about ${N >= 10 ? Math.round(N) : N.toFixed(1)} survive in the region); condition factor ${cond.toFixed(2)}` });
  let hist = 1; const why: string[] = [];
  if (a.assoc.event) { const e = w.H.events.find(q => q.id === a.assoc.event); if (e) { hist *= 1 + e.fame * 2.5; why.push(`the ${e.title}`); } }
  for (const pid of a.assoc.persons ?? []) { const p = w.H.people.find(q => q.id === pid); if (p && p.fame > 0.1) { hist *= 1 + p.fame * 2; why.push(p.name); } }
  if (a.special === 'cache') { hist *= 2.5; why.push('a hidden cache'); }
  if (a.special === 'wreck') { hist *= a.arch === 'ship_bell' ? 6 : 1.8; why.push('a shipwreck'); }
  if (a.maker && arch.maker?.length) { const b = w.H.businesses.find(q => q.id === a.maker); if (b && b.closed !== undefined) hist *= 1 + Math.min(0.8, b.capacity / 30); }
  if (hist > 1.001 && collector + melt > 0) parts.push({ label: 'Historical significance', amount: (collector + melt) * (hist - 1), note: why.length ? why.join(', ') : 'local maker' });
  let total = parts.reduce((s, p) => s + p.amount, 0);
  if (a.special === 'cache' && a.arch.startsWith('coin')) total = Math.max(total, 0.05);
  const tier = total >= 400 || ri >= 5 ? 3 : total >= 60 || (ri >= 4 && total >= 12) ? 2 : total >= 8 || ri >= 3 ? 1 : 0;
  return { total: Math.max(0, total), parts, rarityN: N, rarityLabel: RARITY_LABELS[ri], tier: tier as any };
}

export function specimenValue(w: World, s: Specimen, o: { identified?: boolean; fresh?: boolean } = {}): Valuation {
  const parts: ValuePart[] = []; const q = 0.35 + 0.65 * s.quality;
  switch (s.kind) {
    case 'native': { const m = MIN[s.mineral ?? 'gold']; const v = s.mass * (SPOT[m.id] ?? m.value) * (s.name.includes('nugget') ? 1.7 : 1.0); parts.push({ label: s.name.includes('nugget') ? 'Gold content with nugget premium' : 'Gold content', amount: v, note: `${s.mass.toFixed(2)} g` }); break; }
    case 'fossil': { const t = TAXON[s.taxon!]; const typical = (t.size[0] + t.size[1]) / 2; const v = t.value * Math.pow(clamp(s.size / typical, 0.3, 3), 0.8) * q * (o.fresh ? 1.1 : 1); parts.push({ label: 'Fossil specimen', amount: v, note: `${t.name}, ${Math.round(s.ageMa ?? 0)} million years` }); break; }
    case 'gem': case 'mineral': case 'ore': { const m = MIN[s.mineral ?? 'quartz']; const v = Math.max(0.05, m.value * Math.min(s.mass, 400) * 0.3 * q * (o.fresh ? 1.3 : 1) * (m.gem ? 1.5 : 1)); parts.push({ label: `${m.name} specimen`, amount: v, note: `${s.mass.toFixed(0)} g, quality ${(q * 100).toFixed(0)}%` }); break; }
    case 'erratic': case 'rock': parts.push({ label: 'Rock specimen', amount: Math.min(4, 0.08 + s.mass / 3000) * q, note: 'decorative interest' }); break;
    default: parts.push({ label: 'Worthless', amount: 0 });
  }
  const total = parts.reduce((a, b) => a + b.amount, 0);
  return { total, parts, rarityN: 100, rarityLabel: '', tier: total >= 200 ? 3 : total >= 40 ? 2 : total >= 6 ? 1 : 0 };
}

export interface Buyer { id: string; kind: 'scrap' | 'antique' | 'coin' | 'mineral' | 'general'; name: string; margin: number; blurb: string; settlement: string; expertise: number; }
export function buyersFor(w: World, settlementId: string): Buyer[] {
  const s = w.H.settlements.find(q => q.id === settlementId)!; const r = stream(w.seed, 'buyers|' + settlementId); const nm = new Namer(w.culture, r);
  const mk = (kind: Buyer['kind'], name: string, margin: number, blurb: string, exp: number): Buyer => ({ id: `${settlementId}:${kind}`, kind, name, margin, blurb, settlement: settlementId, expertise: exp });
  const big = s.pop > 1500;
  const out: Buyer[] = [mk('scrap', `${nm.surname()} Salvage`, 0.62 + r.float(-0.04, 0.04), 'Pays for metal by weight. Ignores age and rarity.', 0.2), mk('general', `${nm.surname()}'s Curios`, 0.42 + r.float(-0.03, 0.05), 'Buys a bit of everything, cheaply, and rarely knows what it has.', 0.45),
    mk('antique', `${nm.surname()} & Daughter, Antiques`, 0.55 + r.float(-0.04, 0.05), 'Buys household, tools, bottles, jewellery and curios. Knows local makers.', 0.75),
    mk('coin', `${nm.surname()} Numismatics`, 0.6 + r.float(-0.04, 0.06), 'Buys coins, tokens and medals; will pay well for dates and low mintages.', big ? 0.95 : 0.8),
    mk('mineral', `${nm.stem(2)} Rocks & Fossils`, 0.58 + r.float(-0.04, 0.06), 'Buys minerals, gems and fossils; prefers identified specimens with locality.', big ? 0.95 : 0.8)];
  return out;
}
const COLLECT_CATS: Record<Buyer['kind'], string[] | 'all' | 'metals' | 'specimens'> = { scrap: 'metals', antique: ['jewelry', 'button', 'buckle', 'tool', 'bottle', 'pottery', 'household', 'key', 'industrial', 'transport', 'nautical', 'personal', 'commercial', 'agricultural', 'insignia', 'medal'], coin: ['coin', 'token', 'medal'], mineral: 'specimens', general: 'all' };
export function marketDrift(w: World, day: number, cat: string): number { const month = Math.floor(day / 30); return 0.9 + 0.25 * hash01(hash32(w.seed + cat), month); }
export interface Offer { price: number; refuses: boolean; note: string }
/** What a buyer will pay now, given how much of the object they can actually read. */
export function offerFor(w: World, buyer: Buyer, item: { art?: Artifact; spec?: Specimen; legibility: number; identified: boolean; fresh?: boolean; count?: number }, day: number): Offer {
  const cnt = item.count ?? 1;
  if (item.art) {
    const a = item.art; const arch = ARC[a.arch]; const cats = COLLECT_CATS[buyer.kind]; const m = MAT[a.mat];
    const melt = m.metal ? a.mass * (SPOT[a.mat] ?? 0) * (1 - a.cond.corr * 0.5) * a.cond.frag : 0;
    if (buyer.kind === 'scrap') return melt > 0.01 ? { price: Math.max(0.01, melt * buyer.margin * cnt), refuses: false, note: `Weighs it as ${m.name}.` } : { price: 0, refuses: true, note: 'Not metal worth weighing in.' };
    if (buyer.kind === 'mineral') return { price: 0, refuses: true, note: 'Only deals in minerals and fossils.' };
    if (Array.isArray(cats) && !cats.includes(arch.cat)) return { price: 0, refuses: true, note: 'Not their line.' };
    const dateMark = a.marks.find(x => x.kind === 'date'); const readable = item.legibility * (0.65 + 0.35 * buyer.expertise) + 0.1 * buyer.expertise;
    const canRead = a.marks.length === 0 ? true : (dateMark ? readable >= dateMark.need : a.marks.some(x => readable >= x.need));
    const v = trueValue(w, a); const base = v.parts.filter(p => p.label === 'Metal value').reduce((s, p) => s + p.amount, 0);
    const typical = trueValueTypical(w, a);
    const knowledge = canRead && (buyer.expertise > 0.6 || buyer.kind === 'coin') ? v.total : canRead ? (v.total + typical) / 2 : typical + base;
    const authentic = canRead ? 1 : 0.85;
    const mood = 0.9 + 0.2 * hash01(hash32(buyer.id + a.id), 4);
    const price = knowledge * buyer.margin * authentic * marketDrift(w, day, arch.cat) * mood * cnt;
    const note = canRead ? (v.tier >= 2 ? 'Recognises it and pays accordingly.' : 'Reads the markings and values it fairly.') : 'Cannot make out the markings, so prices it as an ordinary example.';
    return { price: Math.max(0.01, price), refuses: false, note };
  }
  const s = item.spec!; const cats = COLLECT_CATS[buyer.kind];
  if (buyer.kind === 'scrap') { if (s.kind === 'native') { const v = specimenValue(w, s).total; return { price: v * 0.7, refuses: false, note: 'Pays melt value for gold.' }; } return { price: 0, refuses: true, note: 'Not metal.' }; }
  if (cats !== 'specimens' && cats !== 'all') return { price: 0, refuses: true, note: 'Not their line.' };
  if (s.kind === 'hotrock') return { price: 0, refuses: true, note: 'Just a rock.' };
  const v = specimenValue(w, s, { fresh: item.fresh }); const idF = item.identified ? 1 : 0.65;
  const price = v.total * buyer.margin * idF * (buyer.kind === 'general' ? 0.8 : 1) * marketDrift(w, day, 'spec') * (0.92 + 0.16 * hash01(hash32(buyer.id + s.id), 5)) * cnt;
  return { price: Math.max(0.01, price), refuses: false, note: item.identified ? 'A labelled specimen: easy to sell.' : 'Unlabelled specimens go for less.' };
}
/** value of a typical example of this type in average condition (what a buyer assumes when the markings cannot be read) */
export function trueValueTypical(w: World, a: Artifact): number {
  const arch = ARC[a.arch]; const age = w.H.endYear - a.produced; const ageF = 0.6 + Math.min(2.5, age / 120);
  const m = MAT[a.mat]; const melt = m.metal ? a.mass * (SPOT[a.mat] ?? 0) * (1 - a.cond.corr * 0.5) : 0;
  return arch.value * 0.5 * ageF * dem(w)[arch.cat] * (1 - a.cond.corr) * (1 - a.cond.dmg) + melt * 0;
}
