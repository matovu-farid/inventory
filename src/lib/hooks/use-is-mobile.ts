import { useEffect, useState } from "react"

const QUERY = "(max-width: 767px)"

export function useIsMobile(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(QUERY)
    const handler = (e: { matches: boolean }) => setMatches(e.matches)
    mq.addEventListener("change", handler)
    setMatches(mq.matches)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return matches
}
