import { NbtCompound, NbtString } from 'deepslate/nbt'
import type { BlockState, Region, Schematic } from '../model'
import { blockStateKey, createBlockArray } from '../model'
import type { BlockRegistry } from '../registry'
import { blockEntityId, keepsBlockEntity } from './blockEntities'
import { carryOver, validateTarget, type ReplaceTarget } from './carryOver'
import { STATE_BYTES, tileEntityBytes, type BlocksEdit, type Edit, type PaletteEdit } from './edits'
import { DirtyChunks, type RegionChange } from './events'
import { matchesAny, type Matcher } from './matchers'
import { forEachIndexInScope, indexInScope, paletteCounts, resolveScopes, type RegionScope, type Scope } from './scopes'

/** Blocks matching any of `from` become `to`, with property carry-over. */
export interface ReplaceRule {
  from: readonly Matcher[]
  to: ReplaceTarget
}

export interface ReplacePreview {
  /** Blocks that will change. */
  count: number
  /** Changing blocks with block entity data that will be dropped (warn when > 0). */
  blockEntitiesDropped: number
  /** Changing blocks whose block entity data is kept (same block entity type). */
  blockEntitiesKept: number
  /** Estimated history memory the edit will use. */
  undoBytes: number
}

export interface ReplaceResult extends ReplacePreview {
  /** Per-region edits, already applied to the schematic; undo reverts them in reverse order. */
  edits: Edit[]
  changes: RegionChange[]
}

/** Delete = replace with air (spec §9.1). */
export function deleteRule(from: readonly Matcher[]): ReplaceRule {
  return { from, to: { name: 'minecraft:air' } }
}

interface RegionPlan {
  regionId: number
  scope: RegionScope
  /** New state per palette slot, or null when the slot does not change. */
  targets: (BlockState | null)[]
  /** Slots with at least one changing block in scope, ascending. */
  changingSlots: number[]
  count: number
  /** Block indices whose block entity will be dropped. */
  dropTileEntities: number[]
  keptTileEntities: number
  /**
   * Kept block entities whose id must be rewritten (chest ↔ trapped chest):
   * index → a copy of the original with `id` already rewritten. The
   * original stays reachable through `region.tileEntities` until apply time.
   */
  rewriteTileEntities: Map<number, NbtCompound>
  /** Blocks path: states appended to the palette, and old slot → new slot (-1 = unchanged). */
  appended: BlockState[]
  slotMap: Int32Array
  undoBytes: number
}

function slotTargets(region: Region, rules: readonly ReplaceRule[], registry: BlockRegistry): (BlockState | null)[] {
  return region.palette.map((state) => {
    const rule = rules.find((r) => matchesAny(r.from, state))
    if (!rule) return null
    const target = carryOver(state, rule.to, registry)
    return blockStateKey(target) === blockStateKey(state) ? null : target
  })
}

function planRegion(
  region: Region, scope: RegionScope, rules: readonly ReplaceRule[], registry: BlockRegistry,
): RegionPlan | null {
  const targets = slotTargets(region, rules, registry)
  if (targets.every((t) => t === null)) return null
  const counts = paletteCounts(region, scope)
  const changingSlots: number[] = []
  let count = 0
  targets.forEach((t, slot) => {
    if (t && counts[slot]! > 0) {
      changingSlots.push(slot)
      count += counts[slot]!
    }
  })
  if (count === 0) return null

  const dropTileEntities: number[] = []
  const rewriteTileEntities = new Map<number, NbtCompound>()
  let keptTileEntities = 0
  let undoBytes = 64
  for (const [index, te] of region.tileEntities) {
    const slot = region.blocks[index]!
    const target = targets[slot]
    if (!target || !(scope.whole || indexInScope(region.size, scope, index))) continue
    const fromName = region.palette[slot]!.name
    if (keepsBlockEntity(fromName, target.name)) {
      keptTileEntities++
      const fromId = blockEntityId(fromName)
      const toId = blockEntityId(target.name)
      if (fromId !== undefined && toId !== undefined && fromId !== toId) {
        const copy = NbtCompound.fromJson(te.toJson()).set('id', new NbtString(toId))
        rewriteTileEntities.set(index, copy)
        undoBytes += tileEntityBytes(te) + tileEntityBytes(copy)
      }
    } else {
      dropTileEntities.push(index)
      undoBytes += tileEntityBytes(te)
    }
  }

  const appended: BlockState[] = []
  const slotMap = new Int32Array(region.palette.length).fill(-1)
  if (scope.whole) {
    undoBytes += changingSlots.length * (8 + 2 * STATE_BYTES)
  } else {
    const slotByKey = new Map<string, number>()
    region.palette.forEach((s, slot) => {
      const key = blockStateKey(s)
      if (!slotByKey.has(key)) slotByKey.set(key, slot)
    })
    for (const slot of changingSlots) {
      const target = targets[slot]!
      const key = blockStateKey(target)
      let newSlot = slotByKey.get(key)
      if (newSlot === undefined) {
        newSlot = region.palette.length + appended.length
        appended.push(target)
        slotByKey.set(key, newSlot)
      }
      slotMap[slot] = newSlot
    }
    const valueBytes = region.palette.length + appended.length > 65536 ? 4 : 2
    undoBytes += count * (4 + valueBytes) + appended.length * STATE_BYTES
  }
  return {
    regionId: scope.regionId, scope, targets, changingSlots, count,
    dropTileEntities, rewriteTileEntities, keptTileEntities, appended, slotMap, undoBytes,
  }
}

