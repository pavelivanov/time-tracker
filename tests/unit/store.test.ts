import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY } from './time-constants'
import { EntryStore, InvariantError } from '../../src/main/store'
import { at, entry, fakeClock, tempDir, type FakeClock } from './helpers'

const quiet = (): void => {}

describe('EntryStore', () => {
  let dir: string
  let clock: FakeClock
  let store: EntryStore

  beforeEach(() => {
    dir = tempDir()
    clock = fakeClock(at('2026-10-05T12:00'))
    store = new EntryStore(dir, clock, quiet)
  })

  const reload = (): EntryStore => {
    const s = new EntryStore(dir, clock, quiet)
    s.load()
    return s
  }

  it('starts empty, persists every mutation and reloads it', () => {
    expect(store.load()).toEqual({ status: 'new' })
    store.insert(entry('a', '2026-10-05T09:00', '2026-10-05T10:00'))
    store.insert(entry('r', '2026-10-05T11:00', null))
    const again = new EntryStore(dir, clock, quiet)
    expect(again.load()).toEqual({ status: 'ok' })
    expect(again.all().map((e) => e.id)).toEqual(['a', 'r'])
    expect(again.running()?.id).toBe('r')
    expect(existsSync(join(dir, 'data.json.tmp'))).toBe(false)
  })

  it('rejects mutations that break invariants and keeps the old state', () => {
    store.load()
    store.insert(entry('a', '2026-10-05T09:00', '2026-10-05T10:00'))
    expect(() => store.insert(entry('b', '2026-10-05T09:30', '2026-10-05T11:00'))).toThrow(
      InvariantError
    )
    expect(() => store.update(entry('a', '2026-10-05T09:00', '2026-10-05T09:00'))).toThrow(
      InvariantError
    )
    expect(reload().all()).toEqual([entry('a', '2026-10-05T09:00', '2026-10-05T10:00')])
  })

  it('lists entries overlapping a range; running entries are open-ended', () => {
    store.load()
    store.insert(entry('a', '2026-10-04T23:00', '2026-10-05T01:00'))
    store.insert(entry('b', '2026-10-05T09:00', '2026-10-05T10:00'))
    store.insert(entry('r', '2026-10-05T11:00', null))
    const ids = (from: string, to: string): string[] =>
      store.list(at(from), at(to)).map((e) => e.id)
    expect(ids('2026-10-05T00:00', '2026-10-06T00:00')).toEqual(['a', 'b', 'r'])
    expect(ids('2026-10-05T01:00', '2026-10-05T09:00')).toEqual([])
    expect(ids('2026-10-07T00:00', '2026-10-08T00:00')).toEqual(['r'])
  })

  it('notifies listeners on entry changes only', () => {
    store.load()
    const listener = vi.fn()
    store.onChange(listener)
    store.insert(entry('a', '2026-10-05T09:00', '2026-10-05T10:00'))
    store.setLastAliveAt(clock.now())
    store.remove('a')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('persists lastAliveAt and removes it again', () => {
    store.load()
    store.setLastAliveAt(at('2026-10-05T18:02'))
    expect(reload().lastAliveAt).toBe(at('2026-10-05T18:02'))
    store.setLastAliveAt(undefined)
    expect(JSON.parse(readFileSync(store.file, 'utf8'))).not.toHaveProperty('lastAliveAt')
  })

  it('keeps one snapshot per day, taken before the first write of the day', () => {
    store.load()
    store.insert(entry('a', '2026-10-05T09:00', '2026-10-05T10:00'))
    clock.set(at('2026-10-06T08:00'))
    store.insert(entry('b', '2026-10-06T07:00', '2026-10-06T07:30'))
    store.insert(entry('c', '2026-10-06T07:30', '2026-10-06T07:45'))
    const snapshot = JSON.parse(readFileSync(join(dir, 'backups', 'data-2026-10-06.json'), 'utf8'))
    expect(snapshot.entries.map((e: { id: string }) => e.id)).toEqual(['a'])
  })

  it('prunes snapshots beyond 30', () => {
    store.load()
    for (let i = 0; i < 33; i++) {
      clock.set(at('2026-09-01T12:00') + i * DAY)
      store.setLastAliveAt(clock.now())
    }
    const files = readdirSync(join(dir, 'backups'))
    expect(files).toHaveLength(30)
    expect(files.sort()[0]).toBe('data-2026-09-04.json')
  })

  it('quarantines a corrupt file and restores the newest valid backup', () => {
    mkdirSync(join(dir, 'backups'), { recursive: true })
    const good = { schemaVersion: 1, entries: [entry('a', '2026-10-04T09:00', '2026-10-04T10:00')] }
    writeFileSync(join(dir, 'backups', 'data-2026-10-03.json'), JSON.stringify({ broken: true }))
    writeFileSync(join(dir, 'backups', 'data-2026-10-04.json'), JSON.stringify(good))
    writeFileSync(join(dir, 'backups', 'data-2026-10-05.json'), '{ nope')
    writeFileSync(join(dir, 'data.json'), '{"schemaVersion": 1, "entries": [')
    const report = store.load()
    expect(report).toMatchObject({ status: 'restored' })
    if (report.status !== 'restored') throw new Error('unreachable')
    expect(report.backup).toMatch(/data-2026-10-04\.json$/)
    expect(existsSync(report.quarantined)).toBe(true)
    expect(reload().all()).toEqual(good.entries)
  })

  it('starts empty when nothing can be restored, keeping the damaged file', () => {
    writeFileSync(join(dir, 'data.json'), 'garbage')
    const report = store.load()
    expect(report.status).toBe('reset')
    expect(store.all()).toEqual([])
    expect(readdirSync(dir).some((f) => f.startsWith('data.corrupt-'))).toBe(true)
  })

  it('repairs invariant violations and keeps a copy of the original', () => {
    const bad = {
      schemaVersion: 1,
      entries: [
        entry('a', '2026-10-05T09:00', '2026-10-05T10:30'),
        entry('b', '2026-10-05T10:00', '2026-10-05T11:00')
      ]
    }
    writeFileSync(join(dir, 'data.json'), JSON.stringify(bad))
    expect(store.load()).toMatchObject({ status: 'repaired' })
    expect(store.all()[0].end).toBe(at('2026-10-05T10:00'))
    expect(reload().all()).toEqual(store.all())
    expect(readdirSync(dir).some((f) => f.startsWith('data.pre-repair-'))).toBe(true)
  })
})
