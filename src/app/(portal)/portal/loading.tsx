import { Skeleton } from '@/components/ui/skeleton'

/**
 * `/portal` serves three audiences behind one `await auth()`: a guest gets the
 * sign-in screen, a student the dashboard, and staff a redirect to their own
 * panel. The segment is dynamic, so this fallback always paints first — and a
 * guest is the most common arrival, since every auth redirect in the app lands
 * here. It therefore stays deliberately neutral: a centred card on the same
 * `min-h-screen bg-gray-50` frame `<LoginScreen>` uses, rather than the
 * four-card "Moje grupe" skeleton that used to flash a dashboard at people who
 * were not logged in.
 */
export default function PortalLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="mt-6 h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-10 w-full mb-6" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  )
}
