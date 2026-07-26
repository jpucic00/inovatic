import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import {
  getTeacher,
  getAssignableGroupsForTeacher,
} from '@/actions/admin/teacher'
import { getTeacherWorkReport } from '@/actions/admin/teacher-work'
import { EditTeacherDialog } from '@/components/admin/teachers/edit-teacher-dialog'
import { ResetPasswordButton } from '@/components/admin/teachers/reset-password-button'
import { DeleteTeacherDialog } from '@/components/admin/teachers/delete-teacher-dialog'
import { TeacherAssignmentPanel } from '@/components/admin/teachers/teacher-assignment-panel'
import { TeacherWorkReportCard } from '@/components/admin/teachers/teacher-work-report-card'
import { CopyButton } from '@/components/shared/copy-button'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin – Nastavnik' }

interface PageProps {
  params: Promise<{ id: string }>
}

function DetailRow({
  label,
  value,
}: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  )
}

export default async function TeacherDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [teacher, assignableGroups, workReport] = await Promise.all([
    getTeacher(id),
    getAssignableGroupsForTeacher(id),
    getTeacherWorkReport(id),
  ])

  if (!teacher) notFound()

  const fullName = `${teacher.firstName} ${teacher.lastName}`
  // Slavica's case: a city ADMIN who also teaches. Her account is managed as an
  // admin, so the TEACHER-only actions (edit, credentials, delete) stay hidden —
  // they are role-scoped server-side and would be dead controls here.
  const isAdminAccount = teacher.role === 'ADMIN'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/nastavnici"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag na nastavnike
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
            {isAdminAccount && (
              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                Administrator
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Račun kreiran{' '}
            {formatDate(teacher.createdAt)}
          </p>
        </div>
        {!isAdminAccount && (
          <EditTeacherDialog
            teacher={{
              id: teacher.id,
              firstName: teacher.firstName,
              lastName: teacher.lastName,
              email: teacher.email,
              phone: teacher.phone,
            }}
          />
        )}
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Kontakt</h2>
        <dl>
          <DetailRow
            label="E-mail"
            value={
              <div className="flex items-center gap-2">
                <a
                  href={`mailto:${teacher.email}`}
                  className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {teacher.email}
                </a>
                <CopyButton value={teacher.email} label="e-mail" />
              </div>
            }
          />
          {teacher.phone && (
            <DetailRow
              label="Telefon"
              value={
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${teacher.phone}`}
                    className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {teacher.phone}
                  </a>
                  <CopyButton value={teacher.phone} label="telefon" />
                </div>
              }
            />
          )}
        </dl>
      </div>

      {/* Credentials */}
      {!isAdminAccount && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Pristupni podaci</h2>
            <ResetPasswordButton teacherId={teacher.id} teacherEmail={teacher.email} />
          </div>
          <dl>
            <DetailRow
              label="E-mail za prijavu"
              value={
                <div className="flex items-center gap-2">
                  <span className="font-mono">{teacher.email}</span>
                  <CopyButton value={teacher.email} label="e-mail za prijavu" />
                </div>
              }
            />
            <DetailRow
              label="Trenutna lozinka"
              value={
                teacher.plainPassword ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{teacher.plainPassword}</span>
                    <CopyButton value={teacher.plainPassword} label="lozinku" />
                  </div>
                ) : (
                  <span className="text-gray-400 italic">
                    Nije dostupna (nastavnik ju je promijenio)
                  </span>
                )
              }
            />
          </dl>
        </div>
      )}

      {/* Assignments */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <TeacherAssignmentPanel
          teacherId={teacher.id}
          assignments={teacher.teacherAssignments}
          assignableGroups={assignableGroups}
        />
      </div>

      {/* Work report */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <TeacherWorkReportCard report={workReport} />
      </div>

      {/* Danger zone */}
      {!isAdminAccount && (
        <div className="border border-red-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-red-700 mb-2">Opasna zona</h2>
          <p className="text-sm text-gray-500 mb-4">
            Trajno brisanje računa nastavnika i svih njegovih dodjela grupama. Ova
            radnja se ne može poništiti.
          </p>
          <DeleteTeacherDialog
            teacherId={teacher.id}
            teacherName={fullName}
            assignmentCount={teacher.teacherAssignments.length}
          />
        </div>
      )}
    </div>
  )
}
