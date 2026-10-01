import { useId, useMemo, useState } from 'react'
import { searchBlocks } from '../logic/blockSearch'

interface Props {
  label: string
  /** Every pickable name. */
  names: readonly string[]
  value: string
  onChange: (value: string) => void
  /** Enter or a click on a suggestion. Enter with no suggestion highlighted picks the typed text. */
  onPick: (value: string) => void
  placeholder?: string
}

/** A searchable block-name combobox (spec §9.1). Typed text may carry properties: `oak_stairs[half=top]`. */
export function BlockPicker({ label, names, value, onChange, onPick, placeholder }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const suggestions = useMemo(() => (value.includes('[') ? [] : searchBlocks(names, value, 50)), [names, value])
  const shown = open && suggestions.length > 0
  const pick = (v: string) => {
    onPick(v)
    setActive(-1)
  }
  return (
    <div className="picker">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, suggestions.length - 1))
          } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const v = shown && active >= 0 ? suggestions[active]! : value.trim()
            if (v) pick(v)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {shown && (
        <ul role="listbox" id={`${id}-list`} aria-label={`${label} suggestions`}>
          {suggestions.map((name, i) => (
            <li
              key={name}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(name)
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
