import { useEffect, useState } from 'react'
import type { ColorConfig, SchemeInfo } from '../types'

const LS_KEY = 'geo_dot_color_presets'

interface SavedPreset {
  id: string
  name: string
  entries: { color: string; pct: number }[]
  bg: string | null
}

interface Props {
  schemes: SchemeInfo[]
  colors: ColorConfig
  onChange: (c: ColorConfig) => void
}

interface ColorEntry {
  color: string
  pct: number  // 0–100
}

function entriesToConfig(entries: ColorEntry[], bg: string | null): ColorConfig {
  const total = entries.reduce((s, e) => s + e.pct, 0) || 1
  return {
    colors: entries.map((e) => e.color),
    ratios: entries.map((e) => e.pct / total),
    background: bg,
  }
}

export default function ColorSchemePanel({ schemes, colors, onChange }: Props) {
  const [selectedScheme, setSelectedScheme] = useState('hero')
  const [entries, setEntries] = useState<ColorEntry[]>([
    { color: '#00A4EF', pct: 60 },
    { color: '#737373', pct: 40 },
  ])
  const [bg, setBg] = useState<string | null>('#EAEAEA')
  const [transparentBg, setTransparentBg] = useState(false)

  // Saved presets (localStorage)
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
  })
  const [savingName, setSavingName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  function persistPresets(presets: SavedPreset[]) {
    setSavedPresets(presets)
    localStorage.setItem(LS_KEY, JSON.stringify(presets))
  }

  function savePreset() {
    if (!savingName.trim()) return
    const preset: SavedPreset = {
      id: Date.now().toString(),
      name: savingName.trim(),
      entries: [...entries],
      bg: transparentBg ? null : bg,
    }
    persistPresets([...savedPresets, preset])
    setSavingName('')
    setShowSaveInput(false)
  }

  function loadPreset(p: SavedPreset) {
    setSelectedScheme('custom')
    setEntries(p.entries)
    setTransparentBg(p.bg === null)
    setBg(p.bg ?? '#EAEAEA')
  }

  function deletePreset(id: string) {
    persistPresets(savedPresets.filter((p) => p.id !== id))
  }

  // Apply a preset scheme
  function applyScheme(id: string) {
    const s = schemes.find((sc) => sc.id === id)
    if (!s) return
    setSelectedScheme(id)
    const total = s.ratios.reduce((a, b) => a + b, 0) || 1
    setEntries(s.colors.map((c, i) => ({ color: c, pct: Math.round((s.ratios[i] / total) * 100) })))
    setTransparentBg(s.background === null)
    setBg(s.background ?? '#EAEAEA')
  }

  // Sync local bg state when background is changed externally (e.g. from PatternControls)
  useEffect(() => {
    if (colors.background_gradient) return  // gradient managed in PatternControls
    if (colors.background === null && !transparentBg) setTransparentBg(true)
    else if (colors.background !== null && colors.background !== bg) {
      setBg(colors.background)
      setTransparentBg(false)
    }
  }, [colors.background, colors.background_gradient])

  // Propagate changes upward
  useEffect(() => {
    onChange(entriesToConfig(entries, transparentBg ? null : bg))
  }, [entries, bg, transparentBg])

  function updateColor(idx: number, color: string) {
    setSelectedScheme('custom')
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, color } : e)))
  }

  function updatePct(idx: number, pct: number) {
    setSelectedScheme('custom')
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, pct } : e)))
  }

  function addColor() {
    setSelectedScheme('custom')
    setEntries((prev) => [...prev, { color: '#ffffff', pct: 10 }])
  }

  function removeColor(idx: number) {
    if (entries.length <= 1) return
    setSelectedScheme('custom')
    setEntries((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalPct = entries.reduce((s, e) => s + e.pct, 0)

  return (
    <section>
      {/* Color entries */}
      <div className="space-y-3 mb-3">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {/* Swatch + picker */}
            <div className="relative flex-shrink-0">
              <div
                className="w-7 h-7 rounded border border-[#3a3a3a]"
                style={{ background: entry.color }}
              />
              <input
                type="color"
                value={entry.color}
                onChange={(e) => updateColor(idx, e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Pick colour"
              />
            </div>

            {/* Hex value */}
            <input
              type="text"
              value={entry.color}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateColor(idx, v)
              }}
              className="w-20 bg-[#0d3068] border border-[#1E6EB7] rounded px-2 py-1 text-xs
                         font-mono text-white focus:outline-none focus:border-brand-cyan uppercase"
            />

            {/* Ratio */}
            <div className="flex-1 flex items-center gap-1.5">
              <input
                type="range"
                min={1}
                max={99}
                step={1}
                value={entry.pct}
                style={{ '--range-pct': `${entry.pct}%` } as React.CSSProperties}
                onChange={(e) => updatePct(idx, parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-brand-cyan font-mono w-8 text-right">
                {entry.pct}%
              </span>
            </div>

            {/* Remove */}
            {entries.length > 1 && (
              <button
                onClick={() => removeColor(idx)}
                className="text-[#555] hover:text-red-400 text-sm leading-none"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {totalPct !== 100 && (
        <p className="text-xs text-yellow-400 mb-2">Ratios total {totalPct}% (will be normalised)</p>
      )}

      {entries.length < 5 && (
        <button
          onClick={addColor}
          className="text-xs text-[#7CC3FB] hover:text-brand-cyan transition-colors mb-4"
        >
          + Add colour
        </button>
      )}

      {/* Saved presets */}
      <div className="border-t border-[#0a2555] pt-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-[#A0D8F8]">Saved presets</p>
          <button
            onClick={() => setShowSaveInput((v) => !v)}
            className="text-xs text-[#7CC3FB] hover:text-brand-cyan transition-colors"
          >
            + Save current
          </button>
        </div>

        {showSaveInput && (
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              type="text"
              placeholder="Preset name…"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') savePreset() }}
              className="flex-1 bg-[#0d3068] border border-[#1E6EB7] rounded px-2 py-1 text-xs
                         text-white focus:outline-none focus:border-brand-cyan"
            />
            <button
              onClick={savePreset}
              className="px-2 py-1 bg-brand-cyan text-[#04153D] text-xs rounded hover:bg-[#1E6EB7]"
            >
              Save
            </button>
          </div>
        )}

        {savedPresets.length === 0 && !showSaveInput && (
          <p className="text-xs text-[#1E6EB7] italic">No saved presets yet</p>
        )}

        <div className="space-y-1">
          {savedPresets.map((p) => (
            <div key={p.id} className="flex items-center gap-2 group">
              {/* Color swatches */}
              <div className="flex gap-0.5">
                {p.entries.map((e, i) => (
                  <div key={i} className="w-3.5 h-3.5 rounded-sm border border-[#333]"
                       style={{ background: e.color }} />
                ))}
              </div>
              <button
                onClick={() => loadPreset(p)}
                className="flex-1 text-left text-xs text-[#D0F2FE] hover:text-white transition-colors truncate"
              >
                {p.name}
              </button>
              <button
                onClick={() => deletePreset(p.id)}
                className="text-[#1E6EB7] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Background */}
      <div className="border-t border-[#0a2555] pt-3">
        <p className="text-xs text-[#A0D8F8] mb-2">Background</p>
        <label className="flex items-center gap-2 text-xs text-[#D0F2FE] cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={transparentBg}
            onChange={(e) => setTransparentBg(e.target.checked)}
            className="accent-brand-cyan"
          />
          Transparent (alpha channel)
        </label>
        {!transparentBg && (
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <div
                className="w-7 h-7 rounded border border-[#3a3a3a]"
                style={{ background: bg ?? '#EAEAEA' }}
              />
              <input
                type="color"
                value={bg ?? '#EAEAEA'}
                onChange={(e) => setBg(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
            <input
              type="text"
              value={bg ?? ''}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBg(v)
              }}
              className="w-24 bg-[#0d3068] border border-[#1E6EB7] rounded px-2 py-1 text-xs
                         font-mono text-white focus:outline-none focus:border-brand-cyan uppercase"
            />
          </div>
        )}
      </div>
    </section>
  )
}
