import { useRef, useState, useEffect, useCallback } from 'react'

// ── Color conversions ─────────────────────────────────────────────────────────
function hexToHsv(hex: string): [number, number, number] {
  const c = hex.replace('#', '').padEnd(6, '0')
  const r = parseInt(c.slice(0,2),16)/255
  const g = parseInt(c.slice(2,4),16)/255
  const b = parseInt(c.slice(4,6),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
  let h = 0
  if (d > 0) {
    h = max === r ? ((g-b)/d) % 6 : max === g ? (b-r)/d + 2 : (r-g)/d + 4
    h = (h * 60 + 360) % 360
  }
  return [h, max === 0 ? 0 : (d/max)*100, max*100]
}

export function hsvToHex(h: number, s: number, v: number): string {
  const sv = s/100, vv = v/100
  const f = (n: number) => { const k = (n+h/60)%6; return vv - vv*sv*Math.max(0, Math.min(k, 4-k, 1)) }
  return '#' + [f(5),f(3),f(1)].map(x => Math.round(x*255).toString(16).padStart(2,'0')).join('')
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  color: string
  onChange: (hex: string) => void
  savedColors: string[]
  onSavedColorsChange: (c: string[]) => void
}

export default function ColorPicker({ color, onChange, savedColors, onSavedColorsChange }: Props) {
  const [hue, setHue]       = useState(0)
  const [sat, setSat]       = useState(100)
  const [val, setVal]       = useState(100)
  const [hexInput, setHexInput] = useState('FFFFFF')
  const [presetsOpen, setPresetsOpen] = useState(true)

  const sbBoxRef  = useRef<HTMLDivElement>(null)
  const hueBarRef = useRef<HTMLDivElement>(null)
  const dragging  = useRef<'sb'|'hue'|null>(null)

  // Live ref so drag callbacks never capture stale closure values
  const live = useRef({ hue, sat, val })
  live.current = { hue, sat, val }

  // Sync picker when external color changes
  useEffect(() => {
    if (!color) return
    const clean = color.startsWith('#') ? color : '#' + color
    if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return
    const [h, s, v] = hexToHsv(clean)
    setHue(h); setSat(s); setVal(v)
    setHexInput(clean.replace('#','').toUpperCase())
  }, [color])

  const applyFromSB = useCallback((clientX: number, clientY: number) => {
    if (!sbBoxRef.current) return
    const rect = sbBoxRef.current.getBoundingClientRect()
    const newSat = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100
    const newVal = (1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))) * 100
    setSat(newSat); setVal(newVal)
    const hex = hsvToHex(live.current.hue, newSat, newVal)
    setHexInput(hex.replace('#','').toUpperCase())
    onChange(hex)
  }, [onChange])

  const applyFromHue = useCallback((clientX: number) => {
    if (!hueBarRef.current) return
    const rect = hueBarRef.current.getBoundingClientRect()
    const newHue = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360
    setHue(newHue)
    const hex = hsvToHex(newHue, live.current.sat, live.current.val)
    setHexInput(hex.replace('#','').toUpperCase())
    onChange(hex)
  }, [onChange])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragging.current === 'sb')  applyFromSB(e.clientX, e.clientY)
      if (dragging.current === 'hue') applyFromHue(e.clientX)
    }
    function onUp() { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [applyFromSB, applyFromHue])

  function commitHex() {
    const clean = hexInput.replace('#','').trim()
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      const hex = '#' + clean.toUpperCase()
      const [h, s, v] = hexToHsv(hex)
      setHue(h); setSat(s); setVal(v)
      onChange(hex)
    } else {
      // Revert input to current color
      setHexInput(hsvToHex(hue, sat, val).replace('#','').toUpperCase())
    }
  }

  function saveCurrentColor() {
    const hex = hsvToHex(hue, sat, val).toUpperCase()
    if (!savedColors.some(c => c.toUpperCase() === hex)) {
      onSavedColorsChange([...savedColors, hex])
    }
  }

  const hueColor = `hsl(${hue},100%,50%)`

  return (
    <div className="select-none space-y-2.5">
      {/* SB square */}
      <div
        ref={sbBoxRef}
        className="w-full relative cursor-crosshair"
        style={{ height: 160, background: `linear-gradient(to right,#fff,${hueColor})` }}
        onMouseDown={(e) => { e.preventDefault(); dragging.current = 'sb'; applyFromSB(e.clientX, e.clientY) }}
      >
        {/* Black-to-transparent overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom,transparent,#000)' }} />
        {/* Cursor */}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            left: `${sat}%`, top: `${100 - val}%`,
            transform: 'translate(-50%,-50%)',
            width: 13, height: 13,
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueBarRef}
        className="w-full relative cursor-pointer"
        style={{
          height: 12, borderRadius: 6,
          background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
        }}
        onMouseDown={(e) => { e.preventDefault(); dragging.current = 'hue'; applyFromHue(e.clientX) }}
      >
        <div
          className="absolute top-1/2 pointer-events-none rounded-full"
          style={{
            left: `${(hue / 360) * 100}%`,
            transform: 'translate(-50%,-50%)',
            width: 16, height: 16,
            border: '2px solid #fff',
            background: hueColor,
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Hex input + save button */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[#7CC3FB] font-mono flex-shrink-0">Hex</span>
        <div className="flex-1 flex items-center bg-[#071c4a] border border-[#1E6EB7] px-1.5 h-6 min-w-0">
          <span className="text-[9px] text-[#7CC3FB] mr-0.5 flex-shrink-0">#</span>
          <input
            className="flex-1 bg-transparent text-[11px] text-white font-mono outline-none w-0"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value.toUpperCase().replace(/[^0-9A-F]/g,''))}
            onBlur={commitHex}
            onKeyDown={(e) => { if (e.key === 'Enter') { commitHex(); (e.target as HTMLInputElement).blur() } }}
            maxLength={6}
            spellCheck={false}
          />
        </div>
        <button
          onClick={saveCurrentColor}
          className="text-[9px] font-mono text-[#7CC3FB] border border-[#1E6EB7] px-1.5 h-6 hover:text-white hover:border-[#59CEFA] transition-colors flex-shrink-0"
        >+ save</button>
      </div>

      {/* Saved colors */}
      <div>
        <button
          onClick={() => setPresetsOpen(p => !p)}
          className="flex items-center justify-between w-full text-[9px] text-[#7CC3FB] uppercase tracking-wider py-0.5"
        >
          <span>Saved colors</span>
          <span className="text-[7px]">{presetsOpen ? '▲' : '▼'}</span>
        </button>
        {presetsOpen && (
          <div className="flex flex-wrap gap-1 mt-1 min-h-[20px]">
            {savedColors.length === 0 ? (
              <span className="text-[9px] text-[#3a5a8a] italic">Pick a color then + save</span>
            ) : (
              savedColors.map((c, i) => (
                <div key={i} className="relative group">
                  <button
                    onClick={() => onChange(c)}
                    style={{ background: c }}
                    className="w-5 h-5 border border-[#1E6EB7] hover:border-[#59CEFA] transition-colors"
                    title={c}
                  />
                  <button
                    onClick={() => onSavedColorsChange(savedColors.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-[#071c4a] border border-[#1E6EB7] text-[#7CC3FB] text-[7px] leading-none hidden group-hover:flex items-center justify-center hover:text-white"
                  >×</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
