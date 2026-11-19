import { generateWorld } from '../src/sim/world';
import { validateWorld } from '../src/sim/validate';
const n = Number(process.argv[2] || 6), start = Number(process.argv[3] || 0); const sample = Number(process.argv[4] || 60);
const tally: Record<string, number> = {}; const examples: Record<string, string> = {}; let worlds = 0;
const t0 = performance.now();
for (let i = 0; i < n; i++) {
  const seed = `val-${start + i}`; const w = generateWorld(seed); const rep = validateWorld(w, { siteSample: sample }); worlds++;
  for (const v of rep.violations) { const k = v.cat + ': ' + v.msg.replace(/[A-Z]{1,3}\d+/g, '#').replace(/\d+/g, 'N').replace(/[A-Z][a-zé'.]+( [A-Z][a-zé'.]+)*/g, 'X').slice(0, 70); tally[k] = (tally[k] || 0) + 1; examples[k] ??= `${seed} ${v.msg}`; }
  console.log(seed, 'violations', rep.violations.length, JSON.stringify(rep.stats));
}
console.log(`\n${worlds} worlds in ${((performance.now() - t0) / 1000).toFixed(0)}s; distinct problem classes: ${Object.keys(tally).length}`);
for (const [k, c] of Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(c, '|', examples[k]);
process.exit(Object.keys(tally).length ? 1 : 0);
