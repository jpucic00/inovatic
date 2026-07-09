/**
 * Tab-strip class helper. Returns the combined Tailwind class string for a
 * tab button/link, based on whether it is the active tab. Two size variants:
 *
 * - 'sm' (default): compact tabs used in panels (px-3 py-1.5 text-xs)
 * - 'lg': wider tabs used in page-level navigation (px-4 py-2 text-sm)
 */
export function tabClass(isActive: boolean, size: 'sm' | 'lg' = 'sm'): string {
  const base =
    size === 'lg'
      ? 'px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors'
      : 'px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-colors'
  const state = isActive
    ? size === 'lg'
      ? 'border-cyan-600 text-cyan-700 bg-white'
      : 'border-cyan-600 text-cyan-700'
    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  return `${base} ${state}`
}
