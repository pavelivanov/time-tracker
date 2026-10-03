import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import type { WindowBounds } from '@shared/types'
import type { PrefsStore } from './prefs'

const DEFAULT_SIZE = { width: 1100, height: 760 }

export interface RendererPaths {
  preload: string
  /** Vite dev server URL in development. */
  devUrl?: string
  file: string
  /** Small startup values for the preload script (`process.argv`). */
  args: string[]
}

const intersects = (a: WindowBounds, b: WindowBounds): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) >= 100 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) >= 100

/**
 * The calendar window. The app is an agent (no Dock icon) except while this window
 * exists; closing destroys it to free the renderer (SPEC §7.1).
 */
export class WindowController {
  private win: BrowserWindow | null = null
  private saveTimer: NodeJS.Timeout | undefined

  constructor(
    private readonly prefs: PrefsStore,
    private readonly paths: RendererPaths,
    /** `false` in automated tests: never steal focus from whatever the user is doing. */
    private readonly takeFocus = true
  ) {}

  send(channel: string, ...args: unknown[]): void {
    this.win?.webContents.send(channel, ...args)
  }

  open(): void {
    if (this.win) {
      if (this.win.isMinimized()) this.win.restore()
      this.reveal(this.win)
      return
    }

    app.setActivationPolicy('regular')
    const win = new BrowserWindow({
      ...this.initialBounds(),
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: 'Time Tracker',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
      webPreferences: {
        preload: this.paths.preload,
        additionalArguments: this.paths.args,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })
    this.win = win

    win.webContents.setVisualZoomLevelLimits(1, 1)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())

    win.once('ready-to-show', () => this.reveal(win))
    const scheduleSave = (): void => {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this.saveBounds(win), 400)
    }
    win.on('move', scheduleSave)
    win.on('resize', scheduleSave)
    win.on('close', () => this.saveBounds(win))
    win.on('closed', () => {
      clearTimeout(this.saveTimer)
      this.win = null
      app.setActivationPolicy('accessory')
    })

    if (this.paths.devUrl) void win.loadURL(this.paths.devUrl)
    else void win.loadFile(this.paths.file)
  }

  private reveal(win: BrowserWindow): void {
    if (!this.takeFocus) return win.showInactive()
    app.show() // un-hide after ⌘H
    win.show()
    app.focus({ steal: true })
  }

  private initialBounds(): Partial<WindowBounds> {
    const saved = this.prefs.get().windowBounds
    if (saved && screen.getAllDisplays().some((d) => intersects(d.workArea, saved))) return saved
    return DEFAULT_SIZE // no x/y → centered
  }

  private saveBounds(win: BrowserWindow): void {
    if (win.isDestroyed() || win.isFullScreen()) return
    this.prefs.set({ windowBounds: win.getNormalBounds() })
  }
}
