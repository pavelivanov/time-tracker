import { beforeEach, describe, expect, it } from 'vitest'
import { EntryStore } from '../../src/main/store'
import { TimerService } from '../../src/main/timer'
import { at, entry, fakeClock, tempDir, type FakeClock } from './helpers'

describe('TimerService', () => {
  let clock: FakeClock
  let store: EntryStore
  let timer: TimerService

  beforeEach(() => {
    clock = fakeClock(at('2026-10-05T14:05:37'))
    store = new EntryStore(tempDir(), clock, () => {})
    store.load()
    timer = new TimerService(store, clock)
  })

  it('starts at the current minute and refuses a second start', () => {
    const started = timer.start()
    expect(started).toMatchObject({ start: at('2026-10-05T14:05'), end: null })
    expect(timer.start()).toBeUndefined()
    expect(store.all()).toHaveLength(1)
  })

  it('stops at the current minute', () => {
    timer.start()
    clock.set(at('2026-10-05T15:10:20'))
    expect(timer.stop()).toMatchObject({
      start: at('2026-10-05T14:05'),
      end: at('2026-10-05T15:10')
    })
    expect(timer.running()).toBeUndefined()
    expect(timer.stop()).toBeUndefined()
  })

  it('E1: discards an entry started and stopped within the same minute', () => {
    timer.start()
    clock.set(at('2026-10-05T14:05:59'))
    expect(timer.stop()).toBeUndefined()
    expect(store.all()).toEqual([])
  })

  it('a new start may touch the previous end', () => {
    timer.start()
    clock.set(at('2026-10-05T15:10:20'))
    timer.stop()
    clock.set(at('2026-10-05T15:10:40'))
    expect(timer.start()?.start).toBe(at('2026-10-05T15:10'))
  })

  it('E8: never starts before the previous end when the clock moved backwards', () => {
    store.insert(entry('a', '2026-10-05T13:00', '2026-10-05T14:30'))
    expect(timer.start()?.start).toBe(at('2026-10-05T14:30'))
  })
})
