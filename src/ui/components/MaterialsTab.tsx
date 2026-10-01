import { useMemo, useState } from 'react'
import {
  computeMaterials, filterMaterials, materialsToCsv, materialsToText, sortMaterials,
  type MaterialList, type MaterialSortKey,
} from '../../core/materials'
import { downloadName } from '../app/fileName'
import { useApp, useController } from '../hooks'
import { materialScopes, type MaterialScopeKind } from '../logic/materialScope'

const COLUMNS: { key: MaterialSortKey; label: string; numeric: boolean }[] = [
  { key: 'item', label: 'Item', numeric: false },
  { key: 'count', label: 'Count', numeric: true },
  { key: 'stacks', label: 'Stacks', numeric: true },
  { key: 'shulkerBoxes', label: 'Shulkers', numeric: true },
]

const short = (id: string) => id.replace(/^minecraft:/, '')

/**
 * Spec §10: item counts for the chosen scope, sortable and filterable,
 * exported as CSV or text; a row click highlights its blocks. Counts are
 * computed only while the tab is visible.
 */
export function MaterialsTab({ active }: { active: boolean }) {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  const hiddenRegions = useApp((s) => s.hiddenRegions)
  const layerRange = useApp((s) => s.layerRange)
  const selection = useApp((s) => s.selection)
  const highlight = useApp((s) => s.highlight)
  const [kind, setKind] = useState<MaterialScopeKind>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: MaterialSortKey; direction: 'asc' | 'desc' }>({ key: 'count', direction: 'desc' })
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const scopes = doc && materialScopes(kind, { regionCount: doc.schematic.regions.length, hiddenRegions, layerRange, selection })
  const scopesKey = JSON.stringify(scopes)
  const list = useMemo(
    () => (active && doc && scopes ? computeMaterials(doc.schematic, scopes, controller.services.registry) : null),
    [active, doc, scopesKey, controller], // scopesKey stands in for scopes, a new array every render
  )
  const shown: MaterialList | null = useMemo(() => {
    if (!list) return null
    const q = query.trim().toLowerCase().replace(/\s+/g, '_')
    return {
      rows: sortMaterials(filterMaterials(list.rows, query), sort.key, sort.direction),
      itemless: list.itemless.filter((r) => r.block.includes(q)),
    }
  }, [list, query, sort])

  if (!doc) return <p className="hint">Open a schematic to see its materials.</p>

  const toggleSort = (key: MaterialSortKey, numeric: boolean) =>
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: numeric ? 'desc' : 'asc' }))
  const toggleHighlight = (key: string, blocks: readonly string[]) =>
    controller.setHighlight(highlight?.key === key ? null : { key, blocks })

  return (
    <div className="materials-tab">
      <section>
        <div className="row">
          <label>
            Scope{' '}
            <select value={kind} onChange={(e) => setKind(e.target.value as MaterialScopeKind)}>
              <option value="all">Whole schematic</option>
              <option value="visible">Visible layers</option>
              <option value="box" disabled={!selection}>Box selection</option>
            </select>
          </label>
          <input type="search" placeholder="Filter" aria-label="Filter materials" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="row">
          <button
            type="button"
            disabled={!shown}
            onClick={() => controller.services.download(materialsToCsv(shown!), downloadName(doc.schematic.metadata.name, doc.fileName, '-materials.csv'), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={!shown}
            onClick={() => controller.services.copyText(materialsToText(shown!)).then(() => setCopyState('copied'), () => setCopyState('failed'))}
          >
            Copy as text
          </button>
          {copyState === 'copied' && <span className="hint" role="status">Copied</span>}
          {copyState === 'failed' && <span className="field-error" role="status">Copy failed; the browser blocked the clipboard.</span>}
          {highlight && <button type="button" onClick={() => controller.setHighlight(null)}>Clear highlight</button>}
        </div>
      </section>
      {!scopes && <p className="hint">Select a box in the left panel to count its materials.</p>}
      {shown && shown.rows.length === 0 && shown.itemless.length === 0 && <p className="hint">No blocks in this scope.</p>}
      {shown && shown.rows.length > 0 && (
        <table className="materials">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.numeric ? 'num' : undefined} aria-sort={sort.key === c.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(c.key, c.numeric)}>{c.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((r) => (
              <tr key={r.item} aria-selected={highlight?.key === r.item} onClick={() => toggleHighlight(r.item, r.blocks)} title="Highlight in the 3D view">
                <td>{short(r.item)}{r.unknown && <span className="badge">unknown</span>}</td>
                <td className="num">{r.count.toLocaleString('en-US')}</td>
                <td className="num">{r.stacks.toLocaleString('en-US')}</td>
                <td className="num">{r.shulkerBoxes.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shown && shown.itemless.length > 0 && (
        <section>
          <h2>No item</h2>
          <table className="materials">
            <tbody>
              {shown.itemless.map((r) => (
                <tr key={r.block} aria-selected={highlight?.key === `itemless:${r.block}`} onClick={() => toggleHighlight(`itemless:${r.block}`, [r.block])}>
                  <td>{short(r.block)}</td>
                  <td className="num">{r.count.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
