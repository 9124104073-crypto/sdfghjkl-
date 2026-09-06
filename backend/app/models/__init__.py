"""SQLAlchemy models for NIRMAN AI."""

from app.models.base import SourceMixin, TimestampMixin
from app.models.documents import Document, DocumentChunk
from app.models.iot import SensorDevice, SensorReading
from app.models.planning import (
    AiRecommendation,
    GovernmentScheme,
    PriorityProject,
    Project,
    ProjectEstimate,
    ProjectResource,
    ProjectRisk,
    SchemeRecommendation,
    WhatIfParameter,
)
from app.models.registry import AuditLog, DataSource
from app.models.spatial import (
    InfrastructureAsset,
    InfrastructureGap,
    McdaScore,
    PopulationData,
    RiskAssessment,
    Site,
    SiteScore,
)

__all__ = [
    "AiRecommendation",
    "AuditLog",
    "DataSource",
    "Document",
    "DocumentChunk",
    "GovernmentScheme",
    "InfrastructureAsset",
    "InfrastructureGap",
    "McdaScore",
    "PopulationData",
    "PriorityProject",
    "Project",
    "ProjectEstimate",
    "ProjectResource",
    "ProjectRisk",
    "RiskAssessment",
    "SchemeRecommendation",
    "SensorDevice",
    "SensorReading",
    "Site",
    "SiteScore",
    "SourceMixin",
    "TimestampMixin",
    "WhatIfParameter",
]
