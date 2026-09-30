"""Imagery endpoints: upload, search, source status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.database.database import get_db
from app.schemas.imagery import (
    ImagerySearchParams,
    ImagerySearchResponse,
    ImagerySourcesResponse,
    UploadResponse,
    build_upload_response,
)
from app.services import imagery_service

router = APIRouter(tags=["imagery"])


@router.post(
    "/images/upload",
    response_model=UploadResponse,
    summary="Upload a satellite image (JPG/PNG/TIFF/GeoTIFF)",
    description=(
        "Validates extension, size, MIME content and image integrity, stores the file "
        "under a sanitized name, and extracts geospatial metadata when the image is "
        "georeferenced. Georeferencing is never claimed when absent."
    ),
)
async def upload_image(file: UploadFile = File(..., description="Image file (jpg/jpeg/png/tif/tiff)"), db: Session = Depends(get_db)):
    content = await file.read()
    record = imagery_service.store_upload(content, file.filename or "upload", db)
    return build_upload_response(record)


@router.get(
    "/imagery/search",
    response_model=ImagerySearchResponse,
    summary="Search satellite imagery catalogs (Copernicus/Sentinel)",
)
def search_imagery(params: ImagerySearchParams = Depends(), db: Session = Depends(get_db)):
    try:
        result = imagery_service.search_copernicus(params)
        return ImagerySearchResponse(
            source=params.source or "copernicus",
            configured=True,
            error=None,
            count=result["count"],
            items=result["items"],
        )
    except AppError as exc:
        if exc.code == "copernicus_not_configured":
            return ImagerySearchResponse(
                source=params.source or "copernicus",
                configured=False,
                error=exc.message,
                count=0,
                items=[],
            )
        raise


@router.get(
    "/imagery/sources",
    response_model=ImagerySourcesResponse,
    summary="Status of configured satellite data sources",
)
def imagery_sources():
    return ImagerySourcesResponse(sources=imagery_service.sources_status())