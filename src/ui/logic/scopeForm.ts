import type { Box, Scope } from '../../core/edit/scopes'

/** The scope checkboxes of the Replace and Family swap tabs (spec §9.1). */
export interface ScopeForm {
  regions: { on: boolean; ids: readonly number[] }
  yRange: { on: boolean; minY: string; maxY: string }
  box: { on: boolean }
}

export const emptyScopeForm: ScopeForm = {
  regions: { on: false, ids: [] },
  yRange: { on: false, minY: '', maxY: '' },
  box: { on: false },
}

const whole = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s) : null)

/**
 * The checked scopes, which combine by intersection; none checked is the
 * whole schematic. An error explains a checked scope that is incomplete.
 */
export function scopesFromForm(form: ScopeForm, selection: Box | null): { scopes: Scope[] } | { error: string } {
  const scopes: Scope[] = []
  if (form.regions.on) {
    if (form.regions.ids.length === 0) return { error: 'Pick at least one region.' }
    scopes.push({ kind: 'regions', regionIds: form.regions.ids })
  }
  if (form.yRange.on) {
    const minY = whole(form.yRange.minY), maxY = whole(form.yRange.maxY)
    if (minY === null || maxY === null) return { error: 'Enter whole numbers for the Y range.' }
    scopes.push({ kind: 'yRange', minY, maxY })
  }
  if (form.box.on) {
    if (!selection) return { error: 'Select a box in the left panel first.' }
    scopes.push({ kind: 'box', box: selection })
  }
  return { scopes }
}
