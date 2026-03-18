import { Clock, Users, Trophy, Star } from 'lucide-react'

const stats = [
  { value: '2014.', label: 'Godina osnivanja', icon: Star, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-600' },
  { value: '56h', label: 'Nastave godišnje', icon: Clock, bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-600' },
  { value: '≤ 8', label: 'Djece po grupi', icon: Users, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
  { value: '4', label: 'Razine programa', icon: Trophy, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600' },
]

export function StatsSection() {
  return (
    <section className="py-12 px-4 bg-white border-b border-gray-100">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className={`text-center p-6 rounded-2xl border ${stat.bg} ${stat.border}`}
              >
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-3 border ${stat.border}`}>
                  <Icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <div className={`text-3xl font-extrabold ${stat.text} mb-1`}>{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
