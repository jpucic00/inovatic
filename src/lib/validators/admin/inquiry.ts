import { z } from 'zod'
import { InquiryStatus } from '@prisma/client'

export const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(InquiryStatus),
})

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>
