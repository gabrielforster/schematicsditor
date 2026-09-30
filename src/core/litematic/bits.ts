// Litematica packs palette indices LSB-first into a stream of 64-bit longs,
// letting a value span two longs. We hold that stream as 32-bit words:
// words[2k] is the low half of long k, words[2k + 1] the high half. Seen
// this way the stream is one continuous little-endian bitstream.

export type BlockArray = Uint16Array | Uint32Array

/** Litematica: max(2, bits needed to store paletteSize - 1). */
export function bitsForPalette(paletteSize: number): number {
  const needed = paletteSize <= 1 ? 0 : 32 - Math.clz32(paletteSize - 1)
  return Math.max(2, needed)
}

/** Number of 64-bit longs Litematica writes for `volume` entries. */
export function longCount(volume: number, bits: number): number {
  return Math.ceil((volume * bits) / 64)
}

function maskFor(bits: number): number {
  return bits >= 32 ? 0xffffffff : (1 << bits) - 1
}

export function unpackBits(words: Uint32Array, volume: number, bits: number, out: BlockArray): void {
  if (words.length < longCount(volume, bits) * 2) {
    throw new RangeError(`packed data too short: ${words.length / 2} longs for ${volume} entries at ${bits} bits`)
  }
  const mask = maskFor(bits)
  for (let i = 0; i < volume; i++) {
    const bit = i * bits
    const w = Math.floor(bit / 32)
    const off = bit % 32
    let v = words[w]! >>> off
    if (off + bits > 32) v |= words[w + 1]! << (32 - off)
    out[i] = (v & mask) >>> 0
  }
}

export function packBits(values: BlockArray, bits: number): Uint32Array {
  const words = new Uint32Array(longCount(values.length, bits) * 2)
  const mask = maskFor(bits)
  for (let i = 0; i < values.length; i++) {
    const v = (values[i]! & mask) >>> 0
    const bit = i * bits
    const w = Math.floor(bit / 32)
    const off = bit % 32
    words[w] = (words[w]! | (v << off)) >>> 0
    if (off + bits > 32) words[w + 1] = (words[w + 1]! | (v >>> (32 - off))) >>> 0
  }
  return words
}
