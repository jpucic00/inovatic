import { NextResponse } from 'next/server'
import { getActivePrograms } from '@/actions/public/programs'
import { isCity } from '@/lib/city'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Fail closed: the poll must name a valid city. A missing/invalid city is a
  // 400, never a silent cross-city or empty result.
  const city = new URL(request.url).searchParams.get('city')
  if (!isCity(city)) {
    return NextResponse.json({ error: 'Nedostaje ili nevažeći grad.' }, { status: 400 })
  }
  const programs = await getActivePrograms(city)
  return NextResponse.json(programs)
}
