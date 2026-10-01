import { Box3Helper, DataTexture, Mesh, type Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { ChunkMeshes, MeshData } from '../../../src/render/mesh/types'
import { ThreeChunkView } from '../../../src/render/three/chunkView'
import { atlasTexture, toGeometry } from '../../../src/render/three/geometry'
import { ChunkMaterials, RENDER_ORDER } from '../../../src/render/three/materials'
import { makeSchematic } from '../../helpers/model'

const quad = (uvs: boolean): MeshData => ({
  positions: new Float32Array([0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0]),
  colors: new Uint8Array(16).fill(255),
  uvs: uvs ? new Float32Array(8) : null,
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
})

const meshesOf = (o: Object3D) => o.children.filter((c): c is Mesh => c instanceof Mesh)

function setup() {
  const materials = new ChunkMaterials()
  const view = new ThreeChunkView(materials)
  const schematic = makeSchematic([{ position: [100, 64, -5], size: [40, 20, 20], palette: ['minecraft:air'] }])
  view.setSchematic(schematic)
  const region = view.root.children[0]!
  return { materials, view, region }
}

describe('toGeometry', () => {
  it('wraps the worker buffers without copying', () => {
    const data = quad(true)
    const g = toGeometry(data)
    expect(g.getAttribute('position').array).toBe(data.positions)
    expect(g.getAttribute('color').itemSize).toBe(4)
    expect(g.getAttribute('color').normalized).toBe(true)
    expect(g.getAttribute('uv').array).toBe(data.uvs)
    expect(g.getIndex()!.array).toBe(data.indices)
    expect(g.boundingSphere).not.toBeNull()
  })

  it('leaves out UVs for colored meshes', () => {
    expect(toGeometry(quad(false)).getAttribute('uv')).toBeUndefined()
  })
})

describe('atlasTexture', () => {
  it('uses nearest filtering and keeps v measured from the top', () => {
    const t = atlasTexture({ width: 2, height: 2, data: new Uint8Array(16) })
    expect(t).toBeInstanceOf(DataTexture)
    expect(t.flipY).toBe(false)
    expect(t.generateMipmaps).toBe(false)
  })
})

describe('ThreeChunkView', () => {
  it('places region groups at the region offset and chunks at their origin', () => {
    const { view, region } = setup()
    expect(region.position.toArray()).toEqual([100, 64, -5])
    view.set('k', 0, { cx: 2, cy: 1, cz: 0 }, 'main', { opaque: quad(false), transparent: null, faded: null })
    expect(region.children[0]!.position.toArray()).toEqual([32, 16, 0])
  })

  it('draws buckets with their materials and render order', () => {
    const { view, region, materials } = setup()
    const m: ChunkMeshes = { opaque: quad(true), transparent: quad(true), faded: quad(false) }
    view.set('k', 0, { cx: 0, cy: 0, cz: 0 }, 'main', m)
    const [opaque, transparent, faded] = meshesOf(region.children[0]!)
    expect(opaque!.material).toBe(materials.get('opaque', true))
    expect(transparent!.renderOrder).toBe(RENDER_ORDER.transparent)
    expect(faded!.material).toBe(materials.get('faded', false))
  })

  it('draws every bucket of a ghost chunk with the ghost material', () => {
    const { view, region, materials } = setup()
    view.set('g', 0, { cx: 0, cy: 0, cz: 0 }, 'ghost', { opaque: quad(false), transparent: quad(false), faded: null })
    expect(meshesOf(region.children[0]!).map((m) => m.material)).toEqual([materials.get('ghost', false), materials.get('ghost', false)])
  })

  it('uses textured materials only once an atlas is set', () => {
    const materials = new ChunkMaterials()
    expect(materials.get('opaque', true)).toBe(materials.get('opaque', false))
    materials.setAtlas(atlasTexture({ width: 1, height: 1, data: new Uint8Array(4) }))
    expect(materials.get('opaque', true)).not.toBe(materials.get('opaque', false))
    expect(materials.get('opaque', true).map).not.toBeNull()
  })

  it('replaces a chunk, disposing the old geometry', () => {
    const { view, region } = setup()
    view.set('k', 0, { cx: 0, cy: 0, cz: 0 }, 'main', { opaque: quad(false), transparent: null, faded: null })
    const old = meshesOf(region.children[0]!)[0]!
    let disposed = false
    old.geometry.addEventListener('dispose', () => { disposed = true })
    view.set('k', 0, { cx: 0, cy: 0, cz: 0 }, 'main', { opaque: quad(false), transparent: null, faded: null })
    expect(region.children).toHaveLength(1)
    expect(disposed).toBe(true)
  })

  it('outlines a failed chunk in red, sized to the chunk', () => {
    const { view, region } = setup()
    view.fail('k', 0, { cx: 2, cy: 1, cz: 0 })
    const helper = region.children[0] as Box3Helper
    expect(helper).toBeInstanceOf(Box3Helper)
    expect(helper.box.min.toArray()).toEqual([32, 16, 0])
    expect(helper.box.max.toArray()).toEqual([40, 20, 16]) // the region is 40 × 20 × 20
    view.delete('k')
    expect(region.children).toHaveLength(0)
  })

  it('hides regions and clears everything', () => {
    const { view, region } = setup()
    view.set('k', 0, { cx: 0, cy: 0, cz: 0 }, 'main', { opaque: quad(false), transparent: null, faded: null })
    view.setRegionVisible(0, false)
    expect(region.visible).toBe(false)
    view.clear()
    expect(region.children).toHaveLength(0)
  })
})

describe('ChunkMaterials', () => {
  const texture = () => atlasTexture({ width: 1, height: 1, data: new Uint8Array(4) })

  it('disposes the old atlas texture when a new one is set', () => {
    const materials = new ChunkMaterials()
    const old = texture()
    const dispose = vi.spyOn(old, 'dispose')
    materials.setAtlas(old)
    materials.setAtlas(old)
    expect(dispose).not.toHaveBeenCalled()
    materials.setAtlas(texture())
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('disposes the atlas texture on dispose', () => {
    const materials = new ChunkMaterials()
    const atlas = texture()
    const dispose = vi.spyOn(atlas, 'dispose')
    materials.setAtlas(atlas)
    materials.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
