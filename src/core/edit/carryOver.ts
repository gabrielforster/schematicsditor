import type { BlockState } from '../model'
import type { BlockDefinition, BlockRegistry } from '../registry'
import { EditError } from './errors'

/** What a replace writes: a block name plus the properties the user chose explicitly. */
export interface ReplaceTarget {
  name: string
  properties?: Readonly<Record<string, string>>
}

/**
 * Check a target against the registry: the block must exist, and every
 * explicit property must be one of its properties with an allowed value.
 */
export function validateTarget(target: ReplaceTarget, registry: BlockRegistry): BlockDefinition {
  const def = registry.get(target.name)
  if (!def) throw new EditError('unknown-block', `Unknown block: ${target.name}`)
  for (const [prop, value] of Object.entries(target.properties ?? {})) {
    const allowed = def.properties[prop]
    if (!allowed) throw new EditError('unknown-property', `${def.name} has no property "${prop}"`)
    if (!allowed.includes(value)) {
      throw new EditError('invalid-value', `${def.name} property "${prop}" cannot be "${value}"`)
    }
  }
  return def
}

/**
 * The state that replaces `source` (spec §9.1): explicitly chosen target
 * properties win; otherwise every property the target shares with the
 * source is copied when its value is valid for the target; the rest take
 * the target's defaults. Source properties the target lacks are dropped.
 */
export function carryOver(source: BlockState, target: ReplaceTarget, registry: BlockRegistry): BlockState {
  const def = validateTarget(target, registry)
  const explicit = target.properties ?? {}
  const properties: Record<string, string> = {}
  for (const [prop, allowed] of Object.entries(def.properties)) {
    const fromSource = source.properties[prop]
    properties[prop] = explicit[prop]
      ?? (fromSource !== undefined && allowed.includes(fromSource) ? fromSource : def.defaults[prop]!)
  }
  return { name: def.name, properties }
}
