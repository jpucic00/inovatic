'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { GroupTable } from './group-table'
import type { TeacherOption } from '@/components/admin/teachers/teacher-multi-select'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

type Group = {
  id: string
  name: string | null
  date: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  maxStudents: number
  enrollmentStart: Date | null
  enrollmentEnd: Date | null
  courseId: string
  locationId: string
  teacherIds: string[]
  course: { id: string; title: string; level: string | null; isCustom: boolean }
  location: { id: string; name: string }
  _count: {
    enrollments: number
    preferredInquiries: number
    assignedInquiries: number
    materials: number
    studentComments: number
  }
}

type CourseTab = {
  courseId: string
  title: string
  groups: Group[]
}

interface GroupTabsProps {
  standardTabs: CourseTab[]
  radioniceTabs: Group[]
  courses: CourseOption[]
  locations: LocationOption[]
  teachers: TeacherOption[]
}

export function GroupTabs({ standardTabs, radioniceTabs, courses, locations, teachers }: Readonly<GroupTabsProps>) {
  const tabs = [
    ...standardTabs.map((t) => ({ id: t.courseId, label: t.title })),
    { id: '__radionice__', label: 'Radionice' },
  ]

  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const defaultTab = (tabParam && tabs.some((t) => t.id === tabParam)) ? tabParam : (tabs[0]?.id ?? '__radionice__')
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (tabParam && tabs.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-cyan-600 text-cyan-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === '__radionice__' ? (
        <GroupTable data={radioniceTabs} courses={courses} locations={locations} teachers={teachers} />
      ) : (
        standardTabs
          .filter((t) => t.courseId === activeTab)
          .map((t) => (
            <GroupTable
              key={t.courseId}
              data={t.groups}
              courses={courses}
              locations={locations}
              teachers={teachers}
              hideProgram
            />
          ))
      )}
    </div>
  )
}
