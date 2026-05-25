import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import type { ReactNode } from 'react'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import { InquiryStep3 } from '@/components/public/inquiry/InquiryStep3'

vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

function makeGroup(id: string, name: string): ActiveGroup {
  return {
    id,
    name,
    dayOfWeek: 'Ponedjeljak',
    dateStart: null,
    dateEnd: null,
    startTime: '17:00',
    endTime: '18:00',
    availableSpots: 5,
    isFull: false,
  }
}

function makeProgram(
  id: string,
  opts: Readonly<{ isCustom: boolean; level: string | null; group: ActiveGroup }>,
): ActiveProgram {
  return {
    id,
    slug: id,
    title: `Program ${id}`,
    level: opts.level,
    isCustom: opts.isCustom,
    ageMin: 6,
    ageMax: 14,
    price: 50,
    groups: [opts.group],
  }
}

const radionicaA = makeProgram('course-a', {
  isCustom: true,
  level: null,
  group: makeGroup('group-a', 'Termin Alpha'),
})
const radionicaB = makeProgram('course-b', {
  isCustom: true,
  level: null,
  group: makeGroup('group-b', 'Termin Beta'),
})
const standardC = makeProgram('course-c', {
  isCustom: false,
  level: 'SLR_1',
  group: makeGroup('group-c', 'Termin Gamma'),
})

function Harness({
  programs,
  preselectedCourseId,
}: Readonly<{ programs: ActiveProgram[]; preselectedCourseId?: string }>) {
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<InquiryFormData>({
    defaultValues: preselectedCourseId
      ? { courseId: preselectedCourseId }
      : undefined,
  })
  return (
    <InquiryStep3
      register={register}
      errors={errors}
      setValue={setValue}
      getValues={getValues}
      programs={programs}
      preselectedCourseId={preselectedCourseId}
    />
  )
}

describe('InquiryStep3 — group dropdown scoping', () => {
  it("radionica link lists only the preselected radionica's groups", () => {
    // `programs` carries every active course — this is the state after the
    // /api/group-availability poll overwrites the page's curated list.
    render(
      <Harness
        programs={[radionicaA, radionicaB, standardC]}
        preselectedCourseId="course-a"
      />,
    )

    expect(screen.getByRole('option', { name: /Termin Alpha/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Termin Beta/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Termin Gamma/ })).not.toBeInTheDocument()
  })

  it('the /upisi flow (no preselection) still excludes radionice', () => {
    render(<Harness programs={[standardC, radionicaA]} />)

    fireEvent.change(screen.getByLabelText(/Razred djeteta/), {
      target: { value: '1' },
    })

    expect(screen.getByRole('option', { name: /Termin Gamma/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Termin Alpha/ })).not.toBeInTheDocument()
  })

  it('radionica preselect flow still shows the grade dropdown (info only)', () => {
    render(
      <Harness
        programs={[radionicaA, standardC]}
        preselectedCourseId="course-a"
      />,
    )

    expect(screen.getByLabelText(/Razred djeteta/)).toBeInTheDocument()
  })
})
