import { beforeEach, describe, expect, it } from 'vitest'
import { History } from '../../src/main/history'
import { EntryStore } from '../../src/main/store'
import { at, entry, fakeClock, tempDir } from './helpers'

describe('History (undo)', () => {
  let store: EntryStore
  let history: History
  const a = entry('a', '2026-10-05T09:00', '2026-10-05T10:00')

  beforeEach(() => {
    store = new EntryStore(tempDir(), fakeClock(at('2026-10-05T12:00')), () => {})
    store.load()
    store.insert(a)
    history = new History()
  })

  it('undoes a resize', () => {
    const resized = { ...a, end: at('2026-10-05T11:00') }
    store.update(resized)
    history.push({ before: a, after: resized })
    expect(history.undo(store)).toBe(true)
    expect(store.get('a')).toEqual(a)
    expect(history.undo(store)).toBe(false)
  })

  it('undoes a delete', () => {
    store.remove('a')
    history.push({ before: a, after: null })
    expect(history.undo(store)).toBe(true)
    expect(store.all()).toEqual([a])
  })

  it('drops an edit whose entry changed since', () => {
    const resized = { ...a, end: at('2026-10-05T11:00') }
    store.update(resized)
    history.push({ before: a, after: resized })
    store.update({ ...a, end: at('2026-10-05T10:30') })
    expect(history.undo(store)).toBe(false)
    expect(store.get('a')?.end).toBe(at('2026-10-05T10:30'))
  })

  it('E18: a deleted running entry cannot return once a newer timer runs', () => {
    const running = entry('r', '2026-10-05T10:30', null)
    store.insert(running)
    store.remove('r')
    history.push({ before: running, after: null })
    store.insert(entry('n', '2026-10-05T11:00', null))
    expect(history.undo(store)).toBe(false)
    expect(store.all().map((e) => e.id)).toEqual(['a', 'n'])
  })
})
