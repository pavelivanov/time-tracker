import { MINUTE } from './constants'
import { dayStartOf, floorMinute, nextDayStart } from './time'
import type { Entry, ResizeEdge } from './types'

/** Snap step for a zoom level; ⌥ forces 1-minute precision (SPEC §9.2). */
export function snapStepMinutes(hourHeight: number, precise: boolean): number {
  if (precise || hourHeight >= 144) return 1
  if (hourHeight >= 64) return 5
  return 15
}

/**
 * Snaps to the absolute grid. While the pointer stays within half a step of the original
 * value the original is kept, so small wiggles never move an off-grid time onto the grid.
 * UTC and local grids coincide for steps ≤ 15 min (all UTC offsets are 15-min multiples).
 */
export function snapTime(proposed: number, original: number, stepMinutes: number): number {
  const step = stepMinutes * MINUTE
  if (Math.abs(proposed - original) < step / 2) return original
  return Math.round(proposed / step) * step
}

export interface ResizeContext {
  entry: Entry
  edge: ResizeEdge
  /** Neighbors in the global sorted list. */
  prev?: Entry
  next?: Entry
  now: number
}

/** Local day of the column holding the edge: first segment for `start`, last for `end`. */
export function edgeDay(entry: Entry, edge: ResizeEdge): number {
  if (edge === 'start') return dayStartOf(entry.start)
  if (entry.end === null) throw new Error('A running entry has no end edge')
  return dayStartOf(entry.end - 1)
}

/** Allowed range for the dragged edge (SPEC §9.3). Always contains the current value. */
export function resizeBounds(ctx: ResizeContext): { min: number; max: number } {
  const { entry, edge, prev, next, now } = ctx
  const day = edgeDay(entry, edge)
  const dayEnd = nextDayStart(day)
  const current = floorMinute(now)
  const original = edge === 'start' ? entry.start : (entry.end as number)

  let min: number
  let max: number
  if (edge === 'start') {
    min = Math.max(day, prev?.end ?? -Infinity)
    max =
      entry.end === null ? Math.min(current, dayEnd - MINUTE) : Math.min(entry.end, dayEnd) - MINUTE
  } else {
    min = Math.max(entry.start, day) + MINUTE
    max = Math.min(dayEnd, next?.start ?? Infinity, current)
  }
  // Clock moved backwards etc.: never force a change the user didn't ask for.
  return { min: Math.min(min, original), max: Math.max(max, original) }
}

/** Applies a resize request; the result always satisfies the store invariants. */
export function clampResize(ctx: ResizeContext, time: number): Entry {
  const { min, max } = resizeBounds(ctx)
  const t = Math.min(Math.max(Math.round(time / MINUTE) * MINUTE, min), max)
  return ctx.edge === 'start' ? { ...ctx.entry, start: t } : { ...ctx.entry, end: t }
}

/** Previous/next entries around `id` in a start-sorted list. */
export function neighborsOf(entries: readonly Entry[], id: string): { prev?: Entry; next?: Entry } {
  const i = entries.findIndex((e) => e.id === id)
  if (i === -1) return {}
  return { prev: entries[i - 1], next: entries[i + 1] }
}
