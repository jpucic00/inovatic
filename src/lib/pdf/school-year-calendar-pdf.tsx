/**
 * The one-page "Raspored radionica" PDF — the document the association used to
 * build by hand in Word, now drawn from the Kalendar's own derivation.
 *
 * A plain module (not `'use server'`) with no guard of its own: callers resolve
 * the admin's city first. The fonts and the logo are read from disk, which is
 * why `next.config.ts` lists them in `outputFileTracingIncludes` — the
 * standalone build only ships files it can trace, and a path built at runtime
 * is invisible to that trace.
 */
import path from 'node:path'
import type { City } from '@prisma/client'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { citySlug } from '@/lib/city'
import { getCity } from '@/lib/locations'
import {
  SCHOOL_YEAR_CALENDAR_TOTALS,
  formatSchoolYearDotted,
  type CalendarCell,
  type SchoolYearCalendar,
} from '@/lib/school-year-calendar'
import { loadSchoolYearCalendar } from '@/lib/school-year-calendar-data'

const FONT_DIR = path.join(process.cwd(), 'src/assets/fonts')
const LOGO_PATH = path.join(process.cwd(), 'public/images/logo_dark.png')
const ASSOCIATION_OIB = '83709136328'

// The built-in PDF fonts are WinAnsi-encoded and have no Č, Ć or Đ.
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
})
// Dates like "13.10." must never be split at the dot.
Font.registerHyphenationCallback((word) => [word])

const COLORS = {
  session: '#C5E0B3',
  holiday: '#5B9BD5',
  header: '#D9E2F3',
  border: '#000000',
  text: '#111111',
}

const PAGE_HEIGHT = 841.89
const MARGIN_X = 40
const MONTH_COL = 26
const SUNDAY_COL = 58
const WEEKDAY_COL = (595.28 - 2 * MARGIN_X - MONTH_COL - SUNDAY_COL) / 6
/** Everything on the page that is not a week row: margins, title, header, legend, footer. */
const FIXED_HEIGHT = 300
const MAX_ROW_HEIGHT = 16

const HEADERS = [
  'GRUPE\nPONEDJELJAK',
  'GRUPE\nUTORAK',
  'GRUPE\nSRIJEDA',
  'GRUPE\nČETVRTAK',
  'GRUPE\nPETAK',
  'GRUPE\nSUBOTA',
  'NEDJELJA',
]

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    color: COLORS.text,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: MARGIN_X,
    fontSize: 10,
  },
  title: { fontSize: 10.5, marginBottom: 6 },
  table: { marginTop: 14, borderTopWidth: 1, borderLeftWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerCell: {
    backgroundColor: COLORS.header,
    fontWeight: 700,
    fontSize: 7.5,
    justifyContent: 'flex-end',
    paddingVertical: 3,
  },
  monthCell: {
    width: MONTH_COL,
    backgroundColor: COLORS.header,
    borderRightWidth: 0.5,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  legend: { marginTop: 14, fontSize: 9, lineHeight: 1.5 },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerText: { fontSize: 8.5, lineHeight: 1.35 },
  logo: { width: 76 },
})

function columnWidth(index: number): number {
  return index === 6 ? SUNDAY_COL : WEEKDAY_COL
}

function cellBackground(cell: CalendarCell): string | undefined {
  if (cell.state === 'SESSION') return COLORS.session
  if (cell.state === 'HOLIDAY') return COLORS.holiday
  return undefined
}

function cellText(cell: CalendarCell): string {
  if (cell.marker === 'FIRST') return `${cell.label} PRVA`
  if (cell.marker === 'LAST') return `${cell.label} ZADNJA`
  if (cell.holidayName) return `${cell.label} ${cell.holidayName.toUpperCase()}`
  return cell.label
}

function WeekRow({
  week,
  rowHeight,
  fontSize,
  lastOfMonth,
}: Readonly<{ week: CalendarCell[]; rowHeight: number; fontSize: number; lastOfMonth: boolean }>) {
  return (
    <View style={styles.row}>
      {week.map((cell, i) => (
        <View
          key={HEADERS[i]}
          style={[
            styles.cell,
            {
              width: columnWidth(i),
              height: rowHeight,
              backgroundColor: cellBackground(cell),
              borderBottomWidth: lastOfMonth ? 1 : 0.5,
            },
          ]}
        >
          <Text
            style={{
              // A named holiday gets a second, smaller line rather than being cut
              // to "30.5. DAN…": the name is the reason the day is off.
              fontSize: cell.holidayName ? fontSize * 0.72 : fontSize,
              lineHeight: cell.holidayName ? 1.15 : 1,
              fontWeight: cell.marker ? 700 : 400,
              // Inter kerns "7.1" so tightly that 27.10. reads as 2710.
              fontFeatureSettings: { kern: false, tnum: true },
              maxLines: cell.holidayName ? 2 : 1,
              textOverflow: 'ellipsis',
            }}
          >
            {cellText(cell)}
          </Text>
        </View>
      ))}
    </View>
  )
}

