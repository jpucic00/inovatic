import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import {
  getTeacher,
  getAssignableGroupsForTeacher,
} from '@/actions/admin/teacher'
import { EditTeacherDialog } from '@/components/admin/teachers/edit-teacher-dialog'
import { ResetPasswordButton } from '@/components/admin/teachers/reset-password-button'
import { DeleteTeacherDialog } from '@/components/admin/teachers/delete-teacher-dialog'
import { TeacherAssignmentPanel } from '@/components/admin/teachers/teacher-assignment-panel'
import { CopyTeacherCredentials } from '@/components/admin/teachers/copy-teacher-credentials'

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
  const [teacher, assignableGroups] = await Promise.all([
    getTeacher(id),
    getAssignableGroupsForTeacher(id),
  ])

  if (!teacher) notFound()

  const fullName = `${teacher.firstName} ${teacher.lastName}`

  return (
    <div className="max-w-3xl">
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
          <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Račun kreiran{' '}
            {teacher.createdAt.toLocaleDateString('hr-HR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </p>
        </div>
        <EditTeacherDialog
          teacher={{
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            phone: teacher.phone,
          }}
        />
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Kontakt</h2>
        <dl>
          <DetailRow
            label="E-mail"
            value={
              <a
                href={`mailto:${teacher.email}`}
                className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                {teacher.email}
              </a>
            }
          />
          {teacher.phone && (
            <DetailRow
              label="Telefon"
              value={
                <a
                  href={`tel:${teacher.phone}`}
                  className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {teacher.phone}
                </a>
              }
            />
          )}
        </dl>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Pristupni podaci</h2>
          <ResetPasswordButton teacherId={teacher.id} teacherEmail={teacher.email} />
        </div>
        <dl>
          <DetailRow
            label="E-mail za prijavu"
            value={<span className="font-mono">{teacher.email}</span>}
          />
          <DetailRow
            label="Trenutna lozinka"
            value={
              teacher.plainPassword ? (
                <span className="font-mono">{teacher.plainPassword}</span>
              ) : (
                <span className="text-gray-400 italic">
                  Nije dostupna (nastavnik ju je promijenio)
                </span>
              )
            }
          />
        </dl>
        {teacher.plainPassword && (
          <div className="mt-3">
            <CopyTeacherCredentials
              email={teacher.email}
              password={teacher.plainPassword}
            />
          </div>
        )}
      </div>

      {/* Assignments */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <TeacherAssignmentPanel
          teacherId={teacher.id}
          assignments={teacher.teacherAssignments}
          assignableGroups={assignableGroups}
        />
      </div>

      {/* Danger zone */}
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
    </div>
  )
}
