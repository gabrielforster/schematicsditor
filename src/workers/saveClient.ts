import { serializeSchematic } from '../core/litematic/serialize'
import type { Schematic } from '../core/model'
import { jobTimeout, runOneShot, WorkerFailure, type OneShotWorker } from './oneShot'
import type { SaveRequest, SaveResponse } from './saveProtocol'

export type SaveFailureCode = 'round-trip' | 'internal' | 'timeout'

export class SaveFailure extends Error {
  constructor(readonly code: SaveFailureCode, message: string, readonly details: string) {
    super(message)
    this.name = 'SaveFailure'
  }
}

export interface SaveOptions {
  now?: number
  createWorker?: () => OneShotWorker<SaveRequest, SaveResponse>
  /** Defaults to `jobTimeout(millions of blocks)`. */
  timeoutMs?: number
}

const defaultWorker = () =>
  new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' }) as unknown as OneShotWorker<SaveRequest, SaveResponse>

/**
 * Save in a worker (Plan 1 carry-over: a 50M-block save blocked the main
 * thread for ~11 s). The schematic is copied, never transferred: its block
 * arrays stay live in the editor.
 */
export async function saveLitematicInWorker(schematic: Schematic, options: SaveOptions = {}): Promise<Uint8Array> {
  const { data } = serializeSchematic(schematic)
  const blocks = schematic.regions.reduce((n, r) => n + r.blocks.length, 0)
  const timeoutMs = options.timeoutMs ?? jobTimeout(blocks / 1e6)
  let response: SaveResponse
  try {
    response = await runOneShot(options.createWorker ?? defaultWorker, { schematic: data, now: options.now ?? Date.now() }, [], timeoutMs)
  } catch (e) {
    if (e instanceof WorkerFailure && e.kind === 'timeout') {
      throw new SaveFailure('timeout', 'Saving took too long. The browser may have run out of memory; try closing other tabs.', e.details)
    }
    throw new SaveFailure('internal', 'Saving failed.', e instanceof WorkerFailure ? e.details : String(e))
  }
  if (!response.ok) throw new SaveFailure(response.code, response.message, response.details)
  return response.bytes
}
