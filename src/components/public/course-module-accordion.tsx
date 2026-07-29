'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'

interface AccordionModule {
  readonly title: string
  readonly description: string
  readonly image: string
}

interface CourseModuleAccordionProps {
  readonly modules: readonly AccordionModule[]
  /** Tailwind gradient class pair from the course (e.g. `from-cyan-400 to-cyan-600`). */
  readonly gradient: string
}

/**
 * Program modules rendered as accordions. All modules collapsed by default;
 * clicking a header toggles that module (multiple may be open, each independent).
 * Desktop headers show a thumbnail + one-line lead; mobile headers are badge +
 * title only and render the module image full-width inside the open body.
 *
 * Both image boxes are 4:3 to match the module art (see CLAUDE.md), so
 * `object-cover` has nothing to crop. The thumbnail was 64x52 until 2026-07-30
 * and silently ate 7.7% of every program's width.
 */
export function CourseModuleAccordion({ modules, gradient }: CourseModuleAccordionProps) {
  const [openModules, setOpenModules] = useState<ReadonlySet<number>>(() => new Set<number>())

  const toggle = (index: number) => {
    setOpenModules((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {modules.map((mod, i) => {
        const isOpen = openModules.has(i)
        const paras = mod.description.split('\n').filter(Boolean)
        const lead = paras[0]
        return (
          <div key={mod.title} className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left md:gap-3.5 md:px-[18px] md:py-3.5"
            >
              <Image
                src={mod.image}
                alt={mod.title}
                width={64}
                height={48}
                className="hidden h-12 w-16 flex-shrink-0 rounded-lg bg-gray-200 object-cover md:block"
              />
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-xs font-bold text-white md:h-[26px] md:w-[26px] md:text-[12.5px]`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900 md:text-[15px]">{mod.title}</span>
                <span className="hidden truncate text-[13px] text-gray-400 md:block">{lead}</span>
              </span>
              <ChevronDown
                className={`h-[18px] w-[18px] flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-3.5 pb-3.5 md:pt-0.5 md:pr-[18px] md:pb-[18px] md:pl-24">
                <div className="relative mb-2.5 aspect-[4/3] w-full overflow-hidden rounded-[10px] bg-gray-200 md:hidden">
                  <Image src={mod.image} alt={mod.title} fill sizes="90vw" className="object-cover" />
                </div>
                {paras.map((para, pIdx) => (
                  <p
                    key={`${mod.title}-${pIdx}`}
                    className="mb-2 text-[13px] leading-[1.6] text-gray-500 last:mb-0 md:mb-2.5 md:text-sm md:leading-[1.65]"
                  >
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
