"""Layer endpoints — metadata + visualization info for analysis outputs.

Layer types: detection_mask, polygon, bounding_box, heatmap, imagery.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.database.database import get_db
from app.schemas.layer import LayerListResponse, LayerResponse
from app.services.analysis_service import get_status

router = APIRouter(tags=["layers"])

_ARTIFACT_TYPES = {
    "mask": "detection_mask",
    "annotated": "imagery",
    "diff": "heatmap",
    "before": "imagery",
    "after": "imagery",
    "geojson": "polygon",
    "mask_geotiff": "detection_mask",
}

_MIME = {
    "png": "image/png",
    "tif": "image/tiff",
    "geojson": "application/geo+json",
}


def _layers_for_analysis(db: Session, analysis_id: str) -> list[LayerResponse]:
    record = get_status(db, analysis_id)
    result = record.result or {}
    layers: list[LayerResponse] = []

    ve = result.get("visual_evidence") or {}
    for key, url in ve.items():
        if not url:
            continue
        base_type = _ARTIFACT_TYPES.get(key, "imagery")
        ext = url.rsplit(".", 1)[-1] if "." in url else ""
        geojson = None
        if key == "geojson":
            try:
                geojson = json.loads((record.id and _read_json(analysis_id, url)) or "{}")
            except Exception:  # noqa: BLE001
                geojson = None
        layers.append(
            LayerResponse(
                layer_id=f"{analysis_id}:{key}",
                analysis_id=analysis_id,
                layer_type=base_type,
                feature=result.get("task"),
                url=url,
                content_type=_MIME.get(ext, "application/octet-stream"),
                geojson=geojson,
                metadata={"artifact": key},
            )
        )

    for i, d in enumerate(result.get("detections") or []):
        layers.append(
            LayerResponse(
                layer_id=f"{analysis_id}:detection:{i}",
                analysis_id=analysis_id,
                layer_type="bounding_box" if d.get("bbox") else "polygon",
                feature=d.get("feature"),
                geojson=d.get("geometry"),
                metadata={"confidence": d.get("confidence"), "area_m2": d.get("area_m2")},
            )
        )
    return layers


def _read_json(analysis_id: str, url: str) -> str:
    from pathlib import Path

    from app.core.config import settings

    name = Path(url).name
    return (settings.output_dir / analysis_id / name).read_text(encoding="utf-8")


@router.get("/analyses/{analysis_id}/layers", response_model=LayerListResponse, summary="List layers of an analysis")
def list_layers(analysis_id: str, db: Session = Depends(get_db)):
    return LayerListResponse(analysis_id=analysis_id, layers=_layers_for_analysis(db, analysis_id))


@router.get("/layers/{layer_id}", response_model=LayerResponse, summary="Get a single layer")
def get_layer(layer_id: str, db: Session = Depends(get_db)):
    if ":" not in layer_id:
        raise NotFoundError(f"Layer '{layer_id}' not found (expected format <analysis_id>:<artifact>)", code="layer_not_found")
    analysis_id, key = layer_id.split(":", 1)
    for layer in _layers_for_analysis(db, analysis_id):
        if layer.layer_id == layer_id:
            return layer
    raise NotFoundError(f"Layer '{layer_id}' not found", code="layer_not_found")