import { MINUTE } from './constants'
import { floorMinute } from './time'
import type { Entry } from './types'

const aligned = (t: number): boolean => Number.isSafeInteger(t) && t % MINUTE === 0

/**
 * Structural invariants of the entry list (SPEC §12.3). "Not in the future" is enforced on
 * mutations only, so a temporarily wrong system clock can never trigger a destructive repair.
 */
export function findViolations(entries: readonly Entry[]): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  entries.forEach((e, i) => {
    if (ids.has(e.id)) problems.push(`#${i}: duplicate id ${e.id}`)
    ids.add(e.id)
    if (!aligned(e.start) || (e.end !== null && !aligned(e.end))) {
      problems.push(`#${i}: not minute-aligned`)
    }
    if (e.end !== null && e.end - e.start < MINUTE) problems.push(`#${i}: shorter than a minute`)
    if (e.end === null && i !== entries.length - 1) problems.push(`#${i}: running but not last`)
    const next = entries[i + 1]
    if (next) {
      if (next.start < e.start) problems.push(`#${i}: not sorted`)
      else if (e.end === null || e.end > next.start) problems.push(`#${i}: overlaps next`)
    }
  })
  return problems
}

/** Deterministic repair for an invalid list (SPEC §12.5). */
export function repairEntries(entries: readonly Entry[]): Entry[] {
  const seen = new Set<string>()
  const list = entries
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e) => ({
      id: e.id,
      start: floorMinute(e.start),
      end: e.end === null ? null : floorMinute(e.end)
    }))
    .sort((a, b) => a.start - b.start)

  for (let i = 0; i < list.length - 1; i++) {
    const e = list[i]
    const nextStart = list[i + 1].start
    // Only the last entry may run; anything else ends where the next one starts.
    if (e.end === null || e.end > nextStart) list[i] = { ...e, end: nextStart }
  }
  return list.filter((e) => e.end === null || e.end - e.start >= MINUTE)
}
