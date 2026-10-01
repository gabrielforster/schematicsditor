// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { NbtCompound, NbtString } from 'deepslate/nbt'
import { describe, expect, it } from 'vitest'
import type { PickHit } from '../../src/render'
import type { ControllerOptions } from '../../src/ui/app/controller'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { blockKeys, makeSchematic } from '../helpers/model'
import { renderApp } from '../helpers/renderApp'

// x = 0..3 at y = 0: stone, stone, chest (with contents), oak stairs; y = 1: four stone.
const sample = () => {
  const s = makeSchematic([{
    size: [4, 2, 1],
    palette: ['minecraft:stone', 'minecraft:chest[facing=north,type=single,waterlogged=false]', 'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]'],
    blocks: [0, 0, 1, 2, 0, 0, 0, 0],
  }])
  s.regions[0]!.tileEntities.set(2, new NbtCompound().set('id', new NbtString('minecraft:chest')))
  return s
}

async function openedApp(controller: ControllerOptions = {}) {
  const t = renderApp({ services: fakeServices({ parse: parsesTo(sample()) }), controller })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  fireEvent.click(screen.getByRole('tab', { name: 'Replace' }))
  const tab = within(screen.getByRole('tabpanel', { name: 'Replace' }))
  const keys = () => blockKeys(t.controller.state.doc!.schematic.regions[0]!)
  return { ...t, tab, keys, renderer: t.services.renderers[0]! }
}

function pick(tab: ReturnType<typeof within>, label: string, text: string) {
  const input = tab.getByRole('combobox', { name: label })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

const preview = (tab: ReturnType<typeof within>) => tab.getByRole('status', { name: 'Preview' }).textContent

describe('Replace tab', () => {
  it('replaces with property carry-over and reports the count', async () => {
    const { tab, keys, controller } = await openedApp()
    pick(tab, 'Block to replace', 'oak_stairs')
    pick(tab, 'Replacement block', 'spruce_stairs')
    expect(preview(tab)).toBe('1 block match. 1 block will change.')
    fireEvent.click(tab.getByRole('button', { name: 'Replace' }))
    expect(keys()[3]).toBe('minecraft:spruce_stairs[facing=east,half=top,shape=straight,waterlogged=false]')
    expect(controller.state.lastEdit?.message).toBe('Replaced 1 block.')
  })

  it('lets explicit target properties win over carry-over', async () => {
    const { tab, keys } = await openedApp()
    pick(tab, 'Block to replace', 'oak_stairs')
    pick(tab, 'Replacement block', 'spruce_stairs')
    fireEvent.change(tab.getByRole('combobox', { name: 'half' }), { target: { value: 'bottom' } })
    fireEvent.click(tab.getByRole('button', { name: 'Replace' }))
    expect(keys()[3]).toBe('minecraft:spruce_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]')
  })

  it('takes several matchers and removes one', async () => {
    const { tab } = await openedApp()
    pick(tab, 'Block to replace', 'oak_stairs')
    pick(tab, 'Block to replace', 'minecraft:stone')
    pick(tab, 'Replacement block', 'andesite')
    expect(preview(tab)).toBe('7 blocks match. 7 blocks will change.')
    fireEvent.click(tab.getByRole('button', { name: 'Remove minecraft:stone' }))
    expect(preview(tab)).toBe('1 block match. 1 block will change.')
  })

  it('combines a Y range with the box selection', async () => {
    const { tab, controller } = await openedApp()
    act(() => controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } }))
    act(() => controller.setLayerRange({ minY: 1, maxY: 1 }))
    pick(tab, 'Block to replace', 'stone')
    pick(tab, 'Replacement block', 'andesite')
    fireEvent.click(tab.getByRole('button', { name: 'Use layer range' }))
    fireEvent.click(tab.getByRole('checkbox', { name: /Box selection/ }))
    expect(preview(tab)).toBe('2 blocks match. 2 blocks will change.')
  })

  it('warns that replacing a chest drops its contents, and keeps them for a trapped chest', async () => {
    const { tab } = await openedApp()
    pick(tab, 'Block to replace', 'chest')
    pick(tab, 'Replacement block', 'stone')
    expect(preview(tab)).toContain('1 block entity (container contents, sign text, …) will be dropped.')
    pick(tab, 'Replacement block', 'trapped_chest')
    expect(preview(tab)).toContain('1 block entity of the same type will be kept.')
    expect(preview(tab)).not.toContain('dropped')
  })

  it('deletes matching blocks without a target', async () => {
    const { tab, keys } = await openedApp()
    pick(tab, 'Block to replace', 'oak_stairs')
    expect((tab.getByRole('button', { name: 'Replace' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(tab.getByRole('button', { name: 'Delete' }))
    expect(keys()[3]).toBe('minecraft:air')
  })

  it('shows what is wrong with the input', async () => {
    const { tab } = await openedApp()
    pick(tab, 'Block to replace', 'oak_stairs[color=red]')
    expect(tab.getByText('oak_stairs[color=red]: minecraft:oak_stairs has no property "color"')).toBeTruthy()
    fireEvent.click(tab.getByRole('button', { name: 'Remove oak_stairs[color=red]' }))
    pick(tab, 'Block to replace', 'stone')
    pick(tab, 'Replacement block', 'not_a_block')
    expect(tab.getByText('Unknown block: minecraft:not_a_block')).toBeTruthy()
  })

  it('warns before an edit too large to undo', async () => {
    const { tab } = await openedApp({ historyCapBytes: 0 })
    pick(tab, 'Block to replace', 'stone')
    pick(tab, 'Replacement block', 'andesite')
    expect(preview(tab)).toContain('This edit is too large to undo.')
  })

  it('adds the Alt+clicked block state to "from" and switches to this tab', async () => {
    const { tab, renderer, controller } = await openedApp()
    act(() => controller.setTab('materials'))
    const hit: PickHit = { regionId: 0, regionName: 'r', local: { x: 3, y: 0, z: 0 }, world: { x: 3, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, state: 'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]', distance: 1 }
    act(() => renderer.emit('click', { hit, event: { altKey: true } as MouseEvent }))
    expect(screen.getByRole('tab', { name: 'Replace' }).getAttribute('aria-selected')).toBe('true')
    expect(tab.getByText(hit.state)).toBeTruthy()
    pick(tab, 'Replacement block', 'stone')
    expect(preview(tab)).toBe('1 block match. 1 block will change.')
  })

  it('suggests unknown blocks from the file in "from"', async () => {
    const t = renderApp({ services: fakeServices({ parse: parsesTo(makeSchematic([{ size: [1, 1, 1], palette: ['somemod:widget'] }])) }) })
    await act(() => t.controller.openFile(fakeFile('modded.litematic')))
    fireEvent.click(screen.getByRole('tab', { name: 'Replace' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Block to replace' }), { target: { value: 'widget' } })
    expect(screen.getByRole('option', { name: 'somemod:widget' })).toBeTruthy()
  })
})
