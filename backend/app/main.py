"""NIRMAN AI FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.routers import router as api_v1_router
from app.core.config import settings
from app.core.constants import DISCLAIMER
from app.core.database import Base, SessionLocal, database_healthy, engine
from app.core.migrations import apply_post_create_migrations
from app.engines.weights import InvalidWeightsError
from app.schemas import HealthResponse
from app.seed import loader

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nirman")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the schema and load seed data if the database is empty."""
    healthy, error = database_healthy()
    if not healthy:
        log.error("Database unavailable at startup: %s", error)
    else:
        Base.metadata.create_all(bind=engine)
        # PostGIS geometry columns and pgvector indexes need the tables first.
        apply_post_create_migrations()
        if settings.auto_seed:
            with SessionLocal() as db:
                try:
                    counts = loader.seed_all(db)
                    log.info("Seed verification: %s", counts)
                except Exception as exc:
                    log.error("Seeding failed: %s", exc)
    yield


app = FastAPI(
    title="NIRMAN AI",
    version=settings.version,
    description=(
        "AI-powered public-infrastructure decision-support platform for the Chennai "
        "Metropolitan Area.\n\n"
        f"**{DISCLAIMER}**\n\n"
        "Responses carry a `data_status` of `demo`, `source`, `derived` or `ai_generated` so "
        "demonstration values are never mistaken for verified government measurements."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(InvalidWeightsError)
async def invalid_weights_handler(request: Request, exc: InvalidWeightsError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc), "error": "invalid_weights"})


@app.exception_handler(loader.SeedError)
async def seed_error_handler(request: Request, exc: loader.SeedError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc), "error": "seed_error"})


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health() -> HealthResponse:
    healthy, error = database_healthy()
    counts: dict[str, int] = {}
    seeded = False
    if healthy:
        try:
            with SessionLocal() as db:
                seeded = loader.is_seeded(db)
                counts = loader.counts(db)
        except Exception as exc:  # pragma: no cover - reported, not raised
            error = str(exc)
            healthy = False

    return HealthResponse(
        status="ok" if healthy else "degraded",
        version=settings.version,
        database="connected" if healthy else "unavailable",
        database_error=error,
        demo_mode=settings.demo_mode,
        ai_provider=settings.ai_provider,
        seeded=seeded,
        record_counts=counts,
    )


@app.get("/", tags=["System"])
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
        "api": "/api/v1",
        "disclaimer": DISCLAIMER,
    }


app.include_router(api_v1_router)
