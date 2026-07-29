import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, ChevronRight, Trophy, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getCourses } from '@/actions/admin/course'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { isArchivedYear } from '@/lib/school-year'
import { isCompetition, isRadionica } from '@/lib/program-kind'
import { signupPathForSlug } from '@/lib/signup-links'
import { CourseTable } from '@/components/admin/courses/course-table'
import { CourseFormDialog } from '@/components/admin/courses/course-form-dialog'
import { CopyLinkButton } from '@/components/admin/courses/copy-link-button'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'

export const metadata: Metadata = { title: 'Admin – Programi' }

type ProgramCourse = Awaited<ReturnType<typeof getCourses>>[number]

/**
 * One program row. Every program carries a copy button for its own signup link
 * (`/upisi/<slug>`) — the link that shows only this program's termini and
 * ignores the public grade→program rule, so a returning student can be invited
 * straight into the next level.
 */
function ProgramRow({
  course,
  icon,
}: Readonly<{ course: ProgramCourse; icon: React.ReactNode }>) {
  const groupCount = course._count.scheduledGroups
  return (
    <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-5 hover:border-cyan-400 hover:shadow-sm transition group">
      {icon}
      <Link href={`/admin/programi/${course.id}`} className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-gray-900 truncate">{course.title}</h3>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-400">
          {course.level && <span>{course.level.replace('_', ' ')}</span>}
          <span>
            {course.ageMin}–{course.ageMax} god.
          </span>
          <span className="text-gray-300">|</span>
          <span>
            {course.modules.length}{' '}
            {isCompetition(course.kind) ? 'natjecanja' : 'modula'}
          </span>
        </div>
      </Link>
      <CopyLinkButton path={signupPathForSlug(course.slug)} />
      <Link
        href={`/admin/programi/${course.id}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-full shrink-0"
      >
        <Users className="w-3.5 h-3.5" />
        {groupCount} {groupCount >= 2 && groupCount <= 4 ? 'grupe' : 'grupa'}
      </Link>
      <Link href={`/admin/programi/${course.id}`} aria-label={course.title}>
        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-cyan-500 transition-colors shrink-0" />
      </Link>
    </div>
  )
}

export default async function CoursesPage() {
  await requireAdmin()

  const selectedYear = await getSelectedSchoolYear()
  const editable = !isArchivedYear(selectedYear)

  const courses = await getCourses()

  const standard = courses.filter(
    (c) => !isRadionica(c.kind) && !isCompetition(c.kind),
  )
  const competition = courses.filter((c) => isCompetition(c.kind))
  const custom = courses.filter((c) => isRadionica(c.kind))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Programi</h1>
        <p className="text-gray-500 text-sm mt-1">
          {standard.length} standardnih + {competition.length} natjecateljskih +{' '}
          {custom.length} radionica · {selectedYear}. Otvorite program za module, datume i
          materijale.
        </p>
      </div>

      {!editable && <ArchivedYearBanner year={selectedYear} />}

      {standard.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Standardni programi (SLR 1–4)
          </h2>
          <div className="space-y-3">
            {standard.map((course) => (
              <ProgramRow
                key={course.id}
                course={course}
                icon={<BookOpen className="w-6 h-6 text-cyan-600 shrink-0" />}
              />
            ))}
          </div>
        </div>
      )}

      {competition.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Natjecateljski program
          </h2>
          <div className="space-y-3">
            {competition.map((course) => (
              <ProgramRow
                key={course.id}
                course={course}
                icon={<Trophy className="w-6 h-6 text-amber-500 shrink-0" />}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Prijava je samo putem poveznice — program se ne prikazuje na javnim upisima.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Radionice
          </h2>
          {editable && <CourseFormDialog />}
        </div>
        {custom.length > 0 ? (
          <CourseTable data={custom} editable={editable} />
        ) : (
          <p className="text-sm text-gray-400 italic py-4">Nema radionica.</p>
        )}
      </div>
    </div>
  )
}
