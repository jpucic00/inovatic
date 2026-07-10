// Single source of truth for public location/venue data. Consumed by the
// /lokacije overview, the /lokacije/[city] contact pages, the navbar dropdown,
// the homepage LocationsSection and the footer. City == tenant (Split | Šibenik).

type CitySlug = 'split' | 'sibenik'

interface Coordinator {
  name: string
  role: string
  email: string
  phone: string
}

interface Venue {
  name: string
  address: string
  postal: string
  /** Pre-encoded Google Maps `query` param (used for both the embed and the "open in maps" link). */
  mapQuery: string
  image: string
  imageAlt: string
  description: string
  badge?: string
  /** External venue website (e.g. Trokut inkubator → trokut.eu). */
  website?: string
  coordinator: Coordinator
}

interface CityContact {
  slug: CitySlug
  label: string
  /** Short hero line for the city contact page. */
  intro: string
  venues: Venue[]
}

/** Drives the navbar dropdown and the /lokacije overview cards, in display order. */
export const CITIES: { slug: CitySlug; label: string }[] = [
  { slug: 'split', label: 'Split' },
  { slug: 'sibenik', label: 'Šibenik' },
]

/** Shared inboxes shown on every city page (not city-specific). */
export const SHARED_EMAILS = {
  prijave: 'prijave@udruga-inovatic.hr',
  info: 'info@udruga-inovatic.hr',
} as const

export const LOCATIONS: Record<CitySlug, CityContact> = {
  split: {
    slug: 'split',
    label: 'Split',
    intro:
      'Nastava u Splitu odvija se na dvije lokacije — redovni program u Velebitskoj i natjecateljski programi na Prirodoslovno-matematičkom fakultetu.',
    venues: [
      {
        name: 'Velebitska 32',
        address: 'Velebitska 32',
        postal: '21000 Split',
        mapQuery: 'Velebitska+32,+Split,+Croatia',
        image: '/images/locations/split-velebitska.jpg',
        imageAlt: 'Učionica Udruge Inovatic na lokaciji Velebitska 32 u Splitu',
        description:
          'Dvije prostrane učionice namijenjene provedbi kurikuluma Svijet LEGO Robotike (redovni program, razine SLR 1–4).',
        coordinator: {
          name: 'Bruno Bešlić',
          role: 'Voditelj lokacije',
          email: 'bruno.beslic@udruga-inovatic.hr',
          phone: '+385 98 960 2238',
        },
      },
      {
        name: 'Ruđera Boškovića 33',
        address: 'Ruđera Boškovića 33',
        postal: '21000 Split',
        mapQuery: 'Ru%C4%91era+Bo%C5%A1kovi%C4%87a+33,+Split,+Croatia',
        image: '/images/locations/split-pmf.jpg',
        imageAlt: 'Prostor na Prirodoslovno-matematičkom fakultetu, Ruđera Boškovića 33, Split',
        description:
          'Dvorana B1-07 na Odjelu za politehniku PMF-a — lokacija namijenjena natjecateljskim programima (WRO i FLL).',
        badge: 'Prirodoslovno-matematički fakultet',
        coordinator: {
          name: 'Jozo Pivac',
          role: 'Voditelj natjecateljskih programa',
          email: 'jozo.pivac@udruga-inovatic.hr',
          phone: '+385 99 393 6993',
        },
      },
    ],
  },
  sibenik: {
    slug: 'sibenik',
    label: 'Šibenik',
    intro:
      'Naša najnovija lokacija (2026.) — isti kurikulum Svijet LEGO Robotike, u prostoru Trokut inkubatora.',
    venues: [
      {
        name: 'Trokut inkubator',
        address: 'Ul. Velimira Škorpika 7/a',
        postal: '22000 Šibenik',
        mapQuery: 'Trokut+inkubator,+Ul.+Velimira+%C5%A0korpika+7a,+22000+%C5%A0ibenik,+Croatia',
        image: '/images/locations/sibenik-trokut.jpg',
        imageAlt: 'Zgrada Trokut inkubatora u Šibeniku',
        description:
          'Nastava se održava u Trokut inkubatoru — modernom poduzetničkom i tehnološkom centru Grada Šibenika.',
        badge: 'Novo',
        website: 'https://www.trokut.eu',
        coordinator: {
          name: 'Slavica Jurčević',
          role: 'Voditeljica lokacije Šibenik',
          email: 'slavica.jurcevic@udruga-inovatic.hr',
          phone: '+385 92 168 9987',
        },
      },
    ],
  },
}

/** Returns the city record for a slug, or `undefined` for an unknown slug (→ notFound). */
export function getCity(slug: string): CityContact | undefined {
  return (CITIES.some((c) => c.slug === slug) ? LOCATIONS[slug as CitySlug] : undefined)
}
