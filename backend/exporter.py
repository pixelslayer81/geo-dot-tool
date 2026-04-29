"""
Multi-format, multi-resolution export engine.

Renders a list of Dot objects (normalised coordinates) to:
  • PNG  — with solid background
  • PNG  — with transparent (alpha) background
  • SVG  — vector, scalable to any size
"""

import base64
import io
import math
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
# Shape geometry helpers                                                       #
# --------------------------------------------------------------------------- #

def _triangle_pts(cx: float, cy: float, r: float, rot_deg: float):
    """Equilateral triangle centred at (cx,cy) with circumradius r, apex up."""
    return [
        (cx + r * math.cos(math.radians(-90 + rot_deg + i * 120)),
         cy + r * math.sin(math.radians(-90 + rot_deg + i * 120)))
        for i in range(3)
    ]


def _rotated_rect_pts(cx: float, cy: float, rx: float, ry: float, rot_deg: float):
    """Axis-aligned rectangle half-extents (rx, ry), rotated by rot_deg."""
    rad = math.radians(rot_deg)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    corners = [(-rx, -ry), (rx, -ry), (rx, ry), (-rx, ry)]
    return [(cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a)
            for dx, dy in corners]



# --------------------------------------------------------------------------- #
# Outline inner-area restoration helpers (gradient background case)           #
# --------------------------------------------------------------------------- #

def _restore_inner_ellipse(img: 'Image.Image', snap: 'Image.Image', cx: float, cy: float, r: float) -> None:
    bx1 = max(0, int(cx - r))
    by1 = max(0, int(cy - r))
    bx2 = min(img.width,  int(cx + r) + 1)
    by2 = min(img.height, int(cy + r) + 1)
    if bx2 <= bx1 or by2 <= by1:
        return
    bw, bh = bx2 - bx1, by2 - by1
    m = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(m).ellipse([cx - r - bx1, cy - r - by1, cx + r - bx1, cy + r - by1], fill=255)
    img.paste(snap.crop((bx1, by1, bx2, by2)), (bx1, by1), m)


def _restore_inner_rect(img: 'Image.Image', snap: 'Image.Image',
                        cx: float, cy: float, rx: float, ry: float, rot: float) -> None:
    pts = _rotated_rect_pts(cx, cy, rx, ry, rot)
    _restore_inner_poly(img, snap, pts)


