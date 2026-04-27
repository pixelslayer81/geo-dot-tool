from typing import List, Optional
from pydantic import BaseModel, Field


class PatternConfig(BaseModel):
    grid_spacing: float = Field(default=10.0, ge=2.0, le=200.0,
                                description="Dot grid spacing in base-1000 units")
    grid_spacing_x: float = Field(default=0.0, ge=0.0, le=200.0,
                                  description="Independent X column spacing in base-1000 units (0 = use grid_spacing)")
    grid_spacing_y: float = Field(default=0.0, ge=0.0, le=200.0,
                                  description="Independent Y row spacing in base-1000 units (0 = use grid_spacing)")
    dot_radius: float = Field(default=0.15, ge=0.05, le=5.0,
                              description="Dot radius as fraction of spacing")
    jitter: float = Field(default=0.0, ge=0.0, le=1.0,
                          description="Random offset from grid (0=none, 1=full)")
    row_offset_x: float = Field(default=0.0, ge=-1.0, le=1.0,
                                description="Shift every other row horizontally (fraction of grid spacing)")
    row_offset_y: float = Field(default=0.0, ge=-1.0, le=1.0,
                                description="Shift every other row vertically (fraction of grid spacing)")
    edge_fade: bool = Field(default=True,
                            description="Shrink dots near shape boundary")
    edge_fade_cells: float = Field(default=0.0, ge=0.0, le=8.0,
                                   description="Edge fade band width in dot-units")
    dot_shape: str = Field(default="circle", pattern="^(circle|square|circle_dot|circle_outline|square_dot|square_outline|triangle|triangle_dot|triangle_outline|x_cross|square_x_dot|square_x_outline|custom_1|custom_2|custom_3|line_solid|line_dash|line_outline)$")
    dot_shapes: List[str] = Field(default_factory=lambda: ["circle"],
                                  description="Active shape types for random distribution")
    element_scales: dict = Field(
        default_factory=lambda: {"circle": 1.0, "circle_dot": 1.0, "circle_outline": 1.0},
        description="Per-shape radius multiplier (0.25–2.0)")
    element_rotations: dict = Field(
        default_factory=lambda: {"circle": 0.0, "circle_dot": 0.0, "circle_outline": 0.0},
        description="Per-shape rotation in degrees (0–360)")
    outline_stroke: float = Field(default=0.14, ge=0.0, le=0.6,
                                  description="Outline stroke width as fraction of dot radius")
    seed: int = Field(default=42, description="Random seed for reproducibility")
    aspect_ratio: str = Field(default="1:1",
                              description="Canvas aspect ratio: 1:1, 16:9, 4:3, 3:4, 9:16, 21:9")
    x_offset: float = Field(default=0.0, ge=-0.5, le=0.5,
                             description="Horizontal offset as fraction of canvas (-0.5 to 0.5)")
    y_offset: float = Field(default=0.0, ge=-0.5, le=0.5,
                             description="Vertical offset as fraction of canvas (-0.5 to 0.5)")
    transform_rotation: float = Field(default=0.0, ge=-180.0, le=180.0, description="Shape rotation in degrees")
    transform_scale: float = Field(default=1.0, ge=0.1, le=4.0, description="Shape scale multiplier")
    size_mod_mode: str = Field(default='off', pattern='^(off|noise|image)$',
                               description="Size modulation source")
    size_mod_noise_type: str = Field(default='smooth',
                                     pattern='^(smooth|marble|turbulence|voronoi|wave|cell)$',
                                     description="Noise algorithm when size_mod_mode=noise")
    size_mod_strength: float = Field(default=1.0, ge=0.0, le=2.0,
                                     description="Modulation strength (0=no effect, 1=full range)")
    size_mod_scale: float = Field(default=0.05, ge=0.01, le=1.0,
                                  description="Noise frequency: lower=larger features")
    size_mod_invert: bool = Field(default=False, description="Invert the modulation map")
    mask_invert: bool = Field(default=False, description="Invert the uploaded shape mask (treat bright pixels as inside)")
    size_mod_seed: int = Field(default=0, description="Random seed for noise size map")
    size_mod_image_scale: float = Field(default=1.0, ge=0.1, le=20.0,
                                        description="Image zoom multiplier applied before placement")
    size_mod_image_fill: bool = Field(default=False,
                                      description="True = stretch image to fill canvas; False = native resolution centred")
    size_mod_image_id: str = Field(default='', description="ID of uploaded size map image")
    size_mod_image_hue: float = Field(default=0.0, ge=-180.0, le=180.0,
                                      description="Hue rotation applied to uploaded image (degrees)")
    size_mod_image_saturation: float = Field(default=1.0, ge=0.0, le=5.0,
                                             description="Saturation multiplier applied to uploaded image")
    size_mod_image_contrast: float = Field(default=1.0, ge=0.0, le=2.0,
                                           description="Contrast multiplier applied to uploaded image")
    size_mod_image_levels_low: float = Field(default=0.0, ge=0.0, le=1.0,
                                             description="Levels black point (0–1)")
    size_mod_image_levels_mid: float = Field(default=0.5, ge=0.01, le=0.99,
                                             description="Levels midtone gamma position (0–1, 0.5=neutral)")
    size_mod_image_levels_high: float = Field(default=1.0, ge=0.0, le=1.0,
                                              description="Levels white point (0–1)")
    size_mod_image_rotation: float = Field(default=0.0, description="Image rotation in degrees (clockwise)")
    size_mod_image_x_offset: float = Field(default=0.0, ge=-0.5, le=0.5,
                                           description="Horizontal offset as fraction of canvas")
    size_mod_image_y_offset: float = Field(default=0.0, ge=-0.5, le=0.5,
                                           description="Vertical offset as fraction of canvas")


