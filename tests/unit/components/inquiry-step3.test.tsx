import type { ProgramKind } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import type { ReactNode } from 'react'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import type { ActiveGroup, ActiveProgram } from '@/actions/public/programs'
import { isTerminRequired } from '@/lib/inquiry-availability'
import { InquiryStep3 } from '@/components/public/inquiry/InquiryStep3'

vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

function makeGroup(id: string, name: string, isFull = false): ActiveGroup {
  return {
    id,
    name,
    dayOfWeek: 'Ponedjeljak',
    dateStart: null,
    dateEnd: null,
    startTime: '17:00',
    endTime: '18:00',
    availableSpots: isFull ? 0 : 5,
    isFull,
  }
}

function makeProgram(
  id: string,
  opts: Readonly<{ kind: ProgramKind; level: string | null; group: ActiveGroup }>,
): ActiveProgram {
  return {
    id,
    slug: id,
    title: `Program ${id}`,
    level: opts.level,
    kind: opts.kind,
    ageMin: 6,
    ageMax: 14,
    price: 50,
    groups: [opts.group],
  }
}

const radionicaA = makeProgram('course-a', {
  kind: 'RADIONICA' as const,
  level: null,
  group: makeGroup('group-a', 'Termin Alpha'),
})
const radionicaB = makeProgram('course-b', {
  kind: 'RADIONICA' as const,
  level: null,
  group: makeGroup('group-b', 'Termin Beta'),
})
const standardC = makeProgram('course-c', {
  kind: 'STANDARD' as const,
  level: 'SLR_1',
  group: makeGroup('group-c', 'Termin Gamma'),
})
const standardFull = makeProgram('course-full', {
  kind: 'STANDARD' as const,
  level: 'SLR_1',
  group: makeGroup('group-full', 'Termin Puno', true),
})

function Harness({
  programs,
  preselectedCourseId,
}: Readonly<{ programs: ActiveProgram[]; preselectedCourseId?: string }>) {
  const {
    register,
    setValue,
    getValues,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<InquiryFormData>({
    defaultValues: preselectedCourseId
      ? { courseId: preselectedCourseId }
      : undefined,
  })
  // Mirror the parent: the required state is derived from the same helper.
  const terminRequired = isTerminRequired(programs, watch('grade'), preselectedCourseId)
  return (
    <InquiryStep3
      register={register}
      errors={errors}
      setValue={setValue}
      getValues={getValues}
      clearErrors={clearErrors}
      programs={programs}
      preselectedCourseId={preselectedCourseId}
      terminRequired={terminRequired}
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

describe('InquiryStep3 — conditional termin requirement affordance', () => {
  // The red asterisk on the label is the only remaining required/optional
  // affordance (the "(neobavezno)" hint was removed), so the select's
  // accessible name ends with "*" exactly when a termin is mandatory.
  const terminSelect = (required: boolean) =>
    screen.queryByRole('combobox', {
      name: required ? 'Željeni termin *' : 'Željeni termin',
    })

  it('marks the termin required when the chosen grade has an open group', () => {
    render(<Harness programs={[standardC]} />)
    fireEvent.change(screen.getByLabelText(/Razred djeteta/), { target: { value: '1' } })

    expect(terminSelect(true)).toBeInTheDocument()
  })

  it('keeps the termin optional when the grade\'s only group is full', () => {
    render(<Harness programs={[standardFull]} />)
    fireEvent.change(screen.getByLabelText(/Razred djeteta/), { target: { value: '1' } })

    // A full group still renders (disabled) but must not force a choice.
    expect(screen.getByRole('option', { name: /Termin Puno/ })).toBeDisabled()
    expect(terminSelect(false)).toBeInTheDocument()
  })

  it('requires a termin on a radionica page with an open group (no grade needed)', () => {
    render(<Harness programs={[radionicaA]} preselectedCourseId="course-a" />)

    expect(terminSelect(true)).toBeInTheDocument()
  })
})
