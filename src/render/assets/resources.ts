import { BlockState, Identifier } from 'deepslate/core'
import { BlockDefinition, BlockModel, SpecialRenderers, type Cull, type Mesh } from 'deepslate/render'
import { DIRECTIONS, faceShade } from '../mesh/faces'
import { FULL_CUBE, INVISIBLE, MAGENTA, OPAQUE, TRANSLUCENT, UNKNOWN, type SlotAppearance } from '../mesh/types'
import { TEX_OPAQUE, TEX_TRANSLUCENT, type TextureInfo, type UV } from './atlas'

/**
 * Everything the textured mesher needs, in a form that survives
 * `postMessage` cheaply: mcmeta's block definitions and models as JSON
 * text, plus the analyzed atlas.
 */
export interface TexturedAssets {
  /** Minecraft version id the assets came from, e.g. `26.3`. */
  version: string
  /** mcmeta `summary/assets/block_definition/data.min.json` text: block name → blockstate JSON. */
  blockDefinitionsJson: string
  /** mcmeta `summary/assets/model/data.min.json` text: model id → model JSON. */
  modelsJson: string
  textures: Record<string, TextureInfo>
  white: UV
}

/** A block state's quads for one cull mask, in block-local units (0..1). */
export interface BakedQuads {
  count: number
  /** 12 floats per quad: 4 corners, counter-clockwise from outside. */
  positions: Float32Array
  /** 8 floats per quad. */
  uvs: Float32Array
  /** 3 floats per quad: tint × directional shade, 0..1. */
  colors: Float32Array
  /** 1 per quad whose texture is translucent. */
  translucent: Uint8Array
}

/** `StateAnalysis.color` when none of the state's textures is in the atlas. */
export const NO_COLOR = -1

/**
 * Render facts for one state, plus whether any of its textures has
 * transparent pixels. `color` is the tinted average of its face textures,
 * or NO_COLOR.
 */
export interface StateAnalysis extends SlotAppearance {
  seeThrough: boolean
}

/** Stands in for textures the atlas lacks: drawn on the white tile, left out of color averages. */
const MISSING_TEXTURE: TextureInfo = { uv: [0, 0, 0, 0], alpha: TEX_OPAQUE, color: 0 }
const UNKNOWN_ANALYSIS: StateAnalysis = { flags: UNKNOWN | OPAQUE | FULL_CUBE, color: MAGENTA, seeThrough: false }
const EPS = 1e-4

