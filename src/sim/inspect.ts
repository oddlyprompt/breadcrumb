import { ARC } from './archetypes';
import { MAT } from './materials';
import { MIN } from './minerals';
import { TAXON, periodOf } from './fossils';
import { trueValue, specimenValue, RARITY_LABELS, rarityIndex } from './economy';
import { fmtDate, placeDescribe } from './describe';
import { cellOf } from './terrain';
import { SED_NAMES, VEG_NAMES } from './landscape';
import type { Artifact } from './artifacts';
import type { Specimen } from './specimens';
import type { World } from './worldtypes';
import type { Site } from './sites';
import { reachM } from './detector';
import { GEARBY } from './equipment';

export interface QA { q: string; a: string[] }
export function explainArtifact(w: World, a: Artifact, opts: { det?: string } = {}): QA[] {
  const H = w.H, arch = ARC[a.arch], m = MAT[a.mat], site = w.sites.byId.get(a.site)!; const c = cellOf(a.x, a.y);
  const act = site.acts.find(x => x.ctx === a.ctx && x.from <= a.deposited && x.to >= a.deposited) ?? site.acts.find(x => x.ctx === a.ctx);
  const ev = a.assoc.event ? H.events.find(e => e.id === a.assoc.event) : undefined; const maker = a.maker ? H.businesses.find(b => b.id === a.maker) : undefined;
  const persons = (a.assoc.persons ?? []).map(id => H.people.find(p => p.id === id)).filter(Boolean);
  const v = trueValue(w, a);
  const why: string[] = [`${arch.name}: ${arch.desc}`, `This site is "${site.name}" (${site.kind.replace(/_/g, ' ')}), active ${site.from}${site.to ? '–' + site.to : ' to the present'}.`];
  if (act) why.push(`Activity that produced it: ${act.note} (${act.ctx}); recorded about ${Math.round(act.n)} people-equivalents at the time.`);
  if (ev) why.push(`Linked event: ${ev.title} (${fmtDate(ev.year, ev.month, ev.day)}). ${ev.text}`);
  if (a.special === 'cache') why.push('Deliberately buried and never recovered; see the cache record.');
  persons.forEach(p => why.push(`Associated person: ${p!.name}, ${p!.occupation}, ${p!.born}–${p!.died ?? 'living'}${p!.deathCause ? ` (${p!.deathCause})` : ''}.`));
  const when: string[] = [`Produced: ${a.produced}. Deposited: ${a.deposited} (${a.deposited - a.produced} years of use before loss).`, `Production window of the type: ${arch.from}–${arch.to ?? 'present'}. Material ${m.name} available from ${a.mat === 'aluminium' ? 1895 : 'antiquity'}.`];
  if (maker) when.push(`Maker ${maker.name} operated ${maker.founded}–${maker.closed ?? 'present'} (${maker.closure ?? 'still trading'}).`);
  if (a.series) { const s = w.coin.byId[a.series]; when.push(`Coin series ${s.id}: ${s.denomText} of ${s.year}, mintage ${s.mintage.toLocaleString()}${s.note ? ` (${s.note})` : ''}; about ${s.expected.toFixed(1)} survive in the region.`); }
  const orig: string[] = [`Origin: ${a.origin}.`]; if (maker) { const t = H.settlements.find(s => s.id === maker.settlement)!; orig.push(`Made at ${t.name} (${t.kind.replace(/_/g, ' ')}, founded ${t.founded}).`); }
  const how: string[] = [`Deposited by: ${a.lossKind} at "${a.spot}" in ${a.deposited}; buried ${a.depth.toFixed(0)} cm deep (original position ${Math.round(a.x0)}, ${Math.round(a.y0)}).`];
  if (!a.moves.length) how.push('No later transport recorded: it lies where it was lost.');
  for (const mv of a.moves) { const e = mv.event ? H.events.find(q => q.id === mv.event) : undefined; how.push(`${mv.year}: ${mv.kind} moved it ${mv.dist.toFixed(0)} m${e ? ` (${e.title})` : ''}.`); }
  const surv: string[] = [`Time in the ground: ${H.endYear - a.deposited} years. Material: ${m.name} (${m.organic ? 'organic' : m.metal ? 'metal' : 'mineral'}), decay rate class ${m.decay}.`, `Soil here: ${SED_NAMES[w.L.sediment[c]]}, pH ${w.L.soilPH[c].toFixed(1)}, wetness ${(w.L.soilMoist[c] * 100).toFixed(0)}%, salinity ${(w.L.salinity[c] * 100).toFixed(0)}%, vegetation ${VEG_NAMES[w.L.veg[c]]}.`, `Resulting condition: corrosion ${(a.cond.corr * 100).toFixed(0)}%, wear ${(a.cond.wear * 100).toFixed(0)}%, damage ${(a.cond.dmg * 100).toFixed(0)}%, ${(a.cond.frag * 100).toFixed(0)}% of the object remains. ${m.patina ? 'Typical patina: ' + m.patina + '.' : ''}`];
  const rec: string[] = [];
  if (m.metal) { const det = GEARBY[opts.det ?? 'det1']; const set: any = { det, sens: 1, reject: [], ironReject: false, ground: 1 }; const reach = reachM(set, { id: a.id, x: 0, y: 0, depth: a.depth, mat: a.mat, L: a.dims[0], W: a.dims[1], mass: a.mass }); rec.push(`Metal (${m.ferrous ? 'ferrous' : `conductivity ${m.conductivity}`}), ${Math.round(a.dims[0])}×${Math.round(a.dims[1])} mm at ${a.depth.toFixed(0)} cm. A ${det.name} reaches this target type to about ${(reach * 100).toFixed(0)} cm in air: ${a.depth < reach * 100 * 0.8 ? 'it can be detected' : 'it is probably too deep for that machine'}.`); }
  else rec.push(`Not metal: a detector cannot see it. It is found by sight if on the surface (depth ${a.depth.toFixed(0)} cm), by digging, or by sifting a dump.`);
  rec.push(`Site access: ${site.access}. Still in the ground unless listed as recovered.`);
  const val = v.parts.map(p => `${p.label}: ${p.amount.toFixed(2)}${p.note ? ` (${p.note})` : ''}`); val.push(`Total ${v.total.toFixed(2)}; rarity ${v.rarityLabel} (est. ${v.rarityN >= 10 ? Math.round(v.rarityN) : v.rarityN.toFixed(1)} survive); tier ${['ordinary', 'interesting', 'significant', 'exceptional'][v.tier]}.`);
  return [{ q: '1. Why does this object exist?', a: why }, { q: '2. When was it produced?', a: when }, { q: '3. Where did it originate?', a: orig }, { q: '4. How did it reach its current location?', a: how }, { q: '5. Why has it survived?', a: surv }, { q: '6. Why is it recoverable?', a: rec }, { q: '7. How was its value calculated?', a: val }];
}
export function explainSpecimen(w: World, s: Specimen): QA[] {
  const G = w.G, f = G.formations[s.formation]; const c = cellOf(s.x, s.y); const dep = s.deposit ? w.D.deposits.find(d => d.id === s.deposit) : undefined; const v = specimenValue(w, s);
  const why = [`${s.name} (${s.kind}). ${s.why}`, `Formation: ${f.name}, ${f.rock}, ${periodOf(f.ageMa)} (${Math.round(f.ageMa)} Ma). ${f.process}.`]; if (dep) why.push(`Related deposit: ${dep.name} (${dep.kind.replace(/_/g, ' ')}): ${dep.process}.`);
  const when = [`Geological age of the host: ${Math.round(f.ageMa)} million years.`, s.taxon ? `${TAXON[s.taxon].name} lived ${TAXON[s.taxon].from}–${TAXON[s.taxon].to} Ma in ${TAXON[s.taxon].envs.join(', ').replace(/_/g, ' ')} settings; the host formation was deposited in ${f.env?.replace('_', ' ') ?? 'n/a'} conditions.` : `Mineral/rock formation process: ${f.process}.`];
  const orig = [dep ? `Source: ${dep.name} at ${Math.round(dep.x)}, ${Math.round(dep.y)}, ${(s.transport.dist / 1000).toFixed(2)} km away.` : `Source: the local ${f.name}.`];
  const how = [`Transport: ${s.transport.mode}. ${s.transport.text}.`];
  const surv = [`Hard, durable minerals and fossils survive weathering; here the ground is ${SED_NAMES[w.L.sediment[c]]} under ${VEG_NAMES[w.L.veg[c]]}.`];
  const rec = [s.panOnly ? 'Heavy mineral in stream gravel: recovered by panning the bar.' : s.depth > 1 ? 'Buried: recovered by digging.' : 'Lies on the surface: visible and collectable.', s.kind === 'hotrock' ? 'A hot rock: a detector decoy.' : ''].filter(Boolean);
  const val = v.parts.map(p => `${p.label}: ${p.amount.toFixed(2)}${p.note ? ` (${p.note})` : ''}`);
  return [{ q: '1. Why does this specimen exist?', a: why }, { q: '2. How old is it?', a: when }, { q: '3. Where did it originate?', a: orig }, { q: '4. How did it reach its current location?', a: how }, { q: '5. Why has it survived?', a: surv }, { q: '6. Why is it recoverable?', a: rec }, { q: '7. How was its value calculated?', a: val }];
}
/** Chains of connected evidence that exist in this world: artifact -> maker -> records -> site -> more artifacts. */
export function discoveryChains(w: World): Array<{ title: string; steps: string[] }> {
  const H = w.H; const out: Array<{ title: string; steps: string[] }> = [];
  for (const b of H.businesses) {
    if (b.tokenFrom === undefined || b.scale < 3) continue; const tok = w.issues.tokens.filter(t => t.business === b.id); const docs = w.docs.filter(d => d.refs.businesses.includes(b.id)); const site = w.sites.sites.find(s => s.refs.business === b.id);
    if (!docs.length) continue; const s = H.settlements.find(q => q.id === b.settlement)!;
    out.push({ title: `${b.name} (${s.name})`, steps: [`${tok.length} token issues (${b.tokenFrom}–${b.tokenTo}) found as trade tokens`, `${docs.length} records name it: ${[...new Set(docs.map(d => d.kind))].join(', ')}`, site ? `its works site: ${site.name} (${site.features.length} visible features)` : 'no separately searchable works site', `closed ${b.closed ?? 'never'}: ${b.closure ?? 'trading'}`] });
  }
  for (const e of H.events.filter(q => q.kind === 'shipwreck')) { const v = H.vessels.find(q => q.id === e.vessel)!; const site = w.sites.sites.find(s => s.refs.event === e.id && s.kind === 'wreck_debris'); const docs = w.docs.filter(d => d.refs.events.includes(e.id)); out.push({ title: `Wreck of the ${v.name} (${e.year})`, steps: [`${docs.length} newspaper/register records`, site ? `debris strand: ${site.name}` : 'debris lost', `cargo ${v.cargo}; ${e.magnitude ?? 0} crew lost`, ...(H.events.filter(r => r.kind === 'rescue' && r.prereqs.includes(e.id)).map(r => `rescue medal: ${r.title}`))] }); }
  for (const c of H.caches.filter(q => q.kind === 'loot')) { const ev = H.events.find(q => q.id === c.event)!; const docs = w.docs.filter(d => d.refs.events.some(e => e === c.event || H.events.find(x => x.id === e)?.prereqs.includes(c.event))); out.push({ title: `Unrecovered loot (${ev.year}): ${c.why}`, steps: [`${docs.length} records; hints: ${docs.reduce((n, d) => n + d.hints.length, 0)} area hints`, `buried ${c.depth.toFixed(0)} cm deep ${c.marker}`, `value ${c.value} ${H.currencyMajor}s`] }); }
  return out;
}
export const worldSummary = (w: World) => ({ seed: w.seed, name: w.name, culture: w.culture.id, traits: w.T.traits, provinces: w.G.provinces.map(p => `${p.name} (${p.terrane})`), deposits: w.D.deposits.length, settlements: H_count(w), events: w.H.events.length, sites: w.sites.sites.length, docs: w.docs.length });
const H_count = (w: World) => ({ total: w.H.settlements.length, current: w.H.settlements.filter(s => s.current && s.kind !== 'farmstead').length });
