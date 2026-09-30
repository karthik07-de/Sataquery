"""Geospatial service.

- Extract CRS / bounds / transform / resolution / bands / center from rasters.
- Convert pixel masks into GeoJSON FeatureCollections.
- Compute real areas (m²) via pyproj.Geod on WGS84 coordinates.
- Persist analysis artifacts (masks, GeoJSON, annotated images).

Everything here is honest: pixel-coordinate geometries are clearly labelled
when the image has no georeferencing.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.core.logging_config import get_logger

logger = get_logger(__name__)

_MAX_FEATURES = 500


def extract_metadata(path: str | Path) -> dict:
    """Extract image metadata. Never claims georeferencing that doesn't exist."""
    path = Path(path)
    ext = path.suffix.lower()
    result: dict = {
        "width": None, "height": None, "bands": None, "crs": None,
        "bounds": None, "transform": None, "resolution": None, "center": None,
        "is_georeferenced": False, "mime_type": None,
    }
    if ext in (".tif", ".tiff"):
        try:
            import rasterio

            with rasterio.open(path) as ds:
                result["width"] = ds.width
                result["height"] = ds.height
                result["bands"] = ds.count
                result["mime_type"] = "image/tiff"
                result["crs"] = ds.crs.to_string() if ds.crs else None
                result["is_georeferenced"] = ds.crs is not None
                if ds.crs:
                    result["bounds"] = [float(v) for v in ds.bounds]
                    result["transform"] = [
                        ds.transform.a, ds.transform.b, ds.transform.c,
                        ds.transform.d, ds.transform.e, ds.transform.f,
                    ]
                    result["resolution"] = {"x": float(ds.res[0]), "y": float(ds.res[1])}
                    result["center"] = _crs_center_to_wgs84(ds.bounds, ds.crs)
                return result
        except Exception as exc:  # noqa: BLE001
            logger.warning("rasterio metadata extraction failed for %s: %s", path.name, exc)

    # Plain images (JPEG/PNG)
    from PIL import Image

    with Image.open(path) as im:
        result["width"], result["height"] = im.size
        result["mime_type"] = Image.MIME.get(im.format or "", "application/octet-stream")
        result["bands"] = {"L": 1, "RGB": 3, "RGBA": 4}.get(im.mode, 3)
    return result


def _crs_center_to_wgs84(bounds, crs) -> list[float] | None:
    try:
        from pyproj import Transformer

        cx, cy = (bounds[0] + bounds[2]) / 2.0, (bounds[1] + bounds[3]) / 2.0
        t = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        lon, lat = t.transform(cx, cy)
        return [round(lon, 6), round(lat, 6)]
    except Exception as exc:  # noqa: BLE001
        logger.debug("center transform failed: %s", exc)
        return None


# ── Polygonization ──────────────────────────────────────────────────

def mask_to_feature_collection(
    mask: np.ndarray,
    meta: dict,
    feature: str,
    min_area_px: int = 24,
    confidence: float | None = None,
) -> dict:
    """Convert a segmentation mask into a GeoJSON FeatureCollection.

    Georeferenced rasters produce WGS84 geometries with area_m2 computed via
    pyproj.Geod. Non-georeferenced images produce pixel-coordinate geometries
    with area_px only (never fake geographic areas).
    """
    import rasterio.features

    if mask.sum() == 0:
        return {"type": "FeatureCollection", "features": []}

    transform = None
    georeferenced = bool(meta.get("is_georeferenced") and meta.get("transform"))
    if georeferenced:
        from rasterio.transform import Affine

        transform = Affine(*meta["transform"])

    shapes_kwargs = {"transform": transform} if transform is not None else {}
    shapes = rasterio.features.shapes((mask > 0).astype(np.uint8), **shapes_kwargs)
    features: list[dict] = []
    transformer = None
    if georeferenced:
        from pyproj import Transformer

        transformer = Transformer.from_crs(meta["crs"], "EPSG:4326", always_xy=True)

    geod = None
    if georeferenced:
        from pyproj import Geod

        geod = Geod(ellps="WGS84")

    res_x = (meta.get("resolution") or {}).get("x", 0.0) or 0.0
    simplify_tol = None
    if georeferenced and res_x:
        simplify_tol = max(1.5 * res_x / 111320.0, 1e-7)  # metres -> degrees (approx)

    raw = []
    for geom_dict, value in shapes:
        if value == 0:
            continue
        raw.append(geom_dict)

    raw.sort(key=lambda g: _shape_area_px(g), reverse=True)
    if len(raw) > _MAX_FEATURES:
        raw = raw[: _MAX_FEATURES]

    for geom_dict in raw:
        area_px = _shape_area_px(geom_dict)
        if area_px < min_area_px:
            continue
        if georeferenced and transformer is not None:
            geom = _to_wgs84(geom_dict, transformer)
            if geom is None:
                continue
            if simplify_tol:
                try:
                    geom = geom.simplify(simplify_tol, preserve_topology=True)
                except Exception:  # noqa: BLE001
                    pass
            geojson_geom = _shapely_to_geojson(geom)
            area_m2 = _polygon_area_m2(geom, geod)
            props: dict = {"feature": feature, "area_m2": round(area_m2, 2) if area_m2 else None, "area_px": round(area_px, 2)}
        else:
            geojson_geom = geom_dict
            area_m2 = None
            props = {
                "feature": feature,
                "area_m2": None,  # never fake a geographic area
                "area_px": round(area_px, 2),
                "note": "Pixel coordinates — image is not georeferenced, so no geographic area is reported.",
            }
        if confidence is not None:
            props["confidence"] = round(float(confidence), 4)
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geojson_geom,
        })

    return {"type": "FeatureCollection", "features": features}


