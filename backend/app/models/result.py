from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Result(Base):
    __tablename__ = "results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_feature_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_area_sq_km: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    statistics: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    limitations: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    result_geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY; mirrored as GeoJSON in dev
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    analysis: Mapped["Analysis"] = relationship(back_populates="results")
    history_entries: Mapped[list["QueryHistory"]] = relationship(back_populates="result")

    __table_args__ = (
        Index("ix_results_analysis_id", "analysis_id"),
    )
