import type { NbtCompound } from 'deepslate/nbt'
import type { BlockArray } from '../litematic/bits'
import type { BlockState } from '../model'

/**
 * A whole-region replace: palette slots rewritten in place (spec §7,
 * "unscoped replace: store palette diff only").
 */
export interface PaletteEdit {
  kind: 'palette'
  /** Index into `schematic.regions`. */
  regionId: number
  /** Rewritten palette slots, ascending. */
  slots: number[]
  /** States at `slots` before and after the edit. */
  before: BlockState[]
  after: BlockState[]
  /**
   * Block entities the edit removed or replaced, keyed by block index: the
   * original compound, for undo to restore exactly.
   */
  removedTileEntities: Map<number, NbtCompound>
  /**
   * Block entities kept across a block entity id change (e.g. chest →
   * trapped chest): a copy of the original with `id` rewritten, keyed by
   * block index. Also present as the same index's entry in
   * `removedTileEntities`. Redo re-sets this copy; undo restores the
   * original from `removedTileEntities`.
   */
  addedTileEntities: Map<number, NbtCompound>
}

/** A scoped replace: individual block indices rewritten (spec §7). */
export interface BlocksEdit {
  kind: 'blocks'
  regionId: number
  /** Changed block indices, ascending. */
  indices: Uint32Array
  /**
   * The values at `indices` that are NOT currently in the region: the old
   * values while the edit is applied, the new values while it is undone.
   * Undo and redo swap them with the region's values.
   */
  values: BlockArray
  /** Palette length before the edit appended `paletteAdded`. */
  paletteLength: number
  paletteAdded: BlockState[]
  /** See {@link PaletteEdit.removedTileEntities}. */
  removedTileEntities: Map<number, NbtCompound>
  /** See {@link PaletteEdit.addedTileEntities}. */
  addedTileEntities: Map<number, NbtCompound>
}

export type Edit = PaletteEdit | BlocksEdit

/** Rough in-memory size of one BlockState object. */
export const STATE_BYTES = 128
const EDIT_OVERHEAD_BYTES = 64

/** Rough in-memory size of a block entity tag (SNBT length, UTF-16). */
export function tileEntityBytes(te: NbtCompound): number {
  return 2 * te.toString().length
}

/** Estimated memory an edit keeps alive in the history (for the 256 MB cap). */
export function editBytes(edit: Edit): number {
  let bytes = EDIT_OVERHEAD_BYTES
  for (const te of edit.removedTileEntities.values()) bytes += tileEntityBytes(te)
  for (const te of edit.addedTileEntities.values()) bytes += tileEntityBytes(te)
  if (edit.kind === 'palette') return bytes + edit.slots.length * (8 + 2 * STATE_BYTES)
  return bytes + edit.indices.byteLength + edit.values.byteLength + edit.paletteAdded.length * STATE_BYTES
}
