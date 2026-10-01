import type { BlockRegistry } from '../registry'
import { normalizeBlockName } from '../registry'

/** A set of blocks that differ only in material, keyed by shape (spec §9.2). */
export interface Family {
  id: string
  label: string
  /** Id of the group this family belongs to (`wood`, `stone`, `color`). */
  group: string
  /** Shape key (`planks`, `stairs`, `wall_sign`, ...) → namespaced block name. */
  blocks: Readonly<Record<string, string>>
}

export interface FamilyGroup {
  id: string
  label: string
  families: Family[]
}

export class FamilyDataError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`Invalid family data: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`)
    this.name = 'FamilyDataError'
    this.problems = problems
  }
}

const ID = /^[a-z0-9_]+$/
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Parse and validate curated family JSON against a block registry.
 *
 * `strict` (the default) collects every problem, including block names the
 * registry does not know, and throws one FamilyDataError. With
 * `strict: false` unknown blocks are dropped instead (for registries of
 * older Minecraft versions that lack newer woods), along with families and
 * groups left empty; structural problems still throw.
 */
export function loadFamilies(data: unknown, registry: BlockRegistry, options: { strict?: boolean } = {}): FamilyGroup[] {
  const strict = options.strict ?? true
  const problems: string[] = []
  const seenIds = new Set<string>()
  const groups: FamilyGroup[] = []

  const rawGroups = isRecord(data) ? data.groups : undefined
  if (!Array.isArray(rawGroups)) throw new FamilyDataError(['expected { "groups": [...] }'])

  for (const g of rawGroups) {
    if (!isRecord(g) || typeof g.id !== 'string' || !ID.test(g.id) || typeof g.label !== 'string' || !Array.isArray(g.families)) {
      problems.push(`malformed group ${JSON.stringify(isRecord(g) ? g.id : g)}`)
      continue
    }
    const group: FamilyGroup = { id: g.id, label: g.label, families: [] }
    for (const f of g.families) {
      if (!isRecord(f) || typeof f.id !== 'string' || !ID.test(f.id) || typeof f.label !== 'string' || !isRecord(f.blocks)) {
        problems.push(`malformed family in group "${g.id}": ${JSON.stringify(isRecord(f) ? f.id : f)}`)
        continue
      }
      if (seenIds.has(f.id)) problems.push(`duplicate family id "${f.id}"`)
      seenIds.add(f.id)
      const blocks: Record<string, string> = {}
      const seenBlocks = new Set<string>()
      for (const [shape, rawName] of Object.entries(f.blocks)) {
        if (!ID.test(shape) || typeof rawName !== 'string') {
          problems.push(`family "${f.id}": malformed shape "${shape}"`)
          continue
        }
        const name = normalizeBlockName(rawName)
        if (seenBlocks.has(name)) problems.push(`family "${f.id}": ${name} is used by two shapes`)
        seenBlocks.add(name)
        if (!registry.has(name)) {
          if (strict) problems.push(`family "${f.id}": unknown block ${name} (shape "${shape}")`)
          continue
        }
        blocks[shape] = name
      }
      if (Object.keys(blocks).length > 0) group.families.push({ id: f.id, label: f.label, group: g.id, blocks })
    }
    if (group.families.length > 0) groups.push(group)
  }
  if (problems.length > 0) throw new FamilyDataError(problems)
  return groups
}

export function findFamily(groups: readonly FamilyGroup[], id: string): Family | undefined {
  for (const g of groups) {
    const f = g.families.find((x) => x.id === id)
    if (f) return f
  }
  return undefined
}
