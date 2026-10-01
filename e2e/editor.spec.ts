// Spec §13 minimal end-to-end check: load a fixture, render it, replace one
// block type, save, and parse the downloaded bytes with the core reader.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { readLitematic } from '../src/core/litematic/read'
import type { Schematic } from '../src/core/model'

const FIXTURE = join(import.meta.dirname, '../tests/fixtures/sample-house.litematic')

function count(s: Schematic, name: string): number {
  let n = 0
  for (const r of s.regions) for (const i of r.blocks) if (r.palette[i]!.name === name) n++
  return n
}

let problems: string[] = []

test.beforeEach(async ({ page }) => {
  // No network: mcmeta texture requests fail at once, so textured mode falls
  // back to the bundled colored palette deterministically (spec §8.2, §12).
  const origin = new URL(test.info().project.use.baseURL!).origin
  await page.route((url) => url.origin !== origin, (route) => route.abort())
  problems = []
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('response', (r) => {
    if (r.url().startsWith(origin) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`)
  })
})

test.afterEach(() => {
  expect(problems).toEqual([])
})

/** Waits until every chunk is meshed: "N blocks · C/C chunks" with nothing queued. */
async function waitForRender(page: Page): Promise<void> {
  await expect(page.getByTestId('stats')).toHaveText(/^[\d,]+ blocks · ([1-9]\d*)\/\1 chunks$/, { timeout: 30_000 })
}

test('opens the bundled sample from the empty state and draws it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Open the sample schematic' }).click()
  await waitForRender(page)
  await expect(page.getByRole('alert')).toContainText('Block textures could not be loaded')
  await expect(page.getByRole('button', { name: 'Retry textures' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /House/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Garden/ })).toBeChecked()

  // The canvas shows the house, not just the clear color.
  const shot = await page.getByTestId('viewport').screenshot()
  await test.info().attach('sample', { body: shot, contentType: 'image/png' })
  const png = PNG.sync.read(shot)
  const colors = new Set<number>()
  for (let i = 0; i < png.data.length; i += 4) colors.add(png.data.readUInt32BE(i))
  expect(colors.size).toBeGreaterThan(20)
})

test('replaces a block and saves a file that reads back', async ({ page }) => {
  const original = readLitematic(readFileSync(FIXTURE))
  const planks = count(original, 'minecraft:oak_planks')
  expect(planks).toBeGreaterThan(0)

  await page.goto('./')
  await page.getByLabel('Open .litematic file').setInputFiles(FIXTURE)
  await waitForRender(page)

  await page.getByRole('tab', { name: 'Replace' }).click()
  const from = page.getByRole('combobox', { name: 'Block to replace' })
  await from.fill('oak_planks')
  await from.press('Enter')
  const to = page.getByRole('combobox', { name: 'Replacement block' })
  await to.fill('spruce_planks')
  await to.press('Enter')
  await expect(page.getByRole('status', { name: 'Preview' })).toContainText(`${planks} blocks will change`)
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Replace', exact: true })).toBeDisabled()
  await waitForRender(page)

  const downloadPromise = page.waitForEvent('download')
  await page.keyboard.press('Control+s')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Sample house.litematic')

  const saved = readLitematic(readFileSync((await download.path())!))
  expect(count(saved, 'minecraft:oak_planks')).toBe(0)
  expect(count(saved, 'minecraft:spruce_planks')).toBe(planks)
  expect(count(saved, 'minecraft:glass')).toBe(count(original, 'minecraft:glass'))
  expect(saved.metadata.totalBlocks).toBe(original.metadata.totalBlocks)
  const [house, garden] = saved.regions
  expect(garden!.fileBox).toEqual(original.regions[1]!.fileBox)
  expect(garden!.extra.getList('Entities', 10).length).toBe(1)
  expect([...house!.tileEntities.values()].map((t) => t.getString('id'))).toEqual(['minecraft:chest'])
})
