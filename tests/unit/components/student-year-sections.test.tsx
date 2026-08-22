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

// The stub SURFACES the props it is given. Reduced to a bare <div> keyed on the
// id, the assertions below could only prove "an element rendered" — they would
// not notice `onSetContractSigned` being dropped, `contractSignedAt` not being
// threaded, or the read-only decision inverting, which is what they are for.
vi.mock('@/components/shared/enrollment-contract-toggle', () => ({
  EnrollmentContractToggle: ({
    enrollmentId,
    contractSignedAt,
    onSetContractSigned,
    readOnly,
  }: Readonly<{
    enrollmentId: string
    contractSignedAt: Date | null
    onSetContractSigned: unknown
    readOnly?: boolean
  }>) => (
    <div
      data-testid={`contract-toggle-${enrollmentId}`}
      data-has-action={String(typeof onSetContractSigned === 'function')}
      data-signed={String(contractSignedAt !== null)}
      data-readonly={String(readOnly === true)}
    />
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
    /** STANDARD is what carries the family-discount note; radionice never do. */
    kind?: 'STANDARD' | 'RADIONICA' | 'COMPETITION'
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
        kind: opts.kind ?? 'RADIONICA',
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
      // Deterministic boundary (2026-11-01 UTC) — what the server computes in
      // prod; tests must not read the real clock.
      currentMonthStartMs={Date.UTC(2026, 10, 1)}
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
      onSetContractSigned={noopAction}
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
    // The action must actually reach the toggle, not just the element render.
    const adminToggle = screen.getByTestId('contract-toggle-e1')
    expect(adminToggle).toHaveAttribute('data-has-action', 'true')
    // No editable-set given ⇒ unrestricted, which is what an admin gets.
    expect(adminToggle).toHaveAttribute('data-readonly', 'false')
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
    // ...but the contract toggle IS theirs — the deliberate exception to the
    // otherwise admin-only enrollment marks.
    const teacherToggle = screen.getByTestId('contract-toggle-e1')
    expect(teacherToggle).toHaveAttribute('data-has-action', 'true')
    expect(teacherToggle).toHaveAttribute('data-readonly', 'false')
  })

  /**
   * A teacher's profile lists every enrollment a child has, including groups a
   * colleague teaches and years already settled. The page names the groups this
   * viewer may write to; everything else must render read-only, because the
   * server refuses those by throwing `notFound()` and would take the whole
   * profile down rather than show a toast.
   */
  it('renders the contract toggle read-only for a group outside the editable set', () => {
    renderSections({
      ...adminProps,
      isAdmin: false,
      contractEditableGroupIds: ['some-other-group'],
    })

    expect(screen.getByTestId('contract-toggle-e1')).toHaveAttribute('data-readonly', 'true')
  })

  it('keeps it editable for a group inside the editable set', () => {
    renderSections({
      ...adminProps,
      isAdmin: false,
      contractEditableGroupIds: ['sg-e1'],
    })

    expect(screen.getByTestId('contract-toggle-e1')).toHaveAttribute('data-readonly', 'false')
  })
})

describe('StudentYearSections — family discount note', () => {
  // The note names ANOTHER family's children in full and links each to
  // /admin/ucenici/<id>. It lives in a component the admin and the teacher
  // student profiles both render, and inside that component its only barrier is
  // `isAdmin &&`. The teacher page not fetching `familyDiscountsByYear` is a
  // second barrier and the stronger one — no sibling data reaches a teacher's
  // payload at all — but both are prop-shaped, and neither was asserted, unlike
  // the payment scrub which has an explicit test. These pin both.
  const SIBLINGS = {
    '2026/2027': [
      { id: 'sib-1', firstName: 'Mara', lastName: 'Horvat', programTitles: ['SLR 2'] },
      { id: 'sib-2', firstName: 'Jure', lastName: 'Horvat', programTitles: [] },
    ],
  }

  function renderWithSiblings(
    overrides: Partial<ComponentProps<typeof StudentYearSections>> = {},
    kind: 'STANDARD' | 'RADIONICA' = 'STANDARD',
  ) {
    return renderSections({
      defaultYear: '2026/2027',
      enrollments: [
        makeEnrollment({ id: 'e1', schoolYear: '2026/2027', courseTitle: 'SLR 1', kind }),
      ],
      familyDiscountsByYear: SIBLINGS,
      ...overrides,
    })
  }

  it('shows the note to an admin on an SLR card', () => {
    renderWithSiblings({ isAdmin: true })

    expect(screen.getByText('Popust za brata/sestru')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mara Horvat' })).toHaveAttribute(
      'href',
      '/admin/ucenici/sib-1',
    )
    // The program is what tells an admin WHY it fired — a competition sibling
    // counts too, which no bare badge could convey.
    expect(screen.getByText(/SLR 2/)).toBeInTheDocument()
    expect(screen.getByText(/10% popusta/)).toBeInTheDocument()
  })

  it('never shows it to a teacher, even handed the data', () => {
    // `isAdmin` is false on /nastavnik/ucenik/[id] — the page passes
    // viewerRole="TEACHER" unconditionally, including for a teaching admin.
    renderWithSiblings({ isAdmin: false })

    expect(screen.queryByText('Popust za brata/sestru')).not.toBeInTheDocument()
    expect(screen.queryByText('Mara Horvat')).not.toBeInTheDocument()
    expect(screen.queryByText('Jure Horvat')).not.toBeInTheDocument()
    // The strongest version of the assertion: no route into another child's
    // profile appears anywhere in a teacher's render.
    expect(
      screen.queryAllByRole('link').filter((a) =>
        (a.getAttribute('href') ?? '').startsWith('/admin/ucenici/'),
      ),
    ).toHaveLength(0)
  })

  it('stays off a radionica card even for an admin', () => {
    // Workshops settle under their own scheme — a flat 20 € "drugo dijete"
    // popust in the confirmation e-mail — so the year-long discount does not
    // apply and must not be implied.
    renderWithSiblings({ isAdmin: true }, 'RADIONICA')

    expect(screen.queryByText('Popust za brata/sestru')).not.toBeInTheDocument()
    expect(screen.queryByText('Mara Horvat')).not.toBeInTheDocument()
  })

  it('renders nothing when the year has no siblings', () => {
    renderWithSiblings({ isAdmin: true, familyDiscountsByYear: {} })

    expect(screen.queryByText('Popust za brata/sestru')).not.toBeInTheDocument()
  })
})
