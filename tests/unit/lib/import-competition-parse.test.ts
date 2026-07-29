import { describe, expect, it } from 'vitest'

import type { Grid, ImportWarning } from '@/lib/import-common/grid'
import { parseRecommendation } from '@/lib/import-common/values'
import { inspectCompetitionWorkbook, maskShape } from '@/lib/import-competition/inspect'
import {
  parseCompetitionEvaluationSheet,
  parseContactCell,
  parseDateOfBirth,
  parseGroupSheet,
  parseGroupTabName,
  parseStaffCell,
  resolveParentContact,
} from '@/lib/import-competition/parse'

const YEAR_START = 2025

describe('parseGroupTabName', () => {
  it('reads the day and time range out of every observed spelling', () => {
    expect(parseGroupTabName('SUB 900-1030')).toEqual({
      dayOfWeek: 'Subota', startTime: '9:00', endTime: '10:30',
    })
    expect(parseGroupTabName('PON_1700-1830')).toEqual({
      dayOfWeek: 'Ponedjeljak', startTime: '17:00', endTime: '18:30',
    })
    expect(parseGroupTabName('ČET 18:30-20:00')).toEqual({
      dayOfWeek: 'Četvrtak', startTime: '18:30', endTime: '20:00',
    })
    expect(parseGroupTabName('SRIJEDA 17-1830')).toEqual({
      dayOfWeek: 'Srijeda', startTime: '17:00', endTime: '18:30',
    })
  })

  it('keeps the range when the dash is spaced, but still drops a Numbers suffix', () => {
    expect(parseGroupTabName('SUB 900 - 1030')).toMatchObject({ startTime: '9:00', endTime: '10:30' })
    expect(parseGroupTabName('SUB 900-1030 - Tablica 1')).toMatchObject({
      dayOfWeek: 'Subota', startTime: '9:00',
    })
  })

  it('accepts a day-only tab (the group is then matched on its weekday alone)', () => {
    expect(parseGroupTabName('PON')).toEqual({
      dayOfWeek: 'Ponedjeljak', startTime: null, endTime: null,
    })
  })

  it('rejects anything that is not a competition group tab', () => {
    // The SLR archive's convention — must never be read as a competition group.
    expect(parseGroupTabName('PON_SLR2_1830-20')).toBeNull()
    expect(parseGroupTabName('IZVJEŠĆE 202526')).toBeNull()
    expect(parseGroupTabName('Info')).toBeNull()
    expect(parseGroupTabName('PREDBILJEŽBE')).toBeNull()
  })
})

describe('parseDateOfBirth', () => {
  it('reads the spellings the sheets use, day-first', () => {
    expect(parseDateOfBirth('12.3.2014.', YEAR_START)).toEqual({ status: 'ok', iso: '2014-03-12' })
    expect(parseDateOfBirth('05.11.2013', YEAR_START)).toEqual({ status: 'ok', iso: '2013-11-05' })
    expect(parseDateOfBirth('2014-03-12', YEAR_START)).toEqual({ status: 'ok', iso: '2014-03-12' })
    expect(parseDateOfBirth('12/03/2014', YEAR_START)).toEqual({ status: 'ok', iso: '2014-03-12' })
    expect(parseDateOfBirth(new Date(Date.UTC(2014, 2, 12)), YEAR_START)).toEqual({
      status: 'ok', iso: '2014-03-12',
    })
  })

  it('flags the archive junk instead of storing it', () => {
    expect(parseDateOfBirth('1.1.1900.', YEAR_START)).toEqual({
      status: 'implausible', iso: '1900-01-01',
    })
    // A child cannot be born after the school year starts either.
    expect(parseDateOfBirth('1.1.2026.', YEAR_START)).toMatchObject({ status: 'implausible' })
  })

  it('rejects impossible calendar dates and year-only cells', () => {
    expect(parseDateOfBirth('31.6.2014.', YEAR_START)).toEqual({ status: 'unparsable' })
    expect(parseDateOfBirth('29.2.2013.', YEAR_START)).toEqual({ status: 'unparsable' })
    expect(parseDateOfBirth(2014, YEAR_START)).toEqual({ status: 'unparsable' })
    expect(parseDateOfBirth('nepoznato', YEAR_START)).toEqual({ status: 'unparsable' })
  })

  it('treats an empty cell as empty, not as an error', () => {
    expect(parseDateOfBirth(null, YEAR_START)).toEqual({ status: 'empty' })
    expect(parseDateOfBirth('   ', YEAR_START)).toEqual({ status: 'empty' })
  })

  it('converts an Excel serial number', () => {
    // 41710 = 2014-03-12 on Excel's 1900 epoch.
    expect(parseDateOfBirth(41710, YEAR_START)).toEqual({ status: 'ok', iso: '2014-03-12' })
  })
})

