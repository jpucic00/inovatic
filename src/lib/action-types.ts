export type AdminActionResult =
  | { success: true }
  | { success: false; error: string; code?: 'GROUP_FULL' }
