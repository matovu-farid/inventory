import { createServerFn } from '@tanstack/react-start'
import { requestAccessInput } from './request-access-input'
import { submitRequestAccess } from './request-access.server'

export { requestAccessInput } from './request-access-input'

export const requestAccess = createServerFn()
  .inputValidator(requestAccessInput)
  .handler(({ data }) => submitRequestAccess(data))