describe('parseContactCell', () => {
  it('splits an Outlook paste into name and address', () => {
    expect(parseContactCell('Marija Perić <Marija.Peric@Outlook.com>')).toEqual({
      name: 'Marija Perić', email: 'marija.peric@outlook.com',
    })
  })

  it('reads a bare address and a bare name', () => {
    expect(parseContactCell('marija@example.com')).toEqual({ name: null, email: 'marija@example.com' })
    expect(parseContactCell('MARIJA PERIĆ')).toEqual({ name: 'Marija Perić', email: null })
  })

  it('handles mailto: links, quotes, and "Last, First" display names', () => {
    expect(parseContactCell('mailto:marija@example.com')).toMatchObject({ email: 'marija@example.com' })
    expect(parseContactCell('"Perić, Marija" <marija@example.com>')).toEqual({
      name: 'Marija Perić', email: 'marija@example.com',
    })
  })

  it('keeps the first of several pasted contacts', () => {
    expect(parseContactCell('Ana A <ana@example.com>; Ivo I <ivo@example.com>')).toEqual({
      name: 'Ana A', email: 'ana@example.com',
    })
  })

  it('is empty for an empty cell', () => {
    expect(parseContactCell('   ')).toEqual({ name: null, email: null })
  })
})

describe('resolveParentContact', () => {
  it('reads the paste from MAIL when that is the filled column', () => {
    expect(resolveParentContact('', 'Marija Perić <marija@example.com>')).toEqual({
      parentName: 'Marija Perić', parentEmail: 'marija@example.com',
    })
  })

  it('reads the paste from RODITELJ when MAIL is the empty one', () => {
    expect(resolveParentContact('Marija Perić <marija@example.com>', '')).toEqual({
      parentName: 'Marija Perić', parentEmail: 'marija@example.com',
    })
  })

  it('prefers the name from RODITELJ and the address from MAIL', () => {
    expect(resolveParentContact('MARIJA PERIĆ', 'Netko Drugi <marija@example.com>')).toEqual({
      parentName: 'Marija Perić', parentEmail: 'marija@example.com',
    })
  })
})

describe('parseRecommendation — competition tracks', () => {
  it('reads the per-team preporuke', () => {
    expect(parseRecommendation('NATJECATELJSKI PROGRAM - FLL')).toEqual({ kind: 'COMPETITION_FLL' })
    expect(parseRecommendation('Natjecateljski program – WRO')).toEqual({ kind: 'COMPETITION_WRO' })
    expect(parseRecommendation('FLL')).toEqual({ kind: 'COMPETITION_FLL' })
    expect(parseRecommendation('WRO')).toEqual({ kind: 'COMPETITION_WRO' })
  })

  it('still reads the program-level and course preporuke', () => {
    expect(parseRecommendation('Natjecateljski program')).toEqual({ kind: 'COMPETITION_PROGRAM' })
    // The archive's usual spelling.
    expect(parseRecommendation('PRIJELAZ NA NATJECATELJSKI PROGRAM')).toEqual({
      kind: 'COMPETITION_PROGRAM',
    })
    expect(parseRecommendation('Priprema za natjecanja')).toEqual({ kind: 'COMPETITION_PREP' })
    expect(parseRecommendation('SVIJET LEGO ROBOTIKE 2')).toEqual({ kind: 'COURSE', courseSlug: 'slr-2' })
  })
})

describe('parseStaffCell', () => {
  it('splits a pair sharing one cell', () => {
    expect(parseStaffCell('Ivano Tabak / Asja Pomoć')).toEqual(['Ivano Tabak', 'Asja Pomoć'])
  })

  it('drops a parenthetical note so it cannot end up inside the surname', () => {
    expect(parseStaffCell('Ivano Tabak (12.03.2026.)')).toEqual(['Ivano Tabak'])
    expect(parseStaffCell('Ivano Tabak (od 12.03.) / Asja Pomoć')).toEqual(['Ivano Tabak', 'Asja Pomoć'])
  })

  it('is empty for an empty cell', () => {
    expect(parseStaffCell('   ')).toEqual([])
    expect(parseStaffCell('()')).toEqual([])
  })
})

