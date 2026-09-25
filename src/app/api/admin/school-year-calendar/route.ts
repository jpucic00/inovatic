import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { attachmentContentDisposition } from '@/lib/content-disposition'
import { schoolYearCalendarFilename } from '@/lib/school-year-calendar'
import {
  SchoolYearCalendarUnavailableError,
  renderSchoolYearCalendarPdf,
} from '@/lib/pdf/school-year-calendar-pdf'

export const runtime = 'nodejs'

const SCHOOL_YEAR_RE = /^\d{4}\/\d{4}$/

/**
 * The "Raspored radionica" PDF for the admin's own city. Admin-only for now
 * (owner decision); the city comes from the session, never from the query, so
 * a Šibenik admin cannot print Split's year.
 */
export async function GET(req: Request) {
  const session = await auth()
  const city = session?.user?.city
  if (session?.user?.role !== 'ADMIN' || !city) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schoolYear = new URL(req.url).searchParams.get('year') ?? ''
  if (!SCHOOL_YEAR_RE.test(schoolYear)) {
    return NextResponse.json({ error: 'Nevaljana školska godina.' }, { status: 400 })
  }

  let pdf: Buffer
  try {
    pdf = await renderSchoolYearCalendarPdf({ city, schoolYear })
  } catch (err) {
    if (err instanceof SchoolYearCalendarUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentContentDisposition(
        schoolYearCalendarFilename(city, schoolYear),
      ),
      'Content-Length': String(pdf.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
