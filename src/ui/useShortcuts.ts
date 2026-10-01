import { useEffect } from 'react'
import type { AppController } from './app/controller'

// Inputs that use Ctrl+Z or the arrow keys themselves; checkboxes and buttons do not.
const KEYED_INPUTS = new Set(['text', 'search', 'number', 'email', 'url', 'tel', 'password', 'range'])

/** True when keys should go to a form control instead of the app (text undo, slider arrows). */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement) return KEYED_INPUTS.has(target.type)
  return target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * Global keys (spec §8.5, §11): Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes,
 * Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, ↑/↓ step layers, Esc closes an open
 * dialog or else cancels box selection. Undo, redo and arrows leave form
 * controls alone.
 */
export function useShortcuts(controller: AppController): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 's') {
        e.preventDefault()
        // Commit a half-typed Name/Author edit (TextField commits on blur) so the save sees it.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        void controller.save()
        return
      }
      // Escape answers an open dialog (Cancel / OK) and does nothing else.
      if (e.key === 'Escape' && (controller.state.confirm || controller.state.error)) {
        if (controller.state.confirm) controller.answerConfirm(false)
        else controller.dismissError()
        return
      }
      if (isEditingTarget(e.target)) return
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        controller.redo()
      } else if (mod && key === 'z') {
        e.preventDefault()
        controller.undo()
      } else if (!mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && controller.state.doc) {
        e.preventDefault()
        controller.stepLayer(e.key === 'ArrowUp' ? 1 : -1)
      } else if (e.key === 'Escape' && controller.state.selecting) {
        controller.cancelBoxSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller])
}
