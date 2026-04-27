import { useRef, useState } from 'react'
import { uploadMask } from '../api'
import type { PatternConfig, ShapeInfo, UploadResult } from '../types'
interface Props {
  shapes: ShapeInfo[]
  selectedShape: string
  selectedParts: string[]
  onShapeChange: (id: string, label: string) => void
  onPartsChange: (parts: string[], shapeId: string, shapeName: string) => void
  pattern: PatternConfig
  onPatternChange: (p: PatternConfig) => void
  onOpenMap: () => void
  mapOpen?: boolean
}

function OffsetSlider({ label, value, onChange }: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs text-[#A0D8F8]">{label}</label>
        <span className="text-xs text-brand-cyan font-mono">
          {value > 0 ? '+' : ''}{Math.round(value * 100)}
        </span>
      </div>
      <input
        type="range"
        min={-0.5}
        max={0.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

export default function ShapePanel({ shapes, selectedShape, selectedParts, onShapeChange, onPartsChange, pattern, onPatternChange, onOpenMap, mapOpen }: Props) {
  const [uploading, setUploading]         = useState(false)
  const [uploadError, setUploadError]     = useState('')
  const [uploadedShapes, setUploadedShapes] = useState<UploadResult[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedName = shapes.find(s => s.id === selectedShape)?.name
  const partLabel = selectedParts.length > 1
    ? `${selectedParts.length} parts`
    : selectedParts.length === 1 ? '1 part' : null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const result = await uploadMask(file)
      setUploadedShapes(prev => [...prev, result])
      onShapeChange(result.mask_id, result.name || 'Custom upload')
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const usingMap    = Boolean(selectedShape && !selectedShape.startsWith('upload_'))
  const usingUpload = Boolean(selectedShape?.startsWith('upload_'))

  return (
    <section className="space-y-4">
      {/* Country label + pick button */}
      <div className={usingUpload ? 'opacity-40 pointer-events-none' : ''}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#7CC3FB]">Country</span>
          <div className="flex items-center gap-2">
            {partLabel && (
              <span className="text-[10px] text-brand-cyan border border-brand-cyan/30 px-1.5 py-0.5">
                {partLabel}
              </span>
            )}
            {selectedName && (
              <span className="text-xs font-semibold truncate max-w-[120px]" style={{ color: '#F4A261' }}>{selectedName}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onOpenMap()}
            className={`flex-1 py-2 text-sm font-medium transition-colors bg-transparent hover:bg-[#0a2555] border
              ${mapOpen
                ? 'text-[#F4A261] border-[#F4A261]'
                : 'text-[#59CEFA] border-[#1E6EB7]'
              }`}
          >
            + Pick from map +
          </button>
          {selectedShape && !selectedShape.startsWith('upload_') && (
            <button
              onClick={() => onShapeChange('', '')}
              className="px-2 py-1 text-[10px] font-mono text-[#7CC3FB] border border-[#1E6EB7]
                         hover:text-white hover:border-[#59CEFA] transition-colors"
            >clear</button>
          )}
        </div>
      </div>

      {/* Previously uploaded masks */}
      {uploadedShapes.length > 0 && (
        <div className={usingMap ? 'opacity-40 pointer-events-none' : ''}>
          <p className="text-[10px] text-[#7CC3FB] uppercase tracking-wider mb-1.5">Uploaded</p>
          <div className="space-y-1">
            {uploadedShapes.map(u => (
              <button
                key={u.mask_id}
                onClick={() => onShapeChange(u.mask_id, u.name || 'Custom upload')}
                className={`w-full py-1.5 px-2 text-xs text-left truncate transition-colors
                  ${selectedShape === u.mask_id
                    ? 'bg-brand-cyan text-[#020c24]'
                    : 'bg-[#0a2555] text-[#A0D8F8] hover:text-white hover:bg-[#1E6EB7]'
                  }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom upload */}
      <div className={`border-t border-[#0a2555] pt-4${usingMap ? ' opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-[#7CC3FB] uppercase tracking-wider">Custom silhouette</p>
        </div>
        <label className={`flex items-center gap-2 text-xs text-[#A0D8F8] mb-2 select-none ${!usingUpload ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
          <span
            className="relative flex items-center justify-center w-3.5 h-3.5 flex-shrink-0"
            style={{ background: pattern.mask_invert ? '#F4A522' : '#59CEFA', borderRadius: 2 }}
          >
            <input
              type="checkbox"
              checked={pattern.mask_invert ?? false}
              onChange={e => onPatternChange({ ...pattern, mask_invert: e.target.checked })}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer m-0"
            />
            {(pattern.mask_invert ?? false) && (
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="pointer-events-none">
                <path d="M1 3L3.5 5.5L8 1" stroke="#020c24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          Invert mask (white shape on dark bg)
        </label>
        <div className="flex gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex-1 py-2 text-sm font-medium transition-colors bg-transparent hover:bg-[#0a2555] border text-[#59CEFA] border-[#1E6EB7] disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '+ Upload PNG / JPG +'}
          </button>
          {uploadedShapes.length > 0 && (
            <button
              onClick={() => {
                setUploadedShapes([])
                if (selectedShape.startsWith('upload_')) onShapeChange('', '')
              }}
              className="px-2 py-1 text-[10px] font-mono text-[#7CC3FB] border border-[#1E6EB7]
                         hover:text-white hover:border-[#59CEFA] transition-colors"
            >clear</button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
      </div>

    </section>
  )
}
