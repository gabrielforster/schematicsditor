import { RoundTripError, saveLitematicAsync } from '../core/litematic/save'
import { deserializeSchematic, type SerializedSchematic } from '../core/litematic/serialize'

export interface SaveRequest {
  schematic: SerializedSchematic
  /** TimeModified to write, in milliseconds since the epoch. */
  now: number
}

export type SaveResponse =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: 'round-trip' | 'internal'; message: string; details: string }

/** Pure body of the save worker: prepare, encode, gzip, re-read and compare (spec §5). */
export async function handleSaveRequest(request: SaveRequest): Promise<{ response: SaveResponse; transfer: ArrayBuffer[] }> {
  try {
    const { bytes } = await saveLitematicAsync(deserializeSchematic(request.schematic), request.now)
    return { response: { ok: true, bytes }, transfer: [bytes.buffer as ArrayBuffer] }
  } catch (e) {
    if (e instanceof RoundTripError) {
      return {
        response: {
          ok: false,
          code: 'round-trip',
          message: 'The saved file would not load back as this schematic, so it was not downloaded.',
          details: e.differences.join('\n'),
        },
        transfer: [],
      }
    }
    const message = e instanceof Error ? e.message : String(e)
    return {
      response: { ok: false, code: 'internal', message: 'Saving failed.', details: e instanceof Error ? e.stack ?? message : message },
      transfer: [],
    }
  }
}
