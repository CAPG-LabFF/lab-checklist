import { useCallback, useState } from 'react'

const KEY = 'lab.initials'

/** 2–4 letters, auto-uppercased, persisted so returning users never retype. */
export function useInitials() {
  const [initials, setInitialsState] = useState<string>(() => localStorage.getItem(KEY) ?? '')

  const setInitials = useCallback((raw: string) => {
    const clean = raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4)
    setInitialsState(clean)
    if (clean) localStorage.setItem(KEY, clean)
    else localStorage.removeItem(KEY)
  }, [])

  const clear = useCallback(() => {
    setInitialsState('')
    localStorage.removeItem(KEY)
  }, [])

  const valid = /^[A-Z]{2,4}$/.test(initials)
  return { initials, setInitials, clear, valid }
}
