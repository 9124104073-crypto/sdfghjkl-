"""Seed-data loader.

Reads the replaceable files under ``database/seed`` into the database. Nothing
here is hard-coded into the application: swapping a CSV for real GCC/CMDA data
requires no code or frontend change.
"""

from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.engines import normalize as nz
from app.models import (
    DataSource,
    Document,
    DocumentChunk,
    Embedding,
    GovernmentScheme,
    InfrastructureAsset,
    InfrastructureGap,
    McdaScore,
    PopulationData,
    PriorityProject,
    Project,
    ProjectEstimate,
    ProjectResource,
    ProjectRisk,
    RiskAssessment,
    SchemeRecommendation,
    SensorDevice,
    SensorReading,
    Site,
    WhatIfParameter,
)

log = logging.getLogger(__name__)

DEMO_SOURCE = {
    "source_type": "demonstration_dataset",
    "verification_status": "demonstration",
    "is_demo_data": True,
    "source_date": "2026",
}


class SeedError(RuntimeError):
    pass


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise SeedError(f"Seed file missing: {path}")
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _read_json(path: Path) -> Any:
    if not path.exists():
        raise SeedError(f"Seed file missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _num(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    return float(value)


def _int(value: str | None) -> int | None:
    number = _num(value)
    return int(number) if number is not None else None


def _validate_site_row(row: dict[str, str]) -> None:
    lat, lon = _num(row["latitude"]), _num(row["longitude"])
    if lat is None or not -90 <= lat <= 90:
        raise SeedError(f"{row['site_code']}: latitude out of range ({lat})")
    if lon is None or not -180 <= lon <= 180:
        raise SeedError(f"{row['site_code']}: longitude out of range ({lon})")
    for column in ("road_score", "access_score", "infra_score", "environment_score", "dataset_ai_score"):
        value = _num(row.get(column))
        if value is not None and not 0 <= value <= 100:
            raise SeedError(f"{row['site_code']}: {column} out of range ({value})")


def is_seeded(db: Session) -> bool:
    return db.scalar(select(Site).limit(1)) is not None


def seed_all(db: Session, *, force: bool = False) -> dict[str, int]:
    """Load every seed dataset. Idempotent unless ``force`` is set."""
    if is_seeded(db) and not force:
        log.info("Database already seeded; skipping.")
        return counts(db)

    if force:
        _truncate(db)

    root = settings.seed_dir
    sites_by_name = _seed_sites(db, root / "hospital_sites" / "chennai_candidate_sites.csv")
    _seed_centroids(db, root / "gis_reference" / "chennai_locality_centroids.csv")
    _seed_mcda(db, root / "mcda_sites" / "chennai_mcda_30.csv", sites_by_name)
    _seed_population(db, root / "population_data" / "chennai_population_projection.csv", sites_by_name)
    _seed_risk(db, root / "risk_data" / "chennai_climate_risk.csv", sites_by_name)
    _seed_schemes(db, root / "government_schemes" / "scheme_reference.json")
    projects_by_key = _seed_projects(db, root / "dpr_projects" / "chennai_dpr_projects.csv", sites_by_name)
    _seed_priority(db, root / "priority_projects" / "chennai_priority_ranking.csv", projects_by_key)
    _seed_scheme_mapping(db, root / "government_schemes" / "chennai_scheme_mapping.csv", projects_by_key)
    _seed_what_if(db, root / "what_if" / "chennai_what_if_areas.csv")
    _seed_gis_layers(db, root / "gis_reference" / "gis_layers_coimbatore_study_box.json")
    _seed_infrastructure_gaps(db, sites_by_name)
    _seed_iot(db, projects_by_key, sites_by_name)
    _seed_data_sources(db, root / "data_sources.json")
    db.commit()

    # The knowledge base is derived from the tables above, so it is built last.
    _seed_knowledge_base(db)

    db.commit()
    result = counts(db)
    log.info("Seed complete: %s", result)
    return result


def _truncate(db: Session) -> None:
    for model in (
        Embedding,
        DocumentChunk,
        Document,
        SensorReading,
        SensorDevice,
        SchemeRecommendation,
        ProjectRisk,
        ProjectResource,
        ProjectEstimate,
        PriorityProject,
        Project,
        GovernmentScheme,
        WhatIfParameter,
        InfrastructureGap,
        InfrastructureAsset,
        McdaScore,
        RiskAssessment,
        PopulationData,
        Site,
        DataSource,
    ):
        db.query(model).delete()
    db.flush()


def _seed_sites(db: Session, path: Path) -> dict[str, Site]:
    rows = _read_csv(path)
    sites: dict[str, Site] = {}
    for row in rows:
        _validate_site_row(row)
        elevation = _num(row["elevation_m"])
        slope = _num(row["slope_deg"])
        site = Site(
            site_code=row["site_code"],
            name=row["name"],
            zone=row["zone"],
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
            population_catchment_5km=_int(row["population_catchment_5km"]),
            population_density=_int(row["population_density"]),
            existing_hospitals=_int(row["existing_hospitals"]),
            existing_schools=_int(row["existing_schools"]),
            distance_major_road_km=_num(row["distance_major_road_km"]),
            transit_access=row["transit_access"],
            # Derived from source attributes onto the controlled vocabulary.
            road_connectivity=nz.road_connectivity_from(
                _num(row["distance_major_road_km"]), row["transit_access"]
            ),
            flood_risk=row["flood_risk"],
            elevation_m=elevation,
            slope_deg=slope,
            land_use=row["land_use"],
            land_available_acres=_num(row["land_available_acres"]),
            land_cost_cr_per_acre=_num(row["land_cost_cr_per_acre"]),
            terrain_suitability=nz.terrain_level_from(slope, elevation),
            utility_infrastructure=row["utility_infrastructure"],
            water_availability=row["water_availability"],
            electricity_availability=row["electricity_availability"],
            internet_availability=row["internet_availability"],
            road_score=_num(row["road_score"]),
            access_score=_num(row["access_score"]),
            infra_score=_num(row["infra_score"]),
            environment_score=_num(row["environment_score"]),
            cost_score=_num(row["cost_score"]),
            dataset_ai_score=_num(row["dataset_ai_score"]),
            dataset_confidence=_num(row["dataset_confidence"]),
            dataset_recommendation=row["dataset_recommendation"],
            recommended_infrastructure=row["recommended_infrastructure"],
            source_name="NIRMAN AI - AI Site Recommendation Engine Dataset (Chennai)",
            **DEMO_SOURCE,
        )
        db.add(site)
        sites[site.name] = site
    db.flush()
    return sites


def _seed_centroids(db: Session, path: Path) -> None:
    """Localities referenced by other datasets but absent from the site list."""
    for row in _read_csv(path):
        db.add(
            InfrastructureAsset(
                asset_code=f"LOC-{row['locality'][:20].upper().replace(' ', '-')}",
                name=row["locality"],
                asset_type="locality_centroid",
                category=row["zone"],
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                region="Chennai",
                attributes_json=json.dumps({"note": row["note"]}),
                source_name="NIRMAN AI - approximate locality centroids",
                source_type="derived_geocoding",
                source_url="https://www.openstreetmap.org/",
                verification_status="unverified",
                is_demo_data=True,
            )
        )
    db.flush()


def _seed_mcda(db: Session, path: Path, sites: dict[str, Site]) -> None:
    for row in _read_csv(path):
        locality = row["locality"]
        site = sites.get(locality) or sites.get(locality.split(" (")[0])
        pop = float(row["population_coverage"])
        acc = float(row["accessibility"])
        flood = float(row["flood_safety"])
        land = float(row["land_suitability"])
        infra = float(row["infrastructure_readiness"])
        composite = pop * 0.30 + acc * 0.20 + flood * 0.20 + land * 0.15 + infra * 0.15
        db.add(
            McdaScore(
                site_id=site.id if site else None,
                mcda_code=row["mcda_code"],
                locality=locality,
                population_coverage=pop,
                accessibility=acc,
                flood_safety=flood,
                land_suitability=land,
                infrastructure_readiness=infra,
                composite_score=round(composite, 2),
                published_rank=int(row["published_rank"]),
                source_name="Chennai 30-Site MCDA Report",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_population(db: Session, path: Path, sites: dict[str, Site]) -> None:
    for row in _read_csv(path):
        site = sites.get(row["location"])
        db.add(
            PopulationData(
                location=row["location"],
                site_id=site.id if site else None,
                population_2026=int(row["population_2026"]),
                projected_2030=int(row["projected_2030"]),
                projected_2035=int(row["projected_2035"]),
                projected_2045=int(row["projected_2045"]),
                growth_priority=row["growth_priority"],
                source_name="NIRMAN AI - Population Growth Projection Demo Dataset",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_risk(db: Session, path: Path, sites: dict[str, Site]) -> None:
    for row in _read_csv(path):
        site = sites.get(row["location"])
        db.add(
            RiskAssessment(
                location=row["location"],
                site_id=site.id if site else None,
                flood_vulnerability=row["flood_vulnerability"],
                annual_rainfall_mm=_int(row["annual_rainfall_mm"]),
                terrain_suitability=row["terrain_suitability"],
                accessibility_risk=row["accessibility_risk"],
                construction_delay_risk=row["construction_delay_risk"],
                source_name="NIRMAN AI - Chennai Climate & Risk Assessment Demo Dataset",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_schemes(db: Session, path: Path) -> dict[str, GovernmentScheme]:
    payload = _read_json(path)
    schemes: dict[str, GovernmentScheme] = {}
    for entry in payload["schemes"]:
        scheme = GovernmentScheme(
            scheme_name=entry["scheme_name"],
            short_name=entry.get("short_name"),
            ministry=entry.get("ministry"),
            description=entry.get("description"),
            eligible_project_types=entry["eligible_project_types"],
            source_name=entry.get("ministry"),
            source_url=entry.get("source_url"),
            source_type="public_programme_reference",
            source_date="2026",
            verification_status=payload.get("default_verification_status", "pending_verification"),
            is_demo_data=False,
        )
        db.add(scheme)
        schemes[scheme.scheme_name] = scheme
    db.flush()
    return schemes


def _seed_projects(db: Session, path: Path, sites: dict[str, Site]) -> dict[str, Project]:
    projects: dict[str, Project] = {}
    for row in _read_csv(path):
        site = sites.get(row["area"])
        project = Project(
            project_code=row["project_code"],
            area=row["area"],
            name=row["name"],
            sector=row["sector"],
            project_type=row["project_type"],
            site_id=site.id if site else None,
            suitability_score=_num(row["suitability_score"]),
            dataset_recommendation=row["recommendation"],
            dataset_risk_level=row["risk_level"],
            source_name="NIRMAN AI - AI DPR Generator Portfolio Dataset",
            **DEMO_SOURCE,
        )
        db.add(project)
        db.flush()

        budget = float(row["budget_cr"])
        contingency = {"Low": 8.0, "Medium": 12.0, "High": 18.0}.get(row["risk_level"], 12.0)
        db.add(
            ProjectEstimate(
                project_id=project.id,
                budget_cr=budget,
                budget_low_cr=round(budget * (1 - contingency / 100), 2),
                budget_high_cr=round(budget * (1 + contingency / 100 * 1.6), 2),
                contingency_pct=contingency,
                assumptions=(
                    "Portfolio dataset budget. Planning-level demonstration value: excludes land "
                    "acquisition, statutory fees and price escalation. Not an approved government cost."
                ),
                confidence=65.0,
                data_status="demo",
                source_name="NIRMAN AI - AI DPR Generator Portfolio Dataset",
                **DEMO_SOURCE,
            )
        )
        db.add(
            ProjectResource(
                project_id=project.id,
                timeline_months=int(row["timeline_months"]),
                peak_labour=int(row["peak_labour"]),
                machinery=row["machinery"],
                source_name="NIRMAN AI - AI DPR Generator Portfolio Dataset",
                **DEMO_SOURCE,
            )
        )
        db.add(
            ProjectRisk(
                project_id=project.id,
                risk_type="overall",
                level=row["risk_level"],
                score=nz.risk_level_score(row["risk_level"]),
                rationale="Overall risk classification supplied by the AI DPR portfolio dataset.",
                source_name="NIRMAN AI - AI DPR Generator Portfolio Dataset",
                **DEMO_SOURCE,
            )
        )
        projects[f"{row['area']}|{row['name']}"] = project
        projects.setdefault(row["area"], project)
    db.flush()
    return projects


def _seed_priority(db: Session, path: Path, projects: dict[str, Project]) -> None:
    for row in _read_csv(path):
        key = f"{row['area']}|{row['project_name']}"
        project = projects.get(key) or projects.get(row["area"])
        db.add(
            PriorityProject(
                project_id=project.id if project else None,
                published_priority=int(row["published_priority"]),
                area=row["area"],
                project_name=row["project_name"],
                impact_score=float(row["impact_score"]),
                sector=row["sector"],
                source_name="NIRMAN AI - Infrastructure Priority Ranking Demo Dataset",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_scheme_mapping(db: Session, path: Path, projects: dict[str, Project]) -> None:
    scheme_ids = {s.scheme_name: s.id for s in db.scalars(select(GovernmentScheme)).all()}
    for row in _read_csv(path):
        project = projects.get(f"{row['area']}|{row['proposed_project']}") or projects.get(row["area"])
        db.add(
            SchemeRecommendation(
                project_id=project.id if project else None,
                scheme_id=scheme_ids.get(row["scheme_name"]),
                area=row["area"],
                proposed_project=row["proposed_project"],
                scheme_name=row["scheme_name"],
                reason=(
                    f"Project type '{row['project_type']}' falls within the eligible works of "
                    f"{row['scheme_name']}."
                ),
                match_confidence=90.0,
                source_name="NIRMAN AI - Government Scheme Recommendation Dataset",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_what_if(db: Session, path: Path) -> None:
    for row in _read_csv(path):
        values = {
            key: float(row[key])
            for key in ("budget", "accessibility", "flood_safety", "population_coverage", "sustainability")
        }
        for key, value in values.items():
            if not 0 <= value <= 100:
                raise SeedError(f"{row['area']}: {key} out of range ({value})")
        db.add(
            WhatIfParameter(
                area=row["area"],
                **values,
                source_name="NIRMAN AI - What-If Simulator Weighted Priority Dataset",
                **DEMO_SOURCE,
            )
        )
    db.flush()


def _seed_gis_layers(db: Session, path: Path) -> None:
    payload = _read_json(path)
    region = payload["region"]
    common = {
        "source_name": payload["source_name"] if "source_name" in payload else "Spatial Data & Infrastructure Report",
        "source_type": "demonstration_dataset",
        "source_date": "2026",
        "verification_status": payload.get("verification_status", "demonstration"),
        "is_demo_data": payload.get("is_demo_data", True),
        "region": region,
    }

    for entry in payload["wards_and_villages"]:
        db.add(
            InfrastructureAsset(
                asset_code=entry["code"],
                name=entry["name"],
                asset_type="ward_or_village",
                category=entry["category"],
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                **common,
            )
        )
    for entry in payload["hospitals"]:
        db.add(
            InfrastructureAsset(
                asset_code=entry["code"],
                name=entry["name"],
                asset_type="hospital",
                category=entry["category"],
                serviced_zone=entry["serviced_zone"],
                capacity=entry["beds"],
                capacity_unit="beds",
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                **common,
            )
        )
    for entry in payload["schools"]:
        db.add(
            InfrastructureAsset(
                asset_code=entry["code"],
                name=entry["name"],
                asset_type="school",
                category=entry["category"],
                serviced_zone=entry["serviced_zone"],
                capacity=entry["students"],
                capacity_unit="students",
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                **common,
            )
        )
    for entry in payload["water_bodies"]:
        db.add(
            InfrastructureAsset(
                asset_code=entry["code"],
                name=entry["name"],
                asset_type="water_body",
                category=entry["category"],
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                attributes_json=json.dumps({"extent": entry["extent"]}),
                **common,
            )
        )
    for entry in payload["elevation_land_use"]:
        db.add(
            InfrastructureAsset(
                asset_code=f"DEM-{entry['code']}",
                name=entry["name"],
                asset_type="elevation_sample",
                category=entry["land_use"],
                attributes_json=json.dumps(
                    {
                        "dem_m": entry["dem_m"],
                        "slope_deg": entry["slope_deg"],
                        "slope_class": entry["slope_class"],
                    }
                ),
                **common,
            )
        )
    db.flush()


def _seed_infrastructure_gaps(db: Session, sites: dict[str, Site]) -> None:
    """Derive per-site health and education service gaps from facility counts."""
    for site in sites.values():
        population = site.population_catchment_5km or 100_000
        for infra_type, count, target in (
            ("Hospital", site.existing_hospitals, 5.0),
            ("School", site.existing_schools, 12.0),
        ):
            if count is None:
                continue
            per_100k = count / (population / 100_000)
            db.add(
                InfrastructureGap(
                    site_id=site.id,
                    infrastructure_type=infra_type,
                    gap_score=round(nz.scale(per_100k, target * 1.6, 0.0), 2),
                    facilities_per_100k=round(per_100k, 2),
                    notes=f"{count} facilities serving {population:,} residents within 5 km.",
                    source_name="Derived by NIRMAN AI from candidate-site facility counts",
                    source_type="derived",
                    source_date="2026",
                    verification_status="demonstration",
                    is_demo_data=True,
                )
            )
    db.flush()


IOT_FLEET = [
    ("NIR-WL-001", "water_level", "Pallikaranai", "m", 1.8, 2.6, 0.9),
    ("NIR-WL-002", "water_level", "Velachery", "m", 1.6, 2.4, 0.7),
    ("NIR-WL-003", "water_level", "Mudichur", "m", 1.5, 2.2, 0.8),
    ("NIR-TM-001", "temperature", "Ambattur", "C", 38.0, 44.0, 32.5),
    ("NIR-HM-001", "humidity", "Ennore", "%", 85.0, 95.0, 74.0),
    ("NIR-VB-001", "vibration", "Perambur", "mm/s", 4.5, 7.0, 1.9),
    ("NIR-SM-001", "smoke", "Manali", "ppm", 120.0, 200.0, 48.0),
    ("NIR-EN-001", "energy", "Guindy", "kW", 180.0, 240.0, 132.0),
]


def _seed_iot(db: Session, projects: dict[str, Project], sites: dict[str, Site]) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    for device_id, sensor_type, location, unit, warn, crit, baseline in IOT_FLEET:
        project = projects.get(location)
        site = sites.get(location)
        device = SensorDevice(
            device_id=device_id,
            project_id=project.id if project else None,
            site_id=site.id if site else None,
            sensor_type=sensor_type,
            location=location,
            latitude=site.latitude if site else None,
            longitude=site.longitude if site else None,
            unit=unit,
            warning_threshold=warn,
            critical_threshold=crit,
            status="ONLINE",
            installed_at=now.date().isoformat(),
            notes="Simulated ESP32 device. Real hardware publishes the same payload over MQTT.",
        )
        db.add(device)
        db.flush()

        # A short baseline history so trend logic has something to work with.
        for step in range(6):
            value = round(baseline * (1 + (step - 3) * 0.01), 2)
            db.add(
                SensorReading(
                    device_id=device.id,
                    timestamp=now - timedelta(minutes=5 * (6 - step)),
                    value=value,
                    unit=unit,
                    quality_status="NORMAL",
                    is_demo_data=True,
                )
            )
    db.flush()


def _seed_data_sources(db: Session, path: Path) -> None:
    counts_by_dataset = {
        "chennai_candidate_sites": db.query(Site).count(),
        "chennai_mcda_30": db.query(McdaScore).count(),
        "chennai_priority_ranking": db.query(PriorityProject).count(),
        "chennai_what_if_areas": db.query(WhatIfParameter).count(),
        "chennai_climate_risk": db.query(RiskAssessment).count(),
        "chennai_population_projection": db.query(PopulationData).count(),
        "chennai_dpr_projects": db.query(Project).count(),
        "chennai_scheme_mapping": db.query(SchemeRecommendation).count(),
        "government_scheme_reference": db.query(GovernmentScheme).count(),
        "gis_spatial_reference_layers": db.query(InfrastructureAsset)
        .filter(InfrastructureAsset.region != "Chennai")
        .count(),
        "chennai_locality_centroids": db.query(InfrastructureAsset)
        .filter(InfrastructureAsset.asset_type == "locality_centroid")
        .count(),
        "iot_demo_devices": db.query(SensorDevice).count(),
    }

    for entry in _read_json(path):
        db.add(
            DataSource(
                dataset_name=entry["dataset_name"],
                source_name=entry["source_name"],
                source_url=entry.get("source_url"),
                source_type=entry["source_type"],
                date_collected=entry.get("date_collected"),
                retrieval_date=entry.get("date_collected"),
                license=entry.get("license"),
                geographic_scope=entry.get("geographic_scope"),
                update_frequency=entry.get("update_frequency"),
                verification_status=entry["verification_status"],
                is_demo_data=entry["is_demo_data"],
                record_count=counts_by_dataset.get(entry["dataset_name"], 0),
                description=entry.get("description"),
                lineage_metric=entry.get("lineage_metric"),
                lineage_processing=entry.get("lineage_processing"),
                lineage_engine=entry.get("lineage_engine"),
                lineage_output=entry.get("lineage_output"),
            )
        )
    db.flush()


def _seed_knowledge_base(db: Session) -> None:
    """Build the RAG corpus and embeddings from the seeded tables."""
    try:
        from app.services import rag_service

        built = rag_service.build_corpus(db)
        db.commit()
        rag_service.embed_corpus(db)
        log.info("Knowledge base built: %s", built)
    except Exception as exc:  # retrieval is optional, seeding must not fail
        db.rollback()
        log.warning("Could not build the knowledge base: %s", exc)


def counts(db: Session) -> dict[str, int]:
    return {
        "sites": db.query(Site).count(),
        "mcda_scores": db.query(McdaScore).count(),
        "projects": db.query(Project).count(),
        "priority_projects": db.query(PriorityProject).count(),
        "what_if_areas": db.query(WhatIfParameter).count(),
        "risk_assessments": db.query(RiskAssessment).count(),
        "population_records": db.query(PopulationData).count(),
        "government_schemes": db.query(GovernmentScheme).count(),
        "scheme_recommendations": db.query(SchemeRecommendation).count(),
        "infrastructure_assets": db.query(InfrastructureAsset).count(),
        "infrastructure_gaps": db.query(InfrastructureGap).count(),
        "sensor_devices": db.query(SensorDevice).count(),
        "sensor_readings": db.query(SensorReading).count(),
        "data_sources": db.query(DataSource).count(),
        "documents": db.query(Document).count(),
        "document_chunks": db.query(DocumentChunk).count(),
        "embeddings": db.query(Embedding).count(),
    }
