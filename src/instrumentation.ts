/**
 * Next.js runs `register()` once per server process, before the first request
 * is served. That is the trigger for the release e-mail: Railway starts a fresh
 * process on every deploy, so a pushed release announces itself within seconds
 * of going live — no cron job, no route to protect, and no waiting for an admin
 * to happen to open a page.
 *
 * Everything this touches is idempotent by construction (see
 * `src/lib/release-announce.ts`), because `register()` also runs on every crash
 * restart and would otherwise re-send.
 */
export async function register() {
  // Edge runtime gets its own register() call, and Prisma cannot run there.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // `npm run dev` must never mail anyone. This machine's `.env.local` holds a
  // working Resend key, so the key check inside the announcer is NOT enough on
  // its own — a dev boot would otherwise announce to whatever admins the local
  // seed created. The same gate covers a production build run locally
  // (`npm run build && npm start`), which is the one case that reads real
  // credentials outside Railway; set RELEASE_ANNOUNCE_DISABLED=1 in
  // `.env.local` if you ever need to keep that build quiet for another reason.
  if (process.env.NODE_ENV !== 'production') return
  if (process.env.RELEASE_ANNOUNCE_DISABLED) return

  const { announcePendingReleases } = await import('@/lib/release-announce')

  // Deliberately NOT awaited: an unreachable mail provider must not hold up the
  // healthcheck and fail the deploy. Nothing downstream depends on the result,
  // and an unclaimed release is simply announced by the next start.
  void announcePendingReleases().catch((err) => {
    console.error('Release announcement failed:', err)
  })
}
