// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PickHit } from '../../src/render'
import { idleStatus } from '../helpers/fakeRenderer'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { makeSchematic } from '../helpers/model'
import { renderApp } from '../helpers/renderApp'

const sample = () => makeSchematic([{ size: [3, 1, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 1, 0] }])

async function openedApp() {
  const t = renderApp({ services: fakeServices({ parse: parsesTo(sample()) }) })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  return { ...t, renderer: t.services.renderers[0]! }
}

const hit = (state: string): PickHit => ({
  regionId: 0, regionName: 'Main', local: { x: 1, y: 0, z: 0 }, world: { x: 11, y: 64, z: -3 },
  normal: { x: 0, y: 1, z: 0 }, state, distance: 2,
})

describe('Viewport', () => {
  it('creates one renderer in the viewport, loads the schematic, and disposes it on unmount', async () => {
    const { services, renderer, controller, unmount } = await openedApp()
    expect(services.renderers).toHaveLength(1)
    expect(renderer.loaded?.schematic).toBe(controller.state.doc!.schematic)
    unmount()
    expect(renderer.disposed).toBe(true)
  })

  it('shows block count and meshing progress', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ chunks: { total: 10, queued: 3, parked: 0, meshing: 2, failed: 1 } })))
    expect(screen.getByTestId('stats').textContent).toBe('2 blocks · 5/10 chunks · meshing 5 · 1 failed')
    act(() => renderer.emit('status', idleStatus({ chunks: { total: 10, queued: 0, parked: 0, meshing: 0, failed: 0 } })))
    expect(screen.getByTestId('stats').textContent).toBe('2 blocks · 10/10 chunks')
  })

  it('excludes parked chunks (hidden regions, not yet meshed) from the finished count', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ chunks: { total: 10, queued: 0, parked: 3, meshing: 0, failed: 0 } })))
    expect(screen.getByTestId('stats').textContent).toBe('2 blocks · 7/10 chunks')
  })

  it('shows the hovered block state and coordinates next to the pointer', async () => {
    const { renderer } = await openedApp()
    fireEvent.pointerMove(screen.getByTestId('viewport'), { clientX: 100, clientY: 50 })
    act(() => renderer.emit('hover', hit('minecraft:oak_stairs[facing=north,half=top]')))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('minecraft:oak_stairs[facing=north,half=top]11 64 -3 · Main')
    act(() => renderer.emit('hover', null))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('marks unknown blocks in the tooltip', async () => {
    const { renderer } = await openedApp()
    fireEvent.pointerMove(screen.getByTestId('viewport'), { clientX: 1, clientY: 1 })
    act(() => renderer.emit('hover', hit('somemod:widget')))
    expect(screen.getByRole('tooltip').textContent).toContain('somemod:widget (unknown block)')
  })

  it('fits the view and toggles fly mode', async () => {
    const { renderer } = await openedApp()
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fly' }))
    expect(renderer.calls).toEqual(expect.arrayContaining(['fitToView', 'setFlyMode:true']))
    expect(screen.getByRole('button', { name: 'Fly' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Notices', () => {
  it('offers a texture retry after an asset failure', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ mode: 'colored', assets: { state: 'failed', message: 'Failed to fetch' } })))
    expect(screen.getByRole('alert').textContent).toContain('Block textures could not be loaded (Failed to fetch)')
    fireEvent.click(screen.getByRole('button', { name: 'Retry textures' }))
    expect(renderer.calls).toContain('retryAssets')
  })

  it('suggests colored mode for very large regions and can be dismissed', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ suggestColored: true })))
    fireEvent.click(screen.getByRole('button', { name: 'Use colored mode' }))
    expect(renderer.calls).toContain('setMode:colored')
    act(() => renderer.emit('status', idleStatus({ suggestColored: true })))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/over 5 million blocks/)).toBeNull()
  })

  it('warns about a file newer than every known Minecraft version', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ assets: { state: 'ready', version: '26.3', exact: false, newerThanKnown: true } })))
    expect(screen.getByText(/newer Minecraft version than any known one/)).toBeTruthy()
  })

  it('reports chunks that failed to mesh', async () => {
    const { renderer } = await openedApp()
    act(() => renderer.emit('status', idleStatus({ chunks: { total: 4, queued: 0, parked: 0, meshing: 0, failed: 1 } })))
    expect(screen.getByRole('alert').textContent).toContain('1 chunk could not be drawn and is outlined in red.')
  })
})
