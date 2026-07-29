import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { getStudent } from '@/actions/admin/student'
import type { StudentAttendanceEnrollment } from '@/actions/admin/attendance'
import type {
  GradebookSection,
  GradebookYearTab,
} from '@/lib/student-assessment-view'
import { StudentYearSections } from '@/components/shared/student-year-sections'

// The heavy children pull server actions (addEnrollment, deleteEnrollment,
// module-enrollment CRUD) and next/navigation — mock them down to divs that
// echo the props the parent is responsible for filtering/forwarding.
vi.mock('@/components/shared/student-gradebook-section', () => ({
  StudentGradebookSection: ({
    sections,
  }: Readonly<{ sections: unknown[] }>) => (
    <div data-testid="gradebook-section">{sections.length}</div>
  ),
}))

vi.mock('@/components/admin/students/attendance-panel', () => ({
  AttendancePanel: ({
    enrollments,
  }: Readonly<{ enrollments: { enrollmentId: string; schoolYear: string }[] }>) => (
    <div data-testid="attendance-panel">
      {enrollments.map((e) => `${e.enrollmentId}:${e.schoolYear}`).join('|')}
    </div>
  ),
}))

vi.mock('@/components/admin/students/add-enrollment-dialog', () => ({
  AddEnrollmentDialog: ({ studentId }: Readonly<{ studentId: string }>) => (
    <div data-testid="add-enrollment-dialog">{studentId}</div>
  ),
}))

vi.mock('@/components/admin/students/delete-enrollment-button', () => ({
  DeleteEnrollmentButton: ({ enrollmentId }: Readonly<{ enrollmentId: string }>) => (
    <div data-testid={`delete-enrollment-${enrollmentId}`} />
  ),
}))

vi.mock('@/components/admin/students/manage-enrollment-modules', () => ({
  ManageEnrollmentModules: ({ enrollmentId }: Readonly<{ enrollmentId: string }>) => (
    <div data-testid={`manage-modules-${enrollmentId}`} />
  ),
}))

vi.mock('@/components/admin/students/enrollment-payment-panel', () => ({
  EnrollmentPaymentPanel: ({ enrollmentId }: Readonly<{ enrollmentId: string }>) => (
    <div data-testid={`payment-panel-${enrollmentId}`} />
  ),
}))

type StudentEnrollments = NonNullable<
  Awaited<ReturnType<typeof getStudent>>
>['enrollments']

// The component only reads a slice of the Prisma include type — build that
// slice and cast, instead of fabricating every scalar Prisma would return.
function makeEnrollment(
  opts: Readonly<{
    id: string
    schoolYear: string
    courseTitle: string
    withModule?: boolean
  }>,
): StudentEnrollments[number] {
  return {
    id: opts.id,
    schoolYear: opts.schoolYear,
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    moduleEnrollments: opts.withModule
      ? [
          {
            id: `me-${opts.id}`,
            moduleSchedule: {
              id: `ms-${opts.id}`,
              schoolYear: opts.schoolYear,
              module: { id: `mod-${opts.id}`, title: 'Osnove robotike', sortOrder: 0 },
            },
          },
        ]
      : [],
    // Monthly-fee items exist only on COMPETITION enrollments; every fixture
    // here is a radionica, so the list is empty but must still be present.
    enrollmentMonths: [],
    scheduledGroup: {
      id: `sg-${opts.id}`,
      name: `Grupa ${opts.id}`,
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
      course: {
        id: `c-${opts.id}`,
        title: opts.courseTitle,
        level: null,
        kind: 'RADIONICA',
        modules: [],
      },
      location: { name: 'Split centar', address: 'Testna ulica 1' },
    },
  } as unknown as StudentEnrollments[number]
}

function makeAttendance(
  enrollmentId: string,
  schoolYear: string,
): StudentAttendanceEnrollment {
  return {
    enrollmentId,
    groupId: `g-${enrollmentId}`,
    groupName: null,
    courseTitle: 'SLR 1',
    schoolYear,
    rows: [],
    presentCount: 0,
    absentCount: 0,
  }
}

function makeSection(groupId: string, schoolYear: string): GradebookSection {
  return {
    groupId,
    schoolYear,
    kind: 'STANDARD',
    program: `Program ${groupId}`,
    groupLabel: `Grupa ${groupId}`,
    teacherNames: [],
    canGrade: false,
    canComment: true,
    assessment: null,
    comments: [],
  }
}

function makeTab(
  schoolYear: string,
  sections: GradebookSection[] = [],
): GradebookYearTab {
  return { schoolYear, sections }
}

const noopAction = async () => ({ success: true as const })

function renderSections(
  overrides: Partial<ComponentProps<typeof StudentYearSections>> = {},
) {
  return render(
    <StudentYearSections
      studentId="student-1"
      defaultYear="2026/2027"
      enrollments={[]}
      attendance={[]}
      gradebookTabs={[]}
      recommendationOptions={[]}
      isAdmin={false}
      onCreateComment={noopAction}
      onDeleteComment={noopAction}
      onSaveAssessment={noopAction}
      onClearAssessment={noopAction}
      {...overrides}
    />,
  )
}

