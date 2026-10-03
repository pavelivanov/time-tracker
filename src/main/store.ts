import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync
} from 'node:fs'
import { join } from 'node:path'
import { format } from 'date-fns'
import { z } from 'zod'
import { BACKUP_KEEP } from '@shared/constants'
import { findViolations, repairEntries } from '@shared/invariants'
import type { DataFile, Entry } from '@shared/types'
import type { Clock } from './clock'

const entrySchema = z.object({
  id: z.string().min(1),
  start: z.number().int(),
  end: z.number().int().nullable()
})

const dataSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(entrySchema),
  lastAliveAt: z.number().int().optional()
})

export type LoadReport =
  | { status: 'new' }
  | { status: 'ok' }
  | { status: 'repaired'; problems: string[]; copy: string }
  | { status: 'restored'; quarantined: string; backup: string }
  | { status: 'reset'; quarantined: string }

export class InvariantError extends Error {}

/**
 * Owns `data.json`: the single source of truth for entries (SPEC §12). Every mutation is
 * validated, written atomically and synchronously (data is tiny, writes are rare), then
 * broadcast to listeners.
 */
export class EntryStore {
  private data: DataFile = { schemaVersion: 1, entries: [] }
  private readonly listeners = new Set<() => void>()
  private backedUpDay: string | null = null

  constructor(
    private readonly dir: string,
    private readonly clock: Clock,
    private readonly log: (msg: string) => void = console.warn
  ) {}

  get file(): string {
    return join(this.dir, 'data.json')
  }

  private get backupDir(): string {
    return join(this.dir, 'backups')
  }

  load(): LoadReport {
    if (!existsSync(this.file)) return { status: 'new' }
    const stamp = format(this.clock.now(), "yyyyMMdd'T'HHmmss")

    let parsed: DataFile
    try {
      parsed = dataSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch (err) {
      const quarantined = join(this.dir, `data.corrupt-${stamp}.json`)
      renameSync(this.file, quarantined)
      this.log(`data.json unreadable (${String(err)}); moved to ${quarantined}`)
      const backup = this.newestValidBackup()
      if (backup) {
        this.data = backup.data
        this.write()
        return { status: 'restored', quarantined, backup: backup.file }
      }
      return { status: 'reset', quarantined }
    }

    const problems = findViolations(parsed.entries)
    if (problems.length > 0) {
      const copy = join(this.dir, `data.pre-repair-${stamp}.json`)
      copyFileSync(this.file, copy)
      this.data = { ...parsed, entries: repairEntries(parsed.entries) }
      this.write()
      this.log(`data.json repaired (${problems.join('; ')}); original kept as ${copy}`)
      return { status: 'repaired', problems, copy }
    }

    this.data = parsed
    return { status: 'ok' }
  }

  all(): readonly Entry[] {
    return this.data.entries
  }

  get(id: string): Entry | undefined {
    return this.data.entries.find((e) => e.id === id)
  }

  last(): Entry | undefined {
    return this.data.entries.at(-1)
  }

  running(): Entry | undefined {
    const last = this.last()
    return last?.end === null ? last : undefined
  }

  /** Entries overlapping `[from, to)`; a running entry is open-ended. */
  list(from: number, to: number): Entry[] {
    return this.data.entries.filter((e) => e.start < to && (e.end ?? Infinity) > from)
  }

  get lastAliveAt(): number | undefined {
    return this.data.lastAliveAt
  }

  setLastAliveAt(t: number | undefined): void {
    if (this.data.lastAliveAt === t) return
    this.data = { ...this.data, lastAliveAt: t }
    if (t === undefined) delete this.data.lastAliveAt
    this.write()
  }

  /** Inserts at the sorted position. */
  insert(entry: Entry): void {
    const entries = [...this.data.entries, entry].sort((a, b) => a.start - b.start)
    this.commit(entries)
  }

  update(entry: Entry): void {
    const i = this.data.entries.findIndex((e) => e.id === entry.id)
    if (i === -1) throw new InvariantError(`No entry ${entry.id}`)
    const entries = [...this.data.entries]
    entries[i] = entry
    this.commit(entries)
  }

  remove(id: string): Entry | undefined {
    const removed = this.get(id)
    if (!removed) return undefined
    this.commit(this.data.entries.filter((e) => e.id !== id))
    return removed
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private commit(entries: Entry[]): void {
    const problems = findViolations(entries)
    if (problems.length > 0) throw new InvariantError(problems.join('; '))
    this.data = { ...this.data, entries }
    this.write()
    for (const listener of this.listeners) listener()
  }

  /** Atomic write: temp file → fsync → rename. Takes a daily snapshot first. */
  private write(): void {
    mkdirSync(this.dir, { recursive: true })
    this.backupOncePerDay()
    const tmp = `${this.file}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, JSON.stringify(this.data, null, 2))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.file)
  }

  private backupOncePerDay(): void {
    const day = format(this.clock.now(), 'yyyy-MM-dd')
    if (this.backedUpDay === day) return
    this.backedUpDay = day
    if (!existsSync(this.file)) return
    try {
      mkdirSync(this.backupDir, { recursive: true })
      const target = join(this.backupDir, `data-${day}.json`)
      if (!existsSync(target)) copyFileSync(this.file, target)
      const backups = this.backupFiles()
      for (const old of backups.slice(BACKUP_KEEP)) rmSync(join(this.backupDir, old))
    } catch (err) {
      this.log(`backup failed: ${String(err)}`)
    }
  }

  /** Newest first. */
  private backupFiles(): string[] {
    if (!existsSync(this.backupDir)) return []
    return readdirSync(this.backupDir)
      .filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse()
  }

  private newestValidBackup(): { file: string; data: DataFile } | undefined {
    for (const name of this.backupFiles()) {
      const file = join(this.backupDir, name)
      try {
        const data = dataSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
        return { file, data: { ...data, entries: repairEntries(data.entries) } }
      } catch {
        // try the next older one
      }
    }
    return undefined
  }
}
