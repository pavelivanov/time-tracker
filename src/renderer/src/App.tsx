import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_HOUR_HEIGHT, ZOOM_STEPS } from '@shared/constants'
import { periodRange, shiftPeriod, totalMs } from '@shared/time'
import type { Entry, MenuCommand, Prefs, ResizeEdge, View } from '@shared/types'
import { Toolbar } from './components/Toolbar'
import { MonthView } from './components/month/MonthView'
import { WeekView } from './components/week/WeekView'
import { useEntries } from './hooks/useEntries'
import { useNow } from './hooks/useNow'
import { monthTitle, weekTitle } from './lib/labels'

export default function App(): React.JSX.Element | null {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  useEffect(() => {
    void window.tt.getPrefs().then(setPrefs)
  }, [])
  return prefs && <Calendar initial={prefs} />
}

function Calendar({ initial }: { initial: Prefs }): React.JSX.Element {
  const [view, setView] = useState<View>(initial.view)
  const [hourHeight, setHourHeight] = useState(initial.hourHeight)
  const [anchor, setAnchor] = useState(() => Date.now())
  const [preview, setPreview] = useState<Entry | null>(null)
  const now = useNow()

  const { from, to } = periodRange(view, anchor)
  const { entries, ready, patch } = useEntries(from, to, preview !== null)
  const shown = useMemo(
    () => (preview ? entries.map((e) => (e.id === preview.id ? preview : e)) : entries),
    [entries, preview]
  )

  const changeView = useCallback((next: View) => {
    setView(next)
    void window.tt.setPrefs({ view: next })
  }, [])

  const zoom = useCallback((dir: 1 | -1 | 0) => {
    setHourHeight((current) => {
      const i = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number])
      const next =
        dir === 0
          ? DEFAULT_HOUR_HEIGHT
          : ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))]
      if (next !== current) void window.tt.setPrefs({ hourHeight: next })
      return next
    })
  }, [])

  const run = useCallback(
    (cmd: MenuCommand) => {
      switch (cmd) {
        case 'view-week':
          return changeView('week')
        case 'view-month':
          return changeView('month')
        case 'today':
          return setAnchor(Date.now())
        case 'prev':
          return setAnchor((a) => shiftPeriod(view, a, -1))
        case 'next':
          return setAnchor((a) => shiftPeriod(view, a, 1))
        case 'zoom-in':
          return zoom(1)
        case 'zoom-out':
          return zoom(-1)
        case 'zoom-reset':
          return zoom(0)
      }
    },
    [changeView, view, zoom]
  )

  useEffect(() => window.tt.onMenuCommand(run), [run])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || preview) return
      if (e.key === 'ArrowLeft') run('prev')
      else if (e.key === 'ArrowRight') run('next')
      else if (e.key === 't' || e.key === 'T') run('today')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, preview])

  const commit = useCallback(
    async (entry: Entry, edge: ResizeEdge, time: number) => {
      const saved = await window.tt.resizeEntry({ id: entry.id, edge, time })
      if (saved) patch(saved)
    },
    [patch]
  )

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        view={view}
        title={view === 'week' ? weekTitle(from, to) : monthTitle(anchor)}
        totalMs={totalMs(shown, from, to, now)}
        onPrev={() => run('prev')}
        onNext={() => run('next')}
        onToday={() => run('today')}
        onView={changeView}
      />
      {view === 'week' ? (
        <WeekView
          anchor={anchor}
          entries={shown}
          committed={entries}
          ready={ready}
          now={now}
          hourHeight={hourHeight}
          onZoom={zoom}
          onPreview={setPreview}
          onCommit={commit}
        />
      ) : (
        <MonthView
          anchor={anchor}
          entries={shown}
          now={now}
          onOpenDay={(day) => {
            setAnchor(day)
            changeView('week')
          }}
        />
      )}
    </div>
  )
}
