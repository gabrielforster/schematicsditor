/// <reference lib="webworker" />
import { handleSaveRequest, type SaveRequest } from './saveProtocol'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<SaveRequest>) => {
  const { response, transfer } = await handleSaveRequest(event.data)
  self.postMessage(response, transfer)
}
