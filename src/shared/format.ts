import { isSameDay } from 'date-fns'
import { MINUTE } from './constants'

const wholeMinutes = (ms: number): number => Math.max(0, Math.floor(ms / MINUTE))

/** `45m`, `1h`, `3h 53m`, `130h 53m` — no "days" unit (SPEC §11). */
export function formatDuration(ms: number): string {
  const total = wholeMinutes(ms)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Tray title `HH:MM`, hours unbounded (SPEC §5.1). */
export function formatHHMM(ms: number): string {
  const total = wholeMinutes(ms)
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export type HourCycle = 'h12' | 'h23'

const makeClock = (hourCycle?: HourCycle, timeZone?: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hourCycle, timeZone })

let clock = makeClock()
// Hour labels are wall-clock positions, so render them in UTC: no DST gap can skip one.
let hourLabels = makeClock(undefined, 'UTC')
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** Follow the macOS 12/24-hour setting, which Intl can't infer from the language alone. */
export function setHourCycle(hourCycle: HourCycle): void {
  clock = makeClock(hourCycle)
  hourLabels = makeClock(hourCycle, 'UTC')
}

/** `2:05 PM` or `14:05`. */
export const formatClock = (t: number): string => clock.format(t)

/** Gutter label for an hour of the day: `1:00 PM` or `13:00`. */
export const formatHourLabel = (hour: number): string =>
  hourLabels.format(Date.UTC(2001, 0, 1, hour))

/** `2:05 PM`, or `Thu 2:05 PM` when `t` is not on the same day as `now`. */
export function formatClockRelative(t: number, now: number): string {
  return isSameDay(t, now) ? formatClock(t) : `${weekday.format(t)} ${formatClock(t)}`
}

/** `2:05 PM – 3:20 PM · 1h 15m` */
export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} – ${formatClock(end)} · ${formatDuration(end - start)}`
}
