import { describe, expect, it } from 'vitest'
import { isLocalDatabaseUrl } from '../../helpers/db-guard'

/**
 * Fronts `dropPreviousBootstrapGroups`, which deletes groups BY NAME —
 * including TeacherAttendance payout rows — so "local" must mean local.
 * Kept in lockstep with `scripts/refresh-dev-dates.ts`'s assertLocalDatabase.
 */
describe('isLocalDatabaseUrl', () => {
  it('accepts the three local hosts, with port or bare path', () => {
    expect(
      isLocalDatabaseUrl('postgresql://inovatic:pw@localhost:5432/inovatic'),
    ).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1:5432/db')).toBe(true)
    expect(isLocalDatabaseUrl('postgresql://u:p@host.docker.internal/db')).toBe(true)
  })

  it('refuses a real-looking remote URL', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://user:pw@ep-cool-name-123.eu-central-1.aws.neon.tech/neondb',
      ),
    ).toBe(false)
  })

  it('refuses when the variable is unset or empty — no URL is not a local URL', () => {
    expect(isLocalDatabaseUrl(undefined)).toBe(false)
    expect(isLocalDatabaseUrl('')).toBe(false)
  })

  it('is not fooled by "localhost" outside the host position', () => {
    expect(isLocalDatabaseUrl('postgresql://localhost:pw@db.example.com/app')).toBe(false)
    expect(isLocalDatabaseUrl('postgresql://u:p@example.com/localhost')).toBe(false)
  })
})
