import type { BizKind } from './history_types';

export type Ctx = 'home' | 'field' | 'street' | 'shop' | 'works' | 'mine' | 'road' | 'ford' | 'rail' | 'wharf' | 'beach' | 'military' | 'school' | 'play' | 'camp' | 'dump' | 'wreck' | 'trail' | 'modern';
export type Cat = 'coin' | 'token' | 'jewelry' | 'button' | 'buckle' | 'insignia' | 'tool' | 'bottle' | 'pottery' | 'household' | 'key' | 'medal' | 'industrial' | 'transport' | 'nautical' | 'personal' | 'commercial' | 'agricultural' | 'litter' | 'scrap';
export type Render = 'coin' | 'disc' | 'ring' | 'brooch' | 'button' | 'buckle' | 'key' | 'bottle' | 'shard' | 'pipe' | 'blade' | 'axe' | 'horseshoe' | 'nail' | 'bolt' | 'spike' | 'bar' | 'can' | 'tab' | 'cap' | 'plate' | 'spoon' | 'thimble' | 'watch' | 'lantern' | 'chain' | 'wheel' | 'bell' | 'ball' | 'cartridge' | 'badge' | 'toy' | 'comb' | 'lock' | 'weight' | 'pot' | 'scrap' | 'hook' | 'tag' | 'medal' | 'lamp' | 'hammer' | 'wire' | 'bead' | 'cup' | 'sheet';
export interface Archetype {
  id: string; name: string; cat: Cat; render: Render; from: number; to: number | null;
  mats: Array<[string, number]>; mass: [number, number]; size: [number, number];
  ctx: Partial<Record<Ctx, number>>; rate: number; life: number; value: number; collect: number;
  maker?: BizKind[]; marked?: number; dated?: boolean; special?: 'coin' | 'token' | 'medal' | 'wreck' | 'hoard' | 'insignia'; desc: string;
  shortName?: string;
}
const parseMats = (s: string): Array<[string, number]> => s.split(',').map(p => { const [m, w] = p.split(':'); return [m, w ? +w : 1]; });
const parseCtx = (s: string): Archetype['ctx'] => Object.fromEntries(s.split(',').map(p => { const [c, w] = p.split(':'); return [c, w ? +w : 1]; }));
function A(id: string, name: string, cat: Cat, render: Render, from: number, to: number | null, mats: string, mass: [number, number], size: [number, number], ctx: string, rate: number, life: number, value: number, collect: number, desc: string, o: Partial<Archetype> = {}): Archetype {
  return { id, name, cat, render, from, to, mats: parseMats(mats), mass, size, ctx: parseCtx(ctx), rate, life, value, collect, desc, ...o };
}

