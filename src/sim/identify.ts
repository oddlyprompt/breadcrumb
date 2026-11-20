import { ARC, CAT_LABEL, Render } from './archetypes';
import { MAT } from './materials';
import { MIN, MINERALS } from './minerals';
import { TAXON } from './fossils';
import { clamp } from './noise';
import { hash01, hash32 } from './rng';
import { trueValue, specimenValue, supplyOf, RARITY_LABELS, rarityIndex } from './economy';
import { periodOf } from './fossils';
import { FREE_REFS, GEARBY } from './equipment';
import type { Artifact } from './artifacts';
import type { Specimen } from './specimens';
import type { World } from './worldtypes';

export interface Tools { read: number; clean: number; refs: Set<string>; tests: Set<string>; hammer: boolean; pan: number; }
export function toolsFrom(owned: Record<string, number>): Tools {
  const t: Tools = { read: 0, clean: 0, refs: new Set(FREE_REFS), tests: new Set(), hammer: false, pan: 0 };
  for (const id of Object.keys(owned)) { if (!owned[id]) continue; const g = GEARBY[id]; if (!g) continue;
    if (g.cat === 'loupe') t.read = Math.max(t.read, g.s.read as number); if (g.cat === 'cleaning') t.clean = Math.max(t.clean, g.s.level as number);
    if (g.cat === 'book') for (const r of (g.s.refs as string).split(',')) t.refs.add(r);
    if (g.cat === 'idkit') for (const r of (g.s.tests as string).split(',')) t.tests.add(r);
    if (g.cat === 'geo') t.hammer = true; if (g.cat === 'pan') t.pan = Math.max(t.pan, g.s.eff as number); }
  return t;
}
export interface Find {
  uid: string; kind: 'artifact' | 'specimen'; day: number; x: number; y: number; site?: string; art?: Artifact; spec?: Specimen;
  cleaning: number; cleanCount: number; cleanDamage: number; split: boolean; guess?: string; status: 'bag' | 'keep' | 'sold'; count: number; stackKey?: string; note?: string; soldFor?: number; label?: string;
}
export const CLEAN_METHODS = [
  { id: 'rinse', name: 'Rinse in water', need: 0, removes: 0.28, max: 0.32, minutes: 2, risk: 0 },
  { id: 'brush', name: 'Brush gently', need: 1, removes: 0.36, max: 0.68, minutes: 6, risk: 0.012 },
  { id: 'soak', name: 'Soak and pick', need: 2, removes: 0.34, max: 0.88, minutes: 28, risk: 0.05 },
  { id: 'conserve', name: 'Conservation bath', need: 3, removes: 0.4, max: 1, minutes: 45, risk: 0.006 },
] as const;
export function cleaningMethods(t: Tools) { return CLEAN_METHODS.filter(m => t.clean >= m.need); }
export function cleanFind(f: Find, methodId: string, t: Tools): { ok: boolean; msg: string; minutes: number } {
  const m = CLEAN_METHODS.find(q => q.id === methodId)!; if (!m || t.clean < m.need) return { ok: false, msg: 'You lack the kit for that.', minutes: 0 };
  if (f.kind !== 'artifact' || !f.art) return { ok: false, msg: 'Nothing to clean.', minutes: 0 };
  const a = f.art; if (f.cleaning >= m.max - 0.01) return { ok: false, msg: 'That method has done all it can; a gentler or stronger approach is needed.', minutes: 0 };
  const mat = MAT[a.mat]; const fragility = (mat.fragile ? 1.4 : 1) * (mat.hard < 3.2 ? 1.3 : 0.9) * (0.5 + a.cond.corr) * (a.cond.frag < 0.7 ? 1.4 : 1);
  const roll = hash01(hash32(f.uid), f.cleanCount + 1);
  f.cleanCount++; f.cleaning = clamp(f.cleaning + m.removes * (1 - f.cleaning * 0.3), 0, m.max);
  let msg = `${m.name}: crust loosens.`;
  if (m.risk > 0 && roll < m.risk * fragility * 3) { const d = 0.04 + roll * 3 * 0.1; f.cleanDamage = clamp(f.cleanDamage + d, 0, 0.8); msg = `${m.name}: a slip! Surface lost (${(d * 100).toFixed(0)}% damage).`; }
  if (m.id === 'soak' && ['copper', 'bronze', 'silver'].includes(a.mat) && ARC[a.arch].cat === 'coin') { f.cleanDamage = clamp(f.cleanDamage + 0.03, 0, 0.8); msg += ' The patina is thinner than before.'; }
  return { ok: true, msg, minutes: m.minutes };
}
export const encrustLeft = (f: Find) => f.art ? f.art.cond.encrust * (1 - f.cleaning) : 0;
export function legibility(f: Find): number {
  if (!f.art) return 0; const c = f.art.cond;
  return clamp((1 - c.wear) * (1 - c.corr * 0.85) * (1 - f.cleanDamage) * (1 - encrustLeft(f) * 0.92) * Math.pow(c.frag, 0.3), 0, 1);
}
const RENDER_WORD: Record<Render, string> = { coin: 'disc', disc: 'disc', ring: 'ring-shaped object', brooch: 'pin-like object', button: 'button-like object', buckle: 'buckle-shaped object', key: 'key-shaped object', bottle: 'glass vessel', shard: 'fragment of fired clay', pipe: 'slender tube', blade: 'blade-like object', axe: 'heavy head with a socket', horseshoe: 'curved bar', nail: 'long thin spike', bolt: 'headed rod', spike: 'heavy spike', bar: 'heavy bar', can: 'box or can', tab: 'small folded piece of metal', cap: 'crimped disc', plate: 'flat plate', spoon: 'spoon-shaped object', thimble: 'little cup', watch: 'case with a hinge', lantern: 'metal fitting with a socket', chain: 'chain-like piece', wheel: 'wheel-like piece', bell: 'dome-shaped piece', ball: 'ball', cartridge: 'hollow cylinder', badge: 'badge-shaped plate', toy: 'small figure', comb: 'toothed object', lock: 'box-like lock body', weight: 'solid block', pot: 'vessel', scrap: 'shapeless lump', hook: 'hooked piece', tag: 'small tag', medal: 'disc with a loop', lamp: 'fitting with a threaded neck', hammer: 'heavy head with a hole', wire: 'length of wire', bead: 'bead', cup: 'thin shard', sheet: 'thin crumpled sheet' };
const MAT_GROUP: Record<string, string> = { copper: 'copper alloy', bronze: 'copper alloy', brass: 'copper alloy', cupronickel: 'grey nickel alloy', nickel: 'grey nickel alloy', silver: 'silvery metal', silverplate: 'silvery metal', gold: 'yellow metal', goldfilled: 'yellow metal', iron: 'iron', steel: 'iron', lead: 'soft grey metal', pewter: 'soft grey metal', tin: 'soft grey metal', zinc: 'whitish metal', aluminium: 'light white metal' };
const matWord = (m: string) => MAT_GROUP[m] ?? MAT[m].name;
export interface Desc {
  title: string; sub: string; lines: string[]; legibility: number; level: number; marks: Array<{ text: string; kind: string; readable: boolean }>;
  facts: string[]; connections: string[]; hints: string[]; estimate?: string; rarity?: string; mat: string; known: { category: boolean; material: boolean; type: boolean; maker: boolean };
}
export function describeArtifact(w: World, f: Find, kb: Set<string>, t: Tools): Desc {
  const a = f.art!; const arch = ARC[a.arch]; const L = legibility(f); const eff = L + t.read; const lines: string[] = []; const facts: string[] = []; const connections: string[] = []; const hints: string[] = [];
  const encl = encrustLeft(f); const shape = f.cleaning >= 0.22 || encl < 0.5;
  const dims = `${Math.round(a.dims[0])} × ${Math.round(a.dims[1])} mm, about ${a.mass < 10 ? a.mass.toFixed(1) : Math.round(a.mass)} g`;
  const mat = MAT[a.mat]; const heavy = a.mass / Math.max(0.1, a.dims[0] * a.dims[1] * a.dims[2] / 1000);
  lines.push(`${dims}. ${encl > 0.6 ? 'Thickly encrusted with soil and corrosion.' : encl > 0.25 ? 'Partly encrusted.' : 'Surface fairly clean.'}`);
  const known = { category: shape, material: f.cleaning >= 0.45 || !mat.metal && encl < 0.7, type: false, maker: false };
  if (known.material) lines.push(`Material: ${matWord(a.mat)}${mat.metal ? ` (${heavy > 11 ? 'very heavy for its size' : heavy > 7 ? 'dense' : heavy > 4 ? 'average weight' : 'light'})` : ''}. ${a.cond.corr > 0.5 ? mat.patina[0].toUpperCase() + mat.patina.slice(1) + '.' : ''}`);
  else lines.push(mat.metal && MAT[a.mat].ferrous ? 'Rusty: a magnet would cling to it.' : mat.metal ? 'A metal object under heavy crust.' : 'A non-metal object under dirt.');
  const readableMarks = a.marks.map(m => ({ text: m.text, kind: m.kind, readable: eff >= m.need }));
  const readN = readableMarks.filter(m => m.readable).length;
  const cat = arch.cat; const haveRef = t.refs.has(cat);
  let level = 0; if (shape) level = 1; if (known.material && shape) level = 2;
  let title = shape ? `${known.material ? matWord(a.mat) + ' ' : ''}${RENDER_WORD[arch.render]}` : 'Encrusted object';
  let sub = `${CAT_LABEL[cat]}`;
  if (shape && (haveRef || readN >= 2 && (arch.special === 'coin' || arch.special === 'token' || arch.special === 'medal')) && f.cleaning >= 0.3) { title = arch.name; level = 3; known.type = true; lines.push(arch.desc); }
  else if (shape) hints.push(haveRef ? 'Clean it further to identify it.' : `You have no reference for ${CAT_LABEL[cat].toLowerCase()} yet (see the shop, or the archive catalogue).`);
  if (a.marks.length) { if (readN) lines.push(`Markings read: ${readableMarks.filter(m => m.readable).map(m => `"${m.text}"`).join(', ')}.`); if (readN < a.marks.length) lines.push(a.marks.length - readN > 1 ? 'Further markings are too worn or encrusted to read.' : 'One marking is still illegible.'); if (readN < a.marks.length && eff < 0.9) hints.push('A magnifier and more careful cleaning may reveal more.'); }
  // attribution: only possible through what the player has learned elsewhere
  const rd = (k: string) => readableMarks.some(m => m.kind === k && m.readable);
  if (a.maker && (rd('maker') || rd('name'))) { const b = w.H.businesses.find(q => q.id === a.maker)!; const town = w.H.settlements.find(q => q.id === b.settlement)!; facts.push(`mark:${b.mark}`);
    if (kb.has(`biz:${b.id}`)) { known.maker = true; level = Math.max(level, 4); title = `${arch.name}, ${b.name}`; connections.push(`Made by ${b.name} of ${town.name} (${b.founded}–${b.closed ?? 'present'}). ${a.produced ? `This example dates to about ${a.produced}.` : ''}`); facts.push(`biz:${b.id}:found`); }
    else hints.push(`The maker's mark "${b.mark}"${rd('name') ? ` and the name ${town.name.toUpperCase()}` : ''} means nothing to you yet. Try searching the archives for that name or mark.`); }
  if (a.assoc.vessel && readableMarks.some(m => m.kind === 'name' && m.readable)) { const v = w.H.vessels.find(q => q.id === a.assoc.vessel)!; if (kb.has(`vessel:${v.id}`)) { known.maker = true; level = 4; connections.push(`The name matches the ${v.type} ${v.name}, ${v.lost ? `lost in ${v.lost}` : 'registered at ' + w.H.settlements.find(s => s.id === v.homePort)!.name}.`); facts.push(`vessel:${v.id}:found`); const ev = w.H.events.find(e => e.vessel === v.id && e.kind === 'shipwreck'); if (ev) facts.push(`event:${ev.id}`); } else hints.push(`A vessel's name: "${v.name.toUpperCase()}". The shipping registers and newspapers may know her.`); }
  if (a.medal) { const m = w.issues.medals.find(q => q.id === a.medal)!; if (readN >= 2) { const ev = w.H.events.find(q => q.id === m.event); if (ev && kb.has(`event:${ev.id}`)) { level = 4; known.maker = true; connections.push(`Struck for: ${ev.title} (${ev.year}).`); facts.push(`event:${ev.id}:found`); if (m.person && m.kind === 'gallantry') facts.push(`person:${m.person}`); } else hints.push('The inscription refers to an event; look for it in the newspapers around that year.'); } }
  if (a.special === 'insignia' && a.assoc.war) { const war = w.H.wars.find(q => q.id === a.assoc.war)!; if (readN >= 1) connections.push(`The markings tie it to the ${war.name}.`); }
  if (a.series && rd('date') && rd('denom')) { const s = w.coin.byId[a.series]; known.type = true; level = Math.max(level, 3); title = `${s.year} ${s.denomText.toLowerCase()} coin`; facts.push(`series:${s.id}`); lines.push(`Issued by the ${s.polity}${s.mint ? ` (mint mark ${s.mint})` : ''}.`); }
  if (a.token && readN >= 2) { const tk = w.issues.tokens.find(q => q.id === a.token)!; const b = w.H.businesses.find(q => q.id === tk.business)!; facts.push(`mark:${b.name}`); if (kb.has(`biz:${b.id}`)) { known.maker = true; level = 4; connections.push(`Issued by ${b.name}, ${w.H.settlements.find(s => s.id === b.settlement)!.name}.`); facts.push(`biz:${b.id}:found`); } else hints.push(`A trade token naming "${b.name}". Business directories and notices may tell you where it traded.`); }
  let estimate: string | undefined; let rarity: string | undefined;
  if (level >= 3) { const v = trueValue(w, a, { cleanDamage: f.cleanDamage }); const centre = v.total * (0.85 + 0.3 * hash01(hash32(f.uid), 13)); estimate = `${money(centre * 0.6)}–${money(centre * 1.5)} (your estimate)`; if (a.series || a.token || a.medal) rarity = RARITY_LABELS[rarityIndex(supplyOf(w, a))]; }
  if (known.maker && a.assoc.event && kb.has(`event:${a.assoc.event}`)) { const e = w.H.events.find(q => q.id === a.assoc.event); if (e && !connections.some(c => c.includes(e.title))) connections.push(`Linked to: ${e.title} (${e.year}).`); }
  return { title, sub, lines, legibility: L, level, marks: readableMarks, facts, connections, hints, estimate, rarity, mat: a.mat, known };
}
export const money = (v: number) => v >= 100 ? `$${Math.round(v)}` : v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;

