import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { CITY_VALUES } from '@/lib/city'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import { isCompetition, isRadionica } from '@/lib/program-kind'
import { getCourseBySlug } from '@/lib/courses-data'
import { getSignupProgram, type ActiveProgram } from '@/actions/public/programs'
import { InquiryForm } from '@/components/public/inquiry-form'
import { SignupContactBox } from '@/components/public/signup-contact-box'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}


/**
 * Per-program signup link.
 *
 * `/prijava` is the public catalog: it narrows programs by the child's razred, so
 * a 2. razred child is offered SLR 1. That is right for a first enrollment and
 * wrong for a returning one — last year's SLR 1 group moves on to SLR 2 whatever
 * their razred says. This page is the link you send when the program is already
 * decided: it offers that program's termini and nothing else, and the grade
 * narrowing does not apply (InquiryForm's `preselectedCourseId` path bypasses it).
 *
 * `/prijava/natjecateljski-program` is the same route. It is not special-cased —
 * the competitive program is simply absent from every public listing, so this
 * unlisted link is the only way in.
 *
 * Deliberately `noindex` and absent from the sitemap: these would otherwise be
 * thin duplicates of `/prijava` and `/programi/<slug>`.
 */
async function getProgramCourse(slug: string) {
  return db.course.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      ageMin: true,
      ageMax: true,
      price: true,
      kind: true,
      city: true,
    },
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const course = await getProgramCourse(slug)
  return {
    title: course ? `Prijava – ${course.title}` : 'Prijava',
    // Utility links, not landing pages: keep them out of the index so they
    // never compete with /prijava or /programi/<slug>.
    robots: { index: false, follow: false },
  }
}

export default async function ProgramSignupPage({ params }: Readonly<Props>) {
  const { slug } = await params
  const course = await getProgramCourse(slug)
  if (!course) notFound()

  const competition = isCompetition(course.kind)

  // A radionica has its own /radionice/<slug> page with its marketing copy;
  // sending its signups through a second URL would fragment them.
  if (isRadionica(course.kind)) notFound()

  // A city-bound program is offered in that city only; shared ones (SLR and the
  // competitive program) let the parent pick, exactly like /prijava.
  const cities: readonly City[] = course.city ? [course.city] : CITY_VALUES
  const entries = await Promise.all(
    cities.map(async (c) => [c, await getSignupProgram(c, slug)] as const),
  )
  const programsByCity = Object.fromEntries(
    entries.map(([c, p]) => [c, p ? [p] : []]),
  ) as Partial<Record<City, ActiveProgram[]>>

  const anyOpen = entries.some(([, p]) => p !== null)

  // Public marketing copy for the SLR programs lives in courses-data.ts; the
  // competitive program and any other DB-authored program use their own row.
  const staticCourse = getCourseBySlug(slug)
  const subtitle = staticCourse?.subtitle ?? course.subtitle

  const inquiryFormProps = {
    programsByCity,
    preselectedCourseId: course.id,
    ...(course.city ? { preselectedCity: course.city } : {}),
    // Competitors carry on past 8. razred; every other program keeps the
    // osnovna-škola default.
    ...(competition ? { gradeOptions: GRADE_VALUES } : {}),
  }

  return (
    <>
      <section className="relative bg-gradient-to-br from-cyan-50 via-white to-blue-50 py-12 px-4 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-cyan-400 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-yellow-300 rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="container mx-auto max-w-3xl text-center relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
            Prijava
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
            {course.title}
          </h1>
          {subtitle && (
            <p className="text-gray-600 text-lg max-w-xl mx-auto">{subtitle}</p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <div className="bg-white rounded-xl px-4 py-3 border border-cyan-100 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Dob</p>
              <p className="text-lg font-bold text-gray-900">
                {course.ageMin}–{course.ageMax} godina
              </p>
            </div>
            {course.price != null && (
              <div className="bg-white rounded-xl px-4 py-3 border border-cyan-100 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cijena</p>
                <p className="text-lg font-bold text-gray-900">
                  {course.price} €{competition ? ' / mjesec' : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-5 gap-10">
            {/* No "Prednosti" card here: this page is reached from an invitation,
                where the program is already decided — the selling points belong on
                the public /prijava catalog, not on a link someone was sent. */}
            <div className="lg:col-span-2 space-y-6 order-1 lg:order-none">
              <SignupContactBox />
            </div>

            <div className="lg:col-span-3 order-2 lg:order-none">
              <div className="bg-white rounded-2xl border border-cyan-100 ring-1 ring-cyan-50 shadow-sm p-7">
                {anyOpen ? (
                  <InquiryForm {...inquiryFormProps} />
                ) : (
                  <div className="text-center py-8">
                    <h2 className="font-bold text-gray-900 mb-2">
                      Upisi trenutno nisu otvoreni
                    </h2>
                    <p className="text-sm text-gray-500">
                      Prijave za ovaj program zasad nisu otvorene. Javite nam se na{' '}
                      <a
                        href="mailto:prijave@udruga-inovatic.hr"
                        className="text-cyan-600 hover:underline"
                      >
                        prijave@udruga-inovatic.hr
                      </a>{' '}
                      i obavijestit ćemo vas čim krenu.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
