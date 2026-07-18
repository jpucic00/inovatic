import { Fragment } from 'react'
import { Clock, Users, Blocks, Medal, Globe } from 'lucide-react'

const stats = [
  { value: '12', label: 'Godina iskustva', icon: Clock },
  { value: '4.500+', label: 'Polaznika', icon: Users },
  { value: '2.500+', label: 'Radionica', icon: Blocks },
  { value: '30+', label: 'Medalja i trofeja', icon: Medal },
  { value: '10', label: 'Međunarodnih plasmana', icon: Globe },
]

export function StatsSection() {
  return (
    <section className="bg-white border-b border-gray-100">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-9 gap-y-[22px] px-6 py-7 lg:gap-x-0 lg:px-8 lg:py-9">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Fragment key={stat.label}>
              {index > 0 && <div className="hidden lg:block w-px h-11 bg-gray-200" />}
              <div className="text-center lg:px-[38px]">
                <div className="flex items-center justify-center gap-[7px] lg:gap-2">
                  <Icon className="w-[17px] h-[17px] lg:w-[19px] lg:h-[19px] text-yellow-400" />
                  <span className="text-[26px] lg:text-[30px] font-extrabold text-cyan-500 tabular-nums">{stat.value}</span>
                </div>
                <div className="mx-auto mt-[5px] lg:mt-1.5 mb-1.5 h-[3px] w-5 lg:w-6 rounded-[2px] bg-yellow-400" />
                <div className="text-xs lg:text-[13px] text-gray-500">{stat.label}</div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}
