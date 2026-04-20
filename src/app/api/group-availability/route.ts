import { NextResponse } from 'next/server'
import { getActivePrograms } from '@/actions/public/programs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const programs = await getActivePrograms()
  return NextResponse.json(programs)
}
