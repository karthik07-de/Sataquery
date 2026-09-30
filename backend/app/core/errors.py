"""Application exceptions and consistent JSON error responses.

Every error surfaced to the client uses this shape:

    {"error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base application error with an HTTP status code."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None, details: Any = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.details = details

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            body["details"] = self.details
        return {"error": body}


class BadRequestError(AppError):
    status_code = 400
    code = "invalid_request"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "file_too_large"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class ModelNotConfiguredError(AppError):
    """Raised when a real model / data source is required but not configured.

    Used instead of fabricating results.
    """

    status_code = 503
    code = "model_not_configured"


class AnalysisFailedError(AppError):
    status_code = 422
    code = "analysis_failed"