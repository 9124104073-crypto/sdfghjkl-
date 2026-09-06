"""Data-source registry and audit trail."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class DataSource(Base, TimestampMixin):
    """One row per ingested dataset — the data-lineage backbone."""

    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500))
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    date_collected: Mapped[str | None] = mapped_column(String(40))
    retrieval_date: Mapped[str | None] = mapped_column(String(40))
    license: Mapped[str | None] = mapped_column(String(200))
    geographic_scope: Mapped[str | None] = mapped_column(String(200))
    update_frequency: Mapped[str | None] = mapped_column(String(80))
    verification_status: Mapped[str] = mapped_column(String(40), default="demonstration", nullable=False)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Lineage: metric -> source -> processing -> engine -> output
    lineage_metric: Mapped[str | None] = mapped_column(String(200))
    lineage_processing: Mapped[str | None] = mapped_column(String(300))
    lineage_engine: Mapped[str | None] = mapped_column(String(200))
    lineage_output: Mapped[str | None] = mapped_column(String(300))


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(120), default="system", nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(80))
    entity_id: Mapped[str | None] = mapped_column(String(80))
    detail: Mapped[str | None] = mapped_column(Text)
