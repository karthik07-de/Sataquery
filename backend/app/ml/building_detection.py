"""Building detection via a real object-detection model (YOLO).

The model is NOT bundled with the repository (weights are large). Until a
model is configured, this module returns a clear `model_not_configured`
error instead of fabricating building counts.

Setup:
    pip install -r requirements-ml.txt
    python scripts/download_models.py          # downloads yolov8n.pt into models/
    # .env:
    USE_BUILDING_MODEL=true
    BUILDING_MODEL_PATH=models/yolov8n.pt
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.core.errors import ModelNotConfiguredError
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_model = None


def is_configured() -> bool:
    if not settings.USE_BUILDING_MODEL:
        return False
    path = Path(settings.BUILDING_MODEL_PATH)
    if not path.is_absolute():
        path = settings.model_dir / path
    return path.exists()


def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ModelNotConfiguredError(
            "Analysis unavailable: building detection requires YOLO (ultralytics). "
            "Install `pip install -r requirements-ml.txt`.",
            code="model_not_configured",
        ) from exc

    path = Path(settings.BUILDING_MODEL_PATH)
    if not path.is_absolute():
        path = settings.model_dir / path
    if not path.exists():
        raise ModelNotConfiguredError(
            f"Analysis unavailable: building model weights not found at {path}. "
            "Run `python scripts/download_models.py` and set BUILDING_MODEL_PATH.",
            code="model_not_configured",
        )
    logger.info("Loading building detection model from %s", path)
    _model = YOLO(str(path))
    return _model


def detect_buildings(bands) -> dict:
    """Run YOLO inference. Returns detections with real model confidence."""
    if not is_configured():
        raise ModelNotConfiguredError(
            "Analysis unavailable: required model is not configured. "
            "Set USE_BUILDING_MODEL=true and BUILDING_MODEL_PATH=<weights> "
            "(see scripts/download_models.py).",
            code="model_not_configured",
        )
    model = _load_model()
    results = model.predict(
        bands.rgb,
        conf=settings.BUILDING_MODEL_CONFIDENCE,
        verbose=False,
        device="cpu",
    )
    detections: list[dict] = []
    if results and results[0].boxes is not None:
        boxes = results[0].boxes
        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].tolist()
            conf = float(boxes.conf[i])
            cls_id = int(boxes.cls[i]) if boxes.cls is not None else -1
            name = results[0].names.get(cls_id, "building")
            detections.append(
                {
                    "bbox": [round(v, 2) for v in xyxy],
                    "confidence": round(conf, 4),
                    "class": name,
                }
            )
    return {
        "method": f"yolo/{getattr(model, 'model_name', 'yolo')}",
        "detections": detections,
        "count": len(detections),
        "limitations": [
            "Detections reflect the training distribution of the configured YOLO model.",
            "Bounding boxes are in image pixel coordinates.",
        ],
    }