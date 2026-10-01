import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtFile, NbtLong, NbtLongArray } from 'deepslate/nbt'
import { PackedLongArray, readNbt, writeNbt } from '../../../src/core/nbt'

const LONGS = [0n, -1n, 0x7fffffffffffffffn, -0x8000000000000000n, 0x0000000100000002n]
// Low word first, then high word, per long.
const WORDS = Uint32Array.from([0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0x7fffffff, 0, 0x80000000, 2, 1])

describe('PackedLongArray', () => {
  it('writes the same bytes as a deepslate NbtLongArray', () => {
    const encode = (tag: NbtLongArray) => {
      const file = NbtFile.create()
      file.root = new NbtCompound().set('L', tag)
      return file.write()
    }
    expect(encode(new PackedLongArray(WORDS))).toEqual(encode(new NbtLongArray(LONGS)))
  })

  it('is what deepslate parses long arrays into, with the words in place', () => {
    const tag = readNbt(writeNbt(new NbtCompound().set('L', new NbtLongArray(LONGS)))).get('L')
    expect(tag).toBeInstanceOf(PackedLongArray)
    expect(Array.from((tag as PackedLongArray).words)).toEqual(Array.from(WORDS))
  })

  it('answers deepslate list methods with NbtLong items', () => {
    const tag = new PackedLongArray(WORDS)
    expect(tag.length).toBe(5)
    expect(tag.getItems().map((l) => l.toBigInt())).toEqual(LONGS)
    expect(tag.get(1)?.toBigInt()).toBe(-1n)
    expect(tag.toJson()).toEqual(new NbtLongArray(LONGS).toJson())
  })

  it('equals a deepslate NbtLongArray with the same longs, both ways', () => {
    const packed = new PackedLongArray(WORDS)
    const plain = new NbtLongArray(LONGS)
    expect(packed.equals(plain)).toBe(true)
    expect(plain.equals(packed)).toBe(true)
    expect(packed.equals(new PackedLongArray(WORDS.slice()))).toBe(true)
    expect(packed.equals(new NbtLongArray(LONGS.slice(1)))).toBe(false)
  })

  it('keeps words in step with mutations through list methods', () => {
    const tag = new PackedLongArray(Uint32Array.from([1, 0]))
    tag.add(new NbtLong(5n))
    expect(tag.length).toBe(2)
    expect(Array.from(tag.words)).toEqual([1, 0, 5, 0])
    tag.clear()
    expect(tag.length).toBe(0)
    expect(tag.words.length).toBe(0)
  })

  it('survives fromJson as a packed array', () => {
    const tag = NbtCompound.fromJson(new NbtCompound().set('L', new NbtLongArray(LONGS)).toJson()).get('L')
    expect(tag).toBeInstanceOf(PackedLongArray)
    expect(Array.from((tag as PackedLongArray).words)).toEqual(Array.from(WORDS))
  })
})
