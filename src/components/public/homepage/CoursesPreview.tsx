import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { courses } from '@/lib/courses-data'

export function CoursesPreview() {
  return (
    <section className="px-6 py-14 lg:px-8 lg:py-20 bg-gray-50">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-10 lg:mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-[0.15em] text-cyan-500 mb-3">Jedinstveni kurikulum</span>
          <h2 className="text-[28px] lg:text-4xl font-extrabold text-gray-900 mb-4">
            Svijet <span className="text-cyan-500">LEGO</span> Robotike
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base lg:text-lg leading-[1.6]">
            Naš jedinstveni kurikulum strukturiran je u četiri razine – od prvih koraka u mehanici do simulacije industrijskih sustava. Svaka razina prilagođena je dobi i predznanju djeteta.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          {courses.map((course) => (
            <Link
              key={course.slug}
              href={`/programi/${course.slug}`}
              className="group block rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <div className="h-40 lg:h-[150px] relative overflow-hidden">
                <Image
                  src={course.coverImage}
                  alt={course.title}
                  fill
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>
              <div className="flex items-start gap-3.5 px-5 py-[18px] lg:p-4">
                <div className="flex-none flex items-center justify-center w-10 h-10 lg:w-9 lg:h-9 rounded-xl bg-yellow-400 text-gray-900 text-xl lg:text-lg font-extrabold">
                  {course.title.split(' ').pop()}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-0.5 text-[15px] lg:text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-500">{course.ageMin}–{course.ageMax} godina · {course.equipment}</p>
                  <p className="text-xs text-cyan-500 font-semibold mt-2 group-hover:underline flex items-center gap-1">
                    Saznaj više <ArrowRight className="w-3 h-3" />
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link
            href="/programi"
            className="inline-flex items-center gap-2 text-cyan-600 font-semibold hover:underline"
          >
            Usporedi sve programe <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
