'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { GroupTable } from './group-table'
import { tabClass } from '@/lib/ui-classes'
import type { ProgramKind } from '@prisma/client'

type Group = {
  id: string
  name: string | null
  dateStart: string | null
  dateEnd: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  maxStudents: number
  enrollmentStart: Date | null
  enrollmentEnd: Date | null
  courseId: string
  locationId: string
  course: { id: string; title: string; level: string | null; kind: ProgramKind }
  location: { id: string; name: string }
  _count: {
    enrollments: number
    preferredInquiries: number
    assignedInquiries: number
    materials: number
    studentComments: number
    galleryImages: number
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
  editable: boolean
}

export function AdminGroupTabs({ standardTabs, radioniceTabs, editable }: Readonly<GroupTabsProps>) {
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
            className={tabClass(activeTab === tab.id, 'lg')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === '__radionice__' ? (
        <GroupTable data={radioniceTabs} editable={editable} />
      ) : (
        standardTabs
          .filter((t) => t.courseId === activeTab)
          .map((t) => (
            <GroupTable
              key={t.courseId}
              data={t.groups}
              hideProgram
              editable={editable}
            />
          ))
      )}
    </div>
  )
}
