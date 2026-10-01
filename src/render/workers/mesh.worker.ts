/// <reference lib="webworker" />
import { MeshHandler, type MeshRequest } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const handler = new MeshHandler()

self.onmessage = (event: MessageEvent<MeshRequest>) => {
  const result = handler.handle(event.data)
  if (result) self.postMessage(result.response, result.transfer)
}
