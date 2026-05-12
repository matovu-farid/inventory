import type { ReactNode } from "react"
import { useCanAny, type Permission } from "#/lib/permissions"

type GateProps = {
  children: ReactNode
  fallback?: ReactNode
} & (
  | { permission: Permission; anyOf?: never }
  | { anyOf: readonly Permission[]; permission?: never }
)

export function Gate(props: GateProps) {
  const perms: readonly Permission[] =
    "permission" in props && props.permission
      ? [props.permission]
      : props.anyOf ?? []
  const allowed = useCanAny(perms)
  if (!allowed) return <>{props.fallback ?? null}</>
  return <>{props.children}</>
}
