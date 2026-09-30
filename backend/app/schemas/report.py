"""Report schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    analysis_id: str = Field(..., description="ID of a completed analysis to report on")
    format: str = Field(default="pdf", description="Report format: 'pdf' or 'markdown'")


class ReportResponse(BaseModel):
    id: str
    analysis_id: str
    format: str
    url: str = Field(..., description="URL to download the report")
    path: str
    created_at: datetime