export type SKind = 'agricultural_village' | 'mining_town' | 'fishing_village' | 'trading_post' | 'industrial_town' | 'port_city' | 'military_settlement' | 'railway_community' | 'seasonal_camp' | 'farmstead';
export const SKIND_LABEL: Record<SKind, string> = { agricultural_village: 'agricultural village', mining_town: 'mining town', fishing_village: 'fishing village', trading_post: 'trading post', industrial_town: 'industrial town', port_city: 'port city', military_settlement: 'military post', railway_community: 'railway community', seasonal_camp: 'seasonal camp', farmstead: 'farmstead' };

export interface Settlement {
  id: string; name: string; kind: SKind; cell: number; x: number; y: number; founded: number;
  abandoned?: number; abandonReason?: string; pop: number; peak: number; peakYear: number; popHist: number[];
  port: boolean; reason: string; parent?: string; depositId?: string; radius: number; streetAngle: number;
  current: boolean; relocatedTo?: string; relocatedFrom?: string; stationYear?: number; riverCell?: number; hasArchive?: boolean; founderId?: string;
  institutions: { school?: number; church?: number; hall?: number; library?: number; cemetery?: number };
  burnt: number[]; streets: string[];
  flooded: number[];
  kindHistory: Array<[number, SKind]>;
}
export interface Person {
  id: string; name: string; given: string; surname: string; born: number; died: number | null; deathCause?: string; deathPlace?: string;
  occupation: string; residence?: string; fame: number; spouse?: string; role?: string; notes: string[]; firstYearActive?: number;
}
export type BizKind = 'general_store' | 'bottler' | 'brewery' | 'glassworks' | 'pottery' | 'foundry' | 'sawmill' | 'brickworks' | 'quarry' | 'lime_kiln' | 'tannery' | 'cannery' | 'fishery' | 'mine_company' | 'smelter' | 'shipping_line' | 'hotel' | 'livery' | 'blacksmith' | 'jeweler' | 'bank' | 'newspaper' | 'button_works' | 'tin_shop' | 'mill' | 'chandlery' | 'brewery_cooperage' | 'railway_company' | 'ferry_company' | 'saddlery' | 'photographer' | 'garage';
export interface Business {
  id: string; name: string; short: string; kind: BizKind; settlement: string; x: number; y: number; founded: number; closed?: number; closure?: string;
  owners: Array<{ person: string; from: number; to: number | null; how: string }>; capacity: number; scale: number;
  mark: string; tokenFrom?: number; tokenTo?: number; productYears: [number, number]; depositId?: string; address: string;
  closedBy?: string; // event id
  successor?: string; predecessor?: string; fame: number;
}
export type EventKind = 'founding' | 'boom' | 'mining_discovery' | 'mine_opened' | 'mine_closed' | 'industrial_closure' | 'fire' | 'flood' | 'storm' | 'shipwreck' | 'railway_construction' | 'railway_opening' | 'railway_closure' | 'robbery' | 'battle' | 'conflict' | 'migration' | 'bankruptcy' | 'abandonment' | 'infrastructure' | 'accident_death' | 'lost_shipment' | 'epidemic' | 'drought' | 'commemoration' | 'relocation' | 'road_built' | 'road_closed' | 'business_founded' | 'cache_hidden' | 'cache_recovered' | 'trial' | 'rescue' | 'gold_rush' | 'business_sold';
export interface HEvent {
  id: string; kind: EventKind; year: number; month: number; day: number; title: string; text: string;
  settlement?: string; x?: number; y?: number; cell?: number; people: string[]; businesses: string[]; deposit?: string; vessel?: string; route?: string;
  magnitude?: number; prereqs: string[]; consequences: string[]; fame: number; extra?: Record<string, any>;
}
export interface Route {
  id: string; kind: 'track' | 'road' | 'railway' | 'highway'; name: string; from: string; to: string; path: number[]; pts: Array<[number, number]>;
  built: number; opened?: number; closed?: number; lifted?: number; upgrades: Array<[number, string]>; company?: string; eventId?: string; purpose?: string; width: number;
}
export interface Crossing { id: string; route: string; cell: number; x: number; y: number; kind: 'ford' | 'ferry' | 'bridge'; built: number; replaced?: number; replacedBy?: string; stream: number; destroyed?: Array<{ year: number; event: string }>; }
export interface Vessel { id: string; name: string; type: string; hull: 'wood' | 'iron' | 'steel'; power: 'sail' | 'steam' | 'diesel'; built: number; lost?: number; tonnage: number; homePort: string; captain?: string; crew: string[]; cargo: string; }
export interface Mine { id: string; deposit: string; settlement: string; company: string; opened: number; closed?: number; method: 'placer' | 'adit' | 'shaft' | 'open_pit' | 'quarry' | 'pan_diggings'; commodity: string; produced: number; unit: string; x: number; y: number; reason?: string; discoveryEvent: string; discoverer: string; tailingsRadius: number; claimName: string; }
export interface Polity { id: string; name: string; from: number; to: number; kind: 'homeland' | 'colony' | 'dominion'; }
export interface War { id: string; name: string; from: number; to: number; sides: [string, string]; local: boolean; }
export interface Cache {
  id: string; kind: 'loot' | 'savings' | 'valuables' | 'salvage'; year: number; x: number; y: number; depth: number; container: string; owner: string; event: string;
  contents: Array<{ what: string; n: number; metal?: string; note?: string }>; recovered?: number; why: string; marker: string; value: number; story: string;
}
export interface Family { id: string; surname: string; origin: string; }
export interface HistoryData {
  startYear: number; endYear: number; polities: Polity[]; wars: War[]; econ: number[]; depressions: number[];
  settlements: Settlement[]; people: Person[]; businesses: Business[]; events: HEvent[]; routes: Route[]; crossings: Crossing[]; vessels: Vessel[]; mines: Mine[]; caches: Cache[];
  placerWorked: Record<number, [number, number]>; homeland: string; independence: number; currencyMajor: string; currencyMinor: string; floods: Array<{ year: number; scale: number; event: string }>; storms: Array<{ year: number; severity: number; event: string; windAngle: number }>;
}
