import type { FamilyGroup } from '../../core/families'
import type { Schematic } from '../../core/model'
import type { BlockRegistry } from '../../core/registry'
import type { SchematicRenderer } from '../../render'

/** The renderer surface the UI drives; `SchematicRenderer` satisfies it, tests pass a fake. */
export type RendererLike = Pick<SchematicRenderer,
  | 'load' | 'unload' | 'setMode' | 'retryAssets' | 'setRegionVisible' | 'setLayerRange' | 'layerRange'
  | 'stepLayer' | 'setHighlight' | 'startBoxSelection' | 'cancelBoxSelection' | 'setSelection' | 'selection'
  | 'selecting' | 'fitToView' | 'setFlyMode' | 'flyMode' | 'status' | 'on' | 'dispose'>

/** Everything the UI needs from the outside world, injected so tests can fake it. */
export interface Services {
  registry: BlockRegistry
  families: readonly FamilyGroup[]
  /** Parse .litematic bytes (the buffer may be transferred). Rejects with ParseFailure. */
  parse(buffer: ArrayBuffer): Promise<Schematic>
  /** Encode with the round-trip guard. Rejects with SaveFailure. */
  save(schematic: Schematic): Promise<Uint8Array>
  /** Offer bytes or text to the user as a downloaded file. */
  download(data: Uint8Array | string, fileName: string, mimeType: string): void
  copyText(text: string): Promise<void>
  createRenderer(container: HTMLElement): RendererLike
}
