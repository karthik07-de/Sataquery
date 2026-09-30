from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Any

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True  # nullable until auth is wired (demo mode)
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    detected_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detected_task: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    date_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    output_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parsed_query: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped["User | None"] = relationship(back_populates="queries")
    project: Mapped["Project | None"] = relationship(back_populates="queries")
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="query")
    history_entries: Mapped[list["QueryHistory"]] = relationship(back_populates="query")
    reports: Mapped[list["Report"]] = relationship(back_populates="query")

    __table_args__ = (
        Index("ix_queries_user_id", "user_id"),
        Index("ix_queries_project_id", "project_id"),
        Index("ix_queries_created_at", "created_at"),
        CheckConstraint(
            "operation IS NULL OR operation IN ("
            "'single_date',"
            "'single_analysis',"
            "'change_detection',"
            "'comparison',"
            "'time_series',"
            "'feature_highlighting'"
            ")",
            name="ck_queries_operation",
        ),
    )

