"""NIRMAN AI FastAPI application."""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from starlette.exceptions import HTTPException as StarletteHTTPException

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

    # Optional MQTT ingestion. Never blocks startup and never raises.
    from app.services.mqtt_service import ingestor

    ingestor.start()
    yield
    ingestor.stop()


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


def _service_metadata() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
        "api": "/api/v1",
        "disclaimer": DISCLAIMER,
    }


@app.get("/api", tags=["System"])
def api_root() -> dict[str, str]:
    return _service_metadata()


# "/" only returns JSON when no frontend is bundled; otherwise the SPA owns it.
if not (settings.static_dir and settings.static_dir.is_dir()):

    @app.get("/", tags=["System"])
    def root() -> dict[str, str]:
        return _service_metadata()


app.include_router(api_v1_router)


# ---------------------------------------------------------------------------
# Unversioned path compatibility.
#
# The build plan documents endpoints as /api/sites, /api/risk, /api/copilot/query
# and so on. The implementation is versioned under /api/v1 so the contract can
# evolve without breaking callers; these redirects keep the documented paths
# working against the one implementation rather than duplicating it.
# ---------------------------------------------------------------------------
@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST"],
    include_in_schema=False,
    tags=["System"],
)
def unversioned_alias(path: str, request: Request) -> RedirectResponse:
    if not path or path.split("/", 1)[0] == "v1":
        raise StarletteHTTPException(status_code=404, detail=f"Unknown API path: /api/{path}")
    target = f"/api/v1/{path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    # 307 preserves the method and body, so POST /api/copilot/query still works.
    return RedirectResponse(target, status_code=307)


# ---------------------------------------------------------------------------
# Single-origin deployment.
#
# When a built frontend is present (docker/allinone.Dockerfile copies it to
# STATIC_DIR), the same service serves the React app and the API. That gives
# one shareable URL, removes CORS from the deployment entirely, and keeps the
# frontend's default empty VITE_API_BASE_URL correct in production.
#
# Mounted last so every API route and /health still wins over the SPA.
# ---------------------------------------------------------------------------
if settings.static_dir and settings.static_dir.is_dir():
    from fastapi.staticfiles import StaticFiles
    from starlette.exceptions import HTTPException as StarletteHTTPException

    # Paths that belong to the service, never to the SPA router. An unknown
    # path under these must 404 as itself rather than returning index.html,
    # so a mistyped endpoint is reported as missing instead of silently
    # answering with HTML.
    SERVICE_PREFIXES = ("api", "health", "docs", "redoc", "openapi.json")

    class SpaStaticFiles(StaticFiles):
        """Serve index.html for client-side routes instead of 404."""

        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code != 404:
                    raise
                # StaticFiles normalises the path with os.path.normpath, which
                # yields backslashes on Windows — split on either separator so
                # this behaves identically on the dev machine and in the
                # Linux container.
                head = re.split(r"[\\/]", path, maxsplit=1)[0].lower()
                if head in SERVICE_PREFIXES:
                    raise
                return await super().get_response("index.html", scope)

    app.mount("/", SpaStaticFiles(directory=str(settings.static_dir), html=True), name="frontend")
    log.info("Serving bundled frontend from %s", settings.static_dir)
else:
    log.info("No bundled frontend found; running as an API-only service.")
