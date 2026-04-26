import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setPending(true)

    try {
      if (mode === "signup") {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
        })
        if (result.error) {
          setError(result.error.message ?? "Signup failed")
          setPending(false)
          return
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
        })
        if (result.error) {
          setError(result.error.message ?? "Invalid email or password")
          setPending(false)
          return
        }
      }
      router.navigate({ to: "/" })
    } catch {
      setError(mode === "signup" ? "Signup failed." : "Login failed.")
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {mode === "login"
              ? "Sign in to Inventory Management"
              : "Get started with Inventory Management"}
          </p>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl bg-white p-6"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
                {error}
              </div>
            )}

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px]">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <Button
              type="submit"
              className="h-10 w-full rounded-xl text-[13px] font-semibold"
              disabled={pending}
            >
              {pending
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </form>
        </div>

        {/* Toggle */}
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline cursor-pointer"
                onClick={() => {
                  setMode("signup")
                  setError("")
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline cursor-pointer"
                onClick={() => {
                  setMode("login")
                  setError("")
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
