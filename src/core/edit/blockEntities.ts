// Spec §9.1: replaced blocks drop their block entity data unless the target
// has the same block entity type. Minecraft gives some families of blocks
// one shared type (all wood signs are `minecraft:sign`, all banners
// `minecraft:banner`); chest ↔ trapped chest is kept on purpose, since both
// hold the same inventory. Everything else must be the same block.

const KINDS: [kind: string, pattern: RegExp][] = [
  ['chest', /^minecraft:(trapped_)?chest$/],
  ['copper_chest', /^minecraft:(waxed_)?((exposed|weathered|oxidized)_)?copper_chest$/],
  ['copper_golem_statue', /^minecraft:(waxed_)?((exposed|weathered|oxidized)_)?copper_golem_statue$/],
  ['hanging_sign', /^minecraft:[a-z_]+_(wall_)?hanging_sign$/],
  ['sign', /^minecraft:[a-z_]+_(wall_)?sign$/],
  ['banner', /^minecraft:[a-z_]+_(wall_)?banner$/],
  ['bed', /^minecraft:[a-z_]+_bed$/],
  ['shulker_box', /^minecraft:([a-z_]+_)?shulker_box$/],
  ['shelf', /^minecraft:[a-z_]+_shelf$/],
  ['skull', /^minecraft:(skeleton|wither_skeleton)_(wall_)?skull$|^minecraft:(zombie|player|creeper|dragon|piglin)_(wall_)?head$/],
]

/** Blocks with equal kinds share a block entity type; other blocks are their own kind. */
export function blockEntityKind(name: string): string {
  for (const [kind, pattern] of KINDS) if (pattern.test(name)) return kind
  return name
}

/** Whether a block entity survives replacing block `from` with block `to`. */
export function keepsBlockEntity(from: string, to: string): boolean {
  return blockEntityKind(from) === blockEntityKind(to)
}
