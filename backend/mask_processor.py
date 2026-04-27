"""
Raster mask processor for user-uploaded images.

Convention: dark pixels (luminance < 128) = inside the shape.
Pass invert=True for white-shape-on-dark-background images.
"""

import io
import uuid
from typing import Optional, Tuple

import numpy as np
from PIL import Image

# In-process cache keyed by mask_id
_store: dict[str, np.ndarray] = {}       # binary masks
_gray_store: dict[str, np.ndarray] = {}  # original grayscale arrays


def process_uploaded_mask(
    file_bytes: bytes,
    filename: str = "upload",
) -> Tuple[str, int, int]:
    """
    Store the uploaded image as original grayscale.
    Inversion is applied at retrieval time so it can be toggled without re-uploading.

    Returns
    -------
    (mask_id, width, height)
    """
    img = Image.open(io.BytesIO(file_bytes)).convert("L")
    arr = np.array(img, dtype=np.uint8)

    mask_id = f"upload_{uuid.uuid4().hex[:10]}"
    _store[mask_id] = arr          # original grayscale — no binarization yet
    _gray_store[mask_id] = arr     # also kept for outline display

    h, w = arr.shape
    return mask_id, w, h


def get_mask(mask_id: str, invert: bool = False) -> Optional[np.ndarray]:
    """Return a binary mask (255 = inside shape, 0 = outside).
    invert=True treats bright pixels as inside (white-shape-on-dark-bg convention).
    """
    arr = _store.get(mask_id)
    if arr is None:
        return None
    if invert:
        return np.where(arr > 128, 255, 0).astype(np.uint8)
    else:
        return np.where(arr < 128, 255, 0).astype(np.uint8)


def get_grayscale(mask_id: str) -> Optional[np.ndarray]:
    return _gray_store.get(mask_id)