describe('parseGroupSheet', () => {
  // The real archive's captions: `DATUM ROD.` with a period, no trailing colons.
  const HEADER = ['BR.', 'IME', 'PREZIME', 'DATUM ROD.', 'RAZRED', 'RODITELJ', 'MAIL', 'MOBITEL']

  it('reads the DATUM ROD. caption despite its trailing period', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      HEADER,
      [1, 'ANA', 'ANIĆ', '12.3.2014.', '5. r', '', 'r@example.com', '0910000000'],
    ]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet!.rows[0].dateOfBirth).toBe('2014-03-12')
  })

  it('does not turn an unfilled, merged label row into a person', () => {
    const warnings: ImportWarning[] = []
    // A horizontally merged empty `ASISTENT:` reads its own caption back out of
    // every merged child cell.
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: FLL', 'NATJECATELJSKI PROGRAM: FLL'],
      ['MENTOR 1: IVANO TABAK'],
      ['MENTOR 2:', 'MENTOR 2:', 'MENTOR 2:'],
      ['ASISTENT:', 'ASISTENT:'],
      HEADER,
      [1, 'ANA', 'ANIĆ', '', '', '', '', ''],
    ]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet!.staffNames).toEqual(['IVANO TABAK'])
    expect(sheet!.teamLabel).toBe('FLL')
  })

  it('keeps importing past an unfilled roster slot in the middle of the table', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      HEADER,
      [1, 'ANA', 'ANIĆ', '', '', '', '', ''],
      [2, '', '', '', '', '', '', ''],
      [3, 'IVO', 'IVIĆ', '', '', '', '', ''],
      [4, '', '', '', '', '', '', ''],
      [5, 'MIA', 'MIĆ', '', '', '', '', ''],
    ]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet!.rows.map((r) => r.firstName)).toEqual(['Ana', 'Ivo', 'Mia'])
  })
})

describe('parseGroupSheet — staff block placement', () => {
  const HEADER = ['BR.', 'IME:', 'PREZIME:', 'DATUM ROĐENJA:', 'RODITELJ:', 'MAIL:', 'MOBITEL:']

  it('picks up a staff block that sits BELOW the roster table', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      HEADER,
      [1, 'ANA', 'ANIĆ', '12.3.2014.', 'RODITELJ ANIĆ', 'r@example.com', '0910000000'],
      [],
      ['NATJECATELJSKI PROGRAM: PRIPREME ZA NATJECANJA'],
      ['MENTOR 1: IVANO TABAK'],
      ['ASISTENT: ASJA POMOĆ'],
    ]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet).not.toBeNull()
    expect(sheet!.teamLabel).toBe('PRIPREME ZA NATJECANJA')
    expect(sheet!.staffNames).toEqual(['IVANO TABAK', 'ASJA POMOĆ'])
    expect(sheet!.rows).toHaveLength(1)
  })

  it('orders staff mentor 1 → mentor 2 → asistent, dropping blank rows', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: FLL TIM'],
      ['MENTOR 1: PRVI MENTOR'],
      ['MENTOR 2: DRUGI MENTOR'],
      ['ASISTENT:'],
      HEADER,
      [1, 'ANA', 'ANIĆ', '', '', '', ''],
    ]
    const sheet = parseGroupSheet('PON 1700-1830', grid, YEAR_START, warnings)
    expect(sheet!.staffNames).toEqual(['PRVI MENTOR', 'DRUGI MENTOR'])
  })

  it('does not read a staff row as a child when its value lands in the IME column', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      HEADER,
      [1, 'ANA', 'ANIĆ', '12.3.2014.', '', 'r@example.com', ''],
      // `MENTOR 1:` in the BR column puts the name exactly under IME.
      ['MENTOR 1:', 'IVANO TABAK'],
    ]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet!.rows.map((r) => r.firstName)).toEqual(['Ana'])
    expect(sheet!.staffNames).toEqual(['IVANO TABAK'])
  })

  it('warns but still imports when the tab has no team label or staff', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [HEADER, [1, 'ANA', 'ANIĆ', '', '', '', '']]
    const sheet = parseGroupSheet('SUB 900-1030', grid, YEAR_START, warnings)
    expect(sheet!.teamLabel).toBeNull()
    expect(sheet!.rows).toHaveLength(1)
    expect(warnings.filter((w) => w.level === 'warn')).toHaveLength(2)
  })

  it('returns null (not an error) for a sheet that is not a group tab', () => {
    expect(parseGroupSheet('Info', [['bilješke']], YEAR_START, [])).toBeNull()
  })
})

