"""Shared pytest fixtures.

Sample data is generated programmatically: synthetic RGB images with known
water / vegetation / built-up regions and a synthetic GeoTIFF with a real CRS
(EPSG:32651, UTM zone 51N). Tests assert against these KNOWN contents, so a
passing test means the algorithm genuinely found the region.
"""

from __future__ import annotations

import io
import os
import time
from pathlib import Path

import numpy as np
import pytest

# Must be set before the app imports (engine binds at import time).
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_satquery.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.database.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

# Register all models on Base before create_all
from app.models import (  # noqa: E402, F401
    Analysis,
    Detection,
    Imagery,
    Project,
    Query,
    Report,
    User,
)


# ── synthetic sample images ────────────────────────────────────────

def make_water_rgb(size: int = 256) -> np.ndarray:
    """Brown dry land with a large blue water ellipse (~28% of pixels)."""
    img = np.full((size, size, 3), (125, 115, 100), dtype=np.uint8)  # dry soil
    yy, xx = np.mgrid[0:size, 0:size]
    cx, cy = size * 0.5, size * 0.45
    rx, ry = size * 0.34, size * 0.26
    ellipse = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    img[ellipse] = (30, 80, 165)  # deep blue water
    return img


def make_vegetation_rgb(size: int = 256) -> np.ndarray:
    """Brown background with a strong green vegetation rectangle (~25%)."""
    img = np.full((size, size, 3), (130, 118, 102), dtype=np.uint8)
    img[40:170, 40:170] = (35, 140, 40)  # lush green
    return img


def make_builtup_rgb(size: int = 256) -> np.ndarray:
    """Smooth gray background with a textured 'urban' checkerboard block."""
    img = np.full((size, size, 3), (112, 110, 106), dtype=np.uint8)
    block = img[30:190, 30:190].copy()
    for i in range(0, 160, 32):
        for j in range(0, 160, 32):
            if (i // 32 + j // 32) % 2 == 0:
                block[i : i + 32, j : j + 32] = (185, 183, 178)
            else:
                block[i : i + 32, j : j + 32] = (70, 68, 64)
    img[30:190, 30:190] = block
    return img


def make_vegetation_rgb_moved(size: int = 256, offset: int = 80) -> np.ndarray:
    """Brown background with a green square, offset to simulate change."""
    img = np.full((size, size, 3), (130, 118, 102), dtype=np.uint8)
    x0 = 40 + offset
    y0 = 40
    img[y0 : y0 + 90, x0 : x0 + 90] = (35, 140, 40)
    return img


def make_geotiff_bytes() -> bytes:
    """Synthetic 4-band GeoTIFF (R,G,B,NIR) with CRS EPSG:32651.

    Water ellipse: low NIR. Land: high NIR. 10 m resolution.
    """
    import rasterio
    from rasterio.transform import from_origin

    size = 256
    yy, xx = np.mgrid[0:size, 0:size]
    cx, cy = 128, 115
    rx, ry = 80, 60
    water = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1

    r = np.full((size, size), 0.25, dtype=np.float32)
    g = np.full((size, size), 0.22, dtype=np.float32)
    b = np.full((size, size), 0.18, dtype=np.float32)
    nir = np.full((size, size), 0.45, dtype=np.float32)
    r[water], g[water], b[water] = 0.05, 0.12, 0.20
    nir[water] = 0.03

    transform = from_origin(500000.0, 4600000.0, 10.0, 10.0)
    profile = {
        "driver": "GTiff",
        "height": size,
        "width": size,
        "count": 4,
        "dtype": "float32",
        "crs": "EPSG:32651",
        "transform": transform,
    }
    buf = io.BytesIO()
    with rasterio.open(buf, "w", **profile) as dst:
        dst.write(r, 1)
        dst.write(g, 2)
        dst.write(b, 3)
        dst.write(nir, 4)
    return buf.getvalue()


def png_bytes(arr: np.ndarray) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return buf.getvalue()


def jpeg_bytes(arr: np.ndarray) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


# ── fixtures ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def water_png() -> bytes:
    return png_bytes(make_water_rgb())


@pytest.fixture()
def vegetation_png() -> bytes:
    return png_bytes(make_vegetation_rgb())


@pytest.fixture()
def builtup_png() -> bytes:
    return png_bytes(make_builtup_rgb())


@pytest.fixture()
def change_a_png() -> bytes:
    return png_bytes(make_vegetation_rgb_moved(offset=0))


@pytest.fixture()
def change_b_png() -> bytes:
    return png_bytes(make_vegetation_rgb_moved(offset=80))


@pytest.fixture()
def geotiff_bytes() -> bytes:
    return make_geotiff_bytes()


def upload(client: TestClient, content: bytes, filename: str) -> dict:
    resp = client.post("/images/upload", files={"file": (filename, content)})
    assert resp.status_code == 200, resp.text
    return resp.json()


def wait_for_analysis(client: TestClient, analysis_id: str, timeout: float = 90.0) -> dict:
    """Poll GET /analysis/{id} until completed/failed."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        resp = client.get(f"/analysis/{analysis_id}")
        assert resp.status_code == 200
        last = resp.json()
        if last["status"] in ("completed", "failed"):
            return last
        time.sleep(0.15)
    pytest.fail(f"analysis {analysis_id} did not finish in {timeout}s (last: {last})")