const yearButtons = () =>
  screen.getAllByRole('button', { name: /^\d{4}\/\d{4}$/ }).map((b) => b.textContent)

describe('StudentYearSections — year selector', () => {
  it('offers the descending union of defaultYear + years present in any section', () => {
    renderSections({
      defaultYear: '2026/2027',
      enrollments: [
        makeEnrollment({ id: 'e1', schoolYear: '2025/2026', courseTitle: 'SLR 1' }),
      ],
      attendance: [makeAttendance('e0', '2024/2025')],
      gradebookTabs: [makeTab('2027/2028')],
    })

    expect(yearButtons()).toEqual(['2027/2028', '2026/2027', '2025/2026', '2024/2025'])
  })

  it('renders only the defaultYear button when there is no data at all', () => {
    renderSections()
    expect(yearButtons()).toEqual(['2026/2027'])
  })

  it('opens on defaultYear: its data is shown, other years are filtered out', () => {
    renderSections({
      enrollments: [
        makeEnrollment({ id: 'e1', schoolYear: '2026/2027', courseTitle: 'Tekuća grupa' }),
        makeEnrollment({ id: 'e2', schoolYear: '2025/2026', courseTitle: 'Prošla grupa' }),
      ],
    })

    expect(screen.getByText('Tekuća grupa')).toBeInTheDocument()
    expect(screen.queryByText('Prošla grupa')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026/2027' }).className).toContain(
      'bg-white',
    )
  })

  it('clicking another year filters all three sections to that year only', () => {
    renderSections({
      enrollments: [
        makeEnrollment({ id: 'e1', schoolYear: '2026/2027', courseTitle: 'Tekuća grupa' }),
        makeEnrollment({ id: 'e2', schoolYear: '2025/2026', courseTitle: 'Prošla grupa' }),
      ],
      attendance: [
        makeAttendance('att-current', '2026/2027'),
        makeAttendance('att-past', '2025/2026'),
      ],
      gradebookTabs: [
        makeTab('2026/2027', [makeSection('g1', '2026/2027')]),
        makeTab('2025/2026', [
          makeSection('g2', '2025/2026'),
          makeSection('g3', '2025/2026'),
        ]),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: '2025/2026' }))

    expect(screen.getByText('Prošla grupa')).toBeInTheDocument()
    expect(screen.queryByText('Tekuća grupa')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-panel').textContent).toBe(
      'att-past:2025/2026',
    )
    // Exactly the selected year's sections are forwarded — both of them.
    expect(screen.getByTestId('gradebook-section').textContent).toBe('2')
  })

  it('per-year empty state names the active year', () => {
    renderSections({
      enrollments: [
        makeEnrollment({ id: 'e1', schoolYear: '2026/2027', courseTitle: 'SLR 2' }),
      ],
      gradebookTabs: [makeTab('2024/2025')],
    })

    fireEvent.click(screen.getByRole('button', { name: '2024/2025' }))

    expect(
      screen.getByText('Nema upisa za školsku godinu 2024/2025.'),
    ).toBeInTheDocument()
    // No tab data either — the component synthesizes an empty tab for the year.
    expect(screen.getByTestId('gradebook-section').textContent).toBe('0')
  })
})

describe('StudentYearSections — admin vs teacher affordances', () => {
  const adminProps = {
    isAdmin: true,
    selectedYear: '2026/2027',
    courses: [{ id: 'c1', title: 'SLR 1' }],
    enrollments: [
      makeEnrollment({
        id: 'e1',
        schoolYear: '2026/2027',
        courseTitle: 'SLR 1',
        withModule: true,
      }),
    ],
  }

  it('admin sees AddEnrollmentDialog, the target-year hint, and per-enrollment management', () => {
    renderSections(adminProps)

    expect(screen.getByTestId('add-enrollment-dialog')).toHaveTextContent('student-1')
    expect(
      screen.getByText('Novi upis ide u školsku godinu 2026/2027.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('delete-enrollment-e1')).toBeInTheDocument()
    expect(screen.getByTestId('manage-modules-e1')).toBeInTheDocument()
    // Admin-only payment panel is present.
    expect(screen.getByTestId('payment-panel-e1')).toBeInTheDocument()
    // Admin gets the editable module manager, not the read-only list.
    expect(screen.queryByText('Upisani moduli')).not.toBeInTheDocument()
  })

  it('teacher mode is read-only: no dialog, no hint, no delete/manage — just the module list', () => {
    renderSections({ ...adminProps, isAdmin: false })

    expect(screen.queryByTestId('add-enrollment-dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Novi upis ide u školsku godinu/),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-enrollment-e1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manage-modules-e1')).not.toBeInTheDocument()
    // Teacher must never see the payment panel.
    expect(screen.queryByTestId('payment-panel-e1')).not.toBeInTheDocument()
    expect(screen.getByText('Upisani moduli')).toBeInTheDocument()
    expect(screen.getByText('• Osnove robotike')).toBeInTheDocument()
  })
})
