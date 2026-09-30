"""Upload validation and safe file storage.

Rules enforced:
- Extension whitelist (.jpg/.jpeg/.png/.tif/.tiff)
- Size limit (MAX_UPLOAD_SIZE_MB)
- Content sniffing with Pillow / rasterio (rejects corrupted or fake files)
- Filenames are sanitized (random token) and paths are confined to the upload dir
"""

from __future__ import annotations

import io
from pathlib import Path

from app.core.config import settings
from app.core.errors import BadRequestError, PayloadTooLargeError
from app.core.logging_config import get_logger
from app.core.security import safe_join, sanitize_filename

logger = get_logger(__name__)

# Formats Pillow can verify / open.
_PIL_FORMATS = {"JPEG", "PNG", "TIFF"}
_RASTERIO_EXTS = {".tif", ".tiff"}


def validate_and_store(content: bytes, original_filename: str) -> Path:
    """Validate uploaded bytes and persist them under the upload dir.

    Returns the stored path (inside ``settings.upload_dir``).
    Raises AppError subclasses on invalid input.
    """
    # 1. Size
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise PayloadTooLargeError(
            f"File exceeds the maximum upload size of {settings.MAX_UPLOAD_SIZE_MB} MB",
            code="file_too_large",
        )

    # 2. Extension
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise BadRequestError(
            f"Unsupported file type '{ext or '(none)'}'. Allowed: {', '.join(sorted(settings.allowed_extensions))}",
            code="unsupported_file_type",
        )

    # 3. Content sniffing / corruption check
    detected = _sniff_format(content, ext)

    # 4. Store with a sanitized name inside the upload directory
    stored_name = sanitize_filename(original_filename)
    if detected in ("TIFF",) and ext in _RASTERIO_EXTS:
        pass  # keep .tif/.tiff extension as-is
    dest = safe_join(settings.upload_dir, stored_name)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    logger.info("Stored upload %s (%d bytes, detected=%s)", stored_name, len(content), detected)
    return dest


def _sniff_format(content: bytes, ext: str) -> str:
    """Return the detected image format or raise for corrupt files."""
    # TIFF/GeoTIFF: try rasterio first (handles BigTIFF), fall back to Pillow.
    if ext in _RASTERIO_EXTS:
        try:
            import rasterio

            with rasterio.io.MemoryFile(content) as mem:
                with mem.open() as ds:
                    ds.read(1)  # force decode errors to surface
                    return "TIFF"
        except Exception as exc:  # noqa: BLE001
            logger.debug("rasterio could not open tiff: %s", exc)
        # fall through to Pillow verification below

    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(content)) as img:
            fmt = (img.format or "").upper()
            img.verify()
    except UnidentifiedImageError as exc:
        raise BadRequestError("File is not a valid image (corrupted or wrong content)", code="invalid_image") from exc
    except Exception as exc:  # noqa: BLE001
        raise BadRequestError(f"Image verification failed: {exc}", code="invalid_image") from exc

    if fmt not in _PIL_FORMATS:
        raise BadRequestError(
            f"Image content is {fmt or 'unknown'}, but only JPG/PNG/TIFF are supported",
            code="unsupported_file_type",
        )
    return fmt