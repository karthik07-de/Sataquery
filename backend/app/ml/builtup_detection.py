"""Built-up / impervious surface detection.

- SWIR + NIR present  -> NDBI (Zha et al. 2003)
- NIR only            -> low NDVI + high brightness heuristic
- RGB only            -> texture (local std) + low VARI + colour heuristic,
                         with explicit limitations (bare soil/rock confusion)
"""

from __future__ import annotations

import numpy as np
import cv2

from app.ml import indices
from app.ml.base import clean_mask, mask_from_threshold, otsu_threshold


def detect_builtup(bands) -> dict:
    limitations: list[str] = []

    if bands.swir1 is not None and bands.nir is not None:
        index = indices.ndbi(bands.swir1, bands.nir)
        method = "ndbi"
        fallback = 0.0
        limitations.append("NDBI computed from SWIR + NIR bands (Zha et al. 2003).")
        threshold = otsu_threshold(index)
        if threshold is None:
            threshold = fallback
            limitations.append("Index distribution was not bimodal; applied documented threshold 0.")
        mask = mask_from_threshold(index, float(threshold))
        mask = clean_mask(mask)
        return {
            "method": method,
            "threshold": float(threshold),
            "mask": mask,
            "index": index,
            "limitations": limitations,
            "note": f"NDBI built-up index, threshold {threshold:g}",
        }

    if bands.nir is not None:
        ndvi_ = indices.ndvi(bands.nir, bands.red)
        bri = indices.brightness(bands.red, bands.green, bands.blue)
        bri_thr = otsu_threshold(bri)
        if bri_thr is None:
            bri_thr = 0.5
        mask = (ndvi_ < 0.1) & (bri > float(bri_thr))
        mask = clean_mask(mask.astype(np.uint8) * 255)
        limitations.append(
            "No SWIR band — used low-NDVI + high-brightness heuristic; bare soil may be misclassified."
        )
        return {
            "method": "ndvi_brightness",
            "threshold": float(bri_thr),
            "mask": mask,
            "index": bri,
            "limitations": limitations,
            "note": "Low NDVI + brightness built-up heuristic",
        }

    # ── RGB-only path ──────────────────────────────────────────────
    limitations.append(
        "No NIR/SWIR bands — used texture + colour heuristic (local variance, "
        "low VARI, red dominance). Bare soil and rocky terrain can be misclassified."
    )
    gray = cv2.cvtColor(bands.rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    mean = cv2.boxFilter(gray, -1, (9, 9))
    sq = cv2.boxFilter(gray**2, -1, (9, 9))
    std = np.sqrt(np.maximum(sq - mean**2, 0.0))

    std_thr = otsu_threshold(std)
    if std_thr is None:
        std_thr = 25.0
    vari_ = indices.vari(bands.red, bands.green, bands.blue)
    red_dom = bands.red > bands.green + 0.02
    v = cv2.cvtColor(bands.rgb, cv2.COLOR_RGB2HSV)[..., 2] / 255.0

    mask = (std > float(std_thr)) & (vari_ < 0.05) & (v > 0.15) & (red_dom | (std > float(std_thr) * 1.5))
    mask = clean_mask(mask.astype(np.uint8) * 255)

    return {
        "method": "rgb_texture_color",
        "threshold": float(std_thr),
        "mask": mask,
        "index": std,
        "limitations": limitations,
        "note": "RGB texture+colour built-up heuristic",
    }