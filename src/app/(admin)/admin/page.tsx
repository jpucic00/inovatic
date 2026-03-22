import type { Metadata } from 'next'
import Link from 'next/link'
import { Inbox, Users, CalendarDays, GraduationCap } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import { StatCard } from '@/components/admin/stat-card'
import { InquiryStatusBadge } from '@/components/admin/inquiries/inquiry-status-badge'

export const metadata: Metadata = {
  title: 'Admin – Nadzorna ploča',
}

export default async function AdminDashboard() {
  await requireAdmin()

  const [
    inquiryStats,
    totalStudents,
    totalActiveGroups,
    recentInquiries,
  ] = await Promise.all([
    db.inquiry.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    db.user.count({ where: { role: 'STUDENT' } }),
    db.scheduledGroup.count({ where: { isActive: true } }),
    db.inquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        parentName: true,
        childFirstName: true,
        childLastName: true,
        status: true,
        createdAt: true,
      },
    }),
  ])

  const statusCount = Object.fromEntries(
    inquiryStats.map((s) => [s.status, s._count.status]),
  )

  const totalInquiries = inquiryStats.reduce((sum, s) => sum + s._count.status, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nadzorna ploča</h1>
      <p className="text-gray-500 mb-8">Pregled aktivnosti Inovatic administracije.</p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Novi upiti"
          value={statusCount['NEW'] ?? 0}
          description="Čekaju obradu"
          icon={Inbox}
          color="amber"
        />
        <StatCard
          label="Raspored poslan"
          value={statusCount['SCHEDULE_SENT'] ?? 0}
          description="Čekaju potvrdu"
          icon={CalendarDays}
          color="blue"
        />
        <StatCard
          label="Potvrđeni"
          value={(statusCount['CONFIRMED'] ?? 0) + (statusCount['ACCOUNT_CREATED'] ?? 0)}
          description="Potvrđeni + račun stvoren"
          icon={GraduationCap}
          color="green"
        />
        <StatCard
          label="Učenici"
          value={totalStudents}
          description={`${totalActiveGroups} aktivnih grupa`}
          icon={Users}
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent inquiries */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Nedavni upiti</h2>
            <Link
              href="/admin/upiti"
              className="text-sm text-cyan-600 hover:text-cyan-800 transition-colors"
            >
              Svi upiti →
            </Link>
          </div>

          <div className="bg-white rounded-xl border divide-y">
            {recentInquiries.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 italic text-center">Nema upita.</p>
            ) : (
              recentInquiries.map((inquiry) => (
                <Link
                  key={inquiry.id}
                  href={`/admin/upiti/${inquiry.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {inquiry.childFirstName} {inquiry.childLastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{inquiry.parentName}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <InquiryStatusBadge status={inquiry.status} />
                    <span className="text-xs text-gray-400">
                      {inquiry.createdAt.toLocaleDateString('hr-HR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Summary by status */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Upiti po statusu</h2>
          <div className="bg-white rounded-xl border p-5 space-y-3">
            {[
              { status: 'NEW', label: 'Novi' },
              { status: 'SCHEDULE_SENT', label: 'Raspored poslan' },
              { status: 'CONFIRMED', label: 'Potvrđeni' },
              { status: 'ACCOUNT_CREATED', label: 'Račun stvoren' },
              { status: 'DECLINED', label: 'Odbijeni' },
            ].map(({ status, label }) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {statusCount[status] ?? 0}
                </span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Ukupno</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">{totalInquiries}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
