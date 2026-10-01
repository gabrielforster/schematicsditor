// In-memory Services for UI tests: parse/save are scriptable, downloads and copies are recorded.
import { bundledFamilies } from '../../src/core/families'
import type { Schematic } from '../../src/core/model'
import { bundledRegistry } from '../../src/core/registry'
import type { Services } from '../../src/ui/app/services'
import { FakeRenderer } from './fakeRenderer'

export interface FakeServices extends Services {
  downloads: { data: Uint8Array | string; fileName: string; mimeType: string }[]
  copied: string[]
  renderers: FakeRenderer[]
  parsed: ArrayBuffer[]
}

export function fakeServices(overrides: Partial<Services> = {}): FakeServices {
  const services: FakeServices = {
    registry: bundledRegistry(),
    families: bundledFamilies(),
    downloads: [],
    copied: [],
    renderers: [],
    parsed: [],
    parse: async () => {
      throw new Error('no parse result scripted')
    },
    save: async () => new Uint8Array([1, 2, 3]),
    download: (data, fileName, mimeType) => {
      services.downloads.push({ data, fileName, mimeType })
    },
    copyText: async (text) => {
      services.copied.push(text)
    },
    createRenderer: () => {
      const r = new FakeRenderer()
      services.renderers.push(r)
      return r
    },
    ...overrides,
  }
  return services
}

/** A File-like object for `AppController.openFile`. */
export function fakeFile(name: string, size = 100): { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } {
  return { name, size, arrayBuffer: async () => new ArrayBuffer(size) }
}

/** A parse function that always returns this schematic. */
export const parsesTo = (schematic: Schematic) => async () => schematic
