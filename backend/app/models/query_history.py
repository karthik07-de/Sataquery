from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class QueryHistory(Base):
    __tablename__ = "query_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    query_id: Mapped[str | None] = mapped_column(
        ForeignKey("queries.id", ondelete="SET NULL"), nullable=True
    )
    result_id: Mapped[str | None] = mapped_column(
        ForeignKey("results.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="history_entries")
    project: Mapped["Project | None"] = relationship(back_populates="history_entries")
    query: Mapped["Query | None"] = relationship(back_populates="history_entries")
    result: Mapped["Result | None"] = relationship(back_populates="history_entries")

    __table_args__ = (
        Index("ix_query_history_user_id", "user_id"),
        Index("ix_query_history_project_id", "project_id"),
        Index("ix_query_history_query_id", "query_id"),
        Index("ix_query_history_result_id", "result_id"),
    )
