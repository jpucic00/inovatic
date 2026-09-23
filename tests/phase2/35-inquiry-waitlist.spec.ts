import { test, expect, type Page } from '@playwright/test'
import { BASE, loginAsAdmin } from '../helpers/phase3'
import { cleanupRunFixtures, newRunId } from '../helpers/cleanup'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2 — Lista čekanja on /admin/upiti/[id].
// A waitlisted NEW upit can never be taken off the list by hand (off it, it
// would re-take its form group's seat) — the page explains that instead of
// offering "Makni s liste čekanja". A waitlisted DECLINED upit offers both the
// removal and "Kreiraj račun". Declining a waitlisted NEW upit takes it off.
// Fixtures are seeded via Prisma; every row carries RUN_ID so the teardown
// reaches them (InquiryWaitlistGroup cascades from both Inquiry and the group).
// Requires: dev server on localhost:3000, seeded admin user (SPLIT).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe.configure({ mode: 'serial' })

const RUN_ID = newRunId()

const NEW_EXPLANATION =
  'Novi upit ostaje na listi dok se ne riješi: kreiranje računa ili odbijanje upita ga miče s liste.'

let seeded: {
  newInquiryId: string
  declinedInquiryId: string
  declineTargetId: string
}

test.afterAll(async () => {
  await cleanupRunFixtures(RUN_ID)
})

test.beforeAll(async () => {
  const schoolYear = computeSchoolYear()
  const location = await db.location.create({
    data: { city: 'SPLIT', name: `Waitlist Lokacija ${RUN_ID}`, address: `Test ulica ${RUN_ID}` },
  })
  const course = await db.course.create({
    data: {
      slug: `waitlist-radionica-${RUN_ID}`,
      title: `Waitlist Radionica ${RUN_ID}`,
      description: 'Test radionica',
      kind: 'RADIONICA',
      city: 'SPLIT',
      schoolYear,
      ageMin: 6,
      ageMax: 14,
    },
  })
  const group = await db.scheduledGroup.create({
    data: {
      city: 'SPLIT',
      courseId: course.id,
      locationId: location.id,
      name: `Waitlist Grupa ${RUN_ID}`,
      schoolYear,
      maxStudents: 8,
      dayOfWeek: 'Srijeda',
      startTime: '17:00',
      endTime: '18:30',
    },
  })

  const waitlisted = async (
    key: string,
    childFirstName: string,
    status: 'NEW' | 'DECLINED',
  ): Promise<string> => {
    const inquiry = await db.inquiry.create({
      data: {
        city: 'SPLIT',
        schoolYear,
        parentName: `Waitlist Roditelj ${key} ${RUN_ID}`,
        parentEmail: `waitlist.${key}.${RUN_ID}@test.com`,
        parentPhone: '0991234567',
        childFirstName,
        childLastName: `Čekić${RUN_ID}`,
        childDateOfBirth: '2016-05-10',
        consentGivenAt: new Date(),
        courseId: course.id,
        scheduledGroupId: group.id,
        status,
        declineReason: status === 'DECLINED' ? 'Termin ne odgovara' : null,
        waitlistedAt: new Date(),
        waitlistNote: `Bilješka ${key}`,
        waitlistGroups: { create: [{ scheduledGroupId: group.id }] },
      },
    })
    return inquiry.id
  }

  seeded = {
    newInquiryId: await waitlisted('novi', 'Novak', 'NEW'),
    declinedInquiryId: await waitlisted('odbijen', 'Odbijenko', 'DECLINED'),
    declineTargetId: await waitlisted('odbij', 'Odbijam', 'NEW'),
  }
})

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

const waitlistCard = (page: Page) =>
  page.locator('div.bg-orange-50', { has: page.getByRole('heading', { name: 'Na listi čekanja' }) })

test('waitlisted NEW upit explains itself and offers no removal', async ({ page }) => {
  await page.goto(`${BASE}/admin/upiti/${seeded.newInquiryId}`)

  const card = waitlistCard(page)
  await expect(card).toBeVisible()
  await expect(card.getByText(NEW_EXPLANATION)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Makni s liste čekanja' })).toHaveCount(0)
  // Still resolvable the two ways the explanation names.
  await expect(page.getByRole('button', { name: 'Kreiraj račun' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Odbij upit' })).toBeVisible()
})

test('waitlisted DECLINED upit offers removal and account creation', async ({ page }) => {
  await page.goto(`${BASE}/admin/upiti/${seeded.declinedInquiryId}`)

  const card = waitlistCard(page)
  await expect(card).toBeVisible()
  await expect(card.getByRole('button', { name: 'Makni s liste čekanja' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kreiraj račun' })).toBeVisible()
  await expect(page.getByText(NEW_EXPLANATION)).toHaveCount(0)
  // A declined upit cannot be declined again.
  await expect(page.getByRole('button', { name: 'Odbij upit' })).toHaveCount(0)
})

test('declining a waitlisted NEW upit takes it off the list', async ({ page }) => {
  const listUrl = `${BASE}/admin/upiti?view=cekanje&search=${encodeURIComponent(`waitlist.odbij.${RUN_ID}`)}`
  await page.goto(listUrl)
  await expect(page.getByText(`Waitlist Roditelj odbij ${RUN_ID}`)).toBeVisible()

  await page.goto(`${BASE}/admin/upiti/${seeded.declineTargetId}`)
  await expect(waitlistCard(page)).toBeVisible()

  await page.getByRole('button', { name: 'Odbij upit' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const confirm = dialog.getByRole('button', { name: 'Odbij upit' })
  await dialog.locator('#decline-reason').fill('ab')
  await expect(confirm).toBeDisabled()
  await dialog.locator('#decline-reason').fill('Obitelj je odustala')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('Upit je odbijen.')).toBeVisible()
  await expect(waitlistCard(page)).toHaveCount(0)
  // Off the list, the page offers putting it back on instead of editing it.
  await expect(page.getByRole('button', { name: 'Na listu čekanja' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Uredi listu čekanja' })).toHaveCount(0)

  const row = await db.inquiry.findUniqueOrThrow({
    where: { id: seeded.declineTargetId },
    select: { status: true, waitlistedAt: true, waitlistNote: true, _count: { select: { waitlistGroups: true } } },
  })
  expect(row).toEqual({
    status: 'DECLINED',
    waitlistedAt: null,
    waitlistNote: null,
    _count: { waitlistGroups: 0 },
  })

  await page.goto(listUrl)
  await expect(page.getByText(`Waitlist Roditelj odbij ${RUN_ID}`)).toHaveCount(0)
})
