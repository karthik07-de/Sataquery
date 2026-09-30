"""Analysis service — orchestrates the full processing pipeline.

Flow per analysis:
  validate inputs -> load bands -> run real CV/ML engine -> geospatial
  polygonization -> persist artifacts (mask / annotated / GeoJSON) ->
  statistics -> factual explanation -> persist detections + result.

Runs inside an asyncio task; status is polled via GET /analysis/{id}.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone

import numpy as np

from app.core.errors import AppError, ValidationError
from app.core.logging_config import get_logger
from app.database.database import SessionLocal
from app.models.analysis import Analysis
from app.models.detection import Detection
from app.services import explanation_service, vision_service
from app.services.geospatial_service import (
    boxes_to_feature_collection,
    mask_to_feature_collection,
    save_artifacts,
)

logger = get_logger(__name__)

_OVERLAY_COLORS = {
    "water": (38, 130, 255),       # blue
    "vegetation": (80, 220, 100),  # green
    "built_up": (255, 170, 60),    # orange
    "changed": (255, 60, 60),      # red
    "other": (200, 200, 200),
}


# ── creation / status ──────────────────────────────────────────────

def create_analysis(
    db,
    *,
    analysis_type: str,
    imagery_id: str,
    reference_imagery_id: str | None = None,
    project_id: str | None = None,
    query_id: str | None = None,
    parameters: dict | None = None,
) -> Analysis:
    record = Analysis(
        project_id=project_id,
        query_id=query_id,
        imagery_id=imagery_id,
        reference_imagery_id=reference_imagery_id,
        analysis_type=analysis_type,
        status="queued",
        progress=0,
        parameters=parameters or {},
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def schedule(analysis_id: str) -> None:
    asyncio.create_task(run_job(analysis_id))


def get_status(db, analysis_id: str) -> Analysis:
    from app.core.errors import NotFoundError

    record = db.get(Analysis, analysis_id)
    if record is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found", code="analysis_not_found")
    return record


# ── background job ─────────────────────────────────────────────────

async def run_job(analysis_id: str) -> None:
    started = time.monotonic()
    logger.info("Analysis %s start (task=%s)", analysis_id, _task_of(analysis_id))
    try:
        with SessionLocal() as db:
            record = db.get(Analysis, analysis_id)
            if record is None:
                return
            record.status = "processing"
            record.progress = 5
            record.started_at = datetime.now(timezone.utc)
            db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Analysis %s could not be started", analysis_id)
        return

    try:
        result = await asyncio.to_thread(_execute, analysis_id)
        with SessionLocal() as db:
            record = db.get(Analysis, analysis_id)
            record.result = result  # stored on the analysis record for backward compatibility
            record.status = "completed"
            record.progress = 100
            record.completed_at = datetime.now(timezone.utc)
            _persist_detections(db, record, result)
            _persist_result_if_missing(db, record, result)
            db.commit()
        logger.info("Analysis %s completed in %.2fs", analysis_id, time.monotonic() - started)
    except AppError as exc:
        _fail(analysis_id, exc.code, exc.message)
        logger.warning("Analysis %s failed: %s (%s)", analysis_id, exc.message, exc.code)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Analysis %s failed unexpectedly", analysis_id)
        _fail(analysis_id, "analysis_failed", f"Analysis failed: {exc}")


def _fail(analysis_id: str, code: str, message: str) -> None:
    with SessionLocal() as db:
        record = db.get(Analysis, analysis_id)
        if record is None:
            return
        record.status = "failed"
        record.error_message = message
        record.error_code = code
        record.completed_at = datetime.now(timezone.utc)
        db.commit()


def _task_of(analysis_id: str) -> str:
    with SessionLocal() as db:
        record = db.get(Analysis, analysis_id)
        return record.analysis_type if record else "?"


def _persist_detections(db, record: Analysis, result: dict) -> None:
    for d in result.get("detections", []):
        db.add(
            Detection(
                analysis_id=record.id,
                detection_type=d.get("feature"),
                label=d.get("feature"),
                geometry=d.get("geometry"),
                area_sq_km=d.get("area_sq_km"),
                count=d.get("count"),
                confidence=d.get("confidence"),
                properties=d.get("properties"),
            )
        )


def _persist_result_if_missing(db, record: Analysis, result: dict) -> None:
    from app.models.result import Result

    result_id = result.get("result_id")
    if isinstance(result_id, str) and db.get(Result, result_id):
        return
    statistics = result.get("statistics") or {}
    confidence = result.get("confidence")
    summary = result.get("summary") or ""
    explanation = result.get("explanation") or ""
    evidence = result.get("visual_evidence") or {}
    detected_feature_count = statistics.get("detection_count")
    detected_area_sq_km = statistics.get("total_area_km2")
    result_geometry = None
    if evidence.get("geojson"):
        try:
            import json
            fc = json.loads(evidence["geojson"]) if isinstance(evidence["geojson"], str) else evidence["geojson"]
            features = fc.get("features", [])
            if features:
                result_geometry = features[0].get("geometry")
        except Exception:
            result_geometry = None

    limitations_value = result.get("limitations")
    if isinstance(limitations_value, (list, dict)):
        limitations_value = json.dumps(limitations_value)

    db.add(
        Result(
            analysis_id=record.id,
            summary=summary,
            explanation=explanation,
            detected_feature_count=detected_feature_count,
            detected_area_sq_km=detected_area_sq_km,
            confidence=confidence,
            statistics=statistics,
            limitations=limitations_value,
            evidence=evidence,
            result_geometry=result_geometry,
        )
    )


# ── engine dispatch ────────────────────────────────────────────────

def _execute(analysis_id: str) -> dict:
    with SessionLocal() as db:
        record = db.get(Analysis, analysis_id)
        if record is None:
            raise ValidationError("Analysis record missing", code="analysis_not_found")
        task = record.analysis_type
        imagery_id = record.imagery_id
        reference_imagery_id = record.reference_imagery_id
        params = record.parameters or {}
        image_path = None
        ref_path = None
        if imagery_id:
            from app.models.imagery import Imagery

            img = db.get(Imagery, imagery_id)
            if img is None:
                raise ValidationError(f"Image '{imagery_id}' not found", code="image_not_found")
            image_path = img.path
        if reference_imagery_id:
            from app.models.imagery import Imagery

            img = db.get(Imagery, reference_imagery_id)
            if img is None:
                raise ValidationError(f"Reference image '{reference_imagery_id}' not found", code="image_not_found")
            ref_path = img.path

    _set_progress(analysis_id, 10)

    if task == "change_detection":
        if ref_path is None:
            raise ValidationError(
                "Change detection requires two images: provide reference_image_id (the second/earlier image).",
                code="missing_reference_image",
            )
        return _run_change(analysis_id, image_path, ref_path, params)
    if task == "building_detection":
        return _run_buildings(analysis_id, image_path, params)
    if task in ("land_cover", "landcover"):
        return _run_landcover(analysis_id, image_path, params)
    if task == "feature_highlighting":
        return _run_highlight(analysis_id, image_path, params)
    if task == "water_detection":
        return _run_single(analysis_id, image_path, "water", _water, params)
    if task == "vegetation_analysis":
        return _run_single(analysis_id, image_path, "vegetation", _vegetation, params)
    if task == "built_up_detection":
        return _run_single(analysis_id, image_path, "built_up", _builtup, params)
    raise ValidationError(f"Unsupported analysis task '{task}'", code="unsupported_task")


def _set_progress(analysis_id: str, progress: int) -> None:
    with SessionLocal() as db:
        record = db.get(Analysis, analysis_id)
        if record:
            record.progress = max(record.progress, progress)
            db.commit()


# ── engines ────────────────────────────────────────────────────────

def _water(bands):
    from app.ml.water_detection import detect_water

    return detect_water(bands)


def _vegetation(bands):
    from app.ml.vegetation_analysis import detect_vegetation

    return detect_vegetation(bands)


def _builtup(bands):
    from app.ml.builtup_detection import detect_builtup

    return detect_builtup(bands)


def _run_single(analysis_id: str, image_path: str, feature: str, detector, params: dict) -> dict:
    bands = vision_service.load_bands(image_path)
    _set_progress(analysis_id, 30)
    res = detector(bands)
    mask = res["mask"]

    fc = mask_to_feature_collection(
        mask, bands.meta, feature,
        min_area_px=int(params.get("min_area_px", 24)),
    )
    _set_progress(analysis_id, 60)

    color = _OVERLAY_COLORS.get(feature, _OVERLAY_COLORS["other"])
    annotated = _overlay_mask(bands.rgb, mask, color)
    artifacts = save_artifacts(analysis_id, {
        "mask": (mask, bands.meta),
        "annotated": annotated,
        "geojson": fc,
    })
    _set_progress(analysis_id, 80)

    detections = _features_to_detections(fc, feature)
    stats = _stats_from_fc(fc, res)
    stats.update(res.get("statistics") or {})
    stats["method"] = res["method"]
    stats["threshold"] = res.get("threshold")

    result = _base_result(analysis_id, feature, detections, stats, res, artifacts, bands, mask)
    return result


def _run_buildings(analysis_id: str, image_path: str, params: dict) -> dict:
    from app.ml.building_detection import detect_buildings

    bands = vision_service.load_bands(image_path)
    _set_progress(analysis_id, 30)
    res = detect_buildings(bands)  # raises ModelNotConfiguredError when no model
    boxes = res["detections"]
    _set_progress(analysis_id, 60)

    fc = boxes_to_feature_collection(boxes, bands.meta)
    annotated = _draw_boxes(bands.rgb, boxes)
    artifacts = save_artifacts(analysis_id, {
        "annotated": annotated,
        "geojson": fc,
    })
    _set_progress(analysis_id, 80)

    detections = []
    confidences = []
    for feat in fc.get("features", []):
        conf = feat.get("properties", {}).get("confidence")
        if conf is not None:
            confidences.append(conf)
        bbox = feat.get("properties", {}).get("bbox_px")
        detections.append({
            "feature": "building",
            "geometry": feat.get("geometry"),
            "area_sq_km": feat.get("properties", {}).get("area_m2"),
            "confidence": conf,
            "bbox": bbox,
            "properties": feat.get("properties"),
        })

    stats = {
        "detection_count": len(detections),
        "method": res["method"],
        "classes_found": list({d["feature"] for d in detections}),
    }
    if confidences:
        stats["mean_confidence"] = round(sum(confidences) / len(confidences), 4)

    result = _base_result(
        analysis_id, "building", detections, stats, res, artifacts, bands, None,
        confidence=round(sum(confidences) / len(confidences), 4) if confidences else None,
        task_label="building_detection",
    )
    return result


def _run_change(analysis_id: str, image_path_a: str, image_path_b: str, params: dict) -> dict:
    from app.ml.change_detection import detect_change

    bands_a = vision_service.load_bands(image_path_a)
    bands_b = vision_service.load_bands(image_path_b)
    _set_progress(analysis_id, 30)
    res = detect_change(bands_a.rgb, bands_b.rgb, bands_a.meta, bands_b.meta)
    _set_progress(analysis_id, 60)

    # Only report geographic areas when both images share an identical grid.
    same_grid = (
        bands_a.meta.get("crs") == bands_b.meta.get("crs")
        and bands_a.meta.get("transform") == bands_b.meta.get("transform")
        and bands_a.rgb.shape == bands_b.rgb.shape
    )
    meta_for_geo = bands_a.meta if same_grid else {**bands_a.meta, "is_georeferenced": False, "transform": None, "crs": None}

    mask = res["mask"]
    fc = mask_to_feature_collection(mask, meta_for_geo, "changed", min_area_px=int(params.get("min_area_px", 48)))

    annotated = _overlay_mask(bands_b.rgb, mask, _OVERLAY_COLORS["changed"])
    artifacts = save_artifacts(analysis_id, {
        "mask": (mask, meta_for_geo),
        "diff": res["heatmap"],
        "annotated": annotated,
        "geojson": fc,
        "before": bands_a.rgb,
        "after": bands_b.rgb,
    })
    _set_progress(analysis_id, 80)

    detections = _features_to_detections(fc, "changed")
    stats = _stats_from_fc(fc, res)
    stats.update({
        "changed_pixels": res["changed_pixels"],
        "changed_percent": res["changed_percent"],
        "num_regions": res["num_regions"],
        "threshold": res["threshold"],
        "method": res.get("method", "pixel_diff"),
        "aligned": res["aligned"],
        "image_size": list(bands_a.rgb.shape[:2]),
    })

    result = _base_result(analysis_id, "changed", detections, stats, res, artifacts, bands_a, mask, task_label="change_detection")
    result["metadata"]["reference_image_size"] = list(bands_b.rgb.shape[:2])
    result["metadata"]["same_grid"] = same_grid
    return result


def _run_landcover(analysis_id: str, image_path: str, params: dict) -> dict:
    from app.ml.landcover import CLASS_NAMES, classify

    bands = vision_service.load_bands(image_path)
    _set_progress(analysis_id, 30)
    res = classify(bands)
    classes = res["classes"]
    _set_progress(analysis_id, 60)

    colored = _colorize_classes(classes)
    fc = _classes_to_feature_collection(classes, bands.meta, CLASS_NAMES)
    artifacts = save_artifacts(analysis_id, {
        "mask": (classes, bands.meta),
        "annotated": colored,
        "geojson": fc,
    })
    _set_progress(analysis_id, 80)

    detections = _features_to_detections(fc, "landcover")
    result = _base_result(analysis_id, "landcover", detections, res["statistics"], res, artifacts, bands, None, task_label="land_cover")
    result["metadata"]["methods"] = res["methods"]
    result["metadata"]["class_names"] = res["class_names"]
    return result


def _run_highlight(analysis_id: str, image_path: str, params: dict) -> dict:
    """Feature highlighting: runs water + vegetation + built-up and combines them."""
    from app.ml.builtup_detection import detect_builtup
    from app.ml.vegetation_analysis import detect_vegetation
    from app.ml.water_detection import detect_water

    bands = vision_service.load_bands(image_path)
    _set_progress(analysis_id, 30)
    water = detect_water(bands)
    vegetation = detect_vegetation(bands)
    builtup = detect_builtup(bands)
    _set_progress(analysis_id, 60)

    overlay = bands.rgb.copy()
    combined_features: list[dict] = []
    all_limitations: list[str] = []
    stats: dict = {}
    for label, res, color in (
        ("water", water, _OVERLAY_COLORS["water"]),
        ("vegetation", vegetation, _OVERLAY_COLORS["vegetation"]),
        ("built_up", builtup, _OVERLAY_COLORS["built_up"]),
    ):
        overlay = _overlay_mask(overlay, res["mask"], color, alpha=0.3)
        fc = mask_to_feature_collection(res["mask"], bands.meta, label, min_area_px=int(params.get("min_area_px", 24)))
        combined_features.extend(fc["features"])
        s = _stats_from_fc(fc, res)
        stats[label] = s
        all_limitations.extend(res["limitations"])

    artifacts = save_artifacts(analysis_id, {
        "annotated": overlay,
        "geojson": {"type": "FeatureCollection", "features": combined_features},
    })
    _set_progress(analysis_id, 80)

    detections = _features_to_detections({"type": "FeatureCollection", "features": combined_features}, "highlight")
    result = _base_result(
        analysis_id, "feature", detections, {"classes": stats}, {},
        artifacts, bands, None, task_label="feature_highlighting",
        limitations=list(dict.fromkeys(all_limitations)),
    )
    return result


# ── result assembly ────────────────────────────────────────────────

def _base_result(
    analysis_id: str,
    feature: str,
    detections: list[dict],
    stats: dict,
    res: dict,
    artifacts: dict,
    bands,
    mask,
    *,
    confidence: float | None = None,
    task_label: str | None = None,
    limitations: list[str] | None = None,
) -> dict:
    task = task_label or (feature + "_detection" if feature != "built_up" else "built_up_detection")
    if feature == "vegetation":
        task = "vegetation_analysis"

    all_limitations = list(res.get("limitations") or [])
    if bands.limitations:
        all_limitations.extend(bands.limitations)
    if limitations:
        all_limitations.extend(limitations)

    result = {
        "analysis_id": analysis_id,
        "task": task,
        "summary": "",
        "detections": detections,
        "statistics": stats,
        "confidence": confidence,
        "limitations": list(dict.fromkeys(all_limitations)),
        "method": res.get("method"),
        "visual_evidence": {
            "annotated_image": artifacts.get("annotated"),
            "mask": artifacts.get("mask"),
            "mask_geotiff": artifacts.get("mask_geotiff"),
            "geojson": artifacts.get("geojson"),
            "diff_image": artifacts.get("diff"),
            "before_image": artifacts.get("before"),
            "after_image": artifacts.get("after"),
        },
        "metadata": {
            "note": res.get("note"),
            "threshold": res.get("threshold"),
            "image_size": [bands.rgb.shape[1], bands.rgb.shape[0]] if bands is not None and bands.rgb is not None else None,
            "is_georeferenced": bool(bands.meta.get("is_georeferenced")) if bands is not None else False,
        },
    }
    result["summary"] = explanation_service.explain(result)
    return result


def _features_to_detections(fc: dict, feature: str) -> list[dict]:
    out = []
    for feat in fc.get("features", []):
        props = feat.get("properties", {})
        out.append({
            "feature": props.get("feature", feature),
            "geometry": feat.get("geometry"),
            "area_sq_km": props.get("area_m2"),
            "count": props.get("count"),
            "confidence": props.get("confidence"),
            "bbox": props.get("bbox_px"),
            "properties": props,
        })
    return out


def _stats_from_fc(fc: dict, res: dict) -> dict:
    feats = fc.get("features", [])
    area_m2 = sum(f.get("properties", {}).get("area_m2") or 0 for f in feats) or None
    area_px = sum(f.get("properties", {}).get("area_px") or 0 for f in feats) or None
    return {
        "detection_count": len(feats),
        "total_area_m2": round(area_m2, 2) if area_m2 else None,
        "total_area_px": round(area_px, 2) if area_px else None,
        "coverage_percent": round(float((res.get("mask", np.zeros((1, 1), np.uint8)) > 0).mean()) * 100.0, 3)
        if isinstance(res.get("mask"), np.ndarray) else None,
    }


# ── visualization helpers ──────────────────────────────────────────

def _overlay_mask(rgb: np.ndarray, mask: np.ndarray, color: tuple, alpha: float = 0.35) -> np.ndarray:
    import cv2

    overlay = rgb.copy()
    colored = np.zeros_like(rgb)
    colored[mask > 0] = color
    overlay = cv2.addWeighted(rgb.astype(np.uint8), 1 - alpha, colored.astype(np.uint8), alpha, 0)
    contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, color, 2)
    return overlay


def _draw_boxes(rgb: np.ndarray, boxes: list[dict]) -> np.ndarray:
    import cv2

    out = rgb.copy()
    for box in boxes:
        x1, y1, x2, y2 = [int(v) for v in box["bbox"]]
        conf = box.get("confidence")
        label = f"{box.get('class', 'building')}" + (f" {conf:.2f}" if conf is not None else "")
        cv2.rectangle(out, (x1, y1), (x2, y2), (60, 200, 120), 2)
        cv2.putText(out, label, (x1, max(y1 - 5, 15)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (60, 200, 120), 1, cv2.LINE_AA)
    return out


def _colorize_classes(classes: np.ndarray) -> np.ndarray:
    colored = np.zeros((*classes.shape, 3), dtype=np.uint8)
    for code, color in ((1, _OVERLAY_COLORS["water"]), (2, _OVERLAY_COLORS["vegetation"]), (3, _OVERLAY_COLORS["built_up"])):
        colored[classes == code] = color
    return colored


def _classes_to_feature_collection(classes: np.ndarray, meta: dict, class_names: dict) -> dict:
    features: list[dict] = []
    for code, name in class_names.items():
        if code == 0:
            continue
        mask = (classes == code).astype(np.uint8) * 255
        fc = mask_to_feature_collection(mask, meta, name, min_area_px=24)
        features.extend(fc["features"])
    return {"type": "FeatureCollection", "features": features}
