export { RequestAccessRateLimiter } from './durable-objects/request-access-rate-limiter'

export default {
  fetch(): Response {
    return new Response('ok')
  },
}
