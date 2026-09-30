from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


_CHANGE_TYPES = (
    "vegetation_increase",
    "vegetation_decrease",
    "water_increase",
    "water_decrease",
    "builtup_expansion",
    "builtup_reduction",
    "general_change",
)


class ChangeDetection(Base):
    __tablename__ = "change_detections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    imagery_before_id: Mapped[str | None] = mapped_column(
        ForeignKey("imagery.id", ondelete="SET NULL"), nullable=True
    )
    imagery_after_id: Mapped[str | None] = mapped_column(
        ForeignKey("imagery.id", ondelete="SET NULL"), nullable=True
    )
    change_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    changed_area_sq_km: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    percentage_change: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY; mirrored as GeoJSON in dev
    )
    statistics: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    analysis: Mapped["Analysis"] = relationship(back_populates="change_detections")
    imagery_before: Mapped["Imagery | None"] = relationship(
        back_populates="change_detections_before", foreign_keys=[imagery_before_id]
    )
    imagery_after: Mapped["Imagery | None"] = relationship(
        back_populates="change_detections_after", foreign_keys=[imagery_after_id]
    )

    __table_args__ = (
        Index("ix_change_detections_analysis_id", "analysis_id"),
        CheckConstraint(
            f"change_type IN ({','.join(repr(t) for t in _CHANGE_TYPES)})",
            name="ck_change_detections_change_type",
        ),
    )
