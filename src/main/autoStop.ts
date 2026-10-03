import { AUTO_STOP_GAP_MS } from '@shared/constants'
import { floorMinute } from '@shared/time'
import type { Clock } from './clock'
import type { EntryStore } from './store'
import type { TimerService } from './timer'

/**
 * Stops a timer that kept "running" through a long sleep / shutdown / quit (SPEC §6.2).
 * Shorter gaps count as tracked time.
 */
export class AutoStop {
  constructor(
    private readonly store: EntryStore,
    private readonly timer: TimerService,
    private readonly clock: Clock
  ) {}

  /** suspend / shutdown / before-quit. Persisted synchronously by the store. */
  markGapStart(): void {
    if (this.timer.running()) this.store.setLastAliveAt(this.clock.now())
  }

  /** resume / launch. Returns the minute the timer was stopped at, if it was. */
  check(): number | undefined {
    const gapStart = this.store.lastAliveAt
    if (gapStart === undefined) return undefined
    this.store.setLastAliveAt(undefined)
    if (!this.timer.running()) return undefined
    if (this.clock.now() - gapStart <= AUTO_STOP_GAP_MS) return undefined
    this.timer.stop(gapStart)
    return floorMinute(gapStart)
  }
}
