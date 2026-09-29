/**
 * The Node.js half of `register()` in `src/instrumentation.ts` — the boot-time
 * mails. Its own module so the edge build never sees it (see there).
 */
export async function registerNode() {
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
  const { sendPasswordRolloutToStaff } = await import('@/lib/password-rollout')

  // Deliberately NOT awaited: an unreachable mail provider must not hold up the
  // healthcheck and fail the deploy. Nothing downstream depends on the result,
  // and an unclaimed send is simply retried by the next start. The two run one
  // after the other so together they stay inside Resend's 2 requests a second,
  // and a failure in the first does not cancel the second.
  void (async () => {
    await announcePendingReleases().catch((err) => {
      console.error('Release announcement failed:', err)
    })
    // One-time (2026-09-29): a setup link to every admin and teacher.
    await sendPasswordRolloutToStaff().catch((err) => {
      console.error('Password rollout failed:', err)
    })
  })()
}
