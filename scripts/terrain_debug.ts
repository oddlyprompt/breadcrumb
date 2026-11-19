import { generateTerrain, N } from '../src/sim/terrain';
import { writePNG } from './png';
const seed = process.argv[2] || 'alpha';
const t0 = performance.now();
const t = generateTerrain(seed);
console.log('terrain ms', (performance.now() - t0).toFixed(0), 'traits', JSON.stringify(t.traits));
let sea = 0, rivers = 0, maxE = 0; for (let i = 0; i < N * N; i++) { if (t.sea[i]) sea++; if (!t.sea[i] && t.Q[i] > 0.1) rivers++; maxE = Math.max(maxE, t.elev[i]); }
console.log('sea frac', (sea / N / N).toFixed(2), 'river cells', rivers, 'lakes', t.lakes.length, 'maxElev', maxE.toFixed(0));
const S = 3, W = N * S; const px = new Uint8Array(W * W * 4);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const c = ((y / S) | 0) * N + ((x / S) | 0); const e = t.elev[c]; let r, g, b;
  if (t.sea[c]) { r = 30; g = 70; b = 120; } else if (t.lake[c] >= 0) { r = 70; g = 120; b = 170; }
  else if (t.Q[c] > 0.1) { r = 60; g = 110; b = 190; }
  else { const k = Math.min(1, e / 1500); r = 90 + 140 * k; g = 140 + 60 * k - 60 * k * k; b = 80 + 100 * k; }
  const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
}
writePNG(`/tmp/claude-0/-home-user/ecbb76b0-234f-55c6-891a-94e5a9309d8a/scratchpad/terrain_${seed}.png`, W, W, px);
