import { app, dialog, Menu, powerMonitor, shell } from 'electron'
import { basename, join } from 'node:path'
import { addDays } from 'date-fns'
import trayIconPath from '../../resources/tray/stopwatchTemplate.png?asset'
import { IPC } from '@shared/constants'
import { setHourCycle } from '@shared/format'
import { dayStartOf, nextDayStart, totalMs, weekStartOf } from '@shared/time'
import { AutoStop } from './autoStop'
import { systemClock } from './clock'
import { History } from './history'
import { registerIpc } from './ipc'
import { systemHourCycle } from './locale'
import { buildAppMenu } from './menu'
import { PrefsStore } from './prefs'
import { EntryStore, type LoadReport } from './store'
import { TimerService } from './timer'
import { TrayController } from './tray'
import { WindowController } from './window'

const isDev = !app.isPackaged
/** Playwright runs (see tests/e2e): no focus stealing, internals reachable from main. */
const isTest = process.env.TT_TEST === '1'
// Lets macOS keep the menu bar item's position across relaunches (separate for dev builds).
const TRAY_GUID = isDev
  ? '6f1d2c3b-8a47-4e59-9b2c-0d3e4f5a6b72'
  : '6f1d2c3b-8a47-4e59-9b2c-0d3e4f5a6b71'

// Development and test runs never touch the real data (SPEC §12.1).
if (process.env.TT_DATA_DIR) app.setPath('userData', process.env.TT_DATA_DIR)
else if (isDev) app.setPath('userData', join(app.getPath('appData'), 'Time Tracker (Dev)'))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Closing the calendar window must not quit: the app lives in the menu bar.
  app.on('window-all-closed', () => {})
  void app.whenReady().then(bootstrap)
}

function bootstrap(): void {
  app.setActivationPolicy('accessory')

  const clock = systemClock
  const dataDir = app.getPath('userData')
  const store = new EntryStore(dataDir, clock)
  const report = store.load()
  const prefs = new PrefsStore(join(dataDir, 'prefs.json'))
  const timer = new TimerService(store, clock)
  const autoStop = new AutoStop(store, timer, clock)
  const history = new History()
  let autoStoppedAt: number | undefined

  const hourCycle = systemHourCycle()
  setHourCycle(hourCycle)

  const devUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const windows = new WindowController(
    prefs,
    {
      preload: join(__dirname, '../preload/index.js'),
      devUrl,
      file: join(__dirname, '../renderer/index.html'),
      args: [`--tt-hour-cycle=${hourCycle}`]
    },
    !isTest
  )

  const launchAtLogin = (): boolean | null =>
    isDev ? null : app.getLoginItemSettings().openAtLogin
  const toggleLaunchAtLogin = (): void => {
    if (isDev) return
    app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin })
    refreshAppMenu()
  }
  const undo = (): void => {
    if (!history.undo(store)) shell.beep()
  }
  const refreshAppMenu = (): void =>
    Menu.setApplicationMenu(
      buildAppMenu({
        command: (cmd) => windows.send(IPC.menuCommand, cmd),
        undo,
        launchAtLogin,
        toggleLaunchAtLogin,
        dev: isDev
      })
    )
  refreshAppMenu()

  const tray = new TrayController(
    trayIconPath,
    TRAY_GUID,
    clock,
    () => {
      const now = clock.now()
      const today = dayStartOf(now)
      const week = weekStartOf(now)
      const weekEnd = addDays(week, 7).getTime()
      const entries = store.list(week, weekEnd)
      return {
        running: timer.running(),
        autoStoppedAt,
        todayMs: totalMs(entries, today, nextDayStart(today), now),
        weekMs: totalMs(entries, week, weekEnd, now),
        launchAtLogin: launchAtLogin()
      }
    },
    {
      start: () => {
        autoStoppedAt = undefined
        timer.start()
      },
      stop: () => timer.stop(),
      openCalendar: () => windows.open(),
      toggleLaunchAtLogin,
      quit: () => app.quit()
    }
  )

  store.onChange(() => {
    tray.render()
    windows.send(IPC.entriesChanged)
  })

  const runAutoStop = (): void => {
    const stoppedAt = autoStop.check()
    if (stoppedAt !== undefined) autoStoppedAt = stoppedAt
    tray.render()
  }
  runAutoStop()

  powerMonitor.on('suspend', () => autoStop.markGapStart())
  powerMonitor.on('shutdown', () => autoStop.markGapStart())
  powerMonitor.on('resume', runAutoStop)
  powerMonitor.on('unlock-screen', () => tray.render())
  app.on('before-quit', () => autoStop.markGapStart())
  app.on('second-instance', () => windows.open())
  app.on('activate', () => windows.open())

  registerIpc({
    store,
    history,
    prefs,
    clock,
    isTrustedUrl: (url) => (devUrl ? url.startsWith(devUrl) : url.startsWith('file://'))
  })

  reportLoadProblems(report)
  if (report.status === 'new') windows.open()

  // Main-process only (Playwright's electronApp.evaluate); the renderer can't reach it.
  if (isTest) Object.assign(globalThis, { __tt: { store, timer, windows, autoStop } })
}

function reportLoadProblems(report: LoadReport): void {
  if (report.status !== 'restored' && report.status !== 'reset') return
  const detail =
    report.status === 'restored'
      ? `Restored from ${basename(report.backup)}. The damaged file was kept as ${basename(report.quarantined)}.`
      : `No usable backup was found, so tracking starts empty. The damaged file was kept as ${basename(report.quarantined)}.`
  app.focus({ steal: true })
  void dialog.showMessageBox({ type: 'warning', message: 'Time data was damaged', detail })
}