class GradientConfig(BaseModel):
    start: str = "#FFFFFF"
    end: str = "#000000"
    direction: str = "h"  # "h" = horizontal, "v" = vertical


class ColorConfig(BaseModel):
    colors: List[str] = Field(description="List of hex color strings")
    ratios: List[float] = Field(description="Per-color probability weights")
    background: Optional[str] = Field(default=None,
                                      description="Background hex color, null = transparent")
    background_gradient: Optional[GradientConfig] = Field(default=None,
                                      description="Linear gradient background; overrides background")
    fill_colors: List[str] = Field(default_factory=list,
                                   description="1–3 hex colors randomly distributed across Filled shapes; empty = use colors[0]")
    dot_dot_colors: List[str] = Field(default_factory=list,
                                      description="1–3 hex colors for outer fill of Dot-Dot shapes; empty = use fill_colors")
    outline_color: str = Field(default='',
                               description="Color for Outline shapes; empty = use colors[1]")
    outline_colors: List[str] = Field(default_factory=list,
                                      description="1–3 hex colors randomly distributed across Outline shapes; empty = use outline_color")
    inner_color: str = Field(default='',
                             description="Color for inner dot of Dot shapes; empty = use colors[2]")
    inner_colors: List[str] = Field(default_factory=list,
                                    description="1–3 hex colors randomly distributed across inner dots; empty = use inner_color")
    image_color_mode: bool = Field(default=False,
                                   description="Sample dot colors from uploaded image instead of palette")
    image_color_hue_offset: float = Field(default=0.0, ge=-180.0, le=180.0,
                                          description="Shift the hue of all image-sampled dot colors (degrees)")
    image_color_hue_jitter: float = Field(default=0.0, ge=0.0, le=180.0,
                                          description="Random per-dot hue variation range (degrees)")
    image_color_tone_jitter: float = Field(default=0.0, ge=0.0, le=1.0,
                                           description="Random per-dot brightness variation (0–1)")
    image_color_colorize: bool = Field(default=False,
                                       description="Map image luminance to a shadow→highlight gradient")
    image_color_shadow: str = Field(default="#000000",
                                    description="Color mapped to dark areas when colorize is on")
    image_color_highlight: str = Field(default="#ffffff",
                                       description="Color mapped to light areas when colorize is on")
    gradient_color_mode: bool = Field(default=False,
                                       description="Color dots along a 2-stop gradient based on dot scale")
    gradient_fill_start: str = Field(default="#00A4EF", description="Gradient start for Fill shapes")
    gradient_fill_end: str = Field(default="#737373",   description="Gradient end for Fill shapes")
    gradient_fill_stop0: float = Field(default=0.0, ge=0.0, le=1.0, description="Left stop position (0–1)")
    gradient_fill_stop1: float = Field(default=1.0, ge=0.0, le=1.0, description="Right stop position (0–1)")
    gradient_outline_start: str = Field(default="#00A4EF", description="Gradient start for Outline shapes")
    gradient_outline_end: str = Field(default="#737373",   description="Gradient end for Outline shapes")
    gradient_outline_stop0: float = Field(default=0.0, ge=0.0, le=1.0)
    gradient_outline_stop1: float = Field(default=1.0, ge=0.0, le=1.0)
    gradient_dotdot_start: str = Field(default="#00A4EF", description="Gradient start for Dot-Dot shapes")
    gradient_dotdot_end: str = Field(default="#737373",   description="Gradient end for Dot-Dot shapes")
    gradient_dotdot_stop0: float = Field(default=0.0, ge=0.0, le=1.0)
    gradient_dotdot_stop1: float = Field(default=1.0, ge=0.0, le=1.0)


class PreviewRequest(BaseModel):
    shape: str = Field(default="", description="Bundled shape ID or uploaded mask_id")
    parts: List[str] = Field(default_factory=list,
                             description="Optional part IDs '{shape_id}|{index}' for sub-country selection")
    fill_canvas: bool = Field(default=False,
                              description="Fill entire canvas with dots, ignoring the shape mask")
    show_shape_overlay: bool = Field(default=False,
                                     description="Overlay the shape silhouette at 75% opacity on top of fill-canvas dots")
    clip_fill_to_shape: bool = Field(default=False,
                                     description="Generate full-canvas dots then clip to shape, preserving exact fill-canvas pattern")
    pattern: PatternConfig = PatternConfig()
    colors: ColorConfig = ColorConfig(
        colors=["#00A4EF", "#737373"],
        ratios=[0.60, 0.40],
        background="#EAEAEA",
    )
    preview_width: int = Field(default=800, ge=200, le=8000)
    stroke_width: float = Field(default=2.0, ge=0.5, le=20.0)


class ExportRequest(BaseModel):
    shape: str
    parts: List[str] = Field(default_factory=list,
                             description="Optional part IDs '{shape_id}|{index}' for sub-country selection")
    fill_canvas: bool = Field(default=False,
                              description="Fill entire canvas with dots, ignoring the shape mask")
    pattern: PatternConfig = PatternConfig()
    colors: ColorConfig = ColorConfig(
        colors=["#00A4EF", "#737373"],
        ratios=[0.60, 0.40],
        background="#EAEAEA",
    )
    resolutions: List[str] = Field(default=["2k", "4k"],
                                   description="One or more of: 2k, 4k, 6k, 8k")
    formats: List[str] = Field(default=["png", "png_alpha", "svg"],
                                description="One or more of: png, png_alpha, svg")


class ShapeInfo(BaseModel):
    id: str
    name: str
    category: str  # continent | region | country | custom


class SchemeInfo(BaseModel):
    id: str
    name: str
    colors: List[str]
    ratios: List[float]
    background: Optional[str]
