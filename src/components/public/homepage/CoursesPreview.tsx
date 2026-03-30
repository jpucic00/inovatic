import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { courses } from '@/lib/courses-data'

export function CoursesPreview() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-500 mb-3">Jedinstveni kurikulum</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            <span className="text-cyan-500">Svijet LEGO Robotike</span>
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-lg">
            Naš jedinstveni kurikulum strukturiran je u četiri razine – od prvih koraka u mehanici do simulacije industrijskih sustava. Svaka razina prilagođena je dobi i predznanju djeteta.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {courses.map((course) => (
            <Link
              key={course.slug}
              href={`/programi/${course.slug}`}
              className="group block rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <div className="h-44 relative overflow-hidden">
                <Image
                  src={course.coverImage}
                  alt={course.title}
                  fill
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${course.gradient} opacity-70`} />
                <div className="absolute inset-0 flex flex-col items-center justify-center relative z-10">
                  <span className="text-5xl font-extrabold text-white/90 tracking-tight drop-shadow">
                    {course.title.split(' ').pop()}
                  </span>
                  <span className="text-xs text-white/90 font-semibold mt-1 drop-shadow">
                    {course.ageMin}–{course.ageMax} godina
                  </span>
                </div>
              </div>
              <div className="p-5 bg-white">
                <h3 className="font-bold text-gray-900 mb-1 text-sm">{course.title}</h3>
                <p className="text-xs text-gray-500 mb-0.5">{course.equipment} · {course.tools}</p>
                <p className="text-xs text-cyan-500 font-semibold mt-3 group-hover:underline flex items-center gap-1">
                  Saznaj više <ArrowRight className="w-3 h-3" />
                </p>
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
