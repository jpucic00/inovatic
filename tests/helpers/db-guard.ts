/**
 * Guard predicate for destructive E2E helpers that reach the database by NAME
 * rather than by run-scoped id.
 *
 * Deliberately a bare module with zero imports so the unit tier can test it
 * without dragging the Prisma client into jsdom. Recognizes the same hosts as
 * `scripts/refresh-dev-dates.ts`'s assertLocalDatabase — the two guards front
 * the same class of mistake (a shell whose DATABASE_URL points somewhere real)
 * and must not drift apart in what they call "local".
 */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  return /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url ?? '')
}
