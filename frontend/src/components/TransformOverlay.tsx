import { useEffect, useRef, useState } from 'react'
import React from 'react'

const _rotSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='none' stroke='black' stroke-width='2'/></svg>`
const ROTATE_CURSOR = `url("data:image/svg+xml;base64,${btoa(_rotSvg)}") 12 12, crosshair`

const _scaleNWSE = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><polygon points='1,1 7,1 1,7' fill='black'/><polygon points='19,19 13,19 19,13' fill='black'/><line x1='3' y1='3' x2='17' y2='17' stroke='black' stroke-width='1.5'/></svg>`
const SCALE_NWSE_CURSOR = `url("data:image/svg+xml;base64,${btoa(_scaleNWSE)}") 10 10, nwse-resize`

const _scaleNESW = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><polygon points='19,1 13,1 19,7' fill='black'/><polygon points='1,19 7,19 1,13' fill='black'/><line x1='17' y1='3' x2='3' y2='17' stroke='black' stroke-width='1.5'/></svg>`
const SCALE_NESW_CURSOR = `url("data:image/svg+xml;base64,${btoa(_scaleNESW)}") 10 10, nesw-resize`

const _grab = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='22' viewBox='0 0 20 22'><rect x='2' y='5' width='3' height='8' rx='1.5' fill='black'/><rect x='6' y='2' width='3' height='11' rx='1.5' fill='black'/><rect x='10' y='3' width='3' height='10' rx='1.5' fill='black'/><rect x='14' y='5' width='3' height='8' rx='1.5' fill='black'/><rect x='2' y='11' width='15' height='8' rx='2.5' fill='black'/></svg>`
const GRAB_CURSOR     = `url("data:image/svg+xml;base64,${btoa(_grab)}") 11 2, grab`
const GRABBING_CURSOR = `url("data:image/svg+xml;base64,${btoa(_grab)}") 11 2, grabbing`

interface Props {
  scale: number
  rotation: number
  xOffset: number
  yOffset: number
  baseScale: number
  baseRotation: number
  baseXOffset: number
  baseYOffset: number
  onChange: (scale: number, rotation: number, xOffset: number, yOffset: number) => void
  onConfirm: () => void
  onCancel: () => void
  zoom?: number
}

