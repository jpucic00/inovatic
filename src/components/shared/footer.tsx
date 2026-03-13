import Link from 'next/link'
import { Mail, Phone, MapPin, Facebook, Instagram } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

const quickLinks = [
  { href: '/programi', label: 'Programi' },
  { href: '/o-nama', label: 'O nama' },
  { href: '/novosti', label: 'Novosti' },
  { href: '/proslave', label: 'Proslave' },
  { href: '/kontakt', label: 'Kontakt' },
  { href: '/upisi', label: 'Upiši se' },
]

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <Logo variant="white" className="mb-4" />
            <p className="text-sm text-gray-400 leading-relaxed mb-5">
              Udruga za robotiku koja potiče djecu na istraživanje, kreativnost
              i razvoj STEM vještina kroz LEGO robotiku. U Splitu od 2014.
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com/udrugainovatic"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-cyan-500 hover:text-white transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/udruga_inovatic"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-cyan-500 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Brze veze</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-cyan-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">Kontakt</h3>
            <div className="space-y-3">
              <a
                href="mailto:info@udruga-inovatic.hr"
                className="flex items-center gap-2.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                info@udruga-inovatic.hr
              </a>
              <a
                href="tel:+385993936993"
                className="flex items-center gap-2.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <Phone className="w-4 h-4 flex-shrink-0" />
                +385 99 393 6993
              </a>
              <div className="flex items-start gap-2.5 text-sm text-gray-400">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>Velebitska 32, Split</p>
                  <p>Ruđera Boškovića 33, Split</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Udruga za robotiku &quot;Inovatic&quot;. Sva prava pridržana.</p>
          <p>OIB: 83709136328</p>
        </div>
      </div>
    </footer>
  )
}
