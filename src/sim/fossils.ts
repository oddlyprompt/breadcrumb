// Fossil taxa with real geological ranges (millions of years ago) and habitats.
export type DepEnv = 'marine_shallow' | 'marine_deep' | 'reef' | 'fluvial' | 'lacustrine' | 'swamp' | 'aeolian' | 'glacial' | 'estuarine' | 'volcaniclastic';
export interface Taxon {
  id: string; name: string; group: string; from: number; to: number; envs: DepEnv[];
  size: [number, number]; // cm
  how: 'shell' | 'bone' | 'impression' | 'permineralised' | 'cast' | 'tooth' | 'resin';
  weight: number;         // relative abundance when conditions are right
  value: number;          // base $ for a typical specimen
  hex: string;
}
const T = (id: string, name: string, group: string, from: number, to: number, envs: DepEnv[], size: [number, number], how: Taxon['how'], weight: number, value: number, hex: string): Taxon =>
  ({ id, name, group, from, to, envs, size, how, weight, value, hex });
export const TAXA: Taxon[] = [
  T('stromatolite','Stromatolite','microbial',2500,540,['marine_shallow'],[8,40],'cast',3,6,'#8b8470'),
  T('trilobite','Trilobite','arthropod',521,252,['marine_shallow','marine_deep'],[1.5,9],'shell',2,25,'#5c5648'),
  T('brachiopod','Brachiopod','shellfish',520,0,['marine_shallow','reef','estuarine'],[1,6],'shell',6,3,'#9a8d73'),
  T('crinoid','Crinoid stem','echinoderm',485,252,['marine_shallow','reef'],[1,8],'shell',5,2,'#a79f8c'),
  T('hornCoral','Horn coral','coral',485,252,['reef','marine_shallow'],[3,12],'shell',3,6,'#8a8574'),
  T('graptolite','Graptolite','colonial animal',485,359,['marine_deep'],[1,5],'impression',3,8,'#4b4a47'),
  T('ammonite','Ammonite','cephalopod',400,66,['marine_shallow','marine_deep'],[2,25],'shell',3,40,'#8d7b55'),
  T('belemnite','Belemnite','cephalopod',250,66,['marine_shallow','marine_deep'],[3,12],'shell',4,4,'#6e5b3a'),
  T('bivalve','Bivalve shell','mollusc',480,0,['marine_shallow','estuarine','lacustrine'],[1,8],'shell',6,2,'#b3a58a'),
  T('gastropod','Gastropod shell','mollusc',500,0,['marine_shallow','estuarine','lacustrine','reef'],[1,7],'shell',4,3,'#a69a80'),
  T('lepidodendron','Scale-tree bark','plant',359,299,['swamp'],[8,40],'impression',4,12,'#4a4538'),
  T('calamites','Calamites stem','plant',359,252,['swamp'],[6,30],'cast',3,10,'#5a5444'),
  T('fernfrond','Fern frond','plant',359,66,['swamp','lacustrine','fluvial'],[4,25],'impression',4,10,'#55503f'),
  T('devonianfish','Armoured fish plate','fish',419,359,['fluvial','lacustrine','marine_shallow'],[2,14],'bone',1.2,45,'#6b6048'),
  T('eocenefish','Fossil fish','fish',56,34,['lacustrine'],[5,30],'impression',2,70,'#7b6a4c'),
  T('sauropod','Sauropod bone fragment','dinosaur',201,145,['fluvial'],[8,80],'bone',1,120,'#6e5a3e'),
  T('theropodTooth','Theropod tooth','dinosaur',230,66,['fluvial'],[1,8],'tooth',0.6,90,'#46382a'),
  T('ceratopsian','Ceratopsian bone fragment','dinosaur',100,66,['fluvial'],[6,50],'bone',0.7,100,'#5e4c36'),
  T('petrifiedWood','Petrified wood','plant',252,2.6,['fluvial','volcaniclastic','swamp'],[8,60],'permineralised',3,18,'#8a6a45'),
  T('marineReptile','Marine reptile vertebra','reptile',250,90,['marine_shallow','marine_deep'],[3,12],'bone',0.6,110,'#4d4538'),
  T('sharkTooth','Shark tooth','fish',145,2.6,['marine_shallow','estuarine'],[1,7],'tooth',2.5,15,'#2f2b27'),
  T('echinoid','Sea urchin test','echinoderm',145,0,['marine_shallow','reef'],[2,9],'shell',2.5,8,'#b9ac91'),
  T('nummulite','Nummulite','protist',56,34,['marine_shallow'],[1,4],'shell',3,3,'#a89c80'),
  T('whale','Whale vertebra','mammal',23,2.6,['marine_shallow','marine_deep'],[10,40],'bone',0.4,150,'#6c6150'),
  T('coralHead','Coral head','coral',66,0,['reef'],[6,40],'shell',3,12,'#c1b8a0'),
  T('mammoth','Mammoth molar','mammal',2.6,0.01,['glacial','fluvial'],[10,28],'tooth',0.3,300,'#5d4c36'),
  T('bison','Bison bone','mammal',2.6,0.01,['glacial','fluvial'],[8,40],'bone',0.8,25,'#6f604a'),
  T('amberInsect','Insect in amber','insect',56,34,['swamp'],[0.3,2],'resin',0.3,220,'#c98a1e'),
  T('leaf','Leaf impression','plant',100,2.6,['lacustrine','fluvial','swamp'],[2,14],'impression',4,6,'#6b6048'),
];
export const TAXON = Object.fromEntries(TAXA.map(t => [t.id, t])) as Record<string, Taxon>;

export const PERIODS: Array<{ name: string; from: number; to: number }> = [
  { name: 'Proterozoic', from: 2500, to: 539 }, { name: 'Cambrian', from: 539, to: 485 }, { name: 'Ordovician', from: 485, to: 444 },
  { name: 'Silurian', from: 444, to: 419 }, { name: 'Devonian', from: 419, to: 359 }, { name: 'Carboniferous', from: 359, to: 299 },
  { name: 'Permian', from: 299, to: 252 }, { name: 'Triassic', from: 252, to: 201 }, { name: 'Jurassic', from: 201, to: 145 },
  { name: 'Cretaceous', from: 145, to: 66 }, { name: 'Paleogene', from: 66, to: 23 }, { name: 'Neogene', from: 23, to: 2.6 }, { name: 'Quaternary', from: 2.6, to: 0 },
];
export function periodOf(ma: number): string {
  if (ma >= 2500) return 'Archean';
  for (const p of PERIODS) if (ma <= p.from && ma > p.to) return p.name;
  return 'Quaternary';
}
