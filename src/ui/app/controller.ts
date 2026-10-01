import { Editor, type EditableMetadata, type EditResult } from '../../core/edit/editor'
import type { Matcher } from '../../core/edit/matchers'
import type { ReplaceRule } from '../../core/edit/replace'
import type { Box, Scope } from '../../core/edit/scopes'
import type { Family } from '../../core/families'
import type { Schematic } from '../../core/model'
import type { LayerRange, RenderMode } from '../../render'
import { friendlyError } from './errors'
import { downloadName } from './fileName'
import type { NoticeAction } from './notices'
import type { RendererLike, Services } from './services'
import { initialState, type AppState, type ConfirmRequest, type DismissableNotice, type Highlight, type RightTab } from './state'
import { regionStats, totalVolume, type RegionStats } from './stats'
import { Store } from './store'

/** Files above this size get a warning before they are read (spec §12 "Very large file"). */
export const LARGE_FILE_BYTES = 32 * 1024 * 1024
/** Schematics above this total volume get a warning before they are shown (spec §1: ~50M blocks). */
export const LARGE_VOLUME = 50_000_000

/** The parts of a `File` that opening uses. */
export interface OpenableFile {
  name: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface ControllerOptions {
  largeFileBytes?: number
  largeVolume?: number
  /** Passed to each Editor; defaults to the spec's 256 MB. */
  historyCapBytes?: number
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

/**
 * Everything the UI does, as plain methods over a store. Components read
 * the store and call these; nothing here touches the DOM, so it is tested
 * in Node with a fake renderer and fake services.
 */
export class AppController {
  readonly store = new Store<AppState>(initialState)
  private renderer: RendererLike | null = null
  private detachRenderer: (() => void) | null = null
  private unsubscribeEditor: (() => void) | null = null
  private openToken = 0
  private pendingConfirm: ((ok: boolean) => void) | null = null
  private statsCache: { revision: number; doc: object; stats: RegionStats[] } | null = null
  /** Owner of the current `busy`; only the setter that owns it may clear it (overlapping opens/saves). */
  private busySeq = 0
  private busyOwner: number | null = null
  /** Set by the 'selection' listener when a click just completed a box, so the same click's 'selection' doesn't also eyedrop. */
  private selectionConsumedClick = false

  private readonly largeFileBytes: number
  private readonly largeVolume: number
  private readonly historyCapBytes: number | undefined

  constructor(readonly services: Services, options: ControllerOptions = {}) {
    this.largeFileBytes = options.largeFileBytes ?? LARGE_FILE_BYTES
    this.largeVolume = options.largeVolume ?? LARGE_VOLUME
    this.historyCapBytes = options.historyCapBytes
  }

  get state(): AppState {
    return this.store.getState()
  }

  // ---- renderer -----------------------------------------------------------

  /** Connects the viewport's renderer, detaching a previously attached one first. Returns a function that disconnects it. */
  attachRenderer(renderer: RendererLike): () => void {
    this.detachRenderer?.()
    this.renderer = renderer
    const offs = [
      renderer.on('status', (render) => this.store.setState({ render })),
      renderer.on('hover', (hover) => this.store.setState({ hover })),
      renderer.on('selection', (selection) => {
        // The click that just completed this box must not also fire the eyedropper.
        this.selectionConsumedClick = true
        this.store.setState({ selection, selecting: renderer.selecting })
      }),
      renderer.on('click', ({ hit, event }) => {
        const usedForSelection = this.selectionConsumedClick || renderer.selecting
        this.selectionConsumedClick = false
        if (hit && event.altKey && !usedForSelection) this.pickState(hit.state)
        else this.store.setState({ selecting: renderer.selecting })
      }),
    ]
    const doc = this.state.doc
    if (doc) renderer.load(doc.schematic, doc.editor)
    this.store.setState({ render: renderer.status })
    const detach = () => {
      offs.forEach((off) => off())
      if (this.renderer === renderer) this.renderer = null
      if (this.detachRenderer === detach) this.detachRenderer = null
    }
    this.detachRenderer = detach
    return detach
  }

  // ---- open / save ----------------------------------------------------------

  /**
   * Opens a file (spec §11). Failures show the error dialog and keep the
   * current schematic open (spec §12). When another open starts before this
   * one finishes, the later one wins.
   */
  async openFile(file: OpenableFile): Promise<void> {
    const token = ++this.openToken
    let warned = false
    if (file.size > this.largeFileBytes) {
      warned = true
      const mb = Math.round(file.size / (1024 * 1024))
      const ok = await this.confirm({
        title: 'Very large file',
        message: `${file.name} is ${mb} MB. Reading it may take a while and use a lot of memory.`,
        confirmLabel: 'Open anyway',
      })
      if (!ok || token !== this.openToken) return
    }
    const owner = this.setBusy('open', `Opening ${file.name}…`)
    this.store.setState({ error: null })
    let schematic: Schematic
    try {
      schematic = await this.services.parse(await file.arrayBuffer())
    } catch (e) {
      // Clear busy unconditionally: this open may be stale (a later one took
      // over the token) but still be the one that owns the busy overlay, if
      // the later open never reached its own busy-setting step (e.g. its own
      // confirm was declined before then). Only show the error, though, when
      // this open is still the current one.
      this.clearBusy(owner)
      if (token === this.openToken) this.store.setState({ error: friendlyError(e, 'open') })
      return
    }
    this.clearBusy(owner)
    if (token !== this.openToken) return
    const volume = totalVolume(schematic)
    if (!warned && volume > this.largeVolume) {
      const ok = await this.confirm({
        title: 'Very large schematic',
        message: `${file.name} spans ${plural(volume, 'block')}. Editing and rendering may be slow.`,
        confirmLabel: 'Open anyway',
      })
      if (!ok || token !== this.openToken) return
    }
    this.show(schematic, file.name)
  }

  private show(schematic: Schematic, fileName: string): void {
    this.unsubscribeEditor?.()
    const editor = new Editor(schematic, this.services.registry,
      this.historyCapBytes === undefined ? {} : { historyCapBytes: this.historyCapBytes })
    this.unsubscribeEditor = editor.subscribe(() => this.bump())
    this.store.setState({
      doc: { schematic, editor, fileName, revision: 0 },
      hover: null, selection: null, selecting: false, layerRange: null, hiddenRegions: [],
      highlight: null, picked: null, lastEdit: null, dismissed: [],
    })
    this.renderer?.load(schematic, editor)
  }

  /** Saves through the round-trip guard and downloads `<name>.litematic` (spec §5, §11). */
  async save(): Promise<void> {
    const doc = this.state.doc
    if (!doc || this.state.busy) return
    const owner = this.setBusy('save', 'Saving…')
    this.store.setState({ error: null })
    try {
      const bytes = await this.services.save(doc.schematic)
      this.services.download(bytes, downloadName(doc.schematic.metadata.name, doc.fileName), 'application/octet-stream')
      this.clearBusy(owner)
    } catch (e) {
      this.clearBusy(owner)
      this.store.setState({ error: friendlyError(e, 'save') })
    }
  }

  /** Sets `busy` and records who owns it, so only the matching `clearBusy` call can clear it. */
  private setBusy(kind: 'open' | 'save', label: string): number {
    const owner = ++this.busySeq
    this.busyOwner = owner
    this.store.setState({ busy: { kind, label } })
    return owner
  }

  /** Clears `busy` only if `owner` still owns it (a later open or save may have taken over). */
  private clearBusy(owner: number): void {
    if (this.busyOwner !== owner) return
    this.busyOwner = null
    this.store.setState({ busy: null })
  }

  // ---- dialogs ----------------------------------------------------------------

  /** Shows the confirm dialog; resolves with the user's answer. A newer request cancels an older one. */
  confirm(request: ConfirmRequest): Promise<boolean> {
    this.pendingConfirm?.(false)
    return new Promise((resolve) => {
      this.pendingConfirm = resolve
      this.store.setState({ confirm: request })
    })
  }

  answerConfirm(ok: boolean): void {
    const resolve = this.pendingConfirm
    this.pendingConfirm = null
    this.store.setState({ confirm: null })
    resolve?.(ok)
  }

  dismissError(): void {
    this.store.setState({ error: null })
  }

  showError(e: unknown, action: 'open' | 'save' | 'edit'): void {
    this.store.setState({ error: friendlyError(e, action) })
  }

  dismissNotice(kind: DismissableNotice): void {
    if (!this.state.dismissed.includes(kind)) this.store.setState({ dismissed: [...this.state.dismissed, kind] })
  }

  runNoticeAction(action: NoticeAction): void {
    if (action === 'retry-assets') this.retryAssets()
    else this.setMode('colored')
  }

  // ---- edits --------------------------------------------------------------------

  undo(): void {
    this.withEditor((editor) => {
      if (editor.undo()) this.store.setState({ lastEdit: null })
    })
  }

  redo(): void {
    this.withEditor((editor) => {
      if (editor.redo()) this.store.setState({ lastEdit: null })
    })
  }

  /** Not undoable; see Editor.setMetadata. */
  setMetadata(patch: Partial<EditableMetadata>): void {
    this.withEditor((editor) => {
      if (editor.setMetadata(patch)) this.bump()
    })
  }

  replace(rules: readonly ReplaceRule[], scopes: readonly Scope[]): EditResult | null {
    return this.edit((editor) => editor.replace(rules, scopes), (n) => `Replaced ${plural(n, 'block')}.`)
  }

  delete(from: readonly Matcher[], scopes: readonly Scope[]): EditResult | null {
    return this.edit((editor) => editor.delete(from, scopes), (n) => `Deleted ${plural(n, 'block')}.`)
  }

  familySwap(source: Family, target: Family, scopes: readonly Scope[]): EditResult | null {
    return this.edit(
      (editor) => editor.familySwap(source, target, scopes),
      (n) => `Swapped ${plural(n, 'block')} from ${source.label} to ${target.label}.`,
    )
  }

  private edit(run: (editor: Editor) => EditResult, describe: (count: number) => string): EditResult | null {
    return this.withEditor((editor) => {
      const result = run(editor)
      this.store.setState({
        lastEdit: { message: describe(result.count), undoable: result.undoable },
        dismissed: this.state.dismissed.filter((d) => d !== 'not-undoable'),
      })
      return result
    }) ?? null
  }

  private withEditor<T>(fn: (editor: Editor) => T): T | undefined {
    const doc = this.state.doc
    if (!doc) return undefined
    try {
      return fn(doc.editor)
    } catch (e) {
      this.store.setState({ error: friendlyError(e, 'edit') })
      return undefined
    }
  }

  private bump(): void {
    const doc = this.state.doc
    if (doc) this.store.setState({ doc: { ...doc, revision: doc.revision + 1 } })
  }

  /** Non-air block count and volume per region, cached per revision. */
  regionStats(): RegionStats[] {
    const doc = this.state.doc
    if (!doc) return []
    const cache = this.statsCache
    if (cache && cache.doc === doc.schematic && cache.revision === doc.revision) return cache.stats
    const stats = regionStats(doc.schematic)
    this.statsCache = { revision: doc.revision, doc: doc.schematic, stats }
    return stats
  }

  // ---- view -----------------------------------------------------------------------

  setTab(tab: RightTab): void {
    this.store.setState({ tab })
  }

  setMode(mode: RenderMode): void {
    this.renderer?.setMode(mode)
  }

  retryAssets(): void {
    this.renderer?.retryAssets()
  }

  setRegionVisible(regionId: number, visible: boolean): void {
    this.renderer?.setRegionVisible(regionId, visible)
    const hidden = this.state.hiddenRegions.filter((id) => id !== regionId)
    this.store.setState({ hiddenRegions: visible ? hidden : [...hidden, regionId].sort((a, b) => a - b) })
  }

  /** Visible layers (spec §8.5); the renderer clamps the range to the schematic. */
  setLayerRange(range: LayerRange | null): void {
    if (!this.renderer) return
    this.renderer.setLayerRange(range)
    this.store.setState({ layerRange: this.renderer.layerRange })
  }

  /** ↑/↓ layer stepping. */
  stepLayer(delta: number): void {
    if (!this.renderer || !this.state.doc) return
    this.renderer.stepLayer(delta)
    this.store.setState({ layerRange: this.renderer.layerRange })
  }

  startBoxSelection(): void {
    this.renderer?.startBoxSelection()
    this.store.setState({ selecting: this.renderer?.selecting ?? false })
  }

  cancelBoxSelection(): void {
    this.renderer?.cancelBoxSelection()
    this.store.setState({ selecting: false })
  }

  /** Numeric min/max editing; the renderer normalizes the corners. */
  setSelection(box: Box | null): void {
    if (!this.renderer) return
    this.renderer.setSelection(box)
    this.store.setState({ selection: this.renderer.selection })
  }

  /** Material row click (spec §10): highlight its blocks, or clear with null. */
  setHighlight(highlight: Highlight | null): void {
    this.renderer?.setHighlight(highlight ? highlight.blocks : null)
    this.store.setState({ highlight })
  }

  fitToView(): void {
    this.renderer?.fitToView()
  }

  setFlyMode(on: boolean): void {
    this.renderer?.setFlyMode(on)
  }

  /** Alt+click eyedropper (spec §8.6): hands the state to the Replace tab's "from" list. */
  pickState(state: string): void {
    this.store.setState({ picked: { state, seq: (this.state.picked?.seq ?? 0) + 1 }, tab: 'replace' })
  }
}
