/**
 * RFC 6266 header carrying both an ASCII fallback and the exact UTF-8 name —
 * Croatian filenames ("Ugovor – Šibenik.pdf") would otherwise arrive mangled.
 */
export function attachmentContentDisposition(filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
