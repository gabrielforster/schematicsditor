// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as materials from '../../src/core/materials'
import { parseMatcher } from '../../src/core/edit/matchers'
import { bundledRegistry } from '../../src/core/registry'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { makeSchematic } from '../helpers/model'
import { renderApp } from '../helpers/renderApp'

// Wraps computeMaterials in a spy (same behavior) so tests can count recomputes.
vi.mock('../../src/core/materials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/materials')>()
  return { ...actual, computeMaterials: vi.fn(actual.computeMaterials) }
})

// Y=0: 3 stone, 1 dirt. Y=1: 1 stone, 1 fire, 1 modded block, 1 air.
const sample = () => makeSchematic([{
  size: [4, 2, 1],
  palette: ['minecraft:air', 'minecraft:stone', 'minecraft:dirt', 'minecraft:fire', 'somemod:widget'],
  blocks: [1, 1, 1, 2, 1, 3, 4, 0],
}])

async function openedApp(services = fakeServices({ parse: parsesTo(sample()) })) {
  const t = renderApp({ services })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  return { ...t, renderer: t.services.renderers[0]!, tab: within(screen.getByRole('tabpanel', { name: 'Materials' })) }
}

/** Cell texts of the main materials table, row by row. */
const cells = () =>
  Array.from(document.querySelectorAll('table.materials')[0]!.querySelectorAll('tbody tr'), (r) => Array.from(r.querySelectorAll('td'), (td) => td.textContent))

describe('Materials tab', () => {
  it('does not recount materials when the schematic is renamed', async () => {
    const { controller } = await openedApp()
    const compute = vi.mocked(materials.computeMaterials)
    const before = compute.mock.calls.length
    expect(before).toBeGreaterThan(0)
    const name = screen.getByLabelText('Name') as HTMLInputElement
    name.focus()
    fireEvent.change(name, { target: { value: 'Renamed' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(controller.state.doc!.schematic.metadata.name).toBe('Renamed')
    expect(name.value).toBe('Renamed')
    expect(compute.mock.calls.length).toBe(before)
  })

  it('lists items by count with stacks and shulker boxes, unknown blocks marked, itemless blocks apart', async () => {
    const { tab } = await openedApp()
    expect(cells()).toEqual([
      ['stone', '4', '1', '1'],
      ['dirt', '1', '1', '1'],
      ['somemod:widgetunknown', '1', '1', '1'],
    ])
    expect(tab.getByRole('heading', { name: 'No item' })).toBeTruthy()
    expect(tab.getByText('fire')).toBeTruthy()
  })

  it('sorts by a column (full item ids) and flips direction on a second click', async () => {
    const { tab } = await openedApp()
    fireEvent.click(tab.getByRole('button', { name: 'Item' }))
    expect(cells().map((r) => r[0])).toEqual(['dirt', 'stone', 'somemod:widgetunknown'])
    expect(tab.getByRole('button', { name: 'Item' }).closest('th')!.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(tab.getByRole('button', { name: 'Item' }))
    expect(cells().map((r) => r[0])).toEqual(['somemod:widgetunknown', 'stone', 'dirt'])
  })

  it('filters rows', async () => {
    const { tab } = await openedApp()
    fireEvent.change(tab.getByLabelText('Filter materials'), { target: { value: 'dir' } })
    expect(cells().map((r) => r[0])).toEqual(['dirt'])
  })

  it('follows the visible-layers and box scopes', async () => {
    const { tab, controller } = await openedApp()
    act(() => controller.setLayerRange({ minY: 1, maxY: 1 }))
    fireEvent.change(tab.getByRole('combobox', { name: 'Scope' }), { target: { value: 'visible' } })
    expect(cells().map((r) => r.slice(0, 2))).toEqual([['stone', '1'], ['somemod:widgetunknown', '1']])
    act(() => controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } }))
    fireEvent.change(tab.getByRole('combobox', { name: 'Scope' }), { target: { value: 'box' } })
    expect(cells()).toEqual([['stone', '2', '1', '1']])
  })

  it('asks for a box when the box scope has no selection', async () => {
    const { tab, controller } = await openedApp()
    act(() => controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }))
    fireEvent.change(tab.getByRole('combobox', { name: 'Scope' }), { target: { value: 'box' } })
    act(() => controller.setSelection(null))
    expect(tab.getByText('Select a box in the left panel to count its materials.')).toBeTruthy()
  })

  it('highlights a row in the 3D view and clears it on a second click', async () => {
    const { tab, renderer } = await openedApp()
    const row = tab.getByText('stone').closest('tr')!
    fireEvent.click(row)
    expect(renderer.highlight).toEqual(['minecraft:stone'])
    expect(row.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(row)
    expect(renderer.highlight).toBeNull()
  })

  it('highlights rows from the keyboard with Enter and Space', async () => {
    const { tab, renderer } = await openedApp()
    const row = tab.getByRole('button', { name: /^stone/ })
    expect(row.tagName).toBe('TR')
    expect(row.tabIndex).toBe(0)
    expect(row.getAttribute('aria-pressed')).toBe('false')
    expect(fireEvent.keyDown(row, { key: 'Enter' })).toBe(false)
    expect(renderer.highlight).toEqual(['minecraft:stone'])
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(fireEvent.keyDown(row, { key: ' ' })).toBe(false)
    expect(renderer.highlight).toBeNull()
    const itemless = tab.getByRole('button', { name: /^fire/ })
    expect(itemless.tabIndex).toBe(0)
    fireEvent.keyDown(itemless, { key: 'Enter' })
    expect(renderer.highlight).toEqual(['minecraft:fire'])
    expect(itemless.getAttribute('aria-pressed')).toBe('true')
  })

  it('exports what is shown as CSV and copies it as text', async () => {
    const { tab, services } = await openedApp()
    fireEvent.change(tab.getByLabelText('Filter materials'), { target: { value: 'stone' } })
    fireEvent.click(tab.getByRole('button', { name: 'Export CSV' }))
    expect(services.downloads[0]).toEqual({
      data: 'Item,Count,Stacks,Shulker boxes,Note\r\nminecraft:stone,4,1,1,\r\n',
      fileName: 'test-materials.csv',
      mimeType: 'text/csv',
    })
    await act(async () => fireEvent.click(tab.getByRole('button', { name: 'Copy as text' })))
    expect(services.copied).toEqual(['4 × minecraft:stone\n'])
    expect(tab.getByText('Copied')).toBeTruthy()
  })

  it('says so when the clipboard is blocked', async () => {
    const { tab } = await openedApp(fakeServices({ parse: parsesTo(sample()), copyText: async () => { throw new Error('denied') } }))
    await act(async () => fireEvent.click(tab.getByRole('button', { name: 'Copy as text' })))
    expect(tab.getByText('Copy failed; the browser blocked the clipboard.')).toBeTruthy()
  })

  it('recounts after an edit', async () => {
    const { controller } = await openedApp()
    act(() => { controller.replace([{ from: [parseMatcher('dirt', bundledRegistry())], to: { name: 'minecraft:stone' } }], []) })
    expect(cells()[0]).toEqual(['stone', '5', '1', '1'])
  })
})
