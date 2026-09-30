"""Query parsing schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    """A natural-language analysis request."""

    query: str = Field(..., min_length=3, max_length=2000, description="Natural-language query, e.g. 'Show water bodies in this image'")
    image_id: str | None = Field(default=None, description="ID of an uploaded image to analyse")
    reference_image_id: str | None = Field(default=None, description="ID of a second image (required for change detection)")
    location: str | None = Field(default=None, description="Optional explicit location name/coordinate")
    date: str | None = Field(default=None, description="Optional acquisition date (YYYY-MM or YYYY-MM-DD)")
    project_id: str | None = Field(default=None, description="Optional project to attach the analysis to")


class QueryPlan(BaseModel):
    """Structured interpretation of a natural-language query."""

    location: str | None = Field(default=None, description="Detected location, if confidently identified")
    task: str = Field(..., description="Analysis task, e.g. 'water_detection'")
    operation: str = Field(default="single_date", description="'single_date' or 'change_detection'")
    date_1: str | None = Field(default=None, description="First date mentioned (YYYY-MM)")
    date_2: str | None = Field(default=None, description="Second date mentioned (YYYY-MM)")
    output: list[str] = Field(default_factory=list, description="Requested outputs, e.g. ['map', 'statistics', 'explanation']")
    matched_keywords: list[str] = Field(default_factory=list, description="Keywords that drove the interpretation")
    raw_query: str = Field(..., description="The original query text")


class QueryResponse(BaseModel):
    """Response after submitting a query — analysis is queued and processed asynchronously."""

    query_id: str = Field(..., description="ID of the stored query")
    analysis_id: str = Field(..., description="ID of the analysis job")
    task: str = Field(..., description="Resolved analysis task")
    operation: str = Field(..., description="'single_date' or 'change_detection'")
    status: str = Field(..., description="Initial analysis status, always 'queued'")
    plan: QueryPlan = Field(..., description="Structured query interpretation")