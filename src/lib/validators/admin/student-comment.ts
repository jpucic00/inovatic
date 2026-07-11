import { z } from 'zod'

export const createCommentSchema = z.object({
  studentId: z.string().min(1),
  groupId: z.string().min(1),
  content: z.string().min(1).max(2000),
})
