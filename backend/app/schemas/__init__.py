"""Pydantic request/response contracts."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.constants import DEMO_DATA_NOTICE, DISCLAIMER


class Envelope(BaseModel):
    """Every list response says what kind of data it is carrying."""

    data: Any
    count: int | None = None
    data_status: str = "demo"
    is_demo_data: bool = True
    notes: list[str] = Field(default_factory=list)
    disclaimer: str = DISCLAIMER

    @classmethod
    def of(
        cls,
        data: Any,
        *,
        data_status: str = "demo",
        is_demo_data: bool = True,
        notes: list[str] | None = None,
    ) -> "Envelope":
        resolved_notes = list(notes or [])
        if is_demo_data and DEMO_DATA_NOTICE not in resolved_notes:
            resolved_notes.append(DEMO_DATA_NOTICE)
        return cls(
            data=data,
            count=len(data) if isinstance(data, list) else None,
            data_status=data_status,
            is_demo_data=is_demo_data,
            notes=resolved_notes,
        )


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    database_error: str | None = None
    demo_mode: bool
    ai_provider: str
    seeded: bool
    record_counts: dict[str, int] = Field(default_factory=dict)


class WeightsRequest(BaseModel):
    """Weights are percentages and must total 100."""

    weights: dict[str, float] | None = None

    @field_validator("weights")
    @classmethod
    def _range_check(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        if value is None:
            return None
        for key, weight in value.items():
            if not 0 <= weight <= 100:
                raise ValueError(f"Weight '{key}' must be between 0 and 100 (got {weight}).")
        return value


class RecommendationRequest(WeightsRequest):
    infrastructure_type: str = "Hospital"
    limit: int = Field(default=5, ge=1, le=40)
    zone: str | None = None
    max_flood_risk: str | None = None


class WhatIfRequest(WeightsRequest):
    top_n: int | None = Field(default=None, ge=1, le=45)


class PriorityRequest(WeightsRequest):
    limit: int | None = Field(default=None, ge=1, le=40)
    sector: str | None = None


class CostRequest(BaseModel):
    project_type: str
    scale: str = "standard"
    risk_level: str = "Medium"
    labour: int | None = Field(default=None, ge=0, le=5000)
    machinery: str | None = None


class CopilotRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    project_id: int | None = None
    site_id: int | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class IotSimulateRequest(BaseModel):
    device_id: str | None = None
    readings: int = Field(default=1, ge=1, le=50)
    # Positive values drive a device towards WARNING/CRITICAL for the demo.
    escalate: float = Field(default=0.0, ge=-1.0, le=1.0)


class IotIngestRequest(BaseModel):
    """The exact payload an ESP32 publishes over MQTT."""

    device_id: str
    sensor_type: str
    value: float
    unit: str
    timestamp: str | None = None


class DprRequest(BaseModel):
    include_explainability: bool = True
