import { formatDuration } from '@shared/format'
import type { View } from '@shared/types'
import { cx } from '../lib/labels'
import { ChevronIcon } from './Icons'

interface ToolbarProps {
  view: View
  title: string
  totalMs: number
  onPrev(): void
  onNext(): void
  onToday(): void
  onView(view: View): void
}

const control =
  'no-drag flex h-7 items-center justify-center rounded-md bg-control text-[13px] text-ink hover:bg-control-hover active:opacity-80'

/** Title-bar toolbar: navigation, period title + total, Week | Month (SPEC §7.2). */
export function Toolbar(props: ToolbarProps): React.JSX.Element {
  const { view, title, totalMs, onPrev, onNext, onToday, onView } = props
  return (
    <header className="app-drag flex h-[52px] shrink-0 items-center gap-3 border-b border-grid pr-4 pl-[86px]">
      <div className="flex items-center gap-1">
        <button className={cx(control, 'w-7')} onClick={onPrev} aria-label="Previous">
          <ChevronIcon dir="left" className="size-4" />
        </button>
        <button className={cx(control, 'px-2.5')} onClick={onToday}>
          Today
        </button>
        <button className={cx(control, 'w-7')} onClick={onNext} aria-label="Next">
          <ChevronIcon dir="right" className="size-4" />
        </button>
      </div>
      <h1 className="truncate text-[15px] font-semibold">{title}</h1>
      <span
        className="tabular shrink-0 text-[15px] font-semibold text-accent"
        data-testid="period-total"
      >
        {formatDuration(totalMs)}
      </span>
      <div className="flex-1" />
      <div className="no-drag flex rounded-md bg-control p-0.5" role="tablist">
        {(['week', 'month'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => onView(v)}
            className={cx(
              'h-6 rounded-[5px] px-3 text-[13px] capitalize',
              view === v ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-ink'
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </header>
  )
}
