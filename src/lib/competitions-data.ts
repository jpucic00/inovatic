import { Award, Bot, Trophy, Wrench, type LucideIcon } from 'lucide-react'

interface ArchiveEntry {
  label: string
  /** Slug of the migrated article, or null when no report was ever published. */
  slug: string | null
}

interface ExternalLink {
  label: string
  url: string
}

interface CompetitionCategory {
  name: string
  /** Omitted where the association never published a category description. */
  description?: string
}

/** Enrollment terms — only the two national programs are run as a course. */
interface ProgramDetail {
  label: string
  value: string
}

export interface Competition {
  slug: string
  title: string
  shortTitle: string
  subtitle: string
  description: string
  /** Brand tone: 'cyan' = primary, 'yellow' = accent. Drives every page style. */
  tone: 'cyan' | 'yellow'
  /** Optional pill shown on the hub card and the detail hero. */
  highlight?: string
  programDetails?: ProgramDetail[]
  paragraphs: string[]
  categories: CompetitionCategory[]
  /** Heading above the categories grid. */
  categoriesTitle?: string
  externalLinks: ExternalLink[]
  archive: ArchiveEntry[]
}

export const competitions: Competition[] = [
  {
    slug: 'first-lego-league',
    title: 'FIRST LEGO League',
    shortTitle: 'FLL',
    subtitle: 'Međunarodni natjecateljski program robotike za znatiželjne i odlučne mlade inovatore',
    description:
      'FIRST LEGO League (FLL) je globalni istraživački i natjecateljski program robotike koji mladima otkriva kako se znanost, tehnologija, inženjerstvo i matematika (STEM) mogu koristiti za rješavanje stvarnih izazova.',
    paragraphs: [
      'FIRST LEGO League (FLL) je globalni istraživački i natjecateljski program robotike koji mladima otkriva kako se znanost, tehnologija, inženjerstvo i matematika (STEM) mogu koristiti za rješavanje stvarnih izazova. Kroz kombinaciju izgradnje LEGO robota, kreativnog timskog istraživanja i prezentiranja inovativnih ideja, program razvija ključne vještine kao što su rješavanje problema, strategija, suradnja i samopouzdanje. Program se provodi u više od 100 država širom svijeta, a u Hrvatskoj ga koordinira Hrvatski robotički savez u partnerstvu s lokalnim timovima i mentorima.',
      'FIRST LEGO League nije samo robotičko natjecanje – to je iskustvo u kojem djeca rade kao tim na stvarnim problemima, grade i programiraju robote, razvijaju inovativna rješenja i prezentiraju ih pred ocjenjivačima.',
      'Program je namijenjen djeci i mladima koji pokazuju poseban interes za robotiku i STEM područja, a žele i dodatne izazove te iskustvo pripadanja globalnoj zajednici mladih inovatora. Sudjelovanje u FIRST LEGO League timu ostvaruje se po preporuci naših robo trenera nakon završetka programa Svijet LEGO robotike 4, čime se polaznicima otvara jedinstvena prilika da razviju napredne tehnološke i socijalne vještine kroz praktičan rad, timsku suradnju i natjecateljski duh – iskustvo koje nadilazi standardnu edukaciju robotike.',
    ],
    categories: [
      {
        name: 'Inovativni projekt',
        description: 'Timovi moraju pronaći i istraživati rješenje na aktualan problem vezan uz trenutnu temu natjecanja.',
      },
      {
        name: 'Robotska igra',
        description: 'Timovi dizajniraju i programiraju autonomnog LEGO robota koji rješava zadane zadatke na polju natjecanja.',
      },
      {
        name: 'Tehnički intervju',
        description: 'Suci ocjenjuju konstrukciju i program robota te pristup timskog rješavanja problema.',
      },
      {
        name: 'Temeljne vrijednosti',
        description: 'Potiču fair play, timsku suradnju, kreativnost i uzajamno poštovanje.',
      },
    ],
    externalLinks: [
      { label: 'FIRST LEGO League Croatia', url: 'https://fllcroatia.org/' },
      { label: 'FIRST LEGO League Home', url: 'https://www.firstlegoleague.org' },
    ],
    archive: [
      { label: 'Regionalno FLL natjecanje - Pula 2026.', slug: 'regionalno-fll-2026' },
      { label: 'First Lego League 2022.', slug: 'drzavno-natjecanje-iz-lego-robotike-first-lego-league-2022' },
      { label: 'First Lego League 2020.', slug: 'first-lego-league-2020' },
      { label: 'First Lego League 2019.', slug: 'first-lego-league-2019' },
    ],
    tone: 'cyan',
  },
  {
    slug: 'world-robot-olympiad',
    title: 'World Robot Olympiad',
    shortTitle: 'WRO',
    subtitle: 'Međunarodni robotski izazov za znatiželjne umove koji vole stvarati i rješavati probleme',
    description:
      'Program World Robot Olympiad (WRO) jedan je od najprestižnijih međunarodnih robotičkih natjecanja na svijetu u kojem svake godine sudjeluje preko 100 zemalja.',
    tone: 'yellow',
    highlight: 'Srebrna medalja WRO 2025 – Singapur',
    paragraphs: [
      'Program World Robot Olympiad (WRO) jedan je od najprestižnijih međunarodnih robotičkih natjecanja na svijetu u kojem svake godine sudjeluje preko 100 zemalja širom svijeta, a tisuće mladih timova se susreću kako bi predstavili svoje inovativne robotske sustave i rješenja.',
      'Ovaj međunarodni format natjecanja nudi različite kategorije prilagođene vještinama i dobnim skupinama, a iza sebe ima dugogodišnju tradiciju poticanja kreativnosti, inovativnog razmišljanja i rješavanja stvarnih robotskih izazova. U WRO timu djeca rade u malim grupama, razvijaju strateško razmišljanje, savladavaju složene tehničke probleme i uče kako učinkovito surađivati u timu pod stvarnim natjecateljskim uvjetima.',
      'Sudjelovanje u WRO timu naše udruge ostvaruje se po preporuci predavača nakon završetka programa Svijet LEGO robotike 4, kako bi polaznici koji pokazuju motivaciju i sposobnosti imali priliku okušati se na međunarodnoj pozornici. Program pruža jedinstvenu priliku za primjenu znanja u stvarnom svijetu, razvoj samopouzdanja, timskog duha i suradničkih vještina, dok se polaznici povezuju s globalnom zajednicom mladih inovatora. Ovakvo natjecanje potiče analitičko razmišljanje, kreativnost, preciznost i strateško planiranje te donosi nova iskustva i izazove koji nadilazi standardnu edukaciju robotike.',
    ],
    categories: [],
    externalLinks: [
      { label: 'WRO Hrvatska', url: 'https://wro.hr' },
      { label: 'WRO International', url: 'https://wro-association.org' },
    ],
    archive: [
      { label: 'WRO 2025 - Svjetsko natjecanje, Singapur', slug: 'splitska-udruga-inovatic-osvojila-srebro-na-svjetskom-finalu-robotike-u-singapuru' },
      { label: 'WRO 2019. - Algebra LAB, Zagreb', slug: 'wro-2019' },
    ],
  },
  {
    slug: 'natjecanje-mladih-tehnicara',
    title: 'Natjecanje mladih tehničara',
    shortTitle: 'NMT',
    subtitle: 'Nacionalno natjecanje iz tehničke kulture na kojem nastupamo u robotici i automatici',
    description:
      'Natjecanje mladih tehničara (NMT) nacionalno je natjecanje iz tehničke kulture u organizaciji Hrvatske zajednice tehničke kulture. Naša udruga aktivno priprema svoje članove za kategorije robotskog spašavanja žrtve, robotike i automatike.',
    tone: 'cyan',
    programDetails: [
      { label: 'Trajanje programa', value: '60 školskih sati (listopad – svibanj)' },
      { label: 'Dinamika održavanja', value: 'Jednom tjedno u trajanju od 90 minuta' },
      { label: 'Pravo upisa', value: 'Prošlogodišnji polaznici 5. – 8. razreda na preporuku predavača/mentora' },
    ],
    paragraphs: [
      'Natjecanje mladih tehničara (NMT) organiziraju i provode Ministarstvo znanosti, obrazovanja i sporta, Agencija za odgoj i obrazovanje, Hrvatska zajednica tehničke kulture, županijski i gradski uredi za prosvjetu, kulturu, informiranje, sport i tehničku kulturu, županijske i gradske zajednice tehničke kulture te udruge tehničke kulture.',
      'Natjecanje se provodi na temelju redovitog, izbornog i izvannastavnog programa tehničke kulture te programa dodatne nastave sadržane u Hrvatskom nacionalnom obrazovnom standardu i programima posebnih tehničkih kompetencija (znanje, vještine, samostalnost i odgovornost) koje se stječu u izvannastavnom i izvanškolskom programu tehničke kulture.',
      'Zahvaljujući potpori i sufinanciranju od strane Hrvatskog robotičkog saveza u 2019. naša udruga je osigurala dodatna sredstva za uspješniju pripremu i sudjelovanje na ovom tipu natjecanja.',
      'Naša udruga aktivno priprema svoje članove i sudjeluje na Natjecanju mladih tehničara, naročito u sljedećim kategorijama:',
    ],
    categories: [
      { name: 'Robotsko spašavanje žrtve (P-kategorija)' },
      { name: 'Robotika (H-kategorija)' },
      { name: 'Automatika (P-kategorija)' },
    ],
    externalLinks: [
      { label: 'Pravila i propozicije – HZTK', url: 'https://www.hztk.hr/' },
      { label: 'Hrvatski robotički savez', url: 'https://hrobos.hr/' },
    ],
    archive: [
      { label: '62. natjecanje mladih tehničara (2019./2020.) – državna razina (nije održano zbog COVID-19)', slug: null },
      { label: '62. natjecanje mladih tehničara (2019./2020.) – županijska razina', slug: '62-natjecanje-mladih-tehnicara-zupanijska-razina' },
      { label: '61. natjecanje mladih tehničara (2018./2019.) – državna razina', slug: '61-natjecanje-mladih-tehnicara-2018-2019-drzavna-razina' },
      { label: '61. natjecanje mladih tehničara (2018./2019.) – županijska razina', slug: '61-natjecanje-mladih-tehnicara-2018-2019-zupanijska-razina' },
      { label: '60. natjecanje mladih tehničara (2017./2018.) – državna razina', slug: '60-natjecanje-mladih-tehnicara-drzavna-razina' },
      { label: '60. natjecanje mladih tehničara (2017./2018.) – županijska razina', slug: '60-natjecanje-mladih-tehnicara-zupanijska-razina' },
      { label: '59. natjecanje mladih tehničara (2016./2017.) – državna razina', slug: '59-natjecanje-mladih-tehnicara-drzavna-razina' },
      { label: '59. natjecanje mladih tehničara (2016./2017.) – županijska razina', slug: '59-natjecanje-mladih-tehnicara-zupanijska-razina' },
    ],
  },
  {
    slug: 'robokup',
    title: 'Robokup',
    shortTitle: 'ROBOKUP',
    subtitle: 'Ekipno natjecanje učenika osnovnih škola iz cijele Hrvatske u robotici',
    description:
      'Robokup je ekipno natjecanje učenika osnovnih škola iz cijele Hrvatske u robotici koje se održava od 2008. godine. Natjecateljsku ekipu čine najviše tri natjecatelja.',
    tone: 'yellow',
    highlight: 'Državni prvaci 15. Robokupa',
    programDetails: [
      { label: 'Trajanje programa', value: '60 školskih sati (listopad – svibanj)' },
      { label: 'Dinamika održavanja', value: 'Jednom tjedno u trajanju od 90 minuta' },
      { label: 'Pravo upisa', value: 'Prošlogodišnji polaznici 5. – 8. razreda na preporuku predavača/mentora' },
    ],
    paragraphs: [
      'Robokup je ekipno natjecanje učenika osnovnih škola iz cijele Hrvatske u robotici, a od 2008. godine se održava. Natjecateljsku ekipu čine najviše tri natjecatelja.',
      'U našoj udruzi aktivno pripremamo naše članove te najuspješnije vodimo na samu završnicu Robokup natjecanja koja se održava jednom godišnje gdje se skupe najbolje ekipe iz cijele Hrvatske.',
      'Robokup je podijeljen na županijsku i državnu razinu natjecanja. Najbolje tri ekipe unutar prijavljenih županija ostvaruju plasman na završnicu državnog Robokup natjecanja.',
      'Robokup natjecanje je izuzetno složeno te sadrži tri elementa u kojima natjecatelji trebaju pokazati svoja znanja i vještine:',
    ],
    categoriesTitle: 'Elementi natjecanja',
    categories: [
      { name: 'Strujni krugovi' },
      { name: 'Programiranje mikroupravljačkog sučelja' },
      { name: 'Robotske konstrukcije i programiranje' },
    ],
    externalLinks: [
      { label: 'Pravila i propozicije – HZTK', url: 'https://www.hztk.hr/robokup.aspx' },
    ],
    archive: [
      { label: 'Robokup 2022. – državna razina', slug: 'drzavni-prvaci-15-robokupa' },
      { label: 'Robokup 2022. – županijska razina', slug: 'osvojeno-2-mjesto-na-zupanijskom-robokup-u-2022' },
      { label: 'Robokup 2020. – državna razina', slug: 'robokup-2020-drzavna-razina' },
      { label: 'Robokup 2020. – županijska razina', slug: 'robokup-zupanijsko-natjecanje-2020' },
      { label: 'Robokup 2019. – državna razina', slug: 'robokup-drzavno-2019' },
      { label: 'Robokup 2019. – županijska razina', slug: 'robokup-zupanijsko-2019' },
    ],
  },
]

