// Writes ~5 weeks of sample entries into the DEV data dir (never the real one).
//
//   node scripts/seed-dev.mjs [--no-running]
//
// Run while the dev app is not running; it would overwrite the file on its next write.
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MINUTE = 60_000
const dir =
  process.env.TT_DATA_DIR ?? join(homedir(), 'Library/Application Support/Time Tracker (Dev)')

// Deterministic PRNG (mulberry32) so screenshots are reproducible.
let seed = 42
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const now = Date.now()
const floor = (t) => t - (t % MINUTE)
const withRunning = !process.argv.includes('--no-running')
const runningStart = floor(now) - 83 * MINUTE
const limit = withRunning ? runningStart - 30 * MINUTE : floor(now)

const entries = []
const today = new Date(now)
today.setHours(0, 0, 0, 0)
for (let d = 34; d >= 0; d--) {
  const day = new Date(today)
  day.setDate(day.getDate() - d)
  const weekend = day.getDay() === 0 || day.getDay() === 6
  if (weekend && rand() < 0.7) continue
  const cursor = new Date(day)
  cursor.setHours(9 + Math.floor(rand() * 5), Math.floor(rand() * 60), 0, 0)
  // Occasionally a late session that runs past midnight.
  if (rand() < 0.08) cursor.setHours(21 + Math.floor(rand() * 2))
  let t = Math.max(cursor.getTime(), entries.at(-1)?.end ?? 0)
  const blocks = 1 + Math.floor(rand() * 4)
  for (let b = 0; b < blocks; b++) {
    const end = t + (25 + Math.floor(rand() * 190)) * MINUTE
    if (end > limit) break
    entries.push({ id: randomUUID(), start: t, end })
    t = end + (15 + Math.floor(rand() * 120)) * MINUTE
  }
}
if (withRunning) entries.push({ id: randomUUID(), start: runningStart, end: null })

mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'data.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2))
console.log(`wrote ${entries.length} entries to ${join(dir, 'data.json')}`)
