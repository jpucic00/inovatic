import { describe, expect, it } from 'vitest'

import {
  buildGroupName,
  courseSlugFromLabel,
  dayOfWeekFromLabel,
  inferSchoolYearFromFilename,
  normalizeTimeToken,
  parseContactSheet,
  parseEvaluationSheet,
  parseGroupName,
  parsePaidValue,
  parseRecommendation,
  parseSkillValue,
  titleCaseName,
  type Grid,
  type ImportWarning,
} from '@/lib/import-history/parse'

describe('normalizeTimeToken', () => {
  it('normalizes every observed time spelling to H:MM', () => {
    expect(normalizeTimeToken('18:30')).toBe('18:30')
    expect(normalizeTimeToken('1830')).toBe('18:30')
    expect(normalizeTimeToken('930')).toBe('9:30')
    expect(normalizeTimeToken('20')).toBe('20:00')
    expect(normalizeTimeToken('9')).toBe('9:00')
    expect(normalizeTimeToken('1030')).toBe('10:30')
    expect(normalizeTimeToken('19.30')).toBe('19:30')
  })

  it('rejects out-of-range and garbage tokens', () => {
    expect(normalizeTimeToken('25')).toBeNull()
    expect(normalizeTimeToken('1875')).toBeNull()
    expect(normalizeTimeToken('abc')).toBeNull()
    expect(normalizeTimeToken('')).toBeNull()
  })
})

describe('parseGroupName', () => {
  it('parses contact-tab names (compact times)', () => {
    expect(parseGroupName('PON_SLR2_1830-20')).toEqual({
      dayOfWeek: 'Ponedjeljak',
      courseSlug: 'slr-2',
      courseToken: 'SLR2',
      startTime: '18:30',
      endTime: '20:00',
    })
    expect(parseGroupName('SUB_SLR1_900-1030')?.startTime).toBe('9:00')
    expect(parseGroupName('SUB_SLR1_900-1030')?.endTime).toBe('10:30')
  })

  it('parses prod group names (full times, diacritic day)', () => {
    expect(parseGroupName('ČET_SLR1_18:30-20:00')).toMatchObject({
      dayOfWeek: 'Četvrtak',
      courseSlug: 'slr-1',
      startTime: '18:30',
      endTime: '20:00',
    })
    expect(parseGroupName('SUB_SLR1_9:00-10:30')?.startTime).toBe('9:00')
  })

  it('gives compact tabs and prod names the same identity', () => {
    const tab = parseGroupName('PON_SLR3_1930-21')!
    const prod = parseGroupName('PON_SLR3_19:30-21:00')!
    expect(tab).toEqual(prod)
  })

  it('accepts a time-less name and rejects non-convention names', () => {
    expect(parseGroupName('SRI_SLR1')).toMatchObject({ startTime: null, endTime: null })
    expect(parseGroupName('Grupa ponedjeljak')).toBeNull()
    expect(parseGroupName('PON_XYZ_18-20')).toBeNull()
    expect(parseGroupName('Sheet1')).toBeNull()
  })

  it('tolerates Numbers→Excel export suffixes on worksheet names', () => {
    expect(parseGroupName('PON_SLR2_1830-20 - Tablica 1')).toEqual(parseGroupName('PON_SLR2_1830-20'))
    expect(parseGroupName('SUB_SLR1_900-1030 - Table 1')).toEqual(parseGroupName('SUB_SLR1_900-1030'))
    expect(parseGroupName('Bilješke - interno')).toBeNull()
  })
})

describe('buildGroupName', () => {
  it('renders the prod naming convention', () => {
    expect(buildGroupName(parseGroupName('PON_SLR2_1830-20')!)).toBe('PON_SLR2_18:30-20:00')
    expect(buildGroupName(parseGroupName('ČET_SLR1_18:30-20:00')!)).toBe('ČET_SLR1_18:30-20:00')
    expect(buildGroupName(parseGroupName('SUB_SLR1_900-1030')!)).toBe('SUB_SLR1_9:00-10:30')
  })
})

describe('inferSchoolYearFromFilename', () => {
  it('extracts consecutive-year pairs from workbook filenames', () => {
    expect(inferSchoolYearFromFilename('Evidencija_Anić_2024_2025.xlsx')).toBe('2024/2025')
    expect(inferSchoolYearFromFilename('Kopija datoteke Evidencija_Anić_2024_2025.xlsx')).toBe('2024/2025')
    expect(inferSchoolYearFromFilename('evidencija 2025-2026 final.xlsx')).toBe('2025/2026')
  })

  it('returns null for non-consecutive or absent year pairs', () => {
    expect(inferSchoolYearFromFilename('Evidencija_2024_2026.xlsx')).toBeNull()
    expect(inferSchoolYearFromFilename('polaznici.xlsx')).toBeNull()
    expect(inferSchoolYearFromFilename('backup_1830_2000.xlsx')).toBeNull()
  })
})

