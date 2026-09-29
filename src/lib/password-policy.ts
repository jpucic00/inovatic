/**
 * What a chosen password must satisfy — the ONE rule behind the setup-link page
 * and the staff change-password form, and client-safe so both can show the same
 * message before submitting. The server re-checks with the same function.
 *
 * Deliberately NIST SP 800-63B shaped: length and a block-list, no composition
 * rules. "One capital, one digit, one symbol" produces `Lozinka1!`, which is on
 * every list an attacker starts with; a long phrase a parent can remember is
 * stronger and actually gets typed on a phone.
 */

export const PASSWORD_MIN_LENGTH = 8

/**
 * bcrypt only reads the first 72 BYTES. Beyond that, two different passwords
 * would hash the same — so a longer one is refused rather than silently cut.
 * Bytes, not characters: `č` is two.
 */
const PASSWORD_MAX_BYTES = 72

/**
 * The obvious first guesses, including the Croatian ones and this association's
 * own name. Not exhaustive and not meant to be — the login throttle carries the
 * rest; this list only stops the passwords a bot tries in its first minute.
 * Compared case-insensitively after trimming.
 */
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  '12341234', '11223344', '123123123', '147258369', '12344321', '1q2w3e4r',
  'password', 'password1', 'password123', 'passw0rd', 'qwertyui', 'qwerty123',
  'qwertzui', 'qwertz123', 'asdfghjk', 'yxcvbnm1', 'abcd1234', 'abc12345',
  'iloveyou', 'letmein1', 'welcome1', 'sunshine', 'football', 'princess',
  'lozinka', 'lozinka1', 'lozinka123', 'lozinka12', 'sifra123', 'šifra123',
  'zaporka1', 'zaporka123', 'inovatic', 'inovatic1', 'inovatic123',
  'inovatic2025', 'inovatic2026', 'robotika', 'robotika1', 'robotika123',
  'lego1234', 'legolego', 'hajduk1950', 'hajduk123', 'dinamo123', 'croatia1',
  'hrvatska', 'hrvatska1', 'split123', 'sibenik1', 'šibenik1', 'volimte1',
])

type PasswordProblem =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'COMMON'
  | 'CONTAINS_IDENTITY'
  | 'MISMATCH'

export const PASSWORD_PROBLEM_MESSAGE: Record<PasswordProblem, string> = {
  TOO_SHORT: `Lozinka mora imati barem ${PASSWORD_MIN_LENGTH} znakova.`,
  TOO_LONG: 'Lozinka je predugačka.',
  COMMON: 'Ova lozinka je preopćenita i lako se pogodi. Odaberite drugu.',
  CONTAINS_IDENTITY: 'Lozinka ne smije sadržavati vaš e-mail.',
  MISMATCH: 'Lozinke se ne podudaraju.',
}

/**
 * First problem with `password`, or null when it is acceptable. `email` is the
 * account's address: its local part must not be the password's backbone
 * (`ivana.anic` → `ivana.anic1`), and it is ignored when too short to mean
 * anything.
 */
export function passwordProblem(
  password: string,
  confirm: string,
  email: string | null,
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'TOO_SHORT'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'TOO_LONG'
  const folded = password.trim().toLowerCase()
  if (COMMON_PASSWORDS.has(folded)) return 'COMMON'
  const local = email?.split('@')[0]?.trim().toLowerCase() ?? ''
  if (local.length >= 4 && folded.includes(local)) return 'CONTAINS_IDENTITY'
  if (password !== confirm) return 'MISMATCH'
  return null
}
