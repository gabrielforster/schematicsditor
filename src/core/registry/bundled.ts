import bundled from './blocks.json'
import { BlockRegistry, type RegistryVersion } from './registry'

/** The Minecraft version the bundled snapshot was generated from. */
export const BUNDLED_VERSION: RegistryVersion = bundled.version

let cached: BlockRegistry | undefined

/** Registry over the bundled block snapshot (`scripts/generate-registry.mjs`). */
export function bundledRegistry(): BlockRegistry {
  cached ??= new BlockRegistry(bundled.blocks, bundled.version)
  return cached
}
