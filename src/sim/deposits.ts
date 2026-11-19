import { Rng, stream } from './rng';
import { N, CELL, DX, DY, idx, inb, Terrain, CREEK_Q, cellCenter } from './terrain';
import { Geology, Formation } from './geology';
import { Namer, Culture } from './names';
import { TAXA, Taxon, periodOf } from './fossils';

export type DepositKind = 'orogenic_gold' | 'epithermal' | 'porphyry_copper' | 'lead_zinc' | 'pegmatite' | 'iron_formation' | 'fossil_bed' | 'evaporite' | 'coal' | 'geode_field' | 'quartz_veins';
export interface Deposit {
  id: string; kind: DepositKind; name: string; cell: number; x: number; y: number;
  formation: number; ageMa: number; process: string; faultId?: number; plutonId?: number;
  minerals: { primary: string[]; gangue: string[]; supergene: string[] };
  commodity: string; tonnage: number; grade: number; gradeUnit: string; ag?: number;   // grade of main commodity
  viableFrom: number | null;  // first year the deposit could be worked at a profit (null: never economic)
  surfaceRadius: number;      // metres over which float / outcrop shows at surface
  expression: string; alteration: string; depthToTop: number;
  taxa?: string[]; env?: string; // fossil beds
  bulk: boolean;
}
export interface PlacerTrain { sourceId: string; cells: Array<{ cell: number; dist: number; richness: number }>; mineral: string; }

export interface DepositModel { kind: DepositKind; label: string; requirement: string; examples: string; clue: string; }
export const MODELS: Record<DepositKind, DepositModel> = {
  orogenic_gold: { kind: 'orogenic_gold', label: 'Orogenic gold (quartz-vein) deposit', requirement: 'Metamorphic or greenstone host rock cut by a major fault or shear zone, in terrain that was once squeezed by mountain building. Hot fluids deposited gold in quartz veins.', examples: 'Gold-bearing quartz veins with pyrite and arsenopyrite.', clue: 'Rusty (limonite-stained) quartz float on slopes near faults in greenstone, schist or slate; placer gold in the creeks that drain them.' },
  epithermal: { kind: 'epithermal', label: 'Epithermal gold-silver deposit', requirement: 'Young volcanic rock (rhyolite, andesite) near faults or collapsed volcanic centres, where hot springs deposited metals close to the surface.', examples: 'Banded quartz-chalcedony veins with electrum and silver sulfides.', clue: 'Bleached, silicified or clay-altered volcanic hills; banded quartz float; silver tarnish on specimens.' },
  porphyry_copper: { kind: 'porphyry_copper', label: 'Porphyry copper deposit', requirement: 'A small intermediate intrusion (diorite or granodiorite stock) in a volcanic or mountain-building belt, with a halo of altered rock around it.', examples: 'Disseminated chalcopyrite and bornite with molybdenite; green and blue copper carbonates at the surface.', clue: 'A rusty, leached cap with malachite and azurite stains over a circular stock; epidote and chlorite halo.' },
  lead_zinc: { kind: 'lead_zinc', label: 'Lead-zinc mineralisation', requirement: 'Limestone or dolostone hosts, either in a basin where warm brines migrated through faults and breccias, or as skarn where a granite intrusion baked limestone.', examples: 'Galena and sphalerite with fluorite, barite and calcite.', clue: 'Heavy grey galena crystals in broken dolomite; fluorite and barite float; white cerussite crusts.' },
  pegmatite: { kind: 'pegmatite', label: 'Pegmatite', requirement: 'Granitic intrusions leave residual fluids rich in rare elements that crystallise as coarse dikes in and around the pluton.', examples: 'Large crystals of feldspar, mica, tourmaline, beryl and garnet.', clue: 'Coarse-grained pale rock with giant crystals in a belt around granite bodies.' },
  iron_formation: { kind: 'iron_formation', label: 'Banded iron formation', requirement: 'An ancient marine chemical sediment (Precambrian) of alternating iron oxide and chert bands, often enriched by weathering.', examples: 'Hematite, magnetite and jasper.', clue: 'Red and black banded rock; strong magnetic effects on compasses and metal detectors.' },
  fossil_bed: { kind: 'fossil_bed', label: 'Fossil bed', requirement: 'Sedimentary rock deposited in an environment that supported the organisms of its age and buried them quickly. Fossils cannot occur in igneous or strongly metamorphosed rock.', examples: 'Shells, bones, plants and teeth appropriate to the rock\'s age and habitat.', clue: 'Eroding river banks, sea cliffs and stream cuts in sedimentary formations.' },
  evaporite: { kind: 'evaporite', label: 'Evaporite deposit', requirement: 'Seawater evaporated in a restricted, arid basin; gypsum and salt remain as beds.', examples: 'Gypsum, selenite, halite.', clue: 'White gypsum outcrops; selenite crystals weathering out of clay soils; salt springs.' },
  coal: { kind: 'coal', label: 'Coal or lignite seam', requirement: 'Plant debris buried in lowland swamps; only possible after land plants formed forests (Carboniferous and later).', examples: 'Coal with fern and scale-tree fossils in the roof shales.', clue: 'Black smears in stream banks; fern fossils in dark shale.' },
  geode_field: { kind: 'geode_field', label: 'Agate and geode field', requirement: 'Gas bubbles in cooling lava filled slowly with silica and other minerals.', examples: 'Agate nodules, amethyst geodes and zeolites.', clue: 'Rounded nodules weathering out of basalt and rhyolite soils.' },
  quartz_veins: { kind: 'quartz_veins', label: 'Hydrothermal quartz veins', requirement: 'Open fractures in hard rock filled by hot silica-rich fluids.', examples: 'Clear quartz crystals in cavities.', clue: 'White quartz veins cutting granite, gneiss and schist.' },
};

