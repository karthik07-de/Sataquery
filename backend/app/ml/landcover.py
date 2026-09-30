"""Land cover classification combining the water / vegetation / built-up masks.

Class codes: 0 other, 1 water, 2 vegetation, 3 built-up.
"""

from __future__ import annotations

import numpy as np

from app.ml.water_detection import detect_water
from app.ml.vegetation_analysis import detect_vegetation
from app.ml.builtup_detection import detect_builtup

CLASS_NAMES = {0: "other", 1: "water", 2: "vegetation", 3: "built_up"}


def classify(bands) -> dict:
    water = detect_water(bands)
    vegetation = detect_vegetation(bands)
    builtup = detect_builtup(bands)

    w = water["mask"] > 0
    v = vegetation["mask"] > 0
    b = builtup["mask"] > 0

    classes = np.zeros(bands.rgb.shape[:2], dtype=np.uint8)
    classes[w] = 1
    classes[v & ~w] = 2
    classes[b & ~w & ~v] = 3

    total = classes.size
    stats: dict[str, dict] = {}
    for code, name in CLASS_NAMES.items():
        count = int((classes == code).sum())
        stats[name] = {
            "pixels": count,
            "coverage_percent": round(count / total * 100.0, 3) if total else 0.0,
        }

    limitations = list(
        dict.fromkeys(water["limitations"] + vegetation["limitations"] + builtup["limitations"])
    )

    return {
        "classes": classes,
        "class_names": CLASS_NAMES,
        "statistics": stats,
        "methods": {
            "water": water["method"],
            "vegetation": vegetation["method"],
            "built_up": builtup["method"],
        },
        "limitations": limitations,
        "note": "Land cover from spectral-index classification (no trained model)",
    }