import type {
  ColorConfig,
  DotsResult,
  PatternConfig,
  PreviewResult,
  SchemeInfo,
  ShapeInfo,
  UploadResult,
} from './types'

const BASE = '/api'

export async function fetchShapes(): Promise<ShapeInfo[]> {
  const r = await fetch(`${BASE}/shapes`)
  if (!r.ok) throw new Error('Failed to load shapes')
  return r.json()
}

export async function fetchSchemes(): Promise<SchemeInfo[]> {
  const r = await fetch(`${BASE}/schemes`)
  if (!r.ok) throw new Error('Failed to load schemes')
  return r.json()
}

export async function requestOutline(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  previewWidth = 800,
  parts: string[] = [],
): Promise<{ image: string; width: number; height: number }> {
  const r = await fetch(`${BASE}/outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, parts, pattern, colors, preview_width: previewWidth }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function requestPreview(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  previewWidth = 800,
  parts: string[] = [],
  fillCanvas = false,
  showShapeOverlay = false,
  clipFillToShape = false,
): Promise<PreviewResult> {
  const r = await fetch(`${BASE}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, parts, pattern, colors, preview_width: previewWidth, fill_canvas: fillCanvas, show_shape_overlay: showShapeOverlay, clip_fill_to_shape: clipFillToShape }),
  })
  if (!r.ok) {
    const msg = await r.text()
    throw new Error(msg || 'Preview failed')
  }
  return r.json()
}

export async function requestExport(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  resolutions: string[],
  formats: string[],
  parts: string[] = [],
  fill_canvas: boolean = false,
): Promise<Blob> {
  const r = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, parts, fill_canvas, pattern, colors, resolutions, formats }),
  })
  if (!r.ok) {
    const msg = await r.text()
    throw new Error(msg || 'Export failed')
  }
  return r.blob()
}

export async function requestDots(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  parts: string[] = [],
  fillCanvas = false,
  clipFillToShape = false,
): Promise<DotsResult> {
  const r = await fetch(`${BASE}/dots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shape, parts, pattern, colors, preview_width: 3200,
      fill_canvas: fillCanvas,
      clip_fill_to_shape: clipFillToShape,
    }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function uploadSizeMap(file: File): Promise<{ size_map_id: string }> {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${BASE}/upload-size-map`, { method: 'POST', body: form })
  if (!r.ok) {
    const msg = await r.text()
    throw new Error(msg || 'Upload failed')
  }
  return r.json()
}

export async function requestShapeStroke(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  previewWidth = 1200,
  parts: string[] = [],
  strokeWidth = 2,
): Promise<{ image: string; width: number; height: number }> {
  const r = await fetch(`${BASE}/shape-stroke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, parts, pattern, colors, preview_width: previewWidth, stroke_width: strokeWidth }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function requestImagePreview(
  shape: string,
  pattern: PatternConfig,
  colors: ColorConfig,
  previewWidth = 800,
  parts: string[] = [],
): Promise<{ image: string }> {
  const r = await fetch(`${BASE}/image-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, parts, pattern, colors, preview_width: previewWidth }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function requestSizeMapPreview(pattern: PatternConfig, width = 400): Promise<{ image: string }> {
  const r = await fetch(`${BASE}/preview-size-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern, preview_width: width }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function uploadMask(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${BASE}/upload-mask`, { method: 'POST', body: form })
  if (!r.ok) {
    const msg = await r.text()
    throw new Error(msg || 'Upload failed')
  }
  return r.json()
}