def _restore_inner_poly(img: 'Image.Image', snap: 'Image.Image', pts: list) -> None:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bx1 = max(0, int(min(xs)))
    by1 = max(0, int(min(ys)))
    bx2 = min(img.width,  int(max(xs)) + 1)
    by2 = min(img.height, int(max(ys)) + 1)
    if bx2 <= bx1 or by2 <= by1:
        return
    bw, bh = bx2 - bx1, by2 - by1
    m = Image.new("L", (bw, bh), 0)
    offset_pts = [(x - bx1, y - by1) for x, y in pts]
    ImageDraw.Draw(m).polygon(offset_pts, fill=255)
    img.paste(snap.crop((bx1, by1, bx2, by2)), (bx1, by1), m)


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

    # Snapshot of background used to restore inner areas of outline shapes.
    # For gradient backgrounds we paste from this; for solid/transparent we
    # compute a static fill colour once instead (much faster).
    if background_gradient is not None:
        _bg_snapshot: Optional[Image.Image] = img.copy()
        _inner_bg: Optional[tuple] = None          # use snapshot per-dot
    elif background is not None:
        _bg_snapshot = None
        _inner_bg = _hex_to_rgba(background)
    else:
        _bg_snapshot = None
        _inner_bg = (0, 0, 0, 0)                   # transparent cut-out

    draw = ImageDraw.Draw(img)

    for dot in dots:
        cx = dot.x * rw
        cy = dot.y * rh
        r  = dot.radius * rw
        fill = _hex_to_rgba(dot.color)

        shape = getattr(dot, 'shape', dot_shape)
        rot = getattr(dot, 'rotation', 0.0)
        inner_hex = getattr(dot, 'inner_color', '') or '#FFFFFF'
        outline_hex = getattr(dot, 'outline_color', '') or dot.color
        sw_frac = getattr(dot, 'stroke_width', 0.14)

        if shape == "square":
            draw.polygon(_rotated_rect_pts(cx, cy, r, r, rot), fill=fill)

        elif shape == "square_dot":
            draw.polygon(_rotated_rect_pts(cx, cy, r, r, rot), fill=fill)
            ir = r * 0.38
            draw.polygon(_rotated_rect_pts(cx, cy, ir, ir, rot), fill=_hex_to_rgba(inner_hex))

        elif shape == "square_outline":
            lw = r * sw_frac * 2
            draw.polygon(_rotated_rect_pts(cx, cy, r, r, rot), fill=_hex_to_rgba(outline_hex))
            ir = r - lw
            if ir >= 0.5:
                if _inner_bg is not None:
                    draw.polygon(_rotated_rect_pts(cx, cy, ir, ir, rot), fill=_inner_bg)
                elif _bg_snapshot is not None:
                    _restore_inner_rect(img, _bg_snapshot, cx, cy, ir, ir, rot)

        elif shape in ("triangle", "triangle_dot", "triangle_outline"):
            pts = _triangle_pts(cx, cy, r, rot)
            if shape == "triangle_outline":
                lw = r * sw_frac * 2
                draw.polygon(pts, fill=_hex_to_rgba(outline_hex))
                ir = r - 2 * lw
                if ir >= 0.5:
                    inner_pts = _triangle_pts(cx, cy, ir, rot)
                    if _inner_bg is not None:
                        draw.polygon(inner_pts, fill=_inner_bg)
                    elif _bg_snapshot is not None:
                        _restore_inner_poly(img, _bg_snapshot, inner_pts)
            else:
                draw.polygon(pts, fill=fill)
                if shape == "triangle_dot":
                    ir = r * 0.38
                    draw.polygon(_triangle_pts(cx, cy, ir, rot),
                                 fill=_hex_to_rgba(inner_hex))

        elif shape == "x_cross":
            lw = max(1, int(r * 0.4))
            for base_angle in (45, 135):
                a = math.radians(base_angle + rot)
                draw.line(
                    [(cx - r * math.cos(a), cy - r * math.sin(a)),
                     (cx + r * math.cos(a), cy + r * math.sin(a))],
                    fill=fill, width=lw,
                )

        elif shape == "square_x_dot":
            # Filled square background
            draw.polygon(_rotated_rect_pts(cx, cy, r, r, rot), fill=fill)
            # X cross in inner_color (arm = r*0.55 → r_eff = r*0.55/cos45° ≈ r*0.778)
            x_lw = max(1, int(r * 0.35))
            x_arm = r * 0.778
            inner_fill = _hex_to_rgba(inner_hex)
            for base_angle in (45, 135):
                a = math.radians(base_angle + rot)
                draw.line(
                    [(cx - x_arm * math.cos(a), cy - x_arm * math.sin(a)),
                     (cx + x_arm * math.cos(a), cy + x_arm * math.sin(a))],
                    fill=inner_fill, width=x_lw,
                )

        elif shape == "square_x_outline":
            # Outline square (two-filled approach)
            sq_lw = max(1, int(r * sw_frac * 2))
            draw.polygon(_rotated_rect_pts(cx, cy, r, r, rot), fill=_hex_to_rgba(outline_hex))
            sq_ir = r - sq_lw
            if sq_ir >= 0.5:
                if _inner_bg is not None:
                    draw.polygon(_rotated_rect_pts(cx, cy, sq_ir, sq_ir, rot), fill=_inner_bg)
                elif _bg_snapshot is not None:
                    _restore_inner_rect(img, _bg_snapshot, cx, cy, sq_ir, sq_ir, rot)
            # X cross in outline_color (arm = r*0.5 → r_eff = r*0.5/cos45° ≈ r*0.707)
            x_lw = max(1, int(r * 0.15))
            x_arm = r * 0.707
            x_col = _hex_to_rgba(outline_hex)
            for base_angle in (45, 135):
                a = math.radians(base_angle + rot)
                draw.line(
                    [(cx - x_arm * math.cos(a), cy - x_arm * math.sin(a)),
                     (cx + x_arm * math.cos(a), cy + x_arm * math.sin(a))],
                    fill=x_col, width=x_lw,
                )

        elif shape in ("line_solid", "line_dash", "line_outline"):
            lh = max(1.0, r * 0.35)
            rad = math.radians(rot)
            cos_r, sin_r = math.cos(rad), math.sin(rad)
            cos_p, sin_p = -sin_r, cos_r  # perpendicular direction

            if shape == "line_dash":
                for offset in (-0.55, 0.0, 0.55):
                    seg = r * 0.28
                    ox = offset * r * 0.6 * cos_r
                    oy = offset * r * 0.6 * sin_r
                    pts = [
                        (cx + ox - seg * cos_r - lh * cos_p, cy + oy - seg * sin_r - lh * sin_p),
                        (cx + ox + seg * cos_r - lh * cos_p, cy + oy + seg * sin_r - lh * sin_p),
                        (cx + ox + seg * cos_r + lh * cos_p, cy + oy + seg * sin_r + lh * sin_p),
                        (cx + ox - seg * cos_r + lh * cos_p, cy + oy - seg * sin_r + lh * sin_p),
                    ]
                    draw.polygon(pts, fill=fill)
            else:
                pts = [
                    (cx - r * cos_r - lh * cos_p, cy - r * sin_r - lh * sin_p),
                    (cx + r * cos_r - lh * cos_p, cy + r * sin_r - lh * sin_p),
                    (cx + r * cos_r + lh * cos_p, cy + r * sin_r + lh * sin_p),
                    (cx - r * cos_r + lh * cos_p, cy - r * sin_r + lh * sin_p),
                ]
                if shape == "line_outline":
                    lw = r * sw_frac * 2
                    draw.polygon(pts, fill=_hex_to_rgba(outline_hex))
                    lr_inner = r - lw
                    lh_inner = lh - lw
                    if lr_inner >= 0.5 and lh_inner >= 0.5:
                        inner_pts = [
                            (cx - lr_inner * cos_r - lh_inner * cos_p, cy - lr_inner * sin_r - lh_inner * sin_p),
                            (cx + lr_inner * cos_r - lh_inner * cos_p, cy + lr_inner * sin_r - lh_inner * sin_p),
                            (cx + lr_inner * cos_r + lh_inner * cos_p, cy + lr_inner * sin_r + lh_inner * sin_p),
                            (cx - lr_inner * cos_r + lh_inner * cos_p, cy - lr_inner * sin_r + lh_inner * sin_p),
                        ]
                        if _inner_bg is not None:
                            draw.polygon(inner_pts, fill=_inner_bg)
                        elif _bg_snapshot is not None:
                            _restore_inner_poly(img, _bg_snapshot, inner_pts)
                else:
                    draw.polygon(pts, fill=fill)

        elif shape == "circle_dot":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
            ir = r * 0.38
            draw.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=_hex_to_rgba(inner_hex))

        elif shape == "circle_outline":
            lw = r * sw_frac * 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=_hex_to_rgba(outline_hex))
            ir = r - lw
            if ir >= 0.5:
                if _inner_bg is not None:
                    draw.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=_inner_bg)
                elif _bg_snapshot is not None:
                    _restore_inner_ellipse(img, _bg_snapshot, cx, cy, ir)

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

