export type AdminActionResult =
  | { success: true }
  | { success: false; error: string; code?: 'GROUP_FULL' }

export type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}
