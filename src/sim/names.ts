import { Rng } from './rng';

// Each culture has its own phonology and place-name grammar, so a world's
// settlements, rivers and surnames feel consistent within a region and differ between worlds.
export interface Culture {
  id: string; label: string;
  onset: string[]; vowel: string[]; coda: string[]; // syllable parts
  placeSuffix: string[]; // for settlements
  surnameSuffix: string[]; given: string[];
  riverWords: string[]; hillWords: string[]; lakeWords: string[]; bayWords: string[]; woodWords: string[];
  townPattern: Array<'stem' | 'stemsuffix' | 'saint' | 'descr'>;
  currencyName: string; currencyMinor: string; polityWords: string[];
}

export const CULTURES: Culture[] = [
  {
    id: 'anglic', label: 'Anglic',
    onset: ['b','br','c','d','f','g','h','k','l','m','n','p','r','s','st','t','th','w','wh','sh','ch'],
    vowel: ['a','e','i','o','u','ea','oo','ai'], coda: ['n','r','l','d','th','m','ck','ll','rd','st','nt'],
    placeSuffix: ['ton','ford','mouth','wick','bury','field','ham','by','worth','haven','stead','bridge','mere'],
    surnameSuffix: ['son','man','ley','well','wood','field','ward','smith','ford'],
    given: ['Edmund','Thomas','Agnes','Harriet','Josiah','Eliza','Walter','Martha','Silas','Clara','Owen','Ruth','Amos','Edith','Nathaniel','Hannah','Ambrose','Lydia','Jasper','Mabel','Cornelius','Winifred','Barnaby','Ada','Ezra','Prudence','Fenwick','Lottie','Alder','Rosalind'],
    riverWords: ['River','Water','Beck','Creek'], hillWords: ['Fell','Tor','Ridge','Down','Pike'], lakeWords: ['Mere','Lake','Water'], bayWords: ['Bay','Sound','Haven'], woodWords: ['Wood','Forest','Holt','Weald'],
    townPattern: ['stemsuffix','stemsuffix','descr','saint'], currencyName: 'pound', currencyMinor: 'penny', polityWords: ['Crown Colony','Dominion','Commonwealth','Union'],
  },
  {
    id: 'nordic', label: 'Nordic',
    onset: ['b','bj','d','f','g','h','k','l','m','n','r','s','sk','st','t','v','tr','sv'],
    vowel: ['a','e','i','o','u','ø','å','ei','au'], coda: ['n','r','l','d','k','g','m','rd','nd','st','ld','rn'],
    placeSuffix: ['vik','fjord','heim','by','stad','nes','dal','vang','holm','ø','berg','sund'],
    surnameSuffix: ['sen','son','dal','berg','strand','lund','vik'],
    given: ['Ragnar','Ingrid','Leif','Sigrid','Anders','Freya','Olaf','Astrid','Bjorn','Helga','Erik','Solveig','Torvald','Maren','Gunnar','Liv','Halvard','Thora','Knut','Embla','Ivar','Signe','Haakon','Birgit','Sten','Ylva','Rolf','Karin','Dag','Tove'],
    riverWords: ['Elv','Å','Bekk'], hillWords: ['Fjell','Tind','Nut','Berg'], lakeWords: ['Vatn','Sjø','Tjern'], bayWords: ['Fjord','Vik','Sund'], woodWords: ['Skog','Lund','Mark'],
    townPattern: ['stemsuffix','stemsuffix','stemsuffix','descr'], currencyName: 'krone', currencyMinor: 'øre', polityWords: ['Kingdom','Hanse League','Free State','Realm'],
  },
  {
    id: 'iberic', label: 'Iberic',
    onset: ['b','c','d','f','g','l','m','n','p','r','s','t','v','z','br','tr','gr','cl','pl'],
    vowel: ['a','e','i','o','u','ia','ue','io'], coda: ['n','r','l','s','z','d','nt','rr','nd'],
    placeSuffix: ['ada','illo','eda','ero','osa','ar','ia','ena','al','ejo'],
    surnameSuffix: ['ez','ido','eros','illo','ano','ales'],
    given: ['Mateo','Isabel','Alonso','Catalina','Diego','Beatriz','Rafael','Lucía','Tomás','Inés','Julián','Marisol','Esteban','Carmen','Ramiro','Elvira','Gaspar','Pilar','Hernán','Dolores','Bruno','Soledad','Anselmo','Rosa','Matías','Teresa','Andrés','Paloma','Ignacio','Amparo'],
    riverWords: ['Río','Arroyo','Ribera'], hillWords: ['Sierra','Cerro','Peña','Monte'], lakeWords: ['Laguna','Lago','Estanque'], bayWords: ['Bahía','Ensenada','Cala'], woodWords: ['Bosque','Monte','Selva'],
    townPattern: ['stemsuffix','stemsuffix','saint','descr'], currencyName: 'real', currencyMinor: 'centavo', polityWords: ['Viceroyalty','Republic','Province','Confederation'],
  },
  {
    id: 'gallic', label: 'Gallic',
    onset: ['b','c','ch','d','f','g','j','l','m','n','p','r','s','t','v','br','gr','fl','bl'],
    vowel: ['a','e','i','o','u','ai','ou','eau','oi'], coda: ['n','r','l','s','t','d','rd','nt','ne','lle'],
    placeSuffix: ['ville','mont','sur','court','bec','val','champ','ay','ac','ière','fort'],
    surnameSuffix: ['eau','ier','ette','ard','ot','aux'],
    given: ['Étienne','Margot','Lucien','Colette','Henri','Odette','Gaston','Mireille','Anselme','Yvonne','Raoul','Cécile','Bastien','Hélène','Armand','Juliette','Théo','Odile','Fabrice','Solange','Rémy','Camille','Baptiste','Aline','Lazare','Noémie','Guy','Élodie','Marcel','Pascale'],
    riverWords: ['Rivière','Ruisseau','Fleuve'], hillWords: ['Mont','Crête','Puy','Roc'], lakeWords: ['Lac','Étang','Mare'], bayWords: ['Baie','Anse','Rade'], woodWords: ['Bois','Forêt','Sylve'],
    townPattern: ['stemsuffix','saint','stemsuffix','descr'], currencyName: 'livre', currencyMinor: 'sou', polityWords: ['Colony','Republic','Territory','Compact'],
  },
  {
    id: 'celtic', label: 'Celtic',
    onset: ['b','bal','c','cl','d','dr','g','gl','k','l','m','n','p','r','s','t','tr','ll','cr','pen'],
    vowel: ['a','e','i','o','u','ae','ei','y','ow'], coda: ['n','r','l','d','th','ch','rn','nn','dd','ll'],
    placeSuffix: ['more','glen','wyn','nock','dun','ross','ach','ness','ban','caer','bryn'],
    surnameSuffix: ['wyn','ach','an','ie','ney','nan'],
    given: ['Aodh','Brigid','Cormac','Deirdre','Fergus','Grainne','Niall','Maeve','Ronan','Sorcha','Tadhg','Una','Bran','Eilidh','Dougal','Isolde','Kieran','Morwen','Lorcan','Nessa','Padraig','Rhona','Gavin','Siobhan','Alasdair','Catriona','Finlay','Ailsa','Declan','Mairi'],
    riverWords: ['Avon','Water','Uisge','Burn'], hillWords: ['Ben','Carn','Knock','Pen'], lakeWords: ['Loch','Llyn','Lough'], bayWords: ['Firth','Bay','Inlet'], woodWords: ['Coed','Wood','Forest'],
    townPattern: ['stemsuffix','stemsuffix','descr'], currencyName: 'mark', currencyMinor: 'groat', polityWords: ['Kingdom','Lordship','Clan Confederacy','Union'],
  },
];