export interface DepositsOut { deposits: Deposit[]; placers: PlacerTrain[]; }

export function generateDeposits(seed: string, T: Terrain, G: Geology, culture: Culture): DepositsOut {
  const r = stream(seed, 'deposits');
  const namer = new Namer(culture, stream(seed, 'depnames'));
  const out: Deposit[] = [];
  const F = (c: number) => G.formations[G.formationOf[c]];
  const landOK = (c: number) => !T.sea[c] && T.lake[c] < 0;
  const taken: number[] = [];
  const spaced = (c: number, minD: number) => taken.every(t => Math.hypot((t % N) - (c % N), ((t / N) | 0) - ((c / N) | 0)) > minD);

  const gradeOf = (median: number, sigma = 0.55) => r.logNormal(median, sigma);
  const pushDep = (kind: DepositKind, c: number, f: Formation, extra: Partial<Deposit>) => {
    const [x, y] = cellCenter(c);
    const d: Deposit = {
      id: `D${out.length + 1}`, kind, name: '', cell: c, x: x + r.float(-0.4, 0.4) * CELL, y: y + r.float(-0.4, 0.4) * CELL,
      formation: G.formationOf[c], ageMa: extra.ageMa ?? f.ageMa, process: '', minerals: { primary: [], gangue: [], supergene: [] }, commodity: '', tonnage: 0, grade: 0, gradeUnit: '',
      viableFrom: null, surfaceRadius: 200, expression: '', alteration: '', depthToTop: 0, bulk: false, ...extra,
    };
    out.push(d); taken.push(c); return d;
  };
  const choose = (cands: Array<[number, number]>, n: number, minD: number, pushFn: (c: number) => void) => {
    const pool = cands.slice();
    for (let k = 0; k < n && pool.length; k++) {
      const total = pool.reduce((a, b) => a + b[1], 0); let rr = r.next() * total, j = 0;
      for (; j < pool.length; j++) { rr -= pool[j][1]; if (rr <= 0) break; }
      const [c] = pool[Math.min(j, pool.length - 1)];
      if (spaced(c, minD)) pushFn(c);
      pool.splice(Math.min(j, pool.length - 1), 1);
    }
  };
  const mixedBias = T.traits.emphasis === 'mining' ? 1.8 : T.traits.emphasis === 'fossil' ? 0.7 : 1;

  // 1. orogenic gold
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) {
      if (!landOK(c)) continue; const f = F(c);
      const host = f.tags.includes('greenstone') || (f.tags.includes('metased') && f.rock !== 'quartzite') || f.rock === 'greywacke';
      if (!host || f.ageMa < 300) continue;
      const fd = G.faultDist[c]; if (fd > 3500) continue;
      cands.push([c, (1 / (1 + fd / 900)) * (G.plutonR[c] < 2.5 ? 1.8 : 1) * (f.tags.includes('greenstone') ? 1.4 : 1)]);
    }
    const n = cands.length < 5 ? 0 : Math.min(7, Math.round(r.float(0.6, 1.6) * mixedBias * (1 + cands.length / 120)));
    choose(cands, n, 8, c => {
      const f = F(c); const grade = gradeOf(7, 0.65);
      const d = pushDep('orogenic_gold', c, f, {
        process: 'Gold-bearing quartz veins precipitated from metamorphic fluids moving up a fault or shear zone, after the host rock was deformed', faultId: G.faultOf[c] >= 0 ? G.faultOf[c] : undefined,
        minerals: { primary: ['quartz', 'pyrite', 'arsenopyrite', 'gold'], gangue: ['quartz', 'calcite', 'chlorite'], supergene: ['goethite'] },
        commodity: 'gold', tonnage: gradeOf(2e5, 1.0), grade, gradeUnit: 'g/t', expression: 'Rusty (limonite-stained) quartz outcrops and float on the slopes above the vein', alteration: 'Carbonate-sericite alteration halo', surfaceRadius: 160 + r.float(0, 200), depthToTop: 0,
      });
      d.minerals.primary = d.minerals.primary.concat(grade > 6 && r.chance(0.5) ? ['galena'] : []);
    });
  }
  // 2. epithermal
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) {
      if (!landOK(c)) continue; const f = F(c);
      if (!(f.tags.includes('felsic-volc') || f.tags.includes('intermediate-volc')) || f.ageMa > 170) continue;
      const fd = G.faultDist[c]; if (fd > 3000) continue;
      cands.push([c, 1 / (1 + fd / 800)]);
    }
    const n = cands.length < 5 ? 0 : Math.min(5, Math.round(r.float(0.5, 1.5) * mixedBias * (1 + cands.length / 140)));
    choose(cands, n, 8, c => {
      const f = F(c); const grade = gradeOf(5, 0.7);
      pushDep('epithermal', c, f, {
        process: 'Hot spring fluids deposited gold and silver in veins within a kilometre of the surface in a young volcanic field', faultId: G.faultOf[c] >= 0 ? G.faultOf[c] : undefined,
        minerals: { primary: ['quartz', 'electrum', 'acanthite', 'pyrite'], gangue: ['quartz', 'calcite'], supergene: ['goethite'] },
        commodity: 'gold', tonnage: gradeOf(1.5e5, 0.9), grade, ag: grade * r.float(12, 60), gradeUnit: 'g/t',
        expression: 'Bleached, silicified ridge with banded quartz-chalcedony float', alteration: 'Silicic core with argillic (clay) halo', surfaceRadius: 220 + r.float(0, 250), depthToTop: 0,
      });
    });
  }
  // 3. porphyry copper
  for (const pl of G.plutons) {
    const f = G.formations[pl.formation];
    if (!(f.rock === 'diorite' || f.rock === 'granodiorite') || f.ageMa > 450) continue;
    const terr = G.provinces[pl.province].terrane;
    if (terr !== 'arc' && !(terr === 'foldbelt' && r.chance(0.35))) continue;
    if (!r.chance(0.7 * Math.min(1.5, mixedBias))) continue;
    const c = idx(Math.round(pl.cx), Math.round(pl.cy)); if (!landOK(c)) continue;
    const grade = gradeOf(0.55, 0.4);
    pushDep('porphyry_copper', c, f, {
      process: 'Metal-rich fluids released from a cooling stock crackled the surrounding rock and deposited copper sulfides in a stockwork of tiny veins', plutonId: pl.id,
      minerals: { primary: ['chalcopyrite', 'bornite', 'molybdenite', 'pyrite'], gangue: ['quartz', 'epidote', 'chlorite', 'muscovite'], supergene: ['chalcocite', 'malachite', 'azurite', 'cuprite', 'goethite'] },
      commodity: 'copper', tonnage: gradeOf(8e7, 0.9), grade, gradeUnit: '% Cu', expression: 'Rusty leached cap stained with malachite and azurite over the stock', alteration: 'Potassic core, phyllic (sericite-pyrite) and propylitic (epidote-chlorite) halos',
      surfaceRadius: 400 + r.float(0, 350), bulk: true, depthToTop: r.float(0, 40),
    });
  }
  // 4. lead-zinc
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) {
      if (!landOK(c)) continue; const f = F(c);
      if (!f.tags.includes('carbonate')) continue;
      const skarn = f.tags.includes('skarn'); const basin = f.cls === 'sedimentary';
      if (!skarn && !basin && f.rock !== 'marble') continue;
      const fd = G.faultDist[c];
      const w = skarn ? 2 : f.rock === 'dolostone' ? 1.4 : 0.8;
      if (!skarn && fd > 4000) continue;
      cands.push([c, w / (1 + (skarn ? 0 : fd / 1200))]);
    }
    const n = cands.length < 8 ? 0 : Math.min(5, Math.round(r.float(0.5, 1.4) * mixedBias * (1 + cands.length / 200)));
    choose(cands, n, 8, c => {
      const f = F(c); const skarn = f.tags.includes('skarn');
      pushDep('lead_zinc', c, f, {
        process: skarn ? 'Metal-bearing fluids from a granite intrusion replaced limestone at the contact' : 'Warm basinal brines moved up faults and precipitated galena and sphalerite in dolomitised limestone',
        faultId: G.faultOf[c] >= 0 ? G.faultOf[c] : undefined, plutonId: skarn ? f.intrudes : undefined,
        minerals: { primary: ['galena', 'sphalerite', 'pyrite'], gangue: ['calcite', 'fluorite', 'barite', 'dolomite'], supergene: ['cerussite', 'smithsonite', 'anglesite', 'goethite'] },
        commodity: 'lead-zinc', tonnage: gradeOf(1.2e6, 1.0), grade: gradeOf(8, 0.4), gradeUnit: '% Pb+Zn', expression: 'Rusty gossan and broken dolomite carrying fluorite and barite float', alteration: 'Dolomitisation and silicification', surfaceRadius: 200 + r.float(0, 250), bulk: false,
        depthToTop: r.float(0, 15),
      });
    });
  }
  // 5. pegmatite
  for (const pl of G.plutons) {
    const f = G.formations[pl.formation];
    if (!f.tags.includes('granitic')) continue;
    const k = r.poisson(1.0 * Math.min(1.6, mixedBias));
    for (let i = 0; i < k; i++) {
      const a = r.float(0, Math.PI * 2), rr = r.float(1.0, 1.7);
      const x = Math.round(pl.cx + Math.cos(a) * pl.a * rr), y = Math.round(pl.cy + Math.sin(a) * pl.b * rr);
      if (!inb(x, y)) continue; const c = idx(x, y); if (!landOK(c) || !spaced(c, 3)) continue;
      pushDep('pegmatite', c, f, {
        process: 'Water-rich residual melt from the cooling granite crystallised slowly into coarse dikes in the surrounding rock', plutonId: pl.id,
        ageMa: f.ageMa, minerals: { primary: ['quartz', 'microcline', 'muscovite', 'tourmaline'], gangue: ['quartz'], supergene: [] }, commodity: 'gem and industrial minerals',
        tonnage: gradeOf(2e4, 1.0), grade: 1, gradeUnit: 'n/a', expression: 'Pale coarse-grained dikes with crystals many centimetres across', alteration: 'Albitisation of the wall rock', surfaceRadius: 90 + r.float(0, 90), depthToTop: 0,
      });
      const d = out[out.length - 1];
      if (r.chance(0.55)) d.minerals.primary.push('beryl'); if (r.chance(0.6)) d.minerals.primary.push('garnet');
    }
  }
  // 6. iron formation (each BIF outcrop zone gets a deposit)
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) if (landOK(c) && F(c).tags.includes('bif')) cands.push([c, 1]);
    const n = cands.length < 4 ? 0 : Math.min(4, 1 + Math.floor(cands.length / 90));
    choose(cands, n, 10, c => {
      pushDep('iron_formation', c, F(c), {
        process: 'Iron and silica precipitated in an ancient ocean; later weathering enriched the iron by leaching the silica',
        minerals: { primary: ['hematite', 'magnetite', 'jasper', 'chert'], gangue: ['quartz'], supergene: ['goethite'] }, commodity: 'iron', tonnage: gradeOf(5e7, 0.8), grade: r.float(32, 62), gradeUnit: '% Fe',
        expression: 'Red and black banded ridges; strong magnetic effect', alteration: 'Supergene enrichment', surfaceRadius: 450 + r.float(0, 400), bulk: true, depthToTop: 0,
      });
    });
  }
  // 7. fossil beds: every fossiliferous formation with a matching assemblage, sited where it is exposed
  const taxaFor = (f: Formation): Taxon[] => f.env ? TAXA.filter(t => t.from >= f.ageMa && t.to <= f.ageMa && t.envs.includes(f.env!)) : [];
  {
    for (const f of G.formations) {
      if (!f.fossiliferous) continue;
      const assemblage = taxaFor(f);
      if (!assemblage.length) continue;
      const cands: Array<[number, number]> = [];
      for (let c = 0; c < N * N; c++) {
        if (G.formationOf[c] !== f.id || !landOK(c)) continue;
        // beds show where rivers, coasts and slopes expose the rock
        const expo = (T.Q[c] > CREEK_Q ? 1.2 : 0) + (T.coastDist[c] < 2500 ? 1 : 0) + Math.min(1.5, T.slope[c] / 10) + 0.15;
        cands.push([c, expo]);
      }
      if (!cands.length) continue;
      const n = Math.min(5, Math.max(1, Math.round(cands.length / 70)));
      choose(cands, n, 4, c => {
        const d = pushDep('fossil_bed', c, f, {
          process: `Organisms of the ${periodOf(f.ageMa)} were buried in ${f.env!.replace('_', ' ')} sediment; later erosion has exposed the bed`,
          minerals: { primary: [], gangue: [], supergene: [] }, commodity: 'fossils', tonnage: 0, grade: 0, gradeUnit: '', taxa: assemblage.map(t => t.id), env: f.env,
          expression: 'Fossils weather out of the rock face and accumulate at its foot', alteration: '', surfaceRadius: 160 + r.float(0, 200),
        });
        void d;
      });
    }
  }
  // 8. evaporite
  for (const f of G.formations) {
    if (!f.tags.includes('evaporite')) continue;
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) if (G.formationOf[c] === f.id && landOK(c)) cands.push([c, 1]);
    choose(cands, Math.min(3, Math.ceil(cands.length / 80)), 6, c => {
      pushDep('evaporite', c, f, { process: f.process, minerals: { primary: ['gypsum', 'halite'], gangue: ['calcite'], supergene: [] }, commodity: 'gypsum and salt', tonnage: gradeOf(5e6, 0.8), grade: 1, gradeUnit: 'n/a',
        expression: 'White gypsum outcrops with selenite crystals in the soil', alteration: '', surfaceRadius: 300, bulk: true, depthToTop: 0 });
    });
  }
  // 9. coal
  for (const f of G.formations) {
    if (!f.tags.includes('coal')) continue;
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) if (G.formationOf[c] === f.id && landOK(c)) cands.push([c, 1 + Math.min(2, T.slope[c] / 8)]);
    choose(cands, Math.min(4, Math.ceil(cands.length / 70)), 5, c => {
      pushDep('coal', c, f, { process: 'Swamp plant debris buried and compacted; the seam outcrops where the valley has cut through the formation', minerals: { primary: ['coal'], gangue: ['pyrite'], supergene: [] }, commodity: 'coal', tonnage: gradeOf(4e6, 0.9), grade: 1, gradeUnit: 'n/a',
        expression: 'Black seam exposed in stream banks with fern fossils in the shale above', alteration: '', surfaceRadius: 250, bulk: true, depthToTop: 0 });
    });
  }
  // 10. geode fields in basalt, rhyolite and andesite
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) { if (!landOK(c)) continue; const f = F(c); if (f.tags.includes('basalt') || f.rock === 'rhyolite' || f.rock === 'andesite') cands.push([c, f.tags.includes('basalt') ? 1.5 : 0.6]); }
    const n = cands.length < 10 ? 0 : Math.min(4, 1 + Math.floor(cands.length / 130));
    choose(cands, n, 6, c => {
      const f = F(c);
      pushDep('geode_field', c, f, { process: 'Gas bubbles in the cooling lava were filled by silica-rich water, forming agate and crystal-lined geodes', minerals: { primary: ['agate', 'quartz', 'calcite', 'zeolite'].concat(r.chance(0.4) ? ['amethyst'] : []), gangue: [], supergene: [] },
        commodity: 'agate and geodes', tonnage: 1e4, grade: 1, gradeUnit: 'n/a', expression: 'Rounded nodules weather out of the lava soil', alteration: '', surfaceRadius: 260 });
    });
  }
  // 11. hydrothermal quartz veins
  {
    const cands: Array<[number, number]> = [];
    for (let c = 0; c < N * N; c++) { if (!landOK(c)) continue; const f = F(c); if ((f.tags.includes('granitic') || f.rock === 'gneiss' || f.rock === 'schist') && G.faultDist[c] < 2500) cands.push([c, 1]); }
    choose(cands, cands.length < 10 ? 0 : 3, 8, c => {
      pushDep('quartz_veins', c, F(c), { process: 'Silica-rich hot water filled open fractures and crystallised into clear quartz', minerals: { primary: ['quartz'], gangue: ['chlorite', 'muscovite'], supergene: [] },
        commodity: 'quartz crystals', tonnage: 5e3, grade: 1, gradeUnit: 'n/a', expression: 'White quartz veins with crystal-lined cavities', alteration: '', surfaceRadius: 100 });
    });
  }

  // names: deposits are named by geography for the survey; mines get a discoverer's name in history
  for (const d of out) {
    const label = d.kind === 'fossil_bed' ? 'Beds' : d.kind === 'coal' ? 'Seam' : d.kind === 'geode_field' ? 'Geode Field' : d.kind === 'pegmatite' ? 'Dike' : d.kind === 'iron_formation' ? 'Iron Range' : d.kind === 'evaporite' ? 'Gypsum Beds' : d.kind === 'quartz_veins' ? 'Veins' : 'Zone';
    d.name = namer.unique(() => `${namer.stem(2)} ${label}`);
    d.viableFrom = viableFrom(d);
  }

  // ---- placer gold trains: lode gold eroded into the drainage network, concentrated downstream
  const placers: PlacerTrain[] = [];
  for (const d of out) {
    if (!d.minerals.primary.includes('gold') && !d.minerals.primary.includes('electrum')) continue;
    if (d.grade < 2) continue;
    let c = d.cell; let dist = 0; const cells: PlacerTrain['cells'] = [];
    const lambda = 5000 + d.grade * 500; const rich0 = Math.min(1, d.grade / 12);
    for (let step = 0; step < 140; step++) {
      const dir = T.flow[c]; if (dir < 0) break;
      const x = (c % N) + DX[dir], y = ((c / N) | 0) + DY[dir]; if (!inb(x, y)) break;
      const nc = idx(x, y); dist += Math.hypot(DX[dir], DY[dir]) * CELL; c = nc;
      if (T.sea[c] || T.lake[c] >= 0) break;
      if (T.Q[c] < CREEK_Q) continue; // gold only collects where there is a stream
      const richness = rich0 * Math.exp(-dist / lambda) * (T.slope[c] < 3 ? 1.3 : T.slope[c] < 8 ? 1 : 0.5);
      if (richness < 0.015) break;
      cells.push({ cell: c, dist, richness });
    }
    if (cells.length) placers.push({ sourceId: d.id, cells, mineral: d.minerals.primary.includes('gold') ? 'gold' : 'electrum' });
  }
  return { deposits: out, placers };
}

/** First year a deposit could be worked at a profit with the technology of the day. */
function viableFrom(d: Deposit): number | null {
  switch (d.commodity) {
    case 'gold': return d.grade >= 18 ? 1650 : d.grade >= 10 ? 1700 : d.grade >= 6 ? 1790 : d.grade >= 3.5 ? 1895 : d.grade >= 2 ? 1935 : null;
    case 'copper': return d.grade >= 1.5 ? 1700 : d.grade >= 0.8 ? 1905 : d.grade >= 0.45 ? 1925 : null;
    case 'lead-zinc': return d.grade >= 10 ? 1680 : d.grade >= 6 ? 1830 : d.grade >= 4 ? 1910 : null;
    case 'iron': return d.grade >= 55 ? 1760 : d.grade >= 40 ? 1870 : 1925;
    case 'coal': return 1700;
    case 'gypsum and salt': return 1740;
    default: return null; // fossil beds, geodes, quartz, pegmatite: specimen sites, not mines
  }
}
export const isLode = (d: Deposit) => d.viableFrom !== null && d.kind !== 'fossil_bed';