export const ARCHETYPES: Archetype[] = [
  // ---------------- coins (series come from the world's coinage)
  A('coin_copper','copper coin','coin','coin',1500,null,'copper:3,bronze:2,zinc:0.5',[2,12],[17,30],'street:2,shop:2.5,road:1.5,home:1.5,ford:0.8,play:1.5,school:1,beach:0.8,wharf:1.5,rail:1.2,camp:1,field:0.6,works:0.8,mine:0.8,trail:0.4,military:0.7',3.4,7,0.5,1,'A small copper-alloy coin of everyday circulation.',{special:'coin',dated:true}),
  A('coin_silver','silver coin','coin','coin',1500,1964,'silver',[0.5,28],[12,40],'street:1.5,shop:2,road:1.2,home:1.2,ford:0.7,play:1,wharf:1,rail:0.8,camp:0.7,military:0.7,field:0.4,school:0.6',1.3,6,2,1,'A silver coin; heavier ones were a day\'s wages.',{special:'coin',dated:true}),
  A('coin_gold','gold coin','coin','coin',1500,1933,'gold',[1.5,16],[14,32],'home:1.5,shop:1,street:0.7,road:0.4,ford:0.3,rail:0.3,camp:0.4',0.09,12,160,2,'A gold coin: rarely lost, and quickly missed when it was.',{special:'coin',dated:true}),
  A('coin_cupronickel','copper-nickel coin','coin','coin',1866,null,'cupronickel:3,nickel:1',[2.5,12],[17,31],'street:2,shop:2.5,road:1.5,home:1.4,play:1.5,school:1,beach:1,wharf:1,rail:1,camp:1,modern:2,trail:0.5',3.0,6,0.4,1,'A hard-wearing nickel-alloy coin.',{special:'coin',dated:true}),
  A('bullion_bar','cast gold bar','coin','bar',1624,null,'gold',[300,6000],[80,200],'home:0',0,50,6000,5,'A cast bar of gold, stamped by the mine that poured it.',{special:'hoard',marked:1,dated:true}),
  // ---------------- tokens
  A('token_scrip','company scrip token','token','disc',1620,null,'brass:3,aluminium:1,zinc:1,copper:1',[1.5,9],[18,32],'street:2,shop:2.5,works:2.5,mine:3,home:1.2,camp:2,rail:1,play:0.6',0.6,8,3,3,'A token issued by a firm, good for goods at its own store.',{special:'token',dated:true,marked:1}),
  A('token_transit','transit token','token','disc',1885,1985,'brass:2,aluminium:1,cupronickel:1',[1.2,4],[14,22],'street:2.5,rail:2,wharf:1,modern:0.5',0.35,5,1.5,1.4,'A fare token for the street railway or ferry.',{special:'token',marked:1}),
  A('token_trade','tradesman\'s token','token','disc',1624,1840,'copper:3,brass:1',[4,16],[20,30],'street:1.5,shop:2,road:1,wharf:1',0.2,12,6,2,'A copper trade token passing as small change in times of coin shortage.',{special:'token',dated:true,marked:1}),
  // ---------------- jewellery
  A('ring_gold','gold ring','jewelry','ring',1500,null,'gold:2,goldfilled:1',[1.5,8],[17,24],'home:1.5,street:0.8,play:1.2,beach:1.5,school:0.5,camp:0.8,ford:0.6',0.18,18,55,2,'A gold finger ring.'),
  A('ring_silver','silver ring','jewelry','ring',1500,null,'silver:3,silverplate:1',[1.5,7],[16,24],'home:1.3,street:1,play:1.5,beach:1.5,school:0.8',0.35,12,12,1.5,'A silver finger ring.'),
  A('ring_brass','brass ring','jewelry','ring',1500,null,'brass:3,copper:1',[1.5,6],[16,24],'home:1.2,street:1,play:1.5,school:1,beach:1',0.5,8,3,1.2,'An inexpensive brass ring.'),
  A('brooch','brooch','jewelry','brooch',1500,1970,'brass:2,silverplate:1,silver:1,goldfilled:0.5',[3,25],[20,55],'home:1.5,street:0.8,play:1,school:0.5',0.2,15,10,1.4,'A decorative pin for fastening clothing.'),
  A('earring','earring','jewelry','ring',1600,null,'goldfilled:1,silver:1,brass:1,gold:0.4',[0.4,4],[8,28],'home:1,play:1.2,beach:1.3,street:0.7',0.28,10,6,1.2,'A pierced-ear ornament.'),
  A('locket','locket','jewelry','watch',1700,1960,'silverplate:2,goldfilled:2,silver:1,gold:0.4',[4,20],[22,40],'home:1.2,street:0.7,play:1,beach:1',0.12,25,35,1.8,'A hinged pendant for a keepsake portrait or hair.'),
  A('bracelet','bangle or bracelet','jewelry','ring',1600,null,'brass:2,silverplate:1,silver:1,copper:1',[8,45],[50,70],'home:1,play:1.2,beach:1.5,street:0.6',0.12,12,6,1.1,'A bangle worn on the wrist.'),
  A('cufflink','cufflink','jewelry','button',1750,1990,'goldfilled:1,silverplate:1,brass:1,gold:0.3',[2,10],[10,20],'home:1,street:0.8,shop:0.7',0.12,20,10,1.2,'A pair\'s lost half: cufflinks fasten a shirt cuff.'),
  A('stickpin','stickpin or tiepin','jewelry','brooch',1810,1950,'goldfilled:1,brass:1,gold:0.3,silverplate:0.6',[1,6],[40,75],'street:1,home:1,play:0.7',0.08,15,12,1.5,'A pin for a cravat or tie.'),
  A('pocketwatch','pocket watch case','jewelry','watch',1650,1940,'silverplate:1,brass:2,silver:0.8,gold:0.12,goldfilled:0.7',[25,95],[38,55],'home:1,street:0.7,road:0.6,ford:1.2,camp:0.7,rail:0.7,play:0.6',0.09,25,45,2.5,'The case of a pocket watch; the works rarely survive.',{dated:true,marked:0.6}),
  A('watchfob','watch fob or medalet','jewelry','disc',1790,1950,'brass:2,silverplate:1,silver:1',[4,18],[20,38],'street:1,home:0.8,rail:0.7,works:0.6',0.1,15,8,1.8,'A decorative fob that hung from a watch chain.'),
  // ---------------- buttons
  A('button_brass','brass coat button','button','button',1624,null,'brass:3,copper:1',[0.8,12],[12,28],'home:2,street:1.5,field:1.2,camp:1.5,road:1,works:1.3,shop:1.2,mine:1,school:1,dump:1,military:0.6',2.4,15,0.9,1.4,'A cast or stamped metal button with a loop shank.',{marked:0.35,maker:['button_works','jeweler']}),
  A('button_bone','bone button','button','button',1500,1930,'bone',[0.2,2],[8,22],'home:2,street:1,field:1,camp:1,dump:1.5,school:1',1.5,12,0.3,0.8,'A turned bone button with sewing holes.',{}),
  A('button_shell','shell button','button','button',1790,1960,'shell',[0.2,1.6],[8,20],'home:2,street:1,dump:1.5,school:1,beach:0.7',1.0,12,0.4,0.9,'A mother-of-pearl button.'),
  A('button_iron','iron button','button','button',1624,1930,'iron',[0.8,6],[12,26],'home:1.5,field:1.5,camp:1,works:1.5,mine:1.5,dump:1',0.9,15,0.2,0.4,'A plain iron work-clothes button.'),
  A('button_glass','glass button','button','button',1700,1950,'glass',[0.4,4],[10,24],'home:1.5,street:1,dump:1.2,school:0.8',0.5,15,0.8,1.2,'A moulded glass button.',{}),
  A('button_celluloid','celluloid or plastic button','button','button',1920,null,'celluloid:1,plastic:2,bakelite:1',[0.2,2.5],[10,25],'home:1.5,street:1.2,school:1,modern:1,dump:1',1.0,8,0.1,0.3,'A moulded synthetic button.'),
  A('button_pewter','pewter button','button','button',1624,1850,'pewter',[0.6,5],[12,26],'home:2,field:1.2,camp:1,military:0.8,dump:1',0.8,15,1.2,1.2,'A cast pewter button.'),
  // ---------------- buckles
  A('buckle_shoe','shoe buckle','buckle','buckle',1624,1800,'brass:2,pewter:2,silver:0.5',[6,45],[35,65],'home:1.5,street:1.2,road:1,military:0.8,dump:0.8',0.3,12,16,2,'A decorative buckle that fastened a shoe.'),
  A('buckle_belt','belt buckle','buckle','buckle',1700,null,'brass:3,iron:2,steel:1,silverplate:0.5',[8,60],[30,70],'home:1.2,street:1,field:1,camp:1.5,works:1.3,mine:1.5,military:1.2,play:1,dump:1',0.6,12,3,1.1,'A belt buckle.',{marked:0.2}),
  A('buckle_harness','harness buckle','buckle','buckle',1624,1950,'brass:2,iron:3,steel:0.5',[10,70],[28,70],'road:2,field:2.5,street:1.2,works:1.2,camp:1.5,ford:1.5,dump:1',0.9,15,1.5,0.7,'A buckle from the harness of a draught horse.'),
  A('buckle_suspender','suspender clasp','buckle','buckle',1880,1960,'steel:2,brass:2,nickel:1',[3,15],[18,35],'field:1.5,works:1.5,mine:1.5,camp:1.5,street:1',0.5,10,1,0.6,'A clip or slide from trouser suspenders.'),
  // ---------------- insignia and military
  A('mil_button','military button','insignia','button',1624,null,'brass:3,pewter:1,copper:0.5',[1.5,12],[14,28],'military:6,street:0.4,road:0.5,camp:1',0.35,10,8,3,'A uniform button carrying a regimental or national device.',{special:'insignia',marked:1}),
  A('mil_badge','cap or collar badge','insignia','badge',1700,null,'brass:3,bronze:1,silverplate:1',[4,22],[22,50],'military:5,street:0.3,camp:0.8',0.12,10,18,3.5,'A badge worn on a cap or collar.',{special:'insignia',marked:1}),
  A('mil_plate','cartridge-box or belt plate','insignia','plate',1700,1930,'brass:3,pewter:1',[20,90],[45,80],'military:5,camp:1',0.08,8,30,3,'A brass plate from military equipment.',{special:'insignia',marked:1}),
  A('mil_disc','identity disc','insignia','tag',1916,null,'aluminium:2,steel:1,brass:1',[3,12],[25,40],'military:4,camp:1,trail:0.5,modern:0.3',0.1,10,12,3.5,'A stamped identity disc worn by a soldier.',{special:'insignia',marked:1}),
  A('bullet_lead','fired lead bullet','insignia','ball',1624,1900,'lead',[3,40],[10,22],'military:6,field:0.8,camp:1.2,trail:0.7,road:0.5,dump:0.4',0.6,6,0.5,1.4,'A fired round lead ball or conical bullet.'),
  A('cannonball','iron round shot','insignia','ball',1624,1870,'iron',[800,5000],[55,110],'military:0.6',0.02,5,120,3,'A solid iron cannon ball.'),
  A('shell_case','brass cartridge case','insignia','cartridge',1866,null,'brass:3,steel:0.5,copper:0.3',[3,60],[12,70],'military:5,field:1.5,trail:2,camp:2,modern:2,beach:0.5',1.3,6,0.4,1,'A spent metallic cartridge case with its headstamp.',{marked:0.85,dated:true}),
  // ---------------- tools
  A('knife_pocket','pocket knife','tool','blade',1624,null,'steel:2,iron:2,brass:0.4',[20,95],[60,110],'home:1,field:1.2,camp:2,works:1.2,mine:1.2,street:0.6,trail:0.8,play:0.8,dump:0.7',0.5,20,6,1.3,'A folding knife.',{marked:0.4}),
  A('knife_table','table knife','tool','blade',1624,null,'iron:3,steel:1,silverplate:0.5',[30,80],[150,230],'home:1.5,dump:2,camp:1,play:0.4',0.5,15,2,0.7,'A table knife.',{marked:0.2}),
  A('hammer_head','hammer head','tool','hammer',1624,null,'iron:2,steel:1',[200,900],[75,150],'works:2,mine:2,home:1.5,field:1,camp:1.5,rail:1.5,dump:2,wharf:1',0.12,25,6,0.8,'The iron head of a hand hammer.'),
  A('axe_head','axe head','tool','axe',1624,null,'iron:2,steel:1',[600,2500],[110,200],'camp:3,field:1.5,works:1.5,home:1.5,mine:1,dump:1.5,trail:0.6',0.09,30,16,1.2,'The head of an axe or hatchet.',{marked:0.35}),
  A('hoe_blade','hoe blade','tool','blade',1624,null,'iron:3,steel:1',[200,900],[120,220],'field:4,home:1.5,dump:1',0.14,25,3,0.5,'The blade of a hand hoe.'),
  A('pick_head','pick head','tool','axe',1624,null,'iron:2,steel:2',[900,3500],[250,420],'mine:5,works:1.5,rail:2,camp:1,dump:1',0.1,18,10,1,'The head of a miner\'s or navvy\'s pick.'),
  A('shovel_blade','shovel blade','tool','blade',1624,null,'iron:2,steel:2',[600,2000],[200,320],'mine:3,works:1.5,rail:2,field:1.5,camp:1,dump:2',0.1,18,4,0.5,'A shovel blade, rusted thin.'),
  A('chisel','cold chisel or gouge','tool','blade',1624,null,'iron:2,steel:2',[80,420],[100,230],'works:3,mine:2,home:1.2,rail:1.2,dump:1.5',0.12,25,3,0.6,'A chisel for stone, metal or wood.'),
  A('file_rasp','file or rasp','tool','blade',1700,null,'steel:2,iron:1',[60,400],[120,330],'works:3,home:1.2,rail:1,dump:1.5',0.1,20,2,0.5,'A rusted file.'),
  A('sickle','sickle or scythe blade','tool','blade',1624,1950,'iron:2,steel:1',[150,700],[250,700],'field:5,home:1,dump:1.5',0.09,20,6,0.8,'A curved reaping blade.'),
  A('wrench','spanner or wrench','tool','blade',1850,null,'steel:3,iron:1',[60,500],[110,260],'works:2.5,rail:2,home:1.2,road:1.5,mine:1.5,dump:1.5,modern:0.6',0.12,25,3,0.6,'A forged wrench.',{marked:0.55}),
  A('pliers','pliers or tongs','tool','blade',1624,null,'iron:2,steel:2',[100,400],[120,250],'works:2.5,home:1,rail:1.5,mine:1,dump:1.5',0.09,25,2,0.5,'A pair of pliers or smith\'s tongs.'),
  A('saw_blade','saw blade fragment','tool','blade',1624,null,'steel:2,iron:2',[100,600],[150,500],'works:2.5,camp:2,home:1,field:0.8,dump:2',0.08,15,3,0.6,'A fragment of a handsaw or crosscut saw.'),
  A('plane_iron','plane iron','tool','blade',1700,1960,'steel:2,iron:2',[80,260],[50,70],'works:2,home:1.5,dump:1.5',0.05,40,5,0.8,'The blade of a woodworking plane.',{marked:0.55}),
  A('adze_pick','drill steel or bit','tool','blade',1880,1980,'steel',[200,1200],[100,420],'mine:5,rail:1.5,works:1,dump:1',0.1,10,2,0.5,'A rock drill steel.'),
  // ---------------- bottles and glass
  A('bottle_wine','onion wine bottle','bottle','bottle',1624,1790,'glass',[300,700],[180,230],'home:1.5,dump:3,military:1,wharf:1,street:0.6',0.4,6,45,3,'A squat dark-glass bottle with a string rim.',{maker:[]}),
  A('bottle_case','case gin bottle','bottle','bottle',1700,1890,'glass',[300,600],[220,300],'dump:3,home:1,street:1,wharf:1.2,camp:1',0.5,5,22,2.2,'A square-sided dark-green spirits bottle.'),
  A('bottle_bitters','bitters or patent medicine bottle','bottle','bottle',1780,1925,'glass',[100,420],[120,260],'dump:3,home:1.5,street:1,camp:1,shop:1',0.6,6,18,2.5,'An embossed bottle for a patent tonic.',{maker:['glassworks','bottler','general_store'],marked:0.8}),
  A('bottle_ink','ink bottle','bottle','bottle',1700,1970,'glass',[40,200],[40,100],'school:3,home:1.5,dump:2',0.35,8,6,1.8,'A small glass ink bottle.'),
  A('bottle_soda','blob-top soda bottle','bottle','bottle',1855,1905,'glass',[280,450],[180,240],'dump:3,street:1.2,play:1.5,home:0.8,wharf:1',0.55,3,28,3,'A bottle with a thick applied lip, used for bottled mineral water and soda.',{maker:['bottler','glassworks'],marked:0.9}),
  A('bottle_beer','beer bottle','bottle','bottle',1855,null,'glass',[250,500],[210,290],'dump:3,street:1,camp:1.5,play:1.5,modern:1.5,wharf:1,home:0.8,trail:0.8',0.85,3,4,1.2,'A beer bottle.',{maker:['brewery','bottler','glassworks'],marked:0.75}),
  A('bottle_milk','milk bottle','bottle','bottle',1885,1962,'glass',[250,480],[180,230],'dump:2.5,home:1.5,street:1',0.5,5,6,1.6,'A returnable glass milk bottle.',{maker:['bottler','glassworks'],marked:0.7}),
  A('bottle_poison','poison bottle','bottle','bottle',1860,1940,'glass',[60,220],[80,160],'dump:2,home:1.5',0.15,6,25,2.8,'A ribbed cobalt bottle sold for liniment and poisons.',{marked:0.4,maker:['glassworks']}),
  A('bottle_perfume','perfume bottle','bottle','bottle',1750,1970,'glass',[20,120],[50,130],'home:1.5,dump:1.5,street:0.5',0.15,10,8,1.5,'A small scent bottle.'),
  A('jar_canning','canning jar','bottle','pot',1860,1980,'glass',[300,700],[110,180],'dump:3,home:1.5,field:0.8',0.45,8,7,1.2,'A glass preserving jar.',{marked:0.7,maker:['glassworks']}),
  A('bottle_machine','machine-made bottle','bottle','bottle',1905,null,'glass',[150,450],[150,280],'dump:3,modern:2,street:1,camp:1,home:0.8,beach:1,play:1',0.8,4,1.5,0.6,'A bottle blown in an automatic machine.',{maker:['bottler','glassworks','brewery'],marked:0.8,dated:true}),
  // ---------------- pottery and clay
  A('stone_crock','stoneware crock','pottery','pot',1624,1960,'stoneware',[300,3500],[90,350],'dump:3,home:2,field:0.8,camp:0.5',0.4,15,18,1.5,'A glazed stoneware jar or crock.',{maker:['pottery'],marked:0.45}),
  A('transferware','transferware plate sherd','pottery','shard',1780,1930,'earthenware',[8,120],[20,110],'dump:4,home:3,play:0.5,beach:0.5,camp:0.6',1.2,12,3,1.8,'A sherd of blue-printed earthenware.',{marked:0.25}),
  A('clay_pipe','clay pipe bowl or stem','pottery','pipe',1580,1910,'claypipe',[2,25],[40,160],'home:2,dump:2,camp:2,street:1.5,wharf:2,military:1.5,road:0.8,field:0.5,works:1,mine:1',1.2,2,1.2,1.8,'A clay tobacco pipe, cheap and fragile.',{marked:0.35}),
  A('earthenware_sherd','earthenware sherd','pottery','shard',1624,null,'earthenware',[6,140],[20,120],'dump:3,home:3,field:3,camp:1,works:0.8',2.2,10,0.3,0.4,'A glazed earthenware fragment.'),
  A('porcelain_cup','porcelain cup or saucer sherd','pottery','cup',1700,null,'porcelain',[3,60],[20,90],'dump:3,home:2.5,play:0.5,beach:0.6',0.6,15,3,1.5,'A thin porcelain fragment.',{marked:0.3}),
  A('bisque_doll','porcelain doll head','pottery','toy',1860,1935,'porcelain',[15,90],[30,80],'home:1.5,dump:1.5,school:0.8,play:0.7',0.05,18,35,3,'A bisque doll head.',{marked:0.5}),
  A('marble','marble','personal','ball',1624,null,'glass:3,stone:1,earthenware:2',[2,25],[12,25],'school:4,play:2,home:1.5,street:1.2,dump:0.5',0.35,3,0.4,1.1,'A child\'s marble.'),
  // ---------------- household
  A('spoon_pewter','pewter spoon','household','spoon',1624,1830,'pewter',[15,45],[130,190],'home:2,dump:1.5,camp:0.8,military:0.6',0.2,12,18,2,'A pewter spoon.',{marked:0.2}),
  A('spoon_plated','plated cutlery piece','household','spoon',1840,1980,'silverplate:3,steel:1,silver:0.5',[15,80],[120,230],'home:2,dump:2,camp:0.8,play:0.6',0.3,20,5,1.3,'A spoon or fork of electroplated nickel silver.',{marked:0.6}),
  A('thimble','thimble','household','thimble',1624,null,'brass:3,silver:1,iron:1,silverplate:1',[2,8],[14,20],'home:3,school:0.7,dump:0.8,street:0.4',0.25,25,4,1.7,'A sewing thimble.'),
  A('padlock','padlock','household','lock',1624,null,'iron:3,brass:1,steel:1',[100,700],[45,120],'shop:1.2,works:1.8,home:1.5,rail:1.5,mine:1.5,dump:1.5,wharf:1.5,field:1',0.14,30,5,1.1,'A rusted lock.',{marked:0.35}),
  A('scissors','scissors or shears','household','blade',1700,null,'iron:2,steel:2',[40,320],[110,260],'home:2,field:0.6,shop:0.6,dump:2',0.1,25,3,0.5,'A rusted pair of scissors.'),
  A('lamp_burner','oil lamp burner','household','lamp',1860,1940,'brass:3,iron:1',[20,110],[30,70],'home:3,dump:2,shop:1,school:1',0.1,10,6,1.2,'The brass burner of a kerosene lamp.',{marked:0.5}),
  A('stove_part','cast-iron stove part','household','plate',1790,1960,'iron',[200,3000],[80,300],'home:2,dump:4,camp:1,works:1',0.18,25,3,0.6,'A cast-iron fragment of a stove or range.',{marked:0.55,maker:['foundry']}),
  A('cookpot','cast-iron pot','household','pot',1624,1950,'iron',[800,4500],[130,300],'home:2,dump:3,camp:2,field:0.8',0.1,30,22,1.2,'A cast-iron cooking pot.',{marked:0.3,maker:['foundry']}),
  A('flatiron','sad iron','household','weight',1624,1940,'iron',[1500,3500],[130,200],'home:3,dump:2',0.06,30,10,1.2,'A solid iron for pressing clothes.',{marked:0.3}),
  A('comb','comb','household','comb',1624,null,'bone:2,celluloid:2,rubber:1,plastic:2,wood:1',[3,25],[60,150],'home:2,dump:1,school:1,street:0.8',0.35,8,1,0.6,'A hair comb.'),
  A('razor','razor blade or razor','household','blade',1700,null,'steel:3,iron:1',[8,90],[60,120],'home:2,dump:2,camp:1',0.1,15,3,0.7,'A cut-throat razor or safety blade.'),
  A('key_skeleton','skeleton key','key','key',1624,1930,'iron:3,brass:1',[8,70],[60,140],'home:2,shop:1.3,street:1,school:1,road:0.5,dump:1,works:1',0.4,25,4,1.4,'A hand-forged door or chest key.'),
  A('key_modern','cylinder-lock key','key','key',1895,null,'brass:3,nickel:1,steel:0.5',[4,16],[40,65],'street:1.5,home:1.5,play:1,school:1,modern:1.5,shop:1,beach:0.8,trail:0.5',0.65,15,0.4,0.4,'A flat key for a pin-tumbler lock.',{marked:0.55}),
  A('key_padlock','padlock key','key','key',1700,null,'brass:2,iron:2,steel:1',[4,30],[30,65],'works:2,rail:1.5,mine:1.5,shop:1,home:1,dump:1,wharf:1.2',0.2,20,2,0.6,'A small key for a padlock.'),
  // ---------------- medals (event-linked, special generation)
  A('medal_event','commemorative medal','medal','medal',1624,null,'bronze:2,brass:1,silver:1,aluminium:0.5,copper:1',[8,40],[28,50],'play:2,street:1,home:1',0.0,30,40,3.5,'A medal struck to commemorate a local event.',{special:'medal',dated:true,marked:1}),
  A('medal_gallantry','gallantry medal','medal','medal',1624,null,'silver:2,bronze:2',[12,40],[32,45],'home:1',0.0,40,260,5,'A medal awarded for gallantry or lifesaving.',{special:'medal',dated:true,marked:1}),
  A('medal_fair','agricultural fair medal','medal','medal',1800,1985,'bronze:2,brass:1,aluminium:1',[8,30],[25,40],'play:3,field:0.5,home:1',0.12,25,12,2.2,'A prize medal from the county fair.',{dated:true,marked:0.9}),
  A('badge_lodge','society or lodge badge','medal','badge',1790,1990,'brass:2,silverplate:1,bronze:1',[4,25],[20,45],'street:1,home:1,play:1',0.08,20,10,2,'A lapel badge of a friendly society.',{marked:0.6}),
  // ---------------- industrial
  A('nail_wrought','hand-wrought nail','industrial','nail',1500,1810,'iron',[3,40],[40,130],'home:6,works:2,dump:2,field:1.5,camp:1.5,wharf:2,rail:0.4,military:1.5',3.5,40,0.1,0.15,'A hand-forged nail with a rose-pattern head.'),
  A('nail_cut','cut nail','industrial','nail',1790,1910,'iron',[2,40],[30,120],'home:6,works:2,dump:2,field:1.5,camp:1.5,wharf:2,rail:1,mine:1.5,street:2',4.2,40,0.05,0.1,'A machine-cut square nail.'),
  A('nail_wire','wire nail','industrial','nail',1890,null,'steel:2,iron:1',[1,35],[25,110],'home:5,works:2,dump:2,street:2,camp:1.5,rail:1,mine:1.5,modern:2,wharf:1.5',4.0,30,0.02,0.05,'A round wire nail.'),
  A('rivet_bolt','bolt or rivet','industrial','bolt',1700,null,'iron:2,steel:2',[10,350],[25,150],'works:4,rail:3,mine:2,wharf:1.5,road:1,dump:2,modern:1.5',1.4,30,0.1,0.15,'A forged bolt, nut or boiler rivet.'),
  A('candle_holder','miner\'s candle holder','industrial','hook',1800,1905,'iron',[70,220],[120,190],'mine:6,camp:1',0.2,5,18,2.5,'An iron spike and hook that held a miner\'s candle.'),
  A('carbide_lamp','carbide lamp part','industrial','lamp',1900,1955,'brass:3,steel:1',[40,400],[40,120],'mine:6,camp:1,works:0.6',0.1,8,18,2.2,'Brass part of an acetylene (carbide) mining lamp.',{marked:0.55}),
  A('blasting_cap','blasting cap','industrial','cartridge',1870,1980,'copper:2,aluminium:1',[1,5],[30,75],'mine:5,rail:1.5,works:1,road:0.6',0.08,5,6,1.8,'A detonator for dynamite.'),
  A('ore_wheel','cart wheel or sheave','industrial','wheel',1700,1960,'iron',[600,4000],[100,300],'mine:5,rail:2,works:3,wharf:1.5,dump:1',0.06,25,16,1.3,'A small iron wheel from an ore car or cart.'),
  A('firebrick','stamped firebrick','industrial','plate',1800,1980,'stone',[1800,3500],[200,250],'works:3,home:0.8,dump:1.5',0.0,40,8,2.5,'A refractory brick stamped with its maker\'s name.',{maker:['brickworks','foundry','pottery'],marked:1}),
  A('slag_lump','smelter slag','industrial','scrap',1624,null,'stone',[40,900],[40,160],'works:6,mine:3,rail:0.8',0.5,30,0.1,0.3,'A glassy lump of smelter or forge slag.'),
  A('wire_rope','wire cable fragment','industrial','wire',1840,null,'steel:3,iron:1',[40,900],[100,600],'mine:4,works:2,wharf:2,rail:1.5,modern:1',0.3,30,0.05,0.1,'Wire rope.'),
  A('tin_label','tin tag or can label','industrial','tag',1850,1980,'tin:1,steel:1',[1,6],[20,50],'works:2,wharf:1.5,dump:2,street:0.7',0.15,5,3,2.2,'A stamped tin product tag.',{maker:['cannery','tin_shop','general_store'],marked:0.95}),
  // ---------------- transport
  A('horseshoe','horseshoe','transport','horseshoe',1500,1950,'iron:3,steel:1',[200,900],[110,160],'road:4,field:2,street:2,ford:3,works:1.5,camp:1.5,rail:1.5,trail:1.5,dump:1.5',0.7,6,1.5,1.2,'A horseshoe cast in the road.'),
  A('wagon_tire','wagon tire or axle fragment','transport','plate',1624,1930,'iron',[400,6000],[120,500],'road:3,ford:3,field:1.5,works:1,dump:2,rail:1',0.12,20,1,0.4,'Ironwork from a wagon.'),
  A('harness_ring','harness ring or hame','transport','ring',1624,1950,'iron:2,brass:2',[30,500],[40,120],'road:3,field:2.5,street:1.5,ford:1.5,camp:1,works:1',0.4,15,1.5,0.7,'A ring or collar fitting from horse harness.'),
  A('spur','spur or stirrup','transport','hook',1624,1940,'iron:2,brass:1,steel:1',[40,320],[70,150],'road:2,military:2,camp:1.5,field:1,ford:1.5,street:0.6',0.1,25,16,2,'A rider\'s spur or stirrup.'),
  A('rail_spike','railway spike or fishplate','transport','spike',1830,null,'iron:2,steel:2',[200,4500],[110,500],'rail:7,works:0.8',1.3,60,0.5,0.8,'Track hardware.',{marked:0.3}),
  A('rail_lantern','railway lantern part','transport','lantern',1830,1970,'brass:2,iron:2,tin:1',[100,900],[80,200],'rail:5,works:1',0.12,12,16,2.2,'Part of a signal or hand lantern.',{marked:0.4}),
  A('licence_plate','vehicle licence plate','transport','plate',1910,null,'steel:2,aluminium:2,iron:1',[30,250],[150,300],'road:3,modern:2,dump:2,rail:0.5,street:1',0.2,10,12,2.5,'An embossed vehicle plate.',{dated:true}),
  A('car_part','motor car trim or badge','transport','plate',1915,null,'brass:1,steel:1,nickel:1,zinc:2',[15,300],[40,200],'road:3,street:1.5,dump:2,modern:2,works:1',0.35,12,3,1.3,'Chrome and zinc trim from an early motor car.',{marked:0.4}),
  A('bicycle_bell','bicycle bell or lamp','transport','bell',1885,1990,'brass:2,steel:1,nickel:1',[30,180],[50,70],'street:2,road:2,school:1,dump:1',0.07,12,6,1.5,'A cycle fitting.'),
  A('pulley_block','pulley block sheave','transport','wheel',1624,1940,'iron:2,brass:2',[100,1500],[50,150],'wharf:3,works:2,mine:1.5,dump:1.5,camp:0.8',0.1,25,5,1,'A sheave from a rope block.'),
  // ---------------- nautical
  A('copper_tack','copper sheathing tack','nautical','nail',1760,1870,'copper:3,bronze:1',[3,20],[30,60],'wreck:7,beach:1.5,wharf:2',0.1,25,3,2.2,'A tack that fixed copper sheathing to a ship\'s hull.',{special:'wreck'}),
  A('ship_fitting','ship\'s deck fitting','nautical','hook',1624,null,'brass:2,bronze:2,iron:1',[80,2500],[60,250],'wreck:5,wharf:2,beach:1,dump:1',0.0,30,14,2.6,'A cleat, fairlead or other deck hardware.',{special:'wreck',marked:0.4}),
  A('ship_bell','ship\'s bell','nautical','bell',1624,null,'bronze:3,brass:1',[800,8000],[120,320],'wreck:1',0.0,60,350,6,'The bell of a vessel, usually engraved with her name.',{special:'wreck',marked:1,dated:true}),
  A('porthole','brass porthole','nautical','ring',1820,1960,'brass:3,bronze:1',[1500,8000],[200,380],'wreck:1',0.0,30,120,3.5,'A ship\'s window.',{special:'wreck',marked:0.3}),
  A('rowlock','rowlock or thole','nautical','hook',1624,1970,'iron:2,brass:1,bronze:1',[80,600],[70,160],'wharf:2.5,beach:2,wreck:2,dump:1',0.12,20,3,1,'A fitting that held an oar.'),
  A('anchor_fragment','anchor or chain fragment','nautical','chain',1624,null,'iron',[500,9000],[150,800],'wharf:3,wreck:3,beach:1.5,dump:1',0.06,40,4,1,'Heavy ironwork from a ship.'),
  A('lead_line','sounding lead','nautical','weight',1624,1950,'lead',[800,5000],[80,200],'wharf:2,wreck:1.5,beach:1.5',0.03,40,12,2,'A lead used to take soundings.'),
  A('wreck_cargo','cargo fitting from a wreck','nautical','scrap',1624,null,'iron:2,brass:1,copper:1',[100,3000],[60,300],'wreck:6',0.0,10,3,1.4,'Hardware from the cargo or fittings of a wreck.',{special:'wreck'}),
  // ---------------- personal
  A('toy_soldier','lead toy soldier','personal','toy',1780,1950,'lead:2,tin:1,pewter:1',[8,40],[40,70],'home:1.5,school:1.5,play:2,dump:1',0.1,10,10,2.6,'A cast metal toy figure.'),
  A('tin_toy','tin toy or wheel','personal','toy',1860,1970,'steel:2,tin:1,zinc:1',[5,60],[30,100],'home:1.5,school:1,play:2,dump:1.5',0.12,6,4,1.8,'A small stamped toy.'),
  A('tobacco_tin','tobacco tin','personal','can',1890,1990,'steel:3,tin:1,aluminium:1',[20,120],[70,120],'camp:2.5,field:1.5,works:1.5,mine:1.5,dump:2,trail:1',0.35,8,5,1.5,'A flat pocket tobacco tin.',{marked:0.6,maker:['general_store']}),
  A('lighter','cigarette lighter','personal','lamp',1925,null,'brass:2,steel:1,nickel:1',[25,100],[35,60],'street:1.5,camp:1.5,play:1,modern:1.5,works:1,trail:0.8,beach:1',0.18,8,8,1.7,'A petrol lighter.',{marked:0.5}),
  A('pen_nib','pen nib','personal','blade',1830,1950,'steel',[0.3,1.2],[28,40],'school:5,home:1.5,shop:1,street:0.5',0.4,3,0.5,1,'A steel writing nib.'),
  A('fountain_pen','fountain pen cap or clip','personal','blade',1900,1990,'brass:1,steel:1,nickel:1,goldfilled:0.3',[3,20],[30,60],'school:3,street:1,home:1,modern:0.6',0.1,10,4,1.4,'Part of a fountain pen.'),
  A('snuff_box','snuff box','personal','can',1624,1880,'pewter:2,brass:1,silverplate:0.6,silver:0.3',[30,90],[60,95],'home:1,street:0.7,camp:0.8,military:1',0.05,25,45,2.8,'A small lidded box for snuff.'),
  A('spectacles','spectacle frame','personal','ring',1700,null,'steel:2,brass:1,goldfilled:0.5,silver:0.3',[3,25],[110,150],'home:1.5,street:0.8,field:0.8,dump:1,beach:1',0.12,12,3,1.2,'The wire frame of a pair of glasses.'),
  A('coin_purse','purse frame or clasp','personal','buckle',1700,1950,'brass:2,steel:1,silverplate:1',[10,70],[40,90],'street:1.5,home:1,road:0.8,play:1',0.12,12,3,1.1,'The metal frame of a purse.'),
  A('zip_pull','zipper pull','personal','tab',1925,null,'brass:1,aluminium:1,steel:1,zinc:1',[1,8],[18,45],'street:1,home:1,field:1,camp:1.5,play:1,modern:2,trail:1',0.4,6,0.2,0.2,'The slider and pull from a zipper.'),
  A('safety_pin','safety pin','personal','hook',1849,null,'brass:2,steel:2',[0.5,4],[25,60],'home:2,school:1,street:1,dump:1,camp:1',0.5,5,0.1,0.1,'A coiled safety pin.'),
  A('dog_tag','dog or licence tag','personal','tag',1860,null,'brass:2,aluminium:2,steel:1',[3,15],[25,40],'street:1.5,field:1,trail:1,play:1,modern:1',0.12,8,3,1.5,'A pet licence tag.',{dated:true}),
  // ---------------- commercial
  A('scale_weight','brass scale weight','commercial','weight',1624,1960,'brass:3,bronze:1,iron:1,lead:1',[5,500],[18,60],'shop:4,street:1,wharf:2,home:0.8,dump:1',0.1,40,6,1.8,'A weight from a balance scale.',{marked:0.95}),
  A('cash_box_part','cash box or strongbox part','commercial','lock',1700,1970,'iron:3,steel:1,brass:1',[100,1800],[80,300],'shop:3,home:0.6,dump:2,works:1',0.04,30,6,1.4,'The remains of a lockable box.',{marked:0.4}),
  A('enamel_sign','enamel advertising sign fragment','commercial','plate',1890,1965,'steel:3,iron:1',[20,500],[80,350],'street:2.5,shop:2.5,dump:2,rail:1.5,road:1',0.1,15,25,3.3,'A fragment of a porcelain-enamelled iron sign.',{marked:1,maker:['general_store','bottler','brewery','cannery']}),
  A('bottle_opener','bottle opener','commercial','tag',1892,null,'steel:2,iron:1,brass:1,aluminium:1',[15,80],[60,120],'street:2,play:2,camp:1.5,shop:1,home:1,modern:1,beach:1',0.2,10,2,1,'A metal bottle opener.',{marked:0.5,maker:['brewery','bottler','general_store']}),
  A('advert_token','advertising token or badge','commercial','disc',1890,1990,'aluminium:2,brass:1,tin:1',[1.5,10],[25,40],'street:2,shop:2,play:1.5,home:1',0.3,10,3,2,'A promotional token.',{marked:1,maker:['general_store','bottler','brewery','bank','newspaper']}),
  // ---------------- agricultural
  A('plough_share','plough point or share','agricultural','blade',1624,null,'iron:3,steel:2',[1500,12000],[200,450],'field:5,dump:1.5,works:0.8',0.06,25,6,0.8,'Iron from a plough.',{marked:0.4,maker:['foundry']}),
  A('fence_staple','fence staple or wire','agricultural','hook',1700,null,'iron:2,steel:2',[2,40],[25,90],'field:6,home:1,road:1,trail:1,modern:1.5',2.5,30,0.03,0.05,'A fencing staple or barbed-wire fragment.'),
  A('shears_sheep','sheep shears blade','agricultural','blade',1624,null,'steel:2,iron:2',[60,260],[140,300],'field:3,home:1,dump:1',0.04,25,4,0.7,'Hand shears.'),
  A('milk_can_part','milk can lid or seal','agricultural','cap',1880,1970,'steel:1,tin:1,aluminium:1',[30,500],[100,220],'field:2,home:1,dump:2,road:1',0.08,10,3,1,'A dairy can lid.'),
  A('cattle_tag','cattle ear tag','agricultural','tag',1920,null,'aluminium:2,brass:1,steel:1',[1,6],[20,45],'field:5,dump:0.5',0.15,6,1,1.2,'A numbered livestock tag.',{dated:true}),
  A('harrow_tooth','harrow tine or seed drill part','agricultural','spike',1700,1960,'iron:2,steel:2',[50,700],[80,260],'field:5,dump:1',0.1,20,2,0.4,'A tine from a harrow.'),
  A('horse_curry','curry comb or horse brush plate','agricultural','plate',1700,1950,'iron:2,tin:1',[60,260],[90,150],'field:2,home:1,dump:1.5,road:0.5',0.06,20,4,0.9,'Stable tackle.'),
  // ---------------- modern litter
  A('pull_tab','ring-pull can tab','litter','tab',1963,1975,'aluminium',[1.5,3],[28,36],'modern:4,trail:2,play:3,camp:3,road:3,beach:3,street:1.5',0.8,3,0.5,2,'A detachable ring-pull tab from an aluminium drink can.',{dated:false}),
  A('stay_tab','stay-on can tab','litter','tab',1975,null,'aluminium',[0.5,1.2],[18,26],'modern:5,trail:2,play:3,camp:3,road:3,beach:3,street:2',1.4,3,0.02,0.02,'The folded tab of a modern can.'),
  A('alu_can','aluminium can fragment','litter','can',1962,null,'aluminium',[3,18],[50,130],'modern:4,trail:2,camp:3,road:3,beach:3,play:3,dump:3',1.6,5,0.02,0.02,'A crushed aluminium drink can.'),
  A('crown_cap','crown bottle cap','litter','cap',1895,null,'steel:3,tin:1,iron:1',[1.5,3],[26,29],'dump:3,street:3,camp:3,play:3,beach:2,modern:3,trail:2,road:2,home:1',2.2,4,0.05,0.2,'A crimped steel bottle cap.',{marked:0.35,maker:['bottler','brewery']}),
  A('screw_cap','screw cap','litter','cap',1925,null,'aluminium:3,steel:1,plastic:1',[1,8],[25,48],'modern:3,street:2,dump:2,trail:1,road:1.5',0.9,3,0.02,0.02,'A screw-top closure.'),
  A('shotgun_base','shotgun shell base','litter','cartridge',1870,null,'brass:3,steel:1',[3,9],[18,25],'field:3,trail:3,camp:2,modern:3,dump:1',0.9,5,0.1,0.5,'The brass base of a shotgun cartridge.',{marked:0.7,dated:false}),
  A('foil_scrap','foil or tin-lead wrapper','litter','sheet',1880,null,'aluminium:3,tin:1,lead:1',[0.2,3],[30,90],'street:3,play:3,modern:3,camp:2,beach:2,dump:2,trail:1.5',2.0,2,0.0,0.0,'Crumpled foil.'),
  A('can_tin','tin can fragment','scrap','can',1810,null,'steel:3,iron:1,tin:1',[10,160],[50,130],'dump:5,camp:4,mine:2,works:2,trail:1,beach:1,wharf:1.5,home:1,modern:1.5',2.0,6,0.02,0.05,'A rusted food can; the seam shows whether it was soldered by hand or machine.',{dated:false}),
  A('plastic_toy','plastic toy','litter','toy',1950,null,'plastic',[3,60],[30,120],'play:3,beach:3,modern:2,home:1,school:1.5',0.4,3,0.2,0.1,'A moulded toy.'),
  // ---------------- scrap
  A('iron_scrap','iron fragment','scrap','scrap',1500,null,'iron:3,steel:1',[20,2500],[30,250],'home:3,works:6,dump:5,street:3,field:3,camp:3,mine:4,rail:5,road:3,ford:1.5,wharf:3,military:1,school:1',6.0,25,0.01,0.01,'A rusted lump of ironwork too corroded to identify.'),
  A('iron_chain','chain link or ring','scrap','chain',1500,null,'iron:3,steel:1',[20,900],[40,400],'wharf:3,field:2,works:3,mine:2,dump:2,rail:2,camp:1.5',0.5,25,0.2,0.1,'A heavy chain link.'),
  A('lead_scrap','lead sheet or offcut','scrap','sheet',1500,null,'lead',[10,600],[30,200],'home:3,works:3,dump:3,wharf:2,street:2,camp:1.5,wreck:0.5',0.8,35,0.1,0.1,'Cast-off lead.'),
  A('brass_scrap','brass or copper offcut','scrap','sheet',1500,null,'brass:2,copper:2,bronze:0.5',[4,200],[20,120],'works:4,home:1.5,dump:2,wharf:2,street:1.5,rail:2,mine:1.5,wreck:1,camp:1',0.7,25,0.15,0.1,'A piece of cut sheet metal.'),
  A('copper_wire','copper wire','scrap','wire',1840,null,'copper',[5,200],[100,800],'works:2,street:2,modern:2,rail:3,dump:2,road:1.5,mine:1.5',0.4,30,0.1,0.05,'A length of copper wire.'),
  A('zinc_scrap','zinc or galvanised scrap','scrap','sheet',1850,null,'zinc:2,steel:1',[10,300],[40,200],'dump:3,works:2,home:2,modern:1.5,field:1.5,street:1',0.5,15,0.02,0.02,'Galvanised sheet.'),
  A('bone_fragment','worked bone fragment','scrap','shard',1500,null,'bone',[1,30],[10,80],'dump:3,home:2,camp:2',0.3,10,0.1,0.1,'Cut bone from a butcher\'s waste.'),
];
export const ARC = Object.fromEntries(ARCHETYPES.map(a => [a.id, a])) as Record<string, Archetype>;
export const CTX_LIST: Ctx[] = ['home', 'field', 'street', 'shop', 'works', 'mine', 'road', 'ford', 'rail', 'wharf', 'beach', 'military', 'school', 'play', 'camp', 'dump', 'wreck', 'trail', 'modern'];
export const CAT_LABEL: Record<Cat, string> = { coin: 'Coins', token: 'Tokens', jewelry: 'Jewellery', button: 'Buttons', buckle: 'Buckles and fittings', insignia: 'Military relics', tool: 'Tools', bottle: 'Bottles and glass', pottery: 'Pottery and clay', household: 'Household', key: 'Keys', medal: 'Medals and badges', industrial: 'Industrial', transport: 'Transport', nautical: 'Nautical', personal: 'Personal effects', commercial: 'Commercial', agricultural: 'Agricultural', litter: 'Modern litter', scrap: 'Scrap' };
