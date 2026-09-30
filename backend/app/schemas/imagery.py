"""Imagery upload & search schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config import settings


class UploadResponse(BaseModel):
    """Response returned after a successful image upload."""

    image_id: str = Field(..., description="Unique identifier of the stored image")
    filename: str = Field(..., description="Stored (sanitized) filename")
    original_filename: str = Field(..., description="Original client filename")
    url: str = Field(..., description="Public URL to fetch the image")
    width: int | None = Field(default=None, description="Image width in pixels")
    height: int | None = Field(default=None, description="Image height in pixels")
    bands: int | None = Field(default=None, description="Number of spectral bands")
    mime_type: str | None = Field(default=None, description="Detected MIME type")
    size_bytes: int | None = Field(default=None, description="File size in bytes")
    crs: str | None = Field(default=None, description="Coordinate reference system, e.g. EPSG:32651 (None for plain images)")
    bounds: list[float] | None = Field(default=None, description="Geographic bounds [minx, miny, maxx, maxy] in CRS units")
    resolution: dict[str, Any] | None = Field(default=None, description="Pixel resolution (x, y) in CRS units")
    center: list[float] | None = Field(default=None, description="Center point [lon, lat] in WGS84 when georeferenced")
    transform: list[float] | None = Field(default=None, description="Affine transform coefficients (a,b,c,d,e,f)")
    is_georeferenced: bool = Field(default=False, description="True when the image carries geospatial metadata")


class ImagerySearchParams(BaseModel):
    """Search parameters for satellite imagery catalogs."""

    latitude: float | None = Field(default=None, ge=-90, le=90, description="Center latitude (WGS84)")
    longitude: float | None = Field(default=None, ge=-180, le=180, description="Center longitude (WGS84)")
    bbox: str | None = Field(default=None, description="Bounding box as 'minx,miny,maxx,maxy' (WGS84)")
    date_from: str | None = Field(default=None, description="Start date (YYYY-MM-DD)")
    date_to: str | None = Field(default=None, description="End date (YYYY-MM-DD)")
    max_cloud_cover: float | None = Field(default=None, ge=0, le=100, description="Maximum cloud cover percentage")
    source: Literal["copernicus", "sentinel-2", "sentinel-1", "landsat"] | None = Field(
        default=None, description="Satellite source"
    )
    limit: int = Field(default=10, ge=1, le=100, description="Maximum number of results")

    @field_validator("bbox")
    @classmethod
    def _check_bbox(cls, v: str | None) -> str | None:
        if v is None:
            return v
        parts = [float(p) for p in v.split(",")]
        if len(parts) != 4:
            raise ValueError("bbox must be 'minx,miny,maxx,maxy'")
        return v


class ImagerySearchItem(BaseModel):
    """A single imagery catalog entry."""

    id: str = Field(..., description="Catalog item identifier")
    source: str = Field(..., description="Data source, e.g. copernicus")
    title: str | None = Field(default=None)
    datetime: str | None = Field(default=None, description="Acquisition datetime (ISO)")
    cloud_cover: float | None = Field(default=None)
    bbox: list[float] | None = Field(default=None)
    geometry: dict[str, Any] | None = Field(default=None, description="GeoJSON geometry")
    properties: dict[str, Any] = Field(default_factory=dict, description="Raw item properties")
    thumbnail_url: str | None = Field(default=None)


class ImagerySearchResponse(BaseModel):
    """Result of a catalog search."""

    source: str = Field(..., description="Data source queried")
    configured: bool = Field(..., description="False when the source is not configured (credentials missing)")
    error: str | None = Field(default=None, description="Configuration error when not configured")
    count: int = Field(..., description="Number of items returned")
    items: list[ImagerySearchItem] = Field(default_factory=list)


class ImagerySourcesResponse(BaseModel):
    """Status of configured satellite data sources."""

    sources: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Each entry: {source, configured, description}",
    )


def build_upload_response(record: Any) -> UploadResponse:
    """Build an UploadResponse from an Imagery ORM record."""
    return UploadResponse(
        image_id=record.id,
        filename=record.filename,
        original_filename=record.original_filename,
        url=f"/uploads/{record.filename}",
        width=record.width,
        height=record.height,
        bands=record.bands,
        mime_type=record.mime_type,
        size_bytes=record.size_bytes,
        crs=record.crs,
        bounds=record.bounds,
        resolution=record.resolution,
        center=record.center,
        transform=record.transform,
        is_georeferenced=record.is_georeferenced,
    )