export const MINUTE = 60_000
export const HOUR = 60 * MINUTE

/** A running timer is auto-stopped when a sleep/shutdown/quit gap exceeds this (SPEC §6.2). */
export const AUTO_STOP_GAP_MS = 5 * HOUR

/** date-fns `weekStartsOn`: weeks start on Monday (SPEC §3). */
export const WEEK_STARTS_ON = 1

/** Week view hour heights in px (SPEC §8.2). */
export const ZOOM_STEPS = [24, 32, 48, 64, 96, 144] as const
export const DEFAULT_HOUR_HEIGHT = 48

/** Calendar edits kept for ⌘Z (SPEC §8.4). */
export const UNDO_LIMIT = 20

/** Daily data snapshots kept (SPEC §12.4). */
export const BACKUP_KEEP = 30

export const IPC = {
  entriesList: 'entries:list',
  entriesResize: 'entries:resize',
  entriesContextMenu: 'entries:contextMenu',
  entriesChanged: 'entries:changed',
  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',
  menuCommand: 'menu:command'
} as const
