import { beforeEach, describe, expect, it } from 'vitest'
import { AUTO_STOP_GAP_MS, MINUTE } from '@shared/constants'
import { AutoStop } from '../../src/main/autoStop'
import { EntryStore } from '../../src/main/store'
import { TimerService } from '../../src/main/timer'
import { at, fakeClock, tempDir, type FakeClock } from './helpers'

describe('AutoStop (SPEC §6.2)', () => {
  let clock: FakeClock
  let store: EntryStore
  let timer: TimerService
  let autoStop: AutoStop

  beforeEach(() => {
    clock = fakeClock(at('2026-10-05T09:00:10'))
    store = new EntryStore(tempDir(), clock, () => {})
    store.load()
    timer = new TimerService(store, clock)
    autoStop = new AutoStop(store, timer, clock)
  })

  const sleepFor = (ms: number): void => {
    autoStop.markGapStart()
    clock.advance(ms)
  }

  it('records nothing while idle', () => {
    autoStop.markGapStart()
    expect(store.lastAliveAt).toBeUndefined()
  })

  it('keeps running through a gap of exactly 5 h (gap counts as tracked)', () => {
    timer.start()
    clock.set(at('2026-10-05T18:02:30'))
    sleepFor(AUTO_STOP_GAP_MS)
    expect(autoStop.check()).toBeUndefined()
    expect(timer.running()).toBeDefined()
    expect(store.lastAliveAt).toBeUndefined()
  })

  it('stops at the gap start when the gap exceeds 5 h', () => {
    timer.start()
    clock.set(at('2026-10-05T18:02:30'))
    sleepFor(AUTO_STOP_GAP_MS + MINUTE)
    expect(autoStop.check()).toBe(at('2026-10-05T18:02'))
    expect(timer.running()).toBeUndefined()
    expect(store.all()[0]).toMatchObject({
      start: at('2026-10-05T09:00'),
      end: at('2026-10-05T18:02')
    })
  })

  it('applies to a quit → relaunch gap via the persisted mark', () => {
    timer.start()
    clock.set(at('2026-10-05T18:00'))
    autoStop.markGapStart() // before-quit
    clock.set(at('2026-10-06T09:00'))
    const relaunched = new EntryStore(store.file.replace(/data\.json$/, ''), clock, () => {})
    relaunched.load()
    const t2 = new TimerService(relaunched, clock)
    expect(new AutoStop(relaunched, t2, clock).check()).toBe(at('2026-10-05T18:00'))
    expect(t2.running()).toBeUndefined()
  })

  it('E21: evaluates each gap on its own', () => {
    timer.start()
    for (let i = 0; i < 3; i++) {
      sleepFor(3 * 60 * MINUTE)
      expect(autoStop.check()).toBeUndefined()
    }
    expect(timer.running()).toBeDefined()
  })

  it('E22: a sub-minute entry before a long gap is discarded', () => {
    timer.start() // 09:00
    clock.set(at('2026-10-05T09:00:50'))
    sleepFor(6 * 60 * MINUTE)
    expect(autoStop.check()).toBe(at('2026-10-05T09:00'))
    expect(store.all()).toEqual([])
  })
})
