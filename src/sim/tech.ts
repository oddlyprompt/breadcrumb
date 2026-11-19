// Technology chronology. Nothing may be produced before its entry here.
// (Broadly real-world; every place, firm and person in the game is fictional.)
export const START_YEAR = 1624;
export const PRESENT_YEAR = 2024;

export const TECH: Record<string, number> = {
  coinage: 1500, wroughtIron: 1500, handBlownGlass: 1500, flintlock: 1620, clayPipe: 1580, cutNail: 1790, pressedGlass: 1830, tinCan: 1810,
  percussionCap: 1825, railway: 1830, steamship: 1840, telegraph: 1850, safetyPin: 1849, massButton: 1850, ironHull: 1855, metalCartridge: 1866, dynamite: 1868,
  celluloid: 1872, barbedWire: 1874, wireNail: 1890, aluminium: 1895, crownCap: 1895, telephone: 1890, electricLight: 1895, machineBottle: 1905,
  automobile: 1908, licensePlate: 1910, zipper: 1925, bakelite: 1915, zincCent: 1982, pullTab: 1963, stayTab: 1975, plastic: 1945, ballpoint: 1950, aluminiumCan: 1962,
  cupronickel: 1866, cyanide: 1892, flotation: 1912, steamShovel: 1905, pneumaticDrill: 1880, stampMill: 1700, pottery: 1500, buttonBone: 1500,
  photography: 1845, bicycle: 1880, steelPlough: 1837, stoneware: 1500, transferware: 1780, milkBottle: 1885, canningFactory: 1850, sanitaryCan: 1904,
  radio: 1925, airfield: 1938, diesel: 1935, chainsaw: 1950, ringPull: 1962,
};
export const has = (tech: keyof typeof TECH | string, year: number) => year >= (TECH as Record<string, number>)[tech];

/** how much metal a given currency era is made of */
export type Metal = 'gold' | 'silver' | 'copper' | 'bronze' | 'cupronickel' | 'nickel' | 'zinc' | 'brass' | 'iron' | 'lead' | 'tin' | 'pewter' | 'aluminium' | 'steel' | 'ceramic' | 'glass' | 'bone' | 'wood' | 'leather' | 'cloth' | 'stone' | 'paper' | 'plastic' | 'shell' | 'rubber' | 'fired_clay' | 'celluloid' | 'sterling' | 'goldfilled' | 'rolled_gold' | 'organic';

// spot prices (currency per gram, present-day relative scale of this world's economy)
export const SPOT: Record<string, number> = { gold: 62, silver: 0.85, sterling: 0.75, copper: 0.0095, bronze: 0.008, brass: 0.007, cupronickel: 0.012, nickel: 0.018, zinc: 0.003, iron: 0.0006, steel: 0.0008, lead: 0.0022, tin: 0.03, pewter: 0.012, aluminium: 0.0025, goldfilled: 0.8, rolled_gold: 0.05 };
