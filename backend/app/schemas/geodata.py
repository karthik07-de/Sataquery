"""Geodata schemas — natural-language query -> real geospatial features."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class GeoDataRequest(BaseModel):
    """A natural-language geospatial request resolved against open geodata."""

    query: str = Field(..., min_length=3, max_length=500, description="e.g. 'Show water bodies in Bangalore'")
    project_id: str | None = Field(default=None, description="Optional project to attach the query to")


class GeoDataLocation(BaseModel):
    """Geocoded location resolved from the query."""

    name: str = Field(..., description="Short place name")
    display_name: str = Field(..., description="Full geocoder display name")
    lat: float
    lon: float
    bbox: list[float] | None = Field(default=None, description="[south, north, west, east]")
    type: str | None = None


class GeoDataStatistics(BaseModel):
    """Measured statistics over the returned features."""

    detection_count: int = Field(..., description="Number of features found")
    named_features: int = Field(default=0, description="Features with a name in OSM")
    total_area_m2: float = Field(default=0.0, description="Total geodesic area in m²")
    subtype_counts: dict[str, int] = Field(default_factory=dict, description="Count per feature subtype")


class GeoDataResponse(BaseModel):
    """Real geospatial features ready for map rendering."""

    location: GeoDataLocation
    task: str = Field(..., description="Resolved analysis task, e.g. 'water_detection'")
    feature_label: str = Field(..., description="Human label, e.g. 'Water Bodies'")
    color: str = Field(..., description="Overlay hex color")
    features: dict[str, Any] = Field(..., description="GeoJSON FeatureCollection (WGS84 lon/lat)")
    statistics: GeoDataStatistics
    plan: dict[str, Any] = Field(default_factory=dict, description="Query interpretation trace")
    source: str = Field(default="OpenStreetMap (ODbL) via Overpass API")
    imagery_note: str = Field(default="Feature geometries from OpenStreetMap vector data")
