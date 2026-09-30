/// <reference lib="webworker" />
import { handleParseRequest } from './parseProtocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  const { response, transfer } = handleParseRequest(event.data)
  self.postMessage(response, transfer)
}
