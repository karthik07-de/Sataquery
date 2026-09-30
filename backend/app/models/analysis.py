from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


_ANALYSIS_TYPES = (
    "water_detection",
    "vegetation_analysis",
    "built_up_detection",
    "building_detection",
    "change_detection",
    "landcover",
    "land_cover",
    "feature_highlighting",
    "object_counting",
)

_ANALYSIS_STATUSES = ("queued", "processing", "completed", "failed")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_id: Mapped[str | None] = mapped_column(
        ForeignKey("queries.id", ondelete="SET NULL"), nullable=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    imagery_id: Mapped[str | None] = mapped_column(
        ForeignKey("imagery.id", ondelete="SET NULL"), nullable=True
    )
    reference_imagery_id: Mapped[str | None] = mapped_column(
        ForeignKey("imagery.id", ondelete="SET NULL"), nullable=True
    )
    analysis_type: Mapped[str] = mapped_column(String(100), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parameters: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    query: Mapped["Query | None"] = relationship(back_populates="analyses")
    project: Mapped["Project | None"] = relationship(back_populates="analyses")
    imagery: Mapped["Imagery | None"] = relationship(
        back_populates="analyses", foreign_keys=[imagery_id]
    )
    reference_imagery: Mapped["Imagery | None"] = relationship(
        foreign_keys=[reference_imagery_id]
    )
    detections: Mapped[list["Detection"]] = relationship(back_populates="analysis")
    geometries: Mapped[list["Geometry"]] = relationship(back_populates="analysis")
    results: Mapped[list["Result"]] = relationship(back_populates="analysis")
    change_detections: Mapped[list["ChangeDetection"]] = relationship(back_populates="analysis")
    map_layers: Mapped[list["MapLayer"]] = relationship(back_populates="analysis")
    reports: Mapped[list["Report"]] = relationship(back_populates="analysis")

    __table_args__ = (
        CheckConstraint(
            f"analysis_type IN ({','.join(repr(t) for t in _ANALYSIS_TYPES)})",
            name="ck_analyses_analysis_type",
        ),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in _ANALYSIS_STATUSES)})",
            name="ck_analyses_status",
        ),
        Index("ix_analyses_project_id", "project_id"),
        Index("ix_analyses_created_at", "created_at"),
    )

    # ── Aliases used by routes / services ─────────────────────────
    @property
    def task(self) -> str:
        return self.analysis_type

    @property
    def params(self) -> dict[str, Any]:
        return self.parameters or {}
