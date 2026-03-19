'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'

const navLinks = [
  { href: '/programi', label: 'Programi' },
  { href: '/o-nama', label: 'O nama' },
  { href: '/novosti', label: 'Novosti' },
  { href: '/proslave', label: 'Proslave' },
  { href: '/kontakt', label: 'Kontakt' },
]

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Logo variant="dark" onClick={() => setIsOpen(false)} />

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  pathname === link.href || pathname.startsWith(link.href + '/')
                    ? 'text-cyan-600 bg-cyan-50'
                    : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA + Login + Mobile toggle */}
          <div className="flex items-center gap-3">
            <Link
              href="/prijava"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-cyan-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Prijava
            </Link>
            <Link
              href="/upisi"
              className="hidden sm:inline-flex items-center px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 transition-colors shadow-sm"
            >
              Upiši se
            </Link>
            <button
              className="md:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? 'Zatvori meni' : 'Otvori meni'}
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu — absolutely positioned so it overlays content */}
      {isOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg">
          <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'py-2.5 px-3 text-sm font-medium rounded-md transition-colors',
                  pathname === link.href || pathname.startsWith(link.href + '/')
                    ? 'text-cyan-600 bg-cyan-50'
                    : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                )}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-gray-100 mt-1 space-y-2">
              <Link
                href="/prijava"
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-cyan-600 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <LogIn className="w-4 h-4" />
                Prijava
              </Link>
              <Link
                href="/upisi"
                className="block py-2.5 text-center bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Upiši se
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
