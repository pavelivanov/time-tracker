import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { DEFAULT_HOUR_HEIGHT, ZOOM_STEPS } from '@shared/constants'
import type { Prefs } from '@shared/types'

const boundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
})

export const prefsPatchSchema = z
  .object({
    view: z.enum(['week', 'month']),
    hourHeight: z.number().refine((h) => (ZOOM_STEPS as readonly number[]).includes(h)),
    windowBounds: boundsSchema
  })
  .partial()

const DEFAULTS: Prefs = { view: 'week', hourHeight: DEFAULT_HOUR_HEIGHT }

/** UI preferences + window bounds in `prefs.json` (SPEC §12.1). Low value: bad files reset. */
export class PrefsStore {
  private prefs: Prefs

  constructor(private readonly file: string) {
    this.prefs = this.read()
  }

  get(): Prefs {
    return this.prefs
  }

  set(patch: Partial<Prefs>): Prefs {
    this.prefs = { ...this.prefs, ...prefsPatchSchema.parse(patch) }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.prefs, null, 2))
    renameSync(`${this.file}.tmp`, this.file)
    return this.prefs
  }

  private read(): Prefs {
    try {
      return { ...DEFAULTS, ...prefsPatchSchema.parse(JSON.parse(readFileSync(this.file, 'utf8'))) }
    } catch {
      return { ...DEFAULTS }
    }
  }
}