def boxes_to_feature_collection(boxes: list[dict], meta: dict) -> dict:
    """Convert YOLO bounding boxes (pixel xyxy) into a GeoJSON FeatureCollection."""
    import rasterio.features

    georeferenced = bool(meta.get("is_georeferenced") and meta.get("transform"))
    features: list[dict] = []
    for box in boxes:
        x1, y1, x2, y2 = box["bbox"]
        poly = {
            "type": "Polygon",
            "coordinates": [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]],
        }
        props: dict = {"feature": box.get("class", "building"), "bbox_px": box["bbox"]}
        if box.get("confidence") is not None:
            props["confidence"] = box["confidence"]
        if georeferenced:
            from pyproj import Transformer, Geod
            from shapely.geometry import shape

            t = Transformer.from_crs(meta["crs"], "EPSG:4326", always_xy=True)
            geom = _to_wgs84(poly, t)
            if geom is None:
                continue
            props["area_m2"] = round(_polygon_area_m2(geom, Geod(ellps="WGS84")), 2)
            props["centroid"] = [round(c, 6) for c in geom.centroid.coords[0]]
            geojson_geom = _shapely_to_geojson(geom)
        else:
            geojson_geom = poly
            props["note"] = "Pixel coordinates — image is not georeferenced."
        features.append({"type": "Feature", "properties": props, "geometry": geojson_geom})
    return {"type": "FeatureCollection", "features": features}


# ── helpers ────────────────────────────────────────────────────────

def _shape_area_px(geom_dict: dict) -> float:
    from shapely.geometry import shape

    try:
        return float(shape(geom_dict).area)
    except Exception:  # noqa: BLE001
        return 0.0


def _to_wgs84(geom_dict: dict, transformer) -> object | None:
    """Reproject a geometry dict (CRS units) to WGS84 shapely geometry."""
    from shapely.geometry import shape
    from shapely.ops import transform as shapely_transform

    try:
        geom = shape(geom_dict)
        return shapely_transform(lambda x, y: transformer.transform(x, y), geom)
    except Exception as exc:  # noqa: BLE001
        logger.debug("reprojection failed: %s", exc)
        return None


def _polygon_area_m2(geom, geod) -> float | None:
    """Real geodesic area of a polygon/multipolygon in m²."""
    try:
        total = 0.0
        polys = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        for poly in polys:
            if poly.geom_type != "Polygon":
                continue
            xs, ys = zip(*poly.exterior.coords)
            area, _perim = geod.polygon_area_perimeter(xs, ys)
            total += abs(area)
        return float(total)
    except Exception as exc:  # noqa: BLE001
        logger.debug("area computation failed: %s", exc)
        return None


def _shapely_to_geojson(geom) -> dict:
    import shapely.geometry

    mapping = shapely.geometry.mapping(geom)
    if isinstance(mapping, dict):
        return mapping
    if isinstance(mapping, (str, bytes, bytearray)):
        return json.loads(mapping)
    return json.loads(str(mapping))


# ── artifact persistence ───────────────────────────────────────────

def save_artifacts(analysis_id: str, files: dict[str, object]) -> dict[str, str]:
    """Persist artifact objects to outputs/<analysis_id>/ and return their URLs.

    ``files`` keys: 'mask', 'annotated', 'geojson', 'diff', 'classes' (each
    optional). Values may be numpy arrays (saved as PNG), dicts (saved as
    JSON) or (array, meta) tuples to also write a GeoTIFF.
    """
    from app.core.config import settings

    out_dir = settings.output_dir / analysis_id
    out_dir.mkdir(parents=True, exist_ok=True)
    urls: dict[str, str] = {}

    for key, value in files.items():
        if value is None:
            continue
        if isinstance(value, tuple):
            arr, meta = value
            _save_array_png(out_dir / f"{key}.png", arr)
            _save_array_geotiff(out_dir / f"{key}.tif", arr, meta)
            urls[key] = f"/outputs/{analysis_id}/{key}.png"
            urls[f"{key}_geotiff"] = f"/outputs/{analysis_id}/{key}.tif"
        elif isinstance(value, dict):
            path = out_dir / f"{key}.geojson"
            path.write_text(json.dumps(value, indent=2))
            urls[key] = f"/outputs/{analysis_id}/{key}.geojson"
        elif isinstance(value, np.ndarray):
            _save_array_png(out_dir / f"{key}.png", value)
            urls[key] = f"/outputs/{analysis_id}/{key}.png"
        else:
            raise TypeError(f"unsupported artifact type for {key}: {type(value)}")

    return urls


def _save_array_png(path: Path, arr: np.ndarray) -> None:
    import cv2

    a = arr
    if a.dtype != np.uint8:
        a = np.clip(a * 255.0, 0, 255).astype(np.uint8) if a.max() <= 1.0 else a.astype(np.uint8)
    if a.ndim == 3:
        a = cv2.cvtColor(a, cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(path), a)


def _save_array_geotiff(path: Path, arr: np.ndarray, meta: dict) -> None:
    if not (meta.get("is_georeferenced") and meta.get("transform")):
        return
    try:
        import rasterio
        from rasterio.transform import Affine

        if arr.ndim == 3:
            arr = arr[..., 0]  # single-band mask
        profile = {
            "driver": "GTiff",
            "height": arr.shape[0],
            "width": arr.shape[1],
            "count": 1,
            "dtype": "uint8",
            "crs": meta["crs"],
            "transform": Affine(*meta["transform"]),
        }
        with rasterio.open(path, "w", **profile) as dst:
            dst.write((arr > 0).astype(np.uint8) * 255, 1)
    except Exception as exc:  # noqa: BLE001
        logger.warning("GeoTIFF artifact not written for %s: %s", path.name, exc)