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

/** Calendar days with each day's total, plus a per-row week total (SPEC §10). */
const COLS = 'repeat(7, minmax(0, 1fr)) 96px'

export function MonthView({ anchor, entries, now, onOpenDay }: MonthViewProps): React.JSX.Element {
  const weeks = monthWeeks(anchor)
  const today = dayStartOf(now)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b border-grid" style={{ gridTemplateColumns: COLS }}>
        {weekDays(anchor).map((d) => (
          <div key={d} className="px-3 py-2 text-[12px] font-medium text-muted">
            {weekdayShort(d)}
          </div>
        ))}
        <div className="border-l border-grid px-3 py-2 text-[12px] font-medium text-muted">
          Week
        </div>
      </div>
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: COLS,
          gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`
        }}
      >
        {weeks.flatMap((week, w) => [
          ...week.map((day, i) => {
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
          }),
          <WeekTotal key={`week-${w}`} week={week} entries={entries} now={now} top={w > 0} />
        ])}
      </div>
    </div>
  )
}

/** Sum of the row's in-month days only, so the column adds up to the month total. */
function WeekTotal({
  week,
  entries,
  now,
  top
}: {
  week: readonly (number | null)[]
  entries: readonly Entry[]
  now: number
  top: boolean
}): React.JSX.Element {
  const total = week.reduce<number>(
    (sum, day) => (day === null ? sum : sum + totalMs(entries, day, nextDayStart(day), now)),
    0
  )
  return (
    <div
      data-testid="month-week-total"
      className={cx('flex items-start justify-end border-l border-grid p-2.5', top && 'border-t')}
    >
      {total > 0 && (
        <span className="tabular flex h-6 items-center px-1.5 text-[15px] font-semibold text-muted">
          {formatDuration(total)}
        </span>
      )}
    </div>
  )
}
