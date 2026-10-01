import type { SampleSlot } from './components/EmptyState'

export const SAMPLE_FILE_NAME = 'sample.litematic'

/**
 * The empty state's bundled sample (spec §11): fetches the schematic at
 * `url` (a Vite asset URL) and hands it to the controller as a file.
 */
export function sampleSlot(url: string, fetchFn: (url: string) => Promise<Response> = (u) => fetch(u)): SampleSlot {
  return {
    label: 'Open the sample schematic',
    async load() {
      const response = await fetchFn(url)
      if (!response.ok) throw new Error(`The sample schematic could not be loaded (HTTP ${response.status}).`)
      const buffer = await response.arrayBuffer()
      return { name: SAMPLE_FILE_NAME, size: buffer.byteLength, arrayBuffer: async () => buffer }
    },
  }
}
