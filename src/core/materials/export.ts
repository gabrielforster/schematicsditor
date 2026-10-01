import type { MaterialList } from './materials'
import { SHULKER_SLOTS } from './materials'

function csvField(value: string | number): string {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** RFC 4180 CSV (CRLF line endings) with a header row; itemless blocks come last. */
export function materialsToCsv(list: MaterialList): string {
  const lines = [['Item', 'Count', 'Stacks', 'Shulker boxes', 'Note']]
  for (const r of list.rows) {
    lines.push([r.item, String(r.count), String(r.stacks), String(r.shulkerBoxes), r.unknown ? 'unknown' : ''])
  }
  for (const r of list.itemless) lines.push([r.block, String(r.count), '', '', 'itemless'])
  return lines.map((cells) => cells.map(csvField).join(',')).join('\r\n') + '\r\n'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `2000` stone → `1 shulker box + 4 stacks + 16`; empty when the count fits in one partial stack. */
export function formatBreakdown(count: number, stackSize: number): string {
  if (count < stackSize || stackSize === 1) return ''
  const perBox = stackSize * SHULKER_SLOTS
  const boxes = Math.floor(count / perBox)
  const stacks = Math.floor((count % perBox) / stackSize)
  const rest = count % stackSize
  const parts: string[] = []
  if (boxes > 0) parts.push(plural(boxes, 'shulker box', 'shulker boxes'))
  if (stacks > 0) parts.push(plural(stacks, 'stack', 'stacks'))
  if (rest > 0) parts.push(String(rest))
  return parts.join(' + ')
}

/** Plain text for "copy as text": one line per item, then an itemless section. */
export function materialsToText(list: MaterialList): string {
  const lines = list.rows.map((r) => {
    const breakdown = formatBreakdown(r.count, r.stackSize)
    return `${r.count} × ${r.item}${breakdown ? ` (${breakdown})` : ''}${r.unknown ? ' [unknown]' : ''}`
  })
  if (list.itemless.length > 0) {
    lines.push('', 'Itemless:', ...list.itemless.map((r) => `${r.count} × ${r.block}`))
  }
  return lines.join('\n') + '\n'
}