describe('parseCompetitionEvaluationSheet', () => {
  // The competition sheet's free-text column is POVRATNA INFORMACIJA.
  const HEADER = [
    'BR.', 'IME:', 'PREZIME:', 'RAZRADA IDEJA', 'IZVEDIVOST', 'INOVACIJE',
    'SURADNJA', 'KOMUNIKACIJA', 'ZABAVA', 'POVRATNA INFORMACIJA', 'PREPORUKA',
  ]

  it('reads the group off the NATJECATELJSKI PROGRAM label, which holds a weekday', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: PONEDJELJAK'],
      HEADER,
      [1, 'ANA', 'ANIĆ', 'Ostvareno', 'U razvoju', 'Početno', 'Ostvareno', 'Ostvareno', 'Odlično', 'Super.', 'WRO'],
    ]
    const blocks = parseCompetitionEvaluationSheet(grid, warnings)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ groupLabel: 'PONEDJELJAK', dayOfWeek: 'Ponedjeljak' })
    expect(blocks[0].rows[0].skills).toMatchObject({
      razradaIdeja: 'OSTVARENO',
      izvedivost: 'U_RAZVOJU',
      inovacije: 'POCETNO',
      suradnja: 'OSTVARENO',
      komunikacija: 'OSTVARENO',
    })
    // An unreadable skill value is reported, not guessed.
    expect(blocks[0].rows[0].skills.zabava).toBeNull()
    expect(warnings.some((w) => w.message.includes('unrecognized zabava'))).toBe(true)
  })

  it('does not mistake a data row for the second half of a merged header', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: PONEDJELJAK'],
      HEADER,
      // "Inovacije" is a caption word — as a PREPORUKA value it must not make
      // this row read as a header, which would drop the child silently.
      [1, 'ANA', 'ANIĆ', 'Ostvareno', '', '', '', '', '', '', 'Inovacije'],
      [2, 'IVO', 'IVIĆ', 'Ostvareno', '', '', '', '', '', '', 'WRO'],
    ]
    const blocks = parseCompetitionEvaluationSheet(grid, warnings)
    expect(blocks[0].rows.map((r) => r.firstName)).toEqual(['Ana', 'Ivo'])
  })

  it('also accepts the SLR spelling (PROGRAM: … / GRUPA: …)', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['PROGRAM: NATJECATELJSKI PROGRAM'],
      ['GRUPA: SUBOTA'],
      ['MENTOR 1: IVANO TABAK'],
      HEADER,
      [1, 'ANA', 'ANIĆ', 'Ostvareno', '', '', '', '', '', '', ''],
    ]
    const blocks = parseCompetitionEvaluationSheet(grid, warnings)
    expect(blocks[0]).toMatchObject({ dayOfWeek: 'Subota', staffNames: ['IVANO TABAK'] })
  })

  it('errors when the label is not a weekday, so the block cannot be matched', () => {
    const warnings: ImportWarning[] = []
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: FLL TIM'],
      HEADER,
      [1, 'ANA', 'ANIĆ', 'Ostvareno', '', '', '', '', '', '', ''],
    ]
    parseCompetitionEvaluationSheet(grid, warnings)
    expect(warnings.some((w) => w.level === 'error' && w.message.includes('not a recognizable weekday'))).toBe(true)
  })
})

describe('maskShape', () => {
  it('reveals the format of a value without revealing the value', () => {
    expect(maskShape('12.03.2014.')).toBe('9{2}.9{2}.9{4}.')
    expect(maskShape('Ana Anić')).toBe('A{3} A{4}')
    expect(maskShape('marija@example.com')).toBe('A{6}@A{7}.A{3}')
  })
})

describe('inspectCompetitionWorkbook', () => {
  // The whole point of --inspect is that its output can be pasted into a chat.
  // These are the values that must never survive into it.
  const SECRETS = [
    'Marijana', 'Horvatinčić', 'marijana.horvatincic@example.com', '0917654321', '12.03.2014',
  ]

  it('never emits a cell value, not even from a row it mistakes for a header', () => {
    const grid: Grid = [
      ['NATJECATELJSKI PROGRAM: PRIPREME ZA NATJECANJA'],
      ['MENTOR 1: Marijana Horvatinčić'],
      ['BR.', 'IME:', 'PREZIME:', 'DATUM ROĐENJA:', 'RODITELJ:', 'MAIL:', 'MOBITEL:'],
      [1, 'Ana', 'Anić', '12.03.2014', 'Marijana Horvatinčić', 'marijana.horvatincic@example.com', '0917654321'],
      // A row of names with no leading number — the shape most likely to be
      // misread as a header row, which is what the caption gate exists for.
      ['Marijana', 'Horvatinčić', 'marijana.horvatincic@example.com'],
    ]
    const out = inspectCompetitionWorkbook([{ name: 'SUB 900-1030', grid }]).join('\n')

    for (const secret of SECRETS) expect(out).not.toContain(secret)
    // …while still reporting what a parser needs.
    expect(out).toContain('reads as a GROUP TAB → Subota 9:00–10:30')
    expect(out).toContain('NATJECATELJSKI PROGRAM')
    expect(out).toContain('MENTOR 1')
    expect(out).toContain('9{2}.9{2}.9{4}')
  })

  it('reports an unrecognized caption row by shape instead of quoting it', () => {
    const grid: Grid = [
      ['Marijana', 'Horvatinčić', 'Nepoznato'],
    ]
    const out = inspectCompetitionWorkbook([{ name: 'Info', grid }]).join('\n')
    expect(out).toContain('no known caption')
    expect(out).not.toContain('Horvatinčić')
  })
})
