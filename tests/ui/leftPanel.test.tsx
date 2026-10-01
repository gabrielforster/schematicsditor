// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { boxFromDraft } from '../../src/ui/components/LeftPanel'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { makeSchematic } from '../helpers/model'
import { renderApp } from '../helpers/renderApp'

// Region "Main" spans Y 0..9 (the fake renderer clamps layer ranges to that), region "Tower" is one block.
const sample = () => makeSchematic([
  { name: 'Main', size: [2, 10, 1], palette: ['minecraft:air', 'minecraft:stone'], blocks: [1, 1, 1, 0, ...new Array(16).fill(0)] },
  { name: 'Tower', position: [5, 0, 0], size: [1, 1, 1], palette: ['minecraft:dirt'] },
])

async function openedApp() {
  const t = renderApp({ services: fakeServices({ parse: parsesTo(sample()) }) })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  return { ...t, renderer: t.services.renderers[0]!, panel: within(screen.getByRole('complementary', { name: 'Schematic' })) }
}

describe('Regions', () => {
  it('lists every region with its size and non-air block count', async () => {
    const { panel } = await openedApp()
    expect(panel.getByText('Main').closest('label')!.textContent).toBe('Main2×10×13 blocks')
    expect(panel.getByText('Tower').closest('label')!.textContent).toBe('Tower1×1×11 blocks')
  })

  it('shows and hides a region', async () => {
    const { panel, renderer, controller } = await openedApp()
    const box = within(panel.getByText('Tower').closest('label')!).getByRole('checkbox') as HTMLInputElement
    fireEvent.click(box)
    expect(box.checked).toBe(false)
    expect(renderer.hidden.has(1)).toBe(true)
    expect(controller.state.hiddenRegions).toEqual([1])
  })
})

describe('Selection', () => {
  it('picks two corners in the view and fills in the coordinates', async () => {
    const { panel, renderer } = await openedApp()
    fireEvent.click(panel.getByRole('button', { name: 'Pick corners' }))
    expect(renderer.calls).toContain('startBoxSelection')
    expect(panel.getByRole('button', { name: 'Cancel picking' })).toBeTruthy()
    act(() => {
      renderer.selecting = false
      renderer.emit('selection', { min: { x: 0, y: 1, z: 0 }, max: { x: 1, y: 4, z: 0 } })
    })
    expect((panel.getByLabelText('max y') as HTMLInputElement).value).toBe('4')
    expect(panel.getByText('2×4×1 = 8 blocks')).toBeTruthy()
    expect(panel.getByRole('button', { name: 'Pick corners' })).toBeTruthy()
  })

  it('applies typed coordinates, normalized by the renderer', async () => {
    const { panel, controller } = await openedApp()
    const set = (label: string, value: string) => fireEvent.change(panel.getByLabelText(label), { target: { value } })
    set('min x', '3'); set('min y', '0'); set('min z', '0')
    set('max x', '1'); set('max y', '2'); set('max z', '0')
    fireEvent.click(panel.getByRole('button', { name: 'Apply' }))
    expect(controller.state.selection).toEqual({ min: { x: 1, y: 0, z: 0 }, max: { x: 3, y: 2, z: 0 } })
  })

  it('cannot apply until every coordinate is a whole number', async () => {
    const { panel } = await openedApp()
    expect((panel.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('clears the selection', async () => {
    const { panel, controller } = await openedApp()
    act(() => controller.setSelection({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } }))
    fireEvent.click(panel.getByRole('button', { name: 'Clear' }))
    expect(controller.state.selection).toBeNull()
    expect((panel.getByLabelText('min x') as HTMLInputElement).value).toBe('')
  })
})

describe('boxFromDraft', () => {
  const draft = (v: string) => ({ min: { x: '0', y: '0', z: v }, max: { x: '1', y: '1', z: '1' } })
  it('accepts whole numbers, including negative ones', () => {
    expect(boxFromDraft(draft('-4'))).toEqual({ min: { x: 0, y: 0, z: -4 }, max: { x: 1, y: 1, z: 1 } })
  })
  it('rejects blanks and fractions', () => {
    expect(boxFromDraft(draft(''))).toBeNull()
    expect(boxFromDraft(draft('1.5'))).toBeNull()
  })
})

describe('Layers', () => {
  it('bounds the sliders by the schematic Y range and sets the range', async () => {
    const { panel, controller } = await openedApp()
    const from = panel.getByLabelText('From Y') as HTMLInputElement
    expect([from.min, from.max, from.value]).toEqual(['0', '9', '0'])
    fireEvent.change(from, { target: { value: '3' } })
    expect(controller.state.layerRange).toEqual({ minY: 3, maxY: 9 })
    fireEvent.change(panel.getByLabelText('To Y'), { target: { value: '5' } })
    expect(controller.state.layerRange).toEqual({ minY: 3, maxY: 5 })
  })

  it('switches to a single layer and steps it with the arrow buttons', async () => {
    const { panel, controller } = await openedApp()
    fireEvent.click(panel.getByRole('checkbox', { name: 'Single layer' }))
    expect(controller.state.layerRange).toEqual({ minY: 9, maxY: 9 })
    expect(panel.getByLabelText('Layer Y')).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: 'Layer down' }))
    expect(controller.state.layerRange).toEqual({ minY: 8, maxY: 8 })
    fireEvent.click(panel.getByRole('button', { name: 'All layers' }))
    expect(controller.state.layerRange).toBeNull()
  })

  it('still steps layers with ↑/↓ while a checkbox has focus', async () => {
    const { panel, controller } = await openedApp()
    const single = panel.getByRole('checkbox', { name: 'Single layer' })
    fireEvent.click(single)
    fireEvent.keyDown(single, { key: 'ArrowDown' })
    expect(controller.state.layerRange).toEqual({ minY: 8, maxY: 8 })
  })
})
