import { z } from 'zod'

export const requestAccessInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  message: z.string().trim().min(1).max(4000),
})

export type RequestAccessInput = z.infer<typeof requestAccessInput>
