"""
FastAPI application entry point.

Routes:
  GET  /api/shapes       — list bundled shapes
  GET  /api/schemes      — list named colour schemes
  POST /api/preview      — render low-res preview → base64 PNG
  POST /api/export       — render full-res assets → ZIP download
  POST /api/upload-mask  — upload custom PNG/JPG mask

In production the built React frontend is served from /frontend/dist/.
"""

import base64
import io
import os
import uuid
from pathlib import Path

import numpy as np
from PIL import Image as PILImage
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from color_schemes import SCHEMES

def _hex_to_rgba(hex_color: str) -> tuple:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255
from dot_engine import Dot as DotCls, generate_dots
from exporter import ASPECT_RATIOS, BASE_WIDTH, generate_export_zip, get_resolution, render_png
from geo_loader import get_shapes_catalog, get_world_geojson, parts_to_mask, shape_to_mask
from mask_processor import get_grayscale, get_mask, process_uploaded_mask
from schemas import ColorConfig, ExportRequest, PatternConfig, PreviewRequest, SchemeInfo


# Shape always fills this fraction of the shorter canvas dimension
_FILL = 0.784

# Per-shape fill multiplier — reserved for future per-shape zoom overrides
_SHAPE_SCALE: dict[str, float] = {}

# In-memory store for uploaded size map images (RGB float32 [H, W, 3])
_size_map_store: dict[str, np.ndarray] = {}


