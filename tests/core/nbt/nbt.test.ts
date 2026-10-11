import { describe, expect, it } from 'vitest'
import { NbtCompound, NbtFile, NbtLongArray, NbtString } from 'deepslate/nbt'
import { encodeNbt, longArrayToWords, NbtReadError, readNbt, readNbtAsync, wordsToLongArray, writeNbt, writeNbtAsync } from '../../../src/core/nbt'

describe('writeNbt / readNbt', () => {
  it('writes gzip', () => {
    const bytes = writeNbt(new NbtCompound())
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b])
  })

  it('round-trips a compound', () => {
    const root = new NbtCompound().set('Name', new NbtString('héllo ✓'))
    expect(readNbt(writeNbt(root)).getString('Name')).toBe('héllo ✓')
  })

  it('wraps parse failures in NbtReadError', () => {
    expect(() => readNbt(new Uint8Array([1, 2, 3]))).toThrow(NbtReadError)
  })

  it('reads zlib-compressed NBT', () => {
    const file = NbtFile.create({ compression: 'zlib' })
    file.root = new NbtCompound().set('Name', new NbtString('x'))
    const bytes = file.write()
    expect(readNbt(bytes).getString('Name')).toBe('x')
  })

  it('reads uncompressed NBT', () => {
    const file = NbtFile.create({ compression: 'none' })
    file.root = new NbtCompound().set('Name', new NbtString('x'))
    const bytes = file.write()
    expect(readNbt(bytes).getString('Name')).toBe('x')
  })
})

describe('longArrayToWords', () => {
  it('splits each long into low then high 32-bit words', () => {
    const words = longArrayToWords(new NbtLongArray([0x0000000100000002n, -1n]))
    expect(Array.from(words)).toEqual([2, 1, 0xffffffff, 0xffffffff])
  })
})

describe('wordsToLongArray', () => {
  it('is the inverse of longArrayToWords', () => {
    const longs = [0n, -1n, 0x7fffffffffffffffn, -0x8000000000000000n, 0x123456789abcdefn]
    const array = wordsToLongArray(longArrayToWords(new NbtLongArray(longs)))
    expect(array.getItems().map((l) => l.toBigInt())).toEqual(longs)
  })
})

describe('writeNbtAsync / readNbtAsync', () => {
  it('writes gzip that readNbt reads', async () => {
    const root = new NbtCompound().set('Name', new NbtString('héllo ✓'))
    const bytes = await writeNbtAsync(root)
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b])
    expect(readNbt(bytes).getString('Name')).toBe('héllo ✓')
  })

  it('reads gzip, zlib and uncompressed NBT', async () => {
    const root = new NbtCompound().set('Name', new NbtString('x'))
    for (const compression of ['gzip', 'zlib', 'none'] as const) {
      const file = NbtFile.create({ compression })
      file.root = root
      expect((await readNbtAsync(file.write())).getString('Name')).toBe('x')
    }
  })

  it('rejects bad input with NbtReadError, including truncated gzip', async () => {
    await expect(readNbtAsync(new Uint8Array([1, 2, 3]))).rejects.toThrow(NbtReadError)
    const gz = writeNbt(new NbtCompound().set('Name', new NbtString('x')))
    await expect(readNbtAsync(gz.slice(0, gz.length - 6))).rejects.toThrow(NbtReadError)
  })

  it('encodeNbt writes the uncompressed bytes', () => {
    const root = new NbtCompound().set('Name', new NbtString('x'))
    expect(readNbt(encodeNbt(root)).getString('Name')).toBe('x')
    expect(encodeNbt(root)[0]).toBe(0x0a)
  })
})