def _add_dot_to_container(container, dwg, dot, width: int, height: int, dot_shape: str) -> None:
    """Render a single Dot's SVG elements into *container* (Drawing or Group)."""
    cx = dot.x * width
    cy = dot.y * height
    r  = dot.radius * width
    shape = getattr(dot, 'shape', dot_shape)
    rot = getattr(dot, 'rotation', 0.0)
    inner_hex = getattr(dot, 'inner_color', '') or '#FFFFFF'
    outline_hex = getattr(dot, 'outline_color', '') or dot.color
    sw_frac = getattr(dot, 'stroke_width', 0.14)

    if shape == "square":
        el = dwg.rect(insert=(cx - r, cy - r), size=(r * 2, r * 2), fill=dot.color)
        if rot:
            el.rotate(rot, center=(cx, cy))
        container.add(el)

    elif shape == "square_dot":
        el = dwg.rect(insert=(cx - r, cy - r), size=(r * 2, r * 2), fill=dot.color)
        if rot:
            el.rotate(rot, center=(cx, cy))
        container.add(el)
        ir = r * 0.38
        el_inner = dwg.rect(insert=(cx - ir, cy - ir), size=(ir * 2, ir * 2), fill=inner_hex)
        if rot:
            el_inner.rotate(rot, center=(cx, cy))
        container.add(el_inner)

    elif shape == "square_outline":
        lw = max(0.5, r * sw_frac * 2)
        el = dwg.rect(insert=(cx - r, cy - r), size=(r * 2, r * 2),
                      fill="none", stroke=outline_hex, stroke_width=lw)
        if rot:
            el.rotate(rot, center=(cx, cy))
        container.add(el)

    elif shape in ("triangle", "triangle_dot", "triangle_outline"):
        pts = _triangle_pts(cx, cy, r, rot)
        if shape == "triangle_outline":
            lw = max(0.5, r * sw_frac * 2)
            container.add(dwg.polygon(pts, fill="none", stroke=outline_hex, stroke_width=lw))
        else:
            container.add(dwg.polygon(pts, fill=dot.color))
            if shape == "triangle_dot":
                container.add(dwg.polygon(_triangle_pts(cx, cy, r * 0.38, rot), fill=inner_hex))

    elif shape == "x_cross":
        lw = max(0.5, r * 0.4)
        for base_angle in (45, 135):
            a = math.radians(base_angle + rot)
            container.add(dwg.line(
                start=(cx - r * math.cos(a), cy - r * math.sin(a)),
                end=(cx + r * math.cos(a), cy + r * math.sin(a)),
                stroke=dot.color, stroke_width=lw, stroke_linecap="round",
            ))

    elif shape == "square_x_dot":
        # Filled square
        el = dwg.rect(insert=(cx - r, cy - r), size=(r * 2, r * 2), fill=dot.color)
        if rot:
            el.rotate(rot, center=(cx, cy))
        container.add(el)
        # X cross in inner_color (arm = r*0.55 → r_eff ≈ r*0.778)
        x_lw = max(0.5, r * 0.35)
        x_arm = r * 0.778
        for base_angle in (45, 135):
            a = math.radians(base_angle + rot)
            container.add(dwg.line(
                start=(cx - x_arm * math.cos(a), cy - x_arm * math.sin(a)),
                end=(cx + x_arm * math.cos(a), cy + x_arm * math.sin(a)),
                stroke=inner_hex, stroke_width=x_lw, stroke_linecap="round",
            ))

    elif shape == "square_x_outline":
        # Outline square
        sq_lw = max(0.5, r * sw_frac * 2)
        el = dwg.rect(insert=(cx - r, cy - r), size=(r * 2, r * 2),
                      fill="none", stroke=outline_hex, stroke_width=sq_lw)
        if rot:
            el.rotate(rot, center=(cx, cy))
        container.add(el)
        # X cross in outline_color (arm = r*0.5 → r_eff ≈ r*0.707)
        x_lw = max(0.5, r * 0.15)
        x_arm = r * 0.707
        for base_angle in (45, 135):
            a = math.radians(base_angle + rot)
            container.add(dwg.line(
                start=(cx - x_arm * math.cos(a), cy - x_arm * math.sin(a)),
                end=(cx + x_arm * math.cos(a), cy + x_arm * math.sin(a)),
                stroke=outline_hex, stroke_width=x_lw, stroke_linecap="round",
            ))

    elif shape in ("line_solid", "line_dash", "line_outline"):
        lh = max(0.5, r * 0.35)
        rad = math.radians(rot)
        cos_r, sin_r = math.cos(rad), math.sin(rad)
        cos_p, sin_p = -sin_r, cos_r

        if shape == "line_dash":
            for offset in (-0.55, 0.0, 0.55):
                seg = r * 0.28
                ox = offset * r * 0.6 * cos_r
                oy = offset * r * 0.6 * sin_r
                pts = [
                    (cx + ox - seg * cos_r - lh * cos_p, cy + oy - seg * sin_r - lh * sin_p),
                    (cx + ox + seg * cos_r - lh * cos_p, cy + oy + seg * sin_r - lh * sin_p),
                    (cx + ox + seg * cos_r + lh * cos_p, cy + oy + seg * sin_r + lh * sin_p),
                    (cx + ox - seg * cos_r + lh * cos_p, cy + oy - seg * sin_r + lh * sin_p),
                ]
                container.add(dwg.polygon(pts, fill=dot.color))
        else:
            pts = [
                (cx - r * cos_r - lh * cos_p, cy - r * sin_r - lh * sin_p),
                (cx + r * cos_r - lh * cos_p, cy + r * sin_r - lh * sin_p),
                (cx + r * cos_r + lh * cos_p, cy + r * sin_r + lh * sin_p),
                (cx - r * cos_r + lh * cos_p, cy - r * sin_r + lh * sin_p),
            ]
            if shape == "line_outline":
                lw = max(0.5, r * sw_frac * 2)
                container.add(dwg.polygon(pts, fill="none", stroke=outline_hex, stroke_width=lw))
            else:
                container.add(dwg.polygon(pts, fill=dot.color))

    elif shape == "circle_dot":
        container.add(dwg.circle(center=(cx, cy), r=r, fill=dot.color))
        container.add(dwg.circle(center=(cx, cy), r=r * 0.38, fill=inner_hex))

    elif shape == "circle_outline":
        lw = max(0.5, r * sw_frac * 2)
        container.add(dwg.circle(center=(cx, cy), r=r,
                                  fill="none", stroke=outline_hex, stroke_width=lw))

    else:
        container.add(dwg.circle(center=(cx, cy), r=r, fill=dot.color))


