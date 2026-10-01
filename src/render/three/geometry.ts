import { BufferAttribute, BufferGeometry, DataTexture, LinearSRGBColorSpace, NearestFilter, RGBAFormat, Sphere, Vector3 } from 'three'
import { CHUNK_SIZE } from '../../core/edit/events'
import type { AtlasImage } from '../assets/atlas'
import type { MeshData } from '../mesh/types'

/** A Three.js geometry over a worker's buffers (no copies). */
export function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(data.positions, 3))
  g.setAttribute('color', new BufferAttribute(data.colors, 4, true))
  if (data.uvs) g.setAttribute('uv', new BufferAttribute(data.uvs, 2))
  g.setIndex(new BufferAttribute(data.indices, 1))
  // Every chunk fits in a 16³ box (models may poke out a little); skip the per-vertex scan.
  g.boundingSphere = new Sphere(new Vector3(CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2), CHUNK_SIZE)
  return g
}

/** The block atlas as a GPU texture: no filtering or mipmaps (pixel art), v from the top. */
export function atlasTexture(atlas: AtlasImage): DataTexture {
  const t = new DataTexture(new Uint8Array(atlas.data), atlas.width, atlas.height, RGBAFormat)
  t.magFilter = NearestFilter
  t.minFilter = NearestFilter
  t.generateMipmaps = false
  t.flipY = false
  t.colorSpace = LinearSRGBColorSpace
  t.needsUpdate = true
  return t
}
