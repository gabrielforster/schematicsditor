import { Box3, Box3Helper, Color, Group, Mesh, Vector3, type Object3D } from 'three'
import { CHUNK_SIZE, type ChunkCoord } from '../../core/edit/events'
import type { Schematic } from '../../core/model'
import type { ChunkPass } from '../chunks/coords'
import { chunkInnerSize } from '../chunks/coords'
import type { ChunkView } from '../chunks/manager'
import type { ChunkMeshes } from '../mesh/types'
import { toGeometry } from './geometry'
import { RENDER_ORDER, type ChunkMaterials, type MeshBucket } from './materials'

const FAILED_COLOR = new Color(0xff2020)

/** Three.js side of the chunk manager: one group per region at its offset, one group per chunk. */
export class ThreeChunkView implements ChunkView {
  readonly root = new Group()
  private regions: Group[] = []
  private readonly chunks = new Map<string, Object3D>()
  private schematic: Schematic | null = null

  constructor(private readonly materials: ChunkMaterials) {
    this.root.name = 'chunks'
  }

  /** Creates the region groups; call before the chunk manager's setSchematic. */
  setSchematic(schematic: Schematic | null): void {
    this.clear()
    for (const g of this.regions) this.root.remove(g)
    this.schematic = schematic
    this.regions = (schematic?.regions ?? []).map((r, i) => {
      const g = new Group()
      g.name = `region ${i}`
      g.position.set(r.position.x, r.position.y, r.position.z)
      this.root.add(g)
      return g
    })
  }

  setRegionVisible(regionId: number, visible: boolean): void {
    const g = this.regions[regionId]
    if (g) g.visible = visible
  }

  set(key: string, regionId: number, coord: ChunkCoord, pass: ChunkPass, meshes: ChunkMeshes): void {
    const group = new Group()
    group.position.set(coord.cx * CHUNK_SIZE, coord.cy * CHUNK_SIZE, coord.cz * CHUNK_SIZE)
    for (const bucket of ['opaque', 'transparent', 'faded'] as const) {
      const data = meshes[bucket]
      if (!data) continue
      const drawAs: MeshBucket = pass === 'ghost' ? 'ghost' : bucket
      const mesh = new Mesh(toGeometry(data), this.materials.get(drawAs, data.uvs !== null))
      mesh.renderOrder = RENDER_ORDER[drawAs]
      mesh.matrixAutoUpdate = false
      group.add(mesh)
    }
    this.replace(key, regionId, group)
  }

  fail(key: string, regionId: number, coord: ChunkCoord): void {
    const region = this.schematic?.regions[regionId]
    if (!region) return
    const size = chunkInnerSize(region.size, coord)
    const min = new Vector3(coord.cx * CHUNK_SIZE, coord.cy * CHUNK_SIZE, coord.cz * CHUNK_SIZE)
    const box = new Box3(min, min.clone().add(new Vector3(size.x, size.y, size.z)))
    this.replace(key, regionId, new Box3Helper(box, FAILED_COLOR))
  }

  delete(key: string): void {
    const old = this.chunks.get(key)
    if (!old) return
    old.removeFromParent()
    disposeTree(old)
    this.chunks.delete(key)
  }

  clear(): void {
    for (const key of [...this.chunks.keys()]) this.delete(key)
  }

  private replace(key: string, regionId: number, object: Object3D): void {
    this.delete(key)
    const parent = this.regions[regionId]
    if (!parent) {
      disposeTree(object)
      return
    }
    object.updateMatrixWorld(true)
    parent.add(object)
    this.chunks.set(key, object)
  }
}

/** Frees geometries (chunk materials are shared and owned by ChunkMaterials). */
function disposeTree(object: Object3D): void {
  if (object instanceof Box3Helper) {
    object.dispose()
    return
  }
  object.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose()
  })
}
