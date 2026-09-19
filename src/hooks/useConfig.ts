import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublishedConfig } from '../api/backend'
import { getConfig } from '../api/backend'

const CACHE_KEY = 'lab.config.v1'

function readCache(): PublishedConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as PublishedConfig) : null
  } catch {
    return null
  }
}

/**
 * The published checklist config. Renders the cached copy instantly, refetches on
 * load and on focus, and updates when the publication date changes. On a fetch
 * failure it keeps the cached config. `config` is null only when there is nothing
 * cached AND the fetch failed — in that case the UI must block submission rather
 * than render an empty checklist.
 */
export function useConfig() {
  const cached = readCache()
  const [config, setConfig] = useState<PublishedConfig | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    let lastErr: unknown
    // Apps Script /exec is flaky (transient 302/CORS/404s). Retry with backoff
    // before giving up, so a single blip never leaves the app "unavailable".
    // A cached config stays in place throughout, so returning users see no change.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const fresh = await getConfig()
        setConfig(fresh)
        setError(null)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
        } catch {
          /* storage disabled — non-fatal */
        }
        inFlight.current = false
        setLoading(false)
        return
      } catch (e) {
        lastErr = e
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      }
    }
    setError(lastErr instanceof Error ? lastErr.message : 'Could not load the checklist configuration.')
    inFlight.current = false
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { config, loading, error, refresh }
}
