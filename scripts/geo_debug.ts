import { generateTerrain, N } from '../src/sim/terrain';
import { generateGeology } from '../src/sim/geology';
import { generateDeposits } from '../src/sim/deposits';
import { generateLandscape } from '../src/sim/landscape';
import { CULTURES } from '../src/sim/names';
import { writePNG } from './png';
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta'];
for (const seed of seeds) {
  const t0 = performance.now();
  const T = generateTerrain(seed); const G = generateGeology(seed, T, CULTURES[0]); const D = generateDeposits(seed, T, G, CULTURES[0]); const L = generateLandscape(seed, T, G);
  const kinds: Record<string, number> = {}; for (const d of D.deposits) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
  console.log(seed, 'emph', T.traits.emphasis, 'ms', (performance.now() - t0).toFixed(0), 'terranes', G.provinces.map(p => p.terrane).join(','), 'plutons', G.plutons.length, 'faults', G.faults.length, 'placers', D.placers.length);
  console.log('   ', JSON.stringify(kinds));
  if (seed === seeds[0]) {
    const S = 3, W = N * S; const px = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const c = ((y / S) | 0) * N + ((x / S) | 0); const f = G.formations[G.formationOf[c]]; const i = (y * W + x) * 4;
      let col = T.sea[c] ? '#1e4678' : f.hex; const n = parseInt(col.slice(1), 16);
      px[i] = (n >> 16) & 255; px[i + 1] = (n >> 8) & 255; px[i + 2] = n & 255; px[i + 3] = 255;
    }
    for (const d of D.deposits) { const x = Math.floor(d.x / 250 * S), y = Math.floor(d.y / 250 * S); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const i = ((y + a) * W + x + b) * 4; px[i] = 255; px[i + 1] = d.kind === 'fossil_bed' ? 255 : 0; px[i + 2] = 0; } }
    writePNG(`/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad/geo_${seed}.png`, W, W, px);
  }
}
