// Representative mineral library. Values are raw collector/commodity values in
// currency units per gram for a typical hand specimen; real-world properties.
export type MClass = 'native' | 'sulfide' | 'oxide' | 'carbonate' | 'silicate' | 'halide' | 'sulfate' | 'organic' | 'sulfosalt' | 'tungstate' | 'phosphate';
export interface Mineral {
  id: string; name: string; formula: string; cls: MClass;
  hardness: number; density: number; color: string; streak: string; luster: string;
  value: number;          // $/g typical specimen (before quality)
  gem?: boolean; metallic?: boolean; magnetic?: boolean;
  note: string;           // field-guide hint
  hex: string;            // render colour
  conductivity?: number;  // for native metals in detectors (0..1)
}
const M = (id: string, name: string, formula: string, cls: MClass, hardness: number, density: number, color: string, streak: string, luster: string, value: number, hex: string, note: string, o: Partial<Mineral> = {}): Mineral =>
  ({ id, name, formula, cls, hardness, density, color, streak, luster, value, hex, note, ...o });

export const MINERALS: Mineral[] = [
  M('quartz','Quartz','SiO2','silicate',7,2.65,'colourless to white','white','glassy',0.02,'#e8e6dc','Scratches glass; breaks with a curved (conchoidal) fracture. Veins of milky quartz often accompany mineralisation.'),
  M('amethyst','Amethyst','SiO2','silicate',7,2.65,'purple','white','glassy',0.4,'#9b7bc2','Purple quartz crystals lining cavities (geodes) in volcanic rock.',{gem:true}),
  M('agate','Agate','SiO2','silicate',6.5,2.6,'banded greys, reds, blues','white','waxy',0.15,'#c9a58a','Banded chalcedony filling gas bubbles in lava (amygdales).'),
  M('jasper','Jasper','SiO2','silicate',6.5,2.6,'red, brown, yellow','white','dull',0.03,'#a8472f','Opaque microcrystalline quartz stained by iron; common in iron formations.'),
  M('chert','Chert','SiO2','silicate',7,2.6,'grey, black, brown','white','dull',0.01,'#6e6a62','Dense, fine-grained silica that forms in limestones and deep-water sediments.'),
  M('microcline','Microcline feldspar','KAlSi3O8','silicate',6,2.56,'cream to green','white','vitreous',0.01,'#d8c9a4','Two cleavages at right angles; the pink or cream mineral of granite.'),
  M('plagioclase','Plagioclase feldspar','NaAlSi3O8','silicate',6,2.65,'white to grey','white','vitreous',0.01,'#cfd2d4','Fine parallel striations on cleavage faces.'),
  M('muscovite','Muscovite mica','KAl2(AlSi3O10)(OH)2','silicate',2.5,2.8,'silvery','white','pearly',0.03,'#d6d3c2','Peels into flexible shiny sheets.'),
  M('biotite','Biotite mica','K(Mg,Fe)3AlSi3O10(OH)2','silicate',2.5,3.0,'black-brown','white','pearly',0.01,'#3b2f26','Dark sheets of mica common in granite and gneiss.'),
  M('tourmaline','Tourmaline (schorl)','NaFe3Al6(BO3)3Si6O18(OH)4','silicate',7,3.2,'black','colourless','vitreous',0.3,'#1c1c20','Striated, three-sided black crystals; typical of pegmatite.',{gem:true}),
  M('garnet','Garnet (almandine)','Fe3Al2(SiO4)3','silicate',7,4.1,'deep red','white','vitreous',0.15,'#7a1f2b','Rounded red crystals in schist; also heavy dark grains in stream sand.',{gem:true}),
  M('beryl','Beryl (aquamarine)','Be3Al2Si6O18','silicate',7.5,2.7,'blue-green','white','vitreous',3,'#8fc7c9','Six-sided crystals in pegmatite.',{gem:true}),
  M('epidote','Epidote','Ca2Al2Fe(SiO4)3OH','silicate',6.5,3.4,'pistachio green','grey','vitreous',0.05,'#7f9a47','Pistachio-green mineral marking altered volcanic and intrusive rock.'),
  M('chlorite','Chlorite','(Mg,Fe)6AlSi3O10(OH)8','silicate',2.5,2.8,'dark green','pale green','pearly',0.01,'#3e5a3f','Soft green flakes; abundant in altered volcanic and metamorphic rock.'),
  M('zeolite','Zeolite (stilbite)','NaCa4Al8Si28O72·30H2O','silicate',3.5,2.2,'white to peach','white','pearly',0.08,'#e8d4c0','Sheaf-like crystals in the cavities of basalt.'),
  M('fluorite','Fluorite','CaF2','halide',4,3.18,'purple, green, yellow','white','glassy',0.25,'#7c58b0','Cubic crystals; scratched by a knife; glows under UV light.',{gem:true}),
  M('calcite','Calcite','CaCO3','carbonate',3,2.71,'white to clear','white','glassy',0.02,'#ece6d6','Fizzes in weak acid; rhombohedral cleavage.'),
  M('dolomite','Dolomite','CaMg(CO3)2','carbonate',3.5,2.85,'cream to pink','white','pearly',0.02,'#d9c9b0','Fizzes weakly unless powdered.'),
  M('gypsum','Gypsum (selenite)','CaSO4·2H2O','sulfate',2,2.3,'clear to white','white','pearly',0.03,'#efece0','Scratched by a fingernail; clear blades of selenite grow in clay.'),
  M('halite','Halite','NaCl','halide',2.5,2.17,'clear to white','white','glassy',0.005,'#f4f1ea','Tastes of salt; cubic crystals.'),
  M('barite','Barite','BaSO4','sulfate',3.3,4.5,'white','white','vitreous',0.04,'#e2ddd0','Unusually heavy for a pale mineral; bladed crystals.'),
  M('pyrite','Pyrite','FeS2','sulfide',6.5,5.0,'brassy yellow','greenish-black','metallic',0.05,'#b59a3a',"Fool's gold: brittle and hard, cubic crystals, strikes sparks.",{metallic:true}),
  M('galena','Galena','PbS','sulfide',2.5,7.5,'lead grey','lead grey','metallic',0.06,'#7d838a','Very heavy, cubic cleavage; the main ore of lead.',{metallic:true}),
  M('sphalerite','Sphalerite','ZnS','sulfide',3.5,4.0,'brown to black','yellow-brown','resinous',0.05,'#5a3d22','Brown resinous crystals; the main ore of zinc.'),
  M('chalcopyrite','Chalcopyrite','CuFeS2','sulfide',3.5,4.2,'brassy yellow, tarnishes iridescent','greenish-black','metallic',0.08,'#b0902c','Softer than pyrite and scratches with a knife; main ore of copper.',{metallic:true}),
  M('bornite','Bornite','Cu5FeS4','sulfide',3,5.1,'bronze, tarnishes purple-blue','grey-black','metallic',0.15,'#7c5a73','Peacock-coloured tarnish.',{metallic:true}),
  M('chalcocite','Chalcocite','Cu2S','sulfide',2.8,5.6,'dark grey','dark grey','metallic',0.2,'#4a4d54','Soft, sooty copper ore formed by weathering above porphyry deposits.',{metallic:true}),
  M('molybdenite','Molybdenite','MoS2','sulfide',1.5,4.7,'lead grey','blue-grey','metallic',0.3,'#868b94','Greasy flakes that mark paper.',{metallic:true}),
  M('arsenopyrite','Arsenopyrite','FeAsS','sulfide',5.5,6.1,'silver-white','dark grey','metallic',0.05,'#a5a8ad','Smells of garlic when struck; frequently carries gold.',{metallic:true}),
  M('acanthite','Argentite (acanthite)','Ag2S','sulfide',2,7.2,'dark grey','shiny black','metallic',2,'#3d3f44','Soft enough to cut with a knife; the main silver ore.',{metallic:true}),
  M('scheelite','Scheelite','CaWO4','tungstate',4.5,6.0,'white to tan','white','vitreous',0.4,'#d8cfa8','Glows blue-white under shortwave UV.'),
  M('hematite','Hematite','Fe2O3','oxide',5.5,5.2,'steel grey or red','red-brown','metallic to earthy',0.01,'#6a2f25','Streak is red-brown whatever the colour.',{metallic:true}),
  M('magnetite','Magnetite','Fe3O4','oxide',5.5,5.2,'black','black','metallic',0.01,'#25262a','Attracts a magnet; heavy black sand in streams.',{magnetic:true,metallic:true}),
  M('goethite','Goethite (limonite)','FeO(OH)','oxide',5,3.8,'yellow-brown','yellow-brown','earthy',0.005,'#8a5a1f','Rusty gossan formed where sulfides weather.'),
  M('cuprite','Cuprite','Cu2O','oxide',3.5,6.1,'dark red','brownish-red','adamantine',0.3,'#8a2c24','Dark red crystals within the oxidised zone of copper deposits.'),
  M('malachite','Malachite','Cu2CO3(OH)2','carbonate',3.7,4.0,'banded green','pale green','silky',0.15,'#2f8f5a','Bright green carbonate: a clue to copper below.'),
  M('azurite','Azurite','Cu3(CO3)2(OH)2','carbonate',3.7,3.8,'deep blue','pale blue','vitreous',0.3,'#25498c','Deep blue carbonate found with malachite.'),
  M('cerussite','Cerussite','PbCO3','carbonate',3.3,6.5,'white','white','adamantine',0.2,'#e5e3df','Heavy white crystals formed as galena weathers.'),
  M('smithsonite','Smithsonite','ZnCO3','carbonate',4.5,4.4,'green-blue to white','white','vitreous',0.15,'#8fc5b0','Botryoidal crust of zinc carbonate above sphalerite.'),
  M('anglesite','Anglesite','PbSO4','sulfate',2.8,6.3,'white','white','adamantine',0.2,'#dcdad2','Weathering product of galena.'),
  M('gold','Native gold','Au','native',2.8,19.3,'rich yellow','golden yellow','metallic',95,'#d9a916','Malleable and extremely heavy; never tarnishes. Pyrite is brittle and gold is not.',{metallic:true,conductivity:0.95}),
  M('electrum','Electrum','(Au,Ag)','native',2.8,14,'pale yellow','pale yellow','metallic',70,'#d6c460','Gold-silver alloy; paler than pure gold.',{metallic:true,conductivity:0.9}),
  M('silver','Native silver','Ag','native',2.5,10.5,'silver, tarnishes black','silver-white','metallic',1.4,'#b7b9bd','Wiry or leafy growths; tarnishes black.',{metallic:true,conductivity:1}),
  M('copper','Native copper','Cu','native',2.8,8.9,'copper red, green crust','copper-red','metallic',0.2,'#b3633a','Soft red metal that can be hammered flat.',{metallic:true,conductivity:0.85}),
  M('amber','Amber','C10H16O','organic',2,1.08,'honey yellow','white','resinous',1.5,'#c98a1e','Fossil tree resin: warm to touch, floats in strong brine; may entomb insects.',{gem:true}),
  M('coal','Coal','C','organic',2.5,1.4,'black','black','dull to bright',0.002,'#18181a','Lightweight black rock that burns; often holds plant fossils.'),
];
export const MIN = Object.fromEntries(MINERALS.map(m => [m.id, m])) as Record<string, Mineral>;
