"""SatQuery AI backend — FastAPI application entrypoint.

Run (from the backend/ directory):

    uvicorn app.main:app --reload --port 8000

Docs: /docs (Swagger) and /redoc.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging_config import get_logger, setup_logging
from app.database.database import init_db

setup_logging()
logger = get_logger(__name__)


# Storage directories must exist before static mounts / DB init.
for _d in (settings.upload_dir, settings.output_dir, settings.reports_dir, settings.model_dir):
    _d.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("%s v%s started (env=%s)", settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT)
    yield


app = FastAPI(
    title="SatQuery AI API",
    description=(
        "Backend for SatQuery AI — Interactive Vision-Language Assistant for "
        "Multimodal Remote Sensing Image Analysis. Uploads satellite imagery, "
        "understands natural-language queries, runs real computer-vision / "
        "remote-sensing analysis (water, vegetation, built-up, building, change "
        "detection) and returns structured results with visual evidence.\n\n"
        "All detections, statistics and confidence scores come from actual "
        "processing — never fabricated."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# ── CORS (configurable origins only, never * in production) ────────
# In development, any localhost/127.0.0.1 port is accepted because
# Vite picks the next free port when the default is taken.
import re as _re
_dev_origin_re = _re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)$") if settings.ENVIRONMENT in ("development", "local") else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=_dev_origin_re.pattern if _dev_origin_re else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file mounts for analysis outputs and uploads ────────────
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
app.mount("/outputs", StaticFiles(directory=settings.output_dir), name="outputs")

# ── Routes ─────────────────────────────────────────────────────────
from app.api.routes import analysis, geodata, imagery, layers, projects, query, reports  # noqa: E402

app.include_router(imagery.router)
app.include_router(query.router)
app.include_router(analysis.router)
app.include_router(projects.router)
app.include_router(layers.router)
app.include_router(reports.router)
app.include_router(geodata.router)


# ── Request logging ────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    if request.url.path not in ("/health",):
        logger.info(
            "%s %s -> %s (%.1f ms)",
            request.method, request.url.path, response.status_code, duration_ms,
        )
    return response


# ── Health check ───────────────────────────────────────────────────
@app.get("/health", tags=["system"], summary="Health check")
def health():
    return {"status": "ok", "service": "SatQuery AI backend"}


@app.get("/", tags=["system"], include_in_schema=False)
def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/health",
    }


# ── Consistent error handling ──────────────────────────────────────
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed",
                "details": exc.errors(),
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error", "message": str(exc.detail)}},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "Internal server error. See logs for details.",
            }
        },
    )