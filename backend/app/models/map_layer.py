from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


_LAYER_TYPES = (
    "satellite",
    "water",
    "vegetation",
    "builtup",
    "detections",
    "change",
    "heatmap",
)


class MapLayer(Base):
    __tablename__ = "map_layers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    analysis_id: Mapped[str | None] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    layer_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True  # PostGIS GEOMETRY; mirrored as GeoJSON in dev
    )
    opacity: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True, default=1.0)
    visible: Mapped[bool] = mapped_column(DateTime, nullable=False, default=True)
    style_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    project: Mapped["Project | None"] = relationship(back_populates="map_layers")
    analysis: Mapped["Analysis | None"] = relationship(back_populates="map_layers")

    __table_args__ = (
        Index("ix_map_layers_project_id", "project_id"),
        Index("ix_map_layers_analysis_id", "analysis_id"),
        CheckConstraint(
            f"layer_type IN ({','.join(repr(t) for t in _LAYER_TYPES)})",
            name="ck_map_layers_layer_type",
        ),
    )
