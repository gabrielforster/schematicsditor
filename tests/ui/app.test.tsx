// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseMatcher } from '../../src/core/edit/matchers'
import { bundledRegistry } from '../../src/core/registry'
import { ParseFailure } from '../../src/workers/parseClient'
import { FakeRenderer } from '../helpers/fakeRenderer'
import { fakeFile, fakeServices, parsesTo } from '../helpers/fakeServices'
import { makeSchematic } from '../helpers/model'
import { litematicFile, renderApp } from '../helpers/renderApp'
import { isEditingTarget } from '../../src/ui/useShortcuts'

const sample = () => makeSchematic([{ size: [2, 1, 1], palette: ['minecraft:stone', 'minecraft:dirt'], blocks: [0, 1] }])
const withSchematic = () => fakeServices({ parse: parsesTo(sample()) })

async function openedApp(options: Parameters<typeof renderApp>[0] = {}) {
  const t = renderApp({ services: withSchematic(), ...options })
  await act(() => t.controller.openFile(fakeFile('castle.litematic')))
  return t
}

describe('App shell', () => {
  it('shows the empty state until a schematic is open', async () => {
    const { controller } = renderApp({ services: withSchematic() })
    expect(screen.getByRole('heading', { name: 'Litematica schematic editor' })).toBeTruthy()
    await act(() => controller.openFile(fakeFile('castle.litematic')))
    expect(screen.queryByRole('heading', { name: 'Litematica schematic editor' })).toBeNull()
  })

  it('offers the sample schematic when one is provided', async () => {
    const { controller } = renderApp({
      services: withSchematic(),
      sample: { label: 'Open the sample', load: async () => fakeFile('sample.litematic') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open the sample' }))
    await waitFor(() => expect(controller.state.doc?.fileName).toBe('sample.litematic'))
  })

  it('opens the file picked with Open', async () => {
    const { controller } = renderApp({ services: withSchematic() })
    const input = screen.getByLabelText('Open .litematic file')
    fireEvent.change(input, { target: { files: [litematicFile('tower.litematic')] } })
    await waitFor(() => expect(controller.state.doc?.fileName).toBe('tower.litematic'))
  })

  it('opens a file dropped anywhere and shows the drop overlay while dragging', async () => {
    const { controller, container } = renderApp({ services: withSchematic() })
    const app = container.querySelector('.app')!
    const dataTransfer = { types: ['Files'], files: [litematicFile('dropped.litematic')], dropEffect: 'none' }
    fireEvent.dragEnter(app, { dataTransfer })
    expect(screen.getByText('Drop to open')).toBeTruthy()
    fireEvent.drop(app, { dataTransfer })
    expect(screen.queryByText('Drop to open')).toBeNull()
    await waitFor(() => expect(controller.state.doc?.fileName).toBe('dropped.litematic'))
  })

  it('ignores drags that carry no files', () => {
    const { container } = renderApp()
    fireEvent.dragEnter(container.querySelector('.app')!, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop to open')).toBeNull()
  })

  it('saves with Ctrl+S, even from a text field, instead of the browser save dialog', async () => {
    const { services } = await openedApp()
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(screen.getByLabelText('Name'), { key: 's', ctrlKey: true })).toBe(false)
    await waitFor(() => expect(services.downloads.map((d) => d.fileName)).toEqual(['test.litematic']))
  })

  it('commits an unfinished name edit before Ctrl+S saves', async () => {
    const { services, controller } = await openedApp()
    const name = screen.getByLabelText('Name') as HTMLInputElement
    name.focus()
    fireEvent.change(name, { target: { value: 'Fresh' } })
    fireEvent.keyDown(name, { key: 's', ctrlKey: true })
    await waitFor(() => expect(services.downloads.map((d) => d.fileName)).toEqual(['Fresh.litematic']))
    expect(controller.state.doc!.schematic.metadata.name).toBe('Fresh')
  })

  it('disables Save until a schematic is open', () => {
    renderApp()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows open errors with collapsible details and keeps the schematic open', async () => {
    const { services, controller } = await openedApp()
    const doc = controller.state.doc
    services.parse = async () => {
      throw new ParseFailure({ code: 'corrupt', message: 'Region "a" has truncated block data.', details: 'RangeError: packed data too short' })
    }
    await act(() => controller.openFile(fakeFile('broken.litematic')))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('This file is damaged')
    expect(dialog.textContent).toContain('Region "a" has truncated block data.')
    expect(screen.getByText('Technical details').closest('details')!.open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(controller.state.doc).toBe(doc)
  })

  it('warns before reading a very large file', async () => {
    const { controller } = renderApp({ services: withSchematic(), controller: { largeFileBytes: 10 } })
    let job!: Promise<void>
    act(() => { job = controller.openFile(fakeFile('huge.litematic', 50 * 1024 * 1024)) })
    expect(screen.getByRole('dialog').textContent).toContain('huge.litematic is 50 MB')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(() => job)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(controller.state.doc).toBeNull()
  })

  it('marks both dialogs modal and describes the confirm dialog by its message', async () => {
    const { controller } = renderApp({ services: withSchematic(), controller: { largeFileBytes: 10 } })
    act(() => { void controller.openFile(fakeFile('huge.litematic', 50 * 1024 * 1024)) })
    const confirm = screen.getByRole('dialog')
    expect(confirm.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)!.textContent).toContain('huge.litematic is 50 MB')
    act(() => controller.answerConfirm(false))
    act(() => controller.showError(new Error('boom'), 'edit'))
    expect(screen.getByRole('alertdialog').getAttribute('aria-modal')).toBe('true')
  })

  it('answers the confirm dialog with Cancel on Escape, without also cancelling box selection', async () => {
    const { controller } = await openedApp({ controller: { largeFileBytes: 1000 } })
    act(() => controller.startBoxSelection())
    let job!: Promise<void>
    act(() => { job = controller.openFile(fakeFile('huge.litematic', 50 * 1024 * 1024)) })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open anyway' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(() => job)
    expect(controller.state.doc!.fileName).toBe('castle.litematic')
    expect(controller.state.selecting).toBe(true)
  })

  it('dismisses the error dialog on Escape, without also cancelling box selection', async () => {
    const { controller } = await openedApp()
    act(() => controller.startBoxSelection())
    act(() => controller.showError(new Error('boom'), 'edit'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'OK' }), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(controller.state.selecting).toBe(true)
    // With no dialog open, Escape cancels box selection as before.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(controller.state.selecting).toBe(false)
  })

  it('edits name and author: Enter and blur commit, Escape reverts', async () => {
    const { controller, services } = await openedApp()
    const name = screen.getByLabelText('Name') as HTMLInputElement
    name.focus()
    fireEvent.change(name, { target: { value: 'Keep' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(controller.state.doc!.schematic.metadata.name).toBe('Keep')
    const author = screen.getByLabelText('Author') as HTMLInputElement
    fireEvent.change(author, { target: { value: 'Alex' } })
    fireEvent.blur(author)
    expect(controller.state.doc!.schematic.metadata.author).toBe('Alex')
    name.focus()
    fireEvent.change(name, { target: { value: 'Oops' } })
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(name.value).toBe('Keep')
    expect(controller.state.doc!.schematic.metadata.name).toBe('Keep')
    await act(() => controller.save())
    expect(services.downloads[0]!.fileName).toBe('Keep.litematic')
  })

  it('enables Undo and Redo with the history and runs them', async () => {
    const { controller } = await openedApp()
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    const redo = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement
    expect(undo.disabled).toBe(true)
    act(() => { controller.replace([{ from: [parseMatcher('stone', bundledRegistry())], to: { name: 'minecraft:andesite' } }], []) })
    expect(undo.disabled).toBe(false)
    expect(undo.title).toBe('Undo Replace (Ctrl+Z)')
    fireEvent.click(undo)
    expect(redo.disabled).toBe(false)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(controller.state.doc!.editor.canRedo).toBe(false)
  })

  it('leaves Ctrl+Z and arrow keys to text fields', async () => {
    const { controller } = await openedApp()
    const renderer = new FakeRenderer()
    act(() => { controller.attachRenderer(renderer) })
    act(() => { controller.replace([{ from: [parseMatcher('stone', bundledRegistry())], to: { name: 'minecraft:andesite' } }], []) })
    const name = screen.getByLabelText('Name')
    fireEvent.keyDown(name, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(name, { key: 'ArrowUp' })
    expect(controller.state.doc!.editor.canUndo).toBe(true)
    expect(renderer.calls).not.toContain('stepLayer:1')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(renderer.calls).toContain('stepLayer:1')
  })

  it('treats text-like inputs, sliders and selects as editing, but not checkboxes or buttons', () => {
    const el = (html: string) => {
      const div = document.createElement('div')
      div.innerHTML = html
      return div.firstElementChild
    }
    expect(['<input type="text">', '<input type="number">', '<input type="range">', '<select></select>', '<textarea></textarea>'].map((h) => isEditingTarget(el(h)))).toEqual([true, true, true, true, true])
    expect(['<input type="checkbox">', '<button></button>', '<div></div>'].map((h) => isEditingTarget(el(h)))).toEqual([false, false, false])
  })

  it('switches the render mode', async () => {
    const { controller } = await openedApp()
    const renderer = new FakeRenderer()
    act(() => { controller.attachRenderer(renderer) })
    fireEvent.click(screen.getByRole('button', { name: 'Colored' }))
    expect(renderer.calls).toContain('setMode:colored')
    expect(screen.getByRole('button', { name: 'Colored' }).getAttribute('aria-pressed')).toBe('true')
  })
})