function plan(
  schematic: Schematic, rules: readonly ReplaceRule[], scopes: readonly Scope[], registry: BlockRegistry,
): RegionPlan[] {
  for (const rule of rules) validateTarget(rule.to, registry)
  const plans: RegionPlan[] = []
  for (const scope of resolveScopes(schematic, scopes)) {
    const p = planRegion(schematic.regions[scope.regionId]!, scope, rules, registry)
    if (p) plans.push(p)
  }
  return plans
}

function summarize(plans: RegionPlan[]): ReplacePreview {
  return {
    count: plans.reduce((n, p) => n + p.count, 0),
    blockEntitiesDropped: plans.reduce((n, p) => n + p.dropTileEntities.length, 0),
    blockEntitiesKept: plans.reduce((n, p) => n + p.keptTileEntities, 0),
    undoBytes: plans.reduce((n, p) => n + p.undoBytes, 0),
  }
}

/** "N blocks will change" plus block entity warnings, without touching the schematic. */
export function previewReplace(
  schematic: Schematic, rules: readonly ReplaceRule[], scopes: readonly Scope[], registry: BlockRegistry,
): ReplacePreview {
  return summarize(plan(schematic, rules, scopes, registry))
}

/**
 * Apply a replace in place. Within one call the first rule whose matchers
 * match a block wins, and every block is rewritten at most once, so rules
 * never chain (A→B, B→C does not turn A into C). Whole-region scopes
 * rewrite palette slots; partial scopes rewrite block indices. Throws
 * EditError for invalid targets before changing anything.
 */
export function applyReplace(
  schematic: Schematic, rules: readonly ReplaceRule[], scopes: readonly Scope[], registry: BlockRegistry,
): ReplaceResult {
  const plans = plan(schematic, rules, scopes, registry)
  const edits: Edit[] = []
  const changes: RegionChange[] = []
  for (const p of plans) {
    const region = schematic.regions[p.regionId]!
    const removedTileEntities = new Map<number, NbtCompound>()
    for (const index of p.dropTileEntities) {
      removedTileEntities.set(index, region.tileEntities.get(index)!)
      region.tileEntities.delete(index)
    }
    const addedTileEntities = p.rewriteTileEntities
    for (const [index, copy] of addedTileEntities) {
      removedTileEntities.set(index, region.tileEntities.get(index)!)
      region.tileEntities.set(index, copy)
    }
    if (p.scope.whole) {
      const edit: PaletteEdit = {
        kind: 'palette',
        regionId: p.regionId,
        slots: p.changingSlots,
        before: p.changingSlots.map((s) => region.palette[s]!),
        after: p.changingSlots.map((s) => p.targets[s]!),
        removedTileEntities,
        addedTileEntities,
      }
      edit.slots.forEach((slot, k) => { region.palette[slot] = edit.after[k]! })
      edits.push(edit)
      changes.push({ regionId: p.regionId, paletteChange: { slots: [...edit.slots] } })
    } else {
      const paletteLength = region.palette.length
      region.palette.push(...p.appended)
      if (region.palette.length > 65536 && region.blocks instanceof Uint16Array) {
        region.blocks = Uint32Array.from(region.blocks)
      }
      const { blocks } = region
      const indices = new Uint32Array(p.count)
      const values = createBlockArray(p.count, region.palette.length)
      const dirty = new DirtyChunks(region.size)
      let k = 0
      forEachIndexInScope(region.size, p.scope, (index) => {
        const old = blocks[index]!
        const next = old < paletteLength ? p.slotMap[old]! : -1
        if (next < 0) return
        indices[k] = index
        values[k] = old
        blocks[index] = next
        dirty.markIndex(index)
        k++
      })
      const edit: BlocksEdit = {
        kind: 'blocks', regionId: p.regionId, indices, values,
        paletteLength, paletteAdded: p.appended, removedTileEntities, addedTileEntities,
      }
      edits.push(edit)
      changes.push({ regionId: p.regionId, dirtyChunks: dirty.list() })
    }
  }
  return { ...summarize(plans), edits, changes }
}

/** Blocks in scope matching any of `matchers` (e.g. for the family swap's unmapped list). */
export function countMatching(schematic: Schematic, matchers: readonly Matcher[], scopes: readonly Scope[]): number {
  let total = 0
  for (const scope of resolveScopes(schematic, scopes)) {
    const region = schematic.regions[scope.regionId]!
    const matched = region.palette.map((s) => matchesAny(matchers, s))
    if (!matched.some(Boolean)) continue
    const counts = paletteCounts(region, scope)
    matched.forEach((m, slot) => { if (m) total += counts[slot]! })
  }
  return total
}
