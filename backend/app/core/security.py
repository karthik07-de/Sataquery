"""Security helpers: filename sanitization, safe paths, optional API keys."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import Header, HTTPException

from app.core.config import settings

# Characters that are always stripped from filenames.
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]")


def sanitize_filename(original: str) -> str:
    """Return a safe storage filename derived from an untrusted original.

    The original name is never used verbatim; a random token prevents
    collisions and path traversal.
    """
    stem = _UNSAFE.sub("_", Path(original or "upload").name)
    stem = stem.strip("._") or "upload"
    suffix = Path(stem).suffix.lower()
    if not suffix or len(suffix) > 10:
        suffix = ""
    return f"{uuid.uuid4().hex}{suffix}"


def safe_join(base_dir: Path, *parts: str) -> Path:
    """Join parts under base_dir and guarantee the result stays inside it."""
    base = base_dir.resolve()
    candidate = base.joinpath(*parts).resolve()
    if not candidate.is_relative_to(base):
        raise ValueError("path escapes base directory")
    return candidate


def get_api_key_requirement() -> str | None:
    """Return the configured API key, or None if auth is disabled."""
    keys = [k.strip() for k in settings.API_KEYS.split(",") if k.strip()]
    return keys[0] if keys else None


def verify_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """FastAPI dependency: enforce X-API-Key when API_KEYS is configured.

    When API_KEYS is empty (development) authentication is open by design;
    the architecture is ready for real auth (JWT/OAuth) to be layered on top.
    """
    expected = get_api_key_requirement()
    if expected is None:
        return
    if x_api_key is None or x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")