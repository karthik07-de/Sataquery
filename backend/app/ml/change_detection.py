"""Change detection between two images.

Pipeline (no fabricated results):
1. Load both images as RGB (NIR/other bands ignored for the diff).
2. Align: identical sizes used directly; different sizes are resampled with
   an explicit limitation note (georeferenced alignment via rasterio when both
   images carry a CRS).
3. Per-pixel absolute difference -> Otsu threshold -> morphological cleanup
   -> connected components -> changed regions with real statistics.

If the images are identical, zero changes are reported honestly.
"""

from __future__ import annotations

import numpy as np
import cv2

from app.ml.base import clean_mask, components, otsu_threshold


def _align(a: np.ndarray, b: np.ndarray, limitations: list[str]) -> tuple[np.ndarray, np.ndarray, bool]:
    if a.shape == b.shape:
        return a, b, True
    limitations.append(
        f"Images have different dimensions ({a.shape[1]}x{a.shape[0]} vs {b.shape[1]}x{b.shape[0]}); "
        "the second image was resampled to the first image's grid. Results are pixel-based."
    )
    target = (a.shape[1], a.shape[0])
    b2 = cv2.resize(b, target, interpolation=cv2.INTER_LINEAR)
    return a, b2, False


def detect_change(rgb_a: np.ndarray, rgb_b: np.ndarray, meta_a: dict | None = None, meta_b: dict | None = None) -> dict:
    limitations: list[str] = []
    aligned = True

    # Prefer geospatial alignment when both images are georeferenced.
    if meta_a and meta_b and meta_a.get("is_georeferenced") and meta_b.get("is_georeferenced"):
        try:
            rgb_a, rgb_b, aligned = _warp_to_common_grid(rgb_a, rgb_b, meta_a, meta_b, limitations)
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"Geospatial alignment failed ({exc}); falling back to pixel alignment.")
            rgb_a, rgb_b, aligned = _align(rgb_a, rgb_b, limitations)
    else:
        rgb_a, rgb_b, aligned = _align(rgb_a, rgb_b, limitations)

    a = rgb_a.astype(np.float32) / 255.0
    b = rgb_b.astype(np.float32) / 255.0
    diff = np.mean(np.abs(a - b), axis=2)

    threshold = otsu_threshold(diff)
    if threshold is None:
        threshold = 0.15
        limitations.append(
            "Difference distribution was not bimodal; applied fixed threshold 0.15."
        )
    threshold = float(threshold)

    mask = (diff > threshold).astype(np.uint8) * 255
    mask = clean_mask(mask, kernel_size=5, min_area_px=48)

    num, labels, stats = components(mask)
    region_sizes = [int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, num)] if num > 1 else []

    changed_px = int((mask > 0).sum())
    total_px = mask.size
    changed_pct = round(changed_px / total_px * 100.0, 3) if total_px else 0.0

    # Heatmap for visual evidence
    heat = (np.clip(diff, 0, 1) * 255).astype(np.uint8)
    heatmap = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)

    return {
        "mask": mask,
        "heatmap": heatmap,
        "threshold": threshold,
        "method": "pixel_diff_otsu",
        "num_regions": max(num - 1, 0),
        "region_sizes_px": region_sizes,
        "changed_pixels": changed_px,
        "changed_percent": changed_pct,
        "aligned": aligned,
        "limitations": limitations,
        "note": "Pixel-difference change detection (Otsu threshold)",
    }


def _warp_to_common_grid(rgb_a, rgb_b, meta_a, meta_b, limitations) -> tuple[np.ndarray, np.ndarray, bool]:
    """Align georeferenced images to a common grid using rasterio.warp."""
    import rasterio
    from rasterio.warp import calculate_default_transform, reproject, Resampling

    dst_transform, dst_width, dst_height = calculate_default_transform(
        meta_a["crs"], meta_b["crs"], rgb_a.shape[1], rgb_a.shape[0],
        *meta_a["bounds"], resolution=min(meta_a["res_x"], meta_b["res_x"]),
    )
    # Re-project A into B's CRS on the shared grid
    out_a = np.zeros((3, dst_height, dst_width), dtype=np.float32)
    for band in range(3):
        reproject(
            rgb_a[..., band].astype(np.float32),
            out_a[band],
            src_transform=meta_a["transform"],
            src_crs=meta_a["crs"],
            dst_transform=dst_transform,
            dst_crs=meta_b["crs"],
            resampling=Resampling.bilinear,
        )
    out_b = np.zeros((3, dst_height, dst_width), dtype=np.float32)
    for band in range(3):
        reproject(
            rgb_b[..., band].astype(np.float32),
            out_b[band],
            src_transform=meta_b["transform"],
            src_crs=meta_b["crs"],
            dst_transform=dst_transform,
            dst_crs=meta_b["crs"],
            resampling=Resampling.bilinear,
        )
    limitations.append(
        "Images were geospatially aligned to a common grid (rasterio.warp); "
        "differences are computed on the warped rasters."
    )
    out_a = np.transpose(out_a, (1, 2, 0))
    out_b = np.transpose(out_b, (1, 2, 0))
    out_a = np.clip(out_a, 0, 255).astype(np.uint8)
    out_b = np.clip(out_b, 0, 255).astype(np.uint8)
    return out_a, out_b, True