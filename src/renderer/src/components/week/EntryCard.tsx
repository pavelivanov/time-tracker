import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatDuration, formatRange } from '@shared/format'
import { entryEnd, wallMinutes, type Segment } from '@shared/time'
import type { ResizeEdge } from '@shared/types'
import { cx } from '../../lib/labels'
import { StopwatchIcon } from '../Icons'

interface EntryCardProps {
  segment: Segment
  dayStart: number
  hourHeight: number
  now: number
  /** This entry is being resized. */
  active: boolean
  onResizeStart(e: ReactPointerEvent<HTMLElement>, edge: ResizeEdge): void
}

const MIN_HEIGHT = 4
const LABEL_MIN_HEIGHT = 18

/** A tracked interval: no title, only its duration (SPEC §8.3). Body is inert; edges resize. */
export function EntryCard(props: EntryCardProps): React.JSX.Element {
  const { segment: seg, dayStart, hourHeight, now, active, onResizeStart } = props
  const pxPerMin = hourHeight / 60
  const top = wallMinutes(seg.start, dayStart) * pxPerMin
  const span = (wallMinutes(seg.end, dayStart) - wallMinutes(seg.start, dayStart)) * pxPerMin
  const height = Math.max(MIN_HEIGHT, span - 1) // 1 px gap keeps touching entries apart
  const handle = Math.min(6, Math.max(2, height / 3))
  const fullEnd = entryEnd(seg.entry, now)

  const edge = (which: ResizeEdge): React.JSX.Element => (
    <div
      className={cx(
        'absolute inset-x-0 flex cursor-ns-resize justify-center',
        which === 'start' ? 'top-0 items-start' : 'bottom-0 items-end'
      )}
      style={{ height: handle }}
      data-edge={which}
      onPointerDown={(e) => onResizeStart(e, which)}
    >
      <span
        className={cx(
          'grip pointer-events-none mx-auto h-[3px] w-6 rounded-full',
          seg.running ? 'bg-accent/60' : 'bg-muted/60',
          which === 'start' ? 'mt-[2px]' : 'mb-[2px]'
        )}
      />
    </div>
  )

  return (
    <div
      className={cx(
        'entry absolute right-1 left-1 overflow-hidden',
        seg.running ? 'bg-running hover:bg-running-hover' : 'bg-card hover:bg-card-hover',
        seg.isFirst ? 'rounded-t-lg' : 'rounded-t-none',
        seg.isLast ? 'rounded-b-lg' : 'rounded-b-none',
        active && 'active z-10'
      )}
      style={{ top, height }}
      data-testid="entry"
      data-id={seg.entry.id}
      data-day={dayStart}
      title={active ? undefined : formatRange(seg.entry.start, fullEnd)}
      onContextMenu={(e) => {
        e.preventDefault()
        void window.tt.showEntryMenu(seg.entry.id)
      }}
    >
      {height >= LABEL_MIN_HEIGHT && (
        <div
          className={cx(
            'tabular flex items-center gap-1 px-2 pt-[3px] text-[12px] leading-4',
            seg.running ? 'font-medium text-accent' : 'text-muted'
          )}
        >
          {seg.running ? (
            <span className="pulse mr-0.5 size-1.5 rounded-full bg-accent" />
          ) : (
            <StopwatchIcon className="size-3 shrink-0" />
          )}
          {formatDuration(seg.end - seg.start)}
        </div>
      )}
      {seg.isFirst && edge('start')}
      {seg.isLast && !seg.running && edge('end')}
    </div>
  )
}
