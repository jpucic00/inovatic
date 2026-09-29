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
  // The check MUST stay positive and wrap the imports: Next compiles this file
  // for the edge runtime too, and webpack only drops code inside an
  // `if (… === 'nodejs')` it can fold to false — an early `return` did not stop
  // it bundling what came after, and `node:crypto` (password tokens) then broke
  // the edge build and every route with it. For the same reason the node-only
  // half is its own module: a function in this file is bundled either way.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node')
    await registerNode()
  }
}
