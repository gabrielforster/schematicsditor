import { bundledRegistry } from '../registry'
import data from './families.json'
import { loadFamilies, type FamilyGroup } from './families'

let cached: FamilyGroup[] | undefined

/** The curated families, validated against the bundled block registry. */
export function bundledFamilies(): FamilyGroup[] {
  cached ??= loadFamilies(data, bundledRegistry())
  return cached
}

/** The curated family JSON, for validating against another registry (`loadFamilies(..., { strict: false })`). */
export const FAMILY_DATA: unknown = data
