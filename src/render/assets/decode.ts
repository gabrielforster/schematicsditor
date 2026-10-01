import type { AtlasImage } from './atlas'

/** Decodes a PNG to straight (not premultiplied) RGBA in the browser. */
export async function decodeImage(blob: Blob): Promise<AtlasImage> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}
