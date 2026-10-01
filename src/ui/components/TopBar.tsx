import { useRef } from 'react'
import { useApp, useController } from '../hooks'
import { TextField } from './TextField'

/** Longest name or author the fields accept; far below the NBT string limit. */
export const METADATA_FIELD_MAX = 256

/** Spec §11 top bar: Open, Save, Undo/Redo, Textured/Colored, editable name and author. */
export function TopBar() {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  const busy = useApp((s) => s.busy)
  const input = useRef<HTMLInputElement>(null)
  const history = doc?.editor.history
  return (
    <header className="topbar">
      <div className="topbar-group">
        <button type="button" onClick={() => input.current?.click()}>Open</button>
        <input
          ref={input}
          type="file"
          accept=".litematic"
          aria-label="Open .litematic file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void controller.openFile(file)
          }}
        />
        <button type="button" disabled={!doc || busy !== null} title="Save (Ctrl+S)" onClick={() => void controller.save()}>
          Save
        </button>
      </div>
      <div className="topbar-group">
        <button type="button" disabled={!history?.canUndo} title={history?.undoLabel ? `Undo ${history.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'} onClick={() => controller.undo()}>
          Undo
        </button>
        <button type="button" disabled={!history?.canRedo} title={history?.redoLabel ? `Redo ${history.redoLabel} (Ctrl+Shift+Z)` : 'Redo (Ctrl+Shift+Z)'} onClick={() => controller.redo()}>
          Redo
        </button>
      </div>
      <ModeToggle />
      {doc && (
        <div className="topbar-group topbar-meta">
          <TextField label="Name" value={doc.schematic.metadata.name} maxLength={METADATA_FIELD_MAX} placeholder="Untitled" onCommit={(name) => controller.setMetadata({ name })} />
          <TextField label="Author" value={doc.schematic.metadata.author} maxLength={METADATA_FIELD_MAX} onCommit={(author) => controller.setMetadata({ author })} />
        </div>
      )}
      {busy && <span className="busy" role="status">{busy.label}</span>}
    </header>
  )
}

function ModeToggle() {
  const controller = useController()
  const render = useApp((s) => s.render)
  const mode = render?.mode ?? 'textured'
  const loading = render?.assets.state === 'loading' && mode === 'textured'
  return (
    <div className="topbar-group segmented" role="group" aria-label="Render mode">
      <button type="button" aria-pressed={mode === 'textured'} onClick={() => controller.setMode('textured')}>Textured</button>
      <button type="button" aria-pressed={mode === 'colored'} onClick={() => controller.setMode('colored')}>Colored</button>
      {loading && <span className="hint">Loading textures…</span>}
    </div>
  )
}
