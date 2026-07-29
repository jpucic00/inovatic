import { NextResponse } from 'next/server'
import { getActivePrograms, getSignupProgramById } from '@/actions/public/programs'
import { isCity } from '@/lib/city'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Fail closed: the poll must name a valid city. A missing/invalid city is a
  // 400, never a silent cross-city or empty result.
  const params = new URL(request.url).searchParams
  const city = params.get('city')
  if (!isCity(city)) {
    return NextResponse.json({ error: 'Nedostaje ili nevažeći grad.' }, { status: 400 })
  }

  // A per-program signup link polls for its OWN program. Answering those from
  // the public catalog would silently drop the competitive program, which is
  // deliberately absent from it — the form would lose its termini mid-session.
  const courseId = params.get('courseId')
  if (courseId) {
    const program = await getSignupProgramById(city, courseId)
    return NextResponse.json(program ? [program] : [])
  }

  const programs = await getActivePrograms(city)
  return NextResponse.json(programs)
}
