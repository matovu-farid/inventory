import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  // Keep the server render and the first client render identical. The media
  // query is read after hydration so responsive components do not branch
  // differently during SSR and trigger a hydration mismatch.
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(QUERY)
    const handler = (e: { matches: boolean }) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    setMatches(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return matches
}
