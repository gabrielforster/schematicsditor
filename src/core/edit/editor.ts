import type { Schematic } from '../model'
import type { BlockRegistry } from '../registry'
import type { RegionChange } from './events'
import { DEFAULT_HISTORY_CAP_BYTES, History, makeEntry } from './history'
import type { Matcher } from './matchers'
import { applyReplace, deleteRule, previewReplace, type ReplacePreview, type ReplaceResult, type ReplaceRule } from './replace'
import type { Scope } from './scopes'
import type { Family } from '../families/families'
import { familySwapRules, previewFamilySwap, type FamilySwapPreview } from '../families/swap'

export type ChangeListener = (changes: RegionChange[]) => void

export interface EditResult extends ReplacePreview {
  /** False when the edit was too large for the history; it was applied but cannot be undone. */
  undoable: boolean
}

/**
 * The one place that mutates an open schematic. Edits rewrite region
 * palettes and block arrays in place (a block array is swapped for a
 * Uint32Array only when the palette outgrows 16 bits), record a history
 * entry, and notify listeners with the changed chunks or palette slots.
 * Readers such as the renderer must read `region.blocks` and
 * `region.palette` from the region object each time instead of keeping
 * the arrays, and must never mutate the schematic themselves.
 */
export class Editor {
  readonly history: History
  private readonly listeners = new Set<ChangeListener>()

  constructor(
    readonly schematic: Schematic,
    readonly registry: BlockRegistry,
    options: { historyCapBytes?: number } = {},
  ) {
    this.history = new History(options.historyCapBytes ?? DEFAULT_HISTORY_CAP_BYTES)
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  previewReplace(rules: readonly ReplaceRule[], scopes: readonly Scope[]): ReplacePreview {
    return previewReplace(this.schematic, rules, scopes, this.registry)
  }

  replace(rules: readonly ReplaceRule[], scopes: readonly Scope[], label = 'Replace'): EditResult {
    return this.commit(label, applyReplace(this.schematic, rules, scopes, this.registry))
  }

  delete(from: readonly Matcher[], scopes: readonly Scope[], label = 'Delete'): EditResult {
    return this.replace([deleteRule(from)], scopes, label)
  }

  previewFamilySwap(source: Family, target: Family, scopes: readonly Scope[]): FamilySwapPreview {
    return previewFamilySwap(this.schematic, source, target, scopes, this.registry)
  }

  /** Every shared shape is swapped in one pass and recorded as one history entry. */
  familySwap(source: Family, target: Family, scopes: readonly Scope[]): EditResult {
    return this.replace(familySwapRules(source, target), scopes, `${source.label} → ${target.label}`)
  }

  undo(): boolean {
    const changes = this.history.undo(this.schematic)
    if (!changes) return false
    this.emit(changes)
    return true
  }

  redo(): boolean {
    const changes = this.history.redo(this.schematic)
    if (!changes) return false
    this.emit(changes)
    return true
  }

  protected commit(label: string, result: ReplaceResult): EditResult {
    const { edits, changes, ...preview } = result
    if (edits.length === 0) return { ...preview, undoable: true }
    const undoable = this.history.push(makeEntry(label, edits))
    this.emit(changes)
    return { ...preview, undoable }
  }

  private emit(changes: RegionChange[]): void {
    for (const listener of this.listeners) listener(changes)
  }
}
