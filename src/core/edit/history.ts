import type { Schematic } from '../model'
import { editBytes, type Edit } from './edits'
import type { RegionChange } from './events'
import { redoEdit, undoEdit } from './undo'

/** Spec §7: history capped at ~256 MB, oldest entries evicted first. */
export const DEFAULT_HISTORY_CAP_BYTES = 256 * 1024 * 1024

/** One user action. A family swap or multi-region replace is one entry with several edits. */
export interface HistoryEntry {
  label: string
  edits: Edit[]
  bytes: number
}

export function makeEntry(label: string, edits: Edit[]): HistoryEntry {
  return { label, edits, bytes: edits.reduce((n, e) => n + editBytes(e), 0) }
}

export class History {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private total = 0

  constructor(readonly capBytes: number = DEFAULT_HISTORY_CAP_BYTES) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label
  }

  /** Bytes held by both stacks. */
  get bytes(): number {
    return this.total
  }

  get size(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length }
  }

  /**
   * Record an applied entry and drop the redo stack. Evicts the oldest
   * entries while over the cap. An entry larger than the whole cap cannot be
   * kept; the history is then cleared (older entries could not be undone
   * safely past it) and `false` is returned so the UI can say so.
   */
  push(entry: HistoryEntry): boolean {
    this.redoStack = []
    if (entry.bytes > this.capBytes) {
      this.clear()
      return false
    }
    this.undoStack.push(entry)
    this.total = this.undoStack.reduce((n, e) => n + e.bytes, 0)
    while (this.total > this.capBytes) this.total -= this.undoStack.shift()!.bytes
    return true
  }

  /**
   * Revert the newest entry; null when there is nothing to undo. If an edit
   * throws partway through a compound entry, the model is only partly
   * reverted and the entry is already popped, so the whole history is
   * cleared (neither stack could be trusted to undo/redo correctly) and the
   * error is rethrown.
   */
  undo(schematic: Schematic): RegionChange[] | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    try {
      const changes = [...entry.edits].reverse().map((e) => undoEdit(schematic, e))
      this.redoStack.push(entry)
      return changes
    } catch (e) {
      this.clear()
      throw e
    }
  }

  /** Re-apply the most recently undone entry; null when there is nothing to redo. Same failure handling as {@link undo}. */
  redo(schematic: Schematic): RegionChange[] | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    try {
      const changes = entry.edits.map((e) => redoEdit(schematic, e))
      this.undoStack.push(entry)
      return changes
    } catch (e) {
      this.clear()
      throw e
    }
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.total = 0
  }
}
