import { Rng, stream } from './rng';
import type { HistoryData } from './history_types';
import type { Culture } from './names';
import { START_YEAR } from './tech';

export interface DesignType { id: string; authority: 'homeland' | 'local'; from: number; to: number; obverse: string; reverseMotif: string; legend: string; motto: string; }
export interface CoinSeries {
  id: string; authority: 'homeland' | 'local'; polity: string; denom: number; denomText: string; metal: string; archetype: string; year: number; mintage: number;
  type: string; massG: number; diameter: number; edge: 'plain' | 'reeded' | 'milled' | 'lettered'; mint: string; share: number; life: number; note?: string;
  expected: number; // expected surviving coins in the region today
}
export interface Coinage { series: CoinSeries[]; types: DesignType[]; byId: Record<string, CoinSeries>; localFrom: number; }

const OBV_HOME = ['Crowned bust of the sovereign facing right', 'Laureate head of the sovereign facing left', 'Crowned royal arms', 'Crowned cipher of the sovereign between sprigs'];
const OBV_LOCAL = ['A sailing ship under full sail', 'A sheaf of wheat bound with ribbon', 'Crossed anchor and plough', 'A standing figure of Commerce', 'A wading heron', 'A pine tree beside a river', 'A rising sun over hills', 'A lighthouse on a headland', 'Allegorical figure of Liberty', 'A stylised ship and the founder\'s portrait', 'A river between mountains'];
const REV_MOTIF = ['the value within a wreath', 'the value beneath crossed sprigs', 'the value with a rope border', 'a shield of arms', 'the value between stars'];
const MOTTO = ['UNITY AND INDUSTRY', 'BY THE WATER AND THE PLOUGH', 'IN FAITH AND TRADE', 'WE BUILD', 'FORWARD', 'PROVIDENCE GUIDES', 'STRENGTH IN UNION', 'HONOUR AND LABOUR'];

