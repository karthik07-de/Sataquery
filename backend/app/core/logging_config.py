"""Logging configuration.

Logs requests, uploads, analysis lifecycle and durations. Secrets (API keys,
passwords, tokens) are never logged.
"""

from __future__ import annotations

import logging
import sys

from app.core.config import settings

_SENSITIVE_KEYS = (
    "api_key",
    "apikey",
    "secret",
    "password",
    "token",
    "authorization",
    "x-api-key",
    "client_secret",
)


class RedactingFilter(logging.Filter):
    """Redact known secret values from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        for key in _SENSITIVE_KEYS:
            marker = f"{key}="
            lower = msg.lower()
            idx = lower.find(marker)
            if idx != -1:
                msg = msg[: idx + len(marker)] + "***"
        # Overwrite args to avoid original values leaking via %-formatting.
        record.msg = msg
        record.args = ()
        return True


def setup_logging() -> None:
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    if root.handlers:
        # Avoid duplicate handlers on reload.
        for h in list(root.handlers):
            root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
    )
    handler.addFilter(RedactingFilter())
    root.addHandler(handler)

    # Keep third-party loggers reasonably quiet.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)