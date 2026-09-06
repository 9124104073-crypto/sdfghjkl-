"""Projects, priority ranking, what-if parameters, schemes and DPR outputs."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import SourceMixin, TimestampMixin


class Project(Base, TimestampMixin, SourceMixin):
    """A proposed infrastructure project in the Chennai portfolio."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    area: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sector: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    project_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    description: Mapped[str | None] = mapped_column(Text)

    # Values from the published AI DPR dataset
    suitability_score: Mapped[float | None] = mapped_column(Float)
    dataset_recommendation: Mapped[str | None] = mapped_column(String(40))
    dataset_risk_level: Mapped[str | None] = mapped_column(String(20))

    estimate: Mapped["ProjectEstimate"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    resources: Mapped["ProjectResource"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )
    risks: Mapped[list["ProjectRisk"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    priority: Mapped["PriorityProject"] = relationship(back_populates="project", uselist=False)
    scheme_recommendations: Mapped[list["SchemeRecommendation"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectEstimate(Base, TimestampMixin, SourceMixin):
    """Planning-level cost estimate. Never an approved government cost."""

    __tablename__ = "project_estimates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    budget_cr: Mapped[float] = mapped_column(Float, nullable=False)
    budget_low_cr: Mapped[float | None] = mapped_column(Float)
    budget_high_cr: Mapped[float | None] = mapped_column(Float)
    contingency_pct: Mapped[float | None] = mapped_column(Float)
    assumptions: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    data_status: Mapped[str] = mapped_column(String(20), default="demo", nullable=False)

    project: Mapped[Project] = relationship(back_populates="estimate")


class ProjectResource(Base, TimestampMixin, SourceMixin):
    """Timeline, labour and machinery plan for a project."""

    __tablename__ = "project_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    timeline_months: Mapped[int] = mapped_column(Integer, nullable=False)
    peak_labour: Mapped[int] = mapped_column(Integer, nullable=False)
    machinery: Mapped[str | None] = mapped_column(String(200))
    phases_json: Mapped[str | None] = mapped_column(Text)
    assumptions: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="resources")


class ProjectRisk(Base, TimestampMixin, SourceMixin):
    __tablename__ = "project_risks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    risk_type: Mapped[str] = mapped_column(String(60), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    rationale: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="risks")


class PriorityProject(Base, TimestampMixin, SourceMixin):
    """Published impact-score ranking for the project portfolio."""

    __tablename__ = "priority_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    published_priority: Mapped[int] = mapped_column(Integer, nullable=False)
    area: Mapped[str] = mapped_column(String(120), nullable=False)
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    impact_score: Mapped[float] = mapped_column(Float, nullable=False)
    sector: Mapped[str] = mapped_column(String(80), nullable=False)

    project: Mapped[Project] = relationship(back_populates="priority")


class WhatIfParameter(Base, TimestampMixin, SourceMixin):
    """Baseline 0-100 parameter scores per area for the What-If Simulator."""

    __tablename__ = "what_if_parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    area: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    budget: Mapped[float] = mapped_column(Float, nullable=False)
    accessibility: Mapped[float] = mapped_column(Float, nullable=False)
    flood_safety: Mapped[float] = mapped_column(Float, nullable=False)
    population_coverage: Mapped[float] = mapped_column(Float, nullable=False)
    sustainability: Mapped[float] = mapped_column(Float, nullable=False)


class GovernmentScheme(Base, TimestampMixin, SourceMixin):
    """Reference table of Central/State schemes."""

    __tablename__ = "government_schemes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scheme_name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    short_name: Mapped[str | None] = mapped_column(String(60))
    ministry: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    eligible_project_types: Mapped[str] = mapped_column(Text, nullable=False)

    recommendations: Mapped[list["SchemeRecommendation"]] = relationship(back_populates="scheme")


class SchemeRecommendation(Base, TimestampMixin, SourceMixin):
    """Project-to-scheme mapping produced by the scheme engine."""

    __tablename__ = "scheme_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    scheme_id: Mapped[int | None] = mapped_column(ForeignKey("government_schemes.id", ondelete="SET NULL"))
    area: Mapped[str] = mapped_column(String(120), nullable=False)
    proposed_project: Mapped[str] = mapped_column(String(200), nullable=False)
    scheme_name: Mapped[str] = mapped_column(String(160), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    match_confidence: Mapped[float | None] = mapped_column(Float)

    project: Mapped[Project] = relationship(back_populates="scheme_recommendations")
    scheme: Mapped[GovernmentScheme] = relationship(back_populates="recommendations")


class AiRecommendation(Base, TimestampMixin):
    """Any AI/engine output persisted for audit and reuse (incl. DPR runs)."""

    __tablename__ = "ai_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(60), nullable=False)
    recommendation_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    data_status: Mapped[str] = mapped_column(String(20), default="ai_generated", nullable=False)
    provider: Mapped[str | None] = mapped_column(String(40))
