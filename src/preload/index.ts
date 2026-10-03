import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/constants'
import type { MenuCommand, TrackerApi } from '@shared/types'

function subscribe<T extends unknown[]>(
  channel: string,
  listener: (event: IpcRendererEvent, ...args: T) => void
): () => void {
  const wrapped = listener as (event: IpcRendererEvent, ...args: unknown[]) => void
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const hourCycleArg = process.argv.find((a) => a.startsWith('--tt-hour-cycle='))

const api: TrackerApi = {
  hourCycle: hourCycleArg?.endsWith('h23') ? 'h23' : 'h12',
  listEntries: (range) => ipcRenderer.invoke(IPC.entriesList, range),
  resizeEntry: (req) => ipcRenderer.invoke(IPC.entriesResize, req),
  showEntryMenu: (id) => ipcRenderer.invoke(IPC.entriesContextMenu, { id }),
  getPrefs: () => ipcRenderer.invoke(IPC.prefsGet),
  setPrefs: (patch) => ipcRenderer.invoke(IPC.prefsSet, patch),
  onEntriesChanged: (cb) => subscribe(IPC.entriesChanged, () => cb()),
  onMenuCommand: (cb) => subscribe<[MenuCommand]>(IPC.menuCommand, (_event, cmd) => cb(cmd))
}

contextBridge.exposeInMainWorld('tt', api)
