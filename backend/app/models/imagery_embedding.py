from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base
from app.models.user import utcnow


class ImageryEmbedding(Base):
    __tablename__ = "imagery_embeddings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    imagery_id: Mapped[str] = mapped_column(
        ForeignKey("imagery.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(
        JSON, nullable=True  # pgvector VECTOR(embedding_dim); mirrored as list[float] in dev
    )
    embedding_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    imagery: Mapped["Imagery"] = relationship(back_populates="embeddings")

    __table_args__ = ()
