"""Repository layer - all database access lives here."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    DataSource,
    GovernmentScheme,
    InfrastructureAsset,
    InfrastructureGap,
    McdaScore,
    PopulationData,
    PriorityProject,
    Project,
    RiskAssessment,
    SchemeRecommendation,
    SensorDevice,
    SensorReading,
    Site,
    WhatIfParameter,
)


# -- sites ---------------------------------------------------------------


def all_sites(db: Session, zone: str | None = None) -> list[Site]:
    stmt = select(Site).order_by(Site.site_code)
    if zone:
        stmt = stmt.where(Site.zone == zone)
    return list(db.scalars(stmt).all())


def site_by_id(db: Session, site_id: int) -> Site | None:
    return db.get(Site, site_id)


def site_by_name(db: Session, name: str) -> Site | None:
    return db.scalar(select(Site).where(func.lower(Site.name) == name.lower()))


def site_by_code(db: Session, code: str) -> Site | None:
    return db.scalar(select(Site).where(Site.site_code == code))


def gaps_for_site(db: Session, site_id: int) -> list[InfrastructureGap]:
    return list(db.scalars(select(InfrastructureGap).where(InfrastructureGap.site_id == site_id)).all())


def mcda_scores(db: Session) -> list[McdaScore]:
    return list(db.scalars(select(McdaScore).order_by(McdaScore.published_rank)).all())


# -- projects ------------------------------------------------------------


def all_projects(db: Session, sector: str | None = None) -> list[Project]:
    stmt = (
        select(Project)
        .options(
            selectinload(Project.estimate),
            selectinload(Project.resources),
            selectinload(Project.risks),
            selectinload(Project.scheme_recommendations),
        )
        .order_by(Project.project_code)
    )
    if sector:
        stmt = stmt.where(Project.sector == sector)
    return list(db.scalars(stmt).all())


def project_by_id(db: Session, project_id: int) -> Project | None:
    return db.scalar(
        select(Project)
        .options(
            selectinload(Project.estimate),
            selectinload(Project.resources),
            selectinload(Project.risks),
            selectinload(Project.scheme_recommendations),
        )
        .where(Project.id == project_id)
    )


def priority_projects(db: Session, sector: str | None = None) -> list[PriorityProject]:
    stmt = select(PriorityProject).order_by(PriorityProject.published_priority)
    if sector:
        stmt = stmt.where(PriorityProject.sector == sector)
    return list(db.scalars(stmt).all())


# -- planning layers -----------------------------------------------------


def what_if_areas(db: Session) -> list[WhatIfParameter]:
    return list(db.scalars(select(WhatIfParameter).order_by(WhatIfParameter.area)).all())


def risk_records(db: Session) -> list[RiskAssessment]:
    return list(db.scalars(select(RiskAssessment).order_by(RiskAssessment.location)).all())


def risk_by_location(db: Session) -> dict[str, RiskAssessment]:
    return {r.location: r for r in risk_records(db)}


def population_records(db: Session) -> list[PopulationData]:
    return list(db.scalars(select(PopulationData).order_by(PopulationData.location)).all())


def population_by_location(db: Session) -> dict[str, PopulationData]:
    return {p.location: p for p in population_records(db)}


def schemes(db: Session) -> list[GovernmentScheme]:
    return list(db.scalars(select(GovernmentScheme).order_by(GovernmentScheme.scheme_name)).all())


def scheme_recommendations(db: Session) -> list[SchemeRecommendation]:
    return list(
        db.scalars(select(SchemeRecommendation).order_by(SchemeRecommendation.area)).all()
    )


def assets(db: Session, asset_type: str | None = None, region: str | None = None) -> list[InfrastructureAsset]:
    stmt = select(InfrastructureAsset).order_by(InfrastructureAsset.asset_code)
    if asset_type:
        stmt = stmt.where(InfrastructureAsset.asset_type == asset_type)
    if region:
        stmt = stmt.where(InfrastructureAsset.region == region)
    return list(db.scalars(stmt).all())


def data_sources(db: Session) -> list[DataSource]:
    return list(db.scalars(select(DataSource).order_by(DataSource.dataset_name)).all())


# -- IoT -----------------------------------------------------------------


def devices(db: Session) -> list[SensorDevice]:
    return list(db.scalars(select(SensorDevice).order_by(SensorDevice.device_id)).all())


def device_by_code(db: Session, device_id: str) -> SensorDevice | None:
    return db.scalar(select(SensorDevice).where(SensorDevice.device_id == device_id))


def recent_readings(db: Session, device_pk: int, limit: int = 12) -> list[SensorReading]:
    rows = db.scalars(
        select(SensorReading)
        .where(SensorReading.device_id == device_pk)
        .order_by(SensorReading.timestamp.desc())
        .limit(limit)
    ).all()
    return list(reversed(rows))
