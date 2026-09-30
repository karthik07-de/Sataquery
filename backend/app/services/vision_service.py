"""Vision service — loads imagery into usable band arrays.

Handles plain RGB images (JPEG/PNG) and multispectral rasters (GeoTIFF).
Band identification uses rasterio band descriptions (Sentinel-2 / Landsat
conventions) and falls back to documented order assumptions with an explicit
limitation note. Reflectance scaling for WI2015 is applied where possible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from app.core.logging_config import get_logger
from app.services.geospatial_service import extract_metadata

logger = get_logger(__name__)

# description -> role mapping (case-insensitive substring match)
_BAND_ALIASES = {
    "blue": "blue",
    "b2": "blue",
    "green": "green",
    "b3": "green",
    "red": "red",
    "b4": "red",
    "nir": "nir",
    "b8": "nir",
    "b8a": "nir",
    "b5": "nir",  # Landsat 8 band 5 = NIR
    "swir1": "swir1",
    "swir2": "swir2",
    "b11": "swir1",
    "b12": "swir2",
    "b6": "swir1",  # Landsat 8 band 6 = SWIR1
    "b7": "swir2",  # Landsat 8 band 7 = SWIR2
}


@dataclass
class BandData:
    """Bands extracted from an image, normalized to 0-1 float where relevant."""

    rgb: np.ndarray            # uint8 HxWx3 (display / model input)
    red: np.ndarray            # float32 0-1
    green: np.ndarray          # float32 0-1
    blue: np.ndarray           # float32 0-1
    nir: np.ndarray | None = None
    swir1: np.ndarray | None = None
    swir2: np.ndarray | None = None
    meta: dict = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)


def load_bands(path: str | Path) -> BandData:
    """Load an image/GeoTIFF into BandData with identified spectral bands."""
    path = Path(path)
    ext = path.suffix.lower()
    meta = extract_metadata(path)

    if ext in (".tif", ".tiff"):
        return _load_raster(path, meta)
    return _load_plain(path, meta)


def _load_plain(path: Path, meta: dict) -> BandData:
    import cv2

    img = cv2.imread(str(path), cv2.IMREAD_COLOR)  # BGR
    if img is None:
        # Fall back to Pillow (handles some PNG variants)
        from PIL import Image

        with Image.open(path) as im:
            img = np.array(im.convert("RGB"))[:, :, ::-1]  # RGB->BGR
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.uint8)
    f = rgb.astype(np.float32) / 255.0
    return BandData(
        rgb=rgb,
        red=f[..., 0],
        green=f[..., 1],
        blue=f[..., 2],
        meta=meta,
        limitations=["Single-date RGB imagery (no NIR/SWIR bands)."],
    )


def _load_raster(path: Path, meta: dict) -> BandData:
    import rasterio
    from rasterio.transform import Affine

    limitations: list[str] = []
    with rasterio.open(path) as ds:
        count = ds.count
        descriptions = [ (ds.descriptions[i] or "") for i in range(count) ]
        roles: list[str] = []

        # 1. Identify bands from descriptions when available
        for desc in descriptions:
            d = (desc or "").lower().strip()
            role = next((v for k, v in _BAND_ALIASES.items() if k in d), "")
            roles.append(role)

        # 2. Fallback ordering when descriptions are absent/unhelpful
        if not any(roles):
            if count >= 3:
                roles = ["red", "green", "blue"] + (["nir"] if count >= 4 else []) + [""] * (count - 4)
                if count >= 4:
                    limitations.append(
                        "No band descriptions found; assumed band order R,G,B,NIR for bands 1-4."
                    )
            else:
                limitations.append(f"Raster has {count} band(s); treating them as grayscale/RGB.")

        arrays: dict[str, np.ndarray | None] = {"red": None, "green": None, "blue": None,
                                                "nir": None, "swir1": None, "swir2": None}
        for idx, role in enumerate(roles):
            if role and role in arrays and arrays[role] is None:
                arrays[role] = ds.read(idx + 1)

        # 3. Build normalized (0-1) arrays
        normalized: dict[str, np.ndarray] = {}
        scale = 1.0
        dtype = ds.dtypes[0] if ds.dtypes else "uint8"
        if np.issubdtype(np.dtype(dtype), np.floating):
            normalized = {k: v.astype(np.float32) for k, v in arrays.items() if v is not None}
        elif np.dtype(dtype) == np.uint16:
            mx = float(ds.read(1).max()) if count else 0.0
            scale = 10000.0 if mx > 2000 else 65535.0
            limitations.append(
                f"Integer DN values scaled by 1/{scale:g} as approximate reflectance; "
                "no atmospheric correction applied."
            )
            normalized = {k: (v.astype(np.float32) / scale) for k, v in arrays.items() if v is not None}
        else:
            scale = float(np.iinfo(np.dtype(dtype)).max) if np.issubdtype(np.dtype(dtype), np.integer) else 255.0
            normalized = {k: (v.astype(np.float32) / scale) for k, v in arrays.items() if v is not None}

        # 4. RGB display array (percentile stretch for high dynamic range)
        rgb = _display_rgb(arrays, count, dtype)
        if rgb is None:
            rgb = _fallback_rgb(normalized)

        return BandData(
            rgb=rgb,
            red=normalized.get("red"),
            green=normalized.get("green"),
            blue=normalized.get("blue"),
            nir=normalized.get("nir"),
            swir1=normalized.get("swir1"),
            swir2=normalized.get("swir2"),
            meta=meta,
            limitations=limitations,
        )


def _display_rgb(arrays: dict, count: int, dtype) -> np.ndarray | None:
    """Build an 8-bit RGB display image, stretched for wide dynamic range."""
    import cv2

    r, g, b = arrays.get("red"), arrays.get("green"), arrays.get("blue")
    if r is None or g is None or b is None or count < 3:
        return None
    stack = np.stack([r, g, b], axis=-1)
    if np.issubdtype(np.dtype(dtype), np.floating):
        stack = np.clip(stack * 255.0, 0, 255).astype(np.uint8)
        return cv2.cvtColor(stack, cv2.COLOR_BGR2RGB)
    # Percentile stretch per channel
    out = np.zeros_like(stack)
    for c in range(3):
        ch = stack[..., c].astype(np.float32)
        lo, hi = np.percentile(ch, 2), np.percentile(ch, 98)
        if hi - lo < 1:
            out[..., c] = np.clip(ch / max(hi, 1.0) * 255, 0, 255).astype(np.uint8)
        else:
            out[..., c] = np.clip((ch - lo) / (hi - lo) * 255.0, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def _fallback_rgb(normalized: dict[str, np.ndarray]) -> np.ndarray:
    r = normalized.get("red")
    if r is None:
        first = next(iter(normalized.values()))
        gray = np.clip(first * 255, 0, 255).astype(np.uint8)
        return np.stack([gray] * 3, axis=-1)
    g = normalized.get("green", r)
    b = normalized.get("blue", g)
    return np.clip(np.stack([r, g, b], axis=-1) * 255, 0, 255).astype(np.uint8)