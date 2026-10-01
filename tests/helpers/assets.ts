// A tiny slice of real mcmeta 26.3 assets (block definitions and models
// copied verbatim, display transforms dropped) for textured mesher tests.
import { prepareAtlas, type AtlasRects } from '../../src/render/assets/atlas'
import type { TexturedAssets } from '../../src/render/assets/resources'

const cube = {
  elements: [{
    from: [0, 0, 0], to: [16, 16, 16],
    faces: {
      down: { texture: '#down', cullface: 'down' }, up: { texture: '#up', cullface: 'up' },
      north: { texture: '#north', cullface: 'north' }, south: { texture: '#south', cullface: 'south' },
      west: { texture: '#west', cullface: 'west' }, east: { texture: '#east', cullface: 'east' },
    },
  }],
}
const cubeAll = {
  parent: 'block/cube',
  textures: { particle: '#all', down: '#all', up: '#all', north: '#all', east: '#all', south: '#all', west: '#all' },
}
const stairs = {
  textures: { particle: '#side' },
  elements: [
    {
      from: [0, 0, 0], to: [16, 8, 16],
      faces: {
        down: { uv: [0, 0, 16, 16], texture: '#bottom', cullface: 'down' }, up: { uv: [0, 0, 16, 16], texture: '#top' },
        north: { uv: [0, 8, 16, 16], texture: '#side', cullface: 'north' }, south: { uv: [0, 8, 16, 16], texture: '#side', cullface: 'south' },
        west: { uv: [0, 8, 16, 16], texture: '#side', cullface: 'west' }, east: { uv: [0, 8, 16, 16], texture: '#side', cullface: 'east' },
      },
    },
    {
      from: [8, 8, 0], to: [16, 16, 16],
      faces: {
        up: { uv: [8, 0, 16, 16], texture: '#top', cullface: 'up' }, north: { uv: [0, 0, 8, 8], texture: '#side', cullface: 'north' },
        south: { uv: [8, 0, 16, 8], texture: '#side', cullface: 'south' }, west: { uv: [0, 0, 16, 8], texture: '#side' },
        east: { uv: [0, 0, 16, 8], texture: '#side', cullface: 'east' },
      },
    },
  ],
}
const torch = {
  textures: { particle: '#torch' },
  elements: [{
    from: [7, 0, 7], to: [9, 10, 9],
    faces: {
      down: { uv: [7, 13, 9, 15], texture: '#torch', cullface: 'down' }, up: { uv: [7, 6, 9, 8], texture: '#torch' },
      north: { uv: [7, 6, 9, 16], texture: '#torch' }, east: { uv: [7, 6, 9, 16], texture: '#torch' },
      south: { uv: [7, 6, 9, 16], texture: '#torch' }, west: { uv: [7, 6, 9, 16], texture: '#torch' },
    },
  }],
}

const MODELS = {
  'block/cube': cube,
  'block/cube_all': cubeAll,
  'block/stairs': stairs,
  'block/template_torch': torch,
  'block/stone': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
  'block/glass': { parent: 'minecraft:block/cube_all', textures: { all: { force_translucent: true, sprite: 'minecraft:block/glass' } } },
  'block/red_stained_glass': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/red_stained_glass' } },
  'block/oak_stairs': {
    parent: 'minecraft:block/stairs',
    textures: { bottom: 'minecraft:block/oak_planks', side: 'minecraft:block/oak_planks', top: 'minecraft:block/oak_planks' },
  },
  'block/torch': { parent: 'minecraft:block/template_torch', textures: { torch: 'minecraft:block/torch' } },
  'block/water': { textures: { particle: 'block/water_still' } },
  'block/barrier': { textures: { particle: 'minecraft:item/barrier' } },
  'block/broken': { parent: 'minecraft:block/does_not_exist' },
  'block/untextured': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/not_in_atlas' } },
}

const DEFINITIONS = {
  stone: { variants: { '': { model: 'minecraft:block/stone' } } },
  glass: { variants: { '': { model: 'minecraft:block/glass' } } },
  red_stained_glass: { variants: { '': { model: 'minecraft:block/red_stained_glass' } } },
  oak_stairs: {
    variants: {
      'facing=east,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs' },
      'facing=north,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs', uvlock: true, y: 270 },
    },
  },
  torch: { variants: { '': { model: 'minecraft:block/torch' } } },
  water: { variants: { '': { model: 'minecraft:block/water' } } },
  barrier: { variants: { '': { model: 'minecraft:block/barrier' } } },
  broken_block: { variants: { '': { model: 'minecraft:block/missing_model' } } },
  // Stands in for a block renamed since this version (pre-1.20.3 `grass` is `short_grass` in 26.3).
  grass: { variants: { '': { model: 'minecraft:block/stone' } } },
  // Its model uses a texture the atlas lacks.
  untextured: { variants: { '': { model: 'minecraft:block/untextured' } } },
}

/** Texture name → [r, g, b, a] for every pixel of its 16×16 tile. */
const TILES: Record<string, (x: number, y: number) => [number, number, number, number]> = {
  'block/stone': () => [128, 128, 128, 255],
  'block/oak_planks': () => [160, 130, 80, 255],
  'block/glass': (x, y) => (x === 0 || y === 0 ? [200, 220, 220, 255] : [0, 0, 0, 0]),
  'block/red_stained_glass': () => [160, 40, 40, 128],
  'block/torch': (x) => (x >= 7 && x <= 8 ? [250, 200, 60, 255] : [0, 0, 0, 0]),
  'block/water_still': () => [180, 180, 180, 180],
  'block/water_flow': () => [180, 180, 180, 180],
}

/** A 16-pixel-tall atlas with one 16×16 tile per texture, left to right. */
export function testAtlas(): { width: number; height: number; data: Uint8Array; rects: AtlasRects } {
  const names = Object.keys(TILES)
  const width = 16 * 8
  const height = 16
  const data = new Uint8Array(width * height * 4)
  const rects: AtlasRects = {}
  names.forEach((name, t) => {
    rects[name] = [t * 16, 0, 16, 16]
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) data.set(TILES[name]!(x, y), (y * width + t * 16 + x) * 4)
  })
  return { width, height, data, rects }
}

export function testAssets(): TexturedAssets {
  const atlas = testAtlas()
  const prepared = prepareAtlas(atlas, atlas.rects)
  return {
    version: 'test',
    blockDefinitionsJson: JSON.stringify(DEFINITIONS),
    modelsJson: JSON.stringify(MODELS),
    textures: prepared.textures,
    white: prepared.white,
  }
}
