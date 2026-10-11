/// <reference lib="webworker" />
import { handleParseRequest } from './parseProtocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  const { response, transfer } = await handleParseRequest(event.data)
  self.postMessage(response, transfer)
}
