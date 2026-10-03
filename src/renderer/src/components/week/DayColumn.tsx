import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { formatRange } from '@shared/format'
import { daySegments, entryEnd, wallMinutes } from '@shared/time'
import type { Entry, ResizeEdge } from '@shared/types'
import type { ActiveResize } from '../../hooks/useResize'
import { cx } from '../../lib/labels'
import { EntryCard } from './EntryCard'

interface DayColumnProps {
  day: number
  entries: readonly Entry[]
  now: number
  hourHeight: number
  isToday: boolean
  weekend: boolean
  active: ActiveResize | null
  onResizeStart(
    e: ReactPointerEvent<HTMLElement>,
    entry: Entry,
    edge: ResizeEdge,
    column: HTMLElement
  ): void
}

const PILL_GAP = 6
const PILL_HEIGHT = 22

export function DayColumn(props: DayColumnProps): React.JSX.Element {
  const { day, entries, now, hourHeight, isToday, weekend, active, onResizeStart } = props
  const ref = useRef<HTMLDivElement>(null)
  const pxPerMin = hourHeight / 60
  const segments = daySegments(entries, day, now)
  const dragged = active?.dayStart === day ? entries.find((e) => e.id === active.id) : undefined

  return (
    <div
      ref={ref}
      className={cx('hour-grid relative border-l border-grid', weekend && 'weekend')}
      style={{ ['--hour-height' as string]: `${hourHeight}px` }}
    >
      {segments.map((seg) => (
        <EntryCard
          key={seg.entry.id}
          segment={seg}
          dayStart={day}
          hourHeight={hourHeight}
          now={now}
          active={active?.id === seg.entry.id}
          onResizeStart={(e, edge) => ref.current && onResizeStart(e, seg.entry, edge, ref.current)}
        />
      ))}

      {isToday && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
          style={{ top: wallMinutes(now, day) * pxPerMin - 4 }}
        >
          <span className="-ml-1 size-2 rounded-full bg-now" />
          <span className="h-px flex-1 bg-now" />
        </div>
      )}

      {dragged && active && (
        <ResizePill entry={dragged} active={active} day={day} now={now} pxPerMin={pxPerMin} />
      )}
    </div>
  )
}

interface ResizePillProps {
  entry: Entry
  active: ActiveResize
  day: number
  now: number
  pxPerMin: number
}

/** Live `start – end · duration` next to the edge being dragged (SPEC §9.1). */
function ResizePill({ entry, active, day, now, pxPerMin }: ResizePillProps): React.JSX.Element {
  const end = entryEnd(entry, now)
  const edgeY = wallMinutes(active.edge === 'start' ? entry.start : end, day) * pxPerMin
  const above = active.edge === 'start' ? edgeY - PILL_GAP - PILL_HEIGHT >= 0 : false
  const below = active.edge === 'end' ? edgeY + PILL_GAP + PILL_HEIGHT <= 1440 * pxPerMin : false
  const top =
    active.edge === 'start'
      ? above
        ? edgeY - PILL_GAP - PILL_HEIGHT
        : edgeY + PILL_GAP
      : below
        ? edgeY + PILL_GAP
        : edgeY - PILL_GAP - PILL_HEIGHT
  return (
    <div
      className="tabular pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full px-2.5 text-[11.5px] leading-[22px] font-medium whitespace-nowrap shadow-md"
      style={{ top, height: PILL_HEIGHT, background: 'var(--pill-bg)', color: 'var(--pill-ink)' }}
    >
      {formatRange(entry.start, end)}
    </div>
  )
}
