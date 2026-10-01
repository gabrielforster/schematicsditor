// Writes the synthetic sample schematics (scripts/samples/samples.ts):
// the empty state's bundled sample and the round-trip fixtures in
// tests/fixtures/. Deterministic; rerun after changing a builder, then
// commit the .litematic files.
//
//   npm run generate:samples
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { encodeSample, SAMPLE_FILES } from './samples/samples'

const root = join(import.meta.dirname, '..')
for (const { path, build } of SAMPLE_FILES) {
  const bytes = encodeSample(build())
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), bytes)
  console.log(`${path}: ${bytes.length} bytes`)
}
