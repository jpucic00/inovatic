/**
 * Wrapper around OpenHolidaysAPI (https://openholidaysapi.org) — the only
 * no-auth, free, Croatian-localized public API that returns both državni
 * blagdani AND MZO-decreed školski praznici (zimski/proljetni/ljetni).
 *
 * The dialog under `/admin/skolska-godina` uses this to prefill the school
 * year holiday calendar so admins don't have to type ~13 blagdani + 3 odmor
 * ranges by hand every year.
 */

const API_BASE = 'https://openholidaysapi.org'
const COUNTRY_ISO = 'HR'
const LANGUAGE_ISO = 'HR'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/

type OpenHolidaysName = { language: string; text: string }
type OpenHolidaysEntry = {
  id?: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  name?: OpenHolidaysName[]
  type?: string
  nationwide?: boolean
}

export type FetchedHoliday =
  | { kind: 'single'; date: string; name: string; category: 'public' | 'school' }
  | {
      kind: 'range'
      startDate: string
      endDate: string
      name: string
      category: 'public' | 'school'
    }

export class HolidayApiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'HolidayApiError'
    if (cause !== undefined) this.cause = cause
  }
}

function pickCroatianName(names: OpenHolidaysName[] | undefined): string {
  if (!names || names.length === 0) return ''
  const hr = names.find((n) => n.language?.toUpperCase() === LANGUAGE_ISO)
  return (hr?.text ?? names[0]?.text ?? '').trim()
}

/** "2025/2026" → Sept 1 2025 … Aug 31 2026 (ISO date strings). */
export function dateRangeForSchoolYear(schoolYear: string): {
  validFrom: string
  validTo: string
} {
  if (!SCHOOL_YEAR_RE.test(schoolYear)) {
    throw new HolidayApiError(`Nevažeća oznaka školske godine: ${schoolYear}`)
  }
  const startYear = Number.parseInt(schoolYear.split('/')[0], 10)
  return {
    validFrom: `${startYear}-09-01`,
    validTo: `${startYear + 1}-08-31`,
  }
}

async function fetchCategory(
  path: '/PublicHolidays' | '/SchoolHolidays',
  validFrom: string,
  validTo: string,
): Promise<OpenHolidaysEntry[]> {
  const url = `${API_BASE}${path}?countryIsoCode=${COUNTRY_ISO}&validFrom=${validFrom}&validTo=${validTo}&languageIsoCode=${LANGUAGE_ISO}`
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    throw new HolidayApiError(`Greška pri dohvaćanju ${path}.`, err)
  }
  if (!res.ok) {
    throw new HolidayApiError(`OpenHolidaysAPI ${path} HTTP ${res.status}.`)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new HolidayApiError(`Neispravan JSON odgovor s ${path}.`, err)
  }
  if (!Array.isArray(body)) {
    throw new HolidayApiError(`Neočekivani odgovor s ${path}.`)
  }
  return body as OpenHolidaysEntry[]
}

function entryToFetched(
  entry: OpenHolidaysEntry,
  category: 'public' | 'school',
): FetchedHoliday | null {
  const name = pickCroatianName(entry.name)
  if (!name || !entry.startDate || !entry.endDate) return null
  if (entry.startDate === entry.endDate) {
    return { kind: 'single', date: entry.startDate, name, category }
  }
  return {
    kind: 'range',
    startDate: entry.startDate,
    endDate: entry.endDate,
    name,
    category,
  }
}

function startKey(h: FetchedHoliday): string {
  return h.kind === 'single' ? h.date : h.startDate
}

/**
 * Fetches public + school holidays for the given school year and normalizes
 * them into our internal `FetchedHoliday` shape. Throws `HolidayApiError` on
 * any network/parse failure so the calling action can map it to a UI message.
 */
export async function fetchCroatianHolidays(schoolYear: string): Promise<FetchedHoliday[]> {
  const { validFrom, validTo } = dateRangeForSchoolYear(schoolYear)

  const [publicEntries, schoolEntries] = await Promise.all([
    fetchCategory('/PublicHolidays', validFrom, validTo),
    fetchCategory('/SchoolHolidays', validFrom, validTo),
  ])

  const items: FetchedHoliday[] = []
  for (const e of publicEntries) {
    const f = entryToFetched(e, 'public')
    if (f) items.push(f)
  }
  for (const e of schoolEntries) {
    const f = entryToFetched(e, 'school')
    if (f) items.push(f)
  }

  // Public first, then school; each group ordered by start date.
  items.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'public' ? -1 : 1
    const sa = startKey(a)
    const sb = startKey(b)
    if (sa < sb) return -1
    if (sa > sb) return 1
    return 0
  })

  return items
}