/** Splits `name[k=v,...]` without validating; render code must not throw on odd names from files. */
export function splitStateKey(key: string): { name: string; properties: Record<string, string> } {
  const open = key.indexOf('[')
  if (open === -1) return { name: key, properties: {} }
  const properties: Record<string, string> = {}
  for (const pair of key.slice(open + 1, key.endsWith(']') ? -1 : undefined).split(',')) {
    const eq = pair.indexOf('=')
    if (eq > 0) properties[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return { name: key.slice(0, open), properties }
}

/**
 * deepslate-backed block models for the textured mesher (spec §8.2). Bakes
 * each (state, cull mask) once and caches the result.
 */
export class TexturedResources {
  readonly version: string
  private readonly definitionsJson: Record<string, unknown>
  private readonly modelsJson: Record<string, unknown>
  private readonly definitions = new Map<string, BlockDefinition | null>()
  private readonly models = new Map<string, BlockModel | null>()
  private readonly baked = new Map<string, BakedQuads | null>()
  private readonly analyses = new Map<string, StateAnalysis>()
  private readonly textures: Record<string, TextureInfo>
  private readonly white: UV
  /** Texture ids requested by deepslate, in quad order, while baking. */
  private recorded: TextureInfo[] = []

  constructor(assets: TexturedAssets) {
    this.version = assets.version
    this.definitionsJson = JSON.parse(assets.blockDefinitionsJson) as Record<string, unknown>
    this.modelsJson = JSON.parse(assets.modelsJson) as Record<string, unknown>
    this.textures = assets.textures
    this.white = assets.white
  }

  /** The white atlas tile, for untextured faces. */
  get whiteUv(): UV {
    return this.white
  }

  appearance(stateKey: string): SlotAppearance {
    const { flags, color } = this.analyze(stateKey)
    return { flags, color }
  }

  /** Flags and average color of a state, from its geometry and textures. */
  analyze(stateKey: string): StateAnalysis {
    let a = this.analyses.get(stateKey)
    if (!a) {
      this.bake(stateKey, 0)
      a = this.analyses.get(stateKey) ?? UNKNOWN_ANALYSIS
    }
    return a
  }

  /**
   * The state's quads with the faces in `cullMask` (bits of `DIRECTIONS`)
   * removed, or null when the block has no definition (unknown block).
   */
  bake(stateKey: string, cullMask: number): BakedQuads | null {
    const cacheKey = `${cullMask}|${stateKey}`
    let quads = this.baked.get(cacheKey)
    if (quads === undefined) {
      quads = this.bakeUncached(stateKey, cullMask)
      this.baked.set(cacheKey, quads)
    }
    return quads
  }

  private bakeUncached(stateKey: string, cullMask: number): BakedQuads | null {
    const { name, properties } = splitStateKey(stateKey)
    const id = Identifier.parse(name)
    const definition = this.getDefinition(id)
    if (!definition) return null
    const cull: Cull = {}
    for (const d of DIRECTIONS) cull[d.name] = (cullMask & d.bit) !== 0
    this.recorded = []
    let mesh: Mesh
    try {
      mesh = definition.getMesh(id, properties, this.atlasProvider, this.modelProvider, cull)
      mesh.merge(SpecialRenderers.getBlockMesh(new BlockState(id, properties), undefined, this.atlasProvider, cull))
    } catch {
      return null // a definition pointing at a missing model: treat as unknown
    }
    // Properties no variant matches (a state from another version): flag it rather than draw nothing.
    if (mesh.quads.length === 0 && definition.getModelVariants(properties).length === 0) return null
    // deepslate asks for one texture per face, in quad order.
    const textures = this.recorded.length === mesh.quads.length ? this.recorded : null
    const count = mesh.quads.length
    const out: BakedQuads = {
      count,
      positions: new Float32Array(count * 12),
      uvs: new Float32Array(count * 8),
      colors: new Float32Array(count * 3),
      translucent: new Uint8Array(count),
    }
    let r = 0, g = 0, b = 0, textured = 0
    let flags = 0
    let seeThrough = false
    const covered = new Set<number>()
    const coveredOpaque = new Set<number>()
    mesh.quads.forEach((q, i) => {
      const vs = q.vertices()
      vs.forEach((v, k) => {
        out.positions.set([v.pos.x, v.pos.y, v.pos.z], i * 12 + k * 3)
        out.uvs.set(v.texture ?? [0, 0], i * 8 + k * 2)
      })
      const n = q.normal()
      const s = faceShade(n.x, n.y, n.z)
      const [tr = 1, tg = 1, tb = 1] = vs[0]!.color
      out.colors.set([tr * s, tg * s, tb * s], i * 3)
      const tex = textures?.[i]
      if (tex?.alpha === TEX_TRANSLUCENT) {
        out.translucent[i] = 1
        flags |= TRANSLUCENT
      }
      if (tex?.alpha !== TEX_OPAQUE) seeThrough = true
      if (tex && tex !== MISSING_TEXTURE) {
        r += ((tex.color >> 16) & 255) * tr
        g += ((tex.color >> 8) & 255) * tg
        b += (tex.color & 255) * tb
        textured++
      }
      const face = boundaryFace(out.positions, i * 12)
      if (face !== 0) {
        covered.add(face)
        if (tex?.alpha === TEX_OPAQUE) coveredOpaque.add(face)
      }
    })
    if (cullMask === 0) {
      const liquid = id.path === 'water' || id.path === 'lava'
      if (count === 0) flags |= INVISIBLE
      if (covered.size === 6 || liquid) flags |= FULL_CUBE
      if (coveredOpaque.size === 6 && !liquid) flags |= OPAQUE
      const avg = (v: number) => Math.min(255, Math.round(v / textured))
      const color = textured === 0 ? NO_COLOR : (avg(r) << 16) | (avg(g) << 8) | avg(b)
      this.analyses.set(stateKey, { flags, color, seeThrough })
    }
    return out
  }

  private getDefinition(id: Identifier): BlockDefinition | null {
    if (id.namespace !== 'minecraft') return null
    let d = this.definitions.get(id.path)
    if (d === undefined) {
      const json = this.definitionsJson[id.path]
      d = json === undefined ? null : BlockDefinition.fromJson(json)
      this.definitions.set(id.path, d)
    }
    return d
  }

  private readonly modelProvider = {
    getBlockModel: (id: Identifier): BlockModel | null => {
      const key = id.namespace === 'minecraft' ? id.path : id.toString()
      let m = this.models.get(key)
      if (m === undefined) {
        const json = this.modelsJson[key] ?? this.modelsJson[`minecraft:${key}`]
        m = json === undefined ? null : BlockModel.fromJson(json)
        this.models.set(key, m)
        m?.flatten(this.modelProvider)
      }
      return m
    },
  }

  private readonly atlasProvider = {
    getTextureAtlas: (): ImageData => {
      throw new Error('the atlas image lives on the main thread')
    },
    getTextureUV: (id: Identifier): UV => {
      const tex = this.textures[id.namespace === 'minecraft' ? id.path : id.toString()]
      this.recorded.push(tex ?? MISSING_TEXTURE)
      return tex ? tex.uv : this.white
    },
  }
}

/**
 * Which cube face a quad covers completely (a DIRECTIONS bit), or 0. A quad
 * covers a face when it lies on that face's plane and spans the full 0..1
 * square.
 */
function boundaryFace(p: Float32Array, o: number): number {
  for (let axis = 0; axis < 3; axis++) {
    const v = p[o + axis]!
    if (Math.abs(v) > EPS && Math.abs(v - 1) > EPS) continue
    let flat = true
    for (let k = 1; k < 4; k++) if (Math.abs(p[o + k * 3 + axis]! - v) > EPS) flat = false
    if (!flat) continue
    const others = [0, 1, 2].filter((a) => a !== axis)
    const full = others.every((a) => {
      let lo = Infinity, hi = -Infinity
      for (let k = 0; k < 4; k++) {
        lo = Math.min(lo, p[o + k * 3 + a]!)
        hi = Math.max(hi, p[o + k * 3 + a]!)
      }
      return lo <= EPS && hi >= 1 - EPS
    })
    if (!full) continue
    const positive = v > 0.5
    const d = DIRECTIONS.find((dir) => [dir.dx, dir.dy, dir.dz][axis] === (positive ? 1 : -1))!
    return d.bit
  }
  return 0
}
