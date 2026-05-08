import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
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
  listUsers,
} from "#/server/functions/admin/users"

export const Route = createFileRoute("/settings/users")({
  loader: async () => {
    const result = await listUsers()
    return { result }
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
  const { result } = Route.useLoaderData()
  const router = useRouter()
  // better-auth listUsers returns { users: [...] }
  const list: Row[] = ((result as any).users ?? result) as Row[]
  const [open, setOpen] = useState(false)

  const [resendingId, setResendingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [invitePending, setInvitePending] = useState(false)
  const [inviteError, setInviteError] = useState<string | undefined>()

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Invite user</Button>
          </DialogTrigger>
          <InviteDialog
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
              {list.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role ?? "sales"}</TableCell>
                  <TableCell>
                    {u.emailVerified ? "Active" : "Invited"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(u)}
                      disabled={removingId === u.id}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (v: z.infer<typeof inviteSchema>) => void
  pending: boolean
  error?: string
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<"admin" | "supervisor" | "sales">("sales")

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
