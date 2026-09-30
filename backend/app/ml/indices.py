"""Spectral indices — all computed from REAL band data.

Only the indices appropriate for the available bands are used. We never
compute e.g. NDVI from an RGB image pretending it has a NIR band.

References
----------
- NDWI  (McFeeters 1996): (G - NIR) / (G + NIR)
- MNDWI (Xu 2006):        (G - SWIR) / (G + SWIR)
- NDVI  (Rouse 1974):     (NIR - R) / (NIR + R)
- VARI  (Gitelson 2002):  (G - R) / (G + R - B)   [visible-band vegetation]
- ExG   (Woebbecke 1995): 2G - R - B              [visible-band vegetation]
- GRWI  (green-red water index): (G - R) / (G + R) [visible-band water]
- NDBI  (Zha 2003):       (SWIR - NIR) / (SWIR + NIR)
- WI2015 (Fisher, Flood & Danaher 2016):
        1.7204 + 171G + 3R - 70N - 45S1 - 71S2  (multispectral)
"""

from __future__ import annotations

import numpy as np

_EPS = 1e-8


def _safe_div(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(np.abs(den) > _EPS, num / np.where(np.abs(den) > _EPS, den, 1.0), 0.0)
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)


def normalized_diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return _safe_div(a - b, a + b)


def ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Normalized Difference Water Index (McFeeters 1996)."""
    return normalized_diff(green, nir)


def mndwi(green: np.ndarray, swir: np.ndarray) -> np.ndarray:
    """Modified NDWI (Xu 2006), better for built-up contamination."""
    return normalized_diff(green, swir)


def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Normalized Difference Vegetation Index."""
    return normalized_diff(nir, red)


def vari(red: np.ndarray, green: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Visible Atmospherically Resistant Index (RGB-only vegetation proxy)."""
    return _safe_div(green - red, green + red - blue)


def exg(red: np.ndarray, green: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Excess Green (RGB-only vegetation proxy)."""
    return 2.0 * green - red - blue


def grwi(green: np.ndarray, red: np.ndarray) -> np.ndarray:
    """Green-Red Water Index (visible-band water proxy)."""
    return normalized_diff(green, red)


def ndbi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Normalized Difference Built-up Index (Zha 2003)."""
    return normalized_diff(swir, nir)


def wi2015(
    green: np.ndarray,
    red: np.ndarray,
    nir: np.ndarray,
    swir1: np.ndarray,
    swir2: np.ndarray,
) -> np.ndarray:
    """Water Index 2015 (Fisher et al. 2016) — needs G, R, NIR, SWIR1, SWIR2."""
    return 1.7204 + 171.0 * green + 3.0 * red - 70.0 * nir - 45.0 * swir1 - 71.0 * swir2


def brightness(red: np.ndarray, green: np.ndarray, blue: np.ndarray) -> np.ndarray:
    return (0.299 * red + 0.587 * green + 0.114 * blue)