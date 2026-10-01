export interface BlockState {
  name: string
  properties: Readonly<Record<string, string>>
}

export const AIR: BlockState = { name: 'minecraft:air', properties: {} }

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])

export function isAir(state: BlockState): boolean {
  return AIR_NAMES.has(state.name)
}

/** Canonical key: `name[k1=v1,k2=v2]` with keys sorted; bare `name` without properties. */
export function blockStateKey(state: BlockState): string {
  const keys = Object.keys(state.properties).sort()
  if (keys.length === 0) return state.name
  return `${state.name}[${keys.map((k) => `${k}=${state.properties[k]}`).join(',')}]`
}

// Resource location (`namespace:path` or bare `path`) and property syntax, as
// Minecraft accepts them. User input from the block picker reaches this parser.
const NAME = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/
const PROPERTY = /^[a-z0-9_]+$/

/**
 * Parse `name` or `name[k=v,...]`. Throws SyntaxError on anything else,
 * including stray brackets, empty keys or values, and duplicate keys.
 */
export function parseBlockStateKey(key: string): BlockState {
  const invalid = () => new SyntaxError(`invalid block state: ${key}`)
  const open = key.indexOf('[')
  const name = open === -1 ? key : key.slice(0, open)
  if (!NAME.test(name)) throw invalid()
  const properties: Record<string, string> = {}
  if (open === -1) return { name, properties }
  if (!key.endsWith(']')) throw invalid()
  const body = key.slice(open + 1, -1)
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=')
      const k = pair.slice(0, eq)
      const v = pair.slice(eq + 1)
      if (eq === -1 || !PROPERTY.test(k) || !PROPERTY.test(v) || Object.hasOwn(properties, k)) throw invalid()
      properties[k] = v
    }
  }
  return { name, properties }
}
