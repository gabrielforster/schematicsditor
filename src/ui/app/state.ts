import type { Editor } from '../../core/edit/editor'
import type { Box } from '../../core/edit/scopes'
import type { Schematic } from '../../core/model'
import type { LayerRange, PickHit, RenderStatus } from '../../render'
import type { AppError } from './errors'

/** The open schematic. */
export interface Doc {
  schematic: Schematic
  editor: Editor
  /** The name of the file it was opened from. */
  fileName: string
  /** Bumped by every block edit, undo and redo, so views recompute. Metadata changes bump `AppState.metaRevision` instead. */
  revision: number
}

export type RightTab = 'materials' | 'replace' | 'family'

/** A material row highlighted in the 3D view (spec §10). */
export interface Highlight {
  /** The row's item id. */
  key: string
  blocks: readonly string[]
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
}

/** Notices the user can dismiss for the open schematic. */
export type DismissableNotice = 'suggest-colored' | 'newer-version' | 'chunks-failed' | 'not-undoable'

export interface AppState {
  doc: Doc | null
  /** Opening or saving in progress, with the label to show. */
  busy: { kind: 'open' | 'save'; label: string } | null
  error: AppError | null
  confirm: ConfirmRequest | null
  /** The renderer's last status; null until a renderer is attached. */
  render: RenderStatus | null
  hover: PickHit | null
  selection: Box | null
  /** Two-click box selection is waiting for clicks. */
  selecting: boolean
  layerRange: LayerRange | null
  hiddenRegions: readonly number[]
  highlight: Highlight | null
  tab: RightTab
  /** The last Alt+click eyedropper pick; `seq` changes on every pick. */
  picked: { state: string; seq: number } | null
  /** Outcome of the last edit, for the status line. */
  lastEdit: { message: string; undoable: boolean } | null
  dismissed: readonly DismissableNotice[]
  /**
   * Bumped by every name/author change. Kept out of `doc` so a rename leaves
   * the doc object (and the block `revision`) alone and does not re-run the
   * materials, preview and stats computations keyed on them.
   */
  metaRevision: number
  /** Mirrors the renderer's fly mode so the Fly button's pressed state can't drift from it. */
  flyMode: boolean
}

export const initialState: AppState = {
  doc: null,
  busy: null,
  error: null,
  confirm: null,
  render: null,
  hover: null,
  selection: null,
  selecting: false,
  layerRange: null,
  hiddenRegions: [],
  highlight: null,
  tab: 'materials',
  picked: null,
  lastEdit: null,
  dismissed: [],
  metaRevision: 0,
  flyMode: false,
}
