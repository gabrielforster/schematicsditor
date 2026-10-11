/** Normalized atlas rectangle: [u0, v0, u1, v1], v measured from the top of the image. */
export type UV = [number, number, number, number]

/** Every pixel fully opaque. */
export const TEX_OPAQUE = 0
/** Only fully opaque or fully transparent pixels (glass, leaves): drawn with alpha test. */
export const TEX_CUTOUT = 1
/** Some partly transparent pixels (stained glass, ice, water): drawn in the transparent pass. */
export const TEX_TRANSLUCENT = 2
export type TextureAlpha = typeof TEX_OPAQUE | typeof TEX_CUTOUT | typeof TEX_TRANSLUCENT

export interface TextureInfo {
  /** First animation frame only. */
  uv: UV
  alpha: TextureAlpha
  /** Average 0xRRGGBB over pixels that are not fully transparent. */
  color: number
}

export interface AtlasImage {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, rows top to bottom. */
  data: Uint8Array | Uint8ClampedArray
}

/** mcmeta's atlas `data.min.json`: texture id (`block/stone`) → [x, y, width, height] in pixels. */
export type AtlasRects = Record<string, readonly number[]>

export interface PreparedAtlas {
  /** The atlas with a 16-pixel white strip appended at the bottom. */
  image: AtlasImage
  textures: Record<string, TextureInfo>
  /** A white tile, for untextured faces (unknown blocks' magenta cubes). */
  white: UV
}

const WHITE_STRIP = 16

/**
 * Analyzes every texture in mcmeta's atlas (alpha class, average color) and
 * appends a white tile. Animated textures are stored as vertical strips;
 * only the first (square) frame is used.
 */
export function prepareAtlas(atlas: AtlasImage, rects: AtlasRects): PreparedAtlas {
  const width = atlas.width
  const height = atlas.height + WHITE_STRIP
  const data = new Uint8Array(width * height * 4)
  data.set(atlas.data)
  data.fill(255, atlas.width * atlas.height * 4)
  const textures: Record<string, TextureInfo> = {}
  for (const [id, rect] of Object.entries(rects)) {
    const [x = 0, y = 0, w = 0, fullH = 0] = rect
    const h = Math.min(w, fullH)
    textures[id] = {
      uv: [x / width, y / height, (x + w) / width, (y + h) / height],
      ...analyzePixels(atlas, x, y, w, h),
    }
  }
  return {
    image: { width, height, data },
    textures,
    white: [0, atlas.height / height, WHITE_STRIP / width, 1],
  }
}

function analyzePixels(atlas: AtlasImage, x0: number, y0: number, w: number, h: number): { alpha: TextureAlpha; color: number } {
  let r = 0, g = 0, b = 0, n = 0
  let alpha: TextureAlpha = TEX_OPAQUE
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const p = (y * atlas.width + x) * 4
      const a = atlas.data[p + 3]!
      if (a === 0) {
        if (alpha === TEX_OPAQUE) alpha = TEX_CUTOUT
        continue
      }
      if (a < 255) alpha = TEX_TRANSLUCENT
      r += atlas.data[p]!
      g += atlas.data[p + 1]!
      b += atlas.data[p + 2]!
      n++
    }
  }
  if (n === 0) return { alpha, color: 0 }
  return { alpha, color: (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n) }
}
