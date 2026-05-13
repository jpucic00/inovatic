export function mimeMatchesBytes(declared: string, buf: Buffer): boolean {
  if (buf.length < 12) return false
  switch (declared) {
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38
    case 'image/webp':
      return (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50   // WEBP
      )
    case 'application/pdf':
      return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 // %PDF
    case 'application/msword':
    case 'application/vnd.ms-powerpoint':
      return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 // OLE2
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 // ZIP (PK)
    case 'video/mp4':
    case 'video/quicktime': {
      const box = buf.toString('ascii', 4, 8)
      return ['ftyp', 'moov', 'mdat', 'free', 'junk', 'wide', 'pnot'].includes(box)
    }
    case 'video/webm':
      return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3
    case 'text/plain':
    case 'text/markdown':
      return true // no fixed magic bytes for text
    default:
      return true
  }
}
