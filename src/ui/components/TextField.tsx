import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: string
  onCommit: (value: string) => void
  maxLength?: number
  placeholder?: string
}

/** A text input that commits on Enter or blur and reverts on Escape. */
export function TextField({ label, value, onCommit, maxLength, placeholder }: Props) {
  const [draft, setDraft] = useState(value)
  const reverting = useRef(false)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (reverting.current) reverting.current = false
          else if (draft !== value) onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            reverting.current = true
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}
