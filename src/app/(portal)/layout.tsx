import Link from 'next/link'
import { Bot, LogOut, BookOpen, User } from 'lucide-react'

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal navbar */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-cyan-500 rounded-md flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-800">
              <span className="text-cyan-500">Ino</span>vatic Portal
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/portal" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              Materijali
            </Link>
            <Link href="/portal/profil" className="text-sm text-gray-500 hover:text-cyan-500 flex items-center gap-1.5">
              <User className="w-4 h-4" />
              Profil
            </Link>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5">
                <LogOut className="w-4 h-4" />
                Odjava
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
