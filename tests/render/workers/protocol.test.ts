import { describe, expect, it } from 'vitest'
import { MeshHandler } from '../../../src/render/workers/protocol'
import { testAssets } from '../../helpers/assets'
import { makeSlice } from '../../helpers/slice'

const stone = () => makeSlice([1, 1, 1], () => 'minecraft:stone')

describe('MeshHandler', () => {
  it('meshes colored jobs and lists every buffer for transfer', () => {
    const r = new MeshHandler().handle({ type: 'mesh', id: 7, job: { mode: 'colored', slice: stone() } })!
    expect(r.response).toMatchObject({ type: 'mesh', id: 7, ok: true })
    if (!r.response.ok) throw new Error('expected ok')
    expect(r.response.meshes.opaque!.indices.length).toBe(36)
    expect(r.transfer).toHaveLength(3) // positions, colors, indices; no uvs in colored mode
  })

  it('fails textured jobs until assets arrive, then meshes them', () => {
    const h = new MeshHandler()
    const before = h.handle({ type: 'mesh', id: 1, job: { mode: 'textured', slice: stone() } })!
    expect(before.response).toMatchObject({ ok: false })
    expect(h.handle({ type: 'assets', assets: testAssets() })).toBeNull()
    const after = h.handle({ type: 'mesh', id: 2, job: { mode: 'textured', slice: stone() } })!
    expect(after.response).toMatchObject({ ok: true })
    expect(after.transfer).toHaveLength(4)
  })

  it('colors blocks renamed since the bundled version from the loaded version assets', () => {
    const grass = () => makeSlice([1, 1, 1], () => 'minecraft:grass')
    const h = new MeshHandler()
    const color = (r: ReturnType<MeshHandler['handle']>) => (r!.response.ok ? Array.from(r!.response.meshes.opaque!.colors.slice(0, 3)) : [])
    expect(color(h.handle({ type: 'mesh', id: 1, job: { mode: 'colored', slice: grass() } }))).toEqual([255, 0, 255])
    h.handle({ type: 'assets', assets: testAssets() })
    expect(color(h.handle({ type: 'mesh', id: 2, job: { mode: 'colored', slice: grass() } }))).toEqual([128, 128, 128])
  })

  it('reports a job that throws instead of crashing', () => {
    const slice = stone()
    slice.states.length = 1 // cells point at a missing local id
    const r = new MeshHandler().handle({ type: 'mesh', id: 3, job: { mode: 'colored', slice } })!
    expect(r.response).toMatchObject({ type: 'mesh', id: 3, ok: false })
  })
})
