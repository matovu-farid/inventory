import type { ReactNode } from "react"
import { useCanAny  } from "#/lib/permissions"
import type {Permission} from "#/lib/permissions";

type GateProps = {
  children: ReactNode
  fallback?: ReactNode
} & (
  | { permission: Permission; anyOf?: never }
  | { anyOf: readonly Permission[]; permission?: never }
)

export function Gate(props: GateProps) {
  let perms: readonly Permission[]
  if ("permission" in props && props.permission) {
    perms = [props.permission]
  } else if ("anyOf" in props) {
    perms = props.anyOf
  } else {
    perms = []
  }
  const allowed = useCanAny(perms)
  if (!allowed) return <>{props.fallback ?? null}</>
  return <>{props.children}</>
}
