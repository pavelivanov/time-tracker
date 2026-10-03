export interface Entry {
  id: string
  /** Epoch ms (UTC), minute-aligned. */
  start: number
  /** Epoch ms (UTC), minute-aligned; `null` while running. */
  end: number | null
}

export interface DataFile {
  schemaVersion: 1
  /** Sorted by start, never overlapping, at most one running (the last). */
  entries: Entry[]
  /** When the current sleep/shutdown/quit gap began (SPEC §6.2). */
  lastAliveAt?: number
}

export type View = 'week' | 'month'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Prefs {
  view: View
  hourHeight: number
  windowBounds?: WindowBounds
}

export type ResizeEdge = 'start' | 'end'

export interface ResizeRequest {
  id: string
  edge: ResizeEdge
  time: number
}

export type MenuCommand =
  'view-week' | 'view-month' | 'today' | 'prev' | 'next' | 'zoom-in' | 'zoom-out' | 'zoom-reset'

/** API exposed to the renderer as `window.tt` by the preload script. */
export interface TrackerApi {
  /** System 12/24-hour preference, resolved by main. */
  hourCycle: 'h12' | 'h23'
  listEntries(range: { from: number; to: number }): Promise<Entry[]>
  /** Resolves to the saved (clamped) entry, or `null` if it no longer exists. */
  resizeEntry(req: ResizeRequest): Promise<Entry | null>
  /** Native context menu with "Delete" (SPEC §8.4). ⌘Z lives in the app menu. */
  showEntryMenu(id: string): Promise<void>
  getPrefs(): Promise<Prefs>
  setPrefs(patch: Partial<Prefs>): Promise<Prefs>
  onEntriesChanged(cb: () => void): () => void
  onMenuCommand(cb: (cmd: MenuCommand) => void): () => void
}
