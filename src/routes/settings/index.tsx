import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { PasswordInput } from '#/components/ui/password-input'
import { PrereqEmptyState } from '#/components/prerequisites/prereq-empty-state'
import { authClient } from '#/lib/auth-client'
import type { SystemPrereqsSummary } from '#/lib/prerequisites/types'
import { getSystemPrereqs } from '#/server/functions/prereqs/system'
import { getSession } from '#/server/middleware/auth'

export const Route = createFileRoute('/settings/')({
  loader: async () => {
    const session = await getSession()
    const u = session?.user as
      | { name?: string | null; email?: string | null; role?: string | null }
      | undefined
    const profile = {
      name: u?.name ?? '',
      email: u?.email ?? '',
    }
    // Sales reps can't act on any setup-checklist item — hide the section.
    if (u?.role === 'sales') return { summary: null, profile }
    return { summary: await getSystemPrereqs(), profile }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { summary, profile } = Route.useLoaderData()

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <ProfileCard initialName={profile.name} email={profile.email} />
      <ChangePasswordCard />

      {summary && <SetupChecklist summary={summary} />}
    </div>
  )
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileCard({
  initialName,
  email,
}: {
  initialName: string
  email: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  const dirty = name.trim() !== initialName.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty || !name.trim()) return
    setPending(true)
    setMessage(null)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setPending(false)
    if (error) {
      setMessage({ kind: 'error', text: error.message ?? 'Update failed.' })
      return
    }
    setMessage({ kind: 'success', text: 'Profile updated.' })
    void router.invalidate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void submit(e)
          }}
          className="space-y-4"
        >
          {message && <FormMessage message={message} />}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} disabled />
            <p className="text-xs text-muted-foreground">
              Contact an admin to change your email.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!dirty || pending || !name.trim()}>
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Change password ────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  function reset() {
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (next.length < 8) {
      setMessage({
        kind: 'error',
        text: 'New password must be at least 8 characters.',
      })
      return
    }
    if (next !== confirm) {
      setMessage({ kind: 'error', text: "New passwords don't match." })
      return
    }
    setPending(true)
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
    })
    setPending(false)
    if (error) {
      setMessage({
        kind: 'error',
        text: error.message ?? 'Could not change password.',
      })
      return
    }
    reset()
    setMessage({ kind: 'success', text: 'Password changed.' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void submit(e)
          }}
          className="space-y-4"
        >
          {message && <FormMessage message={message} />}
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <PasswordInput
              id="pw-current"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <PasswordInput
              id="pw-new"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <PasswordInput
              id="pw-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={pending || !current || !next || !confirm}
            >
              {pending ? 'Updating...' : 'Update password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormMessage({
  message,
}: {
  message: { kind: 'success' | 'error'; text: string }
}) {
  const cls =
    message.kind === 'success'
      ? 'rounded-md bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700'
      : 'rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive'
  return <div className={cls}>{message.text}</div>
}

// ─── Setup checklist (admin/supervisor only) ────────────────────────────────

function SetupChecklist({ summary }: { summary: SystemPrereqsSummary }) {
  const hardItems = summary.items.filter((i) => i.severity === 'hard')
  const softItems = summary.items.filter((i) => i.severity === 'soft')

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Setup Checklist</h2>
        <p className="text-sm text-muted-foreground">
          {summary.passing} of {summary.totalChecks} system checks passing.
        </p>
      </div>

      {hardItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">
              {hardItems.length} blocking{' '}
              {hardItems.length === 1 ? 'issue' : 'issues'}
            </h3>
          </div>
          <PrereqEmptyState
            items={hardItems}
            heading="These need to be fixed"
            subtitle="Each item below blocks a page. Use the buttons to set them up."
            showPageLinks
          />
        </div>
      )}

      {softItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="size-4" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold">
              {softItems.length} suggestion
              {softItems.length === 1 ? '' : 's'}
            </h3>
          </div>
          <PrereqEmptyState
            items={softItems}
            heading="Optional improvements"
            subtitle="These don't block anything but will make the system more useful."
            showPageLinks
          />
        </div>
      )}
    </section>
  )
}
