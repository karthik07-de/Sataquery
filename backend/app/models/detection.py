from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    detection_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    area_sq_km: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY; mirrored as GeoJSON in dev
    )
    bounding_box: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY(POLYGON, 4326); mirrored as GeoJSON in dev
    )
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    analysis: Mapped["Analysis"] = relationship(back_populates="detections")

    __table_args__ = (
        Index("ix_detections_analysis_id", "analysis_id"),
        # Additional PostGIS / DB-agnostic constraints are applied in the
        # Alembic migration so they can be conditional on the backend.
    )
