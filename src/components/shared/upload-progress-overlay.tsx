import { Loader2 } from 'lucide-react'

/**
 * Covers an upload form while its files go to Cloudinary and the save runs:
 * what is happening, how far along, and why it must not be left. The parent
 * must be `relative` (or a positioned box such as a dialog) and must itself
 * refuse to close or navigate meanwhile — the overlay only says so.
 */
export function UploadProgressOverlay({
  label,
  progress,
  hint,
}: Readonly<{
  label: string
  /** 0..1 for an upload bar; null while saving (spinner only). */
  progress: number | null
  hint: string
}>) {
  const percent = progress === null ? null : Math.round(progress * 100)
  return (
    <output
      aria-live="polite"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/90 px-6 text-center"
    >
      <Loader2 className="h-7 w-7 animate-spin text-cyan-600" aria-hidden />
      <span className="block text-sm font-medium text-gray-800">
        {percent === null ? label : `${label} ${percent} %`}
      </span>
      {percent === null ? null : (
        <progress
          max={100}
          value={percent}
          aria-label="Prijenos"
          className="h-2 w-56 max-w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-cyan-600 [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-cyan-600"
        />
      )}
      <span className="block text-xs text-gray-500">{hint}</span>
    </output>
  )
}
