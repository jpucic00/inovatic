const testimonials = [
  {
    quote: 'STEM je prije svega način razmišljanja i pristup odgoju i obrazovanju!',
    name: 'Romana Ban',
    role: 'Split Tech City',
  },
  {
    quote: 'Djeca uključena u STEM aktivnosti imaju drugačiji način učenja. Ona uče s razumijevanjem, ne uče napamet.',
    name: 'Dijana Barić Perić',
    role: 'Tinker Labs Split',
  },
  {
    quote: 'STEM obrazovanje pruža mladima lakše razumijevanje sadašnjeg i budućeg svijeta te pozitivno utječe na njihovu prilagodbu u današnjem društvu.',
    name: 'Jozo Pivac',
    role: 'Udruga Inovatic',
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-16 px-4 bg-gradient-to-br from-cyan-50 via-white to-yellow-50">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="flex flex-col bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all">
              <span className="text-5xl font-serif text-cyan-400 leading-none mb-3 select-none">&ldquo;</span>
              <p className="text-gray-700 text-sm leading-relaxed flex-1 italic mb-5">{t.quote}</p>
              <div className="pt-4 border-t border-gray-100">
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-cyan-600">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
