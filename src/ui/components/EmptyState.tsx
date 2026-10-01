import type { OpenableFile } from '../app/controller'
import { useController } from '../hooks'

/** A bundled example the empty state can open (Plan 5 supplies one). */
export interface SampleSlot {
  label: string
  load: () => Promise<OpenableFile>
}

/** Spec §11: explains usage and offers the bundled sample when there is one. */
export function EmptyState({ sample }: { sample?: SampleSlot | undefined }) {
  const controller = useController()
  return (
    <div className="empty-state">
      <h1>Litematica schematic editor</h1>
      <p>Drop a <code>.litematic</code> file anywhere in this window, or click <strong>Open</strong>.</p>
      <ul>
        <li>Preview it in 3D, layer by layer.</li>
        <li>Count materials, export them as CSV or text.</li>
        <li>Replace blocks or swap whole wood, stone and color families.</li>
        <li>Save a file that loads back into Litematica.</li>
      </ul>
      <p className="hint">Everything runs in your browser; files are never uploaded.</p>
      {sample && (
        <button
          type="button"
          onClick={async () => {
            try {
              await controller.openFile(await sample.load())
            } catch (e) {
              controller.showError(e, 'open')
            }
          }}
        >
          {sample.label}
        </button>
      )}
    </div>
  )
}