const DESCR_A = ['Red','Black','White','Green','Gray','Long','Bright','Dry','Old','New','Fair','Broad','Sandy','Stony','Cold','Silver','Copper','Iron','Salt','Cedar','Amber'];
const DESCR_B = ['Crossing','Landing','Hollow','Flat','Ferry','Gap','Bend','Reach','Rest','Mills','Camp','Corners','Point','Springs','Run','Diggings','Junction'];

export class Namer {
  private used = new Set<string>();
  constructor(public culture: Culture, private rng: Rng) {}
  private cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
  stem(sy = 0): string {
    const r = this.rng; const c = this.culture;
    const n = sy || r.int(1, 2);
    let s = '';
    for (let i = 0; i < n; i++) s += r.pick(c.onset) + r.pick(c.vowel) + (i < n - 1 || r.chance(0.5) ? r.pick(c.coda) : '');
    return this.cap(s);
  }
  unique(fn: () => string): string {
    for (let i = 0; i < 60; i++) { const n = fn(); if (!this.used.has(n)) { this.used.add(n); return n; } }
    const n = fn() + ' ' + this.rng.int(2, 9); this.used.add(n); return n;
  }
  settlement(): string {
    const c = this.culture, r = this.rng;
    return this.unique(() => {
      const p = r.pick(c.townPattern);
      if (p === 'stemsuffix') { const st = this.stem(r.int(1, 2)); const su = r.pick(c.placeSuffix); return st.endsWith(su[0]) ? st + su.slice(1) : st + su; }
      if (p === 'saint') return 'St. ' + r.pick(c.given).split(' ')[0] + (r.chance(0.5) ? 's' : '');
      return r.pick(DESCR_A) + ' ' + r.pick(DESCR_B);
    });
  }
  surname(): string {
    const r = this.rng, c = this.culture;
    const st = this.stem(r.int(1, 2));
    return r.chance(0.45) ? st : st + r.pick(c.surnameSuffix);
  }
  person(): { given: string; surname: string; full: string } {
    const g = this.rng.pick(this.culture.given), s = this.surname();
    return { given: g, surname: s, full: `${g} ${s}` };
  }
  river(): string { return this.unique(() => `${this.stem(this.rng.int(1, 2))} ${this.rng.pick(this.culture.riverWords)}`); }
  range(): string { return this.unique(() => `${this.stem(this.rng.int(1, 2))} ${this.rng.pick(this.culture.hillWords)}s`); }
  peak(): string { return this.unique(() => `${this.rng.pick(this.culture.hillWords)} ${this.stem(this.rng.int(1, 2))}`); }
  lake(): string { return this.unique(() => `${this.stem(this.rng.int(1, 2))} ${this.rng.pick(this.culture.lakeWords)}`); }
  bay(): string { return this.unique(() => `${this.stem(this.rng.int(1, 2))} ${this.rng.pick(this.culture.bayWords)}`); }
  wood(): string { return this.unique(() => `${this.stem(this.rng.int(1, 2))} ${this.rng.pick(this.culture.woodWords)}`); }
  vessel(): string {
    const nouns = ['Marigold','Constance','Albatross','Harbinger','Providence','Kestrel','Lady Ines','Northern Star','Resolute','Tern','Mary Ellen','Fortitude','Gannet','Perseverance','Swift','Halcyon','Industry','Wanderer','Cormorant','Endeavour'];
    return this.unique(() => this.rng.pick(nouns) + (this.rng.chance(0.3) ? ' of ' + this.stem(1) : ''));
  }
  company(trade: string, owner: string): string {
    const r = this.rng;
    const f = r.int(0, 4);
    if (f === 0) return `${owner} & Sons ${trade}`;
    if (f === 1) return `${owner} ${trade} Company`;
    if (f === 2) return `${this.stem(2)} ${trade} Works`;
    if (f === 3) return `${owner} & ${this.surname()}, ${trade}`;
    return `The ${r.pick(DESCR_A)} ${r.pick(['Star','Crown','Anchor','Eagle','Hammer','Wheel','Lantern'])} ${trade} Co.`;
  }
}

export function pickCulture(r: Rng): Culture { return r.pick(CULTURES); }