export function getCompetitionBySlug(slug: string): Competition | undefined {
  return competitions.find((c) => c.slug === slug)
}

/** Next competition in list order, wrapping around — powers the "read on" banner. */
export function getNextCompetition(slug: string): Competition | undefined {
  const idx = competitions.findIndex((c) => c.slug === slug)
  if (idx === -1 || competitions.length < 2) return undefined
  return competitions[(idx + 1) % competitions.length]
}

export const COMPETITION_ICONS: Record<string, LucideIcon> = {
  'first-lego-league': Trophy,
  'world-robot-olympiad': Award,
  'natjecanje-mladih-tehnicara': Wrench,
  robokup: Bot,
}

/**
 * Tailwind class sets per brand tone. Written out in full because Tailwind
 * only sees literal class strings — never build these by interpolation.
 * The banner slots style the *target* competition's teaser, so its button
 * deliberately carries the contrasting tone.
 */
interface ToneClasses {
  card: string
  iconTile: string
  iconGlyph: string
  pill: string
  heroBg: string
  heroBlobA: string
  heroBlobB: string
  heroGear: string
  banner: string
  bannerLead: string
  bannerTitle: string
  bannerButton: string
}

export const COMPETITION_TONES: Record<Competition['tone'], ToneClasses> = {
  cyan: {
    card: 'bg-cyan-50 border-cyan-200 hover:border-cyan-400 hover:shadow-cyan-100',
    iconTile: 'bg-cyan-500',
    iconGlyph: 'text-white',
    pill: 'text-cyan-800 bg-cyan-100',
    heroBg: 'bg-gradient-to-br from-cyan-50 via-white to-blue-50',
    heroBlobA: 'bg-cyan-300',
    heroBlobB: 'bg-yellow-200',
    heroGear: 'text-cyan-200',
    banner: 'bg-gradient-to-r from-cyan-500 to-cyan-600',
    bannerLead: 'text-cyan-100',
    bannerTitle: 'text-white',
    bannerButton: 'bg-yellow-400 text-gray-900 hover:bg-yellow-300',
  },
  yellow: {
    card: 'bg-yellow-50 border-yellow-200 hover:border-yellow-400 hover:shadow-yellow-100',
    iconTile: 'bg-yellow-400',
    iconGlyph: 'text-gray-900',
    pill: 'text-yellow-800 bg-yellow-200',
    heroBg: 'bg-gradient-to-br from-yellow-50 via-white to-orange-50',
    heroBlobA: 'bg-yellow-300',
    heroBlobB: 'bg-orange-200',
    heroGear: 'text-yellow-200',
    banner: 'bg-gradient-to-r from-yellow-400 to-orange-500',
    bannerLead: 'text-yellow-900/60',
    bannerTitle: 'text-gray-900',
    bannerButton: 'bg-cyan-500 text-white hover:bg-cyan-600',
  },
}
