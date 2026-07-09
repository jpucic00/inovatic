import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'

interface GroupCardProps {
  href: string
  name: string | null
  schedule: string
  locationName: string
  extraRows?: React.ReactNode
  footer?: React.ReactNode
}

export function GroupCard({
  href,
  name,
  schedule,
  locationName,
  extraRows,
  footer,
}: Readonly<GroupCardProps>) {
  return (
    <Link
      href={href}
      className="block p-5 rounded-lg border border-gray-200 bg-white hover:border-cyan-400 hover:shadow-sm transition"
    >
      {name ? (
        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
      ) : null}
      <div className={`${name ? 'mt-3 ' : ''}space-y-1 text-sm text-gray-600`}>
        {schedule ? (
          <div className="inline-flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            {schedule}
          </div>
        ) : null}
        <div className="inline-flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-gray-400" />
          {locationName}
        </div>
        {extraRows}
      </div>
      {footer}
    </Link>
  )
}

export function groupByCourse<T>(
  items: T[],
  getCourse: (item: T) => { id: string; title: string },
): Array<{ courseId: string; courseTitle: string; items: T[] }> {
  const sections = new Map<string, { courseId: string; courseTitle: string; items: T[] }>()
  for (const item of items) {
    const course = getCourse(item)
    let section = sections.get(course.id)
    if (!section) {
      section = { courseId: course.id, courseTitle: course.title, items: [] }
      sections.set(course.id, section)
    }
    section.items.push(item)
  }
  return Array.from(sections.values())
}
