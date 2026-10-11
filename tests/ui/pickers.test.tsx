// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Box } from '../../src/core/edit/scopes'
import type { LayerRange } from '../../src/render'
import { BlockPicker } from '../../src/ui/components/BlockPicker'
import { ScopeEditor } from '../../src/ui/components/ScopeEditor'
import { emptyScopeForm, type ScopeForm } from '../../src/ui/logic/scopeForm'

afterEach(cleanup)

const names = ['minecraft:oak_stairs', 'minecraft:stone', 'minecraft:stone_stairs']

function Picker({ onPick }: { onPick: (v: string) => void }) {
  const [value, setValue] = useState('')
  return <BlockPicker label="Block" names={names} value={value} onChange={setValue} onPick={onPick} />
}

describe('BlockPicker', () => {
  it('suggests matching names as you type and picks one with the keyboard', () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    const input = screen.getByRole('combobox', { name: 'Block' })
    fireEvent.change(input, { target: { value: 'stone' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['minecraft:stone', 'minecraft:stone_stairs'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]!.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('minecraft:stone_stairs')
  })

  it('picks a suggestion with the mouse', () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'oak' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'minecraft:oak_stairs' }))
    expect(onPick).toHaveBeenCalledWith('minecraft:oak_stairs')
  })

  it('picks typed text, properties included, when no suggestion is highlighted', () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'oak_stairs[half=top]' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('oak_stairs[half=top]')
  })
})

function Scopes({ layerRange, selection }: { layerRange: LayerRange | null; selection: Box | null }) {
  const [form, setForm] = useState<ScopeForm>(emptyScopeForm)
  return (
    <>
      <ScopeEditor form={form} onChange={setForm} regionNames={['Main', 'Tower']} selection={selection} layerRange={layerRange} />
      <output data-testid="form">{JSON.stringify(form)}</output>
    </>
  )
}

const formState = () => JSON.parse(screen.getByTestId('form').textContent!) as ScopeForm

describe('ScopeEditor', () => {
  it('picks regions once the region scope is checked', () => {
    render(<Scopes layerRange={null} selection={null} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selected regions' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tower' }))
    expect(formState().regions).toEqual({ on: true, ids: [1] })
  })

  it('reuses the layer range in one click', () => {
    render(<Scopes layerRange={{ minY: 3, maxY: 7 }} selection={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use layer range' }))
    expect(formState().yRange).toEqual({ on: true, minY: '3', maxY: '7' })
    expect((screen.getByLabelText('Scope min Y') as HTMLInputElement).value).toBe('3')
  })

  it('shows the current box selection', () => {
    render(<Scopes layerRange={null} selection={{ min: { x: 0, y: 1, z: 2 }, max: { x: 3, y: 4, z: 5 } }} />)
    expect(screen.getByText('0..3, 1..4, 2..5')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Use layer range' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
