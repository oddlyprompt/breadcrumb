import { N, DX, DY, DDIST, idx, inb } from './terrain';

class Heap {
  k: number[] = []; v: number[] = [];
  push(key: number, val: number) { const K = this.k, V = this.v; let i = K.length; K.push(key); V.push(val); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; } }
  pop(): number { const K = this.k, V = this.v; const v = V[0]; const lk = K.pop()!, lv = V.pop()!; if (K.length) { K[0] = lk; V[0] = lv; let i = 0; const n = K.length; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && K[l] < K[m]) m = l; if (r < n && K[r] < K[m]) m = r; if (m === i) break; [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m; } } return v; }
  get size() { return this.k.length; }
}

/** A* over the cell grid. cost(c) is the multiplier for entering cell c (Infinity = blocked). */
export function aStar(from: number, to: number, cost: (c: number, fromCell: number) => number, minCost = 1): number[] | null {
  if (from === to) return [from];
  const g = new Float32Array(N * N).fill(Infinity); const prev = new Int32Array(N * N).fill(-1);
  const h = new Heap(); g[from] = 0;
  const tx = to % N, ty = (to / N) | 0;
  const heur = (c: number) => Math.hypot((c % N) - tx, ((c / N) | 0) - ty) * DDIST[0] * minCost;
  h.push(heur(from), from);
  const closed = new Uint8Array(N * N);
  while (h.size) {
    const c = h.pop(); if (closed[c]) continue; closed[c] = 1;
    if (c === to) break;
    const cx = c % N, cy = (c / N) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k]; if (!inb(nx, ny)) continue; const ni = idx(nx, ny); if (closed[ni]) continue;
      const m = cost(ni, c); if (!isFinite(m)) continue;
      const ng = g[c] + DDIST[k] * 0.5 * (m + cost(c, c));
      if (ng < g[ni]) { g[ni] = ng; prev[ni] = c; h.push(ng + heur(ni), ni); }
    }
  }
  if (!closed[to]) return null;
  const path: number[] = []; for (let c = to; c >= 0; c = prev[c]) path.push(c);
  return path.reverse();
}

/** Smooth a cell path into a metre polyline with gentle seeded meander. */
export function pathToPolyline(path: number[], CELLSZ: number): Array<[number, number]> {
  const pts: Array<[number, number]> = path.map(c => [(c % N + 0.5) * CELLSZ, (((c / N) | 0) + 0.5) * CELLSZ]);
  if (pts.length < 3) return pts;
  const out: Array<[number, number]> = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    out.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
