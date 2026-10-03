import { randomUUID } from 'node:crypto'
import { floorMinute } from '@shared/time'
import type { Entry } from '@shared/types'
import type { Clock } from './clock'
import type { EntryStore } from './store'

/** Start/Stop semantics (SPEC §6.1). */
export class TimerService {
  constructor(
    private readonly store: EntryStore,
    private readonly clock: Clock
  ) {}

  running(): Entry | undefined {
    return this.store.running()
  }

  start(): Entry | undefined {
    if (this.store.running()) return undefined
    // Never before the previous entry's end, even if the system clock moved backwards.
    const start = Math.max(floorMinute(this.clock.now()), this.store.last()?.end ?? -Infinity)
    const entry: Entry = { id: randomUUID(), start, end: null }
    this.store.insert(entry)
    return entry
  }

  /** Stops at `at` (default: now). Sub-minute entries are discarded. */
  stop(at = this.clock.now()): Entry | undefined {
    const running = this.store.running()
    if (!running) return undefined
    const end = floorMinute(at)
    if (end <= running.start) {
      this.store.remove(running.id)
      return undefined
    }
    const closed = { ...running, end }
    this.store.update(closed)
    return closed
  }
}