function CalendarDocument({
  calendar,
  city,
  schoolYear,
}: Readonly<{ calendar: SchoolYearCalendar; city: City; schoolYear: string }>) {
  // One page, whatever the year: long years get thinner rows instead of a
  // second page nobody would print.
  const rowHeight = Math.min(MAX_ROW_HEIGHT, (PAGE_HEIGHT - FIXED_HEIGHT) / calendar.weekCount)
  const fontSize = Math.min(8.5, rowHeight * 0.58)
  const venue = getCity(citySlug(city))?.venues[0]
  const { sessions } = SCHOOL_YEAR_CALENDAR_TOTALS

  return (
    <Document title={`Raspored radionica ${formatSchoolYearDotted(schoolYear)}`} author="Udruga za robotiku „Inovatic“">
      <Page size="A4" style={styles.page} wrap={false}>
        <Text style={styles.title}>
          RASPORED RADIONICA ZA SVIJET LEGO ROBOTIKE U ŠKOLSKOJ GODINI{' '}
          {formatSchoolYearDotted(schoolYear)}
        </Text>
        <Text style={styles.title}>
          UKUPNO TRAJANJE PROGRAMA: {sessions} RADIONICA.
        </Text>

        <View style={styles.table}>
          <View style={styles.row}>
            <View style={[styles.cell, styles.headerCell, { width: MONTH_COL }]} />
            {HEADERS.map((label, i) => (
              <View key={label} style={[styles.cell, styles.headerCell, { width: columnWidth(i) }]}>
                <Text>{label}</Text>
              </View>
            ))}
          </View>

          {calendar.months.map((month) => {
            const height = month.weeks.length * rowHeight
            return (
              <View key={month.label} style={styles.row}>
                <View style={[styles.monthCell, { height }]}>
                  <Text
                    style={{
                      position: 'absolute',
                      width: height,
                      left: (MONTH_COL - height) / 2,
                      top: height / 2 - 6,
                      textAlign: 'center',
                      fontSize: 8.5,
                      fontWeight: 700,
                      transform: 'rotate(-90deg)',
                    }}
                  >
                    {month.label}
                  </Text>
                </View>
                <View>
                  {month.weeks.map((week, i) => (
                    <WeekRow
                      key={week.find((c) => c.dateKey)?.dateKey ?? i}
                      week={week}
                      rowHeight={rowHeight}
                      fontSize={fontSize}
                      lastOfMonth={i === month.weeks.length - 1}
                    />
                  ))}
                </View>
              </View>
            )
          })}
        </View>

        <View style={styles.legend}>
          <Text>
            *RADIONICE SE <Text style={{ fontWeight: 700 }}>ODRŽAVAJU</Text> U DANIMA SA{' '}
            <Text style={{ fontWeight: 700, backgroundColor: COLORS.session }}> ZELENIM </Text>{' '}
            OZNAČENIM POLJIMA.
          </Text>
          <Text>
            *RADIONICE SE <Text style={{ fontWeight: 700 }}>NE ODRŽAVAJU</Text> U DANIMA SA{' '}
            <Text style={{ fontWeight: 700, backgroundColor: COLORS.holiday }}> PLAVIM </Text> I
            BIJELIM OZNAČENIM POLJIMA.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerText}>
            <Text style={{ fontWeight: 700 }}>Udruga za robotiku „Inovatic“</Text>
            <Text>
              {venue ? `${venue.address}, ${venue.postal}, ` : ''}OIB: {ASSOCIATION_OIB}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is not an <img> and takes no alt */}
          <Image src={LOGO_PATH} style={styles.logo} />
        </View>
      </Page>
    </Document>
  )
}

/** Refusal the admin can act on — distinct from a crash in the renderer. */
export class SchoolYearCalendarUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchoolYearCalendarUnavailableError'
  }
}

/**
 * The city's calendar for one school year as PDF bytes. Throws
 * {@link SchoolYearCalendarUnavailableError} when the year is not fully planned.
 */
export async function renderSchoolYearCalendarPdf(input: {
  city: City
  schoolYear: string
}): Promise<Buffer> {
  const loaded = await loadSchoolYearCalendar(input.city, input.schoolYear)
  if (!loaded.ok) throw new SchoolYearCalendarUnavailableError(loaded.error)
  return renderToBuffer(
    <CalendarDocument calendar={loaded.calendar} city={input.city} schoolYear={input.schoolYear} />,
  )
}
