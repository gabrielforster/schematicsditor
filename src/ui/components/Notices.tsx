import { useMemo } from 'react'
import { noticesFor } from '../app/notices'
import { useApp, useController } from '../hooks'

/** Banners under the top bar: asset fallback with retry, newer version, colored suggestion, mesh failures. */
export function Notices() {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  const render = useApp((s) => s.render)
  const lastEdit = useApp((s) => s.lastEdit)
  const dismissed = useApp((s) => s.dismissed)
  const notices = useMemo(() => noticesFor({ doc, render, lastEdit, dismissed }), [doc, render, lastEdit, dismissed])
  return (
    <div className="notices">
      {notices.map((n) => (
        <div key={n.kind} className={`notice notice-${n.tone}`} role={n.tone === 'error' ? 'alert' : 'status'}>
          <p>{n.message}</p>
          {n.action && <button type="button" onClick={() => controller.runNoticeAction(n.action!.run)}>{n.action.label}</button>}
          {n.dismiss && <button type="button" aria-label="Dismiss" onClick={() => controller.dismissNotice(n.dismiss!)}>×</button>}
        </div>
      ))}
    </div>
  )
}