def _smooth_layer(h: int, w: int, scale: float, rng) -> np.ndarray:
    """Bilinear-upscaled coarse random grid → float32 [0,1]."""
    lh = max(2, int(h * scale))
    lw = max(2, int(w * scale))
    low = rng.random((lh, lw)).astype(np.float32)
    return np.array(
        PILImage.fromarray((low * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
    ) / 255.0


def _generate_noise_map(h: int, w: int, scale: float, seed: int, noise_type: str = 'smooth') -> np.ndarray:
    rng = np.random.default_rng(seed)

    if noise_type == 'smooth':
        return _smooth_layer(h, w, scale, rng)

    elif noise_type == 'marble':
        # Turbulence used as phase distortion for a sine sweep, computed at reduced resolution
        rh, rw = max(4, h // 8), max(4, w // 8)
        turb = np.zeros((rh, rw), dtype=np.float32)
        amp, total, s = 1.0, 0.0, scale
        for _ in range(5):
            layer = _smooth_layer(rh, rw, s, rng) * 2.0 - 1.0
            turb += amp * np.abs(layer)
            total += amp
            amp *= 0.6
            s = min(s * 2.0, 1.0)
        turb /= total
        freq = (1.0 / max(scale, 0.01)) * 0.25
        ys = np.linspace(0.0, 1.0, rh, dtype=np.float32)
        xs = np.linspace(0.0, 1.0, rw, dtype=np.float32)
        gx, gy = np.meshgrid(xs, ys)
        angle = float(rng.random() * np.pi)
        axis = gx * np.cos(angle) + gy * np.sin(angle)
        sine = np.sin((axis * freq + turb * 4.0) * 2.0 * np.pi)
        low = ((sine + 1.0) * 0.5).astype(np.float32)
        return np.array(
            PILImage.fromarray((low * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
        ).astype(np.float32) / 255.0

    elif noise_type == 'turbulence':
        # Absolute-value FBM computed at reduced resolution then upscaled
        rh, rw = max(4, h // 8), max(4, w // 8)
        result = np.zeros((rh, rw), dtype=np.float32)
        amp, total, s = 1.0, 0.0, scale
        for _ in range(6):
            layer = _smooth_layer(rh, rw, s, rng) * 2.0 - 1.0
            result += amp * np.abs(layer)
            total += amp
            amp *= 0.65
            s = min(s * 2.0, 1.0)
        result /= total
        return np.array(
            PILImage.fromarray((result * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
        ).astype(np.float32) / 255.0

    elif noise_type == 'voronoi':
        # Worley / cellular noise computed at reduced resolution then upscaled
        from scipy.spatial import cKDTree
        rh, rw = max(4, h // 8), max(4, w // 8)
        n_pts = max(4, min(int(0.25 / (scale * scale)), 1500))
        pts = rng.random((n_pts, 2)).astype(np.float32)
        ys = np.linspace(0.0, 1.0, rh, dtype=np.float32)
        xs = np.linspace(0.0, 1.0, rw, dtype=np.float32)
        gx, gy = np.meshgrid(xs, ys)
        grid = np.stack([gy.ravel(), gx.ravel()], axis=1)
        dists, _ = cKDTree(pts).query(grid, k=1)
        dists = dists.reshape(rh, rw).astype(np.float32)
        dmax = dists.max()
        if dmax > 0:
            dists /= dmax
        return np.array(
            PILImage.fromarray((dists * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
        ).astype(np.float32) / 255.0

    elif noise_type == 'wave':
        # Multi-directional sine waves computed at reduced resolution then upscaled
        rh, rw = max(4, h // 8), max(4, w // 8)
        freq = (1.0 / max(scale, 0.01)) * 0.5
        angle1 = float(rng.random() * np.pi)
        angle2 = angle1 + np.pi / 3.0
        ys = np.linspace(0.0, 1.0, rh, dtype=np.float32)
        xs = np.linspace(0.0, 1.0, rw, dtype=np.float32)
        gx, gy = np.meshgrid(xs, ys)
        w1 = np.sin((gx * np.cos(angle1) + gy * np.sin(angle1)) * freq * 2 * np.pi)
        w2 = np.sin((gx * np.cos(angle2) + gy * np.sin(angle2)) * freq * 2 * np.pi * 0.7)
        combined = ((w1 + w2) * 0.5 + 1.0) * 0.5  # [0, 1]
        low = combined.astype(np.float32)
        return np.array(
            PILImage.fromarray((low * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
        ).astype(np.float32) / 255.0

    elif noise_type == 'cell':
        # F2-F1 Worley noise: bright borders between cells → cracked-earth / network pattern
        from scipy.spatial import cKDTree
        rh, rw = max(4, h // 32), max(4, w // 32)
        n_pts = max(4, min(int(0.25 / (scale * scale)), 1500))
        pts = rng.random((n_pts, 2)).astype(np.float32)
        ys = np.linspace(0.0, 1.0, rh, dtype=np.float32)
        xs = np.linspace(0.0, 1.0, rw, dtype=np.float32)
        gx, gy = np.meshgrid(xs, ys)
        grid = np.stack([gy.ravel(), gx.ravel()], axis=1)
        dists, _ = cKDTree(pts).query(grid, k=2)
        f1 = dists[:, 0].reshape(rh, rw).astype(np.float32)
        f2 = dists[:, 1].reshape(rh, rw).astype(np.float32)
        result = f2 - f1
        dmax = result.max()
        if dmax > 0:
            result /= dmax
        return np.array(
            PILImage.fromarray((result * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
        ).astype(np.float32) / 255.0

    # fallback
    return _smooth_layer(h, w, scale, rng)


def _rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    """Convert RGB float32 [H,W,3] to HSV float32 [H,W,3]."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    maxc = np.max(rgb, axis=2)
    minc = np.min(rgb, axis=2)
    diff = maxc - minc
    safe = np.where(diff > 0, diff, 1.0)
    rc = (maxc - r) / safe
    gc = (maxc - g) / safe
    bc = (maxc - b) / safe
    h = np.where(r == maxc, bc - gc,
         np.where(g == maxc, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    h = np.where(diff > 0, h, 0.0)
    s = np.where(maxc > 0, diff / maxc, 0.0)
    return np.stack([h, s, maxc], axis=2).astype(np.float32)


def _hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    """Convert HSV float32 [H,W,3] to RGB float32 [H,W,3]."""
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    i = (h * 6.0).astype(int) % 6
    f = h * 6.0 - np.floor(h * 6.0)
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    r = np.select([i==0, i==1, i==2, i==3, i==4, i==5], [v, q, p, p, t, v])
    g = np.select([i==0, i==1, i==2, i==3, i==4, i==5], [t, v, v, q, p, p])
    b = np.select([i==0, i==1, i==2, i==3, i==4, i==5], [p, p, t, v, v, q])
    return np.clip(np.stack([r, g, b], axis=2), 0.0, 1.0).astype(np.float32)


def _apply_image_adjustments(img_rgb: np.ndarray, hue_shift: float, saturation: float, contrast: float) -> np.ndarray:
    """Apply hue rotation, saturation scale, and contrast to RGB float32 [H,W,3]."""
    out = img_rgb.copy()
    if contrast != 1.0:
        out = np.clip(0.5 + (out - 0.5) * contrast, 0.0, 1.0).astype(np.float32)
    if hue_shift != 0.0 or saturation != 1.0:
        hsv = _rgb_to_hsv(out)
        hsv[:, :, 0] = (hsv[:, :, 0] + hue_shift / 360.0) % 1.0
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * saturation, 0.0, 1.0)
        out = _hsv_to_rgb(hsv)
    return out


def _get_color_map(pattern: "PatternConfig", h: int, w: int) -> "np.ndarray | None":
    """Return adjusted RGB float32 [H,W,3] image for dot color sampling."""
    if pattern.size_mod_mode != 'image' or not pattern.size_mod_image_id:
        return None
    arr = _size_map_store.get(pattern.size_mod_image_id)
    if arr is None:
        return None
    # arr is now RGB [H,W,3]; apply adjustments
    adjusted = _apply_image_adjustments(arr,
        getattr(pattern, 'size_mod_image_hue', 0.0),
        getattr(pattern, 'size_mod_image_saturation', 1.0),
        getattr(pattern, 'size_mod_image_contrast', 1.0))
    img_scale   = float(pattern.size_mod_image_scale)
    img_rotation = float(getattr(pattern, 'size_mod_image_rotation', 0.0))
    img_x_offset = float(getattr(pattern, 'size_mod_image_x_offset', 0.0))
    img_y_offset = float(getattr(pattern, 'size_mod_image_y_offset', 0.0))

    # Apply rotation — record pre-rotation dims as scale reference
    ref_h, ref_w = adjusted.shape[:2]
    img_work = adjusted
    if img_rotation != 0.0:
        rot_pil = PILImage.fromarray((adjusted * 255).astype(np.uint8), 'RGB')
        rot_pil = rot_pil.rotate(-img_rotation, expand=True, fillcolor=0)
        img_work = np.array(rot_pil).astype(np.float32) / 255.0

    if pattern.size_mod_image_fill:
        src = img_work
        if img_scale > 1.0:
            ch = max(1, int(src.shape[0] / img_scale))
            cw = max(1, int(src.shape[1] / img_scale))
            cy, cx = (src.shape[0] - ch) // 2, (src.shape[1] - cw) // 2
            src = src[cy:cy+ch, cx:cx+cw]
        src_u8 = (src * 255).astype(np.uint8)
        return np.array(PILImage.fromarray(src_u8, 'RGB').resize((w, h), PILImage.BILINEAR)).astype(np.float32) / 255.0
    else:
        rot_h, rot_w = img_work.shape[:2]
        # scale=1 → image fits canvas; scale>1 → zoom in; scale<1 → zoom out (letterboxed)
        fit_base = min(w / max(rot_w, 1), h / max(rot_h, 1))
        disp_w = max(1, int(round(rot_w * fit_base * img_scale)))
        disp_h = max(1, int(round(rot_h * fit_base * img_scale)))
        if disp_w != rot_w or disp_h != rot_h:
            src = np.array(PILImage.fromarray((img_work * 255).astype(np.uint8), 'RGB').resize(
                (disp_w, disp_h), PILImage.BILINEAR)).astype(np.float32) / 255.0
        else:
            src = img_work
        out = np.full((h, w, 3), 0.5, dtype=np.float32)
        x_off = (w - disp_w) // 2 + int(round(img_x_offset * w))
        y_off = (h - disp_h) // 2 + int(round(img_y_offset * h))
        sx0 = max(0, -x_off);  sy0 = max(0, -y_off)
        dx0 = max(0,  x_off);  dy0 = max(0,  y_off)
        cw2 = min(disp_w - sx0, w - dx0); ch2 = min(disp_h - sy0, h - dy0)
        if cw2 > 0 and ch2 > 0:
            out[dy0:dy0+ch2, dx0:dx0+cw2] = src[sy0:sy0+ch2, sx0:sx0+cw2]
        return out


def _get_size_map(pattern: PatternConfig, h: int, w: int) -> "np.ndarray | None":
    """Return a float32 [0,1] map of size h×w for the current size_mod settings."""
    if pattern.size_mod_mode == 'noise':
        return _generate_noise_map(h, w, pattern.size_mod_scale, pattern.size_mod_seed, pattern.size_mod_noise_type)
    if pattern.size_mod_mode == 'image' and pattern.size_mod_image_id:
        rgb_arr = _size_map_store.get(pattern.size_mod_image_id)
        if rgb_arr is not None:
            # Apply contrast only — hue/saturation are colour-only adjustments
            adjusted = _apply_image_adjustments(
                rgb_arr,
                0.0,
                1.0,
                getattr(pattern, 'size_mod_image_contrast', 1.0),
            )
            arr = (0.299 * adjusted[:, :, 0] + 0.587 * adjusted[:, :, 1] + 0.114 * adjusted[:, :, 2]).astype(np.float32)

            # Levels remap: stretch [low, high] → [0, 1]
            lo  = float(getattr(pattern, 'size_mod_image_levels_low',  0.0))
            hi  = float(getattr(pattern, 'size_mod_image_levels_high', 1.0))
            mid = float(getattr(pattern, 'size_mod_image_levels_mid',  0.5))
            if hi > lo:
                arr = np.clip((arr - lo) / (hi - lo), 0.0, 1.0).astype(np.float32)
            # Midtone gamma: mid=0.5 → no change; <0.5 darkens; >0.5 brightens
            if abs(mid - 0.5) > 0.005:
                gamma = float(np.log(0.5) / np.log(np.clip(mid, 1e-6, 1.0 - 1e-6)))
                arr = np.power(np.clip(arr, 1e-6, 1.0), gamma).astype(np.float32)

            img_scale    = float(pattern.size_mod_image_scale)
            img_rotation = float(getattr(pattern, 'size_mod_image_rotation', 0.0))
            img_x_offset = float(getattr(pattern, 'size_mod_image_x_offset', 0.0))
            img_y_offset = float(getattr(pattern, 'size_mod_image_y_offset', 0.0))

            # Apply rotation — record pre-rotation dims as scale reference
            ref_h, ref_w = arr.shape
            arr_work = arr
            if img_rotation != 0.0:
                rot_pil = PILImage.fromarray((arr * 255).astype(np.uint8))
                rot_pil = rot_pil.rotate(-img_rotation, expand=True, fillcolor=0)
                arr_work = np.array(rot_pil).astype(np.float32) / 255.0

            if pattern.size_mod_image_fill:
                # Fill mode: stretch image to canvas, scale applied as zoom
                src = arr_work
                if img_scale > 1.0:
                    ch = max(1, int(src.shape[0] / img_scale))
                    cw = max(1, int(src.shape[1] / img_scale))
                    cy = (src.shape[0] - ch) // 2
                    cx = (src.shape[1] - cw) // 2
                    src = src[cy:cy + ch, cx:cx + cw]
                return np.array(
                    PILImage.fromarray((src * 255).astype(np.uint8)).resize((w, h), PILImage.BILINEAR)
                ).astype(np.float32) / 255.0

            else:
                # Native mode: scale=1 fits image to canvas; scale>1 zooms in; scale<1 zooms out
                rot_h, rot_w = arr_work.shape
                fit_base = min(w / max(rot_w, 1), h / max(rot_h, 1))
                disp_w = max(1, int(round(rot_w * fit_base * img_scale)))
                disp_h = max(1, int(round(rot_h * fit_base * img_scale)))
                if disp_w != rot_w or disp_h != rot_h:
                    src = np.array(
                        PILImage.fromarray((arr_work * 255).astype(np.uint8)).resize((disp_w, disp_h), PILImage.BILINEAR)
                    ).astype(np.float32) / 255.0
                else:
                    src = arr_work

                out = np.ones((h, w), dtype=np.float32)
                x_off = (w - disp_w) // 2 + int(round(img_x_offset * w))
                y_off = (h - disp_h) // 2 + int(round(img_y_offset * h))
                src_x0 = max(0, -x_off);  src_y0 = max(0, -y_off)
                dst_x0 = max(0,  x_off);  dst_y0 = max(0,  y_off)
                copy_w = min(disp_w - src_x0, w - dst_x0)
                copy_h = min(disp_h - src_y0, h - dst_y0)
                if copy_w > 0 and copy_h > 0:
                    out[dst_y0:dst_y0 + copy_h, dst_x0:dst_x0 + copy_w] = \
                        src[src_y0:src_y0 + copy_h, src_x0:src_x0 + copy_w]
                return out
    return None


def pad_mask(
    mask: np.ndarray,
    aspect_ratio: str = "1:1",
    x_offset: float = 0.0,
    y_offset: float = 0.0,
    shape: str = "",
    transform_scale: float = 1.0,
    ref_size: "tuple[int, int] | None" = None,
) -> np.ndarray:
    """
    Scale the shape to fill _FILL of the target canvas (fit-inside),
    then centre it and apply x/y offset (fraction of canvas dimensions).
    transform_scale enlarges/shrinks the shape on canvas without touching the dot grid.
    Positive x_offset → right, positive y_offset → down.
    Shapes with a _SHAPE_SCALE entry are zoomed in (cropped to canvas centre).

    ref_size — (h, w) of the *unrotated* mask.  When provided the scale factor
    is computed from these reference dimensions so the shape always fills the
    same fraction of the canvas regardless of rotation angle (PIL expand=True
    grows the bounding box on rotation, which would otherwise shrink the shape).
    """
    rw, rh = ASPECT_RATIOS.get(aspect_ratio, (1, 1))
    h, w = mask.shape

    # Target canvas at BASE_WIDTH on the long edge
    if rw >= rh:
        canvas_w = BASE_WIDTH
        canvas_h = max(1, int(round(BASE_WIDTH * rh / rw)))
    else:
        canvas_h = BASE_WIDTH
        canvas_w = max(1, int(round(BASE_WIDTH * rw / rh)))

    # Use unrotated dimensions for scale so rotation never changes apparent size
    ref_h, ref_w = ref_size if ref_size else (h, w)

    # Scale shape — apply per-shape multiplier and user transform_scale on top of base fill
    fill = _FILL * _SHAPE_SCALE.get(shape, 1.0) * transform_scale
    scale = min((canvas_w * fill) / max(ref_w, 1),
                (canvas_h * fill) / max(ref_h, 1))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))

    scaled = np.array(
        PILImage.fromarray(mask).resize((new_w, new_h), PILImage.NEAREST)
    )

    # Centre + apply offset (shape may be larger than canvas → centre-crop)
    x_off = (canvas_w - new_w) // 2 + int(round(x_offset * canvas_w))
    y_off = (canvas_h - new_h) // 2 + int(round(y_offset * canvas_h))

    # Source region inside the scaled mask
    src_x = max(0, -x_off)
    src_y = max(0, -y_off)
    dst_x = max(0, x_off)
    dst_y = max(0, y_off)
    copy_w = min(new_w - src_x, canvas_w - dst_x)
    copy_h = min(new_h - src_y, canvas_h - dst_y)

    canvas = np.zeros((canvas_h, canvas_w), dtype=np.uint8)
    if copy_w > 0 and copy_h > 0:
        canvas[dst_y:dst_y + copy_h, dst_x:dst_x + copy_w] = \
            scaled[src_y:src_y + copy_h, src_x:src_x + copy_w]

    return canvas


def _apply_shape_transform(mask: np.ndarray, rotation: float) -> np.ndarray:
    """Apply rotation to the raw shape mask before pad_mask.
    Scale is handled by pad_mask so the dot grid is never affected.
    Rotation follows CSS convention: positive = clockwise.
    PIL.rotate uses counter-clockwise convention, so we negate."""
    if rotation == 0.0:
        return mask
    img = PILImage.fromarray(mask)
    img = img.rotate(-rotation, expand=True, fillcolor=0)
    return np.array(img)


app = FastAPI(title="Geo Dot Asset Tool", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _build_config(pattern: PatternConfig, colors: ColorConfig) -> dict:
    fallback_fill    = colors.colors[0] if colors.colors else "#00A4EF"
    fallback_outline = colors.colors[1] if len(colors.colors) > 1 else "#737373"
    fallback_inner   = colors.colors[2] if len(colors.colors) > 2 else "#FFFFFF"
    return {
        "grid_spacing":    pattern.grid_spacing,
        "grid_spacing_x":  getattr(pattern, 'grid_spacing_x', 0.0),
        "grid_spacing_y":  getattr(pattern, 'grid_spacing_y', 0.0),
        "dot_radius":      pattern.dot_radius,
        "jitter":          pattern.jitter,
        "row_offset_x":    getattr(pattern, 'row_offset_x', 0.0),
        "row_offset_y":    getattr(pattern, 'row_offset_y', 0.0),
        "edge_fade":       pattern.edge_fade,
        "edge_fade_cells": pattern.edge_fade_cells,
        "dot_shape":       pattern.dot_shape,
        "dot_shapes":      pattern.dot_shapes if pattern.dot_shapes else [pattern.dot_shape],
        "element_scales":     pattern.element_scales if pattern.element_scales else {},
        "element_rotations":  pattern.element_rotations if pattern.element_rotations else {},
        "outline_stroke":  pattern.outline_stroke,
        "colors":          colors.colors,
        "ratios":          colors.ratios,
        "fill_colors":     colors.fill_colors if colors.fill_colors else [fallback_fill],
        "dot_dot_colors":  colors.dot_dot_colors if colors.dot_dot_colors else [],
        "outline_color":   colors.outline_color or fallback_outline,
        "outline_colors":  colors.outline_colors if colors.outline_colors else [colors.outline_color or fallback_outline],
        "inner_color":     colors.inner_color or fallback_inner,
        "inner_colors":    colors.inner_colors if colors.inner_colors else [colors.inner_color or fallback_inner],
        "gradient_color_mode":    getattr(colors, 'gradient_color_mode', False),
        "gradient_fill_start":    getattr(colors, 'gradient_fill_start', '#00A4EF'),
        "gradient_fill_end":      getattr(colors, 'gradient_fill_end', '#737373'),
        "gradient_fill_stop0":    getattr(colors, 'gradient_fill_stop0', 0.0),
        "gradient_fill_stop1":    getattr(colors, 'gradient_fill_stop1', 1.0),
        "gradient_outline_start": getattr(colors, 'gradient_outline_start', '#00A4EF'),
        "gradient_outline_end":   getattr(colors, 'gradient_outline_end', '#737373'),
        "gradient_outline_stop0": getattr(colors, 'gradient_outline_stop0', 0.0),
        "gradient_outline_stop1": getattr(colors, 'gradient_outline_stop1', 1.0),
        "gradient_dotdot_start":  getattr(colors, 'gradient_dotdot_start', '#00A4EF'),
        "gradient_dotdot_end":    getattr(colors, 'gradient_dotdot_end', '#737373'),
        "gradient_dotdot_stop0":  getattr(colors, 'gradient_dotdot_stop0', 0.0),
        "gradient_dotdot_stop1":  getattr(colors, 'gradient_dotdot_stop1', 1.0),
        "image_color_mode":       colors.image_color_mode,
        "image_color_hue_offset": colors.image_color_hue_offset,
        "image_color_hue_jitter": colors.image_color_hue_jitter,
        "image_color_tone_jitter": getattr(colors, 'image_color_tone_jitter', 0.0),
        "image_color_colorize":    getattr(colors, 'image_color_colorize', False),
        "image_color_shadow":      getattr(colors, 'image_color_shadow', '#000000'),
        "image_color_highlight":   getattr(colors, 'image_color_highlight', '#ffffff'),
        "size_mod_strength": pattern.size_mod_strength,
        "size_mod_invert":   pattern.size_mod_invert,
    }


def _gen_dots(mask: np.ndarray, config: dict, pattern: PatternConfig, colors: "ColorConfig", seed: int):
    """generate_dots wrapper that injects size map and image color map when active."""
    config = dict(config)
    if pattern.size_mod_mode != 'off':
        h, w = mask.shape
        sm = _get_size_map(pattern, h, w)
        if sm is not None:
            config['size_map'] = sm
    if colors.image_color_mode and pattern.size_mod_image_id:
        h, w = mask.shape
        cm = _get_color_map(pattern, h, w)
        if cm is not None:
            config['color_map'] = cm
    return generate_dots(mask, config, seed=seed)


def _gen_dots_for_shape(
    shape_mask: np.ndarray,
    config: dict,
    pattern: "PatternConfig",
    colors: "ColorConfig",
    seed: int,
) -> list:
    """Generate dots on the full canvas then clip to shape_mask and apply edge fade.

    Dots are always computed on the complete canvas grid so the RNG sequence —
    and therefore every dot's color, shape, and jitter — is independent of the
    shape boundary.  Only the visible set changes when the shape is scaled or
    rotated.
    """
    h, w = shape_mask.shape
    full_mask = np.full((h, w), 255, dtype=np.uint8)
    cfg = dict(config)
    cfg["edge_fade"] = False          # handled below after clipping
    all_dots = _gen_dots(full_mask, cfg, pattern, colors, seed)

    result = [
        d for d in all_dots
        if shape_mask[min(int(d.y * h), h - 1), min(int(d.x * w), w - 1)] > 0
    ]

    if pattern.edge_fade:
        from scipy.ndimage import distance_transform_edt
        dist_map = distance_transform_edt(shape_mask > 0).astype(np.float32)
        px_spacing = pattern.grid_spacing * w / 1000.0
        fade_px = pattern.edge_fade_cells * px_spacing
        faded = []
        for d in result:
            dy = min(int(d.y * h), h - 1)
            dx = min(int(d.x * w), w - 1)
            dist = float(dist_map[dy, dx])
            if dist < fade_px:
                new_r = d.radius * (dist / fade_px)
                if new_r * w >= 0.15:
                    faded.append(DotCls(
                        x=d.x, y=d.y, radius=new_r,
                        color=d.color, shape=d.shape,
                        outline_color=d.outline_color,
                        inner_color=d.inner_color,
                        stroke_width=d.stroke_width,
                        rotation=d.rotation,
                    ))
            else:
                faded.append(d)
        result = faded

    return result


def _resolve_mask(shape: str, parts: list[str] | None = None, invert: bool = False) -> np.ndarray:
    if parts:
        mask = parts_to_mask(parts, BASE_WIDTH)
        if mask is None:
            raise HTTPException(404, f"Could not resolve parts: {parts}")
        return mask

    if shape.startswith("upload_"):
        mask = get_mask(shape, invert=invert)
        if mask is None:
            raise HTTPException(404, f"Uploaded mask '{shape}' not found. Re-upload the image.")
        return mask

    mask = shape_to_mask(shape, BASE_WIDTH)
    if mask is None:
        raise HTTPException(404, f"Shape '{shape}' not recognised.")
    return mask


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #

@app.get("/api/shapes")
def list_shapes():
    return get_shapes_catalog()


@app.get("/api/geojson")
def world_geojson():
    """Simplified world country polygons for the frontend map picker."""
    return Response(content=get_world_geojson(), media_type="application/json")


@app.get("/api/schemes")
def list_schemes():
    return [
        SchemeInfo(
            id=k,
            name=v["name"],
            colors=v["colors"],
            ratios=v["ratios"],
            background=v.get("background"),
        )
        for k, v in SCHEMES.items()
    ]


@app.post("/api/outline")
def outline(req: PreviewRequest):
    """Render the shape as a flat silhouette — no dot pattern.
    For uploaded images, returns the original grayscale instead of a binary silhouette.
    """
    # Uploaded images: apply the same transform pipeline as built-in shapes
    # so that rotation/scale/offset are reflected in the returned image.
    if req.shape.startswith("upload_"):
        gray = get_grayscale(req.shape)
        if gray is None:
            raise HTTPException(404, f"Uploaded mask '{req.shape}' not found. Re-upload the image.")

        ref_size = gray.shape  # (h, w) before rotation — used as stable scale reference

        # Apply rotation (same convention as _apply_shape_transform: positive = clockwise)
        if req.pattern.transform_rotation != 0.0:
            img_pil = PILImage.fromarray(gray)
            img_pil = img_pil.rotate(-req.pattern.transform_rotation, expand=True, fillcolor=0)
            gray_rot = np.array(img_pil)
        else:
            gray_rot = gray

        # Determine canvas dimensions from pattern aspect ratio (same as pad_mask)
        rw_ar, rh_ar = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (16, 9))
        if rw_ar >= rh_ar:
            canvas_w = req.preview_width
            canvas_h = max(1, int(round(req.preview_width * rh_ar / rw_ar)))
        else:
            canvas_h = req.preview_width
            canvas_w = max(1, int(round(req.preview_width * rw_ar / rh_ar)))

        # Scale to fill _FILL of canvas, using unrotated ref_size (same as pad_mask)
        ref_h, ref_w = ref_size
        h_rot, w_rot = gray_rot.shape
        fill = _FILL * req.pattern.transform_scale
        scale_f = min((canvas_w * fill) / max(ref_w, 1), (canvas_h * fill) / max(ref_h, 1))
        new_w = max(1, int(round(w_rot * scale_f)))
        new_h = max(1, int(round(h_rot * scale_f)))

        scaled = np.array(PILImage.fromarray(gray_rot).resize((new_w, new_h), PILImage.BILINEAR))

        # Centre on canvas then apply x/y offset (same logic as pad_mask)
        x_off = (canvas_w - new_w) // 2 + int(round(req.pattern.x_offset * canvas_w))
        y_off = (canvas_h - new_h) // 2 + int(round(req.pattern.y_offset * canvas_h))

        src_x = max(0, -x_off);  src_y = max(0, -y_off)
        dst_x = max(0, x_off);   dst_y = max(0, y_off)
        copy_w = min(new_w - src_x, canvas_w - dst_x)
        copy_h = min(new_h - src_y, canvas_h - dst_y)

        canvas_g = np.zeros((canvas_h, canvas_w), dtype=np.uint8)
        if copy_w > 0 and copy_h > 0:
            canvas_g[dst_y:dst_y + copy_h, dst_x:dst_x + copy_w] = \
                scaled[src_y:src_y + copy_h, src_x:src_x + copy_w]

        # Apply invert for display: flip luminance so the shape reads correctly
        if getattr(req.pattern, 'mask_invert', False):
            canvas_g = 255 - canvas_g

        arr = np.stack([canvas_g, canvas_g, canvas_g, np.full_like(canvas_g, 255)], axis=-1)
        img = PILImage.fromarray(arr.astype(np.uint8), mode="RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        return {"image": f"data:image/png;base64,{b64}", "width": canvas_w, "height": canvas_h}

    _raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False))
    _ref_size = _raw.shape
    _raw = _apply_shape_transform(_raw, req.pattern.transform_rotation)
    mask = pad_mask(_raw, req.pattern.aspect_ratio,
                    req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                    transform_scale=req.pattern.transform_scale, ref_size=_ref_size)

    h_orig, w_orig = mask.shape
    aspect = h_orig / max(w_orig, 1)
    pw = req.preview_width
    ph = max(1, int(pw * aspect))

    from scipy.ndimage import binary_erosion
    SS = 4
    hi_w, hi_h = pw * SS, ph * SS
    binary_hi = np.array(
        PILImage.fromarray(mask).resize((hi_w, hi_h), PILImage.NEAREST)
    ) > 128

    thickness_hi = max(1, hi_w // 3200)
    eroded_hi = binary_erosion(binary_hi, iterations=thickness_hi)
    outline_hi = binary_hi & ~eroded_hi

    # Transparent background: silhouette only, no background fill
    arr_hi = np.zeros((hi_h, hi_w, 4), dtype=np.uint8)
    arr_hi[binary_hi] = (7, 25, 55, 255)

    # Downsample with LANCZOS for smooth anti-aliased edges
    img = PILImage.fromarray(arr_hi, mode="RGBA").resize((pw, ph), PILImage.LANCZOS)
    arr_out = np.array(img)

    # Paint dots at output resolution
    dot_spacing = 4
    dot_radius  = 0.012
    eroded_out = np.array(
        PILImage.fromarray(eroded_hi.astype(np.uint8) * 255).resize((pw, ph), PILImage.NEAREST)
    ) > 128
    y_out = np.arange(ph, dtype=np.float32).reshape(-1, 1)
    x_out = np.arange(pw, dtype=np.float32).reshape(1, -1)
    nearest_y = np.round(y_out / dot_spacing) * dot_spacing
    nearest_x = np.round(x_out / dot_spacing) * dot_spacing
    dist_out = np.sqrt((y_out - nearest_y) ** 2 + (x_out - nearest_x) ** 2)
    dot_pixels = (dist_out <= dot_radius) & eroded_out
    # arr_out[dot_pixels] = (35, 120, 175, 255)  # DISABLED — uncomment to restore grid dots

    img = PILImage.fromarray(arr_out, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()

    return {"image": f"data:image/png;base64,{b64}", "width": pw, "height": ph}


@app.post("/api/shape-stroke")
def shape_stroke(req: PreviewRequest):
    """Return a transparent PNG containing only the light-blue border stroke of the shape."""
    from scipy.ndimage import binary_erosion, binary_dilation

    _raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False))
    _ref_size = _raw.shape
    _raw = _apply_shape_transform(_raw, req.pattern.transform_rotation)
    mask = pad_mask(_raw, req.pattern.aspect_ratio,
                    req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                    transform_scale=req.pattern.transform_scale, ref_size=_ref_size)

    h_orig, w_orig = mask.shape
    aspect = h_orig / max(w_orig, 1)
    pw = req.preview_width
    ph = max(1, int(pw * aspect))

    SS = 16
    hi_w, hi_h = pw * SS, ph * SS
    binary_hi = np.array(
        PILImage.fromarray(mask).resize((hi_w, hi_h), PILImage.NEAREST)
    ) > 128

    stroke_px = max(1, round(req.stroke_width * SS / 2))
    dilated = binary_dilation(binary_hi, iterations=stroke_px)
    eroded  = binary_erosion(binary_hi,  iterations=stroke_px)
    stroke  = dilated & ~eroded

    arr = np.zeros((hi_h, hi_w, 4), dtype=np.uint8)
    arr[stroke] = (89, 206, 250, 255)   # #59CEFA light blue

    img = PILImage.fromarray(arr, mode="RGBA").resize((pw, ph), PILImage.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/png;base64,{b64}", "width": pw, "height": ph}


@app.post("/api/preview")
def preview(req: PreviewRequest):
    if req.fill_canvas:
        raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False)) if req.shape else None
        shape_sized = None
        if raw is not None:
            _ref_size = raw.shape
            raw = _apply_shape_transform(raw, req.pattern.transform_rotation)
            shape_sized = pad_mask(raw, req.pattern.aspect_ratio,
                                   req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                                   transform_scale=req.pattern.transform_scale, ref_size=_ref_size)
            h, w = shape_sized.shape
        else:
            rw, rh = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (1, 1))
            if rw >= rh:
                w = BASE_WIDTH
                h = max(1, int(round(BASE_WIDTH * rh / rw)))
            else:
                h = BASE_WIDTH
                w = max(1, int(round(BASE_WIDTH * rw / rh)))
        mask = np.full((h, w), 255, dtype=np.uint8)
        config = _build_config(req.pattern, req.colors)
        dots = _gen_dots(mask, config, req.pattern, req.colors, req.pattern.seed)
    else:
        # Normal and clip-to-shape modes both use full-canvas dot generation so the
        # RNG sequence — and every dot's color/shape/jitter — is independent of the
        # shape boundary and transform_scale.
        shape_sized = None
        _raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False))
        _ref_size = _raw.shape
        _raw = _apply_shape_transform(_raw, req.pattern.transform_rotation)
        mask = pad_mask(_raw, req.pattern.aspect_ratio,
                        req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                        transform_scale=req.pattern.transform_scale, ref_size=_ref_size)
        config = _build_config(req.pattern, req.colors)
        dots = _gen_dots_for_shape(mask, config, req.pattern, req.colors, req.pattern.seed)

    h_orig, w_orig = mask.shape
    aspect = h_orig / max(w_orig, 1)
    pw = req.preview_width
    ph = max(1, int(pw * aspect))

    bg_grad = {'start': req.colors.background_gradient.start, 'end': req.colors.background_gradient.end, 'direction': req.colors.background_gradient.direction} if req.colors.background_gradient else None
    png_bytes = render_png(dots, pw, ph, req.colors.background, req.pattern.dot_shape, supersample=3, background_gradient=bg_grad)

    # Composite shape silhouette over fill-canvas dots at 75% opacity
    if req.fill_canvas and req.show_shape_overlay and shape_sized is not None:
        dot_img = PILImage.open(io.BytesIO(png_bytes)).convert("RGBA")
        resized = np.array(
            PILImage.fromarray(shape_sized).resize((pw, ph), PILImage.BILINEAR)
        )
        inside = resized > 128
        overlay = np.zeros((ph, pw, 4), dtype=np.uint8)
        overlay[inside] = (0, 0, 0, int(255 * 0.75))
        composite = PILImage.alpha_composite(dot_img, PILImage.fromarray(overlay, mode="RGBA"))
        buf = io.BytesIO()
        composite.save(buf, format="PNG")
        png_bytes = buf.getvalue()

    b64 = base64.b64encode(png_bytes).decode()

    return {
        "image":     f"data:image/png;base64,{b64}",
        "width":     pw,
        "height":    ph,
        "dot_count": len(dots),
    }


@app.post("/api/dots")
def dots(req: PreviewRequest):
    """Return dot instances as JSON instead of a rendered PNG."""
    if req.fill_canvas:
        raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False)) if req.shape else None
        if raw is not None:
            _ref_size = raw.shape
            raw = _apply_shape_transform(raw, req.pattern.transform_rotation)
            shape_sized = pad_mask(raw, req.pattern.aspect_ratio,
                                   req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                                   transform_scale=req.pattern.transform_scale, ref_size=_ref_size)
            h, w = shape_sized.shape
        else:
            rw, rh = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (1, 1))
            if rw >= rh:
                w = BASE_WIDTH
                h = max(1, int(round(BASE_WIDTH * rh / rw)))
            else:
                h = BASE_WIDTH
                w = max(1, int(round(BASE_WIDTH * rw / rh)))
        mask = np.full((h, w), 255, dtype=np.uint8)
        config = _build_config(req.pattern, req.colors)
        dots_list = _gen_dots(mask, config, req.pattern, req.colors, req.pattern.seed)
    else:
        _raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False))
        _ref_size = _raw.shape
        _raw = _apply_shape_transform(_raw, req.pattern.transform_rotation)
        mask = pad_mask(_raw, req.pattern.aspect_ratio,
                        req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                        transform_scale=req.pattern.transform_scale, ref_size=_ref_size)
        config = _build_config(req.pattern, req.colors)
        dots_list = _gen_dots_for_shape(mask, config, req.pattern, req.colors, req.pattern.seed)

    h_orig, w_orig = mask.shape
    return {
        "dots": [
            {
                "x": d.x,
                "y": d.y,
                "radius": d.radius,
                "color": d.color,
                "shape": d.shape,
                "outline_color": d.outline_color,
                "inner_color": d.inner_color,
                "stroke_width": d.stroke_width,
                "rotation": d.rotation,
            }
            for d in dots_list
        ],
        "width": w_orig,
        "height": h_orig,
        "dot_count": len(dots_list),
    }


@app.post("/api/export")
def export(req: ExportRequest):
    if req.fill_canvas:
        rw, rh = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (1, 1))
        if rw >= rh:
            w = BASE_WIDTH
            h = max(1, int(round(BASE_WIDTH * rh / rw)))
        else:
            h = BASE_WIDTH
            w = max(1, int(round(BASE_WIDTH * rw / rh)))
        mask = np.full((h, w), 255, dtype=np.uint8)
        config = _build_config(req.pattern, req.colors)
        dots = _gen_dots(mask, config, req.pattern, req.colors, req.pattern.seed)
    else:
        _raw = _resolve_mask(req.shape, req.parts or None, invert=getattr(req.pattern, 'mask_invert', False))
        _ref_size = _raw.shape
        _raw = _apply_shape_transform(_raw, req.pattern.transform_rotation)
        mask = pad_mask(_raw, req.pattern.aspect_ratio,
                        req.pattern.x_offset, req.pattern.y_offset, shape=req.shape,
                        transform_scale=req.pattern.transform_scale, ref_size=_ref_size)
        config = _build_config(req.pattern, req.colors)
        dots = _gen_dots_for_shape(mask, config, req.pattern, req.colors, req.pattern.seed)

    export_bg_grad = {'start': req.colors.background_gradient.start, 'end': req.colors.background_gradient.end, 'direction': req.colors.background_gradient.direction} if req.colors.background_gradient else None
    zip_bytes = generate_export_zip(
        dots=dots,
        shape_name=req.shape,
        resolutions=req.resolutions,
        formats=req.formats,
        background=req.colors.background,
        dot_shape=req.pattern.dot_shape,
        aspect_ratio=req.pattern.aspect_ratio,
        background_gradient=export_bg_grad,
    )

    suffix = "pattern" if req.fill_canvas else "shape"
    filename = f"{req.shape}_{suffix}_dot_assets.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/upload-mask")
async def upload_mask(
    file: UploadFile = File(...),
):
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only PNG, JPG, or WebP images are accepted.")

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 20 MB limit.")

    mask_id, w, h = process_uploaded_mask(data, file.filename or "upload")

    return {"mask_id": mask_id, "width": w, "height": h, "name": file.filename}


@app.post("/api/upload-size-map")
async def upload_size_map(file: UploadFile = File(...)):
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only PNG, JPG, or WebP images are accepted.")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 20 MB limit.")
    img = PILImage.open(io.BytesIO(data)).convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0  # RGB float32 [H, W, 3]
    size_map_id = f"sizemap_{uuid.uuid4().hex[:8]}"
    _size_map_store[size_map_id] = arr
    return {"size_map_id": size_map_id}


@app.post("/api/image-preview")
def image_preview_endpoint(req: PreviewRequest):
    """Return the adjusted color image as a PNG for canvas overlay preview.

    The color map is computed at the same canvas resolution the dot engine uses
    (BASE_WIDTH, aspect_ratio) so that native-mode pixel mapping matches exactly.
    The result is then downscaled to preview_width for the response.
    """
    # Match the canvas dimensions used by pad_mask / _gen_dots
    rw_ar, rh_ar = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (16, 9))
    if rw_ar >= rh_ar:
        canvas_w = BASE_WIDTH
        canvas_h = max(1, int(round(BASE_WIDTH * rh_ar / rw_ar)))
    else:
        canvas_h = BASE_WIDTH
        canvas_w = max(1, int(round(BASE_WIDTH * rw_ar / rh_ar)))

    cm = _get_color_map(req.pattern, canvas_h, canvas_w)
    if cm is None:
        raise HTTPException(400, "No image uploaded or size_mod_mode is not 'image'")

    # Downscale to preview dimensions, preserving the same fractional coverage
    pw = min(req.preview_width, 1920)
    ph = max(1, int(round(pw * canvas_h / canvas_w)))
    img_u8 = (np.clip(cm, 0.0, 1.0) * 255).astype(np.uint8)
    img = PILImage.fromarray(img_u8, mode='RGB').resize((pw, ph), PILImage.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/png;base64,{b64}"}


@app.post("/api/preview-size-map")
async def preview_size_map_endpoint(req: PreviewRequest):
    """Return a grayscale PNG of the active size modulation map."""
    rw_ar, rh_ar = ASPECT_RATIOS.get(req.pattern.aspect_ratio, (16, 9))
    if rw_ar >= rh_ar:
        canvas_w = BASE_WIDTH
        canvas_h = max(1, int(round(BASE_WIDTH * rh_ar / rw_ar)))
    else:
        canvas_h = BASE_WIDTH
        canvas_w = max(1, int(round(BASE_WIDTH * rw_ar / rh_ar)))
    pw = min(req.preview_width, 1920)
    ph = max(1, int(round(pw * canvas_h / canvas_w)))
    sm = _get_size_map(req.pattern, canvas_h, canvas_w)
    if sm is None:
        raise HTTPException(400, "No active size map (mode is off or image not uploaded)")
    gray = (sm * 255).astype(np.uint8)
    img = PILImage.fromarray(gray, mode='L').resize((pw, ph), PILImage.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/png;base64,{b64}"}


# --------------------------------------------------------------------------- #
# Serve React build in production                                              #
# --------------------------------------------------------------------------- #

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=not FRONTEND_DIST.exists(),
    )
