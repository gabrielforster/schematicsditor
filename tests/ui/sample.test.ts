import { describe, expect, it } from 'vitest'
import { sampleSlot } from '../../src/ui/sample'

describe('sampleSlot', () => {
  it('fetches the sample and returns it as an openable file', async () => {
    const requested: string[] = []
    const slot = sampleSlot('./assets/sample-abc.litematic', async (url) => {
      requested.push(url)
      return new Response(new Uint8Array([1, 2, 3]))
    })
    const file = await slot.load()
    expect(requested).toEqual(['./assets/sample-abc.litematic'])
    expect(file.name).toBe('sample.litematic')
    expect(file.size).toBe(3)
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    expect(slot.label).toBe('Open the sample schematic')
  })

  it('fails with a readable message when the sample is missing', async () => {
    const slot = sampleSlot('x', async () => new Response('nope', { status: 404 }))
    await expect(slot.load()).rejects.toThrow('The sample schematic could not be loaded (HTTP 404).')
  })
})
