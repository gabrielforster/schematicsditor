import type { Region, Schematic } from '../model'
import type { BlocksEdit, Edit } from './edits'
import { dirtyChunksForIndices, type RegionChange } from './events'

function swapValues(region: Region, edit: BlocksEdit): void {
  const { blocks } = region
  const { indices, values } = edit
  for (let k = 0; k < indices.length; k++) {
    const index = indices[k]!
    const current = blocks[index]!
    blocks[index] = values[k]!
    values[k] = current
  }
}

function regionOf(schematic: Schematic, edit: Edit): Region {
  const region = schematic.regions[edit.regionId]
  if (!region) throw new Error(`history out of sync: no region ${edit.regionId}`)
  return region
}

/** Revert an applied edit in place. */
export function undoEdit(schematic: Schematic, edit: Edit): RegionChange {
  const region = regionOf(schematic, edit)
  for (const [index, te] of edit.removedTileEntities) region.tileEntities.set(index, te)
  if (edit.kind === 'palette') {
    edit.slots.forEach((slot, k) => { region.palette[slot] = edit.before[k]! })
    return { regionId: edit.regionId, paletteChange: { indices: [...edit.slots] } }
  }
  if (region.palette.length !== edit.paletteLength + edit.paletteAdded.length) {
    throw new Error(`history out of sync: region ${edit.regionId} palette has ${region.palette.length} entries`)
  }
  swapValues(region, edit)
  // Every block using an appended slot was written by this edit, so after
  // the swap none remains and the slots can go. The array stays Uint32 if
  // the edit widened it; compactRegion narrows it again on save.
  region.palette.length = edit.paletteLength
  return { regionId: edit.regionId, dirtyChunks: dirtyChunksForIndices(region.size, edit.indices) }
}

/** Re-apply an undone edit in place. */
export function redoEdit(schematic: Schematic, edit: Edit): RegionChange {
  const region = regionOf(schematic, edit)
  for (const index of edit.removedTileEntities.keys()) region.tileEntities.delete(index)
  if (edit.kind === 'palette') {
    edit.slots.forEach((slot, k) => { region.palette[slot] = edit.after[k]! })
    return { regionId: edit.regionId, paletteChange: { indices: [...edit.slots] } }
  }
  if (region.palette.length !== edit.paletteLength) {
    throw new Error(`history out of sync: region ${edit.regionId} palette has ${region.palette.length} entries`)
  }
  region.palette.push(...edit.paletteAdded)
  if (region.palette.length > 65536 && region.blocks instanceof Uint16Array) {
    region.blocks = Uint32Array.from(region.blocks)
  }
  swapValues(region, edit)
  return { regionId: edit.regionId, dirtyChunks: dirtyChunksForIndices(region.size, edit.indices) }
}
