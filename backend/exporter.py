"""
Multi-format, multi-resolution export engine.

Renders a list of Dot objects (normalised coordinates) to:
  • PNG  — with solid background
  • PNG  — with transparent (alpha) background
  • SVG  — vector, scalable to any size

All exports for a single request are bundled into a ZIP archive.
"""

import io
import zipfile
from typing import List, Optional

import numpy as np
import svgwrite
from PIL import Image, ImageDraw

from dot_engine import Dot

# Long-edge pixel sizes per resolution tier
_LONG_EDGE: dict[str, int] = {
    "2k": 2048,
    "4k": 4096,
    "6k": 6144,
    "8k": 8192,
}

# Supported aspect ratios  (width : height)
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1":  (1,  1),
    "16:9": (16, 9),
    "4:3":  (4,  3),
    "3:4":  (3,  4),
    "9:16": (9,  16),
    "21:9": (21, 9),
}


def get_resolution(res_name: str, aspect_ratio: str = "1:1") -> tuple[int, int]:
    """Return (width, height) for a resolution tier + aspect ratio."""
    rw, rh = ASPECT_RATIOS.get(aspect_ratio, (1, 1))
    long = _LONG_EDGE.get(res_name, 2048)
    if rw >= rh:
        return long, max(1, int(round(long * rh / rw)))
    else:
        return max(1, int(round(long * rw / rh))), long


# Base width used when generating dots — kept here as single source of truth
BASE_WIDTH: int = 6000


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha


# --------------------------------------------------------------------------- #
# Gradient helper                                                              #
# --------------------------------------------------------------------------- #

def _render_gradient_image(width: int, height: int, start: str, end: str, direction: str) -> Image.Image:
    r1, g1, b1, _ = _hex_to_rgba(start)
    r2, g2, b2, _ = _hex_to_rgba(end)
    if direction == 'h':
        t = np.linspace(0, 1, width, dtype=np.float32)[np.newaxis, :]  # (1, W)
    else:
        t = np.linspace(0, 1, height, dtype=np.float32)[:, np.newaxis]  # (H, 1)
    r = np.broadcast_to(np.clip(r1 + t * (r2 - r1), 0, 255).astype(np.uint8), (height, width))
    g = np.broadcast_to(np.clip(g1 + t * (g2 - g1), 0, 255).astype(np.uint8), (height, width))
    b = np.broadcast_to(np.clip(b1 + t * (b2 - b1), 0, 255).astype(np.uint8), (height, width))
    arr = np.stack([np.array(r), np.array(g), np.array(b),
                    np.full((height, width), 255, dtype=np.uint8)], axis=-1)
    return Image.fromarray(arr, mode='RGBA')


# --------------------------------------------------------------------------- #
# PNG renderer                                                                 #
# --------------------------------------------------------------------------- #

def render_png(
    dots: List[Dot],
    width: int,
    height: int,
    background: Optional[str],
    dot_shape: str = "circle",
    supersample: int = 1,
    background_gradient: Optional[dict] = None,
) -> bytes:
    """Return PNG bytes at (width × height). Transparent when background is None.

    supersample > 1 renders at that multiple then downsamples with LANCZOS for
    smooth, anti-aliased circles.
    """
    rw = width  * supersample
    rh = height * supersample
    if background_gradient:
        img = _render_gradient_image(rw, rh,
                                     background_gradient.get('start', '#FFFFFF'),
                                     background_gradient.get('end', '#000000'),
                                     background_gradient.get('direction', 'h'))
    else:
        bg = _hex_to_rgba(background) if background else (0, 0, 0, 0)
        img = Image.new("RGBA", (rw, rh), bg)
    draw = ImageDraw.Draw(img)

    for dot in dots:
        cx = dot.x * rw
        cy = dot.y * rh
        r  = dot.radius * rw
        fill = _hex_to_rgba(dot.color)

        shape = getattr(dot, 'shape', dot_shape)
        inner_hex = getattr(dot, 'inner_color', '') or '#FFFFFF'
        outline_hex = getattr(dot, 'outline_color', '') or dot.color
        if shape == "square":
            draw.rectangle([cx - r, cy - r, cx + r, cy + r], fill=fill)
        elif shape == "circle_dot":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
            ir = r * 0.38
            draw.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=_hex_to_rgba(inner_hex))
        elif shape == "circle_outline":
            sw = getattr(dot, 'stroke_width', 0.14)
            lw = max(1, int(r * sw))
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=_hex_to_rgba(outline_hex), width=lw)
        else:
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

    if supersample > 1:
        img = img.resize((width, height), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# SVG renderer                                                                 #
# --------------------------------------------------------------------------- #

def render_svg(
    dots: List[Dot],
    width: int,
    height: int,
    background: Optional[str],
    dot_shape: str = "circle",
) -> str:
    """Return an SVG string. background=None produces a transparent SVG."""
    dwg = svgwrite.Drawing(
        size=(f"{width}px", f"{height}px"),
        viewBox=f"0 0 {width} {height}",
    )

    if background:
        dwg.add(dwg.rect(insert=(0, 0), size=(width, height), fill=background))

    for dot in dots:
        cx = dot.x * width
        cy = dot.y * height
        r  = dot.radius * width

        if dot_shape == "square":
            dwg.add(dwg.rect(
                insert=(cx - r, cy - r),
                size=(r * 2, r * 2),
                fill=dot.color,
            ))
        else:
            dwg.add(dwg.circle(center=(cx, cy), r=r, fill=dot.color))

    return dwg.tostring()


# --------------------------------------------------------------------------- #
# ZIP bundle                                                                   #
# --------------------------------------------------------------------------- #

def generate_export_zip(
    dots: List[Dot],
    shape_name: str,
    resolutions: List[str],
    formats: List[str],
    background: Optional[str],
    dot_shape: str = "circle",
    aspect_ratio: str = "1:1",
    background_gradient: Optional[dict] = None,
) -> bytes:
    """
    Build a ZIP archive containing all requested files.

    formats      : "png", "png_alpha", "svg"
    resolutions  : "2k", "4k", "6k", "8k"
    aspect_ratio : "1:1", "16:9", "4:3", "3:4", "9:16", "21:9"
    """
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # SVG — generate once at 4K equivalent viewport
        if "svg" in formats:
            svg_w, svg_h = get_resolution("4k", aspect_ratio)

            svg_str = render_svg(dots, svg_w, svg_h, background, dot_shape)
            zf.writestr(f"{shape_name}_dots.svg", svg_str.encode())

            if background:
                svg_alpha = render_svg(dots, svg_w, svg_h, None, dot_shape)
                zf.writestr(f"{shape_name}_dots_alpha.svg", svg_alpha.encode())

        for res_name in resolutions:
            if res_name not in _LONG_EDGE:
                continue
            w, h = get_resolution(res_name, aspect_ratio)

            if "png" in formats:
                data = render_png(dots, w, h, background, dot_shape, background_gradient=background_gradient)
                zf.writestr(f"{shape_name}_dots_{res_name}.png", data)

            if "png_alpha" in formats:
                data_alpha = render_png(dots, w, h, None, dot_shape)
                zf.writestr(f"{shape_name}_dots_{res_name}_alpha.png", data_alpha)

    buf.seek(0)
    return buf.read()
