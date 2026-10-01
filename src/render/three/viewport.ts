import { Color, LinearSRGBColorSpace, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Vec3 } from '../../core/model'
import type { Ray } from '../pick/dda'
import { fitView, flyDelta, type Bounds, type FlyKeys } from '../viewMath'

const FLY_KEYS: Record<string, keyof FlyKeys> = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', Space: 'up', ShiftLeft: 'down', ShiftRight: 'down',
}

/** Blocks per second in fly mode. */
const FLY_SPEED = 20

/**
 * Canvas, scene, camera and controls (spec §8.6 camera): orbit/pan/zoom,
 * fit-to-view, and an optional WASD fly mode that moves the camera and the
 * orbit target together.
 */
export class Viewport {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(60, 1, 0.1, 10000)
  readonly controls: OrbitControls
  /** Called every frame before rendering, with seconds since the last frame. */
  onFrame: ((seconds: number) => void) | null = null
  private fly = false
  private readonly keys: FlyKeys = { forward: false, back: false, left: false, right: false, up: false, down: false }
  private readonly resize: ResizeObserver
  private last = performance.now()

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.outputColorSpace = LinearSRGBColorSpace
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.scene.background = new Color(0x1e1f24)
    container.appendChild(this.renderer.domElement)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.resize = new ResizeObserver(() => this.fitCanvas())
    this.resize.observe(container)
    this.fitCanvas()
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    window.addEventListener('blur', this.onBlur)
    this.renderer.setAnimationLoop(() => this.frame())
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  get flyMode(): boolean {
    return this.fly
  }

  setFlyMode(on: boolean): void {
    this.fly = on
    if (!on) this.onBlur()
  }

  /** Points the camera at the box; does nothing for null. */
  fit(bounds: Bounds | null): void {
    if (!bounds) return
    const f = fitView(bounds, this.camera.fov, this.camera.aspect)
    this.camera.position.set(f.position.x, f.position.y, f.position.z)
    this.camera.near = f.near
    this.camera.far = f.far
    this.camera.updateProjectionMatrix()
    this.controls.target.set(f.target.x, f.target.y, f.target.z)
    this.controls.update()
  }

  cameraPosition(): Vec3 {
    const p = this.camera.position
    return { x: p.x, y: p.y, z: p.z }
  }

  /** World-space ray through a point of the page (e.g. a pointer event's clientX/clientY). */
  ray(clientX: number, clientY: number): Ray {
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const origin = this.camera.position.clone()
    const dir = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin).normalize()
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resize.disconnect()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    window.removeEventListener('blur', this.onBlur)
    this.controls.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  private frame(): void {
    const now = performance.now()
    const seconds = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    if (this.fly) {
      const forward = this.controls.target.clone().sub(this.camera.position)
      const d = flyDelta(this.keys, forward, FLY_SPEED, seconds)
      this.camera.position.add(new Vector3(d.x, d.y, d.z))
      this.controls.target.add(new Vector3(d.x, d.y, d.z))
      this.controls.update()
    }
    this.onFrame?.(seconds)
    this.renderer.render(this.scene, this.camera)
  }

  private fitCanvas(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.fly || isTyping(e.target)) return
    const k = FLY_KEYS[e.code]
    if (!k) return
    this.keys[k] = e.type === 'keydown'
    e.preventDefault()
  }

  private readonly onBlur = (): void => {
    for (const k of Object.keys(this.keys) as (keyof FlyKeys)[]) this.keys[k] = false
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}
