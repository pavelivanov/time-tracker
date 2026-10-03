import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '@shared/types'

export interface AppMenuDeps {
  command(cmd: MenuCommand): void
  undo(): void
  /** `null` when unavailable (development builds). */
  launchAtLogin(): boolean | null
  toggleLaunchAtLogin(): void
  dev: boolean
}

/** Application menu, visible only while the calendar window is open (SPEC §7.3). */
export function buildAppMenu(d: AppMenuDeps): Menu {
  const cmd = (label: string, accelerator: string, c: MenuCommand): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => d.command(c)
  })
  const login = d.launchAtLogin()
  const devItems: MenuItemConstructorOptions[] = d.dev
    ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]
    : []

  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Launch at Login',
          type: 'checkbox',
          checked: login === true,
          enabled: login !== null,
          click: () => d.toggleLaunchAtLogin()
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => d.undo() }]
    },
    {
      label: 'View',
      submenu: [
        cmd('Week', 'CmdOrCtrl+1', 'view-week'),
        cmd('Month', 'CmdOrCtrl+2', 'view-month'),
        { type: 'separator' },
        cmd('Today', 'CmdOrCtrl+T', 'today'),
        cmd('Previous', 'CmdOrCtrl+Left', 'prev'),
        cmd('Next', 'CmdOrCtrl+Right', 'next'),
        { type: 'separator' },
        cmd('Zoom In', 'CmdOrCtrl+=', 'zoom-in'),
        cmd('Zoom Out', 'CmdOrCtrl+-', 'zoom-out'),
        cmd('Default Zoom', 'CmdOrCtrl+0', 'zoom-reset'),
        ...devItems
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' },
        { role: 'front' }
      ]
    }
  ])
}
