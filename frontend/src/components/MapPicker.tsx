import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'

interface Props {
  selectedShape: string
  selectedParts: string[]
  onShapeChange: (id: string, label: string) => void
  onPartsChange: (parts: string[], shapeId: string, shapeName: string) => void
  onClose: () => void
}

const DOT_PATTERN_ID      = 'leaflet-dot-select-pattern'
const DOT_PATTERN_DIM_ID  = 'leaflet-dot-select-pattern-dim'
const DOT_PATTERN_FILL_ID = 'leaflet-dot-select-pattern-fill'

function injectDotPattern(map: L.Map) {
  const pane = map.getPanes().overlayPane
  if (!pane) return
  const svg = pane.querySelector('svg')
  if (!svg || svg.querySelector(`#${DOT_PATTERN_ID}`)) return

  const ns = 'http://www.w3.org/2000/svg'
  const defs = document.createElementNS(ns, 'defs')

  defs.innerHTML = `
    <pattern id="${DOT_PATTERN_ID}" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="0.9" fill="#F4A261" opacity="1"/>
    </pattern>
    <pattern id="${DOT_PATTERN_DIM_ID}" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="0.65" fill="#59CEFA" opacity="0.25"/>
    </pattern>
    <pattern id="${DOT_PATTERN_FILL_ID}" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#0a2555"/>
      <circle cx="2" cy="2" r="0.55" fill="#1E6EB7" opacity="0.7"/>
    </pattern>
  `
  svg.insertBefore(defs, svg.firstChild)
}

function styleFor(
  shapeId: string,
  partId: string,
  selectedShape: string,
  selectedParts: string[],
): L.PathOptions {
  if (selectedParts.length > 0) {
    if (selectedParts.includes(partId))
      return { stroke: false, fillColor: `url(#${DOT_PATTERN_ID})`, fillOpacity: 1 }
    if (shapeId === selectedShape)
      return { stroke: false, fillColor: `url(#${DOT_PATTERN_DIM_ID})`, fillOpacity: 1 }
  } else {
    if (shapeId === selectedShape)
      return { stroke: false, fillColor: `url(#${DOT_PATTERN_ID})`, fillOpacity: 1 }
  }
  if (shapeId) return { color: '#1E6EB7', weight: 0.6, fillColor: `url(#${DOT_PATTERN_FILL_ID})`, fillOpacity: 1 }
  return         { color: '#0a2555', weight: 0.4, fillColor: `url(#${DOT_PATTERN_FILL_ID})`, fillOpacity: 1 }
}

