"""PostgreSQL-only migration runner.

The 001 extensions file is applied by the PostGIS image on first start. The
spatial and pgvector migrations must run *after* SQLAlchemy has created the
tables, so they are applied here at application startup. Each is written to be
idempotent, and the whole step is skipped on SQLite.
"""

from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import text

from app.core.config import REPO_ROOT, settings
from app.core.database import engine

log = logging.getLogger(__name__)

MIGRATIONS_DIR = REPO_ROOT / "database" / "migrations"

# 001 creates the extensions and is handled by the database image's init hook.
POST_CREATE_MIGRATIONS = ("002_spatial_and_indexes.sql", "003_pgvector.sql")


def apply_post_create_migrations() -> list[str]:
    """Apply the PostgreSQL migrations that depend on tables existing."""
    if not settings.is_postgres:
        return []

    applied: list[str] = []
    for name in POST_CREATE_MIGRATIONS:
        path: Path = MIGRATIONS_DIR / name
        if not path.exists():
            log.warning("Migration %s not found at %s", name, path)
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            applied.append(name)
            log.info("Applied migration %s", name)
        except Exception as exc:
            # A missing optional extension (pgvector) must not stop the app.
            log.warning("Migration %s did not apply cleanly: %s", name, exc)
    return applied
