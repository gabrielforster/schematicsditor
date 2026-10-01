import type { ComponentType } from 'react'
import type { RightTab } from '../app/state'
import { useApp, useController } from '../hooks'
import { MaterialsTab } from './MaterialsTab'
import { ReplaceTab } from './ReplaceTab'

const TABS: { id: RightTab; label: string; Panel: ComponentType<{ active: boolean }> }[] = [
  { id: 'materials', label: 'Materials', Panel: MaterialsTab },
  { id: 'replace', label: 'Replace', Panel: ReplaceTab },
]

/** Spec §11 right panel. Every tab stays mounted, so forms keep their input across tab switches. */
export function RightPanel() {
  const controller = useController()
  const tab = useApp((s) => s.tab)
  return (
    <aside className="panel right" aria-label="Tools">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={tab === t.id} onClick={() => controller.setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map(({ id, Panel }) => (
        <div key={id} className="tab-panel" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}>
          <Panel active={tab === id} />
        </div>
      ))}
    </aside>
  )
}
