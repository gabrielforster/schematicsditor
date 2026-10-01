import type { Box, Scope } from '../../core/edit/scopes'
import type { LayerRange } from '../../render'

/** Spec §10: the material list follows the current scope. */
export type MaterialScopeKind = 'all' | 'visible' | 'box'

export interface ViewScope {
  regionCount: number
  hiddenRegions: readonly number[]
  layerRange: LayerRange | null
  selection: Box | null
}

/**
 * Scopes for the material list, or null when the choice has nothing to
 * count yet (box chosen without a selection). "Visible" means what the view
 * shows: the visible layers of the regions that are not hidden.
 */
export function materialScopes(kind: MaterialScopeKind, view: ViewScope): Scope[] | null {
  switch (kind) {
    case 'all':
      return []
    case 'box':
      return view.selection ? [{ kind: 'box', box: view.selection }] : null
    case 'visible': {
      const scopes: Scope[] = []
      if (view.hiddenRegions.length > 0) {
        const regionIds = Array.from({ length: view.regionCount }, (_, i) => i).filter((i) => !view.hiddenRegions.includes(i))
        scopes.push({ kind: 'regions', regionIds })
      }
      if (view.layerRange) scopes.push({ kind: 'yRange', minY: view.layerRange.minY, maxY: view.layerRange.maxY })
      return scopes
    }
  }
}
