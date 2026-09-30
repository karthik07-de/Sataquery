"""Water detection — real spectral-index / color analysis, no fabricated output.

Method selection is based on the bands actually present in the image:
- NIR + SWIR1 + SWIR2 present  -> WI2015 (Fisher et al. 2016)
- SWIR present                 -> MNDWI (Xu 2006)
- NIR present                  -> NDWI  (McFeeters 1996)
- RGB only                     -> GRWI + HSV colour rules (documented proxy,
                                 with explicit limitations — no NIR available)
"""

from __future__ import annotations

import numpy as np
import cv2

from app.ml import indices
from app.ml.base import clean_mask, mask_from_threshold, otsu_threshold

# OpenCV HSV: H in 0-180, S/V in 0-255. Blue/cyan water hue range.
_BLUE_HUE_LO, _BLUE_HUE_HI = 85, 145


def detect_water(bands) -> dict:
    """Return {'method', 'threshold', 'mask' (uint8 0/255), 'limitations', 'index'}."""
    limitations: list[str] = []

    if bands.nir is not None and bands.swir1 is not None and bands.swir2 is not None:
        index = indices.wi2015(bands.green, bands.red, bands.nir, bands.swir1, bands.swir2)
        method = "wi2015"
        fallback = 0.0
        limitations.append("WI2015 used (requires G, R, NIR, SWIR1, SWIR2).")
    elif bands.swir1 is not None:
        index = indices.mndwi(bands.green, bands.swir1)
        method = "mndwi"
        fallback = 0.0
        limitations.append("MNDWI used (green + SWIR1 bands).")
    elif bands.nir is not None:
        index = indices.ndwi(bands.green, bands.nir)
        method = "ndwi"
        fallback = 0.0
        limitations.append("NDWI used (green + NIR bands).")
    else:
        return _rgb_water(bands)

    threshold = otsu_threshold(index)
    if threshold is None:
        threshold = fallback
        limitations.append(
            f"Index distribution was not bimodal; applied documented threshold {threshold:g}."
        )
    mask = mask_from_threshold(index, float(threshold))
    mask = clean_mask(mask)
    return {
        "method": method,
        "threshold": float(threshold),
        "mask": mask,
        "index": index,
        "limitations": limitations,
        "note": f"{method.upper()} index, threshold {threshold:g}",
    }


def _rgb_water(bands) -> dict:
    """RGB-only water detection: HSV blue-hue rule + Green-Red Water Index.

    This is a documented proxy for visible-band water mapping; it cannot
    match the reliability of NIR-based indices and this is stated honestly.
    """
    limitations = [
        "No NIR/SWIR bands available — used RGB colour rules (GRWI + HSV hue).",
        "Dark shadows, wet soil and dark roofs can produce false positives.",
        "Turbid/brown water may be missed because it lacks a blue-dominant hue.",
    ]
    rgb = bands.rgb
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    blue_hue = (h >= _BLUE_HUE_LO) & (h <= _BLUE_HUE_HI) & (s > 50) & (v > 30) & (v < 245)

    gr = indices.grwi(bands.green, bands.red)
    gr_thr = otsu_threshold(gr)
    gr_thr = gr_thr if gr_thr is not None else 0.0
    gr_water = gr > max(float(gr_thr), 0.0)

    mask = (blue_hue | gr_water) & (v > 25)
    mask = clean_mask(mask.astype(np.uint8) * 255)

    return {
        "method": "rgb_grwi_hsv",
        "threshold": float(gr_thr),
        "mask": mask,
        "index": gr,
        "limitations": limitations,
        "note": "RGB colour-rule water detection (GRWI + HSV), no NIR available",
    }