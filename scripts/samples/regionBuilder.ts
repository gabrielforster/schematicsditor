// A tiny voxel builder for the synthetic sample and fixture schematics.
// Every minecraft: block is checked against the bundled registry and
// completed with its default properties, so the files only contain states
// the game accepts. Other namespaces (mod blocks) pass through unchecked.
import { NbtCompound, NbtInt, NbtList } from 'deepslate/nbt'
import { validateTarget } from '../../src/core/edit'
import type { BlockState, Region, Vec3 } from '../../src/core/model'
import { AIR, blockIndex, blockStateKey, createBlockArray, parseBlockStateKey, volumeOf } from '../../src/core/model'
import { normalizeBlockName, type BlockRegistry } from '../../src/core/registry'

export function resolveState(key: string, registry: BlockRegistry): BlockState {
  const parsed = parseBlockStateKey(key)
  const name = normalizeBlockName(parsed.name)
  if (!name.startsWith('minecraft:')) return { name, properties: parsed.properties }
  const def = validateTarget({ name, properties: parsed.properties }, registry)
  return { name: def.name, properties: { ...def.defaults, ...parsed.properties } }
}

export class RegionBuilder {
  private readonly palette: BlockState[] = [AIR]
  private readonly indexByKey = new Map<string, number>([[blockStateKey(AIR), 0]])
  private readonly blocks: Uint16Array
  private readonly tileEntities = new Map<number, NbtCompound>()
  private readonly entities: NbtCompound[] = []

  constructor(
    readonly name: string,
    /** Minimum corner, schematic coordinates. */
    readonly position: Vec3,
    /** Positive size. */
    readonly size: Vec3,
    private readonly registry: BlockRegistry,
  ) {
    this.blocks = new Uint16Array(volumeOf(size))
  }

  /** Place a block at region-local (min-corner relative) coordinates. */
  set(x: number, y: number, z: number, key: string): this {
    if (x < 0 || y < 0 || z < 0 || x >= this.size.x || y >= this.size.y || z >= this.size.z) {
      throw new RangeError(`${this.name}: ${x},${y},${z} is outside the region`)
    }
    const state = resolveState(key, this.registry)
    const stateKey = blockStateKey(state)
    let index = this.indexByKey.get(stateKey)
    if (index === undefined) {
      index = this.palette.length
      this.palette.push(state)
      this.indexByKey.set(stateKey, index)
    }
    this.blocks[blockIndex(this.size, x, y, z)] = index
    return this
  }

  /** Fill the inclusive box between two local corners. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, key: string): this {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, key)
    return this
  }

  /** Attach block entity data; x/y/z (local) are added to the tag. */
  tileEntity(x: number, y: number, z: number, tag: NbtCompound): this {
    tag.set('x', new NbtInt(x)).set('y', new NbtInt(y)).set('z', new NbtInt(z))
    this.tileEntities.set(blockIndex(this.size, x, y, z), tag)
    return this
  }

  /** An entity tag; its Pos must already be relative to the region's file Position. */
  entity(tag: NbtCompound): this {
    this.entities.push(tag)
    return this
  }

  /**
   * The finished region. `fileBox` is the raw Position/Size written to the
   * file (size may be negative); it must normalize to this region's box.
   */
  build(fileBox?: { position: Vec3; size: Vec3 }): Region {
    const blocks = createBlockArray(this.blocks.length, this.palette.length)
    blocks.set(this.blocks)
    return {
      name: this.name,
      position: this.position,
      size: this.size,
      ...(fileBox ? { fileBox } : {}),
      palette: [...this.palette],
      blocks,
      tileEntities: new Map(this.tileEntities),
      strayTileEntities: [],
      extra: new NbtCompound()
        .set('Entities', new NbtList(this.entities))
        .set('PendingBlockTicks', new NbtList())
        .set('PendingFluidTicks', new NbtList()),
    }
  }
}
