"""Vegetation analysis.

- NIR band present  -> NDVI (Rouse et al. 1974)
- RGB only          -> VARI (Gitelson et al. 2002) + ExG, with explicit
                       limitations (visible-band proxies, no NIR)
"""

from __future__ import annotations

from app.ml import indices
from app.ml.base import clean_mask, mask_from_threshold, otsu_threshold


def detect_vegetation(bands) -> dict:
    limitations: list[str] = []

    if bands.nir is not None:
        index = indices.ndvi(bands.nir, bands.red)
        method = "ndvi"
        fallback = 0.2
        limitations.append("NDVI computed from real NIR + red bands.")
    else:
        index = indices.vari(bands.red, bands.green, bands.blue)
        method = "vari"
        fallback = 0.0
        limitations.append(
            "No NIR band available — used VARI (visible-band vegetation proxy), "
            "which is less reliable than NDVI."
        )

    threshold = otsu_threshold(index)
    if threshold is None:
        threshold = fallback
        limitations.append(
            f"Index distribution was not bimodal; applied documented threshold {threshold:g}."
        )

    mask = mask_from_threshold(index, float(threshold))
    mask = clean_mask(mask)

    veg_values = index[mask > 0]
    stats = {
        "coverage_percent": round(float((mask > 0).mean()) * 100.0, 3),
        "index_mean_in_mask": round(float(veg_values.mean()), 4) if veg_values.size else None,
        "index_min_in_mask": round(float(veg_values.min()), 4) if veg_values.size else None,
        "index_max_in_mask": round(float(veg_values.max()), 4) if veg_values.size else None,
        "threshold": round(float(threshold), 4),
    }

    return {
        "method": method,
        "threshold": float(threshold),
        "mask": mask,
        "index": index,
        "statistics": stats,
        "limitations": limitations,
        "note": f"{method.upper()} vegetation index, threshold {threshold:g}",
    }