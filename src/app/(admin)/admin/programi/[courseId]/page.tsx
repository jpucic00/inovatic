import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Wrench, BookOpen, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getProgramDetail } from '@/actions/admin/program-materials'
import { isArchivedYear } from '@/lib/school-year'
import { ModuleDatesTable } from '@/components/admin/courses/module-dates-table'
import { EnrollmentWindowEditor } from '@/components/admin/courses/enrollment-window-editor'
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
  const { course, moduleDates, courseMaterials, moduleSections, selectedYear } = detail
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
        <div className="flex items-center gap-2.5">
          {course.isCustom ? (
            <Wrench className="w-6 h-6 text-orange-500 shrink-0" />
          ) : (
            <BookOpen className="w-6 h-6 text-cyan-600 shrink-0" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-gray-500">
          {course.isCustom ? (
            <span className="rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs font-medium">
              Radionica
            </span>
          ) : course.level ? (
            <span className="rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 text-xs font-medium">
              {course.level.replace('_', ' ')}
            </span>
          ) : null}
          <span>{course.ageMin}–{course.ageMax} god.</span>
          <Link
            href={course.isCustom ? '/admin/grupe?tab=__radionice__' : `/admin/grupe?tab=${course.id}`}
            className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
          >
            <Users className="w-3.5 h-3.5" />
            {course.groupCount} {course.groupCount >= 2 && course.groupCount <= 4 ? 'grupe' : 'grupa'}
          </Link>
        </div>
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

      {!course.isCustom && (
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
              {course.isCustom ? '.' : ', bez obzira na modul.'}
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

      {!course.isCustom &&
        moduleSections.map((section) => (
          <section key={section.module.id} className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {section.module.title}
              </h2>
              <UploadMaterialDialog
                target={{ scope: 'MODULE', moduleId: section.module.id }}
                label="Dodaj"
                scopeLabel={`Vidljivo svim grupama na modulu „${section.module.title}".`}
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
