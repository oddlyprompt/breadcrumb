import { Rng, stream } from './rng';
import type { HistoryData, Business, Person } from './history_types';
import type { Culture } from './names';
import { matAvailable } from './artifacts';

export interface TokenSeries { id: string; business: string; value: number; label: string; metal: string; from: number; to: number; mintage: number; share: number; lines: string[]; shape: 'round' | 'scalloped' | 'square' | 'holed'; kind: 'scrip' | 'transit' | 'trade'; expected: number; }
export interface MedalSeries { id: string; event: string; kind: 'commemorative' | 'gallantry'; year: number; mintage: number; metal: string; settlement?: string; person?: string; lines: string[]; expected: number; }
export interface Issues { tokens: TokenSeries[]; medals: MedalSeries[]; }

export function makeIssues(seed: string, H: HistoryData, culture: Culture): Issues {
  const r = stream(seed, 'issues'); const tokens: TokenSeries[] = []; const medals: MedalSeries[] = [];
  const S = new Map(H.settlements.map(s => [s.id, s])); const P = new Map(H.people.map(p => [p.id, p]));
  let tn = 0, mn = 0;
  for (const b of H.businesses) {
    if (b.tokenFrom === undefined) continue; const s = S.get(b.settlement)!;
    const to = Math.min(b.tokenTo ?? b.tokenFrom + 10, b.closed ?? 9999);
    const dens = r.pick([[1, 5, 10, 25], [5, 10, 25], [10, 25, 50], [1, 5]]);
    if (to < b.tokenFrom) continue;
    for (const v of dens) {
      const era = b.tokenFrom;
      const metal = r.pick(['brass', 'brass', 'copper', 'zinc', 'aluminium', 'aluminium'].filter(m => matAvailable(m, era)));
      const mintage = Math.round(Math.max(200, r.logNormal(b.capacity * 600 * (v <= 5 ? 1.4 : v >= 25 ? 0.4 : 1), 0.7)));
      const trade = b.name.toUpperCase();
      tokens.push({ id: `TK${++tn}`, business: b.id, value: v, label: `GOOD FOR ${v} ${v >= 100 ? culture.currencyName.toUpperCase() : culture.currencyMinor.toUpperCase()} IN TRADE`, metal, from: b.tokenFrom, to, mintage, share: 1, lines: [trade, s.name.toUpperCase(), `GOOD FOR ${v} IN TRADE`], shape: r.pick(['round', 'round', 'scalloped', 'square', 'holed']), kind: 'scrip', expected: mintage * 0.1 * Math.exp(-(H.endYear - to) / 500) });
    }
  }
  for (const ev of H.events) {
    if (!ev.extra?.medal) continue; const s = ev.settlement ? S.get(ev.settlement) : undefined;
    if (ev.kind === 'commemoration') {
      const mintage = Math.round(r.logNormal(900, 0.7) * (s ? Math.min(3, Math.max(0.4, s.peak / 2500)) : 1));
      const metal = r.pick(['bronze', 'silver', 'brass', 'aluminium', 'cupronickel'].filter(m => matAvailable(m, ev.year)));
      medals.push({ id: `MD${++mn}`, event: ev.id, kind: 'commemorative', year: ev.year, mintage, metal: metal === 'cupronickel' ? 'brass' : metal, settlement: s?.id, lines: [`${s?.name.toUpperCase() ?? ''}`, `JUBILEE ${ev.year}`, ev.extra.age ? `${ev.extra.age} YEARS` : 'FAIR AND PARADE'], expected: mintage * 0.15 });
    } else if (ev.kind === 'rescue') {
      const person = ev.people[0]; const p = P.get(person)!;
      medals.push({ id: `MD${++mn}`, event: ev.id, kind: 'gallantry', year: ev.year, mintage: 1, metal: r.pick(['silver', 'bronze']), settlement: ev.settlement, person, lines: ['FOR GALLANTRY IN SAVING LIFE AT SEA', p.name.toUpperCase(), String(ev.year)], expected: 1 });
    }
  }
  return { tokens, medals };
}
