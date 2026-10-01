// A scriptable stand-in for a one-shot Worker (src/workers/oneShot.ts).
import type { OneShotWorker } from '../../src/workers/oneShot'

export class FakeWorker<Req, Res> implements OneShotWorker<Req, Res> {
  onmessage: ((event: { data: Res }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  readonly posted: { message: Req; transfer: Transferable[] }[] = []
  terminated = false

  /** `reply` runs on every postMessage; return a response to answer, or undefined to stay silent. */
  constructor(private readonly reply: (message: Req) => Promise<Res | undefined> | Res | undefined = () => undefined) {}

  postMessage(message: Req, transfer: Transferable[]): void {
    this.posted.push({ message, transfer })
    void Promise.resolve(this.reply(message)).then((data) => {
      if (data !== undefined && !this.terminated) this.onmessage?.({ data })
    })
  }

  terminate(): void {
    this.terminated = true
  }
}
