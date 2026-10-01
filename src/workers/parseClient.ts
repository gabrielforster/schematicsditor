import { deserializeSchematic } from '../core/litematic/serialize'
import type { Schematic } from '../core/model'
import type { ParseResponse } from './parseProtocol'

type Failure = Extract<ParseResponse, { ok: false }>

export class ParseFailure extends Error {
  readonly code: Failure['code']
  readonly details: string

  constructor({ code, message, details }: Omit<Failure, 'ok'>) {
    super(message)
    this.name = 'ParseFailure'
    this.code = code
    this.details = details
  }
}

/** Parse a .litematic off the main thread. The buffer is transferred (detached). */
export function parseLitematicInWorker(buffer: ArrayBuffer): Promise<Schematic> {
  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<Schematic>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      worker.terminate()
      const r = event.data
      if (r.ok) resolve(deserializeSchematic(r.schematic))
      else reject(new ParseFailure(r))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new ParseFailure({ code: 'internal', message: 'The file reader crashed.', details: event.message }))
    }
    worker.onmessageerror = () => {
      worker.terminate()
      reject(new ParseFailure({
        code: 'internal',
        message: 'The file reader could not send the result back.',
        details: 'messageerror',
      }))
    }
    worker.postMessage(buffer, [buffer])
  })
}
