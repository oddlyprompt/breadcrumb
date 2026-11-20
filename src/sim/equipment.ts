export type GearCat = 'detector' | 'coil' | 'digger' | 'pinpointer' | 'bag' | 'loupe' | 'pan' | 'geo' | 'idkit' | 'cleaning' | 'book';
export interface Gear { id: string; name: string; cat: GearCat; price: number; tier: number; desc: string; s: Record<string, number | string | boolean>; }
const G = (id: string, name: string, cat: GearCat, price: number, tier: number, desc: string, s: Gear['s'] = {}): Gear => ({ id, name, cat, price, tier, desc, s });
export const GEAR: Gear[] = [
  G('det1', 'Rambler R1 detector', 'detector', 140, 1, 'A plain two-tone detector. Rejects iron with one switch. Good in dry, mild soil; struggles on salt beaches and mineral ground.', { depth: 18, coil: 0.12, gb: 0.2, notches: 0, ironReject: true, vdi: false, pi: false }),
  G('det2', 'Voyager V3 detector', 'detector', 480, 2, 'A mid-range multi-tone detector with a visual target number and three discrimination notches. Ground balance copes with most soils.', { depth: 27, coil: 0.14, gb: 0.55, notches: 3, ironReject: true, vdi: true, pi: false }),
  G('det3', 'Archivist A9 detector', 'detector', 1250, 3, 'A high-end detector: automatic ground tracking, five notches and a precise target number. Deep and quiet in mineral soil.', { depth: 36, coil: 0.16, gb: 0.85, notches: 5, ironReject: true, vdi: true, pi: false }),
  G('det4', 'Meridian PI detector', 'detector', 2600, 4, 'A pulse-induction machine: nearly immune to salt and mineralisation, so ideal for wet beaches and black-sand ground. It cannot discriminate: every metal target sounds the same.', { depth: 42, coil: 0.18, gb: 1.0, notches: 0, ironReject: false, vdi: false, pi: true }),
  G('coil_s', 'Small search coil (8 cm)', 'coil', 90, 2, 'Better at separating small targets in trashy ground and finding small gold; less depth.', { r: 0.08, depthMult: 0.82, smallBonus: 1.35 }),
  G('coil_l', 'Large search coil (22 cm)', 'coil', 150, 2, 'Reaches deeper for big targets and covers more ground, but blends neighbours together.', { r: 0.22, depthMult: 1.18, smallBonus: 0.8 }),
  G('trowel', 'Digging trowel', 'digger', 15, 1, 'Digs a neat 7 cm plug to 20 cm. Careful and quick.', { depth: 20, r: 0.07, speed: 1, care: 0.9 }),
  G('spade', 'Folding spade', 'digger', 38, 2, 'Digs a wide hole to 45 cm; faster in clay and gravel, but rougher on delicate finds.', { depth: 45, r: 0.15, speed: 1.4, care: 0.6 }),
  G('probe', 'Digging knife and probe', 'digger', 40, 2, 'A serrated knife for cutting turf plugs and a probe for feeling objects: the least damage, to 30 cm.', { depth: 30, r: 0.05, speed: 0.8, care: 1 }),
  G('pin1', 'Pinpointer wand', 'pinpointer', 55, 1, 'A hand probe that beeps when within 8 cm of metal, which saves digging half the garden.', { range: 0.08 }),
  G('pin2', 'Waterproof pinpointer', 'pinpointer', 130, 3, 'Detects at 13 cm with a vibration grip and works in wet ground and surf.', { range: 0.13 }),
  G('bag1', 'Finds pouch', 'bag', 12, 1, 'A belt pouch: +20 carrying slots.', { slots: 20 }),
  G('bag2', 'Canvas field bag', 'bag', 45, 2, 'A roomy shoulder bag: +40 carrying slots.', { slots: 40 }),
  G('bag3', 'Expedition pack', 'bag', 110, 3, 'A frame pack with specimen pockets: +80 carrying slots.', { slots: 80 }),
  G('loupe1', '5x hand lens', 'loupe', 15, 1, 'Reveals fine lettering and surface wear.', { read: 0.08 }),
  G('loupe2', '10x folding loupe', 'loupe', 42, 2, 'Reads worn dates and hallmarks.', { read: 0.14 }),
  G('scope', 'Stereo microscope', 'loupe', 330, 3, 'Reads nearly anything that is still there, and shows tool marks and wear patterns.', { read: 0.25 }),
  G('pan', 'Gold pan', 'pan', 22, 1, 'Lets you wash stream gravel for heavy minerals such as gold.', { eff: 1 }),
  G('pan2', 'Pan, classifier and snuffer bottle', 'pan', 62, 2, 'Faster, and recovers finer gold.', { eff: 1.4 }),
  G('hammer', 'Geology hammer', 'geo', 28, 1, 'Break rocks to see a fresh face and free crystals and fossils.', { fresh: true }),
  G('kit1', 'Streak plate and hardness set', 'idkit', 38, 1, 'Tests colour of powder and scratch hardness.', { tests: 'streak,hardness' }),
  G('kit2', 'Field mineral kit', 'idkit', 90, 2, 'Adds a magnet, a dropper of dilute acid and a steel nail.', { tests: 'streak,hardness,magnet,acid' }),
  G('kit3', 'Shortwave UV lamp', 'idkit', 170, 3, 'Reveals fluorescent minerals such as scheelite and fluorite.', { tests: 'streak,hardness,magnet,acid,uv' }),
  G('clean1', 'Soft brush set', 'cleaning', 10, 1, 'Safe brushing of loose soil.', { level: 1 }),
  G('clean2', 'Soaking dishes and dental picks', 'cleaning', 32, 2, 'Soak off crusts and pick at deposits.', { level: 2 }),
  G('clean3', 'Conservation kit', 'cleaning', 95, 3, 'Electrolysis and ultrasonic bath for stubborn crusts, with far less risk.', { level: 3 }),
  G('book_coin', 'Coins of the Region (catalogue)', 'book', 26, 1, 'Identifies coins and tokens by design and date.', { refs: 'coin,token' }),
  G('book_bottle', 'Collector\'s Manual of Bottles and Pottery', 'book', 24, 1, 'Dates bottles by lip, mould and glass.', { refs: 'bottle,pottery' }),
  G('book_small', 'Buttons, Buckles and Small Relics', 'book', 18, 1, 'Identifies buttons, buckles and personal objects.', { refs: 'button,buckle,personal,jewelry,key,commercial' }),
  G('book_hard', 'Old Tools and Hardware', 'book', 22, 1, 'Identifies tools, industrial, transport and agricultural ironwork.', { refs: 'tool,industrial,transport,agricultural,household,nautical' }),
  G('book_mil', 'Military Relics and Medals', 'book', 24, 1, 'Identifies insignia, cartridge cases and medals.', { refs: 'insignia,medal' }),
  G('book_min', 'Field Guide to Minerals and Rocks', 'book', 20, 1, 'Properties and look-alikes of the common minerals; makes specimen tests meaningful.', { refs: 'mineral' }),
  G('book_fossil', 'Fossils of the Region', 'book', 28, 1, 'Names fossils and gives their age and habitat.', { refs: 'fossil' }),
];
export const GEARBY = Object.fromEntries(GEAR.map(g => [g.id, g])) as Record<string, Gear>;
export const FREE_REFS = ['litter', 'scrap'];
export const START_CASH = 260;
