export function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) return null
  return <p className="text-sm text-red-600 mt-1">{message}</p>
}
