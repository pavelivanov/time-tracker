import { formatDuration } from '@shared/format'
import { dayStartOf, monthWeeks, nextDayStart, totalMs, weekDays } from '@shared/time'
import type { Entry } from '@shared/types'
import { cx, weekdayShort } from '../../lib/labels'

interface MonthViewProps {
  anchor: number
  entries: readonly Entry[]
  now: number
  onOpenDay(day: number): void
}

/** Calendar days with each day's total, nothing else (SPEC §10). */
export function MonthView({ anchor, entries, now, onOpenDay }: MonthViewProps): React.JSX.Element {
  const weeks = monthWeeks(anchor)
  const today = dayStartOf(now)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-grid">
        {weekDays(anchor).map((d) => (
          <div key={d} className="px-3 py-2 text-[12px] font-medium text-muted">
            {weekdayShort(d)}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.flatMap((week, w) =>
          week.map((day, i) => {
            const edges = cx('border-grid', i > 0 && 'border-l', w > 0 && 'border-t')
            if (day === null) return <div key={`blank-${w}-${i}`} className={edges} />
            const total = totalMs(entries, day, nextDayStart(day), now)
            return (
              <button
                key={day}
                data-testid="month-day"
                data-day={day}
                onClick={() => onOpenDay(day)}
                className={cx(
                  edges,
                  'flex flex-col items-start gap-1 p-2.5 text-left hover:bg-control'
                )}
              >
                <span
                  className={cx(
                    'tabular flex h-6 items-center px-1.5 text-[14px]',
                    day === today &&
                      'min-w-6 justify-center rounded-full bg-accent font-medium text-accent-ink'
                  )}
                >
                  {new Date(day).getDate()}
                </span>
                {total > 0 && (
                  <span
                    className="tabular px-1.5 text-[15px] font-semibold text-accent"
                    data-testid="day-total"
                  >
                    {formatDuration(total)}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
