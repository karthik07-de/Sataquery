"""Shared mask processing utilities."""

from __future__ import annotations

import numpy as np
import cv2


def otsu_threshold(values: np.ndarray) -> float | None:
    """Otsu threshold on a float array (values > threshold are positive class).

    Returns None when the distribution is degenerate (single class), in which
    case callers should fall back to a documented fixed threshold.
    """
    flat = values.ravel()
    if flat.size == 0:
        return None
    lo, hi = float(flat.min()), float(flat.max())
    if hi - lo < 1e-9:
        return None
    # Scale to uint8 for cv2.threshold
    scaled = ((flat - lo) / (hi - lo) * 255.0).astype(np.uint8)
    thr, _ = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Map back to original scale
    if thr <= 0 or thr >= 255:
        return None
    return lo + (thr / 255.0) * (hi - lo)


def mask_from_threshold(index: np.ndarray, threshold: float) -> np.ndarray:
    """Boolean mask for index > threshold (NaN-safe)."""
    mask = np.isfinite(index) & (index > threshold)
    return mask


def clean_mask(mask: np.ndarray, kernel_size: int = 3, min_area_px: int = 24) -> np.ndarray:
    """Morphological cleanup + small-component removal.

    Returns a uint8 mask with 255 for positive pixels.
    """
    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8) * 255
    if mask.sum() == 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    opened = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel, iterations=1)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(opened, connectivity=8)
    if num <= 1:
        return opened
    keep = np.zeros_like(opened)
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= min_area_px:
            keep[labels == i] = 255
    return keep


def components(mask: np.ndarray) -> tuple[int, np.ndarray, np.ndarray]:
    """Connected components of a mask -> (num, labels, stats)."""
    m = (mask > 0).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    return num, labels, stats


def coverage(mask: np.ndarray) -> float:
    """Percentage of positive pixels (0-100)."""
    total = mask.size
    if total == 0:
        return 0.0
    return float((mask > 0).sum()) / total * 100.0