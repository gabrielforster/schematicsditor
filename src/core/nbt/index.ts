import { NbtCompound, NbtFile, NbtLongArray } from 'deepslate/nbt'
import { PackedLongArray, registerPackedLongArray } from './packedLongArray'

export { PackedLongArray } from './packedLongArray'

registerPackedLongArray()

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

/** Serialize a root compound as uncompressed NBT with an empty root name. */
export function encodeNbt(root: NbtCompound): Uint8Array {
  const file = NbtFile.create({ compression: 'none' })
  file.root = root
  return file.write()
}

const hasStreams = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b

/**
 * `writeNbt` with the platform's native gzip (`CompressionStream`), which
 * is several times faster than deepslate's bundled pako. Falls back to
 * `writeNbt` where the API is missing.
 */
export async function writeNbtAsync(root: NbtCompound): Promise<Uint8Array> {
  if (!hasStreams()) return writeNbt(root)
  return pipe(encodeNbt(root), new CompressionStream('gzip'))
}

/**
 * `readNbt` with native gunzip (`DecompressionStream`) for gzip input.
 * Anything else, or gzip the native decoder rejects, goes through
 * `readNbt`, so the result and the errors match it.
 */
export async function readNbtAsync(bytes: Uint8Array): Promise<NbtCompound> {
  if (!hasStreams() || !isGzip(bytes)) return readNbt(bytes)
  let raw: Uint8Array
  try {
    raw = await pipe(bytes, new DecompressionStream('gzip'))
  } catch {
    return readNbt(bytes)
  }
  return readNbt(raw)
}

/** Long array → 32-bit words, low half of each long first (see litematic/bits.ts). */
export function longArrayToWords(array: NbtLongArray): Uint32Array {
  if (array instanceof PackedLongArray) return array.words
  const items = array.getItems()
  const words = new Uint32Array(items.length * 2)
  for (let k = 0; k < items.length; k++) {
    const [hi, lo] = items[k]!.getAsPair()
    words[2 * k] = lo >>> 0
    words[2 * k + 1] = hi >>> 0
  }
  return words
}

/** 32-bit words → a long array that keeps them packed (no per-long objects). */
export function wordsToLongArray(words: Uint32Array): NbtLongArray {
  return new PackedLongArray(words)
}
