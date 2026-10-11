import type { BlockState } from '../model'

/** The Minecraft version a block data set was taken from. */
export interface RegistryVersion {
  id: string
  dataVersion: number
}

export interface BlockDefinition {
  /** Namespaced, e.g. `minecraft:oak_stairs`. */
  name: string
  /** Property name → allowed values, in mcmeta order. */
  properties: Readonly<Record<string, readonly string[]>>
  /** Property name → default value; same keys as `properties`. */
  defaults: Readonly<Record<string, string>>
}

export class BlockDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockDataError'
  }
}

/** `stone` → `minecraft:stone`; names that already have a namespace are unchanged. */
export function normalizeBlockName(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function parseEntry(name: string, entry: unknown): BlockDefinition {
  const bad = (why: string) => new BlockDataError(`invalid block data for "${name}": ${why}`)
  if (!Array.isArray(entry) || entry.length !== 2 || !isRecord(entry[0]) || !isRecord(entry[1])) {
    throw bad('expected [properties, defaults]')
  }
  const [rawProps, rawDefaults] = entry as [Record<string, unknown>, Record<string, unknown>]
  const properties: Record<string, readonly string[]> = {}
  const defaults: Record<string, string> = {}
  for (const [prop, values] of Object.entries(rawProps)) {
    if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === 'string')) {
      throw bad(`property "${prop}" needs a non-empty list of string values`)
    }
    const def = rawDefaults[prop]
    if (typeof def !== 'string' || !values.includes(def)) throw bad(`property "${prop}" has no valid default`)
    properties[prop] = values as string[]
    defaults[prop] = def
  }
  for (const prop of Object.keys(rawDefaults)) {
    if (!(prop in properties)) throw bad(`default for unknown property "${prop}"`)
  }
  return { name: normalizeBlockName(name), properties, defaults }
}

/**
 * Block list, properties and defaults for one Minecraft version.
 *
 * `data` has misode/mcmeta's `blocks/data.json` shape:
 * `{ "<name>": [ { prop: [values...] }, { prop: default } ] }`, names with or
 * without the `minecraft:` namespace. The bundled snapshot uses it; a
 * per-version runtime fetch can pass its own object.
 */
export class BlockRegistry {
  readonly version: RegistryVersion | undefined
  private readonly blocks = new Map<string, BlockDefinition>()
  private sortedNames: string[] | undefined

  constructor(data: unknown, version?: RegistryVersion) {
    if (!isRecord(data)) throw new BlockDataError('block data must be an object')
    for (const [name, entry] of Object.entries(data)) {
      const def = parseEntry(name, entry)
      this.blocks.set(def.name, def)
    }
    this.version = version
  }

  get size(): number {
    return this.blocks.size
  }

  /** Accepts names with or without the `minecraft:` namespace. */
  get(name: string): BlockDefinition | undefined {
    return this.blocks.get(normalizeBlockName(name))
  }

  has(name: string): boolean {
    return this.blocks.has(normalizeBlockName(name))
  }

  /** Every namespaced block name, sorted. */
  names(): readonly string[] {
    this.sortedNames ??= [...this.blocks.keys()].sort()
    return this.sortedNames
  }

  /** The block with all properties at their defaults. Throws for unknown blocks. */
  defaultState(name: string): BlockState {
    const def = this.get(name)
    if (!def) throw new BlockDataError(`unknown block: ${name}`)
    return { name: def.name, properties: { ...def.defaults } }
  }
}
