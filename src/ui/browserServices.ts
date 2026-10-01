import { bundledFamilies } from '../core/families'
import { bundledRegistry } from '../core/registry'
import { SchematicRenderer } from '../render'
import { parseLitematicInWorker } from '../workers/parseClient'
import { saveLitematicInWorker } from '../workers/saveClient'
import type { Services } from './app/services'

/** The real Services: workers, Blob downloads, the clipboard and the Three.js renderer. */
export function browserServices(): Services {
  return {
    registry: bundledRegistry(),
    families: bundledFamilies(),
    parse: (buffer) => parseLitematicInWorker(buffer),
    save: (schematic) => saveLitematicInWorker(schematic),
    download(data, fileName, mimeType) {
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }))
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
      document.body.append(a)
      a.click()
      a.remove()
      // Revoke later: some browsers start the download after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    },
    copyText: (text) => navigator.clipboard.writeText(text),
    createRenderer: (container) => new SchematicRenderer(container),
  }
}
