"""Routes for the machine-learning, geospatial, retrieval, history and MQTT
capabilities named in the build plan's technical stack.

These sit alongside the core API. Nothing here is required for site scoring:
the deterministic engine remains the default everywhere.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.core.database import get_db
from app.engines import ml as ml_engine
from app.providers.recommendation import list_providers as list_reco_providers
from app.providers.recommendation import resolve as resolve_reco
from app.schemas import Envelope
from app.services import gis_service, mqtt_service, persistence_service, rag_service

router = APIRouter()


# -- machine learning ----------------------------------------------------

ml_router = APIRouter(prefix="/ml", tags=["Machine Learning"])


@ml_router.get("/providers", summary="Available site-scoring providers")
def providers() -> Envelope:
    return Envelope.of(list_reco_providers(), data_status=DataStatus.SOURCE, is_demo_data=False)


@ml_router.get("/model", summary="Model metrics and global SHAP importance")
def model_info(db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return ml_engine.site_model.importances(repo.all_sites(db))
    except ml_engine.MlUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@ml_router.get("/sites/{site_id}/explain", summary="SHAP explanation for one site")
def shap_explain(site_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    site = repo.site_by_id(db, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found.")
    try:
        prediction = ml_engine.site_model.predict(site, repo.all_sites(db))
    except ml_engine.MlUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    payload = prediction.as_dict()
    persistence_service.record_ai_output(
        db,
        entity_type="site",
        entity_id=site_id,
        recommendation_type="ml_shap_prediction",
        payload={"score": payload["score"], "recommendation": payload["recommendation"]},
        provider="ml",
    )
    return payload


@ml_router.get("/sites/ranked", summary="Rank sites with a chosen provider")
def ranked(
    db: Session = Depends(get_db),
    provider: str = Query(default="mcda", description="mcda or ml"),
    infrastructure_type: str = Query(default="Hospital"),
    limit: int = Query(default=10, ge=1, le=40),
) -> dict[str, Any]:
    chosen, notes = resolve_reco(db, provider)
    results = chosen.rank(repo.all_sites(db), infrastructure_type, limit=limit)
    return {
        "provider": chosen.key,
        "provider_label": chosen.label,
        "requested_provider": provider,
        "infrastructure_type": infrastructure_type,
        "results": results,
        "data_status": DataStatus.AI_GENERATED if chosen.key == "ml" else DataStatus.DERIVED,
        "notes": notes
        + [
            "The deterministic MCDA provider is the platform's default scorer; the ML provider "
            "demonstrates the model pathway on demonstration data.",
        ],
    }


# -- geospatial ----------------------------------------------------------

gis_router = APIRouter(prefix="/spatial", tags=["Geospatial"])


@gis_router.get("/summary", summary="Extent, centroid and spread of assessed sites")
def spatial_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    return gis_service.spatial_summary(db)


@gis_router.get("/neighbours", summary="Nearest candidate sites, in kilometres")
def neighbours(db: Session = Depends(get_db), limit: int = Query(default=3, ge=1, le=10)) -> dict[str, Any]:
    return gis_service.nearest_neighbours(db, limit)


@gis_router.get("/catchments", summary="Buffer analysis and catchment overlap")
def catchments(
    db: Session = Depends(get_db), radius_km: float = Query(default=5.0, gt=0, le=25)
) -> dict[str, Any]:
    return gis_service.catchment_analysis(db, radius_km)


@gis_router.get("/coverage-gaps", summary="Localities outside every site catchment")
def coverage_gaps(
    db: Session = Depends(get_db), radius_km: float = Query(default=5.0, gt=0, le=25)
) -> dict[str, Any]:
    return gis_service.coverage_gaps(db, radius_km)


# -- retrieval (RAG) -----------------------------------------------------

rag_router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


@rag_router.get("/search", summary="Semantic search over the platform knowledge base")
def knowledge_search(
    q: str = Query(min_length=2, max_length=500),
    top_k: int = Query(default=4, ge=1, le=10),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return rag_service.search_payload(db, q, top_k)


@rag_router.get("/stats", summary="Corpus size and embedding configuration")
def knowledge_stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    return rag_service.corpus_stats(db) | {"data_status": DataStatus.SOURCE}


@rag_router.post("/reindex", summary="Rebuild the corpus and its embeddings")
def reindex(db: Session = Depends(get_db)) -> dict[str, Any]:
    built = rag_service.build_corpus(db)
    db.commit()
    embedded = rag_service.embed_corpus(db)
    persistence_service.audit(db, action="knowledge.reindex", detail=str(built))
    return built | {"embeddings": embedded, "data_status": DataStatus.SOURCE}


# -- history / audit -----------------------------------------------------

history_router = APIRouter(prefix="/history", tags=["History & Audit"])


@history_router.get("/site-scores", summary="Persisted scoring runs")
def site_scores(
    db: Session = Depends(get_db),
    site_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> Envelope:
    return Envelope.of(
        persistence_service.recent_scores(db, site_id, limit),
        data_status=DataStatus.DERIVED,
        is_demo_data=True,
    )


@history_router.get("/ai-recommendations", summary="Persisted AI and engine outputs")
def ai_outputs(db: Session = Depends(get_db), limit: int = Query(default=50, ge=1, le=500)) -> Envelope:
    return Envelope.of(
        persistence_service.recent_ai_outputs(db, limit),
        data_status=DataStatus.AI_GENERATED,
        is_demo_data=True,
    )


@history_router.get("/audit-log", summary="Audit trail")
def audit_log(db: Session = Depends(get_db), limit: int = Query(default=100, ge=1, le=500)) -> Envelope:
    return Envelope.of(
        persistence_service.recent_audit(db, limit),
        data_status=DataStatus.SOURCE,
        is_demo_data=False,
    )


# -- MQTT ----------------------------------------------------------------

mqtt_router = APIRouter(prefix="/iot", tags=["IoT Monitoring"])


@mqtt_router.get("/mqtt-status", summary="MQTT subscriber status")
def mqtt_status() -> dict[str, Any]:
    return mqtt_service.ingestor.status()


for _sub in (ml_router, gis_router, rag_router, history_router, mqtt_router):
    router.include_router(_sub)
