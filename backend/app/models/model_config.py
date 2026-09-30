from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base
from app.models.user import utcnow


_MODEL_TYPES = ("LLM", "VLM", "SEGMENTATION", "OBJECT_DETECTION")


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    configuration: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(DateTime, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            f"model_type IN ({','.join(repr(t) for t in _MODEL_TYPES)})",
            name="ck_model_configs_model_type",
        ),
    )
