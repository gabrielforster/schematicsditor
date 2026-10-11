import { LitematicError, type LitematicErrorCode } from '../core/litematic/errors'
import { readLitematic } from '../core/litematic/read'
import { serializeSchematic, type SerializedSchematic } from '../core/litematic/serialize'

export type ParseResponse =
  | { ok: true; schematic: SerializedSchematic }
  | { ok: false; code: LitematicErrorCode | 'internal'; message: string; details: string }

/** Pure body of the parse worker, kept separate so it is testable in Node. */
export function handleParseRequest(buffer: ArrayBuffer): { response: ParseResponse; transfer: ArrayBuffer[] } {
  try {
    const { data, transfer } = serializeSchematic(readLitematic(new Uint8Array(buffer)))
    return { response: { ok: true, schematic: data }, transfer }
  } catch (e) {
    const code = e instanceof LitematicError ? e.code : 'internal'
    const message = e instanceof Error ? e.message : String(e)
    const cause = e instanceof Error && e.cause instanceof Error ? `\nCaused by: ${e.cause.stack ?? e.cause.message}` : ''
    const details = (e instanceof Error ? e.stack ?? message : message) + cause
    return { response: { ok: false, code, message, details }, transfer: [] }
  }
}
