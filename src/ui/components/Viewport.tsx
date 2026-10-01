import { useEffect, useRef, useState } from 'react'
import type { PickHit } from '../../render'
import { useApp, useController } from '../hooks'

/** Spec §11 center: the 3D view with hover tooltip, stats overlay and view buttons. */
export function Viewport() {
  const controller = useController()
  const host = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const hover = useApp((s) => s.hover)

  useEffect(() => {
    const renderer = controller.services.createRenderer(host.current!)
    const detach = controller.attachRenderer(renderer)
    return () => {
      detach()
      renderer.dispose()
    }
  }, [controller])

  return (
    <>
      <div
        ref={host}
        className="viewport"
        data-testid="viewport"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
        onPointerLeave={() => setPointer(null)}
      />
      <StatsOverlay />
      <ViewButtons />
      <StatusLine />
      {hover && pointer && <HoverTooltip hit={hover} x={pointer.x} y={pointer.y} />}
    </>
  )
}

function StatsOverlay() {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  const render = useApp((s) => s.render)
  if (!doc) return null
  const blocks = controller.regionStats().reduce((n, r) => n + r.blocks, 0)
  const parts = [`${blocks.toLocaleString('en-US')} blocks`]
  if (render) {
    const { total, queued, parked, meshing, failed } = render.chunks
    parts.push(`${Math.max(0, total - queued - parked - meshing)}/${total} chunks`)
    if (queued + meshing > 0) parts.push(`meshing ${queued + meshing}`)
    if (failed > 0) parts.push(`${failed} failed`)
  }
  return <div className="stats" data-testid="stats">{parts.join(' · ')}</div>
}

function HoverTooltip({ hit, x, y }: { hit: PickHit; x: number; y: number }) {
  const { services } = useController()
  const name = hit.state.split('[')[0]!
  const unknown = !services.registry.has(name)
  return (
    <div className="tooltip" role="tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div>{hit.state}{unknown && ' (unknown block)'}</div>
      <div>{hit.world.x} {hit.world.y} {hit.world.z} · {hit.regionName}</div>
    </div>
  )
}

function ViewButtons() {
  const controller = useController()
  const doc = useApp((s) => s.doc)
  const fly = useApp((s) => s.flyMode)
  if (!doc) return null
  return (
    <div className="view-buttons">
      <button type="button" onClick={() => controller.fitToView()}>Fit view</button>
      <button
        type="button"
        aria-pressed={fly}
        title="Fly with WASD, Space and Shift"
        onClick={() => controller.setFlyMode(!fly)}
      >
        Fly
      </button>
    </div>
  )
}

function StatusLine() {
  const selecting = useApp((s) => s.selecting)
  const lastEdit = useApp((s) => s.lastEdit)
  const text = selecting ? 'Click two blocks to select a box. Esc cancels.' : lastEdit?.message
  return text ? <div className="status-line" role="status">{text}</div> : null
}
