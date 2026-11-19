import { generateWorld } from '../src/sim/world';
import { generateSite } from '../src/sim/artifacts';
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['alpha'];
for (const seed of seeds) {
  const t0 = performance.now(); const w = generateWorld(seed); const t1 = performance.now();
  const S = w.H.settlements.find(s => s.id === w.start.settlement)!;
  console.log(`${seed}: world ${(t1 - t0).toFixed(0)}ms name "${w.name}" culture ${w.culture.id} start ${S.name} (${S.kind}, ${Math.round(S.pop)}) because ${w.start.reason}; sites ${w.sites.sites.length} docs ${w.docs.length} features ${w.sites.features.length}`);
  const t2 = performance.now(); let total = 0, maxN = 0, sitesDone = 0; const byArch: Record<string, number> = {}; const kinds: Record<string, number> = {};
  for (const st of w.sites.sites) { if (st.densityMult <= 0) continue; const a = generateSite(w, st); total += a.length; maxN = Math.max(maxN, a.length); sitesDone++; kinds[st.kind] = (kinds[st.kind] || 0) + a.length; for (const x of a) byArch[x.arch] = (byArch[x.arch] || 0) + 1; }
  console.log(`  artifacts ${total} over ${sitesDone} sites in ${(performance.now() - t2).toFixed(0)}ms, max/site ${maxN}, decayed ${w.ledger.decayed}, archetypes seen ${Object.keys(byArch).length}`);
  console.log('  by site kind', JSON.stringify(kinds));
  console.log('  top', Object.entries(byArch).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '));
}
