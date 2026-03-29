interface ArchiveEntry {
  label: string
  slug: string | null
}

interface ExternalLink {
  label: string
  url: string
}

interface CompetitionCategory {
  name: string
  description: string
}

export interface Competition {
  slug: string
  title: string
  shortTitle: string
  subtitle: string
  description: string
  paragraphs: string[]
  categories: CompetitionCategory[]
  externalLinks: ExternalLink[]
  archive: ArchiveEntry[]
  color: string
  gradient: string
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
      { label: 'First Lego League 2020.', slug: null },
      { label: 'First Lego League 2019.', slug: null },
    ],
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    slug: 'world-robot-olympiad',
    title: 'World Robot Olympiad',
    shortTitle: 'WRO',
    subtitle: 'Međunarodni robotski izazov za znatiželjne umove koji vole stvarati i rješavati probleme',
    description:
      'Program World Robot Olympiad (WRO) jedan je od najprestižnijih međunarodnih robotičkih natjecanja na svijetu u kojem svake godine sudjeluje preko 100 zemalja.',
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
    ],
    color: 'yellow',
    gradient: 'from-yellow-400 to-orange-500',
  },
]

export function getCompetitionBySlug(slug: string): Competition | undefined {
  return competitions.find((c) => c.slug === slug)
}
