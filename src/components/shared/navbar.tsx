'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X, LogIn, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'
import { CITIES } from '@/lib/locations'

type NavChild = { href: string; label: string }
type NavItem = { href: string; label: string; children?: NavChild[] }

const navLinks: NavItem[] = [
  { href: '/programi', label: 'Programi' },
  { href: '/natjecanja', label: 'Natjecanja' },
  { href: '/proslave', label: 'Proslave' },
  { href: '/novosti', label: 'Novosti' },
  { href: '/o-nama', label: 'O nama' },
  { href: '/donacije', label: 'Donacije' },
  {
    href: '/lokacije',
    label: 'Lokacije',
    children: CITIES.map((c) => ({ href: `/lokacije/${c.slug}`, label: c.label })),
  },
]

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Logo variant="dark" onClick={() => setIsOpen(false)} />

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) =>
              link.children ? (
                <div key={link.href} className="relative group">
                  <Link
                    href={link.href}
                    className={cn(
                      'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      isActive(link.href)
                        ? 'text-cyan-600 bg-cyan-50'
                        : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                    )}
                  >
                    {link.label}
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                  </Link>
                  {/* Submenu — shown on hover and keyboard focus (opacity/pointer-events keeps
                      children in the tab order so focus-within can reveal it). */}
                  <div className="absolute left-0 top-full w-48 pt-2 opacity-0 translate-y-1 pointer-events-none transition duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto">
                    <div className="rounded-xl border border-gray-100 bg-white shadow-lg p-1.5">
                      <Link
                        href={link.href}
                        className="block px-3 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-cyan-600 hover:bg-gray-50 transition-colors"
                      >
                        Sve lokacije
                      </Link>
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'block px-3 py-2 text-sm font-medium rounded-md transition-colors',
                            isActive(child.href)
                              ? 'text-cyan-600 bg-cyan-50'
                              : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive(link.href)
                      ? 'text-cyan-600 bg-cyan-50'
                      : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                  )}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>

          {/* CTA + Login + Mobile toggle */}
          <div className="flex items-center gap-3">
            {/* Between md and lg the full nav sits alongside this cluster, and the
                long label overflows the bar — drop to the icon alone in that band. */}
            <Link
              href="/portal"
              aria-label="Polaznički portal"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-cyan-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span className="md:hidden lg:inline">Polaznički portal</span>
            </Link>
            <Link
              href="/prijava"
              className="hidden sm:inline-flex items-center px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 transition-colors shadow-sm"
            >
              Prijavi se
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
            {navLinks.map((link) =>
              link.children ? (
                <div key={link.href} className="py-1">
                  <Link
                    href={link.href}
                    className={cn(
                      'block py-2.5 px-3 text-sm font-medium rounded-md transition-colors',
                      isActive(link.href) ? 'text-cyan-600 bg-cyan-50' : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                  <div className="mt-1 ml-3 pl-3 border-l border-gray-100 flex flex-col gap-1">
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'py-2 px-3 text-sm rounded-md transition-colors',
                          isActive(child.href) ? 'text-cyan-600 bg-cyan-50 font-medium' : 'text-gray-500 hover:text-cyan-600 hover:bg-gray-50',
                        )}
                        onClick={() => setIsOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'py-2.5 px-3 text-sm font-medium rounded-md transition-colors',
                    isActive(link.href) ? 'text-cyan-600 bg-cyan-50' : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50',
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ),
            )}
            <div className="pt-2 border-t border-gray-100 mt-1 space-y-2">
              <Link
                href="/portal"
                className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-cyan-600 rounded-md transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <LogIn className="w-4 h-4" />
                Polaznički portal
              </Link>
              <Link
                href="/prijava"
                className="block py-2.5 text-center bg-cyan-500 text-white text-sm font-semibold rounded-lg hover:bg-cyan-600 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Prijavi se
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
