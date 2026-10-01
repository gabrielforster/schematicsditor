import { MeshBasicMaterial, type Texture } from 'three'

export type MeshBucket = 'opaque' | 'transparent' | 'faded' | 'ghost'

/** Draw order: opaque first, then transparent with depth-write off (spec §8.4), then faded overlays. */
export const RENDER_ORDER: Record<MeshBucket, number> = { opaque: 0, transparent: 1, faded: 2, ghost: 3 }

/**
 * Unlit materials for chunk meshes. Shading is baked into vertex colors;
 * colors and the atlas are used as stored (no color-space conversion).
 */
export class ChunkMaterials {
  private readonly colored: Record<MeshBucket, MeshBasicMaterial>
  private textured: Record<MeshBucket, MeshBasicMaterial> | null = null
  private atlas: Texture | null = null

  constructor() {
    this.colored = makeSet(null)
  }

  /** Sets the atlas for textured meshes; null drops it. Takes ownership: the previous atlas texture is disposed. */
  setAtlas(atlas: Texture | null): void {
    if (atlas === this.atlas) return
    if (this.textured) for (const m of Object.values(this.textured)) m.dispose()
    this.atlas?.dispose()
    this.atlas = atlas
    this.textured = atlas ? makeSet(atlas) : null
  }

  /** Material for a mesh bucket; textured when the mesh has UVs and an atlas is loaded. */
  get(bucket: MeshBucket, hasUvs: boolean): MeshBasicMaterial {
    return (hasUvs && this.textured ? this.textured : this.colored)[bucket]
  }

  dispose(): void {
    for (const m of Object.values(this.colored)) m.dispose()
    this.setAtlas(null)
  }
}

function makeSet(map: Texture | null): Record<MeshBucket, MeshBasicMaterial> {
  return {
    opaque: new MeshBasicMaterial({ map, vertexColors: true, alphaTest: map ? 0.5 : 0 }),
    transparent: new MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false }),
    faded: new MeshBasicMaterial({ map, vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false }),
    ghost: new MeshBasicMaterial({ map, vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
  }
}
