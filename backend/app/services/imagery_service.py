"""Imagery service — upload storage + Copernicus/Sentinel catalog access.

Google Maps is deliberately NOT used as an analysis engine; it is a map
basemap only. Satellite imagery search goes through the Copernicus Data Space
STAC catalog when credentials are configured, and returns a clear
configuration error otherwise — never fabricated catalog entries.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.errors import AppError, ModelNotConfiguredError
from app.core.logging_config import get_logger
from app.models.imagery import Imagery
from app.schemas.imagery import ImagerySearchItem
from app.services.geospatial_service import extract_metadata
from app.utils.files import validate_and_store

logger = get_logger(__name__)

# collections we can search on Copernicus Data Space
_COLLECTIONS = {
    "sentinel-2": "sentinel-2-l2a",
    "sentinel-1": "sentinel-1-grd",
    "landsat": "landsat-c2-l2",
}


def store_upload(content: bytes, original_filename: str, db) -> Imagery:
    """Validate, persist and register an uploaded image."""
    path = validate_and_store(content, original_filename)
    meta = extract_metadata(path)

    record = Imagery(
        filename=path.name,
        original_filename=original_filename,
        path=str(path),
        width=meta.get("width"),
        height=meta.get("height"),
        bands=meta.get("bands"),
        mime_type=meta.get("mime_type"),
        size_bytes=len(content),
        crs=meta.get("crs"),
        bounds=meta.get("bounds"),
        transform=meta.get("transform"),
        resolution=meta.get("resolution"),
        center=meta.get("center"),
        is_georeferenced=bool(meta.get("is_georeferenced")),
        source="local_upload",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(
        "Registered image %s (%sx%s, %s bands, georeferenced=%s)",
        record.id, record.width, record.height, record.bands, record.is_georeferenced,
    )
    return record


def get_imagery_or_404(db, image_id: str) -> Imagery:
    from app.core.errors import NotFoundError

    record = db.get(Imagery, image_id)
    if record is None:
        raise NotFoundError(f"Image '{image_id}' not found", code="image_not_found")
    return record


# ── Copernicus Data Space ──────────────────────────────────────────

def _token() -> str:
    """Obtain an OAuth2 client-credentials token from Copernicus Data Space."""
    if not settings.copernicus_configured:
        raise ModelNotConfiguredError(
            "Analysis unavailable: Copernicus credentials are not configured. "
            "Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET in .env.",
            code="copernicus_not_configured",
        )
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            settings.COPERNICUS_AUTH_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.COPERNICUS_CLIENT_ID,
                "client_secret": settings.COPERNICUS_CLIENT_SECRET,
                "scope": "DATASET.READ",
            },
        )
        if resp.status_code != 200:
            raise AppError(
                f"Copernicus authentication failed (HTTP {resp.status_code})",
                code="copernicus_auth_failed",
                status_code=502,
            )
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise AppError("Copernicus returned no access token", code="copernicus_auth_failed", status_code=502)
        return token


def search_copernicus(params) -> dict:
    """Search the Copernicus Data Space STAC catalog. Returns real catalog items."""

    collection = _COLLECTIONS.get(params.source or "sentinel-2", "sentinel-2-l2a")
    bbox = params.bbox or ""
    if params.bbox is None and params.latitude is not None and params.longitude is not None:
        half = 0.05  # ~5km box
        bbox = (
            f"{params.longitude - half},{params.latitude - half},"
            f"{params.longitude + half},{params.latitude + half}"
        )
    if not bbox:
        raise AppError("Search requires a bbox or latitude/longitude", code="invalid_request", status_code=400)

    datetime_range = None
    if params.date_from or params.date_to:
        datetime_range = f"{params.date_from or '..'}/{params.date_to or '..'}"

    query: dict = {
        "collections": collection,
        "bbox": bbox,
        "limit": min(params.limit, 50),
    }
    if datetime_range:
        query["datetime"] = datetime_range

    token = _token()
    url = f"{settings.COPERNICUS_STAC_URL.rstrip('/')}/search"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, json=query, headers=headers)
            if resp.status_code != 200:
                raise AppError(
                    f"Copernicus catalog search failed (HTTP {resp.status_code})",
                    code="copernicus_search_failed",
                    status_code=502,
                )
            body = resp.json()
    except httpx.HTTPError as exc:
        raise AppError(f"Copernicus catalog unreachable: {exc}", code="copernicus_unreachable", status_code=502) from exc

    items: list[ImagerySearchItem] = []
    for feat in body.get("features", []):
        props = feat.get("properties", {})
        cloud = props.get("eo:cloud_cover")
        if params.max_cloud_cover is not None and cloud is not None and float(cloud) > params.max_cloud_cover:
            continue
        items.append(
            ImagerySearchItem(
                id=feat.get("id", ""),
                source=params.source or "copernicus",
                title=props.get("title"),
                datetime=props.get("datetime"),
                cloud_cover=cloud,
                bbox=feat.get("bbox"),
                geometry=feat.get("geometry"),
                properties=props,
                thumbnail_url=props.get("thumbnail") or props.get("assets", {}).get("thumbnail", {}).get("href"),
            )
        )
    return {"items": items, "count": len(items)}


def sources_status() -> list[dict]:
    return [
        {
            "source": "copernicus",
            "description": "Copernicus Data Space (Sentinel-1/2, Landsat) via STAC catalog",
            "configured": settings.copernicus_configured,
        },
        {
            "source": "google_maps",
            "description": "Map/location basemap only — never used as an analysis engine",
            "configured": bool(settings.GOOGLE_MAPS_API_KEY),
        },
        {
            "source": "local_upload",
            "description": "User-uploaded imagery (local storage; S3-ready architecture)",
            "configured": True,
        },
    ]