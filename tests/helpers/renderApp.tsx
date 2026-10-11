// Renders the whole React app over fake services for jsdom component tests.
import { cleanup, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import { AppController, type ControllerOptions } from '../../src/ui/app/controller'
import { App } from '../../src/ui/App'
import type { SampleSlot } from '../../src/ui/components/EmptyState'
import { fakeServices, type FakeServices } from './fakeServices'

afterEach(cleanup)

export function renderApp(options: { services?: FakeServices; controller?: ControllerOptions; sample?: SampleSlot } = {}) {
  const services = options.services ?? fakeServices()
  const controller = new AppController(services, options.controller)
  const utils = render(<App controller={controller} {...(options.sample ? { sample: options.sample } : {})} />)
  return { ...utils, controller, services }
}

/** A real File (jsdom) with some bytes. */
export function litematicFile(name = 'castle.litematic', size = 16): File {
  return new File([new Uint8Array(size)], name)
}