describe('label + value coercers', () => {
  it('maps course labels from titles and tokens', () => {
    expect(courseSlugFromLabel('SVIJET LEGO ROBOTIKE 1')).toBe('slr-1')
    expect(courseSlugFromLabel('Svijet lego robotike 4')).toBe('slr-4')
    expect(courseSlugFromLabel('SLR2')).toBe('slr-2')
    expect(courseSlugFromLabel('SLR 3')).toBe('slr-3')
    expect(courseSlugFromLabel('Radionica robotike')).toBeNull()
  })

  it('maps weekday labels with and without diacritics', () => {
    expect(dayOfWeekFromLabel('SRIJEDA')).toBe('Srijeda')
    expect(dayOfWeekFromLabel('ČET')).toBe('Četvrtak')
    expect(dayOfWeekFromLabel('CETVRTAK')).toBe('Četvrtak')
    expect(dayOfWeekFromLabel('nedjelja')).toBe('Nedjelja')
    expect(dayOfWeekFromLabel('SRIJEDA 17H')).toBeNull()
  })

  it('maps skill values exactly as the app renders them', () => {
    expect(parseSkillValue('Početno')).toBe('POCETNO')
    expect(parseSkillValue('POČETNO')).toBe('POCETNO')
    expect(parseSkillValue('U razvoju')).toBe('U_RAZVOJU')
    expect(parseSkillValue('Ostvareno')).toBe('OSTVARENO')
    expect(parseSkillValue('')).toBeNull()
    expect(parseSkillValue(null)).toBeNull()
    expect(parseSkillValue('odlično')).toBe('unknown')
  })

  it('maps PREPORUKA to specials and course slugs', () => {
    expect(parseRecommendation('Priprema za natjecanja')).toEqual({ kind: 'COMPETITION_PREP' })
    // The real workbook misspells it ("PRIPEMA", missing R) and mixes
    // singular/plural — all variants must land on COMPETITION_PREP.
    expect(parseRecommendation('PRIPEMA ZA NATJECANJA')).toEqual({ kind: 'COMPETITION_PREP' })
    expect(parseRecommendation('Pripema za natjecanje')).toEqual({ kind: 'COMPETITION_PREP' })
    expect(parseRecommendation('Priprema za natjecanje')).toEqual({ kind: 'COMPETITION_PREP' })
    expect(parseRecommendation('NATJECATELJSKI PROGRAM')).toEqual({ kind: 'COMPETITION_PROGRAM' })
    expect(parseRecommendation('Svijet LEGO robotike 2')).toEqual({ kind: 'COURSE', courseSlug: 'slr-2' })
    expect(parseRecommendation('SLR 3')).toEqual({ kind: 'COURSE', courseSlug: 'slr-3' })
    expect(parseRecommendation(null)).toBeNull()
    expect(parseRecommendation('nastaviti')).toBe('unknown')
  })

  it('coerces PLAĆENO cells from booleans, numbers and strings', () => {
    expect(parsePaidValue(true)).toBe(true)
    expect(parsePaidValue(false)).toBe(false)
    expect(parsePaidValue('TRUE')).toBe(true)
    expect(parsePaidValue('DA')).toBe(true)
    expect(parsePaidValue('NE')).toBe(false)
    expect(parsePaidValue(1)).toBe(true)
    expect(parsePaidValue(0)).toBe(false)
    expect(parsePaidValue('')).toBe(false)
    expect(parsePaidValue(null)).toBe(false)
    expect(parsePaidValue('možda')).toBe('unknown')
  })

  it('title-cases ALL-CAPS names including hyphens and diacritics', () => {
    expect(titleCaseName('KRISTIAN MUTABDŽIJA')).toBe('Kristian Mutabdžija')
    expect(titleCaseName('ANA-MARIJA ŠARIĆ')).toBe('Ana-Marija Šarić')
    expect(titleCaseName('  ivano   tabak ')).toBe('Ivano Tabak')
  })
})

// ── Evaluation sheet ─────────────────────────────────────────────────────────

/** Grid mimicking the real sheet: label block, merged two-row header (the
 *  master value repeated over merged children, as the xlsx adapter yields),
 *  student rows, legend row, blank gap, second block. */
