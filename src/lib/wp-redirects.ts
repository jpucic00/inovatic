/**
 * Legacy WordPress URL map — the old site served everything from the domain
 * root, so after cutover every old post/page URL would 404 (social media
 * posts, external backlinks, Google results).
 *
 * Sources (captured from the LIVE WP sitemaps on 2026-07-17, pre-shutdown):
 *   https://udruga-inovatic.hr/wp-sitemap-posts-post-1.xml  (72 posts)
 *   https://udruga-inovatic.hr/wp-sitemap-posts-page-1.xml  (~84 pages)
 *
 * Posts are NOT listed here: article slugs were migrated 1:1, so the root
 * [slug] route redirects them via a DB lookup. This map carries only
 * (a) the two articles whose slugs were shortened during migration and
 * (b) WP-only pages mapped to their closest living equivalent.
 *
 * WP pages with an identical path in this app (o-nama, donacije,
 * politika-privatnosti) need no entry — their static routes win before the
 * dynamic [slug] segment. /kontakt is redirected in next.config.ts.
 */
/**
 * Shape gate for the root `[slug]` catcher, applied AFTER the map above and
 * BEFORE the article lookup. Every migrated slug is lowercase alphanumeric with
 * hyphens (verified against all 96 rows; longest is 84 chars), so anything else
 * cannot match — and bot traffic against `/<random>`, `/.env`, `/wp-admin.php`
 * then 404s without costing a Neon pooled-connection round trip.
 */
const WP_SLUG_PATTERN = /^[a-z0-9-]+$/
const MAX_SLUG_LENGTH = 120

export function couldBeArticleSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && WP_SLUG_PATTERN.test(slug)
}

export const WP_REDIRECTS: Readonly<Record<string, string>> = {
  // ── Articles renamed during migration (WP slug → new slug) ───────────────
  'inovatic-ostvario-povijesni-uspjeh-na-drzavnom-finalu-world-robot-olympiad-pet-trofeja-europski-i-svjetski-plasman':
    '/novosti/wro-2026-drzavno-finale',
  'zavrsena-jos-jedna-uspjesna-skolska-godina-radionica-robotike-udruge-inovatic':
    '/novosti/zavrsena-skolska-godina-radionica-robotike',

  // ── City / contact ────────────────────────────────────────────────────────
  split: '/lokacije/split',
  sibenik: '/lokacije/sibenik',

  // ── Signup ────────────────────────────────────────────────────────────────
  prijave: '/prijava',
  'prijava-na-online-edukaciju': '/prijava',

  // ── Direct equivalents ────────────────────────────────────────────────────
  donacija: '/donacije',
  'lego-rodendan': '/proslave',
  'politika-kolacica': '/politika-privatnosti',
  'starije-objave': '/novosti',

  // ── About / projects & partners ──────────────────────────────────────────
  'o-projektu': '/o-nama',
  'o-partnerima': '/o-nama',
  'bilo-kuda-stem-svuda-projektne-aktivnosti': '/o-nama',

  // ── Mentor / teacher education (WP service pages → the live equivalent) ───
  'stem-edukacija-za-ucitelje': '/stem-edukacija',
  'stem-edukacija-za-mentore': '/stem-edukacija',

  // ── Standard SLR course pages ─────────────────────────────────────────────
  'svijet-lego-robotike-predskolski-uzrast': '/programi/uvod-u-svijet-lego-robotike',
  'svijet-lego-robotike-1': '/programi/slr-1',
  'svijet-lego-robotike-2': '/programi/slr-2',
  'svijet-lego-robotike-3': '/programi/slr-3',
  'svijet-lego-robotike-4': '/programi/slr-4',
  'svijet-lego-robotike-5': '/programi',

  // ── Competitions with a live detail page (identical slug) ────────────────
  'first-lego-league': '/natjecanja/first-lego-league',
  'world-robot-olympiad': '/natjecanja/world-robot-olympiad',
  'natjecanje-mladih-tehnicara': '/natjecanja/natjecanje-mladih-tehnicara',
  robokup: '/natjecanja/robokup',

  // ── Per-year competition reports ─────────────────────────────────────────
  // 19 of these WP pages were migrated as articles on 2026-07-23 keeping their
  // slugs 1:1, so they are DELIBERATELY absent here — the map is consulted
  // BEFORE the DB lookup, and an entry would shadow the article it points past.
  // Only the one auto-slug that had to be renamed keeps an alias:
  '2069-2': '/novosti/62-natjecanje-mladih-tehnicara-zupanijska-razina',

  // ── Competition family → hub ──────────────────────────────────────────────
  // Program descriptions, not event reports — deliberately not migrated.
  'croatian-makers-liga': '/natjecanja',
  'wer-croatian-open-2': '/natjecanja',

  // ── Retired course/hardware & workshop-offer pages → programs ────────────
  'ciklusi-elementarne-robotike': '/programi',
  edison: '/programi',
  'boson-microbit': '/programi',
  'codey-rocky': '/programi',
  makeblock: '/programi',
  microbrick: '/programi',
  tinkercad: '/programi',
  'miranda-software': '/programi',
  // NOTE: 'rosil' and 'zimske-radionice-robotike-2022' exist on WP as BOTH a
  // page and a post; the posts were migrated as articles, so the DB lookup
  // (→ /novosti/{slug}) intentionally owns them — do not map them here.
  'lego-wedo-2-0': '/programi',
  'fischertechnik-microbit': '/programi',
  'lego-mindstorms-projekti': '/programi',
  'jednodnevne-radionice': '/programi',
  'jednodnevne-radionice-cista-velika': '/programi',
  'jednodnevne-radionice-os-znjan-pazdigrad': '/programi',
  'jednodnevne-radionice-robobrac': '/programi',
  'jednodnevne-radionice-zsm': '/programi',
  'visednevne-radionice': '/programi',
  'radionice-preko-praznika': '/programi',
  'radionice-preko-praznika-na-bracu': '/programi',
  'radionice-za-vrijeme-praznika': '/programi',
  'ljetni-kamp-split': '/programi',
  'ljetna-skola-robotike-zsm': '/programi',
  'ljetne-radionice-1-ciklus-16-7-20-7-2021': '/programi',
  '2-ciklus-ljetnih-radionica-2021': '/programi',
  '3-ciklus-ljetnih-radionica-2021': '/programi',

  // ── STEM project showcases → about ────────────────────────────────────────
  'microbit-projekti': '/o-nama',
  'microbit-alarmni-uredaj': '/o-nama',
  'microbit-automatska-parking-rampa': '/o-nama',
  'microbit-maqueen': '/o-nama',
  'microbrick-robo-arm': '/o-nama',
  'kreativni-projekti-s-microbitom-pametna-kasica-prasica': '/o-nama',
  'igra-strujni-labirint': '/o-nama',
  'zupcasti-prijenosni-omjer': '/o-nama',
  'znanstvni-izazovi-sa-microbitom-irim-i-institut-ruder-boskovic': '/o-nama',
}
