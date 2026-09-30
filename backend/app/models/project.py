from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

# Type alias for geography column - use JSON in development (no PostGIS)
GeographyType = dict[str, float] | list[float] | None

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True  # nullable until auth is wired (demo mode)
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[GeographyType | None] = mapped_column(
        JSON, nullable=True  # PostGIS GEOGRAPHY(POINT, 4326); mirrored as JSON in dev
    )
    bounding_box: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user: Mapped["User | None"] = relationship(back_populates="projects")
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="project")
    queries: Mapped[list["Query"]] = relationship(back_populates="project")
    map_layers: Mapped[list["MapLayer"]] = relationship(back_populates="project")
    reports: Mapped[list["Report"]] = relationship(back_populates="project")
    history_entries: Mapped[list["QueryHistory"]] = relationship(back_populates="project")
