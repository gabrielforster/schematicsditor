import type { AppController } from './app/controller'
import { ConfirmDialog, ErrorDialog } from './components/Dialogs'
import { EmptyState, type SampleSlot } from './components/EmptyState'
import { TopBar } from './components/TopBar'
import { ControllerContext, useApp, useController } from './hooks'
import { useFileDrop } from './useFileDrop'
import { useShortcuts } from './useShortcuts'

export interface AppProps {
  controller: AppController
  /** The empty state's sample schematic; Plan 5 passes one. */
  sample?: SampleSlot
}

export function App({ controller, sample }: AppProps) {
  return (
    <ControllerContext.Provider value={controller}>
      <Shell sample={sample} />
    </ControllerContext.Provider>
  )
}

function Shell({ sample }: { sample?: SampleSlot | undefined }) {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  useShortcuts(controller)
  const drop = useFileDrop((file) => void controller.openFile(file))
  return (
    <div className="app" {...drop.handlers}>
      <TopBar />
      <main className="workspace">
        <section className="center">
          {!doc && <EmptyState sample={sample} />}
        </section>
      </main>
      {drop.dragging && <div className="drop-overlay" aria-hidden="true">Drop to open</div>}
      <ErrorDialog />
      <ConfirmDialog />
    </div>
  )
}
