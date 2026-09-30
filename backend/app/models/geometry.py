from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Geometry(Base):
    __tablename__ = "geometries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    geometry_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY; mirrored as GeoJSON in dev
    )
    area_sq_km: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    perimeter_km: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    centroid: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY(POINT, 4326); mirrored as GeoJSON in dev
    )
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    analysis: Mapped["Analysis"] = relationship(back_populates="geometries")

    __table_args__ = (
        Index("ix_geometries_analysis_id", "analysis_id"),
    )