export default function TransformOverlay({
  scale, rotation, xOffset, yOffset,
  baseScale, baseRotation, baseXOffset, baseYOffset,
  onChange, onConfirm, onCancel,
  zoom = 1,
}: Props) {
  const overlayRef    = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'scale' | 'rotate' | 'pan' | null>(null)
  const dragStartRef  = useRef<{ x: number; y: number; scale: number; rotation: number; xOffset: number; yOffset: number } | null>(null)
  const centerRef     = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const readyRef      = useRef(false)
  const justDraggedRef = useRef(false)
  const scaleCursorRef = useRef(SCALE_NWSE_CURSOR)
  const [editField, setEditField] = useState<'scale' | 'rotate' | 'x' | 'y' | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true }, 300)
    return () => clearTimeout(t)
  }, [])

  function getShapeCenter() {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: rect.left + rect.width  * (0.5 + baseXOffset + xOffset),
      y: rect.top  + rect.height * (0.5 + baseYOffset + yOffset),
    }
  }

  function startDrag(type: 'scale' | 'rotate' | 'pan', e: React.MouseEvent, cursor?: string) {
    e.stopPropagation()
    e.preventDefault()
    centerRef.current = getShapeCenter()
    dragStartRef.current = { x: e.clientX, y: e.clientY, scale, rotation, xOffset, yOffset }
    if (type === 'scale' && cursor) scaleCursorRef.current = cursor
    setDragging(type)
  }

  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const start = dragStartRef.current
      if (!start) return
      const { x: cx, y: cy } = centerRef.current
      if (dragging === 'rotate') {
        const a0 = Math.atan2(start.y - cy, start.x - cx)
        const a1 = Math.atan2(e.clientY - cy, e.clientX - cx)
        const delta = (a1 - a0) * (180 / Math.PI)
        onChange(scale, Math.round(start.rotation + delta), xOffset, yOffset)
      } else if (dragging === 'scale') {
        const d0 = Math.hypot(start.x - cx, start.y - cy)
        const d1 = Math.hypot(e.clientX - cx, e.clientY - cy)
        if (d0 > 0) {
          const ns = Math.max(0.1, Math.min(4.0, start.scale * (d1 / d0)))
          onChange(Math.round(ns * 100) / 100, rotation, xOffset, yOffset)
        }
      } else if (dragging === 'pan') {
        const el = overlayRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const dx = (e.clientX - start.x) / rect.width
        const dy = (e.clientY - start.y) / rect.height
        onChange(scale, rotation, start.xOffset + dx, start.yOffset + dy)
      }
    }
    function onUp() {
      setDragging(null)
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 150)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, scale, rotation, xOffset, yOffset, onChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  const totalX        = baseXOffset + xOffset
  const totalY        = baseYOffset + yOffset
  const totalScale    = baseScale * scale
  const totalRotation = baseRotation + rotation

  // Inverse of view zoom: keeps elements outside the scaled box at constant screen size
  const s = 1 / Math.max(0.1, zoom)
  // Elements INSIDE the box also need to cancel out the box's CSS scale(totalScale)
  const sBox = s / Math.max(0.1, totalScale)

  const borderW    = 1.5 * sBox  // dashed frame border (inside scaled box)
  const handlePx   = 14  * sBox  // handle dot diameter (inside scaled box)
  const handleBord = 2   * sBox  // handle dot border width (inside scaled box)
  const zonePx     = 28  * sBox  // corner hit-zone size (inside scaled box)
  const pivotPx    = 14 * s      // pivot crosshair svg size (outside box)
  const pivotStk   = 1.5 * s     // pivot stroke width (outside box)
  const pivotR     = 2 * s       // pivot center dot radius (outside box)
  const pivotLine  = 6 * s       // pivot arm length (outside box)

  // Shared styles
  const dotStyle = (cursor: string, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: handlePx,
    height: handlePx,
    borderRadius: '50%',
    background: '#020c24',
    border: `${handleBord}px solid #59CEFA`,
    zIndex: 10,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor,
    ...extra,
  })

  const boxLeft = (0.26 + totalX) * 100
  const boxTop  = (0.26 + totalY) * 100

  function commitEdit(field: typeof editField, raw: string) {
    setEditField(null)
    const num = parseFloat(raw)
    if (isNaN(num)) return
    if (field === 'scale') {
      const ts = Math.max(0.01, num / 100)
      onChange(Math.round((ts / Math.max(0.001, baseScale)) * 100) / 100, rotation, xOffset, yOffset)
    } else if (field === 'rotate') {
      onChange(scale, num - baseRotation, xOffset, yOffset)
    } else if (field === 'x') {
      onChange(scale, rotation, num / 100 - baseXOffset, yOffset)
    } else if (field === 'y') {
      onChange(scale, rotation, xOffset, num / 100 - baseYOffset)
    }
  }

  function startEdit(field: typeof editField, display: string) {
    setEditField(field)
    setEditValue(display)
  }

  // Inline editable field for the status bar
  function EditableField({ field, label, display, unit }: { field: NonNullable<typeof editField>; label: string; display: string; unit: string }) {
    const isEditing = editField === field
    return (
      <span className="flex items-center gap-0.5">
        <span className="opacity-60">{label}</span>
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit(field, editValue)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(field, editValue) }
              if (e.key === 'Escape') { e.preventDefault(); setEditField(null) }
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            className="w-10 bg-transparent border-b border-[#59CEFA]/60 text-[#59CEFA] text-right outline-none text-[11px] font-mono"
            style={{ minWidth: 0 }}
          />
        ) : (
          <button
            className="text-[#59CEFA] hover:text-white tabular-nums underline decoration-dotted underline-offset-2 decoration-[#59CEFA]/40 cursor-text"
            onClick={e => { e.stopPropagation(); startEdit(field, display) }}
            onMouseDown={e => e.stopPropagation()}
          >
            {display}
          </button>
        )}
        <span className="opacity-60">{unit}</span>
      </span>
    )
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20"
      style={{ cursor: dragging === 'rotate' ? ROTATE_CURSOR : dragging === 'pan' ? GRABBING_CURSOR : dragging === 'scale' ? scaleCursorRef.current : 'default' }}
      onClick={() => { if (readyRef.current && !justDraggedRef.current) onConfirm() }}
    >
      {/* Frame box */}
      <div
        className="absolute"
        style={{
          left: `${boxLeft}%`,
          top: `${boxTop}%`,
          width: '48%',
          height: '48%',
          transform: `rotate(${totalRotation}deg) scale(${totalScale})`,
          transformOrigin: 'center',
        }}
      >
        {/* Dashed border — constant line weight */}
        <div className="absolute inset-0 pointer-events-none" style={{ border: `${borderW}px dashed #59CEFA` }} />

        {/* Pan area */}
        <div
          className="absolute inset-0"
          style={{ cursor: dragging === 'pan' ? GRABBING_CURSOR : dragging ? 'inherit' : GRAB_CURSOR }}
          onMouseDown={e => startDrag('pan', e)}
          onClick={e => e.stopPropagation()}
        />

        {/* Top-left corner */}
        <div className="absolute z-10" style={{ top: 0, left: 0, width: zonePx, height: zonePx, transform: 'translate(-50%,-50%)', cursor: dragging && dragging !== 'rotate' ? 'inherit' : ROTATE_CURSOR }}
          onMouseDown={e => startDrag('rotate', e)} onClick={e => e.stopPropagation()}>
          <div style={dotStyle(dragging && dragging !== 'scale' ? 'inherit' : SCALE_NWSE_CURSOR)}
            onMouseDown={e => { e.stopPropagation(); startDrag('scale', e, SCALE_NWSE_CURSOR) }} onClick={e => e.stopPropagation()} />
        </div>

        {/* Top-right corner */}
        <div className="absolute z-10" style={{ top: 0, right: 0, width: zonePx, height: zonePx, transform: 'translate(50%,-50%)', cursor: dragging && dragging !== 'rotate' ? 'inherit' : ROTATE_CURSOR }}
          onMouseDown={e => startDrag('rotate', e)} onClick={e => e.stopPropagation()}>
          <div style={dotStyle(dragging && dragging !== 'scale' ? 'inherit' : SCALE_NESW_CURSOR)}
            onMouseDown={e => { e.stopPropagation(); startDrag('scale', e, SCALE_NESW_CURSOR) }} onClick={e => e.stopPropagation()} />
        </div>

        {/* Bottom-left corner */}
        <div className="absolute z-10" style={{ bottom: 0, left: 0, width: zonePx, height: zonePx, transform: 'translate(-50%,50%)', cursor: dragging && dragging !== 'rotate' ? 'inherit' : ROTATE_CURSOR }}
          onMouseDown={e => startDrag('rotate', e)} onClick={e => e.stopPropagation()}>
          <div style={dotStyle(dragging && dragging !== 'scale' ? 'inherit' : SCALE_NESW_CURSOR)}
            onMouseDown={e => { e.stopPropagation(); startDrag('scale', e, SCALE_NESW_CURSOR) }} onClick={e => e.stopPropagation()} />
        </div>

        {/* Bottom-right corner */}
        <div className="absolute z-10" style={{ bottom: 0, right: 0, width: zonePx, height: zonePx, transform: 'translate(50%,50%)', cursor: dragging && dragging !== 'rotate' ? 'inherit' : ROTATE_CURSOR }}
          onMouseDown={e => startDrag('rotate', e)} onClick={e => e.stopPropagation()}>
          <div style={dotStyle(dragging && dragging !== 'scale' ? 'inherit' : SCALE_NWSE_CURSOR)}
            onMouseDown={e => { e.stopPropagation(); startDrag('scale', e, SCALE_NWSE_CURSOR) }} onClick={e => e.stopPropagation()} />
        </div>

        {/* Rotation handle above top-center */}
        <div
          style={dotStyle(dragging && dragging !== 'rotate' ? 'inherit' : ROTATE_CURSOR, {
            top: 0,
            left: '50%',
            transform: `translate(-50%, -250%)`,
          })}
          onMouseDown={e => startDrag('rotate', e)}
          onClick={e => e.stopPropagation()}
        >
          <svg width={handlePx * 0.57} height={handlePx * 0.57} viewBox="0 0 10 10">
            <path d="M5 1 A4 4 0 0 1 9 5" stroke="#59CEFA" strokeWidth={1.5 / s} fill="none" vectorEffect="non-scaling-stroke"/>
          </svg>
        </div>
      </div>

      {/* Pivot crosshair — constant size */}
      <div
        className="absolute pointer-events-none z-30"
        style={{
          left: `${(0.5 + totalX) * 100}%`,
          top:  `${(0.5 + totalY) * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <svg width={pivotPx} height={pivotPx} viewBox={`${-pivotPx/2} ${-pivotPx/2} ${pivotPx} ${pivotPx}`}>
          <line x1={-pivotLine} y1="0" x2={pivotLine} y2="0" stroke="#59CEFA" strokeWidth={pivotStk}/>
          <line x1="0" y1={-pivotLine} x2="0" y2={pivotLine} stroke="#59CEFA" strokeWidth={pivotStk}/>
          <circle cx="0" cy="0" r={pivotR} fill="#59CEFA"/>
        </svg>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-4 text-[11px] font-mono text-[#59CEFA] bg-[#020c24]/80 px-3 py-1.5 rounded">
        <EditableField field="scale"  label="Scale "  display={String(Math.round(totalScale * 100))} unit="%" />
        <EditableField field="rotate" label="Rotate " display={String(Math.round(totalRotation))}   unit="°" />
        <EditableField field="x"      label="X "      display={String(Math.round(totalX * 100))}     unit="%" />
        <EditableField field="y"      label="Y "      display={String(Math.round(totalY * 100))}     unit="%" />
      </div>
    </div>
  )
}
