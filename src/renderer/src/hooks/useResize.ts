import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { clampResize, edgeDay, neighborsOf, snapStepMinutes, snapTime } from '@shared/resize'
import { timeAtWallMinutes, wallMinutes } from '@shared/time'
import type { Entry, ResizeEdge } from '@shared/types'

const THRESHOLD_PX = 3
const AUTOSCROLL_ZONE_PX = 40
const AUTOSCROLL_MAX_PX = 14

export interface ActiveResize {
  id: string
  edge: ResizeEdge
  dayStart: number
}

export interface ResizeOptions {
  /** Committed entries (sorted), used for neighbor lookup. */
  entries: readonly Entry[]
  hourHeight: number
  scroller: RefObject<HTMLElement | null>
  /** Sticky header covering the top of the scroller. */
  header: RefObject<HTMLElement | null>
  onPreview(entry: Entry | null): void
  onCommit(entry: Entry, edge: ResizeEdge, time: number): Promise<void>
}

type Begin = (
  e: ReactPointerEvent<HTMLElement>,
  entry: Entry,
  edge: ResizeEdge,
  column: HTMLElement
) => void

/** Edge-resize gesture (SPEC §9.1): threshold, snapping, clamping, auto-scroll, Esc. */
export function useResize(options: ResizeOptions): { active: ActiveResize | null; begin: Begin } {
  const opts = useRef(options)
  useLayoutEffect(() => {
    opts.current = options
  })
  const [active, setActive] = useState<ActiveResize | null>(null)
  /** Aborts the gesture in progress, if any. */
  const abort = useRef<(() => void) | null>(null)

  const begin = useCallback<Begin>((e, entry, edge, column) => {
    if (e.button !== 0 || abort.current) return
    e.preventDefault()
    e.stopPropagation()

    const dayStart = edgeDay(entry, edge)
    const original = edge === 'start' ? entry.start : (entry.end as number)
    const { prev, next } = neighborsOf(opts.current.entries, entry.id)
    const pxPerMin = opts.current.hourHeight / 60
    const edgeY = column.getBoundingClientRect().top + wallMinutes(original, dayStart) * pxPerMin
    const grabOffset = e.clientY - edgeY // so the edge doesn't jump under the pointer
    const startY = e.clientY
    const pointerId = e.pointerId
    let lastY = e.clientY
    let alt = e.altKey
    let moved = false
    let preview = entry
    let scrollSpeed = 0
    let frame = 0

    const compute = (): void => {
      const { hourHeight, onPreview } = opts.current
      const top = column.getBoundingClientRect().top
      const minutes = Math.round((lastY - top - grabOffset) / (hourHeight / 60))
      const proposed = timeAtWallMinutes(dayStart, Math.min(1440, Math.max(0, minutes)))
      const snapped = snapTime(proposed, original, snapStepMinutes(hourHeight, alt))
      preview = clampResize({ entry, edge, prev, next, now: Date.now() }, snapped)
      onPreview(preview)
    }

    const scrollStep = (): void => {
      frame = 0
      const el = opts.current.scroller.current
      if (!el || scrollSpeed === 0) return
      el.scrollTop += scrollSpeed
      compute()
      frame = requestAnimationFrame(scrollStep)
    }

    const autoScroll = (): void => {
      const el = opts.current.scroller.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const top = r.top + (opts.current.header.current?.offsetHeight ?? 0)
      let speed = 0
      if (lastY < top + AUTOSCROLL_ZONE_PX) {
        speed = -Math.min(1, (top + AUTOSCROLL_ZONE_PX - lastY) / AUTOSCROLL_ZONE_PX)
      } else if (lastY > r.bottom - AUTOSCROLL_ZONE_PX) {
        speed = Math.min(1, (lastY - (r.bottom - AUTOSCROLL_ZONE_PX)) / AUTOSCROLL_ZONE_PX)
      }
      scrollSpeed = speed * AUTOSCROLL_MAX_PX
      if (scrollSpeed !== 0 && !frame) frame = requestAnimationFrame(scrollStep)
    }

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) return
      lastY = ev.clientY
      alt = ev.altKey
      if (!moved && Math.abs(lastY - startY) < THRESHOLD_PX) return
      moved = true
      compute()
      autoScroll()
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        void finish(false)
      } else if (ev.key === 'Alt') {
        alt = ev.type === 'keydown'
        if (moved) compute()
      }
    }
    const onUp = (): void => void finish(true)
    const onCancel = (): void => void finish(false)

    const detach = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      cancelAnimationFrame(frame)
      document.body.classList.remove('resizing')
      abort.current = null
    }

    async function finish(commit: boolean): Promise<void> {
      if (abort.current !== detach) return // already finished
      detach()
      const time = edge === 'start' ? preview.start : preview.end
      if (commit && moved && time !== null && time !== original) {
        try {
          await opts.current.onCommit(entry, edge, time)
        } catch {
          // Main re-validates; the next refetch resyncs.
        }
      }
      setActive(null)
      opts.current.onPreview(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    abort.current = detach
    e.currentTarget.setPointerCapture(pointerId)
    document.body.classList.add('resizing')
    setActive({ id: entry.id, edge, dayStart })
  }, [])

  useEffect(() => () => abort.current?.(), [])

  return { active, begin }
}
