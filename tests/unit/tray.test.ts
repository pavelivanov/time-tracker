import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { MINUTE } from '@shared/constants'
import { TrayController, type TrayModel } from '../../src/main/tray'
import { at, entry } from './helpers'

const fake = vi.hoisted(() => {
  class FakeImage {
    template = false
    constructor(readonly name: string) {}
    setTemplateImage(v: boolean): void {
      this.template = v
    }
  }
  class FakeTray {
    static last: FakeTray
    title = ''
    titleOptions: unknown
    tooltip = ''
    menu: MenuItemConstructorOptions[] = []
    handlers: Record<string, () => void> = {}
    constructor(
      public image: FakeImage,
      readonly guid: string
    ) {
      FakeTray.last = this
    }
    setIgnoreDoubleClickEvents(): void {
      // not observed by these tests
    }
    on(event: string, fn: () => void): void {
      this.handlers[event] = fn
    }
    setTitle(title: string, options?: unknown): void {
      this.title = title
      this.titleOptions = options
    }
    setImage(image: FakeImage): void {
      this.image = image
    }
    setToolTip(tip: string): void {
      this.tooltip = tip
    }
    popUpContextMenu(menu: { items: MenuItemConstructorOptions[] }): void {
      this.menu = menu.items
    }
  }
  return { FakeImage, FakeTray }
})

vi.mock('electron', () => ({
  Tray: fake.FakeTray,
  Menu: { buildFromTemplate: (items: unknown[]) => ({ items }) },
  nativeImage: {
    createFromPath: (p: string) => new fake.FakeImage(p),
    createEmpty: () => new fake.FakeImage('empty')
  }
}))

describe('TrayController', () => {
  let model: TrayModel
  const actions = {
    start: vi.fn(),
    stop: vi.fn(),
    openCalendar: vi.fn(),
    toggleLaunchAtLogin: vi.fn(),
    quit: vi.fn()
  }
  const clock = { now: () => Date.now() }
  const create = (): InstanceType<typeof fake.FakeTray> => {
    new TrayController('icon.png', 'guid', clock, () => model, actions)
    return fake.FakeTray.last
  }
  const openMenu = (tray: InstanceType<typeof fake.FakeTray>): MenuItemConstructorOptions[] => {
    tray.handlers.click()
    return tray.menu
  }
  const item = (menu: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions =>
    menu.find((i) => i.label === label)!

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-10-05T15:28:40'))
    model = { todayMs: 0, weekMs: 0, launchAtLogin: false }
  })
  afterEach(() => vi.useRealTimers())

  it('idle: template stopwatch icon, no title', () => {
    const tray = create()
    expect(tray.image).toMatchObject({ name: 'icon.png', template: true })
    expect(tray.title).toBe('')
    const menu = openMenu(tray)
    expect(menu[0].label).toBe('Not running')
    expect(item(menu, 'Start').enabled).toBe(true)
    expect(item(menu, 'Stop').enabled).toBe(false)
  })

  it('running: only the elapsed HH:MM, ticking on wall-clock minutes', () => {
    model.running = entry('r', '2026-10-05T14:05', null)
    const tray = create()
    expect(tray.title).toBe('01:23')
    expect(tray.titleOptions).toEqual({ fontType: 'monospacedDigit' })
    expect(tray.image).toMatchObject({ name: 'empty' })
    vi.advanceTimersByTime(19_000) // 15:28:59
    expect(tray.title).toBe('01:23')
    vi.advanceTimersByTime(1_100) // past 15:29:00
    expect(tray.title).toBe('01:24')
    vi.advanceTimersByTime(MINUTE)
    expect(tray.title).toBe('01:25')
  })

  it('stopping restores the icon and clears the title', () => {
    model.running = entry('r', '2026-10-05T14:05', null)
    const tray = create()
    const controller = new TrayController('icon.png', 'guid', clock, () => model, actions)
    const t = fake.FakeTray.last
    model.running = undefined
    controller.render()
    expect(t.title).toBe('')
    expect(t.image).toMatchObject({ name: 'icon.png' })
    expect(tray).not.toBe(t)
  })

  it('menu reflects running state, totals and auto-stop notice', () => {
    model = { todayMs: 192 * MINUTE, weekMs: 1265 * MINUTE, launchAtLogin: null }
    model.autoStoppedAt = at('2026-10-05T09:02')
    const menu = openMenu(create())
    expect(menu[0].label).toMatch(/^Stopped automatically at /)
    expect(menu[1].label).toBe('Today 3h 12m · Week 21h 5m')
    expect(item(menu, 'Launch at Login').enabled).toBe(false)
    item(menu, 'Start').click!({} as never, undefined, {} as never)
    expect(actions.start).toHaveBeenCalled()
  })
})
