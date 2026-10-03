import { useEffect, useState } from 'react'
import { MINUTE } from '@shared/constants'

/** Current time, refreshed on every wall-clock minute (same moment as the tray). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer = 0
    const schedule = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, MINUTE - (Date.now() % MINUTE) + 50)
    }
    const tick = (): void => {
      setNow(Date.now())
      schedule()
    }
    schedule()
    // Timers are throttled in background windows; catch up when visible again.
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  return now
}