export default function MapPicker({
  selectedShape,
  selectedParts,
  onShapeChange,
  onPartsChange,
  onClose,
}: Props) {
  const containerRef       = useRef<HTMLDivElement>(null)
  const mapRef             = useRef<L.Map | null>(null)
  const layerRef           = useRef<L.GeoJSON | null>(null)
  const shapeCallbackRef   = useRef(onShapeChange)
  const partsCallbackRef   = useRef(onPartsChange)
  shapeCallbackRef.current = onShapeChange
  partsCallbackRef.current = onPartsChange

  const [geoData, setGeoData]         = useState<object | null>(null)
  const [loading,  setLoading]        = useState(true)
  const [hoveredName, setHoveredName] = useState('')
  const [pickedName, setPickedName]   = useState('')
  const hoveredNameSetRef = useRef(setHoveredName)
  const pickedNameSetRef  = useRef(setPickedName)

  useEffect(() => {
    fetch('/api/geojson')
      .then(r => r.json())
      .then(d => { setGeoData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [20, 10],
      zoom: 2,
      minZoom: 1,
      maxZoom: 8,
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
      dragging: true,
      boxZoom: true,
      doubleClickZoom: true,
    })
    mapRef.current = map
    // Force Leaflet to recalculate container size after the modal renders
    setTimeout(() => map.invalidateSize(), 50)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !geoData) return
    layerRef.current?.remove()

    const layer = L.geoJSON(geoData as L.GeoJsonObject, {
      style: f => {
        const shapeId = f?.properties?.shape_id ?? ''
        const partId  = f?.properties?.part_id  ?? ''
        return styleFor(shapeId, partId, selectedShape, selectedParts)
      },
      onEachFeature: (feature, fl) => {
        const shapeId = feature.properties?.shape_id ?? ''
        const partId  = feature.properties?.part_id  ?? ''
        const name    = feature.properties?.NAME ?? ''
        if (!shapeId) return

        fl.on({
          mouseover: e => {
            hoveredNameSetRef.current(name)
            const isSelected = selectedParts.length > 0
              ? selectedParts.includes(partId)
              : shapeId === selectedShape
            if (!isSelected)
              e.target.setStyle({ stroke: false, fillColor: '#F4A261', fillOpacity: 1 })
          },
          mouseout: e => { hoveredNameSetRef.current(''); layer.resetStyle(e.target) },
          click: (e: unknown) => {
            const evt = e as L.LeafletMouseEvent
            const isShift = evt.originalEvent?.shiftKey ?? false
            const isCtrl  = evt.originalEvent?.ctrlKey  ?? false

            if (isCtrl) {
              shapeCallbackRef.current('', '')
              pickedNameSetRef.current('')
            } else if (isShift && partId) {
              const newParts = selectedParts.includes(partId)
                ? selectedParts.filter(p => p !== partId)
                : [...selectedParts, partId]
              partsCallbackRef.current(newParts, shapeId, name)
              pickedNameSetRef.current(name)
            } else {
              shapeCallbackRef.current(shapeId, name)
              pickedNameSetRef.current(name)
              // Don't auto-close — user clicks Apply to confirm
            }
          },
        })
      },
    })

    layer.addTo(map)
    layerRef.current = layer
    // Inject dot pattern after layer is added so the SVG overlay pane exists
    requestAnimationFrame(() => injectDotPattern(map))
  }, [geoData, selectedShape, selectedParts, onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const partCount  = selectedParts.length
  const hasSelection = !!selectedShape

  return (
    <div className="absolute inset-0 flex flex-col bg-[#071c4a] overflow-hidden">
      <div className="relative flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b border-[#1E6EB7]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Ccircle cx='3' cy='3' r='0.7' fill='%2359CEFA' opacity='0.18'/%3E%3C/svg%3E\")" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="font-mono tracking-wide transition-all duration-150"
              style={{
                color: '#F4A261',
                fontSize: (hoveredName || pickedName) ? '1.1rem' : '0.78rem',
                opacity: (hoveredName || pickedName) ? 1 : 0.45,
                letterSpacing: (hoveredName || pickedName) ? '0.05em' : '0.1em',
              }}
            >
              {hoveredName || pickedName || 'Select a country'}
            </span>
            {partCount > 0 && (
              <span className="text-[11px] text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/30 rounded px-2 py-0.5">
                {partCount} part{partCount > 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => shapeCallbackRef.current('', '')}
              disabled={!hasSelection}
              className={`px-4 py-1.5 text-sm font-medium transition-all border
                ${hasSelection
                  ? 'bg-[#071c4a] border-[#59CEFA] text-[#59CEFA] hover:bg-[#0a2555]'
                  : 'bg-[#071c4a] border-[#333] text-[#333] cursor-not-allowed'
                }`}
            >
              Clear
            </button>
            <button
              onClick={onClose}
              disabled={!hasSelection}
              className={`px-4 py-1.5 text-sm font-medium transition-all border
                ${hasSelection
                  ? 'bg-[#071c4a] border-[#59CEFA] text-[#59CEFA] hover:bg-[#0a2555]'
                  : 'bg-[#071c4a] border-[#333] text-[#333] cursor-not-allowed'
                }`}
            >
              Apply to canvas
            </button>
            <button
              onClick={onClose}
              className="text-[#7CC3FB] hover:text-white transition-colors text-lg leading-none ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="relative flex-1 min-h-0">
          <div ref={containerRef} className="w-full h-full" style={{ background: '#04153D', touchAction: 'none' }} />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[#7CC3FB] text-sm">Loading map…</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2 border-t border-[#222]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='6'%3E%3Ccircle cx='3' cy='3' r='0.7' fill='%2359CEFA' opacity='0.18'/%3E%3C/svg%3E\")" }}
        >
          <p className="text-[11px] text-[#7CC3FB]">
            Click a country to select it.&nbsp;&nbsp;
            <span className="text-[#59CEFA]">Shift+click</span> to select individual parts (e.g. mainland, Alaska, Hawaii). Scroll to zoom.
          </p>
        </div>
      </div>
    </div>
  )
}
