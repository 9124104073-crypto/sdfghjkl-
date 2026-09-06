"""DataProvider abstraction (Prompt 7 - real-Chennai-data readiness).

The service layer talks to a DataProvider, never to a specific source. Today
the DemoDataProvider serves the seeded demonstration datasets. Swapping in a
GCC, CMDA, OSM, Bhuvan, IMD or Census provider is a configuration change: no
frontend code changes, and no scraping or invention of data.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import DataStatus
from app.models import DataSource, PopulationData, RiskAssessment, Site


@dataclass(frozen=True)
class ProviderInfo:
    key: str
    name: str
    organisation: str
    source_url: str | None
    geographic_scope: str
    license: str
    update_frequency: str
    configured: bool
    notes: str


class DataProvider(abc.ABC):
    """Supplies the spatial and demographic layers the engines consume."""

    info: ProviderInfo

    @abc.abstractmethod
    def sites(self, db: Session) -> list[Site]: ...

    @abc.abstractmethod
    def population(self, db: Session) -> list[PopulationData]: ...

    @abc.abstractmethod
    def risk(self, db: Session) -> list[RiskAssessment]: ...

    def data_status(self) -> str:
        return DataStatus.DEMO if not self.info.configured else DataStatus.SOURCE

    def available(self) -> bool:
        return self.info.configured


class DemoDataProvider(DataProvider):
    """Serves the seeded demonstration datasets held in the database."""

    info = ProviderInfo(
        key="demo",
        name="NIRMAN AI demonstration datasets",
        organisation="NIRMAN AI project",
        source_url=None,
        geographic_scope="Chennai Metropolitan Area",
        license="Project-internal demonstration data",
        update_frequency="static",
        configured=True,
        notes="Demonstration data - requires validation before real-world use.",
    )

    def sites(self, db: Session) -> list[Site]:
        return list(db.scalars(select(Site).order_by(Site.site_code)).all())

    def population(self, db: Session) -> list[PopulationData]:
        return list(db.scalars(select(PopulationData).order_by(PopulationData.location)).all())

    def risk(self, db: Session) -> list[RiskAssessment]:
        return list(db.scalars(select(RiskAssessment).order_by(RiskAssessment.location)).all())


class _UnconfiguredProvider(DataProvider):
    """A declared but not-yet-connected authoritative source.

    Deliberately returns nothing rather than approximating: NIRMAN AI does not
    scrape, and does not fabricate a value to fill a gap.
    """

    def __init__(self, info: ProviderInfo) -> None:
        self.info = info

    def _unavailable(self) -> list[Any]:
        return []

    def sites(self, db: Session) -> list[Site]:
        return self._unavailable()

    def population(self, db: Session) -> list[PopulationData]:
        return self._unavailable()

    def risk(self, db: Session) -> list[RiskAssessment]:
        return self._unavailable()


_DECLARED: tuple[ProviderInfo, ...] = (
    ProviderInfo(
        key="gcc",
        name="GCCDataProvider",
        organisation="Greater Chennai Corporation",
        source_url="https://chennaicorporation.gov.in/",
        geographic_scope="Greater Chennai Corporation wards",
        license="Confirm with GCC before use",
        update_frequency="unknown",
        configured=False,
        notes="Ward boundaries, civic assets and ward-level planning datasets.",
    ),
    ProviderInfo(
        key="cmda",
        name="CMDADataProvider",
        organisation="Chennai Metropolitan Development Authority",
        source_url="https://www.cmdachennai.gov.in/",
        geographic_scope="Chennai Metropolitan Area",
        license="Confirm with CMDA before use",
        update_frequency="master-plan cycle",
        configured=False,
        notes="Master plan land use, zoning and development regulations.",
    ),
    ProviderInfo(
        key="osm",
        name="OSMDataProvider",
        organisation="OpenStreetMap contributors",
        source_url="https://www.openstreetmap.org/",
        geographic_scope="Global",
        license="Open Database License (ODbL)",
        update_frequency="continuous",
        configured=False,
        notes="Road network and POI layers for accessibility scoring.",
    ),
    ProviderInfo(
        key="bhuvan",
        name="BhuvanDataProvider",
        organisation="ISRO Bhuvan",
        source_url="https://bhuvan.nrsc.gov.in/",
        geographic_scope="India",
        license="Per Bhuvan terms of use",
        update_frequency="periodic",
        configured=False,
        notes="Flood vulnerability atlas and satellite-derived terrain layers.",
    ),
    ProviderInfo(
        key="imd",
        name="IMDDataProvider",
        organisation="India Meteorological Department",
        source_url="https://mausam.imd.gov.in/",
        geographic_scope="India",
        license="Per IMD data policy",
        update_frequency="daily",
        configured=False,
        notes="Observed and historical rainfall records.",
    ),
    ProviderInfo(
        key="census",
        name="CensusDataProvider",
        organisation="Census of India / WorldPop",
        source_url="https://censusindia.gov.in/",
        geographic_scope="India",
        license="Per Census of India terms",
        update_frequency="decadal",
        configured=False,
        notes="Ward-level demographics and gridded population estimates.",
    ),
)

_PROVIDERS: dict[str, DataProvider] = {"demo": DemoDataProvider()}
for _info in _DECLARED:
    _PROVIDERS[_info.key] = _UnconfiguredProvider(_info)


@lru_cache
def get_data_provider(key: str = "demo") -> DataProvider:
    return _PROVIDERS.get(key, _PROVIDERS["demo"])


def list_providers() -> list[dict[str, Any]]:
    return [
        {
            "key": p.info.key,
            "name": p.info.name,
            "organisation": p.info.organisation,
            "source_url": p.info.source_url,
            "geographic_scope": p.info.geographic_scope,
            "license": p.info.license,
            "update_frequency": p.info.update_frequency,
            "configured": p.info.configured,
            "notes": p.info.notes,
        }
        for p in _PROVIDERS.values()
    ]


def lineage(db: Session) -> list[dict[str, Any]]:
    """Metric -> Source -> Processing -> Decision engine -> Output."""
    rows = db.scalars(select(DataSource).order_by(DataSource.dataset_name)).all()
    return [
        {
            "dataset": row.dataset_name,
            "metric": row.lineage_metric,
            "source": row.source_name,
            "source_url": row.source_url,
            "processing": row.lineage_processing,
            "engine": row.lineage_engine,
            "output": row.lineage_output,
            "verification_status": row.verification_status,
            "is_demo_data": row.is_demo_data,
            "record_count": row.record_count,
        }
        for row in rows
    ]


__all__ = [
    "DataProvider",
    "DemoDataProvider",
    "ProviderInfo",
    "get_data_provider",
    "lineage",
    "list_providers",
]
