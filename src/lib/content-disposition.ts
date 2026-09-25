/**
 * RFC 6266 header carrying both an ASCII fallback and the exact UTF-8 name —
 * Croatian filenames ("Ugovor – Šibenik.pdf") would otherwise arrive mangled.
 */
export function attachmentContentDisposition(filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^\x20-\x7e]/g, '_')
    .replaceAll(/["\\]/g, '_')
  // encodeURIComponent leaves ' ( ) * unescaped, which RFC 5987 does not allow.
  const encoded = encodeURIComponent(filename).replaceAll(
    /['()*]/g,
    (c) => `%${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
