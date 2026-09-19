import { useCallback, useEffect, useRef, useState } from 'react'
import type { NmrOptions, NmrSchedule } from '../api/backend'
import { getNmrOptions, getNmrSchedule } from '../api/backend'

const OPTIONS_KEY = 'lab.nmroptions.v1'
const SCHEDULE_KEY = 'lab.nmrschedule.v1'

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Generic "fetch on load + focus, cache in localStorage, fall back to cache". */
function useCached<T>(key: string, fetcher: () => Promise<T>) {
  const cached = readCache<T>(key)
  const [data, setData] = useState<T | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const fresh = await fetcher()
      setData(fresh)
      setError(null)
      try {
        localStorage.setItem(key, JSON.stringify(fresh))
      } catch {
        /* non-fatal */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { data, loading, error, refresh }
}

export function useNmrOptions() {
  const { data, loading, error, refresh } = useCached<NmrOptions>(OPTIONS_KEY, getNmrOptions)
  return { options: data, loading, error, refresh }
}

export function useNmrSchedule() {
  const { data, loading, error, refresh } = useCached<NmrSchedule>(SCHEDULE_KEY, getNmrSchedule)
  return { schedule: data, loading, error, refresh }
}
