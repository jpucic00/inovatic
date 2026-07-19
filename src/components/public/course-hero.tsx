import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Course } from '@/lib/courses-data'
import { SmoothScrollLink } from '@/components/shared/smooth-scroll-link'

/** Glass "key fact" pill overlaid on the hero banner. */
function GlassChip({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/25 bg-[rgba(10,10,30,0.35)] px-[11px] py-1 text-[11.5px] font-semibold text-white backdrop-blur-[4px] min-[480px]:px-3 min-[480px]:py-[5px] min-[480px]:text-xs">
      {children}
    </span>
  )
}

/** Middot separator for the secondary facts row. */
function Sep() {
  return <span className="mx-2 text-gray-300 min-[480px]:mx-2.5">·</span>
}

/**
 * Program detail hero — layered assets (gradient background + transparent robot
 * cutout) so each layer positions/scales independently per breakpoint.
 * < 480px: text centered on top, robot centered at the banner bottom, CTAs stacked.
 * ≥ 480px: text left-aligned, robot vertically centered on the right, CTAs inline.
 */
export function CourseHero({ course, level }: { readonly course: Course; readonly level: number }) {
  const age = `${course.ageMin}–${course.ageMax} godina`
  const duration = `${course.sessionDuration} min · 1× tjedno`
  const groupSize = `do ${course.groupSize} polaznika`
  const hours = `${course.hours} sati godišnje`

  return (
    <section className="bg-gray-50 pb-8 pt-8">
      <div className="mx-auto max-w-[768px] px-5 md:px-6">
        <Link
          href="/programi"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Svi programi
        </Link>

        {/* Layered banner: background image + robot cutout + text overlay. */}
        <div className="relative flex h-[430px] overflow-hidden rounded-[14px] min-[480px]:h-auto min-[480px]:min-h-[280px] min-[480px]:rounded-2xl">
          {/* Both hero layers are pre-optimized static WebPs, so serve them directly
              (`unoptimized`) — running them back through /_next/image only added an
              on-demand optimization delay that made the robot pop in after the bg. */}
          <Image
            src={course.heroBg}
            alt=""
            fill
            priority
            unoptimized
            sizes="(max-width: 767px) 100vw, 768px"
            className="object-cover"
          />
          <Image
            src={course.heroRobot.src}
            alt=""
            width={course.heroRobot.width}
            height={course.heroRobot.height}
            priority
            unoptimized
            sizes="(max-width: 479px) 78vw, 360px"
            className="pointer-events-none absolute bottom-[18px] left-1/2 h-auto max-h-[42%] w-auto max-w-[78%] -translate-x-1/2 object-contain [filter:drop-shadow(0_12px_20px_rgba(10,10,30,0.3))] min-[480px]:bottom-auto min-[480px]:left-auto min-[480px]:right-6 min-[480px]:top-1/2 min-[480px]:max-h-[calc(100%-44px)] min-[480px]:max-w-[42%] min-[480px]:-translate-y-1/2 min-[480px]:translate-x-0 min-[480px]:[filter:drop-shadow(0_14px_22px_rgba(10,10,30,0.3))]"
          />
          <div className="relative w-full px-5 pt-[26px] text-center min-[480px]:w-auto min-[480px]:max-w-[400px] min-[480px]:px-[30px] min-[480px]:pb-8 min-[480px]:pt-[34px] min-[480px]:text-left">
            <span className="inline-block rounded-full bg-yellow-400 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-900 min-[480px]:text-[10.5px]">
              Razina {level} od 4
            </span>
            <h1 className="mt-2.5 text-2xl font-extrabold leading-[1.15] text-white [text-shadow:0_2px_12px_rgba(10,10,30,0.45)] min-[480px]:mt-3 min-[480px]:text-[28px]">
              {course.title}
            </h1>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-white/[0.94] [text-shadow:0_1px_8px_rgba(10,10,30,0.5)] min-[480px]:text-[13.5px]">
              {course.subtitle}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 min-[480px]:mt-4 min-[480px]:justify-start min-[480px]:gap-2">
              <GlassChip>{age}</GlassChip>
              <GlassChip>{duration}</GlassChip>
              {/* Group size is a chip on desktop only; on mobile it moves to the facts row below. */}
              <span className="hidden min-[480px]:contents">
                <GlassChip>{groupSize}</GlassChip>
              </span>
            </div>
          </div>
        </div>

        {/* Secondary facts — mobile also lists the group size (dropped from the chips above). */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-y-1 text-center text-[12.5px] text-gray-600 min-[480px]:mt-3.5 min-[480px]:justify-start min-[480px]:text-left min-[480px]:text-[13px]">
          <span className="font-semibold text-gray-900">{course.equipment}</span>
          <Sep />
          <span>{course.tools}</span>
          <span className="contents min-[480px]:hidden">
            <Sep />
            <span>{groupSize}</span>
          </span>
          <Sep />
          <span>{hours}</span>
          <Sep />
          <span>{course.season}</span>
        </div>

        {/* CTAs — the price link shows at every size; the primary "upit" button is hidden on
            mobile, where the fixed bottom bar (CourseStickyCta) already carries it. */}
        <div className="mt-3 flex flex-col gap-2 min-[480px]:mt-3.5 min-[480px]:flex-row min-[480px]:gap-2.5">
          <Link
            href="/upisi"
            className="hidden rounded-xl bg-cyan-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-600 min-[480px]:block"
          >
            Pošalji upit za upis
          </Link>
          <SmoothScrollLink
            targetId="cijene"
            className="rounded-xl border border-cyan-200 bg-white px-6 py-3 text-center text-sm font-semibold text-cyan-600 transition-colors hover:bg-cyan-50"
          >
            Pogledaj cijene ↓
          </SmoothScrollLink>
        </div>
      </div>
    </section>
  )
}
