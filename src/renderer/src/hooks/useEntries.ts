import { useCallback, useEffect, useState } from 'react'
import type { Entry } from '@shared/types'

interface Loaded {
  from: number
  to: number
  entries: Entry[]
}

export interface EntriesState {
  entries: Entry[]
  /** Data for exactly `[from, to)` has arrived. */
  ready: boolean
  /** Optimistically replace one entry until the next refetch. */
  patch(entry: Entry): void
}

/**
 * Entries overlapping `[from, to)`, refetched whenever main reports a change.
 * While `hold` is set (a resize gesture is in progress) refetches wait (SPEC §9.4).
 */
export function useEntries(from: number, to: number, hold: boolean): EntriesState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => window.tt.onEntriesChanged(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    if (hold) return
    let cancelled = false
    void window.tt.listEntries({ from, to }).then((entries) => {
      if (!cancelled) setLoaded({ from, to, entries })
    })
    return () => {
      cancelled = true
    }
  }, [from, to, version, hold])

  const patch = useCallback((entry: Entry) => {
    setLoaded((l) => l && { ...l, entries: l.entries.map((e) => (e.id === entry.id ? entry : e)) })
  }, [])

  return {
    entries: loaded?.entries ?? [],
    ready: loaded !== null && loaded.from === from && loaded.to === to,
    patch
  }
}
