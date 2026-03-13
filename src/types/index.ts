import type { UserRole, CourseLevel, InquiryStatus, EnrollmentStatus, MaterialType } from '@prisma/client'

export type { UserRole, CourseLevel, InquiryStatus, EnrollmentStatus, MaterialType }

export type CourseLevelLabel = Record<CourseLevel, string>

export const COURSE_LEVEL_LABELS: CourseLevelLabel = {
  SLR_1: 'SLR 1',
  SLR_2: 'SLR 2',
  SLR_3: 'SLR 3',
  SLR_4: 'SLR 4',
}

export const DAY_NAMES: Record<number, string> = {
  0: 'Nedjelja',
  1: 'Ponedjeljak',
  2: 'Utorak',
  3: 'Srijeda',
  4: 'Četvrtak',
  5: 'Petak',
  6: 'Subota',
}
