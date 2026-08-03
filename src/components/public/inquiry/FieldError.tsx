export function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) return null
  // role="alert": announced by screen readers the moment it appears — the
  // correct semantics for a validation message (and what the E2E smoke
  // test looks for).
  return (
    <p role="alert" className="text-sm text-red-600 mt-1">
      {message}
    </p>
  )
}
