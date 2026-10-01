import { describe, expect, it } from 'vitest'
import { bitsForPalette, longCount, packBits, unpackBits } from '../../../src/core/litematic/bits'

// Direct transcription of Litematica's LitematicaBitArray.getAt over signed
// 64-bit longs. Used as an independent oracle for the 32-bit word version.
function litematicaGetAt(longs: bigint[], bits: number, index: number): number {
  const mask = (1n << BigInt(bits)) - 1n
  const startOffset = index * bits
  const startArrIndex = startOffset >> 6
  const endArrIndex = ((index + 1) * bits - 1) >> 6
  const startBitOffset = BigInt(startOffset & 0x3f)
  const u = (x: bigint) => BigInt.asUintN(64, x)
  if (startArrIndex === endArrIndex) {
    return Number((u(longs[startArrIndex]!) >> startBitOffset) & mask)
  }
  const endOffset = 64n - startBitOffset
  return Number(((u(longs[startArrIndex]!) >> startBitOffset) | (u(longs[endArrIndex]!) << endOffset)) & mask)
}

function wordsToLongs(words: Uint32Array): bigint[] {
  const longs: bigint[] = []
  for (let k = 0; k < words.length; k += 2) {
    longs.push(BigInt.asIntN(64, (BigInt(words[k + 1]!) << 32n) | BigInt(words[k]!)))
  }
  return longs
}

describe('bitsForPalette', () => {
  it.each([
    [1, 2], [2, 2], [3, 2], [4, 2], [5, 3], [8, 3], [9, 4], [16, 4], [17, 5],
    [256, 8], [257, 9], [65536, 16], [65537, 17],
  ])('palette of %i needs %i bits', (size, bits) => {
    expect(bitsForPalette(size)).toBe(bits)
  })
})

describe('longCount', () => {
  it('rounds partial longs up', () => {
    expect(longCount(32, 2)).toBe(1)
    expect(longCount(33, 2)).toBe(2)
    expect(longCount(13, 5)).toBe(2)
  })
})

describe('packBits', () => {
  it('packs 2-bit values LSB first into the low word', () => {
    const words = packBits(Uint16Array.from([1, 2, 3, 0]), 2)
    expect(words.length).toBe(2)
    expect(words[0]).toBe(0b00_11_10_01)
    expect(words[1]).toBe(0)
  })

  it('matches Litematica getAt for values spanning two longs', () => {
    // 5 bits: entry 12 occupies bits 60..64, crossing into long 1.
    const values = Uint16Array.from({ length: 30 }, (_, i) => (i * 7 + 3) % 32)
    const longs = wordsToLongs(packBits(values, 5))
    for (let i = 0; i < values.length; i++) {
      expect(litematicaGetAt(longs, 5, i)).toBe(values[i])
    }
  })

  it('matches Litematica getAt for 17-bit values', () => {
    const values = Uint32Array.from({ length: 200 }, (_, i) => (i * 104729) % 131072)
    const longs = wordsToLongs(packBits(values, 17))
    for (let i = 0; i < values.length; i++) {
      expect(litematicaGetAt(longs, 17, i)).toBe(values[i])
    }
  })
})

describe('unpackBits', () => {
  it.each([2, 3, 5, 7, 12, 16, 17, 24])('round-trips %i-bit values', (bits) => {
    const max = 2 ** bits
    const values = Uint32Array.from({ length: 1000 }, (_, i) => (i * 2654435761) % max)
    const out = new Uint32Array(values.length)
    unpackBits(packBits(values, bits), values.length, bits, out)
    expect(out).toEqual(values)
  })

  it('ignores trailing longs beyond the needed count', () => {
    const words = new Uint32Array(8)
    words.set(packBits(Uint16Array.from([3, 1]), 2))
    const out = new Uint16Array(2)
    unpackBits(words, 2, 2, out)
    expect(Array.from(out)).toEqual([3, 1])
  })

  it('rejects packed data shorter than the volume needs', () => {
    expect(() => unpackBits(new Uint32Array(2), 33, 2, new Uint16Array(33))).toThrow(RangeError)
  })
})