function evaluationGrid(): Grid {
  return [
    ['PROGRAM: SVIJET LEGO ROBOTIKE 1', null, null, null, null, null, null, null, null, null, null],
    ['GRUPA: SRIJEDA', null, null, null, null, null, null, null, null, null, null],
    ['PREDAVAČ: IVANO TABAK', null, null, null, null, null, null, null, null, null, null],
    ['BR.', 'IME:', 'PREZIME:', 'PRAKTIČNE VJEŠTINE', 'PRAKTIČNE VJEŠTINE', 'PRAKTIČNE VJEŠTINE', 'TIMSKE VJEŠTINE', 'TIMSKE VJEŠTINE', 'TIMSKE VJEŠTINE', 'OPISNA OCJENA:', 'PREPORUKA:'],
    ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
    [1, 'KRISTIAN', 'MUTABDŽIJA', 'Ostvareno', 'U razvoju', 'Početno', 'Ostvareno', 'Ostvareno', 'U razvoju', 'Odličan napredak.', 'Svijet LEGO robotike 2'],
    [2, 'LANA', 'KOVAČ', 'Početno', null, 'U razvoju', null, 'Ostvareno', 'Ostvareno', null, 'Priprema za natjecanja'],
    [3, 'MARKO', 'BARIĆ', null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null],
    ['POČETNO — Minimalno zamijećenih primjera.', null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null],
    ['PROGRAM: SVIJET LEGO ROBOTIKE 3', null, null, null, null, null, null, null, null, null, null],
    ['GRUPA: PONEDJELJAK', null, null, null, null, null, null, null, null, null, null],
    ['TRENER: VITO DRNJEVIĆ', null, null, null, null, null, null, null, null, null, null],
    ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
    [1, 'EMA', 'RADIĆ', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Ostvareno', 'Za natjecateljski program.', 'Natjecateljski program'],
  ]
}

describe('parseEvaluationSheet', () => {
  it('parses stacked blocks with two-row and single-row headers', () => {
    const warnings: ImportWarning[] = []
    const blocks = parseEvaluationSheet(evaluationGrid(), warnings)

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      courseSlug: 'slr-1',
      dayOfWeek: 'Srijeda',
      teacherName: 'Ivano Tabak',
    })
    expect(blocks[0].rows).toHaveLength(3)
    expect(blocks[0].rows[0]).toMatchObject({
      firstName: 'Kristian',
      lastName: 'Mutabdžija',
      skills: {
        slaganje: 'OSTVARENO',
        programiranje: 'U_RAZVOJU',
        inovacije: 'POCETNO',
        suradnja: 'OSTVARENO',
        komunikacija: 'OSTVARENO',
        zabava: 'U_RAZVOJU',
      },
      opisnaOcjena: 'Odličan napredak.',
      recommendation: { kind: 'COURSE', courseSlug: 'slr-2' },
    })
    expect(blocks[0].rows[1].skills.programiranje).toBeNull()
    expect(blocks[0].rows[1].recommendation).toEqual({ kind: 'COMPETITION_PREP' })

    expect(blocks[1]).toMatchObject({
      courseSlug: 'slr-3',
      dayOfWeek: 'Ponedjeljak',
      teacherName: 'Vito Drnjević',
    })
    expect(blocks[1].rows[0].recommendation).toEqual({ kind: 'COMPETITION_PROGRAM' })

    expect(warnings.filter((w) => w.level === 'error')).toHaveLength(0)
  })

  it('flags unknown skill and preporuka values without dropping the row', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['PROGRAM: SLR 1'],
      ['GRUPA: PETAK'],
      ['PREDAVAČ: ANA ANIĆ'],
      ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'OPISNA OCJENA:', 'PREPORUKA:'],
      [1, 'IVA', 'IVIĆ', 'odlično', 'Ostvareno', null, null, null, null, null, 'nastaviti dalje'],
    ]
    const blocks = parseEvaluationSheet(grid, warnings)
    expect(blocks[0].rows[0].skills.slaganje).toBeNull()
    expect(blocks[0].rows[0].skills.programiranje).toBe('OSTVARENO')
    expect(blocks[0].rows[0].recommendation).toBeNull()
    expect(warnings.some((w) => w.message.includes('slaganje'))).toBe(true)
    expect(warnings.some((w) => w.message.includes('PREPORUKA'))).toBe(true)
  })

  it('errors on unrecognized program and weekday labels', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['PROGRAM: Napredna robotika'],
      ['GRUPA: SRIJEDA I PETAK'],
      ['BR.', 'IME:', 'PREZIME:', 'SLAGANJE', 'PROGRAMIRANJE', 'INOVACIJE', 'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA'],
      [1, 'IVA', 'IVIĆ', 'Ostvareno', null, null, null, null, null],
    ]
    parseEvaluationSheet(grid, warnings)
    expect(warnings.some((w) => w.level === 'error' && w.message.includes('Napredna robotika'))).toBe(true)
    expect(warnings.some((w) => w.level === 'error' && w.message.includes('SRIJEDA I PETAK'))).toBe(true)
  })
})

