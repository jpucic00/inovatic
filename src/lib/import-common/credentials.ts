import { stripDiacritics } from './grid'

// Credential synthesis for imported accounts — mirrors src/actions/admin/student.ts.

export function usernameBase(firstName: string, lastName: string): string {
  return stripDiacritics(`${firstName}${lastName}`)
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^a-z0-9]/g, '')
}

export function claimUnique(base: string, taken: Set<string>): string {
  let candidate = base
  let suffix = 2
  while (taken.has(candidate)) candidate = `${base}${suffix++}`
  taken.add(candidate)
  return candidate
}
