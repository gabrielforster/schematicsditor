import type { AppState, DismissableNotice } from './state'

export type NoticeAction = 'retry-assets' | 'use-colored'

export interface Notice {
  kind: 'assets-failed' | DismissableNotice
  tone: 'warning' | 'error' | 'info'
  message: string
  action?: { label: string; run: NoticeAction }
  /** What a dismiss button records; absent for notices that stay until their cause goes away. */
  dismiss?: DismissableNotice
}

export type NoticeInputs = Pick<AppState, 'doc' | 'render' | 'lastEdit' | 'dismissed'>

/** The banners under the top bar (spec §12 and §8.4), derived from state. */
export function noticesFor(state: NoticeInputs): Notice[] {
  const out: Notice[] = []
  const show = (kind: DismissableNotice) => !state.dismissed.includes(kind)
  const r = state.render
  if (state.doc && r) {
    if (r.assets.state === 'failed') {
      out.push({
        kind: 'assets-failed', tone: 'error',
        message: `Block textures could not be loaded (${r.assets.message}), so the view switched to colored mode.`,
        action: { label: 'Retry textures', run: 'retry-assets' },
      })
    }
    if (r.assets.state === 'ready' && r.assets.newerThanKnown && show('newer-version')) {
      out.push({
        kind: 'newer-version', tone: 'warning', dismiss: 'newer-version',
        message: `This schematic is from a newer Minecraft version than any known one; textures from ${r.assets.version} are used, so some blocks may look wrong.`,
      })
    }
    if (r.suggestColored && r.mode === 'textured' && show('suggest-colored')) {
      out.push({
        kind: 'suggest-colored', tone: 'info', dismiss: 'suggest-colored',
        message: 'This schematic has a region over 5 million blocks. Colored mode renders it much faster.',
        action: { label: 'Use colored mode', run: 'use-colored' },
      })
    }
    if (r.chunks.failed > 0 && show('chunks-failed')) {
      const n = r.chunks.failed
      out.push({
        kind: 'chunks-failed', tone: 'error', dismiss: 'chunks-failed',
        message: `${n} ${n === 1 ? 'chunk' : 'chunks'} could not be drawn and ${n === 1 ? 'is' : 'are'} outlined in red. The browser console has the error.`,
      })
    }
  }
  if (state.lastEdit && !state.lastEdit.undoable && show('not-undoable')) {
    out.push({
      kind: 'not-undoable', tone: 'warning', dismiss: 'not-undoable',
      message: 'The last edit was too large for the undo history, so it cannot be undone. Earlier undo steps were cleared.',
    })
  }
  return out
}
