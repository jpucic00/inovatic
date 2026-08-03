import { CITIES, LOCATIONS } from '@/lib/locations'

/** "+385 99 393 6993" → "tel:+385993936993". */
function telHref(phone: string): string {
  return `tel:${phone.replaceAll(' ', '')}`
}

/**
 * The "Imate pitanja?" box every signup page shows — BOTH cities, always,
 * whatever program the page belongs to (owner decision 2026-08-03: uniform on
 * /upisi, /upisi/[slug] and /radionice/[slug], including city-pinned
 * radionice). Inboxes and phones come from locations.ts so a staffing change
 * happens in exactly one place.
 */
export function SignupContactBox({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      className={`bg-cyan-50 rounded-xl p-4 border border-cyan-100 text-sm text-gray-500 space-y-2 ${className ?? ''}`}
    >
      <p className="font-medium text-gray-700">Imate pitanja?</p>
      {CITIES.map(({ slug, label }) => {
        const city = LOCATIONS[slug]
        return (
          <div key={slug} className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {label}
            </p>
            <a
              href={`mailto:${city.upisi}`}
              className="text-cyan-500 hover:underline block"
            >
              {city.upisi}
            </a>
            <a href={telHref(city.phone)} className="text-cyan-500 hover:underline block">
              {city.phone}
            </a>
          </div>
        )
      })}
    </div>
  )
}