// ── Contact sheets ───────────────────────────────────────────────────────────

function contactGrid(): Grid {
  return [
    ['NAZIV PROGRAMA: SVIJET LEGO ROBOTIKE 3', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['TRENER: VITO DRNJEVIĆ', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['ASISTENT:', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ['BR.', 'IME:', 'PREZIME:', 'GODINE:', 'RAZRED:', 'RODITELJ:', 'MAIL:', 'MOBITEL:', 'ISKUSTVO:', 'OGLEDNA:', 'UGOVOR:', 'PLAĆANJE:', 'POPUST:', 'PONUDA:', 'RAČUN:', 'PLAĆENO'],
    [1, 'KRISTIAN', 'MUTABDŽIJA', 9, '3. razred', 'IVANA MUTABDŽIJA', 'Ivana.M@Gmail.com', '0911234567', 'Da', false, true, 'TRANSAKCIJSKI', '10%', true, true, true],
    [2, 'LANA', 'KOVAČ', 8, '2. razred', 'PERO KOVAČ', 'pero@example.com', 912345678, 'Ne', false, false, null, null, false, false, false],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ]
}

describe('parseContactSheet', () => {
  it('returns null for non-convention tab names', () => {
    const warnings: ImportWarning[] = []
    expect(parseContactSheet('Evaluacija', contactGrid(), warnings)).toBeNull()
  })

  it('parses roster, parent contacts and paid flags; skips the dropped columns', () => {
    const warnings: ImportWarning[] = []
    const sheet = parseContactSheet('PON_SLR3_1930-21', contactGrid(), warnings)

    expect(sheet).not.toBeNull()
    expect(sheet!.identity).toMatchObject({
      dayOfWeek: 'Ponedjeljak',
      courseSlug: 'slr-3',
      startTime: '19:30',
      endTime: '21:00',
    })
    expect(sheet!.teacherName).toBe('Vito Drnjević')
    expect(sheet!.rows).toHaveLength(2)
    expect(sheet!.rows[0]).toEqual({
      firstName: 'Kristian',
      lastName: 'Mutabdžija',
      parentName: 'Ivana Mutabdžija',
      parentEmail: 'ivana.m@gmail.com',
      parentPhone: '0911234567',
      paid: true,
    })
    expect(sheet!.rows[1].paid).toBe(false)
    expect(sheet!.rows[1].parentPhone).toBe('912345678')
    // Numeric phone cell produces an info-level nudge about the leading zero.
    expect(warnings.some((w) => w.level === 'info' && w.message.includes('MOBITEL'))).toBe(true)
  })

  it('warns when NAZIV PROGRAMA disagrees with the tab name', () => {
    const warnings: ImportWarning[] = []
    parseContactSheet('PON_SLR2_1830-20', contactGrid(), warnings)
    expect(warnings.some((w) => w.level === 'warn' && w.message.includes('disagrees'))).toBe(true)
  })

  it('sanitizes Outlook-style MAIL cells down to the bare address', () => {
    const grid: Grid = [
      ['BR.', 'IME:', 'PREZIME:', 'RODITELJ:', 'MAIL:', 'MOBITEL:', 'PLAĆENO'],
      [1, 'MARIJA', 'PERIĆ', 'MAMA PERIĆ', 'marija fredotović perić <Marija.FredotovicPeric@Outlook.com>', '0911111111', true],
      [2, 'IVAN', 'PERIĆ', 'MAMA PERIĆ', 'mailto:mama.peric@example.com', '0911111111', false],
      [3, 'ANA', 'PERIĆ', 'MAMA PERIĆ', 'Mama Perić <a@b.hr>; Tata Perić <c@d.hr>', '0911111111', false],
      [4, 'LUKA', 'PERIĆ', 'MAMA PERIĆ', 'nije mail', '0911111111', false],
    ]
    const warnings: ImportWarning[] = []
    const sheet = parseContactSheet('UTO_SLR1_1700-1830', grid, warnings)

    expect(sheet!.rows[0].parentEmail).toBe('marija.fredotovicperic@outlook.com')
    expect(sheet!.rows[1].parentEmail).toBe('mama.peric@example.com')
    // Multiple pasted contacts: the first angled address wins.
    expect(sheet!.rows[2].parentEmail).toBe('a@b.hr')
    // Residual garbage is imported as-is but loudly flagged.
    expect(sheet!.rows[3].parentEmail).toBe('nije mail')
    expect(
      warnings.filter((w) => w.level === 'warn' && w.message.includes("doesn't look like an email")),
    ).toHaveLength(1)
  })
})
