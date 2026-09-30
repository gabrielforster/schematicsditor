import { NbtCompound, NbtFile, NbtLongArray, type NbtLongPair } from 'deepslate/nbt'

export class NbtReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NbtReadError'
  }
}

/** Parse NBT bytes (gzip, zlib or uncompressed) and return the root compound. */
export function readNbt(bytes: Uint8Array): NbtCompound {
  try {
    return NbtFile.read(bytes).root
  } catch (cause) {
    throw new NbtReadError(cause instanceof Error ? cause.message : String(cause), { cause })
  }
}

/** Serialize a root compound as gzip-compressed NBT with an empty root name. */
export function writeNbt(root: NbtCompound): Uint8Array {
  const file = NbtFile.create({ compression: 'gzip' })
  file.root = root
  return file.write()
}

/** Long array → 32-bit words, low half of each long first (see litematic/bits.ts). */
export function longArrayToWords(array: NbtLongArray): Uint32Array {
  const items = array.getItems()
  const words = new Uint32Array(items.length * 2)
  for (let k = 0; k < items.length; k++) {
    const [hi, lo] = items[k]!.getAsPair()
    words[2 * k] = lo >>> 0
    words[2 * k + 1] = hi >>> 0
  }
  return words
}

export function wordsToLongArray(words: Uint32Array): NbtLongArray {
  const pairs: NbtLongPair[] = new Array(words.length / 2)
  for (let k = 0; k < pairs.length; k++) {
    pairs[k] = [words[2 * k + 1]! | 0, words[2 * k]! | 0]
  }
  return new NbtLongArray(pairs)
}
