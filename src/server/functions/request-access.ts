import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sendRequestAccessEmail } from '#/lib/email'

export const requestAccessInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  message: z.string().trim().min(1).max(4000),
})

export async function submitRequestAccess(
  data: z.infer<typeof requestAccessInput>,
) {
  const sent = await sendRequestAccessEmail(data)

  if (sent === false) {
    throw new Error('Could not send access request')
  }

  return { ok: true as const }
}

export const requestAccess = createServerFn()
  .inputValidator(requestAccessInput)
  .handler(({ data }) => submitRequestAccess(data))
