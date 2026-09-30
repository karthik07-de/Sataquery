"""Application configuration.

All values come from environment variables / the ``.env`` file.
Secrets are never hard-coded in source.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (app/core/config.py -> parents[2])
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration for SatQuery AI backend."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── App ────────────────────────────────────────────────────────
    APP_NAME: str = "SatQuery AI backend"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # ── Security ───────────────────────────────────────────────────
    # Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
    SECRET_KEY: str = "change-me-in-production"
    # Optional comma-separated API keys. If set, requests must send
    # `X-API-Key: <key>`. Leave empty for open development access.
    API_KEYS: str = ""

    # ── CORS ───────────────────────────────────────────────────────
    # Comma-separated list of allowed frontend origins.
    # FRONTEND_URL is the primary origin; CORS_ORIGINS is a legacy
    # comma-separated list for additional origins.
    # In development, any localhost/127.0.0.1 port is accepted.
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Uploads / outputs ──────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 200
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")
    OUTPUT_DIR: str = str(BASE_DIR / "outputs")
    REPORTS_DIR: str = str(BASE_DIR / "reports")
    MODEL_DIR: str = str(BASE_DIR / "models")
    ALLOWED_IMAGE_EXTENSIONS: str = ".jpg,.jpeg,.png,.tif,.tiff"

    # ── Database ───────────────────────────────────────────────────
    # Local dev default is SQLite (zero-config). For PostGIS:
    #   postgresql+psycopg2://user:pass@localhost:5432/satquery
    DATABASE_URL: str = "sqlite:///./satquery.db"

    # ── Satellite data sources ─────────────────────────────────────
    COPERNICUS_CLIENT_ID: str = ""
    COPERNICUS_CLIENT_SECRET: str = ""
    COPERNICUS_AUTH_URL: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    COPERNICUS_STAC_URL: str = "https://catalog.dataspace.copernicus.eu/stac"
    GOOGLE_MAPS_API_KEY: str = ""

    # ── LLM (optional, for explaining real results only) ───────────
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gemini-1.5-flash"

    # ── ML models ──────────────────────────────────────────────────
    # Building detection uses a YOLO model. Point BUILDING_MODEL_PATH at
    # downloaded weights (e.g. models/yolov8n.pt) and set USE_BUILDING_MODEL=true.
    USE_BUILDING_MODEL: bool = False
    BUILDING_MODEL_PATH: str = ""
    BUILDING_MODEL_CONFIDENCE: float = 0.35

    # ── Storage ────────────────────────────────────────────────────
    # S3-compatible object storage (future). Local storage is used until set.
    STORAGE_BUCKET: str = ""
    STORAGE_ENDPOINT: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""

    # ── Derived helpers ────────────────────────────────────────────
    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        # Always include FRONTEND_URL if set
        if self.FRONTEND_URL:
            fu = self.FRONTEND_URL.strip()
            if fu and fu not in origins:
                origins.insert(0, fu)
        # In development, allow any localhost / 127.0.0.1 origin (Vite
        # picks the next free port when the default is taken).
        if self.ENVIRONMENT in ("development", "local"):
            origins.append("http://localhost")
            origins.append("http://127.0.0.1")
        return origins

    @property
    def allowed_extensions(self) -> set[str]:
        return {e.strip().lower() for e in self.ALLOWED_IMAGE_EXTENSIONS.split(",") if e.strip()}

    @property
    def upload_dir(self) -> Path:
        return Path(self.UPLOAD_DIR)

    @property
    def output_dir(self) -> Path:
        return Path(self.OUTPUT_DIR)

    @property
    def reports_dir(self) -> Path:
        return Path(self.REPORTS_DIR)

    @property
    def model_dir(self) -> Path:
        return Path(self.MODEL_DIR)

    @property
    def copernicus_configured(self) -> bool:
        return bool(self.COPERNICUS_CLIENT_ID and self.COPERNICUS_CLIENT_SECRET)

    @property
    def llm_configured(self) -> bool:
        return bool(self.OPENAI_API_KEY or self.GEMINI_API_KEY)

    @property
    def google_maps_key(self) -> str:
        return self.GOOGLE_MAPS_API_KEY.strip()


settings = Settings()