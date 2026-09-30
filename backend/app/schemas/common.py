"""Shared response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Error body returned by the API on failure."""

    code: str = Field(..., description="Machine-readable error code, e.g. 'not_found'")
    message: str = Field(..., description="Human-readable error message")
    details: Any | None = Field(default=None, description="Optional structured details")


class ErrorResponse(BaseModel):
    """Consistent error envelope used by all endpoints."""

    error: ErrorDetail


class MessageResponse(BaseModel):
    message: str = Field(..., description="Human-readable message")