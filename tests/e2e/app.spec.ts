import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addDays, addMonths, addWeeks, startOfMonth, startOfWeek } from 'date-fns'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import type { Entry } from '../../src/shared/types'
import { formatDuration } from '../../src/shared/format'
import { totalMs } from '../../src/shared/time'

// Fixture data lives in last week so it is fully in the past whatever "now" is.
const lastMonday = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), -1)
const t = (day: number, h: number, m = 0): number => {
  const d = addDays(lastMonday, day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
const day = (n: number): number => t(n, 0)

const ENTRIES: Entry[] = [
  { id: 'mon', start: t(0, 9), end: t(0, 10, 30) },
  { id: 'night', start: t(0, 22, 30), end: t(1, 1, 15) },
  { id: 'wed', start: t(2, 14, 5), end: t(2, 15, 20) },
  { id: 'fri', start: t(4, 13), end: t(4, 17) }
]

let app: ElectronApplication
let page: Page
let dir: string

const saved = (): Entry[] => JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')).entries
const card = (id: string, dayStart?: number): ReturnType<Page['locator']> =>
  page.locator(
    `[data-testid="entry"][data-id="${id}"]${dayStart ? `[data-day="${dayStart}"]` : ''}`
  )

async function dragEdge(
  id: string,
  edge: 'start' | 'end',
  dy: number,
  finish = true
): Promise<void> {
  const handle = card(id).locator(`[data-edge="${edge}"]`)
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + dy / 2, { steps: 4 })
  await page.mouse.move(x, y + dy, { steps: 4 })
  if (finish) await page.mouse.up()
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tt-e2e-'))
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ schemaVersion: 1, entries: ENTRIES }))
  writeFileSync(
    join(dir, 'prefs.json'),
    JSON.stringify({
      view: 'week',
      hourHeight: 48,
      windowBounds: { x: 20, y: 40, width: 1100, height: 760 }
    })
  )
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TT_DATA_DIR: dir, TT_TEST: '1' }
  })
  // The test hook appears once main has bootstrapped (after `ready`).
  await expect.poll(() => app.evaluate(() => '__tt' in globalThis)).toBe(true)
  await app.evaluate(() => {
    ;(globalThis as unknown as { __tt: { windows: { open(): void } } }).__tt.windows.open()
  })
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByTestId('day-header').first()).toHaveAttribute('data-day', String(day(0)))
})

test.afterEach(async () => {
  await app.close()
})

test('AC-W1/W2: header totals add up; midnight split; week total', async () => {
  await expect(page.getByTestId('day-total')).toHaveText([
    '3h',
    '1h 15m',
    '1h 15m',
    '–',
    '4h',
    '–',
    '–'
  ])
  await expect(page.getByTestId('period-total')).toHaveText('9h 30m')
  await expect(card('night', day(0))).toContainText('1h 30m')
  await expect(card('night', day(1))).toContainText('1h 15m')
  await page.screenshot({ path: 'test-results/screens/week.png' })
})

test('AC-R1: dragging a bottom edge snaps, updates totals live, persists', async () => {
  await dragEdge('wed', 'end', 56, false) // +70 min at 48 px/h
  await expect(page.getByTestId('day-total').nth(2)).toHaveText('2h 25m')
  await page.screenshot({ path: 'test-results/screens/resizing.png' })
  await page.mouse.up()
  await expect(card('wed')).toContainText('2h 25m')
  await expect(page.getByTestId('period-total')).toHaveText('10h 40m')
  await expect.poll(() => saved().find((e) => e.id === 'wed')?.end).toBe(t(2, 16, 30))
})

test('top edge stops at the previous entry (AC-R2)', async () => {
  await dragEdge('night', 'start', -48 * 14) // way above 09:00–10:30
  await expect.poll(() => saved().find((e) => e.id === 'night')?.start).toBe(t(0, 10, 30))
})

test('AC-R5: Esc cancels; dragging the card body does nothing', async () => {
  await dragEdge('fri', 'end', 80, false)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  const box = (await card('fri').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 6 })
  await page.mouse.up()
  await expect(card('fri')).toContainText('4h')
  expect(saved().find((e) => e.id === 'fri')).toEqual(ENTRIES[3])
})

test('AC-M1..M4: month shows day totals only; a day opens its week', async () => {
  await page.getByRole('tab', { name: 'month' }).click()
  const month = startOfMonth(day(2)).getTime()
  const monthEnd = addMonths(month, 1).getTime()
  await expect(page.getByTestId('period-total')).toHaveText(
    formatDuration(totalMs(ENTRIES, month, monthEnd, Date.now()))
  )
  const cell = (n: number): ReturnType<Page['locator']> =>
    page.locator(`[data-testid="month-day"][data-day="${day(n)}"]`)
  if (day(0) >= month) await expect(cell(0).getByTestId('day-total')).toHaveText('3h')
  await expect(cell(2).getByTestId('day-total')).toHaveText('1h 15m')
  if (day(3) < monthEnd) await expect(cell(3).getByTestId('day-total')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/month.png' })

  await cell(2).click()
  await expect(page.getByRole('tab', { name: 'week' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('day-header').nth(2)).toHaveAttribute('data-day', String(day(2)))
})
