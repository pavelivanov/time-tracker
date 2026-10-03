import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Entry } from '@shared/types'

/** Local time: `at('2026-10-05T14:05')`. */
export const at = (local: string): number => new Date(local).getTime()

export const entry = (id: string, start: string, end: string | null): Entry => ({
  id,
  start: at(start),
  end: end === null ? null : at(end)
})

export interface FakeClock {
  now(): number
  set(t: number): void
  advance(ms: number): void
}

export function fakeClock(start: number): FakeClock {
  let t = start
  return {
    now: () => t,
    set: (v) => {
      t = v
    },
    advance: (ms) => {
      t += ms
    }
  }
}

export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'tt-test-'))
