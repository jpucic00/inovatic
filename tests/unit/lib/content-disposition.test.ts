import { describe, expect, it } from 'vitest'
import { attachmentContentDisposition } from '@/lib/content-disposition'

describe('attachmentContentDisposition', () => {
  it('gives an ASCII fallback with no raw quote, backslash or non-printable character', () => {
    const header = attachmentContentDisposition('Ugovor "A"\\ – Šibenik\r\n.pdf')
    const fallback = /filename="([^"]*)"/.exec(header)?.[1]
    expect(fallback).toBe('Ugovor _A__ _ Sibenik__.pdf')
    expect(header).not.toMatch(/[\r\n]/)
  })

  it('carries the exact UTF-8 name in filename*, round-tripping through decodeURIComponent', () => {
    const name = "Djeca's ugovor (1) – Šibenik*.pdf"
    const header = attachmentContentDisposition(name)
    const encoded = /filename\*=UTF-8''(.+)$/.exec(header)?.[1] ?? ''
    // RFC 5987 attr-char: no ' ( ) * left raw.
    expect(encoded).not.toMatch(/['()*]/)
    expect(decodeURIComponent(encoded)).toBe(name)
  })
})
