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
  /** Institution or building name shown below the address in small blue text. */
  institution?: string
  /** Pre-encoded Google Maps `query` param (used for the embed and as fallback for the "open in maps" link). */
  mapQuery: string
  /** Direct Google Maps URL — when set, overrides the constructed link on the "open in maps" button. */
  mapUrl?: string
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
  /** Per-city enrollment inbox (Šibenik uses prijave.sibenik@). */
  upisi: string
  /**
   * The city's enrollment phone, shown next to `upisi` in every signup-page
   * contact box (Split: Jozo, Šibenik: Slavica — same numbers the footer
   * lists). Display format; strip spaces for the tel: href.
   */
  phone: string
  venues: Venue[]
}

/** Drives the navbar dropdown and the /lokacije overview cards, in display order. */
export const CITIES: { slug: CitySlug; label: string }[] = [
  { slug: 'split', label: 'Split' },
  { slug: 'sibenik', label: 'Šibenik' },
]

/** Shared inbox shown on every city page. The enrollment inbox is per-city — see `upisi`. */
export const SHARED_EMAILS = {
  info: 'info@udruga-inovatic.hr',
} as const

export const LOCATIONS: Record<CitySlug, CityContact> = {
  split: {
    slug: 'split',
    label: 'Split',
    intro:
      'Nastava u Splitu odvija se na dvije lokacije — redovni program u Velebitskoj i natjecateljski programi na Prirodoslovno-matematičkom fakultetu.',
    upisi: 'prijave@udruga-inovatic.hr',
    phone: '+385 99 393 6993',
    venues: [
      {
        name: 'Velebitska 32',
        address: 'Velebitska 32',
        postal: '21000 Split',
        institution: 'Anića zgrada – Plokite',
        // Search the association's Google POI, not the bare street address — a plain
        // "Velebitska 32" lookup resolves to the wrong end of the street.
        mapQuery: 'Udruga+za+robotiku+%22Inovatic%22+-+Lokacija+2+(Ani%C4%87a+zgrada),+Velebitska+32,+Split',
        mapUrl: 'https://maps.app.goo.gl/MdfsWt1tqfEeZAX18',
        image: '/images/locations/split-velebitska.jpg',
        imageAlt: 'Učionica Udruge Inovatic na lokaciji Velebitska 32 u Splitu',
        description:
          'Dvije prostrane učionice, dnevni boravak i kuhinja — namijenjene provedbi kurikuluma Svijet LEGO Robotike (redovni program, razine SLR 1–4).',
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
        institution: 'Prirodoslovno-matematički fakultet',
        mapQuery: 'Ru%C4%91era+Bo%C5%A1kovi%C4%87a+33,+Split,+Croatia',
        image: '/images/locations/split-pmf.jpg',
        imageAlt: 'Prostor na Prirodoslovno-matematičkom fakultetu, Ruđera Boškovića 33, Split',
        description:
          'Učionica B1-07 na Odjelu za politehniku Prirodoslovno-matematičkog fakulteta — lokacija namijenjena natjecateljskim programima.',
        website: 'https://www.pmfst.unist.hr',
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
      'Naša nova lokacija (2026.) — isti kurikulum Svijet LEGO Robotike.',
    upisi: 'prijave.sibenik@udruga-inovatic.hr',
    phone: '+385 92 168 9987',
    venues: [
      {
        name: 'Trokut inkubator',
        address: 'Velimira Škorpika 7/a',
        postal: '22000 Šibenik',
        institution: 'Trokut Šibenik – centar poduzetništva',
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
