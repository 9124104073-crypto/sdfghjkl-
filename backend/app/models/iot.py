"""ECE/IoT layer: sensor devices and readings.

IoT is a real-time data input to the Risk engine, not an independent decision
engine. Simulated readings are always flagged is_demo_data=True.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

SENSOR_TYPES = ("water_level", "temperature", "humidity", "vibration", "smoke", "energy")
DEVICE_STATUSES = ("ONLINE", "OFFLINE", "MAINTENANCE")
READING_STATUSES = ("NORMAL", "WARNING", "CRITICAL")


class SensorDevice(Base, TimestampMixin):
    __tablename__ = "sensor_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    sensor_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    warning_threshold: Mapped[float | None] = mapped_column(Float)
    critical_threshold: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="ONLINE", nullable=False)
    installed_at: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)

    readings: Mapped[list["SensorReading"]] = relationship(
        back_populates="device", cascade="all, delete-orphan", order_by="SensorReading.timestamp"
    )


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("sensor_devices.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    quality_status: Mapped[str] = mapped_column(String(20), default="NORMAL", nullable=False)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    device: Mapped[SensorDevice] = relationship(back_populates="readings")
