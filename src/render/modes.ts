import type { LoadedAssets } from './assets/loader'
import type { RenderMode } from './mesh/types'

export type AssetStatus =
  /** Nothing requested yet (colored mode, or no schematic). */
  | { state: 'none' }
  | { state: 'loading' }
  /** `newerThanKnown`: the file is newer than every version mcmeta knows (spec §5 warning). */
  | { state: 'ready'; version: string; exact: boolean; newerThanKnown: boolean }
  /** Spec §12: the renderer switched to colored mode; `retry()` tries again. */
  | { state: 'failed'; message: string }

/**
 * Textured/colored mode and the asset loading behind it (spec §8.1, §8.2).
 * Textured mode draws colored until its assets are ready; a failed load
 * switches the mode to colored and keeps the error for a retry button.
 */
export class ModeController {
  private requested: RenderMode = 'textured'
  private status: AssetStatus = { state: 'none' }
  private dataVersion: number | null = null
  private loadedFor: number | null = null
  private loadingFor: number | null = null
  private token = 0

  constructor(
    private readonly load: (dataVersion: number) => Promise<LoadedAssets>,
    private readonly onReady: (loaded: LoadedAssets) => void,
    private readonly onChange: () => void,
  ) {}

  /** The mode the user picked (after an automatic switch to colored on failure). */
  get mode(): RenderMode {
    return this.requested
  }

  /** The mode chunks are meshed in right now. */
  get effectiveMode(): RenderMode {
    return this.requested === 'textured' && this.status.state === 'ready' ? 'textured' : 'colored'
  }

  get assets(): AssetStatus {
    return this.status
  }

  setMode(mode: RenderMode): void {
    this.requested = mode
    if (mode === 'textured') this.ensureLoaded()
    this.onChange()
  }

  /**
   * The open file's `MinecraftDataVersion`, or null when nothing is open.
   * Assets already loaded or loading for the same data version are kept.
   */
  setDataVersion(dataVersion: number | null): void {
    this.dataVersion = dataVersion
    if (dataVersion === null) return
    const kept = (this.status.state === 'ready' && dataVersion === this.loadedFor) ||
      (this.status.state === 'loading' && dataVersion === this.loadingFor)
    if (!kept) {
      this.token++
      this.status = { state: 'none' }
      this.loadedFor = null
      this.loadingFor = null
      if (this.requested === 'textured') this.ensureLoaded()
    }
    this.onChange()
  }

  /** After a failure: back to textured mode and load again. */
  retry(): void {
    if (this.status.state === 'failed') this.status = { state: 'none' }
    this.setMode('textured')
  }

  private ensureLoaded(): void {
    const dv = this.dataVersion
    if (dv === null || this.status.state === 'loading' || this.status.state === 'ready') return
    const token = ++this.token
    this.status = { state: 'loading' }
    this.loadingFor = dv
    this.load(dv).then(
      (loaded) => {
        if (token !== this.token) return
        this.loadedFor = dv
        this.loadingFor = null
        this.status = { state: 'ready', version: loaded.choice.version.id, exact: loaded.choice.exact, newerThanKnown: loaded.choice.newerThanKnown }
        this.onReady(loaded)
        this.onChange()
      },
      (error: unknown) => {
        if (token !== this.token) return
        this.loadingFor = null
        console.error('Loading block textures failed', error)
        this.status = { state: 'failed', message: error instanceof Error ? error.message : String(error) }
        this.requested = 'colored'
        this.onChange()
      },
    )
  }
}