def _make_layer(dwg, layer_id: str, label: str):
    """Create a labeled SVG group (compatible with all SVG renderers)."""
    return dwg.g(id=layer_id)


def render_svg(
    dots: List[Dot],
    width: int,
    height: int,
    background: Optional[str],
    dot_shape: str = "circle",
) -> str:
    """Return a layered SVG string. background=None produces a transparent SVG.

    Dots are grouped into per-color layers so the file opens as a layered
    document in Illustrator and Inkscape.
    """
    from collections import OrderedDict

    dwg = svgwrite.Drawing(
        size=(f"{width}px", f"{height}px"),
        viewBox=f"0 0 {width} {height}",
    )

    # Background layer
    bg_layer = _make_layer(dwg, 'background', 'Background')
    if background:
        bg_layer.add(dwg.rect(insert=(0, 0), size=(width, height), fill=background))
    dwg.add(bg_layer)

    # Collect unique colors in order of first appearance
    seen: OrderedDict[str, list] = OrderedDict()
    for dot in dots:
        c = dot.color
        if c not in seen:
            seen[c] = []
        seen[c].append(dot)

    # Use per-color layers when count is manageable; otherwise one "Dots" layer
    _MAX_COLOR_LAYERS = 30
    if len(seen) <= _MAX_COLOR_LAYERS:
        for i, (color, group) in enumerate(seen.items()):
            safe_id = f"color_{color.lstrip('#')}"
            layer = _make_layer(dwg, safe_id, color)
            for dot in group:
                _add_dot_to_container(layer, dwg, dot, width, height, dot_shape)
            dwg.add(layer)
    else:
        # Many unique colors (gradient / image mode) — single Dots layer
        dots_layer = _make_layer(dwg, 'dots', 'Dots')
        for dot in dots:
            _add_dot_to_container(dots_layer, dwg, dot, width, height, dot_shape)
        dwg.add(dots_layer)

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


