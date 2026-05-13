'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { inquirySchema, type InquiryFormData } from '@/lib/validators/inquiry'
import { getActivePrograms, type ActiveProgram } from '@/actions/public/programs'
import { InquiryConfirmationEmail } from '../../emails/inquiry-confirmation'
import { createElement } from 'react'

class GroupFullError extends Error {
  constructor() { super('Group is full') }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

async function assertGroupHasAvailableSpot(tx: TxClient, scheduledGroupId: string): Promise<void> {
  const group = await tx.scheduledGroup.findUnique({
    where: { id: scheduledGroupId },
    include: {
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: { notIn: ['DECLINED', 'ACCOUNT_CREATED'] } },
          },
        },
      },
      course: {
        select: {
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              schedules: {
                where: { schoolYear: { gte: computeSchoolYear() } },
                select: { id: true, schoolYear: true, startDate: true },
              },
            },
          },
        },
      },
    },
  })

  if (!group) throw new GroupFullError()

  const now = new Date()
  let enrolledCount: number

  if (group.course.isCustom) {
    enrolledCount = group.enrollments.length
  } else {
    let enrollingScheduleId: string | null = null
    for (const mod of group.course.modules) {
      const schedule = mod.schedules.find(
        (s) => s.schoolYear === group.schoolYear && s.startDate && s.startDate > now,
      )
      if (schedule) { enrollingScheduleId = schedule.id; break }
    }
    enrolledCount = enrollingScheduleId
      ? group.enrollments.filter((e) =>
          e.moduleEnrollments.some((me) => me.moduleScheduleId === enrollingScheduleId),
        ).length
      : group.enrollments.length
  }

  const available = group.maxStudents - enrolledCount - group._count.preferredInquiries
  if (available <= 0) throw new GroupFullError()
}

export type InquiryActionResult =
  | { success: true }
  | { success: false; error: string }
  | { success: false; error: string; code: 'GROUP_FULL'; programs: ActiveProgram[] }

export async function submitInquiry(data: InquiryFormData): Promise<InquiryActionResult> {
  const parsed = inquirySchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Podaci nisu valjani.' }
  }

  const {
    parentName,
    parentEmail,
    parentPhone,
    childFirstName,
    childLastName,
    childDateOfBirth,
    childSchool,
    grade,
    courseId,
    scheduledGroupId,
    message,
    referralSource,
  } = parsed.data

  const runTx = () =>
    db.$transaction(
      async (tx) => {
        if (scheduledGroupId) await assertGroupHasAvailableSpot(tx, scheduledGroupId)
        return tx.inquiry.create({
          data: {
            parentName,
            parentEmail,
            parentPhone,
            childFirstName,
            childLastName,
            childDateOfBirth,
            childSchool: childSchool || null,
            childGrade: grade || null,
            courseId: courseId || null,
            scheduledGroupId: scheduledGroupId || null,
            message: message || null,
            referralSource: referralSource || null,
            consentGivenAt: new Date(),
          },
        })
      },
      { isolationLevel: 'Serializable' },
    )

  try {
    try {
      await runTx()
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        await runTx() // retry once on write conflict
      } else {
        throw err
      }
    }
  } catch (err) {
    if (err instanceof GroupFullError) {
      const freshPrograms = await getActivePrograms()
      return {
        success: false,
        error: 'Odabrani termin je u međuvremenu popunjen. Molimo odaberite drugi termin.',
        code: 'GROUP_FULL' as const,
        programs: freshPrograms,
      }
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return { success: false, error: 'Pokušajte ponovno.' }
    }
    console.error('submitInquiry failed:', err)
    return { success: false, error: 'Greška pri slanju upita. Pokušajte ponovo.' }
  }

  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: parentEmail,
        subject: `Zaprimili smo vašu prijavu – Inovatic`,
        react: createElement(InquiryConfirmationEmail, {
          parentName,
          childName: `${childFirstName} ${childLastName}`,
          childDateOfBirth,
          courseLevelPref: undefined,
        }),
      })
    }
  } catch (err) {
    console.error('Failed to send inquiry confirmation email:', err)
  }

  return { success: true }
}
