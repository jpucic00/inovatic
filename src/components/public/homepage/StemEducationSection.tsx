import Link from 'next/link'
import { ArrowRight, ClipboardList, Compass, GraduationCap, Rocket } from 'lucide-react'

const highlights = [
  { icon: GraduationCap, label: 'Osnovna edukacija mentora' },
  { icon: Rocket, label: 'Napredna edukacija i razvoj kompetencija' },
  { icon: Compass, label: 'Savjetovanje pri odabiru STEM opreme' },
  { icon: ClipboardList, label: 'Izrada radionica i kurikuluma' },
]

/**
 * B2B teaser for the mentor-education service — the only entry point to
 * /stem-edukacija from the homepage. Sits between the competitions band and
 * Lokacije, where the audience shifts from parents to institutions.
 */
export function StemEducationSection() {
  return (
    <section className="py-16 px-4 bg-slate-50 border-y border-slate-100">
      <div className="container mx-auto max-w-5xl grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center">
        <div>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">
            Za škole i ustanove
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-[34px] font-extrabold text-gray-900 leading-tight mb-4">
            STEM edukacija za učitelje, nastavnike i mentore
          </h2>
          <p className="text-gray-500 leading-relaxed mb-6">
            Oprema je tek početak. Educiramo mentore, savjetujemo pri odabiru robotičkih i STEM
            setova te izrađujemo radionice i kurikulume – u vašoj ustanovi ili u našim prostorima.
          </p>
          <Link
            href="/stem-edukacija"
            className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-xl hover:bg-yellow-300 transition-colors shadow-md text-sm"
          >
            Saznajte više i zatražite ponudu <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          {highlights.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-[19px] h-[19px] text-cyan-500" strokeWidth={2} />
              </span>
              <span className="text-[15px] text-gray-700 font-medium">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
