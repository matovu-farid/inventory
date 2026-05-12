import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { z } from "zod"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  inviteUser,
  resendInvite,
  removeUser,
  setUserRole,
  listUsers,
} from "#/server/functions/admin/users"
import { getSession } from "#/server/middleware/auth"

export const Route = createFileRoute("/settings/users")({
  beforeLoad: ({ context }) => requireUiPermission(context, "users.manage"),
  loader: async () => {
    const [result, session] = await Promise.all([listUsers(), getSession()])
    return { result, currentUserId: session?.user.id ?? null }
  },
  component: UsersPage,
})

type Row = {
  id: string
  email: string
  name?: string | null
  role?: string | null
  emailVerified?: boolean | null
}

function UsersPage() {
  const { result, currentUserId } = Route.useLoaderData()
  const router = useRouter()
  // better-auth listUsers returns { users: [...] }
  const list: Row[] = ((result as any).users ?? result) as Row[]
  const [open, setOpen] = useState(false)

  const [resendingId, setResendingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null)
  const [invitePending, setInvitePending] = useState(false)
  const [inviteError, setInviteError] = useState<string | undefined>()

  async function handleRoleChange(
    userId: string,
    role: "admin" | "supervisor" | "sales",
  ) {
    setRoleChangingId(userId)
    try {
      await setUserRole({ data: { userId, role } })
      router.invalidate()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to change role")
    } finally {
      setRoleChangingId(null)
    }
  }

  async function handleInvite(values: {
    email: string
    name: string
    role: "admin" | "supervisor" | "sales"
  }) {
    setInviteError(undefined)
    setInvitePending(true)
    try {
      await inviteUser({ data: values })
      setOpen(false)
      router.invalidate()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setInvitePending(false)
    }
  }

  async function handleResend(userId: string) {
    setResendingId(userId)
    try {
      await resendInvite({ data: { userId } })
    } catch {
      // swallow — could add toast here in future
    } finally {
      setResendingId(null)
    }
  }

  async function handleRemove(u: Row) {
    if (!confirm(`Remove ${u.email}?`)) return
    setRemovingId(u.id)
    try {
      await removeUser({ data: { userId: u.id } })
      router.invalidate()
    } catch {
      // swallow
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setInviteError(undefined)
          }}
        >
          <DialogTrigger asChild>
            <Button>Invite user</Button>
          </DialogTrigger>
          <InviteDialog
            open={open}
            onSubmit={handleInvite}
            pending={invitePending}
            error={inviteError}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u) => {
                const isSelf = u.id === currentUserId
                const role = (u.role ?? "sales") as
                  | "admin"
                  | "supervisor"
                  | "sales"
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.name ?? "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {isSelf ? (
                        <span className="text-muted-foreground">{role}</span>
                      ) : (
                        <Select
                          value={role}
                          onValueChange={(v) =>
                            handleRoleChange(
                              u.id,
                              v as "admin" | "supervisor" | "sales",
                            )
                          }
                          disabled={roleChangingId === u.id}
                        >
                          <SelectTrigger className="h-8 w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="supervisor">
                              Supervisor
                            </SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.emailVerified ? "Active" : "Invited"}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {!u.emailVerified && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResend(u.id)}
                          disabled={resendingId === u.id}
                        >
                          {resendingId === u.id ? "Sending..." : "Resend invite"}
                        </Button>
                      )}
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(u)}
                          disabled={removingId === u.id}
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "supervisor", "sales"]),
})

function InviteDialog({
  open,
  onSubmit,
  pending,
  error,
}: {
  open: boolean
  onSubmit: (v: z.infer<typeof inviteSchema>) => void
  pending: boolean
  error?: string
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<"admin" | "supervisor" | "sales">("sales")

  useEffect(() => {
    if (!open) {
      setEmail("")
      setName("")
      setRole("sales")
    }
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = inviteSchema.safeParse({ email, name, role })
    if (!parsed.success) return
    onSubmit(parsed.data)
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite a new user</DialogTitle>
        <DialogDescription>
          They&apos;ll get an email with a link to set their password and join.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(v) =>
              setRole(v as "admin" | "supervisor" | "sales")
            }
          >
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send invite"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
