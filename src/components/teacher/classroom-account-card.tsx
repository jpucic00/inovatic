import { MonitorSmartphone } from 'lucide-react'
import type { ClassroomCredentials } from '@/actions/teacher/classroom'
import { CopyButton } from '@/components/shared/copy-button'

/**
 * The shared classroom login, shown on every visit to /nastavnik so nobody has
 * to remember it. Read-only by design: the account is created once by a
 * migration and there is nothing here (or anywhere in the app) to change it.
 */
export function ClassroomAccountCard({
  credentials,
}: Readonly<{ credentials: ClassroomCredentials | null }>) {
  return (
    <section
      aria-label="Račun za učionicu"
      className="mb-8 rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-cyan-600 shadow-sm">
          <MonitorSmartphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Račun za učionicu</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            Za računala u učionici — prijavite se na <span className="font-medium">/portal</span>, pa
            odaberite program i grupu. Vrijedi za sve grupe u ovoj školskoj godini; otvara samo materijale.
          </p>
          {credentials ? (
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <dt className="text-gray-500">Korisničko ime:</dt>
                <dd className="font-mono font-medium text-gray-900" data-testid="classroom-username">
                  {credentials.username}
                </dd>
                <CopyButton value={credentials.username} label="korisničko ime" />
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-gray-500">Lozinka:</dt>
                <dd className="font-mono font-medium text-gray-900" data-testid="classroom-password">
                  {credentials.password}
                </dd>
                <CopyButton value={credentials.password} label="lozinku" />
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              Račun za učionicu još nije postavljen — javite se administratoru.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