export function makeCoinage(seed: string, H: HistoryData, culture: Culture): Coinage {
  const r = stream(seed, 'coinage');
  const major = culture.currencyName, minor = culture.currencyMinor;
  const localFrom = H.startYear + r.int(28, 80);
  const types: DesignType[] = []; const series: CoinSeries[] = [];
  const mkTypes = (auth: 'homeland' | 'local', from: number, to: number) => {
    let y = from, n = 0;
    while (y <= to) {
      const len = r.int(14, 42); const motifs = auth === 'homeland' ? OBV_HOME : OBV_LOCAL;
      const polityName = auth === 'homeland' ? H.homeland : (y < H.independence ? H.polities[1].name : H.polities[2].name);
      types.push({ id: `${auth[0]}T${++n}`, authority: auth, from: y, to: Math.min(to, y + len - 1), obverse: r.pick(motifs), reverseMotif: r.pick(REV_MOTIF), legend: polityName.toUpperCase(), motto: r.pick(MOTTO) });
      y += len;
    }
  };
  mkTypes('homeland', 1600, 1865); mkTypes('local', localFrom, H.endYear);
  const typeAt = (auth: 'homeland' | 'local', y: number) => types.find(t => t.authority === auth && y >= t.from && y <= t.to)!;
  interface Den { v: number; freq: number; base: number; }
  const dens: Den[] = [{ v: 1, freq: 1, base: 1.6e6 }, { v: 2, freq: 0.8, base: 0.9e6 }, { v: 5, freq: 0.9, base: 0.9e6 }, { v: 10, freq: 0.95, base: 1.1e6 }, { v: 25, freq: 0.85, base: 0.7e6 }, { v: 50, freq: 0.6, base: 0.35e6 }, { v: 100, freq: 0.35, base: 0.15e6 }, { v: 500, freq: 0.3, base: 4e4 }, { v: 1000, freq: 0.2, base: 1.5e4 }, { v: 2000, freq: 0.12, base: 0.6e4 }];
  const metalFor = (v: number, y: number, auth: 'homeland' | 'local'): string | null => {
    if (v >= 500) return y <= (auth === 'homeland' ? 1914 : 1933) ? 'gold' : null;
    if (v <= 2) return y < 1860 ? 'copper' : y < 1982 ? 'bronze' : auth === 'local' ? 'zinc' : 'copper';
    if (v === 5) return y < 1866 ? 'silver' : 'cupronickel';
    if (v === 10) return y < 1947 ? 'silver' : 'cupronickel';
    if (v === 25 || v === 50) return y < 1965 ? 'silver' : 'cupronickel';
    if (v === 100) return y < 1936 ? 'silver' : 'cupronickel';
    return null;
  };
  const geom = (v: number, metal: string, y: number) => {
    const d = { 1: 19, 2: 25, 5: 17, 10: 18, 25: 24, 50: 29, 100: 36, 500: 17, 1000: 21, 2000: 27 }[v] ?? 22;
    const massBase = { copper: 7.5, bronze: 3.1, zinc: 2.5, silver: 1, gold: 1, cupronickel: 1 }[metal] ?? 1;
    let m: number;
    if (metal === 'silver') m = ({ 5: 0.9, 10: 1.8, 25: 5.0, 50: 11.2, 100: 24 } as any)[v] ?? 5;
    else if (metal === 'gold') m = ({ 500: 4.1, 1000: 8.3, 2000: 16.7 } as any)[v];
    else if (metal === 'cupronickel') m = ({ 5: 3.2, 10: 2.3, 25: 5.1, 50: 11.3, 100: 18.5 } as any)[v] ?? 5;
    else m = (v === 1 ? 3.1 : v === 2 ? 6.2 : 7.5) * (metal === 'copper' ? 2.4 : massBase / 3.1);
    const edge: CoinSeries['edge'] = v >= 25 && metal !== 'copper' && metal !== 'bronze' ? 'reeded' : metal === 'gold' ? 'reeded' : y > 1830 ? 'plain' : 'plain';
    return { d: d * (metal === 'copper' && y < 1800 ? 1.25 : 1), m, edge };
  };
  const life = (m: string) => m === 'gold' ? 60 : m === 'silver' ? 40 : m === 'cupronickel' ? 38 : 28;
  const survival = (m: string, age: number, y: number) => {
    let s = m === 'gold' ? 0.2 : m === 'silver' ? 0.35 : m === 'copper' ? 0.35 : m === 'bronze' ? 0.4 : m === 'zinc' ? 0.3 : 0.45;
    s *= Math.exp(-age / 400);
    if (m === 'silver' && y >= 1964 - 40) s *= 0.8;
    return s;
  };
  const authorities: Array<{ a: 'homeland' | 'local'; from: number; to: number; share: number }> = [
    { a: 'homeland', from: Math.max(1600, H.startYear - 25), to: 1865, share: r.float(0.0015, 0.008) },
    { a: 'local', from: localFrom, to: H.endYear, share: r.float(0.08, 0.35) },
  ];
  let sn = 0;
  for (const au of authorities) for (let y = au.from; y <= au.to; y++) {
    const econ = H.econ[Math.max(0, Math.min(H.econ.length - 1, y - H.startYear))] ?? 1;
    const war = H.wars.find(w => y >= w.from && y <= w.to);
    for (const d of dens) {
      const metal = metalFor(d.v, y, au.a); if (!metal) continue;
      if (!r.chance(d.freq * (war && d.v >= 100 ? 0.5 : 1))) continue;
      const growth = au.a === 'local' ? 0.5 + (y - localFrom) / 90 : 1;
      let mintage = d.base * econ * growth * r.logNormal(1, 0.75);
      let note: string | undefined;
      if (r.chance(0.07)) { mintage *= r.float(0.02, 0.12); note = 'low mintage'; }
      if (y > 1990) mintage *= 2.5; if (au.a === 'homeland') mintage *= 1.2;
      mintage = Math.round(mintage);
      const t = typeAt(au.a, y); const { d: dia, m, edge } = geom(d.v, metal, y);
      const arch = metal === 'gold' ? 'coin_gold' : metal === 'silver' ? 'coin_silver' : metal === 'cupronickel' ? 'coin_cupronickel' : 'coin_copper';
      const denomText = d.v >= 100 ? `${d.v / 100} ${major.toUpperCase()}${d.v >= 200 ? 'S' : ''}` : `${d.v} ${minor.toUpperCase()}${d.v > 1 ? 'S' : ''}`;
      const s: CoinSeries = { id: `CS${++sn}`, authority: au.a, polity: au.a === 'homeland' ? H.homeland : (y < H.independence ? H.polities[1].name : H.polities[2].name), denom: d.v, denomText, metal, archetype: arch, year: y, mintage, type: t.id, massG: m, diameter: dia, edge, mint: au.a === 'homeland' ? '' : (y > 1900 && r.chance(0.3) ? 'B' : ''), share: au.share, life: life(metal), note, expected: 0 };
      s.expected = mintage * au.share * survival(metal, H.endYear - y, y);
      series.push(s);
    }
  }
  return { series, types, byId: Object.fromEntries(series.map(s => [s.id, s])), localFrom };
}
