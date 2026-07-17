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
  prijave: '/upisi',
  'prijava-na-online-edukaciju': '/upisi',

  // ── Direct equivalents ────────────────────────────────────────────────────
  donacija: '/donacije',
  'lego-rodendan': '/proslave',
  'politika-kolacica': '/politika-privatnosti',
  'starije-objave': '/novosti',

  // ── About / projects & partners ──────────────────────────────────────────
  'o-projektu': '/o-nama',
  'o-partnerima': '/o-nama',
  'bilo-kuda-stem-svuda-projektne-aktivnosti': '/o-nama',
  'stem-edukacija-za-ucitelje': '/o-nama',

  // ── Standard SLR course pages ─────────────────────────────────────────────
  'svijet-lego-robotike-1': '/programi/slr-1',
  'svijet-lego-robotike-2': '/programi/slr-2',
  'svijet-lego-robotike-3': '/programi/slr-3',
  'svijet-lego-robotike-4': '/programi/slr-4',
  'svijet-lego-robotike-5': '/programi',

  // ── Competitions with a live detail page (identical slug) ────────────────
  'first-lego-league': '/natjecanja/first-lego-league',
  'world-robot-olympiad': '/natjecanja/world-robot-olympiad',

  // ── Competition family → hub ──────────────────────────────────────────────
  'natjecanje-mladih-tehnicara': '/natjecanja',
  '59-natjecanje-mladih-tehnicara-drzavna-razina': '/natjecanja',
  '59-natjecanje-mladih-tehnicara-zupanijska-razina': '/natjecanja',
  '60-natjecanje-mladih-tehnicara-drzavna-razina': '/natjecanja',
  '60-natjecanje-mladih-tehnicara-zupanijska-razina': '/natjecanja',
  '61-natjecanje-mladih-tehnicara-2018-2019-drzavna-razina': '/natjecanja',
  '61-natjecanje-mladih-tehnicara-2018-2019-zupanijska-razina': '/natjecanja',
  robokup: '/natjecanja',
  'robokup-2020-drzavna-razina': '/natjecanja',
  'robokup-drzavno-2019': '/natjecanja',
  'robokup-zupanijsko-2019': '/natjecanja',
  'robokup-zupanijsko-natjecanje-2020': '/natjecanja',
  'cm-liga-2016-17': '/natjecanja',
  'cm-liga-2017-18-pmf-split': '/natjecanja',
  'cm-liga-2018-19-pmf-split': '/natjecanja',
  'cm-liga-2019-2020-pmf-split': '/natjecanja',
  'croatian-makers-liga': '/natjecanja',
  'first-lego-league-2019': '/natjecanja',
  'first-lego-league-2020': '/natjecanja',
  'wer-croatian-open': '/natjecanja',
  'wer-croatian-open-2': '/natjecanja',
  'wer-croatian-open-2018': '/natjecanja',
  'wro-2019': '/natjecanja',

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
  '2069-2': '/programi',

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
