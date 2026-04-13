import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CheckCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { getActivePrograms } from '@/actions/public/programs'
import { InquiryForm } from '@/components/public/inquiry-form'

interface Props {
  params: Promise<{ slug: string }>
}

async function getWorkshop(slug: string) {
  return db.course.findFirst({
    where: { slug, isCustom: true },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      ageMin: true,
      ageMax: true,
      price: true,
    },
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const workshop = await getWorkshop(slug)
  if (!workshop) return { title: 'Radionica nije pronađena' }

  return {
    title: workshop.title,
    description: workshop.description,
    openGraph: {
      title: `${workshop.title} | Inovatic Split`,
      description: workshop.description,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${workshop.title} – Inovatic Split` }],
    },
  }
}

const perks = [
  'Bez obveza – samo šaljete upit',
  'Kontaktiramo vas u roku 48h',
  'Objašnjavamo sve detalje',
]

const perkIconColors = ['text-cyan-500', 'text-yellow-400', 'text-emerald-400']

export default async function WorkshopPage({ params }: Readonly<Props>) {
  const { slug } = await params
  const [workshop, allPrograms] = await Promise.all([
    getWorkshop(slug),
    getActivePrograms(),
  ])

  if (!workshop) notFound()

  // Only pass this workshop's program to the form (pre-selected, no dropdown needed)
  const workshopPrograms = allPrograms.filter((p) => p.id === workshop.id)

  return (
    <>
      {/* Header */}
      <section className="relative bg-gradient-to-br from-orange-50 via-white to-yellow-50 py-12 px-4 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-orange-300 rounded-full blur-3xl opacity-30 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-yellow-300 rounded-full blur-3xl opacity-30 pointer-events-none" />
        <div className="container mx-auto max-w-3xl relative">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Radionica</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{workshop.title}</h1>
          <p className="text-gray-600 text-lg max-w-2xl">{workshop.description}</p>

          <div className="flex flex-wrap gap-4 mt-6">
            <div className="bg-white rounded-xl px-4 py-3 border border-orange-100 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Dob</p>
              <p className="text-lg font-bold text-gray-900">{workshop.ageMin}–{workshop.ageMax} godina</p>
            </div>
            {workshop.price != null && (
              <div className="bg-white rounded-xl px-4 py-3 border border-orange-100 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Cijena</p>
                <p className="text-lg font-bold text-gray-900">{workshop.price} €</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Form section */}
      <section className="py-12 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-5 gap-10">
            {/* Sidebar */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100">
                <h3 className="font-bold text-gray-900 mb-3 text-sm">Prednosti</h3>
                <div className="space-y-2">
                  {perks.map((perk, i) => (
                    <div key={perk} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 flex-shrink-0 ${perkIconColors[i]}`} />
                      <span className="text-sm text-gray-600">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-100 text-sm text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Imate pitanja?</p>
                <a href="mailto:prijave@udruga-inovatic.hr" className="text-cyan-500 hover:underline block">
                  prijave@udruga-inovatic.hr
                </a>
                <a href="tel:+385993936993" className="text-cyan-500 hover:underline block">
                  +385 99 393 6993
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl border border-orange-100 ring-1 ring-orange-50 shadow-sm p-7">
                <InquiryForm programs={workshopPrograms} preselectedCourseId={workshop.id} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
