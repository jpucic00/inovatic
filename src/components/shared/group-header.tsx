import { Clock, MapPin, Users } from 'lucide-react'

interface GroupHeaderProps {
  courseTitle: string
  name: string | null
  schedule: string
  locationName: string
  teacherNames: string[]
  schoolYear?: string | null
}

export function GroupHeader({
  courseTitle,
  name,
  schedule,
  locationName,
  teacherNames,
  schoolYear,
}: Readonly<GroupHeaderProps>) {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900">{courseTitle}</h1>
      {name ? <p className="text-sm text-gray-500 mt-1">{name}</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
        {schedule ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            {schedule}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-gray-400" />
          {locationName}
        </span>
        {teacherNames.length > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" />
            {teacherNames.join(', ')}
          </span>
        ) : null}
        {schoolYear ? (
          <span className="text-gray-400">• Školska godina {schoolYear}.</span>
        ) : null}
      </div>
    </>
  )
}
