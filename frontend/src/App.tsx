import { useEffect, useRef, useState } from 'react'
import { fetchSchemes, fetchShapes, requestDots, requestImagePreview, requestOutline } from './api'
import Collapsible from './components/Collapsible'
import DotTitle from './components/DotTitle'
import ColorOverridePanel from './components/ColorOverridePanel'
import ColorSchemePanel from './components/ColorSchemePanel'
import ExportPanel from './components/ExportPanel'
import PatternControls from './components/PatternControls'
import Preview from './components/Preview'
import ShapePanel from './components/ShapePanel'
import type { ActiveSlot, ColorConfig, CustomSvgs, DotsResult, PatternConfig, SchemeInfo, ShapeInfo } from './types'
import { DEFAULT_COLORS, DEFAULT_CUSTOM_SVGS, DEFAULT_PATTERN } from './types'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function App() {
  const [shapes, setShapes]           = useState<ShapeInfo[]>([])
  const [schemes, setSchemes]         = useState<SchemeInfo[]>([])
  const [selectedShape, setSelectedShape] = useState('')
  const [selectedShapeName, setSelectedShapeName] = useState('')
  const [selectedParts, setSelectedParts] = useState<string[]>([])
  const [pattern, setPattern]         = useState<PatternConfig>(DEFAULT_PATTERN)
  const [colors, setColors]           = useState<ColorConfig>(DEFAULT_COLORS)
  const [activeTab, setActiveTab]     = useState<'generator' | 'export'>('generator')
  const [mapOpen, setMapOpen]         = useState(false)
  const [hideShape, setHideShape]       = useState(false)
  const [fillCanvas, setFillCanvas]     = useState(false)
  const [dotsCreated, setDotsCreated]   = useState(false)
  const [patternTrigger, setPatternTrigger] = useState(0)

  const [transformActive, setTransformActive] = useState(false)
  const [liveScale, setLiveScale] = useState(1.0)
  const [liveRotation, setLiveRotation] = useState(0)
  const [liveXOffset, setLiveXOffset] = useState(0)
  const [liveYOffset, setLiveYOffset] = useState(0)

  const [textureTransformActive, setTextureTransformActive] = useState(false)
  const [textureTransformPending, setTextureTransformPending] = useState(false)
  const [textureLiveScale, setTextureLiveScale] = useState(1.0)
  const [textureLiveRotation, setTextureLiveRotation] = useState(0)
  const [textureLiveXOffset, setTextureLiveXOffset] = useState(0)
  const [textureLiveYOffset, setTextureLiveYOffset] = useState(0)
  // True while the UI is active OR while we're waiting for the new image to arrive
  // after confirm — keeps the CSS transform on the overlay so it doesn't pop back.
  const textureTransformDisplaying = textureTransformActive || textureTransformPending

  const [showShapeOverlay, setShowShapeOverlay] = useState(true)
  const [shapeOpacity, setShapeOpacity] = useState(0.2)
  const [patternVisible, setPatternVisible] = useState(true)

  const [customSvgs, setCustomSvgs] = useState<CustomSvgs>(DEFAULT_CUSTOM_SVGS)
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>({ type: 'fill', index: 0 })

  const [imagePreviewData, setImagePreviewData] = useState<string | null>(null)
  const [showImagePreview, setShowImagePreview] = useState(false)

  const [previewImage, setPreviewImage]     = useState<string | null>(null)
  const [shapeOutlineImage, setShapeOutlineImage] = useState<string | null>(null)
  const [dotsResult, setDotsResult]         = useState<DotsResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [previewError, setPreviewError]     = useState('')
  const [dotCount, setDotCount]             = useState(0)
  const previewSizeRef = useRef<{ w: number; h: number }>({ w: 100, h: 100 })

  const debouncedShape   = useDebounce(selectedShape, 150)
  const debouncedParts   = useDebounce(selectedParts, 150)
  const debouncedPattern = useDebounce(pattern, 600)
  const debouncedColors  = useDebounce(colors, 600)
  const abortRef = useRef<AbortController | null>(null)
  const outlineAbortRef = useRef<AbortController | null>(null)
  const outlineImageAbortRef = useRef<AbortController | null>(null)

  // True once the user touches Pattern or Color controls after selecting a shape.
  // Resets to false whenever a new shape is picked.
  const patternDirtyRef = useRef(false)
  // Set to true by transform confirm handlers; cleared by the dots useEffect once
  // the regenerated dot pattern arrives — that's when overlays hide.
  const hideOverlaysAfterDotsRef = useRef(false)

  useEffect(() => {
    fetchShapes().then(setShapes).catch(console.error)
    fetchSchemes().then(setSchemes).catch(console.error)
  }, [])

  // Outline — fires on shape select (and aspect/offset tweaks before user touches pattern)
  useEffect(() => {
    if (!debouncedShape || patternDirtyRef.current || hideShape) return
    outlineAbortRef.current?.abort()
    const ctrl = new AbortController()
    outlineAbortRef.current = ctrl
    setPreviewLoading(true)
    setPreviewError('')

    const isUpload = debouncedShape.startsWith('upload_')
    requestOutline(debouncedShape, debouncedPattern, debouncedColors, 2500, debouncedParts)
      .then((res) => {
        if (ctrl.signal.aborted) return
        previewSizeRef.current = { w: res.width, h: res.height }
        setShapeOutlineImage(res.image)
        if (isUpload) {
          // Set previewImage as fallback (shown when no dots exist yet)
          // shapeOutlineImage shows as 20% overlay when dots exist
          setPreviewImage(res.image)
          setPreviewLoading(false)
        } else {
          setPreviewImage(res.image)
          setDotsResult(null)
          setDotCount(0)
          setPreviewLoading(false)
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setPreviewError(err.message ?? 'Outline failed')
        setPreviewLoading(false)
      })
    return () => ctrl.abort()
  }, [debouncedShape, debouncedParts, debouncedPattern.aspect_ratio, debouncedPattern.x_offset, debouncedPattern.y_offset, debouncedPattern.mask_invert, hideShape])

  // Dot pattern — fires once the user has touched pattern or color controls
  useEffect(() => {
    if ((!debouncedShape && !fillCanvas) || !patternDirtyRef.current || hideShape) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPreviewLoading(true)
    setPreviewError('')

    requestDots(debouncedShape, debouncedPattern, debouncedColors, debouncedParts, fillCanvas, dotsCreated && !fillCanvas && !!debouncedShape)
      .then((res) => {
        if (ctrl.signal.aborted) return
        setDotsResult(res)
        setDotCount(res.dot_count)
        setPreviewImage(null)
        setPreviewLoading(false)
        if (hideOverlaysAfterDotsRef.current) {
          setShowImagePreview(false)
          setShowShapeOverlay(false)
          hideOverlaysAfterDotsRef.current = false
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setPreviewError(err.message ?? 'Preview failed')
        setPreviewLoading(false)
      })
    return () => ctrl.abort()
  }, [debouncedShape, debouncedParts, debouncedPattern, debouncedColors, hideShape, fillCanvas, patternTrigger])

  // Fallback: keep shapeOutlineImage fresh when shape/parts change while dots exist.
  useEffect(() => {
    if (!debouncedShape) { setShapeOutlineImage(null); return }
    if (!dotsCreated) return
    outlineImageAbortRef.current?.abort()
    const ctrl = new AbortController()
    outlineImageAbortRef.current = ctrl
    requestOutline(debouncedShape, debouncedPattern, debouncedColors, 1000, debouncedParts)
      .then((res) => { if (!ctrl.signal.aborted) setShapeOutlineImage(res.image) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [debouncedShape, debouncedParts, dotsCreated, debouncedPattern.mask_invert])

  // Image preview — re-fetch when adjustment sliders change while active
  useEffect(() => {
    if (!showImagePreview || !debouncedPattern.size_mod_image_id) return
    requestImagePreview(debouncedShape, debouncedPattern, debouncedColors, 800, debouncedParts)
      .then(res => setImagePreviewData(res.image))
      .catch(() => {})
  }, [showImagePreview, debouncedPattern.size_mod_image_hue, debouncedPattern.size_mod_image_saturation, debouncedPattern.size_mod_image_contrast, debouncedPattern.size_mod_image_id])

  async function handleToggleImagePreview() {
    if (showImagePreview) {
      setShowImagePreview(false)
      return
    }
    if (!pattern.size_mod_image_id) return
    try {
      const res = await requestImagePreview(selectedShape, pattern, colors, 800, selectedParts)
      setImagePreviewData(res.image)
      setShowImagePreview(true)
    } catch { /* ignore */ }
  }

  function handlePatternChange(p: PatternConfig) {
    if (!selectedShape.startsWith('upload_') || dotsCreated) patternDirtyRef.current = true
    hideOverlaysAfterDotsRef.current = false
    setPattern(p)
  }

  function handleColorsChange(c: ColorConfig) {
    if (!selectedShape.startsWith('upload_')) patternDirtyRef.current = true
    hideOverlaysAfterDotsRef.current = false
    setColors(c)
  }

  function applyColorToActiveSlot(hex: string) {
    const fillColors   = colors.fill_colors?.length   ? colors.fill_colors   : [colors.colors[0] ?? '#00A4EF']
    const outlineColors = colors.outline_colors?.length ? colors.outline_colors : [colors.outline_color || colors.colors[1] || '#737373']
    const dotdotColors  = colors.dot_dot_colors?.length ? colors.dot_dot_colors : ['#00A4EF']
    const innerColors   = colors.inner_colors?.length   ? colors.inner_colors   : [colors.inner_color || colors.colors[2] || '#FFFFFF']
    let updated: ColorConfig
    if (activeSlot.type === 'fill') {
      const next = [...fillColors]; next[activeSlot.index] = hex
      updated = { ...colors, fill_colors: next }
    } else if (activeSlot.type === 'outline') {
      const next = [...outlineColors]; next[activeSlot.index] = hex
      updated = { ...colors, outline_colors: next, outline_color: next[0] }
    } else if (activeSlot.type === 'dotdot') {
      const next = [...dotdotColors]; next[activeSlot.index] = hex
      updated = { ...colors, dot_dot_colors: next }
    } else if (activeSlot.type === 'grad_fill') {
      updated = { ...colors, [activeSlot.index === 0 ? 'gradient_fill_start' : 'gradient_fill_end']: hex }
    } else if (activeSlot.type === 'grad_outline') {
      updated = { ...colors, [activeSlot.index === 0 ? 'gradient_outline_start' : 'gradient_outline_end']: hex }
    } else if (activeSlot.type === 'grad_dotdot') {
      updated = { ...colors, [activeSlot.index === 0 ? 'gradient_dotdot_start' : 'gradient_dotdot_end']: hex }
    } else if (activeSlot.type === 'background') {
      updated = { ...colors, background: hex, background_gradient: null }
    } else {
      const next = [...innerColors]; next[activeSlot.index] = hex
      updated = { ...colors, inner_colors: next, inner_color: next[0] }
    }
    handleColorsChange(updated)
  }

  function handleApplyPreset(p: PatternConfig, c: ColorConfig) {
    patternDirtyRef.current = true

    // When a shape is established, carry over shape transform and all texture/image
    // settings so the silhouette and uploaded texture stay aligned.
    const preserved = selectedShape ? {
      transform_scale:             pattern.transform_scale,
      transform_rotation:          pattern.transform_rotation,
      x_offset:                    pattern.x_offset,
      y_offset:                    pattern.y_offset,
      size_mod_mode:               pattern.size_mod_mode,
      size_mod_image_id:           pattern.size_mod_image_id,
      size_mod_image_scale:        pattern.size_mod_image_scale,
      size_mod_image_fill:         pattern.size_mod_image_fill,
      size_mod_image_rotation:     pattern.size_mod_image_rotation,
      size_mod_image_x_offset:     pattern.size_mod_image_x_offset,
      size_mod_image_y_offset:     pattern.size_mod_image_y_offset,
      size_mod_image_hue:          pattern.size_mod_image_hue,
      size_mod_image_saturation:   pattern.size_mod_image_saturation,
      size_mod_image_contrast:     pattern.size_mod_image_contrast,
      size_mod_image_levels_low:   pattern.size_mod_image_levels_low,
      size_mod_image_levels_mid:   pattern.size_mod_image_levels_mid,
      size_mod_image_levels_high:  pattern.size_mod_image_levels_high,
    } : {}

    const merged = { ...DEFAULT_PATTERN, ...p, ...preserved }
    setPattern(merged)
    setColors(c)
    setHideShape(false)
    // If a shape is already applied, preserve the current fill/shape mode so the
    // preset takes effect immediately without the user needing to re-apply the shape.
    if (!selectedShape || !dotsCreated) {
      setFillCanvas(true)
      setDotsCreated(true)
    }
    setPatternTrigger(t => t + 1)
    if (selectedShape) {
      requestOutline(selectedShape, merged, c, 1000, selectedParts)
        .then(res => setShapeOutlineImage(res.image))
        .catch(() => {})
    }
  }

  function handleClearAll() {
    patternDirtyRef.current = false
    hideOverlaysAfterDotsRef.current = false
    setPattern(DEFAULT_PATTERN)
    setColors(DEFAULT_COLORS)
    setSelectedShape('')
    setSelectedShapeName('')
    setSelectedParts([])
    setPreviewImage(null)
    setShapeOutlineImage(null)
    setDotsResult(null)
    setDotCount(0)
    setPreviewError('')
    setPreviewLoading(false)
    setFillCanvas(false)
    setDotsCreated(false)
    setHideShape(false)

    setShowShapeOverlay(true)
    setShapeOpacity(0.2)
    setPatternVisible(true)
    setImagePreviewData(null)
    setShowImagePreview(false)
    setTransformActive(false)
    setTextureTransformActive(false)
    setTextureTransformPending(false)
    setLiveScale(1.0); setLiveRotation(0); setLiveXOffset(0); setLiveYOffset(0)
    setTextureLiveScale(1.0); setTextureLiveRotation(0); setTextureLiveXOffset(0); setTextureLiveYOffset(0)
    setCustomSvgs(DEFAULT_CUSTOM_SVGS)
  }

  function handleCreatePattern() {
    patternDirtyRef.current = true
    setPattern(DEFAULT_PATTERN)
    setColors(DEFAULT_COLORS)
    setHideShape(false)
    setFillCanvas(true)
    setDotsCreated(true)
    setPatternTrigger(t => t + 1)
    if (selectedShape) {
      requestOutline(selectedShape, DEFAULT_PATTERN, DEFAULT_COLORS, 1000, selectedParts)
        .then(res => setShapeOutlineImage(res.image))
        .catch(() => {})
    }
  }

  function handleApplyShape() {
    if (!selectedShape) return
    patternDirtyRef.current = true
    hideOverlaysAfterDotsRef.current = false
    setFillCanvas(f => !f)
    setDotsCreated(true)
    setShowShapeOverlay(false)

    setPatternTrigger(t => t + 1)
    requestOutline(selectedShape, pattern, colors, 1000, selectedParts)
      .then(res => setShapeOutlineImage(res.image))
      .catch(() => {})
  }

  function handleHideShape(hide: boolean) {
    setHideShape(hide)
    if (hide) {
      setDotsResult(null)
      const bg = colors.background || '#EAEAEA'
      const { w, h } = previewSizeRef.current
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h) }
      setPreviewImage(canvas.toDataURL('image/png'))
    } else {
      patternDirtyRef.current = false   // re-trigger outline on unhide
    }
  }

  function handlePartsChange(parts: string[], shapeId: string, shapeName: string) {
    if (dotsCreated) {
      // Keep pattern visible — just update shape/parts and re-render dots + overlay
      patternDirtyRef.current = true
      setSelectedParts(parts)
      setSelectedShape(shapeId)
      setSelectedShapeName(shapeName)
      setPatternTrigger(t => t + 1)
      requestOutline(shapeId, pattern, colors, 1000, parts)
        .then(res => setShapeOutlineImage(res.image))
        .catch(() => {})
    } else {
      patternDirtyRef.current = false
      setSelectedParts(parts)
      setSelectedShape(shapeId)
      setSelectedShapeName(shapeName)
      setPreviewImage(null)
      setDotsResult(null)
      setShowShapeOverlay(true)
    }
  }

  async function handleDoubleClickCanvas() {
    // Texture transform: available whenever an image is uploaded; auto-shows the preview
    if (pattern.size_mod_image_id) {
      if (!imagePreviewData) {
        try {
          const res = await requestImagePreview(selectedShape, pattern, colors, 800, selectedParts)
          setImagePreviewData(res.image)
        } catch { /* ignore */ }
      }
      setShowImagePreview(true)
      setTextureLiveScale(1.0)
      setTextureLiveRotation(0)
      setTextureLiveXOffset(0)
      setTextureLiveYOffset(0)
      setTextureTransformActive(true)
      return
    }
    // Shape transform: only available after a pattern has been created
    if (!dotsCreated) return
    setLiveScale(1.0)
    setLiveRotation(0)
    setLiveXOffset(0)
    setLiveYOffset(0)
    setShowShapeOverlay(true)
    setTransformActive(true)
  }

  function handleTransformChange(scale: number, rotation: number, xOffset: number, yOffset: number) {
    setLiveScale(scale)
    setLiveRotation(rotation)
    setLiveXOffset(xOffset)
    setLiveYOffset(yOffset)
  }

  function handleTransformConfirm() {
    // Cumulative: multiply scale, add rotation, add offsets on top of whatever the pattern already has.
    const newScale    = Math.min(4.0, Math.max(0.1, pattern.transform_scale * liveScale))
    const newRotation = pattern.transform_rotation + liveRotation
    const newXOffset  = Math.max(-0.5, Math.min(0.5, pattern.x_offset + liveXOffset))
    const newYOffset  = Math.max(-0.5, Math.min(0.5, pattern.y_offset + liveYOffset))
    // Only mark dirty when dots already exist — this lets debouncedPattern trigger
    // a re-render of the dot pattern naturally (via the debounce) once it catches up.
    // For shape-only / no-dots cases we don't want dots auto-generated here.
    if (dotsCreated) patternDirtyRef.current = true
    // Close the overlay immediately so interaction feels responsive.
    // DO NOT update pattern or reset live values here — if base values change before
    // live values reset, the CSS transform pivot shifts and the shape appears to jump.
    // Instead, batch all updates together once the new outline image arrives.
    setTransformActive(false)
    if (selectedShape) {
      requestOutline(selectedShape, { ...pattern, transform_scale: newScale, transform_rotation: newRotation, x_offset: newXOffset, y_offset: newYOffset }, colors, 1000, selectedParts)
        .then(res => {
          // All updates in one React batch: new image + new base + live reset.
          // previewImage is also updated so the no-dots path reflects the new position
          // immediately (the outline useEffect is blocked by patternDirtyRef and won't
          // re-run on its own).
          // NOTE: do NOT call setPatternTrigger here. debouncedPattern fires the dot
          // useEffect naturally once its 600 ms debounce resolves, ensuring dots
          // regenerate with the correct NEW values instead of the stale debounced ones.
          setShapeOutlineImage(res.image)
          setPreviewImage(res.image)
          setPattern(p => ({ ...p, transform_scale: newScale, transform_rotation: newRotation, x_offset: newXOffset, y_offset: newYOffset }))
          if (dotsCreated) hideOverlaysAfterDotsRef.current = true
          setLiveScale(1.0); setLiveRotation(0); setLiveXOffset(0); setLiveYOffset(0)
        })
        .catch(() => {
          setPattern(p => ({ ...p, transform_scale: newScale, transform_rotation: newRotation, x_offset: newXOffset, y_offset: newYOffset }))
          if (dotsCreated) hideOverlaysAfterDotsRef.current = true
          setLiveScale(1.0); setLiveRotation(0); setLiveXOffset(0); setLiveYOffset(0)
        })
    } else {
      setPattern(p => ({ ...p, transform_scale: newScale, transform_rotation: newRotation, x_offset: newXOffset, y_offset: newYOffset }))
      setLiveScale(1.0); setLiveRotation(0); setLiveXOffset(0); setLiveYOffset(0)
    }
  }

  function handleTransformCancel() {
    setTransformActive(false)
    setLiveScale(1.0)
    setLiveRotation(0)
    setLiveXOffset(0)
    setLiveYOffset(0)
  }

  function handleTextureTransformChange(scale: number, rotation: number, xOffset: number, yOffset: number) {
    setTextureLiveScale(scale)
    setTextureLiveRotation(rotation)
    setTextureLiveXOffset(xOffset)
    setTextureLiveYOffset(yOffset)
  }

  function handleTextureTransformConfirm() {
    const newScale    = Math.min(20.0, Math.max(0.01, pattern.size_mod_image_scale * textureLiveScale))
    const newRotation = (pattern.size_mod_image_rotation ?? 0) + textureLiveRotation
    const newXOffset  = Math.max(-0.5, Math.min(0.5, (pattern.size_mod_image_x_offset ?? 0) + textureLiveXOffset))
    const newYOffset  = Math.max(-0.5, Math.min(0.5, (pattern.size_mod_image_y_offset ?? 0) + textureLiveYOffset))
    patternDirtyRef.current = true
    setTextureTransformActive(false)
    setTextureTransformPending(true)
    const newPattern = { ...pattern, size_mod_image_scale: newScale, size_mod_image_rotation: newRotation, size_mod_image_x_offset: newXOffset, size_mod_image_y_offset: newYOffset }
    requestImagePreview(selectedShape, newPattern, colors, 800, selectedParts)
      .then(res => {
        setImagePreviewData(res.image)
        setPattern(newPattern)
        setTextureTransformPending(false)
        hideOverlaysAfterDotsRef.current = true
        setTextureLiveScale(1.0); setTextureLiveRotation(0); setTextureLiveXOffset(0); setTextureLiveYOffset(0)
      })
      .catch(() => {
        setPattern(newPattern)
        setTextureTransformPending(false)
        hideOverlaysAfterDotsRef.current = true
        setTextureLiveScale(1.0); setTextureLiveRotation(0); setTextureLiveXOffset(0); setTextureLiveYOffset(0)
      })
  }

  function handleTextureTransformCancel() {
    setTextureTransformActive(false)
    setTextureLiveScale(1.0)
    setTextureLiveRotation(0)
    setTextureLiveXOffset(0)
    setTextureLiveYOffset(0)
  }

  return (
    <div className="flex h-screen bg-[#020c24] text-white overflow-hidden font-sans">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar w-[340px] flex-shrink-0 bg-[#020c24] border-r border-[#0a2555]
                        flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#0a2555] flex-shrink-0">
          {/* Main tabs */}
          <div className="flex w-full">
            {(['generator', 'export'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-xs font-medium capitalize tracking-widest transition-colors border-b-2
                  ${activeTab === tab
                    ? 'text-[#59CEFA] border-[#59CEFA]'
                    : 'text-[#7CC3FB] border-transparent hover:text-[#D0F2FE]'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Generator controls */}
        {activeTab === 'generator' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
            <Collapsible title="Shape">
              <ShapePanel
                shapes={shapes}
                selectedShape={selectedShape}
                selectedParts={selectedParts}
                pattern={pattern}
                onPatternChange={handlePatternChange}
                onOpenMap={() => setMapOpen(true)}
                mapOpen={mapOpen}
                onShapeChange={(id, label) => {
                  if (id.startsWith('upload_')) {
                    // New silhouette: keep existing dots visible underneath, show outline as overlay
                    patternDirtyRef.current = false
                    setSelectedShape(id)
                    setSelectedShapeName(label)
                    setSelectedParts([])
                    setPreviewImage(null)
                    setShapeOutlineImage(null)
                    setShowShapeOverlay(true)
                    // Outline effect fires automatically (patternDirty=false) and sets shapeOutlineImage
                  } else if (dotsCreated && id) {
                    // Map shape with dots — auto-trigger regeneration
                    patternDirtyRef.current = true
                    setSelectedShape(id)
                    setSelectedShapeName(label)
                    setSelectedParts([])
                    setPatternTrigger(t => t + 1)
                    requestOutline(id, pattern, colors, 1000, [])
                      .then(res => setShapeOutlineImage(res.image))
                      .catch(() => {})
                  } else {
                    // Clear (id='') or fresh shape with no dots
                    patternDirtyRef.current = false
                    setSelectedShape(id)
                    setSelectedShapeName(label)
                    setSelectedParts([])
                    setPreviewImage(null)
                    setShapeOutlineImage(null)
                    setShowShapeOverlay(true)
                  }
                }}
                onPartsChange={handlePartsChange}
              />
            </Collapsible>
            <div className="border-t border-[#0a2555]" />
            <Collapsible title="Pattern">
              <PatternControls pattern={pattern} onChange={handlePatternChange} colors={colors} onColorsChange={handleColorsChange} onCreatePattern={handleCreatePattern} onClearAll={handleClearAll} onApplyPreset={handleApplyPreset} onApplyShape={handleApplyShape} hasShape={!!selectedShape} shapeApplied={dotsCreated && !!selectedShape && !fillCanvas} shapeOpacity={shapeOpacity} onShapeOpacityChange={setShapeOpacity} patternVisible={patternVisible} onPatternVisibilityChange={setPatternVisible} imagePreviewActive={showImagePreview} onToggleImagePreview={handleToggleImagePreview} customSvgs={customSvgs} onCustomSvgsChange={setCustomSvgs} activeSlot={activeSlot} onActiveSlotChange={setActiveSlot} />
            </Collapsible>
            <div className="border-t border-[#0a2555]" />
            <Collapsible title="Color Override">
              <ColorOverridePanel colors={colors} onChange={handleColorsChange} onApplySingleColor={applyColorToActiveSlot} />
            </Collapsible>
          </div>
        )}

        {/* Export controls */}
        {activeTab === 'export' && (
          <div className="flex-1 overflow-y-auto">
            <ExportPanel
              shape={selectedShape}
              shapeName={selectedShapeName}
              pattern={pattern}
              colors={colors}
              disabled={!dotsCreated}
              dotsResult={dotsResult}
              onExportingChange={setIsExporting}
            />
          </div>
        )}
      </aside>

      {/* ── Main area ───────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-shrink-0 flex items-center justify-end px-5 py-3 border-b border-[#0a2555]">
          <DotTitle text="DOTDASHER" loading={previewLoading || isExporting} />
        </div>
        <Preview
          image={previewImage}
          dots={patternVisible ? (dotsResult?.dots ?? null) : null}
          dotsWidth={dotsResult?.width ?? 1778}
          dotsHeight={dotsResult?.height ?? 1000}
          colors={colors}
          loading={previewLoading}
          dotCount={dotCount}
          error={previewError}
          shapeName={selectedShapeName}
          mapOpen={mapOpen}
          selectedShape={selectedShape}
          selectedParts={selectedParts}
          onShapeChange={(id, label) => {
            if (dotsCreated && id) {
              patternDirtyRef.current = true
              setSelectedShape(id); setSelectedShapeName(label); setSelectedParts([])
              setPatternTrigger(t => t + 1)
              requestOutline(id, pattern, colors, 1000, [])
                .then(res => setShapeOutlineImage(res.image)).catch(() => {})
            } else {
              setSelectedShape(id); setSelectedShapeName(label); setSelectedParts([])
              patternDirtyRef.current = false; setPreviewImage(null); setDotsResult(null)
            }
          }}
          onPartsChange={handlePartsChange}
          onCloseMap={() => setMapOpen(false)}
          transformActive={transformActive || textureTransformActive}
          liveScale={textureTransformDisplaying ? textureLiveScale : liveScale}
          liveRotation={textureTransformDisplaying ? textureLiveRotation : liveRotation}
          liveXOffset={textureTransformDisplaying ? textureLiveXOffset : liveXOffset}
          liveYOffset={textureTransformDisplaying ? textureLiveYOffset : liveYOffset}
          baseScale={textureTransformDisplaying ? pattern.size_mod_image_scale : pattern.transform_scale}
          baseRotation={textureTransformDisplaying ? (pattern.size_mod_image_rotation ?? 0) : pattern.transform_rotation}
          baseXOffset={textureTransformDisplaying ? (pattern.size_mod_image_x_offset ?? 0) : pattern.x_offset}
          baseYOffset={textureTransformDisplaying ? (pattern.size_mod_image_y_offset ?? 0) : pattern.y_offset}
          onTransformChange={textureTransformActive ? handleTextureTransformChange : handleTransformChange}
          onTransformConfirm={textureTransformActive ? handleTextureTransformConfirm : handleTransformConfirm}
          onTransformCancel={textureTransformActive ? handleTextureTransformCancel : handleTransformCancel}
          transformTargetsOverlay={textureTransformDisplaying}
          onDoubleClickCanvas={handleDoubleClickCanvas}
          overlayImage={showImagePreview && imagePreviewData ? imagePreviewData : (showShapeOverlay && !!selectedShape ? shapeOutlineImage : null)}
          overlayOpacity={shapeOpacity}
          customSvgs={customSvgs}
        />
      </main>
    </div>
  )
}

function DotIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="7"  cy="7"  r="3.5" fill="#00A4EF" />
      <circle cx="17" cy="7"  r="2.5" fill="#737373" />
      <circle cx="12" cy="16" r="3.5" fill="#00A4EF" />
      <circle cx="21" cy="18" r="2.5" fill="#737373" />
      <circle cx="5"  cy="20" r="2"   fill="#737373" />
    </svg>
  )
}
