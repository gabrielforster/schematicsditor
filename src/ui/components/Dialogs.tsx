import { useApp, useController } from '../hooks'

/** Spec §12: friendly message, collapsible technical details; the open schematic stays open. */
export function ErrorDialog() {
  const controller = useController()
  const error = useApp((s) => s.error)
  if (!error) return null
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-labelledby="error-title" aria-describedby="error-message">
        <h2 id="error-title">{error.title}</h2>
        <p id="error-message">{error.message}</p>
        {error.details && (
          <details>
            <summary>Technical details</summary>
            <pre>{error.details}</pre>
          </details>
        )}
        <div className="dialog-buttons">
          <button type="button" autoFocus onClick={() => controller.dismissError()}>OK</button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog() {
  const controller = useController()
  const confirm = useApp((s) => s.confirm)
  if (!confirm) return null
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{confirm.title}</h2>
        <p>{confirm.message}</p>
        <div className="dialog-buttons">
          <button type="button" onClick={() => controller.answerConfirm(false)}>Cancel</button>
          <button type="button" className="primary" autoFocus onClick={() => controller.answerConfirm(true)}>{confirm.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
