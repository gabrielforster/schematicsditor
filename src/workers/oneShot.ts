/** The part of `Worker` a one-shot job uses; tests pass fakes. */
export interface OneShotWorker<Req, Res> {
  postMessage(message: Req, transfer: Transferable[]): void
  terminate(): void
  onmessage: ((event: { data: Res }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
  onmessageerror: ((event: unknown) => void) | null
}

export type WorkerFailureKind = 'crashed' | 'messageerror' | 'timeout'

/** The worker itself failed: it threw, could not post its result, or never answered. */
export class WorkerFailure extends Error {
  constructor(readonly kind: WorkerFailureKind, readonly details: string) {
    super(`worker ${kind}: ${details}`)
    this.name = 'WorkerFailure'
  }
}

/**
 * Posts one message to a fresh worker and resolves with its first reply,
 * terminating the worker either way. A worker killed for running out of
 * memory may never fire `error`, so a timeout turns silence into a
 * `WorkerFailure('timeout')` instead of a promise that never settles.
 */
export function runOneShot<Req, Res>(
  create: () => OneShotWorker<Req, Res>,
  message: Req,
  transfer: Transferable[],
  timeoutMs: number,
): Promise<Res> {
  const worker = create()
  return new Promise<Res>((resolve, reject) => {
    const finish = (fn: () => void) => {
      clearTimeout(timer)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new WorkerFailure('timeout', `no reply after ${Math.round(timeoutMs / 1000)} s`))), timeoutMs)
    worker.onmessage = (event) => finish(() => resolve(event.data))
    worker.onerror = (event) => finish(() => reject(new WorkerFailure('crashed', event.message ?? 'unknown error')))
    worker.onmessageerror = () => finish(() => reject(new WorkerFailure('messageerror', 'the result could not be received')))
    worker.postMessage(message, transfer)
  })
}

/**
 * How long a file job may take before it counts as dead: one minute plus
 * ten seconds per unit of work (a MiB of file to parse, a million blocks
 * to save), at most ten minutes.
 */
export function jobTimeout(units: number): number {
  return Math.min(600_000, 60_000 + Math.ceil(units) * 10_000)
}
