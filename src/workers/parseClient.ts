import { deserializeSchematic } from '../core/litematic/serialize'
import type { Schematic } from '../core/model'
import { jobTimeout, runOneShot, WorkerFailure, type OneShotWorker } from './oneShot'
import type { ParseResponse } from './parseProtocol'

type Failure = Extract<ParseResponse, { ok: false }>
export type ParseFailureCode = Failure['code'] | 'timeout'

export class ParseFailure extends Error {
  readonly code: ParseFailureCode
  readonly details: string

  constructor({ code, message, details }: { code: ParseFailureCode; message: string; details: string }) {
    super(message)
    this.name = 'ParseFailure'
    this.code = code
    this.details = details
  }
}

export interface ParseOptions {
  createWorker?: () => OneShotWorker<ArrayBuffer, ParseResponse>
  /** Defaults to `jobTimeout(MiB of file)`. */
  timeoutMs?: number
}

const defaultWorker = () =>
  new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' }) as unknown as OneShotWorker<ArrayBuffer, ParseResponse>

/** Parse a .litematic off the main thread. The buffer is transferred (detached). */
export async function parseLitematicInWorker(buffer: ArrayBuffer, options: ParseOptions = {}): Promise<Schematic> {
  const timeoutMs = options.timeoutMs ?? jobTimeout(buffer.byteLength / 2 ** 20)
  let response: ParseResponse
  try {
    response = await runOneShot(options.createWorker ?? defaultWorker, buffer, [buffer], timeoutMs)
  } catch (e) {
    throw toParseFailure(e)
  }
  if (!response.ok) throw new ParseFailure(response)
  return deserializeSchematic(response.schematic)
}

function toParseFailure(e: unknown): ParseFailure {
  if (!(e instanceof WorkerFailure)) {
    return new ParseFailure({ code: 'internal', message: 'The file reader failed.', details: String(e) })
  }
  switch (e.kind) {
    case 'timeout':
      return new ParseFailure({
        code: 'timeout',
        message: 'Reading the file took too long. The browser may have run out of memory; try closing other tabs.',
        details: e.details,
      })
    case 'messageerror':
      return new ParseFailure({ code: 'internal', message: 'The file reader could not send the result back.', details: e.details })
    case 'crashed':
      return new ParseFailure({ code: 'internal', message: 'The file reader crashed.', details: e.details })
  }
}
