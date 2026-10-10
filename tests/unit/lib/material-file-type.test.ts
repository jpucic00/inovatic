import { describe, expect, it } from 'vitest'
import {
  MATERIAL_FILE_ACCEPT,
  MAX_MATERIAL_FILE_BYTES,
  classifyMaterialFile,
  titleFromFileName,
  uploadErrorMessage,
} from '@/lib/material-file-type'

const file = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('classifyMaterialFile', () => {
  it('maps documents, presentations and videos by their declared type', () => {
    expect(classifyMaterialFile(file('a.pdf', 'application/pdf'))).toEqual({
      ok: true,
      type: 'DOCUMENT',
      mimeType: 'application/pdf',
    })
    expect(
      classifyMaterialFile(
        file('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      ),
    ).toMatchObject({ ok: true, type: 'PRESENTATION' })
    expect(classifyMaterialFile(file('clip.mov', 'video/quicktime'))).toMatchObject({ ok: true, type: 'VIDEO' })
  })

  it('accepts images as documents', () => {
    expect(classifyMaterialFile(file('model.JPG', 'image/jpeg'))).toMatchObject({ ok: true, type: 'DOCUMENT' })
  })

  it('falls back to the extension when the browser reports no usable type', () => {
    expect(classifyMaterialFile(file('upute.md', ''))).toEqual({
      ok: true,
      type: 'DOCUMENT',
      mimeType: 'text/markdown',
    })
    expect(classifyMaterialFile(file('Prezentacija.PPT', 'application/octet-stream'))).toEqual({
      ok: true,
      type: 'PRESENTATION',
      mimeType: 'application/vnd.ms-powerpoint',
    })
  })

  it('refuses an unsupported file with its name', () => {
    const res = classifyMaterialFile(file('tablica.xlsx', 'application/vnd.ms-excel'))
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('tablica.xlsx')
    expect(classifyMaterialFile(file('bez-ekstenzije', '')).ok).toBe(false)
    // Prototype keys are not types.
    expect(classifyMaterialFile(file('x.constructor', 'constructor')).ok).toBe(false)
  })

  it('refuses a file over 50 MB', () => {
    expect(classifyMaterialFile(file('a.pdf', 'application/pdf', MAX_MATERIAL_FILE_BYTES)).ok).toBe(true)
    const res = classifyMaterialFile(file('a.mp4', 'video/mp4', MAX_MATERIAL_FILE_BYTES + 1))
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('50 MB')
  })

  it('offers both the MIME types and the extensions to the picker', () => {
    expect(MATERIAL_FILE_ACCEPT).toContain('application/pdf')
    expect(MATERIAL_FILE_ACCEPT).toContain('.md')
  })
})

describe('titleFromFileName', () => {
  it('drops the extension', () => {
    expect(titleFromFileName('Radni list 3.pdf')).toBe('Radni list 3')
    expect(titleFromFileName('arhiva.tar.gz')).toBe('arhiva.tar')
  })

  it('collapses whitespace', () => {
    expect(titleFromFileName('  Uvod   u  Spike .pptx ')).toBe('Uvod u Spike')
  })

  it('keeps the extension when the bare name is too short to save', () => {
    expect(titleFromFileName('a.pdf')).toBe('a.pdf')
  })

  it('keeps a dotfile-like or extensionless name whole', () => {
    expect(titleFromFileName('README')).toBe('README')
    expect(titleFromFileName('.skriveno')).toBe('.skriveno')
  })

  it('caps the title at 200 characters', () => {
    expect(titleFromFileName(`${'x'.repeat(300)}.pdf`)).toHaveLength(200)
  })
})

describe('uploadErrorMessage', () => {
  it('names the reason in Croatian', () => {
    expect(uploadErrorMessage(413)).toContain('prevelika')
    expect(uploadErrorMessage(415)).toContain('ne odgovara')
    expect(uploadErrorMessage(401)).toContain('prijavite')
    expect(uploadErrorMessage(502)).toContain('nije uspio')
  })
})
