import type { Box, Scope } from '../../core/edit/scopes'
import { findFamily, type Family, type FamilyGroup } from '../../core/families'
import { scopesFromForm, type ScopeForm } from './scopeForm'

/** The Family swap tab's input (spec §9.2). Family ids are '' until chosen. */
export interface FamilyForm {
  sourceId: string
  targetId: string
  scope: ScopeForm
}

export type BuiltFamilySwap =
  | { ok: true; source: Family; target: Family; scopes: Scope[] }
  | { ok: false; error: string | null }

/** The families and scopes a form describes; `error: null` means "not filled in yet". */
export function buildFamilySwap(form: FamilyForm, groups: readonly FamilyGroup[], selection: Box | null): BuiltFamilySwap {
  const source = findFamily(groups, form.sourceId)
  const target = findFamily(groups, form.targetId)
  if (!source || !target) return { ok: false, error: null }
  if (source.id === target.id) return { ok: false, error: 'Pick two different families.' }
  const scoped = scopesFromForm(form.scope, selection)
  if ('error' in scoped) return { ok: false, error: scoped.error }
  return { ok: true, source, target, scopes: scoped.scopes }
}
