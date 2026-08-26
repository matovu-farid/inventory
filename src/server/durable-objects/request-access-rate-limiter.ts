import { DurableObject } from 'cloudflare:workers'

export const REQUEST_ACCESS_COOLDOWN_MS = 60_000
export const REQUEST_ACCESS_GLOBAL_INTERVAL_MS = 5_000
const GLOBAL_ADMISSION_KEY = '__global__'

type Reservation = {
  token: string
}

type ClientReservationRow = {
  client_key: string
  token: string
  reserved_until: number
}

type GlobalReservationRow = {
  token: string
  available_until: number
}

export class RequestAccessRateLimiter extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(() => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS request_access_clients (
          client_key TEXT PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          reserved_until INTEGER NOT NULL
        )
      `)
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS request_access_global (
          id TEXT PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          available_until INTEGER NOT NULL
        )
      `)
      return Promise.resolve()
    })
  }

  reserve(clientKey: string, now = Date.now()): Reservation | null {
    const token = crypto.randomUUID()

    return this.ctx.storage.transactionSync(() => {
      const client = this.ctx.storage.sql
        .exec<ClientReservationRow>(
          `SELECT client_key, token, reserved_until
             FROM request_access_clients
            WHERE client_key = ?`,
          clientKey,
        )
        .toArray()
        .at(0)
      const global = this.ctx.storage.sql
        .exec<GlobalReservationRow>(
          `SELECT token, available_until
             FROM request_access_global
            WHERE id = ?`,
          GLOBAL_ADMISSION_KEY,
        )
        .toArray()
        .at(0)

      if (
        (client && client.reserved_until > now) ||
        (global && global.available_until > now)
      ) {
        return null
      }

      this.ctx.storage.sql.exec(
        `INSERT INTO request_access_clients
          (client_key, token, reserved_until)
         VALUES (?, ?, ?)
         ON CONFLICT(client_key) DO UPDATE SET
          token = excluded.token,
          reserved_until = excluded.reserved_until`,
        clientKey,
        token,
        now + REQUEST_ACCESS_COOLDOWN_MS,
      )
      this.ctx.storage.sql.exec(
        `INSERT INTO request_access_global
          (id, token, available_until)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          token = excluded.token,
          available_until = excluded.available_until`,
        GLOBAL_ADMISSION_KEY,
        token,
        now + REQUEST_ACCESS_GLOBAL_INTERVAL_MS,
      )

      return { token }
    })
  }

  clear(token: string): void {
    this.ctx.storage.transactionSync(() => {
      const client = this.ctx.storage.sql
        .exec<ClientReservationRow>(
          `SELECT client_key, token, reserved_until
             FROM request_access_clients
            WHERE token = ?`,
          token,
        )
        .toArray()
        .at(0)

      if (!client) return

      this.ctx.storage.sql.exec(
        `DELETE FROM request_access_clients WHERE token = ?`,
        token,
      )

      const global = this.ctx.storage.sql
        .exec<GlobalReservationRow>(
          `SELECT token, available_until
             FROM request_access_global
            WHERE id = ? AND token = ?`,
          GLOBAL_ADMISSION_KEY,
          token,
        )
        .toArray()
        .at(0)

      if (global) {
        this.ctx.storage.sql.exec(
          `DELETE FROM request_access_global WHERE id = ? AND token = ?`,
          GLOBAL_ADMISSION_KEY,
          token,
        )
      }
    })
  }
}
