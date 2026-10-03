import { BrowserWindow, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/constants'
import { clampResize, neighborsOf } from '@shared/resize'
import type { Entry } from '@shared/types'
import type { Clock } from './clock'
import type { History } from './history'
import { prefsPatchSchema, type PrefsStore } from './prefs'
import type { EntryStore } from './store'

const rangeSchema = z.object({ from: z.number(), to: z.number() })
const resizeSchema = z.object({
  id: z.string().min(1),
  edge: z.enum(['start', 'end']),
  time: z.number()
})
const idSchema = z.object({ id: z.string().min(1) })

export interface IpcDeps {
  store: EntryStore
  history: History
  prefs: PrefsStore
  clock: Clock
  isTrustedUrl(url: string): boolean
}

export function registerIpc(d: IpcDeps): void {
  const handle = (
    channel: string,
    fn: (event: IpcMainInvokeEvent, arg: unknown) => unknown
  ): void => {
    ipcMain.handle(channel, (event, arg) => {
      if (!d.isTrustedUrl(event.senderFrame?.url ?? '')) throw new Error('Untrusted IPC sender')
      return fn(event, arg)
    })
  }

  handle(IPC.entriesList, (_event, arg) => {
    const { from, to } = rangeSchema.parse(arg)
    return d.store.list(from, to)
  })

  // The renderer previews with the same clampResize(); main re-applies it to the
  // authoritative data before saving (SPEC §9.4).
  handle(IPC.entriesResize, (_event, arg): Entry | null => {
    const req = resizeSchema.parse(arg)
    const entry = d.store.get(req.id)
    if (!entry || (req.edge === 'end' && entry.end === null)) {
      shell.beep()
      return null
    }
    const ctx = {
      entry,
      edge: req.edge,
      now: d.clock.now(),
      ...neighborsOf(d.store.all(), entry.id)
    }
    const updated = clampResize(ctx, req.time)
    if (updated.start === entry.start && updated.end === entry.end) return entry
    d.store.update(updated)
    d.history.push({ before: entry, after: updated })
    return updated
  })

  handle(IPC.entriesContextMenu, (event, arg) => {
    const { id } = idSchema.parse(arg)
    const remove = (): void => {
      const removed = d.store.remove(id)
      if (removed) d.history.push({ before: removed, after: null })
    }
    Menu.buildFromTemplate([{ label: 'Delete', click: remove }]).popup({
      window: BrowserWindow.fromWebContents(event.sender) ?? undefined
    })
  })

  handle(IPC.prefsGet, () => d.prefs.get())
  handle(IPC.prefsSet, (_event, arg) => d.prefs.set(prefsPatchSchema.parse(arg)))
}
