import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Wrench, BookOpen, Trophy, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getProgramDetail } from '@/actions/admin/program-materials'
import { isArchivedYear } from '@/lib/school-year'
import {
  hasDatedModules,
  hasModules,
  isCompetition,
  isEditableCourse,
  isRadionica,
} from '@/lib/program-kind'
import { ModuleDatesTable } from '@/components/admin/courses/module-dates-table'
import { EnrollmentWindowEditor } from '@/components/admin/courses/enrollment-window-editor'
import { CourseSeasonEditor } from '@/components/admin/courses/course-season-editor'
import { CopyLinkButton } from '@/components/admin/courses/copy-link-button'
import { CourseFormDialog } from '@/components/admin/courses/course-form-dialog'
import { UploadMaterialDialog } from '@/components/material/upload-dialog'
import { StaffMaterialList } from '@/components/material/staff-material-list'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'

export const metadata: Metadata = { title: 'Admin – Program' }

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function ProgramDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()
  const { courseId } = await params

  const detail = await getProgramDetail(courseId)
  const { course, season, moduleDates, courseMaterials, moduleSections, selectedYear } = detail
  const competition = isCompetition(course.kind)
  const radionica = isRadionica(course.kind)
  const editable = !isArchivedYear(selectedYear)

  return (
    <div>
      <Link
        href="/admin/programi"
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na programe
      </Link>

      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {radionica && <Wrench className="w-6 h-6 text-orange-500 shrink-0" />}
            {competition && <Trophy className="w-6 h-6 text-amber-500 shrink-0" />}
            {!radionica && !competition && (
              <BookOpen className="w-6 h-6 text-cyan-600 shrink-0" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          </div>
          {/* Standard SLR programs carry shared catalog copy mirrored on the
              public site — only association-authored programs are editable here
              (updateCourse refuses the rest anyway). */}
          {isEditableCourse(course.kind) && editable && (
            <CourseFormDialog
              course={{
                id: course.id,
                title: course.title,
                description: course.description,
                ageMin: course.ageMin,
                ageMax: course.ageMax,
                price: course.price,
              }}
            />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-gray-500">
          {radionica ? (
            <span className="rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-medium">
              Radionica
            </span>
          ) : competition ? (
            <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium">
              Natjecateljski program
            </span>
          ) : course.level ? (
            <span className="rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 text-xs font-medium">
              {course.level.replace('_', ' ')}
            </span>
          ) : null}
          <span>{course.ageMin}–{course.ageMax} god.</span>
          {course.price != null && (
            <span>
              {course.price} EUR{competition ? ' / mjesec' : ''}
            </span>
          )}
          <Link
            href={radionica ? '/admin/grupe?tab=__radionice__' : `/admin/grupe?tab=${course.id}`}
            className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
          >
            <Users className="w-3.5 h-3.5" />
            {course.groupCount} {course.groupCount >= 2 && course.groupCount <= 4 ? 'grupe' : 'grupa'}
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <CopyLinkButton path={course.signupPath} />
          <span className="text-xs text-gray-400">
            {competition
              ? 'Prijava samo putem ove poveznice — program nije na javnim upisima.'
              : 'Prikazuje samo termine ovog programa, bez obzira na razred djeteta.'}
          </span>
        </div>
        {/* The public /radionice page renders this copy — show it here so the
            admin sees what the Uredi dialog changes. */}
        {isEditableCourse(course.kind) && (
          <p className="text-sm text-gray-600 mt-3 max-w-3xl whitespace-pre-line">
            {course.description}
          </p>
        )}
      </header>

      {!editable && <ArchivedYearBanner year={selectedYear} />}

      <section className="mb-10">
        <EnrollmentWindowEditor
          courseId={course.id}
          schoolYear={selectedYear}
          enrollmentStart={course.enrollmentStart}
          enrollmentEnd={course.enrollmentEnd}
          editable={editable}
        />
      </section>

      {competition && (
        <section className="mb-10">
          <CourseSeasonEditor
            courseId={course.id}
            schoolYear={selectedYear}
            startDate={season.startDate}
            endDate={season.endDate}
            editable={editable}
          />
        </section>
      )}

      {hasDatedModules(course.kind) && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Moduli i datumi
          </h2>
          <ModuleDatesTable
            hideHeader
            selectedYear={selectedYear}
            editable={editable}
            course={{
              id: course.id,
              title: course.title,
              level: course.level,
              ageMin: course.ageMin,
              ageMax: course.ageMax,
              equipment: course.equipment,
              groupCount: course.groupCount,
            }}
            modules={moduleDates}
          />
        </section>
      )}

      <section className="mb-10">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Materijali za cijeli program
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Vidljivo u svim grupama ovog programa
              {hasModules(course.kind)
                ? competition
                  ? ', bez obzira na natjecanje.'
                  : ', bez obzira na modul.'
                : '.'}
            </p>
          </div>
          <UploadMaterialDialog
            target={{ scope: 'COURSE', courseId: course.id }}
            label="Dodaj"
            scopeLabel="Vidljivo u svim grupama ovog programa."
          />
        </div>
        <StaffMaterialList
          rows={courseMaterials}
          emptyLabel="Još nema materijala za cijeli program."
        />
      </section>

      {hasModules(course.kind) &&
        moduleSections.map((section) => (
          <section key={section.module.id} className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {section.module.title}
              </h2>
              <UploadMaterialDialog
                target={{ scope: 'MODULE', moduleId: section.module.id }}
                label="Dodaj"
                scopeLabel={
                  competition
                    ? `Vidljivo svim grupama natjecateljskog programa, pod „${section.module.title}".`
                    : `Vidljivo svim grupama na modulu „${section.module.title}".`
                }
              />
            </div>
            <StaffMaterialList
              rows={section.materials}
              emptyLabel="Još nema materijala za ovaj modul."
            />
          </section>
        ))}
    </div>
  )
}