// ---------------- specimens
export interface SpecObs { lines: string[]; candidates: string[]; unique: boolean; fresh: boolean }
export function observeSpecimen(w: World, f: Find, t: Tools): SpecObs {
  const s = f.spec!; const fresh = f.split; const lines: string[] = []; const m = s.mineral ? MIN[s.mineral] : undefined;
  lines.push(`${s.mass < 10 ? s.mass.toFixed(1) : Math.round(s.mass)} g, about ${s.size.toFixed(1)} cm across. ${s.transport.mode !== 'in place' ? 'Water- or ice-rounded.' : 'Angular.'}`);
  if (s.kind === 'fossil') { const tx = TAXON[s.taxon!]; lines.push(`A ${tx.how === 'shell' ? 'shell-like' : tx.how === 'impression' ? 'pressed impression' : tx.how === 'bone' ? 'bone-like' : tx.how === 'tooth' ? 'tooth-shaped' : 'stony'} object with the form of a once-living thing.`); return { lines, candidates: [], unique: t.refs.has('fossil'), fresh }; }
  if (s.kind === 'rock' || s.kind === 'erratic' || s.kind === 'hotrock') { lines.push(fresh ? `Fresh face: ${s.kind === 'hotrock' ? 'dark, heavy, magnetic' : 'a fine- to coarse-grained rock'}.` : 'Weathered surface hides the grain; break it open to see more.'); return { lines, candidates: [], unique: false, fresh }; }
  if (!m) return { lines, candidates: [], unique: false, fresh };
  const tests = t.tests; const weathered = !fresh && !['native'].includes(s.kind);
  lines.push(`Colour: ${weathered ? 'dulled by weathering' : m.color}.`);
  if (t.read > 0 || fresh) lines.push(`Lustre: ${m.luster}.`);
  const heft = m.density; lines.push(`Heft: ${heft > 7 ? 'surprisingly heavy' : heft > 4 ? 'heavier than a rock' : heft > 2.8 ? 'average' : 'light'}.`);
  let cands = MINERALS.filter(q => Math.abs(Math.log(q.density / m.density)) < 0.5);
  if (tests.has('hardness')) { lines.push(`Hardness: about ${m.hardness} (Mohs).`); cands = cands.filter(q => Math.abs(q.hardness - m.hardness) <= 0.9); }
  if (tests.has('streak') && (fresh || s.kind === 'native' || m.id === 'pyrite')) { lines.push(`Streak: ${m.streak}.`); cands = cands.filter(q => q.streak === m.streak || (q.streak.includes('black') && m.streak.includes('black')) ); }
  if (tests.has('magnet')) { lines.push(m.magnetic ? 'Attracts a magnet.' : 'Not magnetic.'); cands = cands.filter(q => !!q.magnetic === !!m.magnetic); }
  if (tests.has('acid')) { const f2 = m.cls === 'carbonate'; lines.push(f2 ? 'Fizzes in dilute acid.' : 'No reaction to acid.'); cands = cands.filter(q => (q.cls === 'carbonate') === f2); }
  if (tests.has('uv')) { const glows = ['fluorite', 'scheelite', 'calcite', 'cerussite'].includes(m.id); lines.push(glows ? `Glows under UV (${m.id === 'scheelite' ? 'blue-white' : m.id === 'fluorite' ? 'violet-blue' : 'pinkish'}).` : 'No fluorescence.'); if (!glows) cands = cands.filter(q => !['fluorite', 'scheelite'].includes(q.id)); else cands = cands.filter(q => ['fluorite', 'scheelite', 'calcite', 'cerussite'].includes(q.id)); }
  if (!cands.some(q => q.id === m.id)) cands.push(m);
  return { lines, candidates: cands.map(c => c.id), unique: cands.length <= 1 && t.refs.has('mineral'), fresh };
}
export function specimenName(w: World, f: Find, kb: Set<string>, t: Tools): { name: string; identified: boolean; label: string } {
  const s = f.spec!; const idByGuess = f.guess && f.guess === s.mineral; const wrong = f.guess && f.guess !== s.mineral;
  if (s.kind === 'native') return { name: s.name, identified: true, label: s.name };
  if (s.kind === 'fossil') { const ok = t.refs.has('fossil'); return { name: ok ? s.name : 'Fossil', identified: ok, label: ok ? `${s.name} (${periodOf(s.ageMa ?? 0)})` : 'Fossil' }; }
  if (s.kind === 'rock' || s.kind === 'erratic') { const ok = f.split && t.refs.has('mineral'); return { name: ok ? s.name : 'Rock', identified: ok, label: ok ? s.name : 'Rock' }; }
  if (s.kind === 'hotrock') return { name: 'Dark heavy cobble', identified: false, label: 'Hot rock' };
  const obs = observeSpecimen(w, f, t);
  if (obs.unique) return { name: s.name, identified: true, label: s.name };
  if (idByGuess) return { name: s.name, identified: true, label: s.name };
  if (wrong) return { name: MIN[f.guess!]?.name ?? 'Unknown', identified: false, label: `${MIN[f.guess!]?.name ?? '?'} (unconfirmed)` };
  return { name: 'Unidentified mineral', identified: false, label: 'Unidentified mineral' };
}
