import { useCallback, useEffect, useRef, useState } from 'react'
import type { AreaState } from '../api/backend'
import { getState } from '../api/backend'

const CACHE_KEY = 'lab.state.v1'
const POLL_MS = 30_000

type Cache = { states: AreaState[]; cachedAt: string }

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cache) : null
  } catch {
    return null
  }
}

/**
 * Renders the last-known state from localStorage instantly, then reconciles
 * with the server. Polls every 30s and on tab focus. On a failed refresh it
 * keeps the last good data and flags the error, so a flaky lab Wi-Fi never
 * blanks the screen.
 */
export function useAreaStates() {
  const cached = readCache()
  const [states, setStates] = useState<AreaState[] | null>(cached?.states ?? null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [everLoaded, setEverLoaded] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const fresh = await getState()
      setStates(fresh)
      setError(null)
      setEverLoaded(true)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ states: fresh, cachedAt: new Date().toISOString() }))
      } catch {
        /* storage full / disabled — non-fatal */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh.')
    } finally {
      inFlight.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
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

  return { states, refreshing, error, everLoaded, cachedAt: cached?.cachedAt ?? null, refresh }
}
