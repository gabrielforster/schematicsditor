import { DirtyChunks, type ChunkCoord, type RegionChange } from '../../core/edit/events'
import type { Region } from '../../core/model'

/**
 * Chunks to remesh for one change event (spec §8.7). `dirtyChunks` already
 * include face neighbours. For `paletteChange`, every chunk holding one of
 * the slots, plus face neighbours whose border holds one, is dirty.
 */
export function chunksForChange(region: Region, change: RegionChange): ChunkCoord[] {
  if ('dirtyChunks' in change) return change.dirtyChunks
  const changed = new Uint8Array(region.palette.length)
  for (const slot of change.paletteChange.slots) if (slot < changed.length) changed[slot] = 1
  const dirty = new DirtyChunks(region.size)
  const { blocks } = region
  for (let i = 0; i < blocks.length; i++) if (changed[blocks[i]!]) dirty.markIndex(i)
  return dirty.list()
}
