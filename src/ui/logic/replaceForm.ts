import { validateTarget, type ReplaceTarget } from '../../core/edit/carryOver'
import { parseMatcher, type Matcher } from '../../core/edit/matchers'
import { deleteRule, type ReplaceRule } from '../../core/edit/replace'
import type { Box, Scope } from '../../core/edit/scopes'
import { parseBlockStateKey } from '../../core/model'
import { normalizeBlockName, type BlockRegistry } from '../../core/registry'
import { emptyScopeForm, scopesFromForm, type ScopeForm } from './scopeForm'

/** The Replace tab's input (spec §9.1). */
export interface ReplaceForm {
  /** Matcher texts: `oak_stairs` (any state), `oak_stairs[half=top]` (partial) or a full state (exact). */
  from: readonly string[]
  /** Target block, optionally with properties typed in brackets; '' until chosen. */
  to: string
  /** Target properties chosen explicitly; a missing key carries over from the source. */
  toProperties: Readonly<Record<string, string>>
  scope: ScopeForm
}

export const emptyReplaceForm: ReplaceForm = { from: [], to: '', toProperties: {}, scope: emptyScopeForm }

export type BuiltReplace =
  | { ok: true; from: Matcher[]; replaceRule: ReplaceRule | null; deleteRule: ReplaceRule; scopes: Scope[] }
  | { ok: false; field: 'from' | 'to' | 'scope'; error: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Adds a matcher text, without duplicates. */
export function addFrom(form: ReplaceForm, text: string): ReplaceForm {
  const t = text.trim()
  return t === '' || form.from.includes(t) ? form : { ...form, from: [...form.from, t] }
}

/**
 * The target a form describes: the picked name plus typed properties, with
 * the property dropdowns winning. Null while no target is chosen.
 */
export function targetOf(form: ReplaceForm): ReplaceTarget | null {
  if (form.to.trim() === '') return null
  const parsed = parseBlockStateKey(form.to.trim())
  return { name: normalizeBlockName(parsed.name), properties: { ...parsed.properties, ...form.toProperties } }
}

/**
 * Turns the form into rules and scopes, or names the first field that is
 * wrong. Delete needs only "from"; replace also needs a valid target.
 */
export function buildReplace(form: ReplaceForm, registry: BlockRegistry, selection: Box | null): BuiltReplace {
  if (form.from.length === 0) return { ok: false, field: 'from', error: 'Add at least one block to replace.' }
  const from: Matcher[] = []
  for (const text of form.from) {
    try {
      from.push(parseMatcher(text, registry))
    } catch (e) {
      return { ok: false, field: 'from', error: `${text}: ${message(e)}` }
    }
  }
  let replaceRule: ReplaceRule | null = null
  try {
    const to = targetOf(form)
    if (to) {
      validateTarget(to, registry)
      replaceRule = { from, to }
    }
  } catch (e) {
    return { ok: false, field: 'to', error: message(e) }
  }
  const scoped = scopesFromForm(form.scope, selection)
  if ('error' in scoped) return { ok: false, field: 'scope', error: scoped.error }
  return { ok: true, from, replaceRule, deleteRule: deleteRule(from), scopes: scoped.scopes }
}
