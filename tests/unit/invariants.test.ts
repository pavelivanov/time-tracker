import { describe, expect, it } from 'vitest'
import { findViolations, repairEntries } from '@shared/invariants'
import { at, entry } from './helpers'

describe('findViolations', () => {
  it('accepts a valid list (touching entries allowed)', () => {
    expect(
      findViolations([
        entry('a', '2026-10-05T09:00', '2026-10-05T10:00'),
        entry('b', '2026-10-05T10:00', '2026-10-05T11:00'),
        entry('c', '2026-10-05T12:00', null)
      ])
    ).toEqual([])
  })

  it('reports every kind of problem', () => {
    const problems = findViolations([
      entry('a', '2026-10-05T09:00', '2026-10-05T10:30'),
      entry('b', '2026-10-05T10:00', '2026-10-05T10:00'),
      { id: 'c', start: at('2026-10-05T11:00:30'), end: at('2026-10-05T12:00') },
      entry('c', '2026-10-05T13:00', null),
      entry('d', '2026-10-05T12:00', '2026-10-05T12:30')
    ])
    expect(problems.join('\n')).toMatch(/overlaps next/)
    expect(problems.join('\n')).toMatch(/shorter than a minute/)
    expect(problems.join('\n')).toMatch(/not minute-aligned/)
    expect(problems.join('\n')).toMatch(/duplicate id/)
    expect(problems.join('\n')).toMatch(/running but not last/)
    expect(problems.join('\n')).toMatch(/not sorted/)
  })
})

describe('repairEntries', () => {
  it('produces a valid list deterministically', () => {
    const repaired = repairEntries([
      entry('d', '2026-10-05T12:00', '2026-10-05T12:30'),
      entry('a', '2026-10-05T09:00', '2026-10-05T10:30'),
      entry('b', '2026-10-05T10:00', '2026-10-05T10:00'),
      entry('r', '2026-10-05T11:00', null),
      entry('a', '2026-10-05T15:00', '2026-10-05T16:00')
    ])
    expect(findViolations(repaired)).toEqual([])
    expect(repaired).toEqual([
      entry('a', '2026-10-05T09:00', '2026-10-05T10:00'),
      entry('r', '2026-10-05T11:00', '2026-10-05T12:00'),
      entry('d', '2026-10-05T12:00', '2026-10-05T12:30')
    ])
  })
})
