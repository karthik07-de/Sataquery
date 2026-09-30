"""Database engine, session and declarative base.

Default development database is SQLite so the backend runs with zero
configuration. For production set DATABASE_URL to a PostgreSQL
connection string (see .env.example).
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_connect_args: dict = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables for local development (SQLite by default).

    Schema comes straight from the SQLAlchemy models; for production set
    DATABASE_URL to PostgreSQL and let this create the tables there too.
    """
    from app import models  # noqa: F401  (register all models on Base)

    Base.metadata.create_all(bind=engine)
    logger.info("Database ready (%s)", settings.DATABASE_URL.split("@")[-1].split("?")[0])