export type AspectRatio = '1:1' | '16:9' | '4:3' | '3:4' | '9:16' | '21:9'

export type ActiveSlot =
  | { type: 'fill'; index: number }
  | { type: 'outline'; index: number }
  | { type: 'inner'; index: number }
  | { type: 'dotdot'; index: number }
  | { type: 'grad_fill'; index: 0 | 1 }
  | { type: 'grad_outline'; index: 0 | 1 }
  | { type: 'grad_dotdot'; index: 0 | 1 }
  | { type: 'background'; index: 0 }

export interface PatternConfig {
  grid_spacing: number
  grid_spacing_x: number
  grid_spacing_y: number
  dot_radius: number
  jitter: number
  row_offset_x: number
  row_offset_y: number
  edge_fade: boolean
  edge_fade_cells: number
  dot_shape: 'circle' | 'square' | 'circle_dot' | 'circle_outline'
    | 'square_dot' | 'square_outline'
    | 'triangle' | 'triangle_dot' | 'triangle_outline'
    | 'x_cross' | 'square_x_dot' | 'square_x_outline'
    | 'custom_1' | 'custom_2' | 'custom_3'
    | 'line_solid' | 'line_dash' | 'line_outline'
  dot_shapes: string[]
  element_scales?: { circle: number; circle_dot: number; circle_outline: number }
  element_rotations?: { circle: number; circle_dot: number; circle_outline: number }
  outline_stroke?: number
  seed: number
  aspect_ratio: AspectRatio
  x_offset: number
  y_offset: number
  transform_rotation: number
  transform_scale: number
  size_mod_mode: 'off' | 'noise' | 'image'
  size_mod_noise_type: 'smooth' | 'marble' | 'turbulence' | 'voronoi' | 'wave' | 'cell'
  size_mod_strength: number
  size_mod_scale: number
  size_mod_invert: boolean
  size_mod_seed: number
  size_mod_image_scale: number
  size_mod_image_fill: boolean
  size_mod_image_id: string
  size_mod_image_hue: number
  size_mod_image_saturation: number
  size_mod_image_contrast: number
  size_mod_image_levels_low: number
  size_mod_image_levels_mid: number
  size_mod_image_levels_high: number
  size_mod_image_rotation: number
  size_mod_image_x_offset: number
  size_mod_image_y_offset: number
  mask_invert: boolean
}

export interface GradientConfig {
  start: string
  end: string
  direction: 'h' | 'v'
}

export interface ColorConfig {
  colors: string[]
  ratios: number[]
  background: string | null
  background_gradient?: GradientConfig | null
  fill_colors?: string[]     // 1–3 colors randomly distributed for Filled shapes
  dot_dot_colors?: string[]  // 1–3 colors for the outer fill of Dot-Dot shapes
  outline_color?: string     // color for Outline shape (legacy single)
  outline_colors?: string[]  // 1–3 colors for Outline shapes
  inner_color?: string       // color for inner dot (legacy single)
  inner_colors?: string[]    // 1–3 colors for inner dots
  image_color_mode?: boolean
  image_color_hue_offset?: number
  image_color_hue_jitter?: number
  image_color_tone_jitter?: number
  image_color_colorize?: boolean
  image_color_shadow?: string
  image_color_highlight?: string
  gradient_color_mode?: boolean
  gradient_fill_start?: string
  gradient_fill_end?: string
  gradient_fill_stop0?: number
  gradient_fill_stop1?: number
  gradient_outline_start?: string
  gradient_outline_end?: string
  gradient_outline_stop0?: number
  gradient_outline_stop1?: number
  gradient_dotdot_start?: string
  gradient_dotdot_end?: string
  gradient_dotdot_stop0?: number
  gradient_dotdot_stop1?: number
}

export interface ShapeInfo {
  id: string
  name: string
  category: string
}

export interface SchemeInfo {
  id: string
  name: string
  colors: string[]
  ratios: number[]
  background: string | null
}

export interface PreviewResult {
  image: string
  width: number
  height: number
  dot_count: number
}

export interface DotData {
  x: number
  y: number
  radius: number
  color: string
  shape: string
  outline_color: string
  inner_color: string
  stroke_width: number
  rotation: number
}

export interface DotsResult {
  dots: DotData[]
  width: number
  height: number
  dot_count: number
}

export interface UploadResult {
  mask_id: string
  width: number
  height: number
  name: string
}

export const DEFAULT_PATTERN: PatternConfig = {
  grid_spacing: 5,
  grid_spacing_x: 0,
  grid_spacing_y: 0,
  dot_radius: 0.10,
  jitter: 0.0,
  row_offset_x: 0.0,
  row_offset_y: 0.0,
  edge_fade: false,
  edge_fade_cells: 2.0,
  dot_shape: 'circle',
  dot_shapes: ['circle'],
  seed: 42,
  aspect_ratio: '16:9',
  x_offset: 0,
  y_offset: 0,
  transform_rotation: 0,
  transform_scale: 1.0,
  size_mod_mode: 'off',
  size_mod_noise_type: 'smooth',
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
}

export type CustomSvgs = [string, string, string]
export const DEFAULT_CUSTOM_SVGS: CustomSvgs = ['', '', '']

export const DEFAULT_COLORS: ColorConfig = {
  colors: ['#00A4EF', '#737373'],
  ratios: [0.60, 0.40],
  background: '#C8DCF0',
  fill_colors: ['#00A4EF'],
  dot_dot_colors: ['#00A4EF'],
  outline_color: '#00A4EF',
}
