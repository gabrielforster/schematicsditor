import { NbtLong, NbtLongArray, NbtTag, NbtType, type DataInput, type DataOutput } from 'deepslate/nbt'

function wordsToItems(words: Uint32Array): NbtLong[] {
  const items: NbtLong[] = new Array(words.length / 2)
  for (let k = 0; k < items.length; k++) items[k] = new NbtLong([words[2 * k + 1]! | 0, words[2 * k]! | 0])
  return items
}

function itemsToWords(items: readonly NbtLong[]): Uint32Array {
  const words = new Uint32Array(items.length * 2)
  for (let k = 0; k < items.length; k++) {
    const [hi, lo] = items[k]!.getAsPair()
    words[2 * k] = lo >>> 0
    words[2 * k + 1] = hi >>> 0
  }
  return words
}

/**
 * An NBT long array backed by a Uint32Array instead of one NbtLong object
 * per long (about 105 bytes each in deepslate). `words[2k]` is the low and
 * `words[2k + 1]` the high half of long k, the layout of litematic/bits.ts.
 *
 * deepslate's list methods read the protected `items` field directly, so
 * `items` is an accessor here: it builds NbtLong objects only when such a
 * method runs, and any mutation through them marks `words` for a rebuild.
 * Registered as the long array reader by ./index.ts, so every parsed file
 * gets this class.
 */
export class PackedLongArray extends NbtLongArray {
  private packed: Uint32Array | null
  private objects: NbtLong[] | null = null

  constructor(words: Uint32Array = new Uint32Array(0)) {
    super()
    this.packed = words
    Object.defineProperty(this, 'items', {
      configurable: true,
      get: (): NbtLong[] => (this.objects ??= wordsToItems(this.packed!)),
      set: (items: NbtLong[]) => {
        this.objects = items
        this.packed = null
      },
    })
  }

  // Invariant: when `packed` is not null it is authoritative and `objects`,
  // if built, is a cache of it; when it is null, `objects` is authoritative.

  /** The packed words. Shared, not copied: treat it as read-only. */
  get words(): Uint32Array {
    this.packed ??= itemsToWords(this.objects!)
    return this.packed
  }

  override get length(): number {
    return this.packed !== null ? this.packed.length / 2 : this.objects!.length
  }

  override set(index: number, tag: NbtLong): void {
    super.set(index, tag)
    this.packed = null
  }

  override add(tag: NbtLong): void {
    super.add(tag)
    this.packed = null
  }

  override insert(index: number, tag: NbtLong): void {
    super.insert(index, tag)
    this.packed = null
  }

  override delete(index: number): void {
    super.delete(index)
    this.packed = null
  }

  override equals(other: NbtTag): boolean {
    if (!(other instanceof PackedLongArray)) return super.equals(other)
    const a = this.words, b = other.words
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  override toBytes(output: DataOutput): void {
    const words = this.words
    output.writeInt(words.length / 2)
    for (let k = 0; k < words.length; k += 2) {
      output.writeInt(words[k + 1]! | 0)
      output.writeInt(words[k]! | 0)
    }
  }

  static override create(): PackedLongArray {
    return new PackedLongArray()
  }

  static override fromJson(value: Parameters<typeof NbtLongArray.fromJson>[0]): PackedLongArray {
    const plain = NbtLongArray.fromJson(value)
    return new PackedLongArray(itemsToWords(plain.getItems()))
  }

  static override fromBytes(input: DataInput): PackedLongArray {
    const length = input.readInt()
    const words = new Uint32Array(length * 2)
    for (let k = 0; k < words.length; k += 2) {
      words[k + 1] = input.readInt() >>> 0
      words[k] = input.readInt() >>> 0
    }
    return new PackedLongArray(words)
  }
}

/** Make deepslate build PackedLongArray for every long array it parses. */
export function registerPackedLongArray(): void {
  NbtTag.register(NbtType.LongArray, PackedLongArray as unknown as Parameters<typeof NbtTag.register>[1])
}
