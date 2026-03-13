import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const role = req.auth?.user?.role

  // Admin panel – ADMIN only
  if (pathname.startsWith('/admin')) {
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/prijava', req.url))
    }
  }

  // Teacher panel – TEACHER or ADMIN
  if (pathname.startsWith('/nastavnik')) {
    if (role !== 'TEACHER' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/prijava', req.url))
    }
  }

  // Student portal – any authenticated user
  if (pathname.startsWith('/portal')) {
    if (!req.auth) {
      return NextResponse.redirect(new URL('/prijava', req.url))
    }
  }
})

export const config = {
  matcher: ['/admin/:path*', '/nastavnik/:path*', '/portal/:path*'],
}
