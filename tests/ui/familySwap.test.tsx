// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { blockKeys, makeSchematic } from '../helpers/model'
import { renderApp } from '../helpers/renderApp'

const sample = () => makeSchematic([{
  size: [4, 1, 1],
  palette: ['minecraft:stone', 'minecraft:stone_stairs[facing=west,half=bottom,shape=straight,waterlogged=false]', 'minecraft:stone_button[face=floor,facing=north,powered=false]'],
  blocks: [0, 0, 1, 2],
}])

async function openedApp() {
  const t = renderApp({ services: fakeServices({ parse: parsesTo(sample()) }) })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  fireEvent.click(screen.getByRole('tab', { name: 'Family swap' }))
  const tab = within(screen.getByRole('tabpanel', { name: 'Family swap' }))
  return { ...t, tab, keys: () => blockKeys(t.controller.state.doc!.schematic.regions[0]!) }
}

describe('Family swap tab', () => {
  it('previews the swap with the shapes the target family lacks, then applies it as one edit', async () => {
    const { tab, keys, controller } = await openedApp()
    fireEvent.change(tab.getByRole('combobox', { name: 'From family' }), { target: { value: 'stone' } })
    fireEvent.change(tab.getByRole('combobox', { name: 'To family' }), { target: { value: 'cobblestone' } })
    const preview = tab.getByRole('status', { name: 'Preview' })
    expect(preview.textContent).toContain('3 blocks will change.')
    expect(within(preview).getByRole('row').textContent).toBe('buttonstone_button1')
    fireEvent.click(tab.getByRole('button', { name: 'Swap' }))
    expect(keys()).toEqual([
      'minecraft:cobblestone', 'minecraft:cobblestone',
      'minecraft:cobblestone_stairs[facing=west,half=bottom,shape=straight,waterlogged=false]',
      'minecraft:stone_button[face=floor,facing=north,powered=false]',
    ])
    expect(controller.state.lastEdit?.message).toBe('Swapped 3 blocks from Stone to Cobblestone.')
    controller.undo()
    expect(keys()[0]).toBe('minecraft:stone')
  })

  it('honours the scope', async () => {
    const { tab, controller } = await openedApp()
    act(() => controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }))
    fireEvent.change(tab.getByRole('combobox', { name: 'From family' }), { target: { value: 'stone' } })
    fireEvent.change(tab.getByRole('combobox', { name: 'To family' }), { target: { value: 'cobblestone' } })
    fireEvent.click(tab.getByRole('checkbox', { name: /Box selection/ }))
    expect(tab.getByRole('status', { name: 'Preview' }).textContent).toContain('1 block will change.')
  })

  it('refuses a family swapped for itself', async () => {
    const { tab } = await openedApp()
    fireEvent.change(tab.getByRole('combobox', { name: 'From family' }), { target: { value: 'oak' } })
    fireEvent.change(tab.getByRole('combobox', { name: 'To family' }), { target: { value: 'oak' } })
    expect(tab.getByText('Pick two different families.')).toBeTruthy()
    expect((tab.getByRole('button', { name: 'Swap' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
