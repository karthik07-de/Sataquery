"""Layer schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LayerResponse(BaseModel):
    """Metadata + visualization information for a result layer."""

    layer_id: str = Field(..., description="Layer identifier")
    analysis_id: str = Field(..., description="Analysis that produced the layer")
    layer_type: str = Field(..., description="detection_mask | polygon | bounding_box | heatmap | imagery")
    feature: str | None = Field(default=None, description="Feature class, e.g. 'water'")
    url: str | None = Field(default=None, description="URL to fetch the layer asset")
    content_type: str | None = Field(default=None, description="MIME type of the asset")
    geojson: dict[str, Any] | None = Field(default=None, description="Inline GeoJSON for vector layers")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Extra layer metadata")


class LayerListResponse(BaseModel):
    analysis_id: str
    layers: list[LayerResponse]