# --------------------------------------------------------------------------- #
# Individual file list (no ZIP)                                                #
# --------------------------------------------------------------------------- #

def generate_export_files(
    dots: List[Dot],
    shape_name: str,
    resolutions: List[str],
    formats: List[str],
    background: Optional[str],
    dot_shape: str = "circle",
    aspect_ratio: str = "1:1",
    background_gradient: Optional[dict] = None,
) -> list[dict]:
    """
    Return a list of {"name": filename, "data": base64_string} dicts.

    Each file is downloaded individually by the browser — no ZIP.
    """
    files = []
    import re as _re
    slug = _re.sub(r'[^a-z0-9]+', '_', shape_name.lower()).strip('_') or 'export'

    if "svg" in formats:
        svg_w, svg_h = get_resolution("4k", aspect_ratio)
        svg_str = render_svg(dots, svg_w, svg_h, background, dot_shape)
        files.append({
            "name": f"{slug}_dots_4k.svg",
            "data": base64.b64encode(svg_str.encode()).decode(),
        })
        if background:
            svg_alpha = render_svg(dots, svg_w, svg_h, None, dot_shape)
            files.append({
                "name": f"{slug}_dots_4k_alpha.svg",
                "data": base64.b64encode(svg_alpha.encode()).decode(),
            })

    # Match the anti-aliasing quality of the canvas preview (supersample=3).
    # 2K renders at 4K internally then downsamples → smooth edges identical to canvas.
    # 4K+ are already high-resolution enough that ss=1 looks correct.
    _SS = {"2k": 2, "4k": 1, "6k": 1, "8k": 1}

    for res_name in resolutions:
        if res_name not in _LONG_EDGE:
            continue
        w, h = get_resolution(res_name, aspect_ratio)
        ss = _SS.get(res_name, 1)
        if "png" in formats:
            data = render_png(dots, w, h, background, dot_shape, supersample=ss, background_gradient=background_gradient)
            files.append({
                "name": f"{slug}_dots_{res_name}.png",
                "data": base64.b64encode(data).decode(),
            })
        if "png_alpha" in formats:
            data_alpha = render_png(dots, w, h, None, dot_shape, supersample=ss)
            files.append({
                "name": f"{slug}_dots_{res_name}_alpha.png",
                "data": base64.b64encode(data_alpha).decode(),
            })

    return files
