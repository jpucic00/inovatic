import { Toaster } from 'sonner'
import { requireAdmin } from '@/lib/auth-guard'
import { AdminDesktopSidebar, AdminMobileNav } from '@/components/admin/admin-mobile-nav'

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdmin()
  const userName = session.user.name ?? session.user.email ?? 'Admin'

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminMobileNav userName={userName} />

      <div className="flex">
        <AdminDesktopSidebar userName={userName} />

        <div className="flex-1 flex flex-col">
          <main className="flex-1 p-4 pt-18 lg:p-8 lg:pt-8">{children}</main>
        </div>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  )
}
