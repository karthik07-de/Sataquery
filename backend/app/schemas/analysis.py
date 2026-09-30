"""Analysis schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

TASK_TYPES = Literal[
    "water_detection",
    "vegetation_analysis",
    "built_up_detection",
    "building_detection",
    "change_detection",
    "feature_highlighting",
    "landcover",
]

STATUS_TYPES = Literal["queued", "processing", "completed", "failed"]

ANALYSIS_TASKS = ("water_detection", "vegetation_analysis", "built_up_detection", "building_detection", "change_detection")


class AnalysisRunRequest(BaseModel):
    """Request to run an analysis directly on uploaded imagery."""

    image_id: str = Field(..., description="ID of the primary uploaded image")
    reference_image_id: str | None = Field(default=None, description="ID of the second image — required for change_detection")
    analysis_type: TASK_TYPES = Field(..., description="Type of analysis to run")
    project_id: str | None = Field(default=None, description="Optional project to attach the analysis to")
    params: dict[str, Any] = Field(default_factory=dict, description="Optional algorithm parameters")

    @field_validator("analysis_type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        if v not in ANALYSIS_TASKS:
            raise ValueError(f"Unsupported analysis_type '{v}'. Supported: {', '.join(ANALYSIS_TASKS)}")
        return v


class AnalysisRunResponse(BaseModel):
    analysis_id: str = Field(..., description="ID of the analysis job")
    task: str = Field(..., description="Analysis type")
    status: str = Field(..., description="Initial status, always 'queued'")


class DetectionItem(BaseModel):
    """A single detected feature (polygon / bounding box)."""

    id: str | None = Field(default=None, description="Detection record id (present once persisted)")
    feature: str = Field(..., description="Feature class, e.g. 'water'")
    geometry: dict[str, Any] = Field(..., description="GeoJSON geometry (Polygon/MultiPolygon/Point)")
    area_m2: float | None = Field(default=None, description="Area in square metres (only when georeferenced)")
    area_px: float | None = Field(default=None, description="Area in pixels")
    confidence: float | None = Field(default=None, description="Confidence 0-1; only set when produced by a model")
    bbox: list[float] | None = Field(default=None, description="Image-coordinate bounding box [x1, y1, x2, y2]")
    properties: dict[str, Any] = Field(default_factory=dict, description="Extra feature properties")


class VisualEvidence(BaseModel):
    """Artifacts produced by an analysis."""

    annotated_image: str | None = Field(default=None, description="URL of the image with detections drawn on it")
    mask: str | None = Field(default=None, description="URL of the segmentation mask")
    geojson: str | None = Field(default=None, description="URL of the GeoJSON feature collection")
    original_image: str | None = Field(default=None, description="URL of the original uploaded image")
    diff_image: str | None = Field(default=None, description="URL of the difference/heatmap image (change detection)")


class AnalysisResult(BaseModel):
    """Standard result structure returned to the frontend."""

    analysis_id: str = Field(..., description="Analysis job id")
    task: str = Field(..., description="Analysis task")
    summary: str = Field(default="", description="Factual summary derived from real statistics")
    detections: list[DetectionItem] = Field(default_factory=list, description="Detected features")
    statistics: dict[str, Any] = Field(default_factory=dict, description="Computed statistics (coverage, counts, indices)")
    confidence: float | None = Field(default=None, description="Aggregate confidence; null unless a model produced it")
    limitations: list[str] = Field(default_factory=list, description="Honest caveats about what could and could not be measured")
    method: str | None = Field(default=None, description="Algorithm/model used, e.g. 'ndwi_threshold'")
    visual_evidence: VisualEvidence = Field(default_factory=VisualEvidence)
    metadata: dict[str, Any] = Field(default_factory=dict, description="Processing metadata (thresholds, indices, duration)")


class AnalysisStatusResponse(BaseModel):
    """Live status of an analysis job (frontend polls this)."""

    analysis_id: str = Field(..., description="Analysis job id")
    task: str = Field(..., description="Analysis task")
    status: STATUS_TYPES = Field(..., description="Job state")
    progress: int = Field(..., ge=0, le=100, description="Pipeline progress percentage")
    error_code: str | None = Field(default=None, description="Error code when status == 'failed' (e.g. 'model_not_configured')")
    error_message: str | None = Field(default=None, description="Error message when status == 'failed'")
    result: AnalysisResult | None = Field(default=None, description="Full result when status == 'completed'")
    created_at: str | None = Field(default=None)
    started_at: str | None = Field(default=None)
    completed_at: str | None = Field(default=None)