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

export function parseBlockStateKey(key: string): BlockState {
  const open = key.indexOf('[')
  if (open === -1) return { name: key, properties: {} }
  if (!key.endsWith(']')) throw new SyntaxError(`invalid block state: ${key}`)
  const properties: Record<string, string> = {}
  const body = key.slice(open + 1, -1)
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) throw new SyntaxError(`invalid block state: ${key}`)
      properties[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }
  return { name: key.slice(0, open), properties }
}
