from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Imagery(Base):
    __tablename__ = "imagery"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    satellite: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sensor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acquisition_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolution_meters: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    cloud_coverage: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    footprint: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # PostGIS GEOMETRY(POLYGON, 4326); mirrored as GeoJSON in dev
    center_point: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # PostGIS GEOGRAPHY(POINT, 4326); mirrored as GeoJSON in dev
    bands: Mapped[Any | None] = mapped_column(JSON, nullable=True)  # int band-count (plain images) or role map (rasters)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    # ── Upload-registration columns (filled by imagery_service.store_upload) ──
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    crs: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bounds: Mapped[list | None] = mapped_column(JSON, nullable=True)
    transform: Mapped[list | None] = mapped_column(JSON, nullable=True)
    resolution: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    center: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_georeferenced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    analyses: Mapped[list["Analysis"]] = relationship(
        back_populates="imagery", foreign_keys="[Analysis.imagery_id]"
    )
    change_detections_before: Mapped[list["ChangeDetection"]] = relationship(
        back_populates="imagery_before", foreign_keys="[ChangeDetection.imagery_before_id]"
    )
    change_detections_after: Mapped[list["ChangeDetection"]] = relationship(
        back_populates="imagery_after", foreign_keys="[ChangeDetection.imagery_after_id]"
    )
    embeddings: Mapped[list["ImageryEmbedding"]] = relationship(back_populates="imagery")
