import { formatDate } from '@/lib/format'

/**
 * Whether the account's owner has chosen their own password, and when a link
 * last went out — the two things staff need instead of a readable password.
 */
export function PasswordStatus({
  passwordSetAt,
  linkSentAt,
}: Readonly<{ passwordSetAt: Date | null; linkSentAt: Date | null }>) {
  return (
    <span className="text-sm">
      {passwordSetAt ? (
        <span className="text-emerald-700">Postavljena {formatDate(passwordSetAt)}</span>
      ) : (
        <span className="text-amber-700">Još nije postavljena</span>
      )}
      {linkSentAt && (
        <span className="text-gray-400"> · poveznica poslana {formatDate(linkSentAt)}</span>
      )}
    </span>
  )
}
