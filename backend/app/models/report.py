from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


_REPORT_STATUSES = ("generating", "completed", "failed")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True  # nullable until auth is wired (demo mode)
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    analysis_id: Mapped[str | None] = mapped_column(
        ForeignKey("analyses.id", ondelete="SET NULL"), nullable=True
    )
    query_id: Mapped[str | None] = mapped_column(
        ForeignKey("queries.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped["User | None"] = relationship(back_populates="reports")
    project: Mapped["Project | None"] = relationship(back_populates="reports")
    analysis: Mapped["Analysis | None"] = relationship(back_populates="reports")
    query: Mapped["Query | None"] = relationship(back_populates="reports")

    __table_args__ = (
        Index("ix_reports_user_id", "user_id"),
        Index("ix_reports_project_id", "project_id"),
        Index("ix_reports_analysis_id", "analysis_id"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in _REPORT_STATUSES)})",
            name="ck_reports_status",
        ),
    )
