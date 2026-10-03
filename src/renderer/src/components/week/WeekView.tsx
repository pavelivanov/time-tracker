import { useLayoutEffect, useRef } from 'react'
import { isWeekend } from 'date-fns'
import { ZOOM_STEPS } from '@shared/constants'
import { formatDuration, formatHourLabel } from '@shared/format'
import { dayStartOf, daySegments, nextDayStart, totalMs, wallMinutes, weekDays } from '@shared/time'
import type { Entry, ResizeEdge } from '@shared/types'
import { useResize } from '../../hooks/useResize'
import { cx, weekdayShort } from '../../lib/labels'
import { DayColumn } from './DayColumn'

interface WeekViewProps {
  anchor: number
  /** Entries as displayed (a resize preview applied). */
  entries: readonly Entry[]
  /** Entries as saved; neighbor lookup for clamping. */
  committed: readonly Entry[]
  ready: boolean
  now: number
  hourHeight: number
  onZoom(dir: 1 | -1): void
  onPreview(entry: Entry | null): void
  onCommit(entry: Entry, edge: ResizeEdge, time: number): Promise<void>
}

const GRID = '56px repeat(7, minmax(0, 1fr))'

/** 7-day time grid (SPEC §8). */
export function WeekView(props: WeekViewProps): React.JSX.Element {
  const { anchor, entries, committed, ready, now, hourHeight, onZoom, onPreview, onCommit } = props
  const days = weekDays(anchor)
  const weekStart = days[0]
  const scroller = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)
  const scrolledFor = useRef<number | null>(null)
  const zoomFrom = useRef(hourHeight)

  const { active, begin } = useResize({
    entries: committed,
    hourHeight,
    scroller,
    header,
    onPreview,
    onCommit
  })

  // Initial scroll per week: the now-line at ~⅓ height, else the first entry, else 8:00.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !ready || scrolledFor.current === weekStart) return
    scrolledFor.current = weekStart
    const pxPerMin = hourHeight / 60
    const visible = el.clientHeight - (header.current?.offsetHeight ?? 0)
    let minutes: number
    if (now >= weekStart && now < nextDayStart(days[6])) {
      minutes = wallMinutes(now, dayStartOf(now)) - visible / 3 / pxPerMin
    } else {
      const starts = days.flatMap((d) =>
        daySegments(entries, d, now).map((s) => wallMinutes(s.start, d))
      )
      minutes = starts.length > 0 ? Math.min(...starts) - 60 : 8 * 60
    }
    el.scrollTop = Math.max(0, minutes * pxPerMin)
  }, [ready, weekStart, days, entries, hourHeight, now])

  // Zoom keeps the time under the viewport center fixed.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || zoomFrom.current === hourHeight) return
    const visible = el.clientHeight - (header.current?.offsetHeight ?? 0)
    const centerMin = (scrollTop.current + visible / 2) / (zoomFrom.current / 60)
    zoomFrom.current = hourHeight
    el.scrollTop = centerMin * (hourHeight / 60) - visible / 2
  }, [hourHeight])

  const labelEvery = hourHeight < 32 ? 2 : 1
  const hours = Array.from({ length: 23 }, (_, i) => i + 1).filter((h) => h % labelEvery === 0)

  return (
    <div
      ref={scroller}
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        scrollTop.current = e.currentTarget.scrollTop
      }}
    >
      <div
        ref={header}
        className="sticky top-0 z-40 grid border-b border-grid bg-surface"
        style={{ gridTemplateColumns: GRID }}
      >
        <ZoomControl hourHeight={hourHeight} onZoom={onZoom} />
        {days.map((day) => {
          const total = totalMs(entries, day, nextDayStart(day), now)
          const today = day === dayStartOf(now)
          return (
            <div
              key={day}
              className="flex items-center gap-2 border-l border-grid px-3 py-2.5"
              data-testid="day-header"
              data-day={day}
            >
              <span
                className={cx(
                  'tabular flex h-9 min-w-9 items-center justify-center text-[24px] leading-none font-light',
                  today && 'rounded-full bg-accent px-1.5 text-[19px] font-normal text-accent-ink'
                )}
              >
                {new Date(day).getDate()}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[14px]">{weekdayShort(day)}</span>
                <span
                  className="tabular truncate text-[13px] font-medium text-accent"
                  data-testid="day-total"
                >
                  {total > 0 ? formatDuration(total) : '–'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="relative grid" style={{ gridTemplateColumns: GRID, height: 24 * hourHeight }}>
        <div className="relative">
          {hours.map((h) => (
            <span
              key={h}
              className="tabular absolute right-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted"
              style={{ top: h * hourHeight }}
            >
              {formatHourLabel(h)}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            entries={entries}
            now={now}
            hourHeight={hourHeight}
            isToday={day === dayStartOf(now)}
            weekend={isWeekend(day)}
            active={active}
            onResizeStart={begin}
          />
        ))}
      </div>
    </div>
  )
}

function ZoomControl({
  hourHeight,
  onZoom
}: {
  hourHeight: number
  onZoom(dir: 1 | -1): void
}): React.JSX.Element {
  const button =
    'flex size-6 items-center justify-center rounded-md text-[17px] leading-none text-muted hover:bg-control hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button
        className={button}
        aria-label="Zoom out"
        disabled={hourHeight <= ZOOM_STEPS[0]}
        onClick={() => onZoom(-1)}
      >
        −
      </button>
      <button
        className={button}
        aria-label="Zoom in"
        disabled={hourHeight >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        onClick={() => onZoom(1)}
      >
        +
      </button>
    </div>
  )
}
