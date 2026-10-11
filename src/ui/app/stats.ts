import { isAir, volumeOf, type Schematic } from '../../core/model'

export interface RegionStats {
  /** Non-air blocks. */
  blocks: number
  volume: number
}

/** Non-air block count and volume per region (left panel, stats overlay). */
export function regionStats(schematic: Schematic): RegionStats[] {
  return schematic.regions.map((region) => {
    const air = region.palette.map(isAir)
    let blocks = 0
    const data = region.blocks
    for (let i = 0; i < data.length; i++) if (!air[data[i]!]) blocks++
    return { blocks, volume: volumeOf(region.size) }
  })
}

export function totalVolume(schematic: Schematic): number {
  return schematic.regions.reduce((n, r) => n + volumeOf(r.size), 0)
}
