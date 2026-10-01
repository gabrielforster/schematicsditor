// Builds chunk slices for mesher tests without going through a region.
import type { ChunkSlice } from '../../src/render/mesh/types'
import { paddedIndex } from '../../src/render/mesh/types'

/**
 * A slice of the given inner size. `block(x, y, z)` returns a state key or
 * null for air, for inner cells and the 1-block border (coordinates -1 and
 * size); by default the border is air.
 */
export function makeSlice(
  size: [number, number, number],
  block: (x: number, y: number, z: number) => string | null,
  options: { border?: boolean; faded?: (key: string) => boolean } = {},
): ChunkSlice {
  const [sx, sy, sz] = size
  const s = { x: sx, y: sy, z: sz }
  const states = ['minecraft:air']
  const ids = new Map<string, number>([['minecraft:air', 0]])
  const cells = new Uint16Array((sx + 2) * (sy + 2) * (sz + 2))
  for (let y = -1; y <= sy; y++) {
    for (let z = -1; z <= sz; z++) {
      for (let x = -1; x <= sx; x++) {
        const inner = x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz
        if (!inner && !options.border) continue
        const key = block(x, y, z)
        if (key === null) continue
        let id = ids.get(key)
        if (id === undefined) {
          id = states.length
          ids.set(key, id)
          states.push(key)
        }
        cells[paddedIndex(s, x, y, z)] = id
      }
    }
  }
  const faded = options.faded ? Uint8Array.from(states, (k, i) => (i > 0 && options.faded!(k) ? 1 : 0)) : null
  return { size: s, cells, states, faded }
}
