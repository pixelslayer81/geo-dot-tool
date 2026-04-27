import React, { useEffect, useRef, useState } from 'react'
import FLAG_COLORS from '../data/flagColors'
import POPULATION, { formatPopulation } from '../data/countryPopulation'
import MapPicker from './MapPicker'
import TransformOverlay from './TransformOverlay'
import type { ColorConfig, CustomSvgs, DotData } from '../types'

interface Props {
  image: string | null
  dots: DotData[] | null
  dotsWidth: number
  dotsHeight: number
  colors: ColorConfig
  loading: boolean
  dotCount: number
  error: string
  shapeName: string
  mapOpen?: boolean
  selectedShape?: string
  selectedParts?: string[]
  onShapeChange?: (id: string, label: string) => void
  onPartsChange?: (parts: string[], shapeId: string, shapeName: string) => void
  onCloseMap?: () => void
  transformActive?: boolean
  liveScale?: number
  liveRotation?: number
  liveXOffset?: number
  liveYOffset?: number
  baseScale?: number
  baseRotation?: number
  baseXOffset?: number
  baseYOffset?: number
  onTransformChange?: (scale: number, rotation: number, xOffset: number, yOffset: number) => void
  onTransformConfirm?: () => void
  onTransformCancel?: () => void
  onDoubleClickCanvas?: () => void
  overlayImage?: string | null
  overlayOpacity?: number
  transformTargetsOverlay?: boolean
  customSvgs?: CustomSvgs
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  dots: DotData[],
  dotsWidth: number,
  dotsHeight: number,
  colors: ColorConfig,
  svgImageCache?: Map<string, HTMLImageElement>,
) {
  const container = canvas.parentElement
  if (!container) return
  const style = window.getComputedStyle(container)
  const pl = parseFloat(style.paddingLeft) || 0
  const pr = parseFloat(style.paddingRight) || 0
  const pt = parseFloat(style.paddingTop) || 0
  const pb = parseFloat(style.paddingBottom) || 0
  const containerW = container.clientWidth - pl - pr
  const containerH = container.clientHeight - pt - pb
  if (containerW <= 0 || containerH <= 0) return

  const dispW = containerW
  const dispH = containerH

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(dispW * dpr)
  canvas.height = Math.round(dispH * dpr)
  canvas.style.width = `${dispW}px`
  canvas.style.height = `${dispH}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const grad = colors.background_gradient
  if (grad) {
    let gradient: CanvasGradient
    if (grad.direction === 'h') {
      gradient = ctx.createLinearGradient(0, 0, dispW, 0)
    } else {
      gradient = ctx.createLinearGradient(0, 0, 0, dispH)
    }
    gradient.addColorStop(0, grad.start)
    gradient.addColorStop(1, grad.end)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, dispW, dispH)
  } else if (colors.background) {
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, dispW, dispH)
  } else {
    ctx.clearRect(0, 0, dispW, dispH)
  }

  for (const dot of dots) {
    const r = dot.radius * dispW
    if (r < 0.5) continue

    const cx = dot.x * dispW
    const cy = dot.y * dispH

    const dotRot = dot.rotation ?? 0
    if (dotRot !== 0) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((dotRot * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    if (dot.shape === 'square') {
      ctx.fillStyle = dot.color
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    } else if (dot.shape === 'circle_outline') {
      const lineWidth = Math.max(0.5, r * (dot.stroke_width ?? 0.14) * 2)
      const arcR = r - lineWidth / 2
      if (arcR > 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, arcR, 0, Math.PI * 2)
        ctx.strokeStyle = dot.outline_color || dot.color
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }
    } else if (dot.shape === 'circle_dot') {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = dot.color
      ctx.fill()
      const innerR = r * 0.38
      if (innerR >= 0.5) {
        ctx.beginPath()
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
        ctx.fillStyle = dot.inner_color || '#FFFFFF'
        ctx.fill()
      }
    } else if (dot.shape === 'square_dot') {
      ctx.fillStyle = dot.color
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      const innerR = r * 0.38
      if (innerR >= 0.5) {
        ctx.fillStyle = dot.inner_color || '#FFFFFF'
        ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR * 2)
      }
    } else if (dot.shape === 'square_outline') {
      const lineWidth = Math.max(0.5, r * (dot.stroke_width ?? 0.14) * 2)
      const inset = lineWidth / 2
      ctx.strokeStyle = dot.outline_color || dot.color
      ctx.lineWidth = lineWidth
      ctx.strokeRect(cx - r + inset, cy - r + inset, (r - inset) * 2, (r - inset) * 2)
    } else if (dot.shape === 'triangle') {
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r * 0.866, cy + r * 0.5)
      ctx.lineTo(cx - r * 0.866, cy + r * 0.5)
      ctx.closePath()
      ctx.fillStyle = dot.color
      ctx.fill()
    } else if (dot.shape === 'triangle_dot') {
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r * 0.866, cy + r * 0.5)
      ctx.lineTo(cx - r * 0.866, cy + r * 0.5)
      ctx.closePath()
      ctx.fillStyle = dot.color
      ctx.fill()
      const innerR2 = r * 0.38
      if (innerR2 >= 0.5) {
        ctx.beginPath()
        ctx.moveTo(cx, cy - innerR2)
        ctx.lineTo(cx + innerR2 * 0.866, cy + innerR2 * 0.5)
        ctx.lineTo(cx - innerR2 * 0.866, cy + innerR2 * 0.5)
        ctx.closePath()
        ctx.fillStyle = dot.inner_color || '#FFFFFF'
        ctx.fill()
      }
    } else if (dot.shape === 'triangle_outline') {
      const lineWidth = Math.max(0.5, r * (dot.stroke_width ?? 0.14) * 2)
      const sr = r - lineWidth / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy - sr)
      ctx.lineTo(cx + sr * 0.866, cy + sr * 0.5)
      ctx.lineTo(cx - sr * 0.866, cy + sr * 0.5)
      ctx.closePath()
      ctx.strokeStyle = dot.outline_color || dot.color
      ctx.lineWidth = lineWidth
      ctx.stroke()
    } else if (dot.shape === 'x_cross') {
      const arm = r * 0.7
      const lw = r * 0.4
      ctx.strokeStyle = dot.color
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy - arm)
      ctx.lineTo(cx + arm, cy + arm)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + arm, cy - arm)
      ctx.lineTo(cx - arm, cy + arm)
      ctx.stroke()
      ctx.lineCap = 'butt'
    } else if (dot.shape === 'square_x_dot') {
      ctx.fillStyle = dot.color
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
      const arm2 = r * 0.55
      const lw2 = r * 0.35
      ctx.strokeStyle = dot.inner_color || '#FFFFFF'
      ctx.lineWidth = lw2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - arm2, cy - arm2)
      ctx.lineTo(cx + arm2, cy + arm2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + arm2, cy - arm2)
      ctx.lineTo(cx - arm2, cy + arm2)
      ctx.stroke()
      ctx.lineCap = 'butt'
    } else if (dot.shape === 'square_x_outline') {
      const lineWidth = Math.max(0.5, r * (dot.stroke_width ?? 0.14) * 2)
      const inset = lineWidth / 2
      ctx.strokeStyle = dot.outline_color || dot.color
      ctx.lineWidth = lineWidth
      ctx.strokeRect(cx - r + inset, cy - r + inset, (r - inset) * 2, (r - inset) * 2)
      const arm3 = r * 0.5
      const lw3 = Math.max(0.5, r * 0.15)
      ctx.strokeStyle = dot.outline_color || dot.color
      ctx.lineWidth = lw3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - arm3, cy - arm3)
      ctx.lineTo(cx + arm3, cy + arm3)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + arm3, cy - arm3)
      ctx.lineTo(cx - arm3, cy + arm3)
      ctx.stroke()
      ctx.lineCap = 'butt'
    } else if (dot.shape === 'line_solid') {
      const lh = r * 0.35
      ctx.fillStyle = dot.color
      ctx.fillRect(cx - r, cy - lh, r * 2, lh * 2)
    } else if (dot.shape === 'line_dash') {
      const lh = r * 0.35
      const dashW = r * 0.55
      const gap = r * 0.2
      ctx.fillStyle = dot.color
      // three dashes centred on cx
      const totalW = dashW * 3 + gap * 2
      const startX = cx - totalW / 2
      for (let d = 0; d < 3; d++) {
        ctx.fillRect(startX + d * (dashW + gap), cy - lh, dashW, lh * 2)
      }
    } else if (dot.shape === 'line_outline') {
      const lh = r * 0.35
      const lineWidth = Math.max(0.5, r * (dot.stroke_width ?? 0.14) * 2)
      const inset = lineWidth / 2
      ctx.strokeStyle = dot.outline_color || dot.color
      ctx.lineWidth = lineWidth
      ctx.strokeRect(cx - r + inset, cy - lh + inset, (r - inset) * 2, (lh - inset) * 2)
    } else if (dot.shape === 'custom_1' || dot.shape === 'custom_2' || dot.shape === 'custom_3') {
      const slotIdx = parseInt(dot.shape.slice(-1)) - 1
      const slotKey = `custom_${slotIdx + 1}`
      const cachedImg = svgImageCache?.get(slotKey)
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        ctx.drawImage(cachedImg, cx - r, cy - r, r * 2, r * 2)
      } else {
        // Fallback: filled circle
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = dot.color
        ctx.fill()
      }
    } else {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = dot.color
      ctx.fill()
    }

    if (dotRot !== 0) ctx.restore()
  }
}

export default function Preview({
  image, dots, dotsWidth, dotsHeight, colors, loading, dotCount, error, shapeName,
  mapOpen, selectedShape, selectedParts, onShapeChange, onPartsChange, onCloseMap,
  transformActive, liveScale, liveRotation, liveXOffset = 0, liveYOffset = 0,
  baseScale = 1, baseRotation = 0, baseXOffset = 0, baseYOffset = 0,
  onTransformChange, onTransformConfirm, onTransformCancel, onDoubleClickCanvas,
  overlayImage, overlayOpacity = 0.5, transformTargetsOverlay = false,
  customSvgs,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const outerRef     = useRef<HTMLDivElement>(null)
  const svgImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const [zoom, setZoom] = useState(1.0)
  const zoomRef         = useRef(1.0)          // mirrors zoom state for stable closures
  const wrapperRef      = useRef<HTMLDivElement>(null)
  const panXRef         = useRef(0)
  const panYRef         = useRef(0)
  const spaceHeldRef    = useRef(false)
  const panStartRef     = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [containerPx, setContainerPx] = useState({ w: 1280, h: 720 })


  // Pre-load custom SVGs into image cache; re-render canvas when they update
  useEffect(() => {
    if (!customSvgs) return
    customSvgs.forEach((dataUrl, i) => {
      const key = `custom_${i + 1}`
      if (!dataUrl) {
        svgImageCacheRef.current.delete(key)
        return
      }
      const img = new Image()
      img.onload = () => {
        svgImageCacheRef.current.set(key, img)
        if (dots && canvasRef.current) {
          renderCanvas(canvasRef.current, dots, dotsWidth, dotsHeight, colors, svgImageCacheRef.current)
        }
      }
      img.src = dataUrl
    })
  }, [customSvgs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render canvas when dots or display props change
  useEffect(() => {
    if (!dots || !canvasRef.current) return
    renderCanvas(canvasRef.current, dots, dotsWidth, dotsHeight, colors, svgImageCacheRef.current)
  }, [dots, dotsWidth, dotsHeight, colors])

  // Re-render on container resize
  useEffect(() => {
    if (!dots) return
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      if (canvasRef.current) {
        renderCanvas(canvasRef.current, dots, dotsWidth, dotsHeight, colors, svgImageCacheRef.current)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [dots, dotsWidth, dotsHeight, colors])

  // Track outer container size for canvas sizing
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerPx({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Helper: write current pan refs into the wrapper's CSS transform
  function applyPan() {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform =
        `translate(calc(-50% + ${panXRef.current}px), calc(-50% + ${panYRef.current}px))`
    }
  }

  // Spacebar pan: hold Space + drag to translate the canvas wrapper
  useEffect(() => {
    const el = outerRef.current
    if (!el) return

    function setCursor(c: string) { el.style.cursor = c }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (!spaceHeldRef.current) { spaceHeldRef.current = true; setCursor('grab') }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      panStartRef.current  = null
      setCursor('')
    }
    function onMouseDown(e: MouseEvent) {
      if (!spaceHeldRef.current) return
      e.preventDefault()
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: panXRef.current, panY: panYRef.current }
      setCursor('grabbing')
    }
    function onMouseMove(e: MouseEvent) {
      if (!panStartRef.current) return
      panXRef.current = panStartRef.current.panX + (e.clientX - panStartRef.current.x)
      panYRef.current = panStartRef.current.panY + (e.clientY - panStartRef.current.y)
      applyPan()
    }
    function onMouseUp() {
      if (!panStartRef.current) return
      panStartRef.current = null
      setCursor(spaceHeldRef.current ? 'grab' : '')
    }

    window.addEventListener('keydown',   onKeyDown)
    window.addEventListener('keyup',     onKeyUp)
    el.addEventListener    ('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('keydown',   onKeyDown)
      window.removeEventListener('keyup',     onKeyUp)
      el.removeEventListener    ('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard zoom: Ctrl++ / Ctrl+- to zoom, Ctrl+0 to reset
  // Pan is scaled by the zoom ratio so the currently-visible centre stays fixed —
  // same behaviour as Photoshop's zoom.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        const oldZ = zoomRef.current
        const newZ = Math.min(5.0, oldZ * 1.25)
        const ratio = newZ / oldZ
        panXRef.current *= ratio; panYRef.current *= ratio; applyPan()
        setZoom(newZ)
      } else if (e.key === '-') {
        e.preventDefault()
        const oldZ = zoomRef.current
        const newZ = Math.max(0.25, oldZ / 1.25)
        const ratio = newZ / oldZ
        panXRef.current *= ratio; panYRef.current *= ratio; applyPan()
        setZoom(newZ)
      } else if (e.key === '0') {
        e.preventDefault()
        panXRef.current = 0; panYRef.current = 0; applyPan()
        setZoom(1.0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute canvas display size: match the old CSS (90% of available, constrained by aspect ratio)
  const ar     = dotsWidth / Math.max(1, dotsHeight)
  const pad    = 80 // 40px each side
  const availW = Math.max(1, containerPx.w - pad)
  const availH = Math.max(1, containerPx.h - pad)
  let baseH    = availH * 0.9
  let baseW    = baseH * ar
  if (baseW > availW * 0.9) { baseW = availW * 0.9; baseH = baseW / ar }
  const canvasW = Math.max(1, Math.round(baseW * zoom))
  const canvasH = Math.max(1, Math.round(baseH * zoom))
  zoomRef.current = zoom   // keep ref in sync for stable closures

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#020c24] relative">
      {/* Zoom indicator — always visible */}
      <div className="absolute bottom-3 right-4 z-50 pointer-events-none">
        <span className="text-[10px] font-mono text-[#59CEFA] bg-[#020c24]/80 px-2 py-0.5 rounded-sm">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Canvas viewport — overflow hidden; pan via Space+drag (CSS transform) */}
      <div ref={outerRef} className="flex-1 overflow-hidden relative">
          {/* Canvas wrapper — always CSS-centred; zoom grows it from that centre point */}
          <div
            ref={wrapperRef}
            className="absolute"
            style={{
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              width: canvasW, height: canvasH,
            }}
          >
            {shapeName && (
              <div className="absolute top-full left-0 mt-1.5 flex items-center gap-2 z-10 pointer-events-none">
                {FLAG_COLORS[shapeName] && (
                  <div className="flex gap-px">
                    {FLAG_COLORS[shapeName].map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
                    ))}
                  </div>
                )}
                <span className="text-xs text-[#3498C8] font-mono whitespace-nowrap">
                  {shapeName}
                  {POPULATION[shapeName] && <> · {formatPopulation(POPULATION[shapeName])}</>}
                </span>
              </div>
            )}
            {dotCount > 0 && (
              <div className="absolute top-full right-0 mt-1.5 z-10 pointer-events-none">
                <span className="text-xs text-[#3498C8] font-mono whitespace-nowrap">
                  {dotCount.toLocaleString()} dots
                </span>
              </div>
            )}

            {/* Generating label */}
            <div className="absolute -top-8 left-0 pointer-events-none z-10">
              {loading && (
                <span className="text-[10px] font-mono text-[#F4A261] tracking-widest generating-dots">Generating</span>
              )}
            </div>

            {/* Framed canvas */}
            <div
              ref={containerRef}
              className="relative border-2 border-[#59CEFA]/40 w-full h-full overflow-hidden bg-[#607D8E] select-none"
              style={{
                backgroundImage: 'linear-gradient(rgba(89,206,250,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(89,206,250,0.12) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
              onDoubleClick={e => { e.stopPropagation(); onDoubleClickCanvas?.() }}
            >
              {error && !loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-red-400 text-sm">{error}</p>
                    <p className="text-[#7CC3FB] text-xs mt-1">Check the backend is running</p>
                  </div>
                </div>
              )}

              {mapOpen && onShapeChange && onPartsChange && onCloseMap && (
                <div className="absolute inset-0 z-10">
                  <MapPicker
                    selectedShape={selectedShape ?? ''}
                    selectedParts={selectedParts ?? []}
                    onShapeChange={onShapeChange}
                    onPartsChange={onPartsChange}
                    onClose={onCloseMap}
                  />
                </div>
              )}

              {image && !dots && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    transform: (!transformTargetsOverlay && (liveXOffset !== 0 || liveYOffset !== 0))
                      ? `translate(${liveXOffset * 100}%, ${liveYOffset * 100}%)`
                      : undefined,
                  }}
                >
                  <img
                    src={image}
                    alt="Dot pattern preview"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      imageRendering: 'auto',
                      transform: (!transformTargetsOverlay && ((liveScale !== undefined && liveScale !== 1.0) || (liveRotation !== undefined && liveRotation !== 0)))
                        ? `rotate(${liveRotation ?? 0}deg) scale(${liveScale ?? 1})`
                        : undefined,
                      transformOrigin: `calc(50% + ${baseXOffset * 100}%) calc(50% + ${baseYOffset * 100}%)`,
                    }}
                  />
                </div>
              )}

              {dots && (
                <canvas ref={canvasRef} className="absolute inset-0" style={{ display: 'block' }} />
              )}

              {overlayImage && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    transform: (liveXOffset !== 0 || liveYOffset !== 0)
                      ? `translate(${liveXOffset * 100}%, ${liveYOffset * 100}%)`
                      : undefined,
                  }}
                >
                  <img
                    src={overlayImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      opacity: overlayOpacity,
                      transform: ((liveScale !== undefined && liveScale !== 1.0) || (liveRotation !== undefined && liveRotation !== 0))
                        ? `rotate(${liveRotation ?? 0}deg) scale(${liveScale ?? 1})`
                        : undefined,
                      transformOrigin: `calc(50% + ${baseXOffset * 100}%) calc(50% + ${baseYOffset * 100}%)`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* TransformOverlay lives outside overflow-hidden so handles are never clipped */}
            {transformActive && onTransformChange && onTransformConfirm && onTransformCancel && (
              <TransformOverlay
                scale={liveScale ?? 1}
                rotation={liveRotation ?? 0}
                xOffset={liveXOffset}
                yOffset={liveYOffset}
                baseScale={baseScale}
                baseRotation={baseRotation}
                baseXOffset={baseXOffset}
                baseYOffset={baseYOffset}
                onChange={onTransformChange}
                onConfirm={onTransformConfirm}
                onCancel={onTransformCancel}
                zoom={zoom}
              />
            )}
          </div>
      </div>
    </div>
  )
}
