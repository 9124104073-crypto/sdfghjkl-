"""Candidate sites, existing assets and demand/risk layers."""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import SourceMixin, TimestampMixin


class Site(Base, TimestampMixin, SourceMixin):
    """A candidate location assessed for public-infrastructure siting."""

    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    zone: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(80), default="Chennai", nullable=False)

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    # Populated by the PostGIS migration; NULL on SQLite.
    geom_wkt: Mapped[str | None] = mapped_column(Text)

    # Demand profile
    population_catchment_5km: Mapped[int | None] = mapped_column(Integer)
    population_density: Mapped[int | None] = mapped_column(Integer)
    existing_hospitals: Mapped[int | None] = mapped_column(Integer)
    existing_schools: Mapped[int | None] = mapped_column(Integer)
    existing_hospital_distance_km: Mapped[float | None] = mapped_column(Float)

    # Access profile
    distance_major_road_km: Mapped[float | None] = mapped_column(Float)
    transit_access: Mapped[str | None] = mapped_column(String(120))
    road_connectivity: Mapped[str | None] = mapped_column(String(20))

    # Site characteristics
    elevation_m: Mapped[float | None] = mapped_column(Float)
    slope_deg: Mapped[float | None] = mapped_column(Float)
    land_use: Mapped[str | None] = mapped_column(String(120))
    land_available_acres: Mapped[float | None] = mapped_column(Float)
    land_cost_cr_per_acre: Mapped[float | None] = mapped_column(Float)
    terrain_suitability: Mapped[str | None] = mapped_column(String(20))
    flood_risk: Mapped[str | None] = mapped_column(String(20))

    # Utilities
    utility_infrastructure: Mapped[str | None] = mapped_column(String(20))
    water_availability: Mapped[str | None] = mapped_column(String(20))
    electricity_availability: Mapped[str | None] = mapped_column(String(20))
    internet_availability: Mapped[str | None] = mapped_column(String(20))
    infrastructure_gap: Mapped[float | None] = mapped_column(Float)

    # Values exactly as supplied by the source dataset. Kept distinct from
    # engine output so the UI can show "dataset says" vs "engine computes".
    dataset_ai_score: Mapped[float | None] = mapped_column(Float)
    dataset_confidence: Mapped[float | None] = mapped_column(Float)
    dataset_recommendation: Mapped[str | None] = mapped_column(String(60))
    recommended_infrastructure: Mapped[str | None] = mapped_column(String(120))
    explainable_reason: Mapped[str | None] = mapped_column(Text)

    # Component scores from the published site-recommendation dataset
    road_score: Mapped[float | None] = mapped_column(Float)
    access_score: Mapped[float | None] = mapped_column(Float)
    infra_score: Mapped[float | None] = mapped_column(Float)
    environment_score: Mapped[float | None] = mapped_column(Float)
    cost_score: Mapped[float | None] = mapped_column(Float)

    scores: Mapped[list["SiteScore"]] = relationship(back_populates="site", cascade="all, delete-orphan")
    mcda: Mapped["McdaScore"] = relationship(back_populates="site", uselist=False)


Index("ix_sites_lat_lon", Site.latitude, Site.longitude)


class SiteScore(Base, TimestampMixin):
    """A persisted suitability evaluation produced by the decision engine."""

    __tablename__ = "site_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    infrastructure_type: Mapped[str] = mapped_column(String(80), default="Hospital", nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    recommendation: Mapped[str] = mapped_column(String(60), nullable=False)
    weights_json: Mapped[str | None] = mapped_column(Text)
    factors_json: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    data_status: Mapped[str] = mapped_column(String(20), default="derived", nullable=False)

    site: Mapped[Site] = relationship(back_populates="scores")


class McdaScore(Base, TimestampMixin, SourceMixin):
    """Published 30-site MCDA scorecard (30/20/20/15/15 weighting)."""

    __tablename__ = "mcda_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"), index=True)
    mcda_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    population_coverage: Mapped[float] = mapped_column(Float, nullable=False)
    accessibility: Mapped[float] = mapped_column(Float, nullable=False)
    flood_safety: Mapped[float] = mapped_column(Float, nullable=False)
    land_suitability: Mapped[float] = mapped_column(Float, nullable=False)
    infrastructure_readiness: Mapped[float] = mapped_column(Float, nullable=False)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    published_rank: Mapped[int] = mapped_column(Integer, nullable=False)

    site: Mapped[Site] = relationship(back_populates="mcda")


class InfrastructureAsset(Base, TimestampMixin, SourceMixin):
    """Existing facility or terrain sample from a GIS layer."""

    __tablename__ = "infrastructure_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    category: Mapped[str | None] = mapped_column(String(160))
    serviced_zone: Mapped[str | None] = mapped_column(String(200))
    capacity: Mapped[int | None] = mapped_column(Integer)
    capacity_unit: Mapped[str | None] = mapped_column(String(40))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    region: Mapped[str | None] = mapped_column(String(120))
    attributes_json: Mapped[str | None] = mapped_column(Text)


class InfrastructureGap(Base, TimestampMixin, SourceMixin):
    """Derived per-site service-gap indicator for a facility class."""

    __tablename__ = "infrastructure_gaps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    infrastructure_type: Mapped[str] = mapped_column(String(80), nullable=False)
    gap_score: Mapped[float] = mapped_column(Float, nullable=False)
    facilities_per_100k: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)


class PopulationData(Base, TimestampMixin, SourceMixin):
    """Population estimates and long-term projections per locality."""

    __tablename__ = "population_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    population_2026: Mapped[int] = mapped_column(Integer, nullable=False)
    projected_2030: Mapped[int] = mapped_column(Integer, nullable=False)
    projected_2035: Mapped[int] = mapped_column(Integer, nullable=False)
    projected_2045: Mapped[int] = mapped_column(Integer, nullable=False)
    growth_priority: Mapped[str] = mapped_column(String(20), nullable=False)


class RiskAssessment(Base, TimestampMixin, SourceMixin):
    """Climate and construction risk indicators per locality."""

    __tablename__ = "risk_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id", ondelete="SET NULL"))
    flood_vulnerability: Mapped[str] = mapped_column(String(20), nullable=False)
    annual_rainfall_mm: Mapped[int | None] = mapped_column(Integer)
    terrain_suitability: Mapped[str] = mapped_column(String(20), nullable=False)
    accessibility_risk: Mapped[str] = mapped_column(String(20), nullable=False)
    construction_delay_risk: Mapped[str] = mapped_column(String(20), nullable=False)
