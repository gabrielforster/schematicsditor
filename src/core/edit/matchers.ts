import type { BlockState } from '../model'
import { blockStateKey, parseBlockStateKey } from '../model'
import type { BlockRegistry } from '../registry'
import { normalizeBlockName } from '../registry'
import { validateTarget } from './carryOver'

/** One "from" entry of a replace (spec §9.1). Names are namespaced. */
export type Matcher =
  /** Exactly this state: same name, same property set and values. */
  | { kind: 'exact'; state: BlockState }
  /** Any state of this block. */
  | { kind: 'block'; name: string }
  /** This block with at least these property values. */
  | { kind: 'partial'; name: string; properties: Readonly<Record<string, string>> }

export function matchesState(matcher: Matcher, state: BlockState): boolean {
  switch (matcher.kind) {
    case 'exact':
      return blockStateKey(matcher.state) === blockStateKey(state)
    case 'block':
      return matcher.name === state.name
    case 'partial':
      return matcher.name === state.name &&
        Object.entries(matcher.properties).every(([k, v]) => state.properties[k] === v)
  }
}

export function matchesAny(matchers: readonly Matcher[], state: BlockState): boolean {
  return matchers.some((m) => matchesState(m, state))
}

/**
 * Parse picker input: `oak_stairs` → any state; `oak_stairs[half=top]` →
 * partial; a state naming every property of a known block → exact. Names
 * get the `minecraft:` namespace when they have none. Properties of known
 * blocks are validated (EditError); unknown blocks are allowed, since a
 * file may contain blocks this version does not know, and they stay
 * replaceable. Throws SyntaxError on malformed input.
 */
export function parseMatcher(input: string, registry: BlockRegistry): Matcher {
  const parsed = parseBlockStateKey(input.trim())
  const name = normalizeBlockName(parsed.name)
  const keys = Object.keys(parsed.properties)
  if (keys.length === 0) return { kind: 'block', name }
  const def = registry.get(name)
  if (!def) return { kind: 'partial', name, properties: parsed.properties }
  validateTarget({ name, properties: parsed.properties }, registry)
  const complete = Object.keys(def.properties).length === keys.length
  return complete
    ? { kind: 'exact', state: { name, properties: parsed.properties } }
    : { kind: 'partial', name, properties: parsed.properties }
}
