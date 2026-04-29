import React, { useRef, useEffect, useState } from 'react'
import type { ActiveSlot, AspectRatio, ColorConfig, CustomSvgs, GradientConfig, PatternConfig } from '../types'
import { uploadSizeMap } from '../api'
import ColorPicker from './ColorPicker'

const DEFAULT_PRESETS: { label: string; pattern: PatternConfig; colors: ColorConfig }[] = [
  {
    label: 'Preset 01',
    pattern: {
      grid_spacing: 7.5,
      grid_spacing_x: 0,
      grid_spacing_y: 0,
      dot_radius: 0.37,
      jitter: 0,
      row_offset_x: 0,
      row_offset_y: 0,
      edge_fade: true,
      edge_fade_cells: 2.0,
      dot_shape: 'circle_dot',
      dot_shapes: ['circle_dot', 'circle_outline'],
      element_scales: { circle: 1.0, circle_dot: 1.0, circle_outline: 0.60 },
      outline_stroke: 0.18,
      seed: 42,
      aspect_ratio: '16:9' as AspectRatio,
      x_offset: 0,
      y_offset: 0,
      transform_rotation: 0,
      transform_scale: 1.0,
      size_mod_mode: 'off',
      size_mod_noise_type: 'smooth' as const,
      size_mod_strength: 1.0,
      size_mod_scale: 0.05,
      size_mod_invert: false,
      size_mod_seed: 0,
      size_mod_image_scale: 1.0,
      size_mod_image_fill: false,
      size_mod_image_id: '',
      size_mod_image_hue: 0,
      size_mod_image_saturation: 1.0,
      size_mod_image_contrast: 1.0,
      size_mod_image_levels_low: 0.0,
      size_mod_image_levels_mid: 0.5,
      size_mod_image_levels_high: 1.0,
      size_mod_image_rotation: 0,
      size_mod_image_x_offset: 0,
      size_mod_image_y_offset: 0,
      mask_invert: false,
    },
    colors: {
      colors: ['#00A4EF', '#737373', '#FFFFFF'],
      ratios: [0.5, 0.5, 0],
      background: '#EAEAEA',
      fill_colors: ['#00A4EF', '#737373'],
      outline_color: '#FFFFFF',
      inner_color: '#FFFFFF',
    },
  },
  {
    label: 'Preset 02',
    pattern: {
      grid_spacing: 10.5,
      grid_spacing_x: 0,
      grid_spacing_y: 0,
      dot_radius: 0.61,
      jitter: 0.0,
      row_offset_x: 0.45,
      row_offset_y: 0.0,
      edge_fade: false,
      edge_fade_cells: 2.0,
      dot_shape: 'triangle',
      dot_shapes: ['triangle', 'triangle_dot', 'triangle_outline'],
      element_scales: { circle: 1.0, circle_dot: 1.0, circle_outline: 1.0 },
      outline_stroke: 0.06,
      seed: 42,
      aspect_ratio: '16:9' as AspectRatio,
      x_offset: 0,
      y_offset: 0,
      transform_rotation: 0,
      transform_scale: 1.0,
      size_mod_mode: 'off',
      size_mod_noise_type: 'smooth' as const,
      size_mod_strength: 1.0,
      size_mod_scale: 0.05,
      size_mod_invert: false,
      size_mod_seed: 0,
      size_mod_image_scale: 1.0,
      size_mod_image_fill: false,
      size_mod_image_id: '',
      size_mod_image_hue: 0,
      size_mod_image_saturation: 1.0,
      size_mod_image_contrast: 1.0,
      size_mod_image_levels_low: 0.0,
      size_mod_image_levels_mid: 0.5,
      size_mod_image_levels_high: 1.0,
      size_mod_image_rotation: 0,
      size_mod_image_x_offset: 0,
      size_mod_image_y_offset: 0,
      mask_invert: false,
    },
    colors: {
      colors: ['#00A4EF', '#737373'],
      ratios: [0.60, 0.40],
      background: '#C8DCF0',
      fill_colors: ['#00A4EF'],
      outline_color: '#00A4EF',
      inner_color: '#FFFFFF',
    },
  },
]


const DEFAULT_GRADIENT: GradientConfig = { start: '#C8D8E8', end: '#002060', direction: 'h' }

interface Props {
  pattern: PatternConfig
  onChange: (p: PatternConfig) => void
  colors: ColorConfig
  onColorsChange: (c: ColorConfig) => void
  onCreatePattern: () => void
  onClearAll: () => void
  onApplyPreset: (pattern: PatternConfig, colors: ColorConfig) => void
  onApplyShape: () => void
  hasShape: boolean
  shapeApplied: boolean
  patternVisible: boolean
  onPatternVisibilityChange: (v: boolean) => void
  shapeOpacity: number
  onShapeOpacityChange: (v: number) => void
  imagePreviewActive: boolean
  onToggleImagePreview: () => void
  customSvgs: CustomSvgs
  onCustomSvgsChange: (s: CustomSvgs) => void
  activeSlot: ActiveSlot
  onActiveSlotChange: (s: ActiveSlot) => void
}


