import type { Terrain } from './terrain';
import type { Geology } from './geology';
import type { DepositsOut } from './deposits';
import type { Landscape } from './landscape';
import type { Geography } from './geography';
import type { HistoryData } from './history_types';
import type { Coinage } from './coinage';
import type { Issues } from './issues';
import type { SiteSet } from './sites';
import type { Culture } from './names';
import type { Artifact } from './artifacts';
import type { Doc } from './documents';

export interface StartInfo { settlement: string; x: number; y: number; reason: string; }
export interface World {
  seed: string; genVersion: number; name: string; culture: Culture;
  T: Terrain; G: Geology; D: DepositsOut; L: Landscape; geo: Geography; H: HistoryData; coin: Coinage; issues: Issues; sites: SiteSet;
  start: StartInfo; docs: Doc[];
  artCache: Map<string, Artifact[]>; // lazily generated, deterministic per site
  ledger: { decayed: number; sitesGenerated: number };
}
