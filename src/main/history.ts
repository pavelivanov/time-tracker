import { UNDO_LIMIT } from '@shared/constants'
import type { Entry } from '@shared/types'
import type { EntryStore } from './store'

interface Edit {
  before: Entry
  /** `null` = the edit deleted the entry. */
  after: Entry | null
}

const same = (a: Entry | undefined, b: Entry | null): boolean =>
  a === undefined ? b === null : b !== null && a.start === b.start && a.end === b.end

/** In-memory undo for calendar edits (resize, delete) — SPEC §8.4. */
export class History {
  private readonly edits: Edit[] = []

  push(edit: Edit): void {
    this.edits.push(edit)
    if (this.edits.length > UNDO_LIMIT) this.edits.shift()
  }

  /** Restores the last edit if nothing touched that entry since; otherwise drops it. */
  undo(store: EntryStore): boolean {
    const edit = this.edits.pop()
    if (!edit) return false
    if (!same(store.get(edit.before.id), edit.after)) return false
    try {
      if (edit.after === null) store.insert(edit.before)
      else store.update(edit.before)
      return true
    } catch {
      return false // restoring would break invariants (e.g. a newer timer is running)
    }
  }
}