function LevelsSlider({
  low,
  mid,
  high,
  onChange,
}: {
  low: number
  mid: number   // 0–1, 0.5 = neutral gamma
  high: number
  onChange: (low: number, mid: number, high: number) => void
}) {
  const trackRef = React.useRef<HTMLDivElement>(null)

  function startDrag(which: 'low' | 'mid' | 'high') {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      function onMove(ev: MouseEvent) {
        if (!trackRef.current) return
        const rect = trackRef.current.getBoundingClientRect()
        const t = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        if (which === 'low') {
          onChange(Math.min(t, high - 0.04), mid, high)
        } else if (which === 'high') {
          onChange(low, mid, Math.max(t, low + 0.04))
        } else {
          // mid is stored as a fraction of the [low, high] range
          const range = high - low
          const newMid = range > 0 ? Math.max(0.02, Math.min(0.98, (t - low) / range)) : 0.5
          onChange(low, newMid, high)
        }
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  const lowPct  = low  * 100
  const highPct = high * 100
  // midPct is the absolute track position of the midtone handle
  const midPct  = (low + mid * (high - low)) * 100

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-[#A0D8F8]">Levels</span>
        <span className="text-[10px] text-brand-cyan font-mono">
          {Math.round(low * 255)} · {Math.round(mid * 100)}% · {Math.round(high * 255)}
        </span>
      </div>
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-4 rounded-sm select-none"
        style={{ background: 'linear-gradient(to right, #000000, #ffffff)' }}
      >
        {/* Left clip overlay */}
        <div
          className="absolute top-0 left-0 h-full bg-black/60 pointer-events-none rounded-l-sm"
          style={{ width: `${lowPct}%` }}
        />
        {/* Right clip overlay */}
        <div
          className="absolute top-0 right-0 h-full bg-white/60 pointer-events-none rounded-r-sm"
          style={{ width: `${100 - highPct}%` }}
        />
        {/* Shadow handle (black point) */}
        <div
          className="absolute top-0 h-full cursor-ew-resize"
          style={{ left: `${lowPct}%`, transform: 'translateX(-50%)' }}
          onMouseDown={startDrag('low')}
        >
          <div className="w-2.5 h-full border border-[#ffffff55] bg-[#111] shadow-md" />
        </div>
        {/* Midtone handle (gamma) */}
        <div
          className="absolute top-0 h-full cursor-ew-resize"
          style={{ left: `${midPct}%`, transform: 'translateX(-50%)' }}
          onMouseDown={startDrag('mid')}
        >
          <div className="w-2.5 h-full border border-[#00000066] bg-[#888] shadow-md" />
        </div>
        {/* Highlight handle (white point) */}
        <div
          className="absolute top-0 h-full cursor-ew-resize"
          style={{ left: `${highPct}%`, transform: 'translateX(-50%)' }}
          onMouseDown={startDrag('high')}
        >
          <div className="w-2.5 h-full border border-[#00000044] bg-[#eee] shadow-md" />
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  typeMin,
  typeMax,
  editFormat,
  editParse,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
  typeMin?: number
  typeMax?: number
  editFormat?: (v: number) => string
  editParse?: (s: string) => number
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const pct = Math.min(100, ((value - min) / (max - min)) * 100)

  function commitDraft() {
    const parsed = editParse ? editParse(draft) : parseFloat(draft)
    if (!isNaN(parsed)) {
      onChange(Math.max(typeMin ?? min, Math.min(typeMax ?? max, parsed)))
    }
    setEditing(false)
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs text-[#A0D8F8]">{label}</label>
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setEditing(false) }}
            className="w-16 bg-[#0d3068] border border-brand-cyan px-1.5 py-0 text-xs text-white font-mono text-right focus:outline-none"
          />
        ) : (
          <span
            className="text-xs text-brand-cyan font-mono cursor-text hover:underline"
            title="Click to type a value"
            onClick={() => {
              setDraft(editFormat ? editFormat(value) : String(value))
              setEditing(true)
            }}
          >
            {format ? format(value) : value}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        style={{ '--range-pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

// ── Gradient strip with draggable stop handles ────────────────────────────────
interface GradStripProps {
  startColor: string
  endColor: string
  stop0: number
  stop1: number
  isActiveStart: boolean
  isActiveEnd: boolean
  onClickStart: () => void
  onClickEnd: () => void
  onStop0Change: (v: number) => void
  onStop1Change: (v: number) => void
}

function GradientStripRow({ startColor, endColor, stop0, stop1, isActiveStart, isActiveEnd, onClickStart, onClickEnd, onStop0Change, onStop1Change }: GradStripProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'s0' | 's1' | null>(null)

  // Local state for instant visual feedback — parent only updated on mouseup
  const [localS0, setLocalS0] = useState(stop0)
  const [localS1, setLocalS1] = useState(stop1)

  // Sync from parent when not dragging (e.g. preset load)
  useEffect(() => { if (!dragging.current) { setLocalS0(stop0); setLocalS1(stop1) } }, [stop0, stop1])

  const localRef = useRef({ s0: stop0, s1: stop1, onStop0Change, onStop1Change })
  localRef.current = { s0: localS0, s1: localS1, onStop0Change, onStop1Change }

  function getT(clientX: number) {
    if (!stripRef.current) return 0
    const rect = stripRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const t = getT(e.clientX)
      const { s0, s1 } = localRef.current
      if (dragging.current === 's0') setLocalS0(Math.min(t, s1 - 0.04))
      else setLocalS1(Math.max(t, s0 + 0.04))
    }
    function onUp() {
      if (!dragging.current) return
      const { s0, s1, onStop0Change: cb0, onStop1Change: cb1 } = localRef.current
      if (dragging.current === 's0') cb0(s0)
      else cb1(s1)
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  return (
    <div>
      {/* Strip with handles above */}
      <div className="relative mb-2" style={{ paddingTop: 14 }}>
        {/* Stop 0 handle — triangle points down into strip */}
        <div className="absolute top-0 cursor-ew-resize select-none"
          style={{ left: `${localS0 * 100}%`, transform: 'translateX(-50%)', width: 14 }}
          onPointerDown={(e) => { e.preventDefault(); dragging.current = 's0' }}
          onClick={(e) => { e.stopPropagation(); onClickStart() }}
        >
          <div className="w-3 h-3 mx-auto pointer-events-none"
            style={{ background: startColor, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          <div className="w-px h-[2px] mx-auto pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.8)' }} />
        </div>
        {/* Stop 1 handle */}
        <div className="absolute top-0 cursor-ew-resize select-none"
          style={{ left: `${localS1 * 100}%`, transform: 'translateX(-50%)', width: 14 }}
          onPointerDown={(e) => { e.preventDefault(); dragging.current = 's1' }}
          onClick={(e) => { e.stopPropagation(); onClickEnd() }}
        >
          <div className="w-3 h-3 mx-auto pointer-events-none"
            style={{ background: endColor, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          <div className="w-px h-[2px] mx-auto pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.8)' }} />
        </div>
        {/* Gradient strip: solid startColor → blend → solid endColor */}
        <div ref={stripRef} className="w-full h-3 rounded-sm"
          style={{ background: `linear-gradient(to right, ${startColor} 0%, ${startColor} ${localS0 * 100}%, ${endColor} ${localS1 * 100}%, ${endColor} 100%)` }} />
      </div>
      {/* Swatches below strip */}
      <div className="flex items-center gap-1.5">
        <button onClick={onClickStart} style={{ background: startColor }}
          className={`flex-1 h-6 border-2 transition-all ${isActiveStart ? 'border-[#59CEFA]' : 'border-transparent'}`} />
        <span className="text-[#7CC3FB] text-[9px] flex-shrink-0">→</span>
        <button onClick={onClickEnd} style={{ background: endColor }}
          className={`flex-1 h-6 border-2 transition-all ${isActiveEnd ? 'border-[#59CEFA]' : 'border-transparent'}`} />
      </div>
    </div>
  )
}

export default function PatternControls({ pattern, onChange, colors, onColorsChange, onCreatePattern, onClearAll, onApplyPreset, onApplyShape, hasShape, shapeApplied, shapeOpacity, onShapeOpacityChange, patternVisible, onPatternVisibilityChange, imagePreviewActive, onToggleImagePreview, customSvgs, onCustomSvgsChange, activeSlot, onActiveSlotChange }: Props) {
  const [savedPickerColors, setSavedPickerColors] = React.useState<string[]>([])
  const [presets, setPresets] = React.useState(DEFAULT_PRESETS)
  const [presetsOpen, setPresetsOpen] = React.useState(false)
  const [namingPreset, setNamingPreset] = React.useState(false)
  const [newPresetName, setNewPresetName] = React.useState('')
  const [bgOpen, setBgOpen] = React.useState(false)
  const [dotColorsOpen, setDotColorsOpen] = React.useState(false)
  const svgFileRef0 = useRef<HTMLInputElement>(null)
  const svgFileRef1 = useRef<HTMLInputElement>(null)
  const svgFileRef2 = useRef<HTMLInputElement>(null)
  const svgFileRefs = [svgFileRef0, svgFileRef1, svgFileRef2]

  const SHAPE_COL: Record<string, 0 | 1 | 2> = {
    circle: 0, square: 0, triangle: 0, x_cross: 0, custom_1: 0, line_solid: 0,
    circle_dot: 1, square_dot: 1, triangle_dot: 1, square_x_dot: 1, custom_2: 1, line_dash: 1,
    circle_outline: 2, square_outline: 2, triangle_outline: 2, square_x_outline: 2, custom_3: 2, line_outline: 2,
  }

  function toggleShape(id: string) {
    const col = SHAPE_COL[id] as 0 | 1 | 2
    const current = pattern.dot_shapes ?? [pattern.dot_shape]
    if (current.includes(id)) {
      const next = current.filter(s => s !== id)
      if (next.length === 0) return
      onChange({ ...pattern, dot_shapes: next, dot_shape: next[0] as PatternConfig['dot_shape'] })
    } else {
      const next = [...current.filter(s => (SHAPE_COL[s] as 0 | 1 | 2) !== col), id]
      onChange({ ...pattern, dot_shapes: next, dot_shape: next[0] as PatternConfig['dot_shape'] })
    }
  }

  function handleSvgUpload(slotIdx: number, file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const next: CustomSvgs = [...customSvgs] as CustomSvgs
      next[slotIdx] = dataUrl
      onCustomSvgsChange(next)
      toggleShape(`custom_${slotIdx + 1}`)
    }
    reader.readAsDataURL(file)
  }

  function clearSvg(slotIdx: number) {
    const next: CustomSvgs = [...customSvgs] as CustomSvgs
    next[slotIdx] = ''
    onCustomSvgsChange(next)
    // Remove custom_N from active shapes if present
    const shapeId = `custom_${slotIdx + 1}`
    const current = pattern.dot_shapes ?? [pattern.dot_shape]
    if (current.includes(shapeId)) {
      const remaining = current.filter(s => s !== shapeId)
      if (remaining.length === 0) return
      onChange({ ...pattern, dot_shapes: remaining, dot_shape: remaining[0] as PatternConfig['dot_shape'] })
    }
  }

  function openNaming() {
    setNewPresetName(`Preset ${String(presets.length + 1).padStart(2, '0')}`)
    setNamingPreset(true)
    setPresetsOpen(false)
  }

  function confirmAddPreset() {
    const label = newPresetName.trim() || `Preset ${String(presets.length + 1).padStart(2, '0')}`
    setPresets(prev => [...prev, { label, pattern, colors }])
    setNamingPreset(false)
  }

  const fillColors: string[] = colors.fill_colors?.length
    ? colors.fill_colors
    : [colors.colors[0] ?? '#59CEFA']
  const outlineColors: string[] = colors.outline_colors?.length
    ? colors.outline_colors
    : [colors.outline_color || colors.colors[1] || '#7CC3FB']
  const innerColors: string[] = colors.inner_colors?.length
    ? colors.inner_colors
    : [colors.inner_color || colors.colors[2] || '#FFFFFF']
  const dotdotColors: string[] = colors.dot_dot_colors?.length
    ? colors.dot_dot_colors
    : ['#00A4EF']

  function setElementColor(hex: string) {
    if (activeSlot.type === 'fill') {
      const next = [...fillColors]; next[activeSlot.index] = hex
      onColorsChange({ ...colors, fill_colors: next })
    } else if (activeSlot.type === 'outline') {
      const next = [...outlineColors]; next[activeSlot.index] = hex
      onColorsChange({ ...colors, outline_colors: next, outline_color: next[0] })
    } else if (activeSlot.type === 'dotdot') {
      const next = [...dotdotColors]; next[activeSlot.index] = hex
      onColorsChange({ ...colors, dot_dot_colors: next })
    } else if (activeSlot.type === 'grad_fill') {
      onColorsChange({ ...colors, [activeSlot.index === 0 ? 'gradient_fill_start' : 'gradient_fill_end']: hex })
    } else if (activeSlot.type === 'grad_outline') {
      onColorsChange({ ...colors, [activeSlot.index === 0 ? 'gradient_outline_start' : 'gradient_outline_end']: hex })
    } else if (activeSlot.type === 'grad_dotdot') {
      onColorsChange({ ...colors, [activeSlot.index === 0 ? 'gradient_dotdot_start' : 'gradient_dotdot_end']: hex })
    } else if (activeSlot.type === 'background') {
      onColorsChange({ ...colors, background: hex, background_gradient: null })
    } else {
      const next = [...innerColors]; next[activeSlot.index] = hex
      onColorsChange({ ...colors, inner_colors: next, inner_color: next[0] })
    }
  }

  function addFillColor() {
    if (fillColors.length >= 3) return
    const next = [...fillColors, '#7CC3FB']
    onColorsChange({ ...colors, fill_colors: next })
    onActiveSlotChange({ type: 'fill', index: next.length - 1 })
  }
  function removeFillColor(i: number) {
    if (fillColors.length <= 1) return
    const next = fillColors.filter((_, idx) => idx !== i)
    onColorsChange({ ...colors, fill_colors: next })
    if (activeSlot.type === 'fill' && activeSlot.index >= next.length) onActiveSlotChange({ type: 'fill', index: next.length - 1 })
  }

  function addOutlineColor() {
    if (outlineColors.length >= 3) return
    const next = [...outlineColors, '#7CC3FB']
    onColorsChange({ ...colors, outline_colors: next, outline_color: next[0] })
    onActiveSlotChange({ type: 'outline', index: next.length - 1 })
  }
  function removeOutlineColor(i: number) {
    if (outlineColors.length <= 1) return
    const next = outlineColors.filter((_, idx) => idx !== i)
    onColorsChange({ ...colors, outline_colors: next, outline_color: next[0] })
    if (activeSlot.type === 'outline' && activeSlot.index >= next.length) onActiveSlotChange({ type: 'outline', index: next.length - 1 })
  }

  function addDotdotColor() {
    if (dotdotColors.length >= 3) return
    const next = [...dotdotColors, fillColors[0] ?? '#59CEFA']
    onColorsChange({ ...colors, dot_dot_colors: next })
    onActiveSlotChange({ type: 'dotdot', index: next.length - 1 })
  }
  function removeDotdotColor(i: number) {
    if (dotdotColors.length <= 1) return
    const next = dotdotColors.filter((_, idx) => idx !== i)
    onColorsChange({ ...colors, dot_dot_colors: next })
    if (activeSlot.type === 'dotdot' && activeSlot.index >= next.length) onActiveSlotChange({ type: 'dotdot', index: next.length - 1 })
  }

  function addInnerColor() {
    if (innerColors.length >= 3) return
    const next = [...innerColors, '#FFFFFF']
    onColorsChange({ ...colors, inner_colors: next, inner_color: next[0] })
    onActiveSlotChange({ type: 'inner', index: next.length - 1 })
  }
  function removeInnerColor(i: number) {
    if (innerColors.length <= 1) return
    const next = innerColors.filter((_, idx) => idx !== i)
    onColorsChange({ ...colors, inner_colors: next, inner_color: next[0] })
    if (activeSlot.type === 'inner' && activeSlot.index >= next.length) onActiveSlotChange({ type: 'inner', index: next.length - 1 })
  }

  const activeColor =
    activeSlot.type === 'fill'        ? (fillColors[activeSlot.index] ?? '') :
    activeSlot.type === 'outline'     ? (outlineColors[activeSlot.index] ?? '') :
    activeSlot.type === 'dotdot'      ? (dotdotColors[activeSlot.index] ?? '') :
    activeSlot.type === 'grad_fill'   ? (activeSlot.index === 0 ? (colors.gradient_fill_start ?? fillColors[0]) : (colors.gradient_fill_end ?? fillColors[0])) :
    activeSlot.type === 'grad_outline'? (activeSlot.index === 0 ? (colors.gradient_outline_start ?? outlineColors[0]) : (colors.gradient_outline_end ?? outlineColors[0])) :
    activeSlot.type === 'grad_dotdot' ? (activeSlot.index === 0 ? (colors.gradient_dotdot_start ?? dotdotColors[0]) : (colors.gradient_dotdot_end ?? dotdotColors[0])) :
    activeSlot.type === 'background'  ? (colors.background ?? '#000000') :
    (innerColors[activeSlot.index] ?? '')

  function set<K extends keyof PatternConfig>(key: K, val: PatternConfig[K]) {
    onChange({ ...pattern, [key]: val })
  }

  const bgMode: 'solid' | 'gradient' | 'none' = colors.background_gradient
    ? 'gradient'
    : colors.background === null ? 'none' : 'solid'

  const grad: GradientConfig = colors.background_gradient ?? DEFAULT_GRADIENT

  function setBgMode(mode: 'solid' | 'gradient' | 'none') {
    if (mode === 'solid')    onColorsChange({ ...colors, background: colors.background ?? '#EAEAEA', background_gradient: null })
    else if (mode === 'gradient') onColorsChange({ ...colors, background: null, background_gradient: grad })
    else                     onColorsChange({ ...colors, background: null, background_gradient: null })
  }

  function setGrad(g: Partial<GradientConfig>) {
    onColorsChange({ ...colors, background: null, background_gradient: { ...grad, ...g } })
  }

  const sizeMapFileRef = React.useRef<HTMLInputElement>(null)
  const [sizeMapUploading, setSizeMapUploading] = React.useState(false)
  const [sizeMapError, setSizeMapError] = React.useState('')
  async function handleSizeMapUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSizeMapUploading(true)
    setSizeMapError('')
    try {
      const result = await uploadSizeMap(file)
      onChange({ ...pattern, size_mod_image_id: result.size_map_id })
    } catch (err) {
      setSizeMapError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSizeMapUploading(false)
      if (sizeMapFileRef.current) sizeMapFileRef.current.value = ''
    }
  }

  function ColorWell({ value, onChange: onCW }: { value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <div className="w-7 h-7 rounded border border-[#1E6EB7]" style={{ background: value }} />
          <input type="color" value={value} onChange={(e) => onCW(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </div>
        <input
          type="text" value={value} maxLength={7}
          onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onCW(e.target.value) }}
          className="w-24 bg-[#0d3068] border border-[#1E6EB7] rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-brand-cyan uppercase"
        />
      </div>
    )
  }

  return (
    <section>
      {/* Create pattern + Presets dropdown */}
      <div className="mb-4 flex gap-1 items-stretch">
        {/* Create pattern */}
        <button
          onClick={onCreatePattern}
          className="px-3 py-1.5 text-xs font-medium bg-transparent text-[#F4A261] hover:text-[#f9b98a] transition-colors border border-[#F4A261] hover:border-[#f9b98a]"
        >
          Create pattern
        </button>
        {/* Presets dropdown */}
        <div className="relative flex-1">
          <button
            onClick={() => setPresetsOpen(o => !o)}
            className="w-full h-full flex items-center justify-between px-3 py-1.5 text-xs font-medium bg-transparent text-[#59CEFA] border border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE] transition-colors"
          >
            <span>Presets</span>
            <span className="text-[10px] ml-2">{presetsOpen ? '▲' : '▾'}</span>
          </button>
          {presetsOpen && (
            <div className="absolute top-full left-0 right-0 z-50 bg-[#071c4a] border border-[#1E6EB7] border-t-0">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { onApplyPreset(p.pattern, p.colors); setPresetsOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#59CEFA] hover:bg-[#1E6EB7] hover:text-[#D0F2FE] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Add preset */}
        <button
          onClick={openNaming}
          title="Save current settings as preset"
          className="px-2.5 py-1.5 text-xs font-medium bg-transparent text-[#59CEFA] border border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE] transition-colors"
        >+</button>
      </div>

      {/* Preset naming row */}
      {namingPreset && (
        <div className="mb-4 flex gap-1">
          <input
            autoFocus
            type="text"
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmAddPreset(); if (e.key === 'Escape') setNamingPreset(false) }}
            className="flex-1 bg-[#0d3068] border border-[#1E6EB7] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-cyan"
            placeholder="Preset name…"
          />
          <button
            onClick={confirmAddPreset}
            className="px-3 py-1.5 text-xs font-medium bg-transparent text-[#59CEFA] border border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE] transition-colors"
          >Save</button>
          <button
            onClick={() => setNamingPreset(false)}
            className="px-2 py-1.5 text-xs bg-transparent text-[#7CC3FB] border border-[#1E6EB7] hover:text-white transition-colors"
          >×</button>
        </div>
      )}

      {/* Pattern visibility */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[#A0D8F8]">Pattern visibility</p>
        <div className="flex border border-[#1E6EB7]">
          {(['on', 'off'] as const).map((m) => {
            const active = m === 'on' ? patternVisible : !patternVisible
            return (
              <button key={m} onClick={() => onPatternVisibilityChange(m === 'on')}
                className={`px-3 py-0.5 text-[10px] capitalize transition-colors
                  ${active ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
              >
                {m === 'on' ? 'On' : 'Off'}
              </button>
            )
          })}
        </div>
      </div>


      {/* Shape transparency */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-xs text-[#A0D8F8]">Shape transparency</label>
          <span className="text-xs text-brand-cyan font-mono">{Math.round(shapeOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={shapeOpacity}
          style={{ '--range-pct': `${shapeOpacity * 100}%` } as React.CSSProperties}
          onChange={(e) => onShapeOpacityChange(parseFloat(e.target.value))}
        />
      </div>

      <div className={(pattern.grid_spacing_x ?? 0) > 0 || (pattern.grid_spacing_y ?? 0) > 0 ? 'opacity-40 pointer-events-none' : ''}>
        <Slider label="Grid spacing" value={pattern.grid_spacing} min={5} max={50} step={0.5} typeMin={2} typeMax={200}
          format={(v) => `${v}`} editFormat={(v) => String(v)} editParse={(s) => parseFloat(s)}
          onChange={(v) => set('grid_spacing', v)} />
      </div>

      <Slider label="Grid spacing X" value={pattern.grid_spacing_x ?? 0} min={0} max={50} step={0.5} typeMax={200}
        format={(v) => v === 0 ? 'auto' : `${v}`}
        editFormat={(v) => v === 0 ? '0' : String(v)} editParse={(s) => parseFloat(s)}
        onChange={(v) => set('grid_spacing_x', v)} />

      <Slider label="Grid spacing Y" value={pattern.grid_spacing_y ?? 0} min={0} max={50} step={0.5} typeMax={200}
        format={(v) => v === 0 ? 'auto' : `${v}`}
        editFormat={(v) => v === 0 ? '0' : String(v)} editParse={(s) => parseFloat(s)}
        onChange={(v) => set('grid_spacing_y', v)} />

      <Slider label="Main dot size" value={pattern.dot_radius} min={0.10} max={1.0} step={0.01} typeMax={5.0}
        format={(v) => `${(v * 100).toFixed(0)}%`}
        editFormat={(v) => String(Math.round(v * 100))}
        editParse={(s) => parseFloat(s) / 100}
        onChange={(v) => set('dot_radius', v)} />

      <Slider label="Jitter" value={pattern.jitter} min={0} max={1} step={0.05}
        format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('jitter', v)} />

      <Slider label="Row offset Y" value={pattern.row_offset_y ?? 0} min={-1} max={1} step={0.05}
        format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('row_offset_y', v)} />

      <Slider label="Row offset X" value={pattern.row_offset_x ?? 0} min={-1} max={1} step={0.05}
        format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('row_offset_x', v)} />

      {/* Edge fade — flat toggle */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#A0D8F8]">Edge fade</p>
          <div className="flex border border-[#1E6EB7]">
            {(['off', 'on'] as const).map((m) => {
              const active = m === 'on' ? pattern.edge_fade : !pattern.edge_fade
              return (
                <button key={m} onClick={() => set('edge_fade', m === 'on')}
                  className={`px-3 py-0.5 text-[10px] capitalize transition-colors
                    ${active ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                >
                  {m === 'off' ? 'Off' : 'On'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {pattern.edge_fade && (
        <Slider label="Fade width" value={pattern.edge_fade_cells} min={0} max={8} step={0.25}
          format={(v) => `${v}`} onChange={(v) => set('edge_fade_cells', v)} />
      )}

      {/* Elements */}
      <div className="mb-4">
        <p className="text-xs text-[#A0D8F8] mb-2">Elements</p>

        {/* 5×3 shape grid */}
        {(() => {
          const activeShapes = pattern.dot_shapes ?? [pattern.dot_shape]
          const rows: { label: string; shapes: { id: string; icon: React.ReactNode }[] }[] = [
            {
              label: 'Dot',
              shapes: [
                { id: 'circle', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="5" fill="currentColor"/></svg> },
                { id: 'circle_dot', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="5" fill="currentColor"/><circle cx="5" cy="5" r="2" fill="white"/></svg> },
                { id: 'circle_outline', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/></svg> },
              ],
            },
            {
              label: 'Sq',
              shapes: [
                { id: 'square', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0" y="0" width="10" height="10" fill="currentColor"/></svg> },
                { id: 'square_dot', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0" y="0" width="10" height="10" fill="currentColor"/><rect x="3" y="3" width="4" height="4" fill="white"/></svg> },
                { id: 'square_outline', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/></svg> },
              ],
            },
            {
              label: 'Tri',
              shapes: [
                { id: 'triangle', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="5,0 10,10 0,10" fill="currentColor"/></svg> },
                { id: 'triangle_dot', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="5,0 10,10 0,10" fill="currentColor"/><polygon points="5,4 7,8 3,8" fill="white"/></svg> },
                { id: 'triangle_outline', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="5,1 9,9 1,9" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg> },
              ],
            },
            {
              label: 'X',
              shapes: [
                { id: 'x_cross', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
                { id: 'square_x_dot', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0" y="0" width="10" height="10" fill="currentColor"/><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg> },
                { id: 'square_x_outline', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1.2"/><line x1="3" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/><line x1="7" y1="3" x2="3" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg> },
              ],
            },
            {
              label: 'Ln',
              shapes: [
                { id: 'line_solid', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0" y="4" width="10" height="2" fill="currentColor"/></svg> },
                { id: 'line_dash', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0" y="4" width="2.5" height="2" fill="currentColor"/><rect x="3.75" y="4" width="2.5" height="2" fill="currentColor"/><rect x="7.5" y="4" width="2.5" height="2" fill="currentColor"/></svg> },
                { id: 'line_outline', icon: <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="3.5" width="9" height="3" stroke="currentColor" strokeWidth="1"/></svg> },
              ],
            },
            {
              label: 'SVG',
              shapes: [
                { id: 'custom_1', icon: customSvgs[0] ? <img src={customSvgs[0]} alt="" className="w-[10px] h-[10px] object-contain" /> : <span className="text-[7px] leading-none font-mono text-[#F4A522]">upload</span> },
                { id: 'custom_2', icon: customSvgs[1] ? <img src={customSvgs[1]} alt="" className="w-[10px] h-[10px] object-contain" /> : <span className="text-[7px] leading-none font-mono text-[#F4A522]">upload</span> },
                { id: 'custom_3', icon: customSvgs[2] ? <img src={customSvgs[2]} alt="" className="w-[10px] h-[10px] object-contain" /> : <span className="text-[7px] leading-none font-mono text-[#F4A522]">upload</span> },
              ],
            },
          ]
          const colHeaders = ['Fill', 'Dot·Dot', 'Outline']
          return (
            <div className="mb-3">
              {/* Hidden SVG file inputs */}
              {[0, 1, 2].map(i => (
                <input
                  key={i}
                  ref={svgFileRefs[i]}
                  type="file"
                  accept="image/svg+xml"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSvgUpload(i, f); e.target.value = '' }}
                />
              ))}

              {/* Column headers */}
              <div className="grid grid-cols-[28px_1fr_1fr_1fr] mb-0.5">
                <div />
                {colHeaders.map(h => (
                  <div key={h} className="text-center text-[8px] font-mono text-[#59CEFA]/60 pb-0.5">{h}</div>
                ))}
              </div>

              {/* Grid rows */}
              <div className="border border-[#1E6EB7]">
                {rows.map((row, rowIdx) => (
                  <div key={row.label} className={`grid grid-cols-[28px_1fr_1fr_1fr] ${rowIdx > 0 ? 'border-t border-[#1E6EB7]' : ''}`}>
                    {/* Row label */}
                    <div className="flex items-center justify-center border-r border-[#1E6EB7] py-1 px-1">
                      <span className="text-[8px] font-mono text-[#59CEFA]/60">{row.label}</span>
                    </div>
                    {/* Shape cells */}
                    {row.shapes.map((shape, colIdx) => {
                      const active = activeShapes.includes(shape.id)
                      const isCustom = shape.id.startsWith('custom_')
                      const svgIdx = isCustom ? parseInt(shape.id.slice(-1)) - 1 : -1
                      return (
                        <button
                          key={shape.id}
                          onClick={() => {
                            if (isCustom && !customSvgs[svgIdx]) {
                              svgFileRefs[svgIdx].current?.click()
                            } else {
                              toggleShape(shape.id)
                            }
                          }}
                          className={`flex items-center justify-center py-1.5 transition-colors
                            ${colIdx < 2 ? 'border-r border-[#1E6EB7]' : ''}
                            ${active ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                        >
                          {shape.icon}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* SVG clear controls */}
              {customSvgs.some(s => s) && (
                <div className="flex gap-3 mt-1.5">
                  {[0, 1, 2].map(i => customSvgs[i] ? (
                    <button
                      key={i}
                      onClick={() => clearSvg(i)}
                      className="text-[8px] font-mono text-[#7CC3FB]/70 hover:text-red-400 transition-colors"
                    >
                      ✕ SVG {i + 1}
                    </button>
                  ) : null)}
                </div>
              )}
            </div>
          )
        })()}

        {/* Per-element scale sliders */}
        <div className="space-y-3 mb-3">
          {([
            { id: 'circle',         label: 'Dot scale' },
            { id: 'circle_dot',     label: 'Dot dot scale' },
            { id: 'circle_outline', label: 'Outline scale' },
          ] as const).map(({ id, label }) => {
            const scales = pattern.element_scales ?? { circle: 1.0, circle_dot: 1.0, circle_outline: 1.0 }
            const val = scales[id] ?? 1.0
            return (
              <Slider
                key={id}
                label={label}
                value={val}
                min={0.25}
                max={2.0}
                step={0.05}
                typeMin={0}
                typeMax={4.0}
                format={(v) => v.toFixed(2)}
                editFormat={(v) => v.toFixed(2)}
                editParse={(s) => parseFloat(s)}
                onChange={(v) => {
                  const next = Object.assign({ circle: 1.0, circle_dot: 1.0, circle_outline: 1.0 }, scales, { [id]: v })
                  onChange({ ...pattern, element_scales: next })
                }}
              />
            )
          })}
        </div>

        {/* Per-element rotation sliders */}
        <div className="space-y-3 mb-3">
          {([
            { id: 'circle',         label: 'Fill rotation' },
            { id: 'circle_dot',     label: 'Dot-dot rotation' },
            { id: 'circle_outline', label: 'Outline rotation' },
          ] as const).map(({ id, label }) => {
            const rotations = pattern.element_rotations ?? { circle: 0.0, circle_dot: 0.0, circle_outline: 0.0 }
            const val = rotations[id] ?? 0.0
            return (
              <Slider
                key={id}
                label={label}
                value={val}
                min={0}
                max={360}
                step={1}
                format={(v) => `${Math.round(v)}°`}
                editFormat={(v) => String(Math.round(v))}
                editParse={(s) => parseFloat(s)}
                onChange={(v) => {
                  const next = Object.assign({ circle: 0.0, circle_dot: 0.0, circle_outline: 0.0 }, rotations, { [id]: v })
                  onChange({ ...pattern, element_rotations: next })
                }}
              />
            )
          })}
        </div>

        {/* Outline stroke */}
        <Slider
          label="Outline stroke"
          value={pattern.outline_stroke ?? 0.14}
          min={0.02}
          max={0.6}
          step={0.01}
          typeMin={0}
          format={(v) => `${Math.round(v * 100)}%`}
          editFormat={(v) => String(Math.round(v * 100))}
          editParse={(s) => parseFloat(s) / 100}
          onChange={(v) => onChange({ ...pattern, outline_stroke: v })}
        />

        {/* Seed */}
        <div className="mb-1">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-[#A0D8F8]">Random seed</label>
            <span className="text-xs text-brand-cyan font-mono">{pattern.seed}</span>
          </div>
          <div className="flex gap-1">
            <input type="number" value={pattern.seed} min={0} max={9999}
              onChange={(e) => set('seed', parseInt(e.target.value) || 0)}
              className="flex-1 bg-[#0d3068] border border-[#1E6EB7] px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-cyan"
            />
            <button onClick={() => set('seed', Math.floor(Math.random() * 10000))}
              className="px-2 py-1 bg-[#0d3068] border border-[#1E6EB7] text-xs text-[#A0D8F8] hover:text-white hover:border-brand-cyan transition-colors"
              title="Randomize seed"
            >⟳</button>
          </div>
        </div>

        {/* Size Map */}
        <div className="mb-4">
          <p className="text-xs text-[#A0D8F8] mb-2">Size map</p>

          {/* Mode toggle */}
          <div className="flex border border-[#1E6EB7] mb-3">
            {(['off', 'noise', 'image'] as const).map(m => (
              <button
                key={m}
                onClick={() => onChange({ ...pattern, size_mod_mode: m })}
                className={`flex-1 py-1.5 text-[10px] font-medium transition-colors capitalize
                  ${pattern.size_mod_mode === m ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
              >{m}</button>
            ))}
          </div>

          {pattern.size_mod_mode === 'image' && (
            <>
              <div className="flex gap-1 -mt-0.5">
                <button
                  onClick={() => sizeMapFileRef.current?.click()}
                  disabled={sizeMapUploading}
                  className="flex-1 py-2 border border-dashed border-[#F4A261] text-xs text-[#F4A261]
                             hover:border-[#f9b98a] hover:text-[#f9b98a] transition-colors disabled:opacity-50"
                >{sizeMapUploading ? 'Uploading…' : '+ Upload image texture +'}</button>
                {pattern.size_mod_image_id && (
                  <button
                    onClick={() => onChange({ ...pattern, size_mod_image_id: '' })}
                    className="px-2 py-1 text-[10px] font-mono text-[#7CC3FB] border border-[#1E6EB7]
                               hover:text-white hover:border-[#59CEFA] transition-colors"
                  >clear</button>
                )}
              </div>
              <input
                ref={sizeMapFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSizeMapUpload}
              />
              {sizeMapError && <p className="text-xs text-red-400 mt-1">{sizeMapError}</p>}
            </>
          )}

          {pattern.size_mod_mode !== 'off' && (
            <div style={{ marginTop: '20px' }}>
              <Slider
                label="Strength"
                value={pattern.size_mod_strength}
                min={0} max={2} step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onChange({ ...pattern, size_mod_strength: v })}
              />

              {pattern.size_mod_mode === 'image' && pattern.size_mod_image_id && (
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-[#A0D8F8]">View texture</p>
                  <div className="flex border border-[#1E6EB7]">
                    {(['off', 'on'] as const).map(m => {
                      const active = m === 'on' ? imagePreviewActive : !imagePreviewActive
                      return (
                        <button key={m} onClick={() => { if ((m === 'on') !== imagePreviewActive) onToggleImagePreview() }}
                          className={`px-3 py-0.5 text-[10px] capitalize transition-colors
                            ${active ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                        >{m === 'on' ? 'On' : 'Off'}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-[#A0D8F8]">Invert</p>
                <div className="flex border border-[#1E6EB7]">
                  {(['off', 'on'] as const).map(m => {
                    const active = m === 'on' ? pattern.size_mod_invert : !pattern.size_mod_invert
                    return (
                      <button key={m} onClick={() => onChange({ ...pattern, size_mod_invert: m === 'on' })}
                        className={`px-3 py-0.5 text-[10px] capitalize transition-colors
                          ${active ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                      >{m === 'on' ? 'On' : 'Off'}</button>
                    )
                  })}
                </div>
              </div>

              {pattern.size_mod_mode === 'noise' && (
                <>
                  {/* Noise type */}
                  <div className="mb-3">
                    <p className="text-[9px] uppercase tracking-widest text-[#7CC3FB] mb-1.5">Type</p>
                    <div className="grid grid-cols-3 gap-px">
                      {(['smooth', 'marble', 'turbulence', 'voronoi', 'wave', 'cell'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => onChange({ ...pattern, size_mod_noise_type: t })}
                          className={`py-1.5 text-[9px] font-medium transition-colors capitalize border
                            ${pattern.size_mod_noise_type === t
                              ? 'bg-[#59CEFA] text-[#020c24] border-[#59CEFA]'
                              : 'text-[#7CC3FB] border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE]'}`}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                  <Slider
                    label="Noise scale"
                    value={pattern.size_mod_scale}
                    min={0.01} max={0.5} step={0.01}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => onChange({ ...pattern, size_mod_scale: v })}
                  />
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-[#A0D8F8]">Noise seed</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={pattern.size_mod_seed}
                        min={0}
                        max={9999}
                        step={1}
                        onChange={(e) => onChange({ ...pattern, size_mod_seed: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-14 bg-[#071c4a] border border-[#1E6EB7] text-[#59CEFA] text-[10px] font-mono text-right px-1 py-0.5 focus:outline-none focus:border-[#59CEFA]"
                      />
                      <button
                        onClick={() => onChange({ ...pattern, size_mod_seed: Math.floor(Math.random() * 10000) })}
                        className="px-2 py-0.5 border border-[#1E6EB7] text-[10px] text-[#7CC3FB] hover:text-[#59CEFA] hover:border-[#59CEFA] transition-colors"
                        title="Random seed"
                      >↻</button>
                    </div>
                  </div>
                </>
              )}

              {pattern.size_mod_mode === 'image' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-[#A0D8F8]">Fit</p>
                    <div className="flex border border-[#1E6EB7]">
                      <button
                        onClick={() => onChange({ ...pattern, size_mod_image_fill: false })}
                        className={`px-3 py-0.5 text-[10px] transition-colors
                          ${!pattern.size_mod_image_fill ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                      >Native</button>
                      <button
                        onClick={() => onChange({ ...pattern, size_mod_image_fill: true })}
                        className={`px-3 py-0.5 text-[10px] transition-colors
                          ${pattern.size_mod_image_fill ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                      >Fill frame</button>
                    </div>
                  </div>
                  <Slider
                    label="Contrast"
                    value={pattern.size_mod_image_contrast ?? 1.0}
                    min={0} max={2} step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => onChange({ ...pattern, size_mod_image_contrast: v })}
                  />
                  <LevelsSlider
                    low={pattern.size_mod_image_levels_low ?? 0}
                    mid={pattern.size_mod_image_levels_mid ?? 0.5}
                    high={pattern.size_mod_image_levels_high ?? 1}
                    onChange={(lo, mi, hi) => onChange({ ...pattern, size_mod_image_levels_low: lo, size_mod_image_levels_mid: mi, size_mod_image_levels_high: hi })}
                  />
                  {pattern.size_mod_image_id && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-[#59CEFA] font-mono">Image loaded</span>
                      <button
                        onClick={() => onChange({ ...pattern, size_mod_image_id: '' })}
                        className="text-[10px] text-[#7CC3FB] hover:text-white transition-colors"
                      >Clear</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Apply + Clear row */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={onApplyShape}
            disabled={!hasShape}
            className={`flex-1 py-2 text-sm font-medium transition-colors border
              ${hasShape
                ? shapeApplied
                  ? 'bg-[#F4A261] text-[#020c24] border-[#F4A261]'
                  : 'bg-transparent text-[#F4A261] border-[#F4A261] hover:bg-[#F4A261]/10'
                : 'bg-transparent text-[#F4A261]/30 border-[#F4A261]/30 cursor-not-allowed'
              }`}
          >
            Apply
          </button>
          <button
            onClick={onClearAll}
            className="px-4 py-2 text-sm font-medium transition-colors border border-[#1E6EB7] text-[#7CC3FB] hover:text-[#D0F2FE] hover:border-[#59CEFA]"
          >
            Clear
          </button>
        </div>

        {/* Reset settings */}
        <button
          onClick={onClearAll}
          className="w-full mt-1 py-1.5 text-xs font-medium transition-colors border border-[#1E6EB7] text-[#7CC3FB] hover:text-[#D0F2FE] hover:border-[#59CEFA]"
        >
          Reset settings
        </button>

        {/* Dot colors dropdown */}
        <div className="mt-3">
          <button
            onClick={() => setDotColorsOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium bg-transparent text-[#59CEFA] border border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE] transition-colors"
          >
            <span>Dot colors</span>
            <span className="text-[10px] ml-2">{dotColorsOpen ? '▲' : '▾'}</span>
          </button>
          {dotColorsOpen && (
            <div className="border border-t-0 border-[#1E6EB7] px-3 py-3">
              {/* Mode toggle */}
              <div className="mb-3 flex border border-[#1E6EB7]">
                <button
                  onClick={() => onColorsChange({ ...colors, image_color_mode: false, gradient_color_mode: false })}
                  className={`flex-1 py-1 text-[10px] font-medium transition-colors
                    ${!colors.image_color_mode && !colors.gradient_color_mode ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                >Fill</button>
                <button
                  onClick={() => onColorsChange({
                    ...colors,
                    image_color_mode: false,
                    gradient_color_mode: true,
                    // Seed from current palette on first activation only
                    gradient_fill_start:    colors.gradient_fill_start    || fillColors[0],
                    gradient_fill_end:      colors.gradient_fill_end      || fillColors[0],
                    gradient_outline_start: colors.gradient_outline_start || outlineColors[0],
                    gradient_outline_end:   colors.gradient_outline_end   || outlineColors[0],
                    gradient_dotdot_start:  colors.gradient_dotdot_start  || '#00A4EF',
                    gradient_dotdot_end:    colors.gradient_dotdot_end    || '#00A4EF',
                  })}
                  className={`flex-1 py-1 text-[10px] font-medium transition-colors
                    ${colors.gradient_color_mode ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                >Gradient</button>
                <button
                  onClick={() => onColorsChange({ ...colors, image_color_mode: true, gradient_color_mode: false })}
                  className={`flex-1 py-1 text-[10px] font-medium transition-colors
                    ${colors.image_color_mode ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                >Image</button>
              </div>

              {/* Fill colors section */}
              {!colors.gradient_color_mode && !colors.image_color_mode && (<>
              <div className="mb-2">
                <span className="text-[9px] text-[#7CC3FB] block mb-1">Dot fill</span>
                <div className="flex items-center gap-1.5">
                  {fillColors.map((c, i) => (
                    <div key={i} className="relative flex-1 group">
                      <button
                        onClick={() => onActiveSlotChange({ type: 'fill', index: i })}
                        style={{ background: c }}
                        className={`w-full h-5 border-2 transition-all ${
                          activeSlot.type === 'fill' && activeSlot.index === i
                            ? 'border-[#59CEFA]' : 'border-transparent'
                        }`}
                        title={`Fill color ${i + 1}`}
                      />
                      {fillColors.length > 1 && (
                        <button onClick={() => removeFillColor(i)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#071c4a] border border-[#1E6EB7] text-[#7CC3FB] text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                          title="Remove color"
                        >×</button>
                      )}
                    </div>
                  ))}
                  {fillColors.length < 3 && (
                    <button onClick={addFillColor}
                      className="w-5 h-5 border border-dashed border-[#1E6EB7] text-[#7CC3FB] text-sm leading-none flex items-center justify-center hover:border-[#59CEFA] hover:text-[#59CEFA] transition-colors flex-shrink-0"
                      title="Add fill color"
                    >+</button>
                  )}
                </div>
              </div>

              <div className="mb-2">
                <span className="text-[9px] text-[#7CC3FB] block mb-1">Dot outline</span>
                <div className="flex items-center gap-1.5">
                  {outlineColors.map((c, i) => (
                    <div key={i} className="relative flex-1 group">
                      <button onClick={() => onActiveSlotChange({ type: 'outline', index: i })} style={{ background: c }}
                        className={`w-full h-5 border-2 transition-all ${activeSlot.type === 'outline' && activeSlot.index === i ? 'border-[#59CEFA]' : 'border-transparent'}`}
                        title={`Outline color ${i + 1}`} />
                      {outlineColors.length > 1 && (
                        <button onClick={() => removeOutlineColor(i)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#071c4a] border border-[#1E6EB7] text-[#7CC3FB] text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                        >×</button>
                      )}
                    </div>
                  ))}
                  {outlineColors.length < 3 && (
                    <button onClick={addOutlineColor}
                      className="w-5 h-5 border border-dashed border-[#1E6EB7] text-[#7CC3FB] text-sm leading-none flex items-center justify-center hover:border-[#59CEFA] hover:text-[#59CEFA] transition-colors flex-shrink-0"
                    >+</button>
                  )}
                </div>
              </div>

              <div className="mb-2">
                <span className="text-[9px] text-[#7CC3FB] block mb-1">Dotdot fill</span>
                <div className="flex items-center gap-1.5">
                  {dotdotColors.map((c, i) => (
                    <div key={i} className="relative flex-1 group">
                      <button onClick={() => onActiveSlotChange({ type: 'dotdot', index: i })} style={{ background: c }}
                        className={`w-full h-5 border-2 transition-all ${activeSlot.type === 'dotdot' && activeSlot.index === i ? 'border-[#59CEFA]' : 'border-transparent'}`}
                        title={`Dotdot fill color ${i + 1}`} />
                      {dotdotColors.length > 1 && (
                        <button onClick={() => removeDotdotColor(i)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#071c4a] border border-[#1E6EB7] text-[#7CC3FB] text-[8px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                        >×</button>
                      )}
                    </div>
                  ))}
                  {dotdotColors.length < 3 && (
                    <button onClick={addDotdotColor}
                      className="w-5 h-5 border border-dashed border-[#1E6EB7] text-[#7CC3FB] text-sm leading-none flex items-center justify-center hover:border-[#59CEFA] hover:text-[#59CEFA] transition-colors flex-shrink-0"
                    >+</button>
                  )}
                </div>
              </div>

              </>)} {/* end fill colors section */}

              {/* Gradient section */}
              {colors.gradient_color_mode && !colors.image_color_mode && (
                <div className="mb-2 space-y-4">
                  {([
                    { label: 'Dot fill',    type: 'grad_fill'    as const,
                      start: colors.gradient_fill_start    ?? fillColors[0],
                      end:   colors.gradient_fill_end      ?? fillColors[0],
                      s0:    colors.gradient_fill_stop0    ?? 0,
                      s1:    colors.gradient_fill_stop1    ?? 1,
                      setS0: (v: number) => onColorsChange({ ...colors, gradient_fill_stop0: v }),
                      setS1: (v: number) => onColorsChange({ ...colors, gradient_fill_stop1: v }),
                    },
                    { label: 'Dot outline', type: 'grad_outline' as const,
                      start: colors.gradient_outline_start ?? outlineColors[0],
                      end:   colors.gradient_outline_end   ?? outlineColors[0],
                      s0:    colors.gradient_outline_stop0 ?? 0,
                      s1:    colors.gradient_outline_stop1 ?? 1,
                      setS0: (v: number) => onColorsChange({ ...colors, gradient_outline_stop0: v }),
                      setS1: (v: number) => onColorsChange({ ...colors, gradient_outline_stop1: v }),
                    },
                    { label: 'Dotdot fill', type: 'grad_dotdot'  as const,
                      start: colors.gradient_dotdot_start  ?? dotdotColors[0],
                      end:   colors.gradient_dotdot_end    ?? dotdotColors[0],
                      s0:    colors.gradient_dotdot_stop0  ?? 0,
                      s1:    colors.gradient_dotdot_stop1  ?? 1,
                      setS0: (v: number) => onColorsChange({ ...colors, gradient_dotdot_stop0: v }),
                      setS1: (v: number) => onColorsChange({ ...colors, gradient_dotdot_stop1: v }),
                    },
                  ]).map(({ label, type, start, end, s0, s1, setS0, setS1 }) => (
                    <div key={type}>
                      <span className="text-[9px] text-[#7CC3FB] block mb-1">{label}</span>
                      <GradientStripRow
                        startColor={start} endColor={end}
                        stop0={s0} stop1={s1}
                        isActiveStart={activeSlot.type === type && activeSlot.index === 0}
                        isActiveEnd={activeSlot.type === type && activeSlot.index === 1}
                        onClickStart={() => onActiveSlotChange({ type, index: 0 })}
                        onClickEnd={() => onActiveSlotChange({ type, index: 1 })}
                        onStop0Change={setS0}
                        onStop1Change={setS1}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Color picker — shared for fill and gradient modes */}
              {!colors.image_color_mode && (
                <ColorPicker
                  color={activeColor}
                  onChange={setElementColor}
                  savedColors={savedPickerColors}
                  onSavedColorsChange={setSavedPickerColors}
                />
              )}

              {/* Image section — always mounted, dimmed when fill/gradient mode active */}
              <div className={!colors.image_color_mode ? 'opacity-40 pointer-events-none mt-3' : 'mt-3'}>
                <Slider
                  label="Saturation"
                  value={pattern.size_mod_image_saturation ?? 1.0}
                  min={0} max={2} step={0.05}
                  typeMax={5.0}
                  format={(v) => `${Math.round(v * 100)}%`}
                  editFormat={(v) => String(Math.round(v * 100))}
                  editParse={(s) => parseFloat(s) / 100}
                  onChange={(v) => onChange({ ...pattern, size_mod_image_saturation: v })}
                />
                {/* Colorize */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#A0D8F8]">Colorize</span>
                    <div className="flex border border-[#1E6EB7]">
                      <button
                        onClick={() => onColorsChange({ ...colors, image_color_colorize: true })}
                        className={`px-3 py-0.5 text-[10px] transition-colors ${colors.image_color_colorize ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                      >On</button>
                      <button
                        onClick={() => onColorsChange({ ...colors, image_color_colorize: false })}
                        className={`px-3 py-0.5 text-[10px] transition-colors ${!colors.image_color_colorize ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                      >Off</button>
                    </div>
                  </div>
                  {colors.image_color_colorize && (
                    <div className="space-y-2 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#7CC3FB]">Shadows</span>
                        <ColorWell
                          value={colors.image_color_shadow || '#000000'}
                          onChange={(v) => onColorsChange({ ...colors, image_color_shadow: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#7CC3FB]">Highlights</span>
                        <ColorWell
                          value={colors.image_color_highlight || '#ffffff'}
                          onChange={(v) => onColorsChange({ ...colors, image_color_highlight: v })}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <Slider
                  label="Hue offset"
                  value={colors.image_color_hue_offset ?? 0}
                  min={-180} max={180} step={1}
                  format={(v) => `${v > 0 ? '+' : ''}${v}°`}
                  onChange={(v) => onColorsChange({ ...colors, image_color_hue_offset: v })}
                />
                <Slider
                  label="Tone jitter"
                  value={colors.image_color_tone_jitter ?? 0}
                  min={0} max={1} step={0.01}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onColorsChange({ ...colors, image_color_tone_jitter: v })}
                />
                <Slider
                  label="Hue jitter"
                  value={colors.image_color_hue_jitter ?? 0}
                  min={0} max={180} step={1}
                  format={(v) => `±${v}°`}
                  onChange={(v) => onColorsChange({ ...colors, image_color_hue_jitter: v })}
                />
              </div> {/* end image wrapper */}

            </div>
          )}
        </div>
      </div>

      {/* Background colors dropdown */}
      <div className="mb-4">
        <button
          onClick={() => setBgOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium bg-transparent text-[#59CEFA] border border-[#1E6EB7] hover:border-[#59CEFA] hover:text-[#D0F2FE] transition-colors mb-0"
        >
          <span>Background colors</span>
          <span className="text-[10px] ml-2">{bgOpen ? '▲' : '▾'}</span>
        </button>
        {bgOpen && (
          <div className="border border-t-0 border-[#1E6EB7] px-3 py-3">
            <div className="flex items-stretch gap-2 mb-2">
              <div className="flex border border-[#1E6EB7]">
                {(['solid', 'none'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setBgMode(m)}
                    className={`px-3 py-0.5 text-[10px] capitalize transition-colors
                      ${bgMode === m ? 'bg-[#59CEFA] text-[#020c24]' : 'text-[#7CC3FB] hover:text-[#D0F2FE]'}`}
                  >
                    {m === 'none' ? 'None' : 'Solid'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onActiveSlotChange({ type: 'background', index: 0 })}
                title={`Select background color — ${colors.background ?? 'none'}`}
                className={`flex-1 transition-colors border ${activeSlot.type === 'background' ? 'border-[#59CEFA]' : 'border-[#1E6EB7]'}`}
                style={{ background: colors.background ?? 'transparent' }}
              />
            </div>
            {bgMode === 'solid' && (
              <ColorPicker
                color={colors.background ?? '#000000'}
                onChange={(h) => onColorsChange({ ...colors, background: h, background_gradient: null })}
                savedColors={savedPickerColors}
                onSavedColorsChange={setSavedPickerColors}
              />
            )}
          </div>
        )}
      </div>

    </section>
  )
}
