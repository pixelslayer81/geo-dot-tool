"""
Core dot-pattern generation engine.

Converts a binary shape mask into a list of Dot objects at normalized
coordinates (0–1). The same dot list can then be rendered at any
target resolution without re-running the algorithm.
"""

import colorsys
import random
from dataclasses import dataclass
from typing import List

import numpy as np


@dataclass
class Dot:
    x: float          # normalized x position [0, 1]
    y: float          # normalized y position [0, 1]
    radius: float     # normalized radius, relative to canvas width
    color: str        # fill color (slot 1)
    shape: str = "circle"       # circle | square | circle_dot | circle_outline
    outline_color: str = ""     # stroke color (slot 2) — used by circle_outline
    inner_color: str = ""       # inner dot color (slot 3) — used by circle_dot
    stroke_width: float = 0.14  # stroke as fraction of radius — used by circle_outline
    rotation: float = 0.0       # rotation in degrees


def generate_dots(mask: np.ndarray, config: dict, seed: int = 42) -> List[Dot]:
    """
    Generate dot positions within a shape mask.

    Parameters
    ----------
    mask   : 2-D numpy uint8 array.  255 = inside shape, 0 = outside.
    config : dict with keys matching PatternConfig fields.
    seed   : RNG seed for reproducibility.

    Returns
    -------
    List[Dot] — all positions are normalized to [0, 1].
    """
    rng = random.Random(seed)
    h, w = mask.shape

    size_map = config.get("size_map")          # np.ndarray [h,w] float32 0-1, or None
    size_mod_strength = float(config.get("size_mod_strength", 1.0))
    size_mod_invert = bool(config.get("size_mod_invert", False))

    grid_spacing   = float(config.get("grid_spacing", 10.0))
    _gs_x_raw      = float(config.get("grid_spacing_x", 0.0))
    _gs_y_raw      = float(config.get("grid_spacing_y", 0.0))
    grid_spacing_x = _gs_x_raw if _gs_x_raw > 0 else grid_spacing
    grid_spacing_y = _gs_y_raw if _gs_y_raw > 0 else grid_spacing
    radius_factor  = float(config.get("dot_radius", 0.38))
    jitter         = float(config.get("jitter", 0.0))
    row_offset_x   = float(config.get("row_offset_x", 0.0))
    row_offset_y   = float(config.get("row_offset_y", 0.0))
    edge_fade      = bool(config.get("edge_fade", True))
    edge_fade_cells = float(config.get("edge_fade_cells", 2.0))
    colors         = list(config.get("colors", ["#00A4EF", "#737373", "#FFFFFF"]))
    dot_shapes     = list(config.get("dot_shapes", ["circle"]))

    # Role-based colors with multi-fill support
    _fallback_fill    = colors[0] if len(colors) > 0 else "#00A4EF"
    _fallback_outline = colors[1] if len(colors) > 1 else "#737373"
    _fallback_inner   = colors[2] if len(colors) > 2 else "#FFFFFF"
    fill_colors       = list(config.get("fill_colors", [_fallback_fill])) or [_fallback_fill]
    dot_dot_colors    = list(config.get("dot_dot_colors", [])) or [_fallback_outline]
    outline_color     = config.get("outline_color", _fallback_outline) or _fallback_outline
    outline_colors    = list(config.get("outline_colors", [])) or [outline_color]
    inner_color       = config.get("inner_color",   _fallback_inner)   or _fallback_inner
    inner_colors      = list(config.get("inner_colors", [])) or [inner_color]
    color_map         = config.get("color_map")          # RGB float32 [H, W, 3] or None
    image_color_mode  = bool(config.get("image_color_mode", False))
    gradient_color_mode   = bool(config.get("gradient_color_mode", False))
    grad_fill_start   = str(config.get("gradient_fill_start",    "#00A4EF"))
    grad_fill_end     = str(config.get("gradient_fill_end",      "#737373"))
    grad_fill_s0      = float(config.get("gradient_fill_stop0", 0.0))
    grad_fill_s1      = float(config.get("gradient_fill_stop1", 1.0))
    grad_outline_start= str(config.get("gradient_outline_start", "#00A4EF"))
    grad_outline_end  = str(config.get("gradient_outline_end",   "#737373"))
    grad_outline_s0   = float(config.get("gradient_outline_stop0", 0.0))
    grad_outline_s1   = float(config.get("gradient_outline_stop1", 1.0))
    grad_dotdot_start = str(config.get("gradient_dotdot_start",  "#00A4EF"))
    grad_dotdot_end   = str(config.get("gradient_dotdot_end",    "#737373"))
    grad_dotdot_s0    = float(config.get("gradient_dotdot_stop0", 0.0))
    grad_dotdot_s1    = float(config.get("gradient_dotdot_stop1", 1.0))
    img_hue_offset    = float(config.get("image_color_hue_offset", 0.0)) / 360.0
    img_hue_jitter    = float(config.get("image_color_hue_jitter", 0.0)) / 360.0
    img_tone_jitter   = float(config.get("image_color_tone_jitter", 0.0))
    img_colorize      = bool(config.get("image_color_colorize", False))
    def _lerp_hex(h1: str, h2: str, t: float) -> str:
        h1 = h1.lstrip('#'); h2 = h2.lstrip('#')
        r = int(int(h1[0:2],16) + t*(int(h2[0:2],16)-int(h1[0:2],16)))
        g = int(int(h1[2:4],16) + t*(int(h2[2:4],16)-int(h1[2:4],16)))
        b = int(int(h1[4:6],16) + t*(int(h2[4:6],16)-int(h1[4:6],16)))
        return '#{:02x}{:02x}{:02x}'.format(
            max(0,min(255,r)), max(0,min(255,g)), max(0,min(255,b)))

    def _hex_to_rgb01(h: str):
        h = h.lstrip('#')
        return (int(h[0:2],16)/255.0, int(h[2:4],16)/255.0, int(h[4:6],16)/255.0)
    shadow_rgb    = _hex_to_rgb01(str(config.get("image_color_shadow",    "#000000")))
    highlight_rgb = _hex_to_rgb01(str(config.get("image_color_highlight", "#ffffff")))
    element_scales    = dict(config.get("element_scales", {}))
    element_rotations = dict(config.get("element_rotations", {}))

    _SHAPE_COLUMN_ROLE = {
        'circle': 'circle',         'square': 'circle',
        'triangle': 'circle',       'x_cross': 'circle',       'custom_1': 'circle',
        'circle_dot': 'circle_dot', 'square_dot': 'circle_dot',
        'triangle_dot': 'circle_dot', 'square_x_dot': 'circle_dot', 'custom_2': 'circle_dot',
        'circle_outline': 'circle_outline', 'square_outline': 'circle_outline',
        'triangle_outline': 'circle_outline', 'square_x_outline': 'circle_outline', 'custom_3': 'circle_outline',
        'line_solid': 'circle', 'line_dash': 'circle_dot', 'line_outline': 'circle_outline',
    }
    outline_stroke = float(config.get("outline_stroke", 0.14))

    # grid_spacing is in "base-1000" units so patterns look identical
    # regardless of what resolution the mask was rasterized at.
    px_spacing_x = grid_spacing_x * w / 1000.0
    px_spacing_y = grid_spacing_y * w / 1000.0
    # Keep a reference spacing for dot radius and edge-fade calculations
    px_spacing = grid_spacing * w / 1000.0
    # Dot size is fixed relative to canvas width (reference = grid_spacing 10),
    # so changing grid_spacing only affects dot density, not dot size.
    ref_spacing = w / 100.0
    base_radius = radius_factor * ref_spacing * 0.5

    # Optional distance-to-boundary transform for edge fade
    dist_map: np.ndarray | None = None
    fade_threshold_px = 0.0
    if edge_fade:
        from scipy.ndimage import distance_transform_edt
        dist_map = distance_transform_edt(mask > 0).astype(np.float32)
        fade_threshold_px = edge_fade_cells * min(px_spacing_x, px_spacing_y)

    dots: List[Dot] = []
    half_x = px_spacing_x / 2.0
    half_y = px_spacing_y / 2.0
    row_idx = 0
    y = half_y
    while y < h:
        x = half_x
        # Every other row gets the stagger offset
        stagger_x = row_offset_x * px_spacing_x if row_idx % 2 == 1 else 0.0
        stagger_y = row_offset_y * px_spacing_y if row_idx % 2 == 1 else 0.0
        while x < w:
            # Apply optional jitter + row stagger
            jx = x + stagger_x + rng.uniform(-half_x * jitter, half_x * jitter)
            jy = y + stagger_y + rng.uniform(-half_y * jitter, half_y * jitter)

            # Sample mask at nearest integer pixel
            px = max(0, min(int(round(jx)), w - 1))
            py = max(0, min(int(round(jy)), h - 1))

            if mask[py, px] > 0:
                r = base_radius

                if dist_map is not None:
                    d = float(dist_map[py, px])
                    if d < fade_threshold_px:
                        r = base_radius * (d / fade_threshold_px)

                if size_map is not None:
                    sm_h, sm_w = size_map.shape
                    sx = max(0, min(int(jx * sm_w / w), sm_w - 1))
                    sy = max(0, min(int(jy * sm_h / h), sm_h - 1))
                    mod_val = float(size_map[sy, sx])
                    if size_mod_invert:
                        mod_val = 1.0 - mod_val
                    scale_factor = max(0.0, (1.0 - size_mod_strength) + size_mod_strength * mod_val)
                    r = r * scale_factor

                if r >= 0.15:  # skip sub-pixel dots
                    # Shape selection (uniform random from selected shapes)
                    chosen_shape = rng.choice(dot_shapes)

                    # Per-shape scale multiplier (keyed by column role)
                    r_final = r * element_scales.get(_SHAPE_COLUMN_ROLE.get(chosen_shape, 'circle'), 1.0)
                    if r_final < 0.15:
                        continue

                    # Color by role:
                    # circle / square  → random pick from fill_colors
                    # circle_dot       → random pick from fill_colors (outer) + inner_color
                    # circle_outline   → outline_color
                    if gradient_color_mode:
                        # Gradient: lerp between start→end based on dot's size fraction
                        t_grad = min(1.0, max(0.0, r_final / base_radius)) if base_radius > 0 else 0.0
                        role = _SHAPE_COLUMN_ROLE.get(chosen_shape, 'circle')
                        if role == 'circle_outline':
                            sc, ec, s0, s1 = grad_outline_start, grad_outline_end, grad_outline_s0, grad_outline_s1
                        elif role == 'circle_dot':
                            sc, ec, s0, s1 = grad_dotdot_start, grad_dotdot_end, grad_dotdot_s0, grad_dotdot_s1
                        else:
                            sc, ec, s0, s1 = grad_fill_start, grad_fill_end, grad_fill_s0, grad_fill_s1
                        span = s1 - s0
                        t_norm = max(0.0, min(1.0, (t_grad - s0) / span)) if span > 0.001 else (0.0 if t_grad < s0 else 1.0)
                        dot_color = _lerp_hex(sc, ec, t_norm)
                        dot_outline = dot_color
                        dot_inner = '#ffffff'
                    elif img_colorize and image_color_mode and size_map is not None:
                        # Colorize: sample grayscale from size map → shadow→highlight lerp
                        sm_h, sm_w = size_map.shape
                        sx = max(0, min(int(jx * sm_w / w), sm_w - 1))
                        sy = max(0, min(int(jy * sm_h / h), sm_h - 1))
                        lum = float(size_map[sy, sx])
                        r_c = shadow_rgb[0] + lum * (highlight_rgb[0] - shadow_rgb[0])
                        g_c = shadow_rgb[1] + lum * (highlight_rgb[1] - shadow_rgb[1])
                        b_c = shadow_rgb[2] + lum * (highlight_rgb[2] - shadow_rgb[2])
                        h_c, s_c, v_c = colorsys.rgb_to_hsv(r_c, g_c, b_c)
                        hue_rand = rng.uniform(-img_hue_jitter, img_hue_jitter) if img_hue_jitter > 0 else 0.0
                        h_c = (h_c + img_hue_offset + hue_rand) % 1.0
                        if img_tone_jitter > 0:
                            v_c = max(0.0, min(1.0, v_c * (1.0 + rng.uniform(-img_tone_jitter, img_tone_jitter))))
                        r2, g2, b2 = colorsys.hsv_to_rgb(h_c, s_c, v_c)
                        sampled = '#{:02x}{:02x}{:02x}'.format(int(r2 * 255), int(g2 * 255), int(b2 * 255))
                        dot_color = dot_outline = sampled
                        dot_inner = '#ffffff'
                    elif image_color_mode and color_map is not None:
                        # Image color mode: sample RGB from color map, apply jitters
                        cm_h, cm_w = color_map.shape[:2]
                        px_cm = max(0, min(int(jx * cm_w / w), cm_w - 1))
                        py_cm = max(0, min(int(jy * cm_h / h), cm_h - 1))
                        r_v = float(color_map[py_cm, px_cm, 0])
                        g_v = float(color_map[py_cm, px_cm, 1])
                        b_v = float(color_map[py_cm, px_cm, 2])
                        h_c, s_c, v_c = colorsys.rgb_to_hsv(r_v, g_v, b_v)
                        hue_rand = rng.uniform(-img_hue_jitter, img_hue_jitter) if img_hue_jitter > 0 else 0.0
                        h_c = (h_c + img_hue_offset + hue_rand) % 1.0
                        if img_tone_jitter > 0:
                            v_c = max(0.0, min(1.0, v_c * (1.0 + rng.uniform(-img_tone_jitter, img_tone_jitter))))
                        r2, g2, b2 = colorsys.hsv_to_rgb(h_c, s_c, v_c)
                        sampled = '#{:02x}{:02x}{:02x}'.format(int(r2 * 255), int(g2 * 255), int(b2 * 255))
                        dot_color = dot_outline = sampled
                        dot_inner = '#ffffff'
                    else:
                        role = _SHAPE_COLUMN_ROLE.get(chosen_shape, 'circle')
                        if role == 'circle_outline':
                            dot_color = rng.choice(outline_colors)
                        elif role == 'circle_dot':
                            dot_color = rng.choice(dot_dot_colors)
                        else:
                            dot_color = rng.choice(fill_colors)
                        dot_outline = rng.choice(outline_colors)
                        dot_inner   = '#ffffff' if role == 'circle_dot' else rng.choice(inner_colors)

                    dot_rotation = element_rotations.get(_SHAPE_COLUMN_ROLE.get(chosen_shape, 'circle'), 0.0)
                    dots.append(Dot(
                        x=jx / w,
                        y=jy / h,
                        radius=r_final / w,
                        color=dot_color,
                        shape=chosen_shape,
                        outline_color=dot_outline,
                        inner_color=dot_inner,
                        stroke_width=outline_stroke,
                        rotation=dot_rotation,
                    ))

            x += px_spacing_x
        y += px_spacing_y
        row_idx += 1

    return dots
