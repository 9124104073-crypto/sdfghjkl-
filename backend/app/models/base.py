"""Shared model mixins.

Every dataset in NIRMAN AI carries provenance so the UI can always distinguish
demonstration values from source data, derived calculations and AI output.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)


class SourceMixin:
    """Provenance columns required on every important dataset."""

    source_name: Mapped[str | None] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(String(500))
    source_type: Mapped[str | None] = mapped_column(String(80))
    source_date: Mapped[str | None] = mapped_column(String(40))
    verification_status: Mapped[str] = mapped_column(String(40), default="demonstration", nullable=False)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
