import {
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { MINUTE } from '@shared/constants'
import { formatClockRelative, formatDuration, formatHHMM } from '@shared/format'
import { floorMinute } from '@shared/time'
import type { Entry } from '@shared/types'
import type { Clock } from './clock'

export interface TrayModel {
  running?: Entry
  /** Set when the timer was auto-stopped (SPEC §6.2); cleared on the next Start. */
  autoStoppedAt?: number
  todayMs: number
  weekMs: number
  /** `null` when unavailable (development builds). */
  launchAtLogin: boolean | null
}

export interface TrayActions {
  start(): void
  stop(): void
  openCalendar(): void
  toggleLaunchAtLogin(): void
  quit(): void
}

/** Menu bar item: stopwatch icon when idle, elapsed `HH:MM` while running (SPEC §5). */
export class TrayController {
  private readonly tray: Tray
  private readonly idleIcon: NativeImage
  private readonly noIcon = nativeImage.createEmpty()
  private tick: NodeJS.Timeout | undefined

  constructor(
    iconPath: string,
    guid: string,
    private readonly clock: Clock,
    private readonly model: () => TrayModel,
    private readonly actions: TrayActions
  ) {
    this.idleIcon = nativeImage.createFromPath(iconPath)
    this.idleIcon.setTemplateImage(true)
    this.tray = new Tray(this.idleIcon, guid)
    this.tray.setIgnoreDoubleClickEvents(true)
    // Built on every click so the labels are never stale.
    const popUp = (): void => this.tray.popUpContextMenu(this.buildMenu())
    this.tray.on('click', popUp)
    this.tray.on('right-click', popUp)
    this.render()
  }

  render(): void {
    clearTimeout(this.tick)
    const { running } = this.model()
    const now = this.clock.now()
    if (running) {
      // Title first, then drop the icon, so the item never has neither.
      this.tray.setTitle(formatHHMM(floorMinute(now) - running.start), {
        fontType: 'monospacedDigit'
      })
      this.tray.setImage(this.noIcon)
      this.tray.setToolTip(`Running since ${formatClockRelative(running.start, now)}`)
      // Re-render just after the next wall-clock minute boundary.
      this.tick = setTimeout(() => this.render(), MINUTE - (now % MINUTE) + 50)
    } else {
      this.tray.setImage(this.idleIcon)
      this.tray.setTitle('')
      this.tray.setToolTip('Time Tracker — not running')
    }
  }

  private buildMenu(): Menu {
    const m = this.model()
    const now = this.clock.now()
    const status = m.running
      ? `Running · since ${formatClockRelative(m.running.start, now)}`
      : m.autoStoppedAt !== undefined
        ? `Stopped automatically at ${formatClockRelative(m.autoStoppedAt, now)}`
        : 'Not running'
    const template: MenuItemConstructorOptions[] = [
      { label: status, enabled: false },
      {
        label: `Today ${formatDuration(m.todayMs)} · Week ${formatDuration(m.weekMs)}`,
        enabled: false
      },
      { type: 'separator' },
      { label: 'Start', enabled: !m.running, click: () => this.actions.start() },
      { label: 'Stop', enabled: !!m.running, click: () => this.actions.stop() },
      { type: 'separator' },
      { label: 'Open Calendar', click: () => this.actions.openCalendar() },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: m.launchAtLogin === true,
        enabled: m.launchAtLogin !== null,
        click: () => this.actions.toggleLaunchAtLogin()
      },
      { type: 'separator' },
      { label: 'Quit Time Tracker', accelerator: 'Command+Q', click: () => this.actions.quit() }
    ]
    return Menu.buildFromTemplate(template)
  }
}
