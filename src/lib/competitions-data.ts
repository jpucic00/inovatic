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
    subtitle: 'Natjecateljski program',
    description:
      'Međunarodni, multidisciplinarni istraživački program koji želi u djeci probuditi znanstvenika koji će promišljati o problemima oko sebe i tražiti način kako ih riješiti.',
    paragraphs: [
      'FIRST LEGO League (FLL) je međunarodni, multidisciplinarni istraživački program koji želi u djeci probuditi znanstvenika koji će promišljati o problemima oko sebe i tražiti način kako ih riješiti. Promiče znatiželju, kreativnost, zajedničko učenje i timski rad.',
      'Kroz igru djeca razvijaju i jačaju tehničku pismenost i logički način razmišljanja, moderne tehnologije koriste u humane svrhe, a kroz atraktivne LEGO robote koje moraju osmisliti na učinkovit i zabavan način uživaju u znanosti.',
      'Ovaj program postoji u preko 100 država svijeta, a od 2017. i u Hrvatskoj u organizaciji Hrvatskog robotičkog saveza.',
    ],
    categories: [
      {
        name: 'Projekt',
        description: 'Timovi moraju pronaći i istraživati rješenje na aktualan problem vezan uz trenutnu temu.',
      },
      {
        name: 'Robotske igre',
        description: 'Cilj je napraviti robota koji efikasno rješava zadane zadatke u vremenski ograničenom roku od dvije i pol minute.',
      },
      {
        name: 'Tehnički intervju',
        description: 'Ocjenjuju se dizajn i konstrukcija robota te njihovi programi.',
      },
      {
        name: 'Temeljne vrijednosti',
        description: 'Cilj je poticanje sportskog natjecanja i suradnje na natjecanju.',
      },
    ],
    externalLinks: [
      { label: 'FIRST LEGO League Croatia', url: 'https://www.fll.hr' },
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
    subtitle: 'Natjecateljski program',
    description:
      'Najmasovnije svjetsko natjecanje u robotici koje se održava od 2004. Naš tim CroSpec osvojio je srebrnu medalju na WRO 2025 u Singapuru.',
    paragraphs: [
      'World Robot Olympiad (WRO) je najmasovnije svjetsko natjecanje u robotici koje se održava u svijetu od 2004. Natjecatelji se diljem svijeta natječu koristeći hardver i softver robota po osobnom odabiru. Najbolji dobivaju priliku nastupiti na svjetskoj završnici.',
      'Natjecatelji rade zajedno u timu od 2-3 natjecatelja i pronalaze vlastita rješenja za potrebe definirane u sezoni natjecanja. Svaki tim ima jednog mentora koji ih usmjerava za vrijeme priprema i samog natjecanja.',
      'Hrvatski robotički savez u suradnji sa mađarskim organizatorom WRO natjecanja – EDUTUS sveučilištem, organizira i provodi ovo natjecanje u našoj državi od 2019.',
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
