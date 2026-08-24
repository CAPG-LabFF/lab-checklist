import { useCallback, useEffect, useRef, useState } from 'react'
import type { PresenceEntry } from '../api/backend'
import { getPresence } from '../api/backend'

/** Board state with the same refresh discipline as the rest of the app:
 *  fetch on load, on tab focus, and poll every 30s while visible. */
export function usePresence() {
  const [present, setPresent] = useState<PresenceEntry[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const r = await getPresence()
      setPresent(r.present)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board.')
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 30_000)
    const onFocus = () => refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { present, refreshing, error, refresh, setPresent }
}
