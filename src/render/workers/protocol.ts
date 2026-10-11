import type { TexturedAssets } from '../assets/resources'
import { TexturedResources } from '../assets/resources'
import { meshColored } from '../mesh/colored'
import { meshTextured } from '../mesh/textured'
import { AIR_APPEARANCE, meshBuffers, type ChunkMeshes, type ChunkSlice, type RenderMode } from '../mesh/types'
import { coloredAppearanceWith } from '../palette/colors'

export interface MeshJob {
  mode: RenderMode
  slice: ChunkSlice
}

export type MeshRequest =
  /** Sets (or clears) the textured assets; sent once per worker before textured jobs. */
  | { type: 'assets'; assets: TexturedAssets | null }
  | { type: 'mesh'; id: number; job: MeshJob }

export type MeshResponse =
  | { type: 'mesh'; id: number; ok: true; meshes: ChunkMeshes }
  | { type: 'mesh'; id: number; ok: false; error: string }

/** Pure body of a mesh worker, kept separate so it is testable in Node. */
export class MeshHandler {
  private resources: TexturedResources | null = null

  handle(request: MeshRequest): { response: MeshResponse; transfer: ArrayBuffer[] } | null {
    if (request.type === 'assets') {
      this.resources = request.assets ? new TexturedResources(request.assets) : null
      return null
    }
    const { id, job } = request
    try {
      const meshes = this.mesh(job)
      return { response: { type: 'mesh', id, ok: true, meshes }, transfer: meshBuffers(meshes) }
    } catch (e) {
      const error = e instanceof Error ? e.stack ?? e.message : String(e)
      return { response: { type: 'mesh', id, ok: false, error }, transfer: [] }
    }
  }

  private mesh(job: MeshJob): ChunkMeshes {
    if (job.mode === 'colored') {
      const r = this.resources
      return meshColored(job.slice, job.slice.states.map((k, i) => (i === 0 ? AIR_APPEARANCE : coloredAppearanceWith(r, k))))
    }
    if (!this.resources) throw new Error('textured mesh requested before assets were loaded')
    return meshTextured(job.slice, this.resources)
  }
}
