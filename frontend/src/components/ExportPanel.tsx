import { useState, useEffect, useRef } from 'react'
import { requestExport } from '../api'
import type { ColorConfig, PatternConfig } from '../types'

interface Props {
  shape: string
  parts: string[]
  pattern: PatternConfig
  colors: ColorConfig
  disabled: boolean
}

const RESOLUTIONS = [
  { id: '2k', label: '2K', sub: '2048 × 2048' },
  { id: '4k', label: '4K', sub: '4096 × 4096' },
  { id: '6k', label: '6K', sub: '6144 × 6144' },
  { id: '8k', label: '8K', sub: '8192 × 8192' },
]

const FORMATS = [
  { id: 'png',       label: 'PNG',         sub: 'Solid background' },
  { id: 'png_alpha', label: 'PNG + Alpha', sub: 'Embedded transparency' },
  { id: 'svg',       label: 'SVG',         sub: 'Vector / infinite scale' },
]

const CONTENT_MODES = [
  { id: 'pattern', label: 'Pattern', sub: 'Full canvas' },
  { id: 'shape',   label: 'Shape',   sub: 'Masked to shape' },
  { id: 'both',    label: 'Both',    sub: 'Two ZIPs' },
]

export default function ExportPanel({ shape, parts, pattern, colors, disabled }: Props) {
  const [resolutions, setResolutions] = useState<Set<string>>(new Set())
  const [formats, setFormats] = useState<Set<string>>(new Set())
  const [contentMode, setContentMode] = useState<'pattern' | 'shape' | 'both'>('shape')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  function toggle<T>(set: Set<T>, item: T): Set<T> {
    const next = new Set(set)
    next.has(item) ? next.delete(item) : next.add(item)
    return next
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExport() {
    if (!shape || resolutions.size === 0 || formats.size === 0) return
    setExporting(true)
    setExportError('')
    try {
      const res = [...resolutions]
      const fmt = [...formats]
      if (contentMode === 'both') {
        const [patternBlob, shapeBlob] = await Promise.all([
          requestExport(shape, pattern, colors, res, fmt, parts, true),
          requestExport(shape, pattern, colors, res, fmt, parts, false),
        ])
        triggerDownload(patternBlob, `${shape}_pattern_dot_assets.zip`)
        triggerDownload(shapeBlob, `${shape}_shape_dot_assets.zip`)
      } else {
        const fillCanvas = contentMode === 'pattern'
        const blob = await requestExport(shape, pattern, colors, res, fmt, parts, fillCanvas)
        const suffix = fillCanvas ? 'pattern' : 'shape'
        triggerDownload(blob, `${shape}_${suffix}_dot_assets.zip`)
      }
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const canExport = !disabled && !exporting && !!shape && resolutions.size > 0 && formats.size > 0

  // Keep a ref to always-latest handleExport so the effect never has a stale closure
  const handleExportRef = useRef(handleExport)
  handleExportRef.current = handleExport

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    handleExportRef.current()
  }, [resolutions, formats]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-5 py-4 space-y-6">
      {/* Content */}
      <div>
        <p className="text-xs text-[#A0D8F8] mb-2">Content</p>
        <div className="grid grid-cols-3 gap-1.5">
          {CONTENT_MODES.map((c) => {
            const on = contentMode === c.id
            return (
              <button
                key={c.id}
                onClick={() => setContentMode(c.id as 'pattern' | 'shape' | 'both')}
                className={`flex flex-col items-center py-2 px-1 text-center transition-colors
                  ${on
                    ? 'bg-brand-cyan/10 border border-brand-cyan text-brand-cyan'
                    : 'bg-[#0d3068] border border-[#1E6EB7] text-[#7CC3FB] hover:border-[#59CEFA]'
                  }`}
              >
                <span className="text-xs font-semibold">{c.label}</span>
                <span className="text-[9px] leading-tight text-current opacity-70">{c.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Resolutions */}
      <div>
        <p className="text-xs text-[#A0D8F8] mb-2">Resolutions</p>
        <div className="grid grid-cols-4 gap-1.5">
          {RESOLUTIONS.map((r) => {
            const on = resolutions.has(r.id)
            return (
              <button
                key={r.id}
                onClick={() => setResolutions(toggle(resolutions, r.id))}
                className={`flex flex-col items-center py-2 px-1 text-center transition-colors
                  ${on
                    ? 'bg-brand-cyan/10 border border-brand-cyan text-brand-cyan'
                    : 'bg-[#0d3068] border border-[#1E6EB7] text-[#7CC3FB] hover:border-[#59CEFA]'
                  }`}
              >
                <span className="text-xs font-semibold">{r.label}</span>
                <span className="text-[9px] leading-tight text-current opacity-70">{r.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Formats */}
      <div>
        <p className="text-xs text-[#A0D8F8] mb-2">Formats</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FORMATS.map((f) => {
            const on = formats.has(f.id)
            return (
              <button
                key={f.id}
                onClick={() => setFormats(toggle(formats, f.id))}
                className={`flex flex-col items-center py-2 px-1 text-center transition-colors
                  ${on
                    ? 'bg-brand-cyan/10 border border-brand-cyan text-brand-cyan'
                    : 'bg-[#0d3068] border border-[#1E6EB7] text-[#7CC3FB] hover:border-[#59CEFA]'
                  }`}
              >
                <span className="text-xs font-semibold">{f.label}</span>
                <span className="text-[9px] leading-tight text-current opacity-70">{f.sub}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {exportError && (
        <p className="text-xs text-red-400">{exportError}</p>
      )}

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={!canExport}
        className="w-full py-2 font-medium text-sm transition-colors flex items-center justify-center gap-2
                   bg-transparent hover:bg-[#0a2555] border border-[#1E6EB7] text-[#59CEFA]
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting ? (
          <>
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M5 7l3 3 3-3"/>
              <path d="M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11"/>
            </svg>
            Export
          </>
        )}
      </button>

      <p className="text-[10px] text-[#7CC3FB] text-center leading-tight">
        Large exports (6K/8K) may take 10–30 seconds
      </p>
    </div>
  )
}
